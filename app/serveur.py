"""PK Voice Cloner — interface locale de clonage de voix (VoxCPM2, MPS).

Endpoints :
  GET  /                page HTML
  POST /api/voix        upload audio (m4a/mp3/wav/webm) -> conversion + transcription
  POST /api/generer     {texte, vitesse, transcript} -> job id
  POST /api/arreter     arrêt gracieux du serveur et libération du modèle
  GET  /api/job/{id}    état du job
  GET  /api/audio/{f}   fichier wav généré
  GET  /api/etat        modèle chargé ? voix définie ?

Tous les chemins dérivent de l'emplacement de ce fichier : le projet
peut vivre n'importe où sur le disque.
"""
import hashlib
import os
import subprocess
import threading
import time
import uuid
from pathlib import Path

import soundfile as sf
import uvicorn
from fastapi import Body, FastAPI, File, HTTPException, UploadFile
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles

APP = Path(__file__).resolve().parent
PROJET = APP.parent
SORTIES = PROJET / "data" / "sorties"
VOIX = PROJET / "data" / "voix"
PID_FILE = PROJET / "data" / "run" / "serveur.pid"
for _d in (SORTIES, VOIX, PID_FILE.parent):
    _d.mkdir(parents=True, exist_ok=True)

VITESSE_MIN, VITESSE_MAX = 0.75, 1.5

app = FastAPI(title="PK Voice Cloner")
app.mount("/assets", StaticFiles(directory=APP / "assets"), name="assets")
modele = None                    # VoxCPM chargé en arrière-plan
verrou_gen = threading.Lock()    # une génération à la fois
transcripts = {}                 # hash audio -> transcript ASR
voix_courante = {}               # {"wav": Path, "transcript": str, "source": str}
jobs = {}                        # id -> {etat, fichier?, erreur?, debut}
serveur_http: uvicorn.Server | None = None


def charger_modele():
    global modele
    print(">> chargement du modèle VoxCPM2 (~1 min)...", flush=True)
    from voxcpm import VoxCPM
    modele = VoxCPM.from_pretrained("openbmb/VoxCPM2", load_denoiser=False, device="mps")
    print(">> modèle prêt.", flush=True)


threading.Thread(target=charger_modele, daemon=True).start()


def convertir_wav(src: Path, dst: Path):
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-i", str(src), "-ar", "16000", "-ac", "1", str(dst)],
        check=True,
    )


def transcrire(wav: Path) -> str:
    r = subprocess.run(
        [str(PROJET / ".venv-whisper" / "bin" / "python"), str(APP / "transcrire.py"), str(wav)],
        capture_output=True, text=True, timeout=600,
        env={**os.environ, "HF_HUB_OFFLINE": "1", "TRANSFORMERS_OFFLINE": "1"},
    )
    if r.returncode != 0:
        raise RuntimeError("transcription échouée : " + r.stderr[-400:])
    return r.stdout.strip()


def duree_audio(f: Path) -> float:
    r = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(f)],
        capture_output=True, text=True,
    )
    try:
        return round(float(r.stdout.strip()), 1)
    except ValueError:
        return 0.0


@app.get("/")
def index():
    return HTMLResponse((APP / "page.html").read_text(encoding="utf-8"))


@app.get("/api/etat")
def etat():
    return {"modele": modele is not None, "voix": bool(voix_courante)}

def programmer_arret():
    """Laisse la réponse HTTP partir avant d'arrêter Uvicorn."""
    time.sleep(0.25)
    if serveur_http is not None:
        serveur_http.should_exit = True


@app.post("/api/arreter", status_code=202)
def arreter_studio():
    if serveur_http is None:
        raise HTTPException(503, "serveur en cours d'initialisation")
    threading.Thread(target=programmer_arret, daemon=True).start()
    return {"etat": "arret_en_cours"}


@app.post("/api/voix")
def definir_voix(audio: UploadFile = File(...)):
    brut = audio.file.read()
    if not brut:
        raise HTTPException(400, "fichier audio vide")
    h = hashlib.md5(brut).hexdigest()[:12]
    nom = audio.filename or "enregistrement.webm"
    src = VOIX / f"source_{h}{Path(nom).suffix or '.webm'}"
    src.write_bytes(brut)
    wav = VOIX / f"ref_{h}.wav"
    txt = VOIX / f"ref_{h}.txt"
    convertir_wav(src, wav)
    if txt.exists():                      # transcript persistant : pas de 2e ASR
        transcripts[h] = txt.read_text(encoding="utf-8").strip()
    elif h not in transcripts:
        transcripts[h] = transcrire(wav)
        txt.write_text(transcripts[h], encoding="utf-8")
    voix_courante.clear()
    voix_courante.update({"wav": wav, "transcript": transcripts[h], "source": nom})
    return {"transcript": transcripts[h], "duree": duree_audio(wav), "source": nom}


@app.post("/api/generer")
def lancer_generation(req: dict = Body(...)):
    texte = (req.get("texte") or "").strip()
    if not texte:
        raise HTTPException(400, "texte vide")
    try:
        vitesse = float(req.get("vitesse") or 1.0)
    except (TypeError, ValueError):
        raise HTTPException(400, "vitesse invalide")
    if not (VITESSE_MIN <= vitesse <= VITESSE_MAX):
        raise HTTPException(400, f"vitesse entre {VITESSE_MIN} et {VITESSE_MAX}")
    if not voix_courante:
        raise HTTPException(400, "aucune voix définie : choisis ou enregistre un audio d'abord")
    job = uuid.uuid4().hex[:10]
    jobs[job] = {"etat": "attente", "debut": time.time()}
    threading.Thread(
        target=executer_generation,
        args=(job, texte, vitesse, (req.get("transcript") or "").strip()),
        daemon=True,
    ).start()
    return {"job": job}


def executer_generation(job, texte, vitesse, transcript):
    try:
        with verrou_gen:
            jobs[job]["etat"] = "chargement"
            while modele is None:
                time.sleep(0.5)
            jobs[job]["etat"] = "generation"
            ref = str(voix_courante["wav"])
            kwargs = dict(
                text=texte,
                reference_wav_path=ref,
                cfg_value=2.0,
                inference_timesteps=10,
            )
            if transcript:
                kwargs.update(prompt_wav_path=ref, prompt_text=transcript)
            wav = modele.generate(**kwargs)
            brute = SORTIES / f"{job}_brute.wav"
            sf.write(brute, wav, modele.tts_model.sample_rate)
            final = SORTIES / f"{job}.wav"
            if abs(vitesse - 1.0) > 0.01:
                subprocess.run(
                    ["ffmpeg", "-y", "-loglevel", "error", "-i", str(brute),
                     "-filter:a", f"atempo={vitesse}", str(final)],
                    check=True,
                )
                brute.unlink()
            else:
                brute.rename(final)
            jobs[job] = {"etat": "pret", "fichier": final.name, "duree": duree_audio(final), "debut": jobs[job]["debut"]}
    except Exception as e:  # noqa: BLE001 — remonte au client via /api/job
        jobs[job] = {"etat": "erreur", "erreur": str(e)[:500], "debut": jobs.get(job, {}).get("debut", time.time())}


@app.get("/api/job/{job_id}")
def etat_job(job_id: str):
    j = jobs.get(job_id)
    if not j:
        raise HTTPException(404, "job inconnu")
    out = dict(j)
    out["ecoule"] = round(time.time() - out.pop("debut", time.time()))
    return out


@app.get("/api/audio/{fichier}")
def audio(fichier: str):
    f = SORTIES / Path(fichier).name
    if not f.exists():
        raise HTTPException(404, "fichier introuvable")
    return FileResponse(f, media_type="audio/wav", filename=f.name)


def lancer_serveur():
    global serveur_http
    PID_FILE.write_text(f"{os.getpid()}\n", encoding="utf-8")
    serveur_http = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=8809))
    try:
        serveur_http.run()
    finally:
        if PID_FILE.exists() and PID_FILE.read_text(encoding="utf-8").strip() == str(os.getpid()):
            PID_FILE.unlink()


if __name__ == "__main__":
    lancer_serveur()
