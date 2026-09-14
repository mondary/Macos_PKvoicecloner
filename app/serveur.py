"""PK Voice Cloner — interface locale de clonage de voix (VoxCPM2, MPS).

Endpoints :
  GET  /                page HTML
  POST /api/voix        upload audio (m4a/mp3/wav/webm) -> conversion + transcription
  GET  /api/voix        bibliothèque de voix clonées (data/voix)
  POST /api/voix/{id}/choisir  active une voix de la bibliothèque
  GET  /api/voix/{id}/wav      écoute du clip de référence
  DELETE /api/voix/{id} supprime une voix de la bibliothèque
  POST /api/generer     {texte, vitesse, transcript} -> job id
  POST /api/moteur      {moteur: voxcpm2|dots} changement de moteur TTS
  POST /api/arreter     arrêt gracieux du serveur et libération du modèle
  GET  /api/job/{id}    état du job
  GET  /api/audio/{f}   fichier wav généré
  GET  /api/etat        modèle chargé ? voix définie ?

Tous les chemins dérivent de l'emplacement de ce fichier : le projet
peut vivre n'importe où sur le disque.
"""
import gc
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
modele = None                    # moteur TTS chargé en arrière-plan
moteur_actif = "voxcpm2"         # "voxcpm2" | "dots" (demandé)
moteur_pret = None               # moteur réellement présent dans `modele`
MOTEUR_LABELS = {"voxcpm2": "VoxCPM2", "dots": "dots.tts"}
verrou_gen = threading.Lock()    # une génération à la fois
transcripts = {}                 # hash audio -> transcript ASR
voix_courante = {}               # {"id", "wav", "transcript", "source"}
jobs = {}                        # id -> {etat, fichier?, erreur?, debut}
serveur_http: uvicorn.Server | None = None


def _shims_dots():
    """Import de dots_tts sur macOS : la normalisation pynini (WeTextProcessing)
    ne compile pas et le paquet exige des minors torch/torchaudio alignés alors
    que torchaudio plafonne plus bas — deux shims sans effet sur la génération."""
    import importlib.metadata as md
    import sys
    import types

    if "dots_tts" in sys.modules:
        return
    tn = types.ModuleType("tn")
    zh = types.ModuleType("tn.chinese")
    zhn = types.ModuleType("tn.chinese.normalizer")
    en = types.ModuleType("tn.english")
    enn = types.ModuleType("tn.english.normalizer")

    class _Normalisateur:  # stub : jamais appelé (normalize_text=False par défaut)
        def __init__(self, *args, **kwargs): pass
        def normalize(self, texte): return texte

    zhn.Normalizer = _Normalisateur
    enn.Normalizer = _Normalisateur
    tn.chinese, zh.normalizer = zh, zhn
    tn.english, en.normalizer = en, enn
    sys.modules.update({"tn": tn, "tn.chinese": zh, "tn.chinese.normalizer": zhn,
                        "tn.english": en, "tn.english.normalizer": enn})
    vraie_version = md.version
    md.version = lambda nom: "2.14.0" if nom == "torchaudio" else vraie_version(nom)
    import dots_tts  # noqa: F401
    md.version = vraie_version


def charger_voxcpm():
    from voxcpm import VoxCPM
    return VoxCPM.from_pretrained("openbmb/VoxCPM2", load_denoiser=False, device="mps")


def charger_dots():
    _shims_dots()
    import torch
    from dots_tts.runtime import DotsTtsRuntime

    runtime = DotsTtsRuntime.from_pretrained("dots-studio/dots.tts-mf-2steps", precision="float32")
    # le runtime ne connaît que cuda/cpu ; sur Apple Silicon MPS est ~2× plus rapide (bench local : 53 s vs 108 s)
    runtime.device = torch.device("mps")
    runtime.model = runtime.model.to(runtime.device)
    return runtime


CHARGEURS = {"voxcpm2": charger_voxcpm, "dots": charger_dots}
verrou_chargement = threading.Lock()


def charger_modele(moteur: str):
    global moteur_actif, moteur_pret, modele
    moteur_actif = moteur
    print(f">> chargement du moteur {MOTEUR_LABELS[moteur]} (~1-2 min)...", flush=True)
    with verrou_chargement:   # un chargement à la fois, même en cas de double-clic
        try:
            instance = CHARGEURS[moteur]()
        except Exception as e:  # noqa: BLE001 — le studio reste utilisable via l'autre moteur
            print(f">> ÉCHEC chargement {moteur} : {e}", flush=True)
            return
    if moteur != moteur_actif:  # une bascule plus récente est passée entre-temps
        del instance
        gc.collect()
        return
    modele = instance
    moteur_pret = moteur
    print(">> moteur prêt.", flush=True)


def decharger_modele():
    global modele, moteur_pret
    modele = None
    moteur_pret = None
    gc.collect()
    try:
        import torch
        if torch.backends.mps.is_available():
            torch.mps.empty_cache()
    except Exception:  # noqa: BLE001 — meilleur effort de libération mémoire
        pass


threading.Thread(target=charger_modele, args=("voxcpm2",), daemon=True).start()


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


def info_voix(vid: str, wav: Path | None = None) -> dict:
    wav = wav or VOIX / f"ref_{vid}.wav"
    txt = VOIX / f"ref_{vid}.txt"
    source = next(VOIX.glob(f"source_{vid}.*"), None)
    surnom = VOIX / f"nom_{vid}.txt"
    if surnom.exists():
        nom = surnom.read_text(encoding="utf-8").strip()[:60] or (source.name if source else f"voix {vid}")
    else:
        nom = source.name if source else f"voix {vid}"
    return {
        "id": vid,
        "nom": nom,
        "duree": duree_audio(wav),
        "transcript": txt.read_text(encoding="utf-8").strip() if txt.exists() else "",
    }


@app.get("/")
def index():
    return HTMLResponse((APP / "page.html").read_text(encoding="utf-8"))


@app.get("/api/etat")
def etat():
    return {
        "modele": modele is not None,
        "voix": bool(voix_courante),
        "moteur": moteur_actif,
        "moteurs": list(CHARGEURS),
    }


@app.post("/api/moteur", status_code=202)
def changer_moteur(req: dict = Body(...)):
    moteur = req.get("moteur")
    if moteur not in CHARGEURS:
        raise HTTPException(400, "moteur inconnu")
    if moteur == moteur_actif and modele is not None:
        return {"ok": True, "moteur": moteur}
    if any(j.get("etat") in ("attente", "chargement", "generation") for j in jobs.values()):
        raise HTTPException(409, "une génération est en cours : réessaie après")
    decharger_modele()
    threading.Thread(target=charger_modele, args=(moteur,), daemon=True).start()
    return {"ok": True, "moteur": moteur}

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


@app.get("/api/voix")
def liste_voix():
    """Bibliothèque persistée dans data/voix, la plus récente d'abord."""
    refs = sorted(VOIX.glob("ref_*.wav"), key=lambda f: f.stat().st_mtime, reverse=True)
    return {"voix": [info_voix(w.stem[4:], w) for w in refs]}


@app.post("/api/voix/{vid}/choisir")
def choisir_voix(vid: str):
    wav = VOIX / f"ref_{vid}.wav"
    if not wav.exists():
        raise HTTPException(404, "voix inconnue")
    infos = info_voix(vid, wav)
    voix_courante.clear()
    voix_courante.update({"id": vid, "wav": wav, "transcript": infos["transcript"], "source": infos["nom"]})
    return {"ok": True, **infos}


@app.get("/api/voix/{vid}/wav")
def voix_wav(vid: str):
    f = VOIX / f"ref_{vid}.wav"
    if not f.exists():
        raise HTTPException(404, "voix inconnue")
    return FileResponse(f, media_type="audio/wav")


@app.post("/api/voix/{vid}/renommer")
def renommer_voix(vid: str, req: dict = Body(...)):
    nom = (req.get("nom") or "").strip()[:60]
    if not nom:
        raise HTTPException(400, "nom vide")
    if not (VOIX / f"ref_{vid}.wav").exists():
        raise HTTPException(404, "voix inconnue")
    (VOIX / f"nom_{vid}.txt").write_text(nom, encoding="utf-8")
    return {"ok": True, "nom": nom}


@app.delete("/api/voix/{vid}")
def supprimer_voix(vid: str):
    fichiers = list(VOIX.glob(f"*_{vid}.*"))
    if not fichiers:
        raise HTTPException(404, "voix inconnue")
    if voix_courante.get("id") == vid:
        voix_courante.clear()
    for f in fichiers:
        f.unlink()
    return {"ok": True}


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
    voix_courante.update({"id": h, "wav": wav, "transcript": transcripts[h], "source": nom})
    return {"id": h, "transcript": transcripts[h], "duree": duree_audio(wav), "source": nom}


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
            while modele is None or moteur_pret != moteur_actif:
                time.sleep(0.5)
            jobs[job]["etat"] = "generation"
            ref = str(voix_courante["wav"])
            if moteur_pret == "dots":
                resultat = modele.generate(
                    text=texte,
                    prompt_audio_path=ref,
                    prompt_text=(transcript or None),
                )
                wav = resultat["audio"].float().cpu().squeeze().numpy()
                sample_rate = resultat["sample_rate"]
            else:
                kwargs = dict(
                    text=texte,
                    reference_wav_path=ref,
                    cfg_value=2.0,
                    inference_timesteps=10,
                )
                if transcript:
                    kwargs.update(prompt_wav_path=ref, prompt_text=transcript)
                wav = modele.generate(**kwargs)
                sample_rate = modele.tts_model.sample_rate
            brute = SORTIES / f"{job}_brute.wav"
            sf.write(brute, wav, sample_rate)
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
