"""Client LLM OpenAI-compatible — endpoint + clé configurables (stdlib, zéro pip).

Compatible avec tout service exposant POST {base_url}/chat/completions :
OpenAI (https://api.openai.com/v1), GLM (https://open.bigmodel.cn/api/paas/v4),
DeepSeek (https://api.deepseek.com/v1), Ollama local (http://127.0.0.1:11434/v1)…
La configuration vit dans data/ia.json — jamais versionnée.
"""
from __future__ import annotations

import json
import re
import urllib.error
import urllib.request


class IaErreur(Exception):
    """Erreur remontée telle quelle au studio (config, réseau, API…)."""


def valider_config(base_url: str, cle: str, modele: str) -> dict:
    """Normalise et vérifie la configuration ; lève IaErreur si incomplète."""
    base_url = (base_url or "").strip().rstrip("/")
    cle = (cle or "").strip()
    modele = (modele or "").strip()
    if not base_url.startswith(("http://", "https://")):
        raise IaErreur("endpoint invalide : il doit commencer par http:// ou https://")
    if not modele:
        raise IaErreur("nom de modèle requis (ex. glm-4.7, deepseek-chat, gpt-4o-mini…)")
    if not cle:
        raise IaErreur("clé API requise")
    return {"base_url": base_url, "cle": cle, "modele": modele}


def completer(cfg: dict, messages: list[dict], *, temperature: float = 0.1,
              json_mode: bool = False, timeout: int = 300) -> str:
    """Un appel chat/completions ; renvoie le texte de la réponse."""
    url = f"{cfg['base_url'].rstrip('/')}/chat/completions"
    payload: dict = {"model": cfg["modele"], "messages": messages, "temperature": temperature}
    if json_mode:
        payload["response_format"] = {"type": "json_object"}
    requete = urllib.request.Request(
        url, data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {cfg['cle']}"},
    )
    try:
        with urllib.request.urlopen(requete, timeout=timeout) as reponse:
            corps = json.loads(reponse.read().decode("utf-8", "replace"))
    except urllib.error.HTTPError as erreur:
        detail = erreur.read().decode("utf-8", "replace")[:300]
        raise IaErreur(f"l'API a répondu HTTP {erreur.code} : {detail}") from erreur
    except (urllib.error.URLError, TimeoutError, OSError) as erreur:
        raise IaErreur(f"API IA injoignable : {erreur}") from erreur
    except ValueError as erreur:
        raise IaErreur(f"réponse de l'API illisible : {erreur}") from erreur
    try:
        return corps["choices"][0]["message"]["content"] or ""
    except (KeyError, IndexError, TypeError) as erreur:
        raise IaErreur(f"réponse de l'API inattendue : {str(corps)[:200]}") from erreur


def extraire_json(texte: str) -> dict:
    """Extrait l'objet JSON d'une réponse LLM (tolère les clôtures ```…```)."""
    texte = re.sub(r"^```(?:json)?\s*|\s*```$", "", texte.strip(), flags=re.MULTILINE)
    debut, fin = texte.find("{"), texte.rfind("}")
    if debut < 0 or fin <= debut:
        raise IaErreur(f"l'IA n'a pas renvoyé de JSON : {texte[:150]}")
    try:
        return json.loads(texte[debut:fin + 1])
    except ValueError as erreur:
        raise IaErreur(f"JSON invalide de l'IA : {texte[:150]}") from erreur
