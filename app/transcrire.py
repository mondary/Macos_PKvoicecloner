import sys

from faster_whisper import WhisperModel

m = WhisperModel("large-v3", device="cpu", compute_type="int8")
segments, _ = m.transcribe(sys.argv[1], vad_filter=True)
print(" ".join(s.text.strip() for s in segments))
