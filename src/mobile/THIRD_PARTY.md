# Third-party components

The PK Reader implementation is part of the existing Apache-2.0 PK Voice Studio project. Dependencies and downloaded voices retain their own licenses.

| Component | License / source |
|---|---|
| Capacitor | MIT — https://github.com/ionic-team/capacitor |
| sherpa-onnx 1.13.8 | Apache-2.0 — https://github.com/k2-fsa/sherpa-onnx/tree/v1.13.8 |
| ONNX Runtime (inside sherpa-onnx AAR) | MIT — https://github.com/microsoft/onnxruntime |
| eSpeak NG (voice phonemizer) | GPL-3.0 — https://github.com/espeak-ng/espeak-ng |
| Apache Commons Compress / IO / Lang | Apache-2.0 — https://commons.apache.org/ |
| fflate | MIT — https://github.com/101arrowz/fflate |
| PDF.js | Apache-2.0 — https://github.com/mozilla/pdf.js |
| Lucide | ISC — https://lucide.dev/license |
| DM Sans, Literata | SIL Open Font License 1.1 — bundled by Fontsource |

Voice model cards (the app downloads model weights directly from upstream; it does not bundle them in the APK):

- Siwis: https://huggingface.co/rhasspy/piper-voices/blob/main/fr/fr_FR/siwis/medium/MODEL_CARD
- Tom: https://huggingface.co/rhasspy/piper-voices/blob/main/fr/fr_FR/tom/medium/MODEL_CARD
- Lessac: https://huggingface.co/rhasspy/piper-voices/blob/main/en/en_US/lessac/medium/MODEL_CARD

This debug APK is for development and evaluation. A public distribution must include all applicable license texts and comply with the copyleft requirements of the linked phonemizer; the existing Apache-2.0 label does not relicense those dependencies.

## Kokoro

- **Kokoro-82M v1.0 (int8)** (hexgrad), archive sherpa-onnx `kokoro-int8-multi-lang-v1_0`, licence Apache-2.0.
