"""Normalisation française du texte avant synthèse vocale.

Les moteurs TTS buttent sur les notations imprimées : « M. » lu lettre par
lettre, « Louis XVI » épelé ou lu « louis 16 », « 1789 » lu chiffre par
chiffre, « 1er » lu « un er »… Ce module réécrit ces notations en mots
français corrects (« Monsieur », « Louis seize », « mille sept cent
quatre-vingt-neuf », « premier »).

Il est appliqué au moment de générer, pour tous les moteurs : le texte
affiché dans le studio reste la référence de l'utilisateur, seul l'audio
reçoit la forme développée.
"""
from __future__ import annotations

import re

# ------------------------------------------------------------------ nombres

_UNITES = ("zéro un deux trois quatre cinq six sept huit neuf dix onze douze "
           "treize quatorze quinze seize dix-sept dix-huit dix-neuf").split()
_DIZAINES = {2: "vingt", 3: "trente", 4: "quarante", 5: "cinquante",
             6: "soixante", 8: "quatre-vingt"}


def _moins_cent(n: int) -> str:
    if n < 20:
        return _UNITES[n]
    dizaine, unite = divmod(n, 10)
    if dizaine in (7, 9):                     # soixante-dix… / quatre-vingt-dix…
        return _dix_neuf(n)
    base = _DIZAINES[dizaine]
    if dizaine == 8 and unite == 0:
        return base + "s"                     # quatre-vingts
    if unite == 0:
        return base
    if unite == 1 and dizaine != 8:
        return f"{base}-et-un"                # vingt et un, soixante et un
    return f"{base}-{_UNITES[unite]}"


def _dix_neuf(n: int) -> str:
    """70–79 et 90–99 : base 60/80 + 10..19."""
    if 70 <= n <= 79:
        if n == 71:
            return "soixante et onze"
        return "soixante-" + _UNITES[n - 60]
    if 90 <= n <= 99:
        return "quatre-vingt-" + _UNITES[n - 80]
    return _moins_cent(n)


def _moins_mille(n: int) -> str:
    if n < 100:
        return _moins_cent(n)
    centaines, reste = divmod(n, 100)
    if centaines == 1:
        tete = "cent"
    else:
        tete = _UNITES[centaines] + " cent" + ("s" if reste == 0 else "")
    return tete if reste == 0 else f"{tete} {_moins_cent(reste)}"


def nombre_en_lettres(n: int) -> str:
    """Entier (0 à 999 999 999 999) en mots français."""
    if n == 0:
        return "zéro"
    echelles = ((1_000_000_000, "milliard"), (1_000_000, "million"), (1_000, "mille"))
    parties: list[str] = []
    reste = n
    for valeur, nom in echelles:
        combien, reste = divmod(reste, valeur)
        if not combien:
            continue
        if nom == "mille":
            if combien == 1:
                parties.append("mille")       # mille invariable, sans « un »
            else:
                parties.append(f"{_moins_mille(combien)} mille")
        else:
            parties.append(f"{_moins_mille(combien)} {nom}{'s' if combien > 1 else ''}")
    if reste:
        parties.append(_moins_mille(reste))
    return " ".join(parties)


def _ordinal(n: int, feminin: bool = False) -> str:
    if n == 1:
        return "première" if feminin else "premier"
    mots = nombre_en_lettres(n).split("-")
    dernier = mots[-1]
    if dernier == "neuf":
        dernier = "neuvième"                      # neuf → neuvième
    elif dernier.endswith("q"):
        dernier += "uième"                        # cinq → cinquième
    elif dernier.endswith("e") and len(dernier) > 2:
        dernier = dernier[:-1] + "ième"       # quatre → quatrième
    elif dernier.endswith("ts"):
        dernier = dernier[:-1] + "ième"       # quatre-vingts → vingtième
    else:
        dernier += "ième"
    mots[-1] = dernier
    return "-".join(mots)


# --------------------------------------------------------------- nombres romains

_ROMAIN = re.compile(r"^[IVXLCDM]+$")
_VALEURS = {"I": 1, "V": 5, "X": 10, "L": 50, "C": 100, "D": 500, "M": 1000}


def romain_valeur(texte: str) -> int | None:
    """Valeur d'un nombre romain strict, None si la notation est invalide."""
    if not _ROMAIN.match(texte) or re.search(r"(.)\1\1\1", texte):
        return None
    if not re.fullmatch(r"M{0,3}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})", texte):
        return None
    total = 0
    for i, lettre in enumerate(texte):
        valeur = _VALEURS[lettre]
        if i + 1 < len(texte) and _VALEURS[texte[i + 1]] > valeur:
            total -= valeur
        else:
            total += valeur
    return total


# --------------------------------------------------------------------- règles

# Abréviations : la forme attendue suit (espace + mot) pour éviter les
# faux positifs (« Dr » dans « Droite » ne matche pas grâce aux frontières \b).
_ABREVIATIONS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"\bM\.(?=\s+[A-ZÀ-ÖØ-Þ0-9])"), "Monsieur"),
    (re.compile(r"\bMM\.(?=\s)"), "Messieurs"),
    (re.compile(r"\bMmes?\b(?=\s)"), "Madame"),
    (re.compile(r"\bMlles?\b(?=\s)"), "Mademoiselle"),
    (re.compile(r"\bMᵐᵉˢ?(?=\s)"), "Madame"),
    (re.compile(r"\bMgr\b(?=\s)"), "Monseigneur"),
    (re.compile(r"\bDrs?\b(?=\s)"), "Docteur"),
    (re.compile(r"\bPr\b(?=\s)"), "Professeur"),
    (re.compile(r"\bSte(?=\s+[A-ZÀ-ÖØ-Þ])"), "Sainte"),
    (re.compile(r"\bSt(?=\s+[A-ZÀ-ÖØ-Þ])"), "Saint"),
    (re.compile(r"\bvol\.(?=\s)"), "volume"),
    (re.compile(r"\bchap\.(?=\s)"), "chapitre"),
    (re.compile(r"\bMr\.(?=\s)|\bMr\b(?=\s+[A-Z])"), "Mister"),
    (re.compile(r"\bMrs\.(?=\s)|\bMrs\b(?=\s+[A-Z])"), "Missus"),
    (re.compile(r"\bDr\.(?=\s)|\bDr\b(?=\s+[A-Z])"), "Doctor"),
    (re.compile(r"\bSt\.(?=\s)"), "Saint"),
    (re.compile(r"\bMM\b(?=\s+et\b)"), "Messieurs"),
]

# « N° 3 », « n° 12 », « №7 »
_NUMERO = re.compile(r"\b([Nn])°\s*(\d+)|№\s*(\d+)")
# Louis XVI → Louis seize : nom propre suivi d'un romain (jamais ordinal ᵉ).
# Les chiffres romains restent en MAJUSCULES : « le », « de », « vie » ne sont
# jamais touchés (le suffixe ordinal est la minuscule « e »/« ᵉ »).
_ROI = re.compile(r"\b([A-ZÀ-ÖØ-Þ][a-zà-öø-ÿ]+)\s+([IVXLCDM]{2,})(?![eEᵉ])\b")
# XXe siècle / XVIᵉ : ordinal — au moins deux chiffres romains, sinon « Ce »,
# « Le », « De » (une lettre + e) seraient capturés ; « Ier » a sa règle propre.
_SIECLE = re.compile(r"\b([IVXLCDM]{2,})(?:ᵉ|e)(?=\s|$|[,.;:!?»])")
# François Ier / Jeanne Ire
_PREMIER_ROMAIN = re.compile(r"\bI(er|re|ᵉʳ|ʳᵉ)\b")
# 1er, 1ᵉʳ, 1re, 2e, 3ème…
_ORDINAL_NUM = re.compile(r"\b(\d+)(?:\s*(ᵉʳ|ʳᵉ|ᵉ|e|ème|eme|ière|iere|ème))\b",
                          re.IGNORECASE)
# 1789 ; 1 500 ; 3,14 ; 12 %
_NOMBRE = re.compile(r"\b\d{1,3}(?:[ \u202f\u00a0]\d{3})+(?:,\d+)?\b|\b\d+,\d+\b|\b\d+\b")
_POURCENT = re.compile(r"(\d+)\s*%")
_EURO = re.compile(r"(\d+)\s*€")
_DEGRE = re.compile(r"(\d+)\s*°\s*[Cc]\b")
_ORDINAUX_LETTRES = re.compile(r"\b([1-9])\s*(er|ère|re|nde|ne)\b", re.IGNORECASE)


def _remplacer_nombre(correspondance: re.Match[str]) -> str:
    brut = correspondance.group(0)
    if "," in brut:
        entiere, decimale = brut.split(",")
        return (nombre_en_lettres(int(entiere.replace(" ", "").replace("\u202f", "")
                                   .replace("\u00a0", "")))
                + " virgule " + nombre_en_lettres(int(decimale)))
    return nombre_en_lettres(int(brut.replace(" ", "").replace("\u202f", "").replace("\u00a0", "")))


def _roi(match: re.Match[str]) -> str:
    valeur = romain_valeur(match.group(2))
    if not valeur:
        return match.group(0)
    return f"{match.group(1)} {nombre_en_lettres(valeur)}"


def _siecle(match: re.Match[str]) -> str:
    valeur = romain_valeur(match.group(1))
    if not valeur:
        return match.group(0)
    return _ordinal(valeur)


def normaliser(texte: str) -> str:
    """Réécrit abréviations, nombres et notations en mots français lisibles."""
    if not texte:
        return texte
    texte = texte.replace("\u202f", " ").replace("\u00a0", " ")
    texte = re.sub(r"(\d)\s+(%|€)", r"\1\2", texte)

    for motif, remplacement in _ABREVIATIONS:
        texte = motif.sub(remplacement, texte)

    # N° 3 → numéro trois
    texte = _NUMERO.sub(
        lambda m: "numéro " + nombre_en_lettres(int(m.group(2) or m.group(3))), texte)
    # François Ier → François premier
    texte = _PREMIER_ROMAIN.sub(
        lambda m: "première" if m.group(1).lower() in ("re", "ʳᵉ") else "premier", texte)
    # Louis XVI → Louis seize
    texte = _ROI.sub(_roi, texte)
    # XXe siècle → vingtième siècle
    texte = _SIECLE.sub(_siecle, texte)
    # 1er → premier, 2e → deuxième, 1re → première
    texte = _ORDINAUX_LETTRES.sub(
        lambda m: {"er": "premier", "re": "première", "ère": "première",
                   "nde": "seconde", "ne": "seconde"}.get(
            m.group(2).lower(), _ordinal(int(m.group(1)))), texte)
    texte = _ORDINAL_NUM.sub(
        lambda m: _ordinal(int(m.group(1)), feminin=m.group(2).lower() in ("re", "ère", "ʳᵉ", "ière", "iere")), texte)
    # unités composées
    texte = _DEGRE.sub(lambda m: nombre_en_lettres(int(m.group(1))) + " degrés", texte)
    texte = _EURO.sub(lambda m: nombre_en_lettres(int(m.group(1))) + " euros", texte)
    texte = _POURCENT.sub(lambda m: nombre_en_lettres(int(m.group(1))) + " pour cent", texte)
    texte = _NOMBRE.sub(_remplacer_nombre, texte)

    texte = texte.replace("&", " et ")
    return re.sub(r"  +", " ", texte).strip()
