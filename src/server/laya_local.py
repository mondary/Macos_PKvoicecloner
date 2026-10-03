"""Contrôle local des attributions avec Laya — décision typée, zéro LLM.

Laya est un petit encodeur (322M) qui répond à des questions fermées sur un
texte en une passe : on l'utilise pour relire gratuitement le travail du LLM
d'analyse et signaler les segments « narrateur » qui ressemblent à du dialogue.

Le modèle multilingue est chargé UNE fois en tâche de fond, depuis le cache
Hugging Face partagé (convention `modeles-partages`), et les prédictions sont
sérialisées par un verrou : un encodeur ne sert qu'une passe à la fois.
"""
from __future__ import annotations

import importlib.util
import threading

# Au-dessus : on signale « dialogue probable » ; en dessous : silence.
# Le multilingue est non calibré et tranche volontiers vers 0/1 : ce seuil
# bas est volontaire, le contrôle sert d'aide à la relecture, pas d'action.
SEUIL_DIALOGUE = 0.6

QUESTION_DIALOGUE = {
    "dialogue": {
        "type": "noul",
        "instructions": (
            "Est-ce que cette phrase contient des paroles prononcées à voix haute "
            "par un personnage (dialogue, réplique entre guillemets ou après un tiret) ?"
        ),
    },
}

_verrou_etat = threading.Lock()
_etat: dict = {"pret": False, "chargement": False, "erreur": None}
_agent = None
_verrou_predict = threading.Lock()


def etat() -> dict:
    """Disponibilité de Laya : paquet installé, chargement en cours, prêt, erreur."""
    installe = importlib.util.find_spec("laya") is not None
    with _verrou_etat:
        return {"installe": installe, **_etat}


def charger_en_fond() -> dict:
    """Lance le chargement du modèle (téléchargement au premier lancement)."""
    with _verrou_etat:
        if _etat["pret"] or _etat["chargement"]:
            return {"installe": True, **_etat}
        if importlib.util.find_spec("laya") is None:
            _etat["erreur"] = "Laya n'est pas installé : .venv/bin/python -m pip install laya"
            return {"installe": False, **_etat}
        _etat.update(chargement=True, erreur=None)
    threading.Thread(target=_charger, daemon=True).start()
    return {"installe": True, **_etat}


def _charger() -> None:
    global _agent
    try:
        import laya

        agent = laya.load("convaiinnovations/laya", subfolder="multilingual")
        # Réveil : la première passe compile les noyaux (plusieurs secondes).
        agent.predict(
            "Le vent soufflait sur la falaise.",
            QUESTION_DIALOGUE,
        )
        _agent = agent
        with _verrou_etat:
            _etat.update(pret=True, chargement=False, erreur=None)
    except Exception as e:  # noqa: BLE001 — l'erreur remonte au client via /api/laya/etat
        with _verrou_etat:
            _etat.update(chargement=False, erreur=str(e)[:300])


def pret() -> bool:
    with _verrou_etat:
        return _etat["pret"] and _agent is not None


def verifier_segments(segments: list[tuple[str, str]], agent=None,
                      seuil: float = SEUIL_DIALOGUE) -> list[dict]:
    """Vérifie les segments [(tag, phrase)] ; seuls les « narrateur » sont interrogés.

    Renvoie une entrée par segment : {"num", "verifie", "dialogue", "probabilite"} —
    `dialogue` vaut True quand un dialogue est probable pour un segment narrateur
    (suspect), False sinon ; les segments personnages ne sont pas interrogés.
    """
    agent = agent or _agent
    if agent is None:
        raise RuntimeError("Laya n'est pas encore chargé")
    resultats: list[dict] = []
    with _verrou_predict:
        for num, (tag, phrase) in enumerate(segments, 1):
            if tag != "narrateur":
                resultats.append({"num": num, "verifie": False})
                continue
            reponse = agent.predict(phrase, QUESTION_DIALOGUE)
            probabilite = float(reponse["answers"]["dialogue"]["noul"])
            resultats.append({
                "num": num,
                "verifie": True,
                "dialogue": probabilite >= seuil,
                "probabilite": round(probabilite, 3),
            })
    return resultats
