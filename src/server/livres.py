"""Projets de livres : import EPUB → chapitres markdown (jalon audiobooks).

Un EPUB est une archive zip de XHTML + un manifeste OPF ; le parsage se fait
en bibliothèque standard (zipfile, xml.etree, html.parser), zéro dépendance
pip. Chaque livre vit dans data/livres/{id}/ :

  projet.json           source de vérité (titre, chapitres, mots…)
  chapitres/001.md      texte du chapitre, prêt à être tagué par voix
  couverture.jpg        image de couverture si l'EPUB en fournit une
  source.epub           archive d'origine conservée pour réanalyse

L'identifiant est l'empreinte md5 du fichier (réimporter un EPUB remplace
le projet existant).
"""
from __future__ import annotations

import hashlib
import html
import io
import json
import posixpath
import re
import shutil
import unicodedata
import urllib.parse
import zipfile
from datetime import datetime
from html.parser import HTMLParser
from pathlib import Path
from xml.etree import ElementTree as ET

import ia

TAILLE_MAX = 300 * 1024 * 1024      # 300 Mo : un EPUB de livre courant
MIN_MOTS_CHAPITRE = 40              # en dessous : page de partie, pas un chapitre
TAILLE_MORCEAU = 2500               # caractères par appel de tagage IA
REPERTOIRE_CHAPITRES = "chapitres"

TAG_LIGNE = re.compile(r"^\[([a-zA-Z0-9_-]+)\]\s*", re.MULTILINE)


class LivreErreur(Exception):
    """Erreur d'import remontée telle quelle au studio (fichier invalide…)."""


# ---------------------------------------------------------------- texte XHTML

_BLOC = {
    "address", "article", "aside", "blockquote", "body", "caption", "dd", "div",
    "dl", "dt", "fieldset", "figcaption", "figure", "footer", "form", "h1", "h2",
    "h3", "h4", "h5", "h6", "header", "hr", "li", "main", "ol", "p", "pre",
    "section", "table", "td", "th", "tr", "ul",
}
_IGNORE = {"style", "script", "head", "title", "svg", "template", "link", "meta"}


class _Extracteur(HTMLParser):
    """XHTML (tolérant aux approximations) → paragraphes de texte brut."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.lignes: list[list[str]] = [[]]
        self._ignore = 0

    def handle_starttag(self, tag, attrs):
        if tag in _IGNORE:
            self._ignore += 1
        elif tag in _BLOC or tag == "br":
            self.lignes.append([])

    def handle_endtag(self, tag):
        if tag in _IGNORE:
            self._ignore = max(0, self._ignore - 1)
        elif tag in _BLOC:
            self.lignes.append([])

    def handle_data(self, data):
        if not self._ignore and data.strip():
            self.lignes[-1].append(data)

    def texte(self) -> str:
        lignes = (re.sub(r"\s+", " ", "".join(morceaux)).strip() for morceaux in self.lignes)
        return "\n\n".join(ligne for ligne in lignes if ligne)


def texte_xhtml(brut: str) -> str:
    extracteur = _Extracteur()
    try:
        extracteur.feed(brut)
        extracteur.close()
    except Exception:  # noqa: BLE001 — HTML cassé : on garde ce qu'on a pu extraire
        pass
    return extracteur.texte()


# ------------------------------------------------------------- ancres de file

_TAG_BLOC = re.compile(
    r"<(?:address|article|aside|blockquote|body|div|figcaption|figure|footer"
    r"|h[1-6]|header|li|main|nav|ol|p|pre|section|table|td|tr|ul)\b[^>]*>",
    re.IGNORECASE,
)
_ID_ATTR = re.compile(r"""\bid\s*=\s*["']([^"'&]+)["']""", re.IGNORECASE)


def _coupe_ancre(html: str, ancre: str) -> int:
    """Position de découpe dans le HTML pour une ancre `fichier.xhtml#ancre`.

    Le tag porteur est un bloc (h2, section…) ; une ancre posée sur un tag
    inline (a, span) coupe au bloc suivant. Introuvable → 0 (début du fichier).
    """
    for tag in _TAG_BLOC.finditer(html):
        identifiant = _ID_ATTR.search(tag.group(0))
        if identifiant and identifiant.group(1) == ancre:
            return tag.start()
    porteur = re.search(
        rf'<[a-zA-Z][^>]*\bid\s*=\s*["\'][^"\']*["\'][^>]*>', html, re.IGNORECASE)
    if porteur:
        identifiant = _ID_ATTR.search(porteur.group(0))
        if identifiant and identifiant.group(1) == ancre:
            suivant = _TAG_BLOC.search(html, porteur.start())
            if suivant:
                return suivant.start()
    return 0


# --------------------------------------------------------------- lecture EPUB

def _local(element) -> str:
    return element.tag.rsplit("}", 1)[-1] if isinstance(element.tag, str) else ""


def _resoud(dossier: str, href: str) -> str:
    return posixpath.normpath(posixpath.join(dossier, urllib.parse.unquote(href)))


def _lire_opf(package: ET.Element, dossier: str) -> dict:
    """Manifeste OPF → métadonnées, manifest, spine (liste de chemins xhtml)."""
    manifest: dict[str, dict] = {}
    for element in package.iter():
        if _local(element) != "item":
            continue
        identifiant = element.get("id")
        href = element.get("href")
        if not identifiant or not href:
            continue
        manifest[identifiant] = {
            "chemin": _resoud(dossier, href),
            "type": element.get("media-type", ""),
            "props": element.get("properties", ""),
        }
    toc_idref = None
    spine: list[str] = []
    for element in package.iter():
        nom = _local(element)
        if nom == "spine":
            toc_idref = element.get("toc") or toc_idref
        elif nom == "itemref":
            item = manifest.get(element.get("idref", ""))
            if not item:
                continue
            if item["type"] in ("application/xhtml+xml", "text/html") \
                    and element.get("linear", "yes") != "no":
                spine.append(item["chemin"])
    titre = auteur = ""
    couverture = ""
    for element in package.iter():
        nom = _local(element)
        if nom == "title" and not titre:
            titre = (element.text or "").strip()
        elif nom == "creator" and not auteur:
            auteur = (element.text or "").strip()
        elif nom == "meta" and element.get("name") == "cover":
            item = manifest.get(element.get("content", ""), {})
            if item.get("chemin"):
                couverture = item["chemin"]
    for item in manifest.values():
        if "cover-image" in item["props"].split() and item["type"].startswith("image/"):
            couverture = item["chemin"]
    return {"manifest": manifest, "spine": spine, "titre": titre, "auteur": auteur,
            "couverture": couverture, "toc_idref": toc_idref}


_LIEN = re.compile(
    r'<a\b[^>]*href\s*=\s*["\']([^"\']+)["\'][^>]*>(.*?)</a>', re.IGNORECASE | re.DOTALL)


def _libelle(html_morceau: str) -> str:
    texte = re.sub(r"<[^>]+>", " ", html_morceau)
    return re.sub(r"\s+", " ", html.unescape(texte)).strip()


def _lire_toc(archive: zipfile.ZipFile, opf: dict) -> list[tuple[str, str, str]]:
    """Sommaire (nav EPUB3 ou NCX EPUB2) → [(label, chemin, ancre)] dans l'ordre."""
    entrees: list[tuple[str, str, str]] = []
    nav = next((i for i in opf["manifest"].values() if "nav" in i["props"].split()), None)
    if nav:
        try:
            html = archive.read(nav["chemin"]).decode("utf-8", "replace")
        except KeyError:
            html = ""
        morceau = html
        ouverture = re.search(r'<nav\b[^>]*type\s*=\s*["\']toc["\'][^>]*>', html, re.IGNORECASE)
        if ouverture:                       # privilégier le nav « toc » (hors landmarks…)
            fermeture = html.find("</nav>", ouverture.end())
            morceau = html[ouverture.end():fermeture if fermeture > 0 else len(html)]
        base = posixpath.dirname(nav["chemin"])
        for lien in _LIEN.finditer(morceau):
            cible = urllib.parse.unquote(lien.group(1))
            chemin, _, ancre = cible.partition("#")
            if chemin:
                entrees.append((_libelle(lien.group(2)), _resoud(base, chemin), ancre))
    if not entrees and opf["toc_idref"]:
        ncx = opf["manifest"].get(opf["toc_idref"], {}).get("chemin")
        if ncx:
            try:
                contenu = archive.read(ncx).decode("utf-8", "replace")
            except KeyError:
                contenu = ""
            libelles = [(m.start(), _libelle(m.group(1))) for m in
                        re.finditer(r"<text[^>]*>(.*?)</text>", contenu, re.DOTALL)]
            base = posixpath.dirname(ncx)
            for contenu_src in re.finditer(
                    r'<content[^>]+src\s*=\s*["\']([^"\']+)["\']', contenu, re.IGNORECASE):
                libelle = ""
                for position, texte in libelles:
                    if position < contenu_src.start():
                        libelle = texte
                cible = urllib.parse.unquote(contenu_src.group(1))
                chemin, _, ancre = cible.partition("#")
                if chemin:
                    entrees.append((libelle, _resoud(base, chemin), ancre))
    return entrees


# ------------------------------------------------------- découpage chapitres

_TITRES_ECARTES = re.compile(
    r"^(couverture|cover|titre|title ?page|copyright|colophon|sommaire"
    r"|table (des mati[eè]res|of contents)|contents|d[ée]dicace|pr[ée]face et remerciements)$",
    re.IGNORECASE,
)


def _compte_mots(texte: str) -> int:
    return len(re.findall(r"\S+", TAG_LIGNE.sub("", texte)))   # les tags ne comptent pas


def _decouper(archive: zipfile.ZipFile, opf: dict) -> list[dict]:
    """Chapitres [(titre, texte)] à partir du sommaire, sinon des fichiers du spine."""
    memoire: dict[str, str] = {}

    def html(chemin: str) -> str:
        if chemin not in memoire:
            try:
                memoire[chemin] = archive.read(chemin).decode("utf-8", "replace")
            except KeyError:
                memoire[chemin] = ""
        return memoire[chemin]

    position = {chemin: index for index, chemin in enumerate(opf["spine"])}
    vues: set[tuple[str, str]] = set()
    utiles: list[tuple[int, str, int, str]] = []     # (index spine, chemin, coupe, label)
    for label, chemin, ancre in _lire_toc(archive, opf):
        if chemin not in position or (chemin, ancre) in vues:
            continue
        vues.add((chemin, ancre))
        utiles.append((position[chemin], chemin, _coupe_ancre(html(chemin), ancre), label))

    fragments: list[dict] = []                       # [{"label": str, "html": [str]}]
    if len(utiles) >= 2:
        utiles.sort(key=lambda e: (e[0], e[2]))
        for chemin in opf["spine"]:
            contenu = html(chemin)
            bornes = [(e[2], e[3]) for e in utiles if e[1] == chemin]
            if not bornes:
                if fragments:
                    fragments[-1]["html"].append(contenu)   # suite du chapitre courant
                elif contenu.strip() and texte_xhtml(contenu):
                    fragments.append({"label": "Ouverture", "html": [contenu]})
                continue
            debut = bornes[0][0]
            if debut > 0 and fragments:
                fragments[-1]["html"].append(contenu[:debut])
            for index, (coupe, label) in enumerate(bornes):
                fin = bornes[index + 1][0] if index + 1 < len(bornes) else len(contenu)
                fragments.append({"label": label, "html": [contenu[coupe:fin]]})

    def extraire(fragments_: list[dict]) -> list[dict]:
        chapitres = []
        for numero, fragment in enumerate(fragments_, 1):
            texte = texte_xhtml("\n".join(fragment["html"]))
            if not texte:
                continue
            titre = fragment["label"] or f"Chapitre {numero}"
            if _TITRES_ECARTES.match(titre) or _compte_mots(texte) < MIN_MOTS_CHAPITRE:
                continue
            chapitres.append({"titre": titre[:120], "texte": texte})
        return chapitres

    chapitres = extraire(fragments)
    if chapitres:
        return chapitres

    # repli : pas de sommaire exploitable → un chapitre par document du spine
    fragments = []
    for index, chemin in enumerate(opf["spine"], 1):
        contenu = html(chemin)
        if not contenu.strip():
            continue
        lignes = texte_xhtml(contenu).splitlines()
        titre = lignes[0] if lignes and len(lignes[0]) <= 90 else f"Chapitre {len(fragments) + 1}"
        fragments.append({"label": titre, "html": [contenu]})
    chapitres = extraire(fragments)
    if not chapitres:
        raise LivreErreur("EPUB sans texte exploitable (DRM ou contenu vide).")
    return chapitres


# ------------------------------------------------------------------ persistance

def _projet(racine: Path, ident: str) -> Path:
    return racine / ident / "projet.json"


def _ecrire_projet(racine: Path, ident: str, projet: dict) -> None:
    _projet(racine, ident).write_text(
        json.dumps(projet, ensure_ascii=False, indent=2), encoding="utf-8")


def _ecrire_chapitres(dossier: Path, projet: dict, entrees: list[dict]) -> None:
    """(Ré)écrit tous les chapitres du livre — renumérotation propre (scission…)."""
    repertoire = dossier / REPERTOIRE_CHAPITRES
    if repertoire.exists():
        shutil.rmtree(repertoire)
    repertoire.mkdir(parents=True)
    projet["chapitres"] = []
    for numero, entree in enumerate(entrees, 1):
        fichier = f"{REPERTOIRE_CHAPITRES}/{numero:03d}.md"
        (dossier / fichier).write_text(
            f"# {entree['titre']}\n\n{entree['texte']}\n", encoding="utf-8")
        projet["chapitres"].append({
            "num": numero, "titre": entree["titre"], "fichier": fichier,
            "mots": _compte_mots(entree["texte"]),
        })
    projet["mots"] = sum(c["mots"] for c in projet["chapitres"])


def importer_epub(nom: str, brut: bytes, racine: Path) -> dict:
    """Archive EPUB → projet de livre persisté ; renvoie le projet.json."""
    if len(brut) > TAILLE_MAX:
        raise LivreErreur(
            f"EPUB trop volumineux ({len(brut) // 1_048_576} Mo, maximum {TAILLE_MAX // 1_048_576} Mo).")
    try:
        archive = zipfile.ZipFile(io.BytesIO(brut))
    except zipfile.BadZipFile as erreur:
        raise LivreErreur("Ce fichier n'est pas un EPUB (archive zip invalide).") from erreur

    with archive:
        try:
            conteneur = ET.fromstring(archive.read("META-INF/container.xml"))
        except (KeyError, ET.ParseError) as erreur:
            raise LivreErreur("EPUB invalide : manifeste container.xml introuvable ou illisible.") from erreur
        chemin_opf = next(
            (e.get("full-path") for e in conteneur.iter()
             if _local(e) == "rootfile" and e.get("full-path")), None)
        if not chemin_opf:
            raise LivreErreur("EPUB invalide : manifeste OPF introuvable.")
        try:
            package = ET.fromstring(archive.read(chemin_opf))
        except (KeyError, ET.ParseError) as erreur:
            raise LivreErreur("EPUB invalide : manifeste OPF illisible.") from erreur
        opf = _lire_opf(package, posixpath.dirname(chemin_opf))
        chapitres = _decouper(archive, opf)
        image = b""
        if opf["couverture"]:
            try:
                image = archive.read(opf["couverture"])
            except KeyError:
                image = b""

    ident = hashlib.md5(brut).hexdigest()[:12]
    dossier = racine / ident
    if dossier.exists():
        shutil.rmtree(dossier)
    dossier.mkdir(parents=True)
    (dossier / "source.epub").write_bytes(brut)

    extension = Path(opf["couverture"]).suffix.lower() if image else ""
    if image and extension in (".jpg", ".jpeg", ".png", ".gif", ".webp"):
        (dossier / f"couverture{extension}").write_bytes(image)
        couverture = f"couverture{extension}"
    else:
        couverture = ""

    projet = {
        "id": ident,
        "titre": opf["titre"] or Path(nom).stem or "Livre sans titre",
        "auteur": opf["auteur"],
        "source": nom,
        "importe": datetime.now().isoformat(timespec="seconds"),
        "couverture": couverture,
        "mots": 0,
        "chapitres": [],
    }
    _ecrire_chapitres(dossier, projet, chapitres)
    _projet(racine, ident).write_text(
        json.dumps(projet, ensure_ascii=False, indent=2), encoding="utf-8")
    return projet


def lister(racine: Path) -> list[dict]:
    """Projets existants, les plus récemment importés d'abord (tolérant aux dossiers cassés)."""
    projets = []
    for dossier in racine.glob("*/"):
        try:
            projet = json.loads(_projet(racine, dossier.name).read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        projets.append(projet)
    projets.sort(key=lambda p: p.get("importe", ""), reverse=True)
    return projets


def lire(racine: Path, ident: str) -> dict | None:
    try:
        return json.loads(_projet(racine, ident).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def lire_chapitre(racine: Path, ident: str, numero: int) -> dict | None:
    projet = lire(racine, ident)
    chapitre = next((c for c in projet["chapitres"] if c["num"] == numero), None) if projet else None
    if not chapitre:
        return None
    try:
        contenu = (racine / ident / chapitre["fichier"]).read_text(encoding="utf-8")
    except OSError:
        return None
    texte = re.sub(r"^# .*\n+", "", contenu, count=1)
    return {**chapitre, "texte": texte.strip()}


def enregistrer_chapitre(racine: Path, ident: str, numero: int, texte: str,
                         titre: str | None = None) -> dict | None:
    """Réécrit le chapitre (édition manuelle, titre optionnel) et actualise les mots."""
    projet = lire(racine, ident)
    chapitre = next((c for c in projet["chapitres"] if c["num"] == numero), None) if projet else None
    if not chapitre:
        return None
    if titre is not None:
        chapitre["titre"] = titre.strip()[:120] or chapitre["titre"]
    (racine / ident / chapitre["fichier"]).write_text(
        f"# {chapitre['titre']}\n\n{texte.strip()}\n", encoding="utf-8")
    chapitre["mots"] = _compte_mots(texte)
    projet["mots"] = sum(c["mots"] for c in projet["chapitres"])
    _projet(racine, ident).write_text(
        json.dumps(projet, ensure_ascii=False, indent=2), encoding="utf-8")
    return chapitre


def renommer_livre(racine: Path, ident: str, titre: str | None = None,
                   auteur: str | None = None) -> dict | None:
    """Renomme le livre et/ou rectifie l'auteur."""
    projet = lire(racine, ident)
    if not projet:
        return None
    if titre is not None:
        titre = titre.strip()[:160]
        if not titre:
            raise LivreErreur("titre vide")
        projet["titre"] = titre
    if auteur is not None:
        projet["auteur"] = auteur.strip()[:160]
    _projet(racine, ident).write_text(
        json.dumps(projet, ensure_ascii=False, indent=2), encoding="utf-8")
    return projet


def scinder_chapitre(racine: Path, ident: str, numero: int, texte: str, position: int,
                     titre1: str | None = None, titre2: str | None = None) -> dict | None:
    """Scinde un chapitre trop long à `position` (curseur dans l'éditeur).

    Le texte fourni est celui de l'éditeur (modifications non enregistrées
    comprises) : l'écriture et la coupure sont atomiques. `titre1`/`titre2`
    renomment respectivement la première et la seconde partie. Les chapitres
    suivants sont renumérotés. Renvoie le projet complet.
    """
    projet = lire(racine, ident)
    if not projet or not any(c["num"] == numero for c in projet["chapitres"]):
        return None
    texte = texte.strip()
    if not (0 < position < len(texte)) or not texte[:position].strip() or not texte[position:].strip():
        raise LivreErreur("position de coupure invalide : place le curseur dans le texte")
    entrees = []
    for chapitre in projet["chapitres"]:
        if chapitre["num"] == numero:
            titre_premier = (titre1 or "").strip() or chapitre["titre"]
            titre_suite = (titre2 or "").strip() or f"{chapitre['titre']} (suite)"
            entrees.append({"titre": titre_premier, "texte": texte[:position].strip()})
            entrees.append({"titre": titre_suite, "texte": texte[position:].strip()})
        else:
            contenu = (racine / ident / chapitre["fichier"]).read_text(encoding="utf-8")
            entrees.append({"titre": chapitre["titre"],
                            "texte": re.sub(r"^# .*\n+", "", contenu, count=1).strip()})
    _ecrire_chapitres(racine / ident, projet, entrees)
    _projet(racine, ident).write_text(
        json.dumps(projet, ensure_ascii=False, indent=2), encoding="utf-8")
    return projet


def chemin_couverture(racine: Path, ident: str) -> Path | None:
    projet = lire(racine, ident)
    if not projet or not projet.get("couverture"):
        return None
    chemin = racine / ident / projet["couverture"]
    return chemin if chemin.exists() else None


def supprimer(racine: Path, ident: str) -> bool:
    dossier = racine / ident
    if not dossier.is_dir():
        return False
    shutil.rmtree(dossier)
    return True


def reparer_analyses_interrompues(racine: Path) -> int:
    """Au démarrage du serveur : une analyse « en_cours » ne peut plus l'être
    (le fil d'exécution meurt avec le processus). On la marque « interrompue »
    pour que le studio propose de la reprendre au lieu de refuser (409 fantôme).
    """
    nombre = 0
    for dossier in racine.glob("*/"):
        try:
            projet = json.loads((dossier / "projet.json").read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        analyse = projet.get("analyse") or {}
        if analyse.get("etat") == "en_cours":
            faites = sum(1 for c in projet.get("chapitres", []) if c.get("analyse") == "faite")
            analyse["etat"] = "interrompue"
            analyse["erreur"] = ("interrompue par un arrêt ou un redémarrage du studio "
                                 f"— {faites}/{len(projet.get('chapitres', []))} chapitres analysés, "
                                 "reprends où elle s'était arrêtée")
            (dossier / "projet.json").write_text(
                json.dumps(projet, ensure_ascii=False, indent=2), encoding="utf-8")
            nombre += 1
    return nombre


# ------------------------------------------------- analyse IA (voix du livre)

def _slug(texte: str) -> str:
    """Identifiant de voix court : minuscules, sans accent ni espace."""
    decompose = unicodedata.normalize("NFKD", str(texte or "")).encode("ascii", "ignore").decode()
    nettoye = re.sub(r"[^a-zA-Z0-9_-]+", "-", decompose).strip("-").lower()
    if nettoye == "narrator":        # l'IA glisse parfois l'anglais : un seul rôle narrateur
        nettoye = "narrateur"
    return nettoye or "voix"


def _sans_tags(texte: str) -> str:
    return TAG_LIGNE.sub("", texte)


def voix_du_texte(texte: str) -> list[str]:
    """Voix présentes dans un texte taggé, narrateur d'abord, ordre d'apparition."""
    ids: list[str] = []
    for trouve in TAG_LIGNE.finditer(texte):
        identifiant = _slug(trouve.group(1))
        if identifiant not in ids:
            ids.append(identifiant)
    if "narrateur" in ids:
        ids.remove("narrateur")
        ids.insert(0, "narrateur")
    return ids


def _lire_texte_chapitre(dossier: Path, chapitre: dict) -> str:
    """Texte d'un chapitre sans sa ligne de titre ni ses éventuels tags."""
    try:
        contenu = (dossier / chapitre["fichier"]).read_text(encoding="utf-8")
    except OSError:
        return ""
    return _sans_tags(re.sub(r"^# .*\n+", "", contenu, count=1)).strip()


def _decouper_analyse(texte: str, taille: int = TAILLE_MORCEAU) -> list[str]:
    """Découpe alignée sur les paragraphes (~taille max par morceau)."""
    morceaux: list[str] = []
    courant = ""
    for paragraphe in texte.split("\n\n"):
        if courant and len(courant) + len(paragraphe) + 2 > taille:
            morceaux.append(courant)
            courant = paragraphe
        else:
            courant = f"{courant}\n\n{paragraphe}" if courant else paragraphe
    if courant.strip():
        morceaux.append(courant)
    propres = []
    for morceau in morceaux:
        while len(morceau) > taille * 2:      # paragraphe unique géant : coupe franche
            propres.append(morceau[:taille])
            morceau = morceau[taille:]
        propres.append(morceau)
    return propres


def _echantillon(dossier: Path, projet: dict, taille: int = 9000) -> str:
    """Extraits représentatifs du livre pour détecter la distribution des voix."""
    chapitres = projet["chapitres"]
    if not chapitres:
        return ""
    milieux = [chapitres[0], chapitres[len(chapitres) // 2], chapitres[-1]]
    vus, pris = set(), []
    for chapitre in milieux:
        if chapitre["num"] in vus:
            continue
        vus.add(chapitre["num"])
        texte = _lire_texte_chapitre(dossier, chapitre)
        if texte:
            pris.append(texte[:3000])
    return "\n\n[…]\n\n".join(pris)[:taille]


def _detecter_cast(cfg: dict, titre: str, echantillon: str) -> list[dict]:
    """Passe 1 : la distribution des voix — narrateur + personnages, avec genre."""
    message = (
        "TÂCHE: CAST.\n"
        "Tu prépares un audiobook. Identifie les VOIX nécessaires à la lecture du livre :\n"
        "- le narrateur (récit, descriptions, tout ce qui n'est pas une réplique) ;\n"
        "- chaque personnage qui parle, avec le genre de sa voix.\n\n"
        f"Titre : {titre}\n\nExtraits :\n<<<\n{echantillon}\n>>>\n\n"
        "Réponds UNIQUEMENT en JSON :\n"
        '{"cast": [{"id": "narrateur", "nom": "Narrateur", "genre": "femme", '
        '"role": "narrateur", "description": "…", "importance": "principal"}]}\n'
        "Règles :\n"
        '- "id" : identifiant court en minuscules, sans accent ni espace ("narrateur" pour le narrateur, sinon le prénom).\n'
        '- "genre" : "homme", "femme" ou "indetermine" — c\'est le genre de la VOIX à utiliser pour ce rôle.\n'
        '- "importance" : "principal" (nombreuses répliques), "secondaire", "figurant".\n'
        "- Narrateur d'abord, puis personnages par importance décroissante ; 15 entrées maximum (regroupe les figurants)."
    )
    reponse = ia.completer(cfg, [{"role": "user", "content": message}], json_mode=True)
    donnees = ia.extraire_json(reponse)
    cast, vus = [], set()
    for entree in donnees.get("cast", []):
        if not isinstance(entree, dict):
            continue
        identifiant = _slug(entree.get("id") or entree.get("nom") or "")
        if not identifiant or identifiant in vus:
            continue
        vus.add(identifiant)
        genre = entree.get("genre") if entree.get("genre") in ("homme", "femme", "indetermine") else "indetermine"
        cast.append({
            "id": identifiant,
            "nom": str(entree.get("nom") or identifiant)[:80],
            "genre": genre,
            "role": "narrateur" if entree.get("role") == "narrateur" or identifiant == "narrateur" else "personnage",
            "description": str(entree.get("description") or "")[:200],
            "importance": entree.get("importance") if entree.get("importance") in ("principal", "secondaire", "figurant") else "secondaire",
        })
    if not any(voice["role"] == "narrateur" for voice in cast):
        cast.insert(0, {"id": "narrateur", "nom": "Narrateur", "genre": "indetermine",
                        "role": "narrateur", "description": "", "importance": "principal"})
    if not cast:
        raise ia.IaErreur("l'IA n'a identifié aucune voix dans ce livre")
    return cast[:15]


def _tagger_morceau(cfg: dict, titre: str, numero: int, index: int, total: int,
                    morceau: str, cast: list[dict]) -> list[str]:
    """Passe 2 : un extrait du chapitre réécrit en lignes [voix] attribuées."""
    distribution = "\n".join(
        f"- {voice['id']} ({voice['nom']}, {'voix ' + voice['genre']}{', narrateur' if voice['role'] == 'narrateur' else ''})"
        for voice in cast)
    message = (
        f"TÂCHE: TAGAGE.\n"
        f"Livre : « {titre} » — chapitre {numero}, extrait {index}/{total}.\n"
        f"Voix disponibles :\n{distribution}\n\n"
        "Réécris l'extrait ci-dessous en lignes taggées : chaque ligne commence par "
        "[id] du locuteur puis son propos exact.\n"
        f"<<<\n{morceau}\n>>>\n\n"
        "Règles strictes :\n"
        "- CONSERVE le texte à l'identique : aucun mot ajouté, retiré ni reformulé.\n"
        "- Découpe un paragraphe en plusieurs lignes dès que le locuteur change.\n"
        "- Chaque réplique (« … » ou — …) sur sa propre ligne, attribuée à son personnage : déduis le locuteur du contexte (verbes de parole, noms, accords, style d'élocution).\n"
        "- Le récit hors dialogue revient au narrateur.\n"
        "- Un locuteur absent de la liste : nouvel id court (np1, np2…) réutilisé ensuite.\n"
        "- Réponds UNIQUEMENT par les lignes taggées, sans commentaire."
    )
    reponse = ia.completer(cfg, [{"role": "user", "content": message}])
    connus = {voice["id"] for voice in cast}
    lignes: list[str] = []
    for ligne in reponse.splitlines():
        ligne = ligne.strip()
        if not ligne or ligne.startswith("<<<"):
            continue
        trouve = re.match(r"^\[([a-zA-Z0-9_-]+)\]\s*(.+)$", ligne)
        if trouve and trouve.group(2).strip():
            identifiant = _slug(trouve.group(1))
            if identifiant not in connus:        # nouveau locuteur : collecté plus tard
                connus.add(identifiant)
            lignes.append(f"[{identifiant}] {trouve.group(2).strip()}")
        elif trouve:
            continue
        else:
            lignes.append(f"[narrateur] {ligne}")
    return lignes


def _classer_genres(cfg: dict, titre: str, repliques: dict[str, list[str]]) -> dict[str, str]:
    """Genre des locuteurs découverts pendant le tagage (np1, np2…)."""
    extraits = "\n\n".join(
        f"{identifiant} :\n" + "\n".join(lignes[:6]) for identifiant, lignes in repliques.items())
    message = (
        f"TÂCHE: GENRES.\nLivre : « {titre} ». Voici des répliques de personnages rencontrés "
        "en cours de lecture :\n"
        f"{extraits}\n\n"
        'Pour chacun, déduis le genre de sa VOIX ("homme", "femme" ou "indetermine") '
        "à partir de ce qui est dit d'eux dans le texte (accords, mentions, contexte).\n"
        'Réponds UNIQUEMENT en JSON, ex. : {"np1": "homme", "np2": "femme"}'
    )
    try:
        return {str(cle): val for cle, val in
                ia.extraire_json(ia.completer(cfg, [{"role": "user", "content": message}], json_mode=True)).items()
                if val in ("homme", "femme", "indetermine")}
    except ia.IaErreur:
        return {identifiant: "indetermine" for identifiant in repliques}


def analyser_livre(racine: Path, ident: str, cfg: dict,
                   numeros: list[int] | None = None, forcer: bool = False) -> dict:
    """Analyse IA complète : distribution des voix puis tagage des chapitres.

    Le projet.json est réécrit après chaque chapitre : l'état survit à une
    interruption, l'UI suit la progression et la reprise ne refait que ce qui
    manque.
    """
    projet = lire(racine, ident)
    if not projet:
        raise LivreErreur("livre inconnu")
    dossier = racine / ident

    try:
        # la distribution n'est refaite que pour une ré-analyse du livre ENTIER :
        # re-tagger un chapitre précis conserve le cast actuel (cohérence des voix entre chapitres)
        if (forcer and numeros is None) or not projet.get("cast"):
            projet["cast"] = _detecter_cast(cfg, projet["titre"], _echantillon(dossier, projet))
            projet["analyse"] = {"etat": "en_cours", "courant": 0, "total": 0}
            _ecrire_projet(racine, ident, projet)

        cibles = [c for c in projet["chapitres"]
                  if (numeros is None or c["num"] in numeros)
                  and (forcer or c.get("analyse") != "faite")]
        if not cibles:
            projet["analyse"] = {"etat": "faite",
                                 "chapitres": sum(1 for c in projet["chapitres"] if c.get("analyse") == "faite")}
            _ecrire_projet(racine, ident, projet)
            return projet

        projet["analyse"] = {"etat": "en_cours", "courant": 0, "total": len(cibles)}
        _ecrire_projet(racine, ident, projet)
        connus = {voice["id"] for voice in projet["cast"]}
        repliques_nouvelles: dict[str, list[str]] = {}

        for avance, chapitre in enumerate(cibles, 1):
            texte = _lire_texte_chapitre(dossier, chapitre)
            morceaux = _decouper_analyse(texte)
            lignes: list[str] = []
            for index, morceau in enumerate(morceaux, 1):
                lignes.extend(_tagger_morceau(
                    cfg, projet["titre"], chapitre["num"], index, len(morceaux), morceau, projet["cast"]))
            tagge = "\n".join(lignes)
            (dossier / chapitre["fichier"]).write_text(
                f"# {chapitre['titre']}\n\n{tagge}\n", encoding="utf-8")
            chapitre["analyse"] = "faite"
            chapitre["voix"] = voix_du_texte(tagge)
            for ligne in lignes:
                trouve = re.match(r"^\[([a-zA-Z0-9_-]+)\]", ligne)
                if trouve and _slug(trouve.group(1)) not in connus:
                    repliques_nouvelles.setdefault(_slug(trouve.group(1)), []).append(ligne)
            projet["analyse"]["courant"] = avance
            _ecrire_projet(racine, ident, projet)

        if repliques_nouvelles:
            genres = _classer_genres(cfg, projet["titre"], repliques_nouvelles)
            for nouveau, lignes in repliques_nouvelles.items():
                projet["cast"].append({
                    "id": nouveau, "nom": nouveau.capitalize(),
                    "genre": genres.get(nouveau, "indetermine"),
                    "role": "personnage",
                    "description": "détecté pendant le tagage",
                    "importance": "secondaire",
                })
        projet["analyse"] = {"etat": "faite",
                             "chapitres": sum(1 for c in projet["chapitres"] if c.get("analyse") == "faite")}
        _ecrire_projet(racine, ident, projet)
        return projet
    except ia.IaErreur as erreur:
        projet["analyse"] = {"etat": "erreur", "erreur": str(erreur)[:300]}
        _ecrire_projet(racine, ident, projet)
        return projet
