"""Mesure VoxCPM2 sur cette machine — chargement, cache de voix, synthèse, streaming.

Sert à décider en connaissance de cause (voir TODO.md, jalon 2) : où passe le
temps, ce que rapporte le cache de voix, ce que change la synthèse phrase par
phrase, et ce qu'on entend en premier en streaming.

Usage :
    .venv/bin/python scripts/bench-voxcpm.py [--reference data/voix/ref_XXXX.wav]
                                             [--phrases 3] [--sans-cache]

Chaque mesure s'affiche en secondes ; le RTF est le rapport synthèse / durée
d'audio (1,0 = temps réel, 15 = quinze fois plus lent que l'écoute).
"""
from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

PROJET = Path(__file__).resolve().parent.parent
PHRASES = [
    "Les livres nous accompagnent au fil des jours.",
    "Dans le train, une phrase suffit à rouvrir tout un monde.",
    "Et le soir, la voix continue pendant que les yeux se reposent.",
    "Chaque personnage garde sa voix, du premier chapitre au dernier.",
    "C'est là toute la promesse de ce studio.",
]


def chrono(label: str, debut: float, duree_audio: float | None = None) -> float:
    ecoule = time.monotonic() - debut
    detail = f" · RTF {ecoule / duree_audio:.1f}" if duree_audio else ""
    print(f"  {label:<38} {ecoule:6.1f} s{detail}", flush=True)
    return ecoule


def main() -> int:
    parseur = argparse.ArgumentParser()
    parseur.add_argument("--reference", default="data/voix/ref_a21fb06d763b.wav")
    parseur.add_argument("--phrases", type=int, default=3)
    parseur.add_argument("--sans-cache", action="store_true", help="chemin actuel du studio : pas de cache de voix réutilisé")
    args = parseur.parse_args()

    reference = PROJET / args.reference
    transcript = reference.with_suffix(".txt")
    if not reference.exists():
        print(f"référence introuvable : {reference}", file=sys.stderr)
        return 1

    import numpy as np
    import soundfile as sf
    from voxcpm import VoxCPM

    print("== chargement du modèle ==", flush=True)
    debut = time.monotonic()
    modele = VoxCPM.from_pretrained("openbmb/VoxCPM2", load_denoiser=False, device="mps")
    chrono("chargement + préchauffage", debut)

    phrases = PHRASES[: args.phrases]
    total_audio = 0.0

    if args.sans_cache:
        print("== chemin actuel : generate() par phrase, référence réencodée ==", flush=True)
        for phrase in phrases:
            debut = time.monotonic()
            wav = modele.generate(text=phrase, reference_wav_path=str(reference),
                                  cfg_value=2.0, inference_timesteps=10)
            duree = len(wav) / modele.tts_model.sample_rate
            total_audio += duree
            chrono(f"« {phrase[:34]}… » ({duree:.1f} s d'audio)", debut, duree)
        print(f"  total {total_audio:.1f} s d'audio")
        return 0

    print("== cache de voix construit une fois ==", flush=True)
    debut = time.monotonic()
    cache = modele.tts_model.build_prompt_cache(
        reference_wav_path=str(reference),
        prompt_wav_path=str(reference) if transcript.exists() else None,
        prompt_text=transcript.read_text(encoding="utf-8").strip() if transcript.exists() else None,
    )
    chrono("build_prompt_cache", debut)

    print("== synthèse phrase par phrase, cache réutilisé ==", flush=True)
    sorties = PROJET / "data" / "sorties"
    sorties.mkdir(parents=True, exist_ok=True)
    for i, phrase in enumerate(phrases):
        debut = time.monotonic()
        premier = None
        morceaux = []
        for wav, _, _ in modele.tts_model._generate_with_prompt_cache(
                target_text=phrase, prompt_cache=cache, cfg_value=2.0,
                inference_timesteps=10, streaming=True):
            if premier is None:
                premier = time.monotonic() - debut
            morceaux.append(wav.squeeze(0).cpu().numpy())
        audio = np.concatenate(morceaux) if morceaux else np.zeros(1, dtype=np.float32)
        duree = len(audio) / modele.tts_model.sample_rate
        total_audio += duree
        chrono(f"« {phrase[:34]}… » ({duree:.1f} s d'audio)", debut, duree)
        if premier is not None:
            print(f"  {'1er morceau audible':<38} {premier:6.1f} s", flush=True)
        sf.write(sorties / f"bench_{i}.wav", audio, modele.tts_model.sample_rate, subtype="PCM_16")
    print(f"  total {total_audio:.1f} s d'audio · fichiers dans {sorties}/bench_*.wav")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
