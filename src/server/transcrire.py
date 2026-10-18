"""Transcription d'un WAV dans son propre environnement (.venv-whisper).

Usages :
  transcrire.py <wav> <moteur>        transcrit l'audio et imprime le texte
  transcrire.py --verifier <moteur>   charge réellement le modèle puis sort :
                                      « Activer » veut dire prêt, pas seulement coché
"""
import sys

arguments = [a for a in sys.argv[1:] if not a.startswith("--")]
verification = "--verifier" in sys.argv

if verification:
    moteur = arguments[0] if arguments else "whisper"
    audio = ""
else:
    audio = arguments[0] if arguments else ""
    moteur = arguments[1] if len(arguments) > 1 else "whisper"

if moteur == "parakeet-redux":
    import moondream as md

    with md.photon("moondream/parakeet-redux", device="cpu") as speech:
        if verification:
            print("pret")
        else:
            print(speech.transcribe(audio=audio)["text"].strip())
elif moteur == "whisper":
    from faster_whisper import WhisperModel

    modele = WhisperModel("large-v3", device="cpu", compute_type="int8")
    if verification:
        print("pret")
    else:
        segments, _ = modele.transcribe(audio, vad_filter=True)
        print(" ".join(s.text.strip() for s in segments))
else:
    raise SystemExit(f"moteur ASR inconnu : {moteur}")
