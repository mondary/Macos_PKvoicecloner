import sys

engine = sys.argv[2] if len(sys.argv) > 2 else "whisper"

if engine == "parakeet-redux":
    import moondream as md

    with md.photon("moondream/parakeet-redux", device="cpu") as speech:
        result = speech.transcribe(audio=sys.argv[1])
    print(result["text"].strip())
elif engine == "whisper":
    from faster_whisper import WhisperModel

    m = WhisperModel("large-v3", device="cpu", compute_type="int8")
    segments, _ = m.transcribe(sys.argv[1], vad_filter=True)
    print(" ".join(s.text.strip() for s in segments))
else:
    raise SystemExit(f"moteur ASR inconnu : {engine}")
