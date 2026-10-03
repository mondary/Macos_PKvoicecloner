"""Projets de livres : import EPUB → chapitres (découpage, ancres, replis, HTTP)
et analyse IA (cast, tagage des voix) via un faux LLM — aucun appel réseau.
"""
import importlib.util
import io
import json
import os
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch

os.environ["PKVOICE_SKIP_MODEL_LOAD"] = "1"
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "server"))
spec = importlib.util.spec_from_file_location(
    "studio_server", Path(__file__).resolve().parents[2] / "src/server/serveur.py")
server = importlib.util.module_from_spec(spec)
spec.loader.exec_module(server)
from fastapi.testclient import TestClient  # noqa: E402

import ia  # noqa: E402
import livres  # noqa: E402
import laya_local  # noqa: E402

CHAPITRES = [
    ("Premier chapitre", [" ".join(f"mot{i}" for i in range(30)), " ".join(f"suite{i}" for i in range(30))]),
    ("Deuxième chapitre", [" ".join(f"plongee{i}" for i in range(30)), " ".join(f"retour{i}" for i in range(30))]),
    ("Troisième chapitre", [" ".join(f"final{i}" for i in range(30)), " ".join(f"epilogue{i}" for i in range(30))]),
]

CONTAINER = """<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
 <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>"""

XHTML = """<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>{titre}</title></head>
<body>{corps}</body></html>"""

NAV = """<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<body><nav epub:type="toc"><ol>{items}</ol></nav></body></html>"""

NCX = """<?xml version="1.0" encoding="utf-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
<head/><docTitle><text>{titre}</text></docTitle><navMap>{points}</navMap></ncx>"""


def _opf(titre, auteur, manifest, spine, attributs_spine=""):
    return f"""<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id">
 <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
  <dc:title>{titre}</dc:title><dc:creator>{auteur}</dc:creator>
  <dc:language>fr</dc:language><dc:identifier id="id">test</dc:identifier>
 </metadata>
 <manifest>{"".join(manifest)}</manifest>
 <spine{attributs_spine}>{"".join(spine)}</spine>
</package>"""


def _corps(titre, paragraphes):
    return f"<h1>{titre}</h1>" + "".join(f"<p>{p}</p>" for p in paragraphes)


def _zipp(fichiers):
    tampon = io.BytesIO()
    with zipfile.ZipFile(tampon, "w") as archive:
        archive.writestr("mimetype", "application/epub+zip", compress_type=zipfile.ZIP_STORED)
        for chemin, contenu in fichiers.items():
            archive.writestr(chemin, contenu)
    return tampon.getvalue()


def epub_par_fichiers(chapitres, titre="Le Livre de Test", auteur="Aurore Testeur", sommaire=True):
    """Un fichier XHTML par chapitre + nav EPUB3 (ou rien → repli sur le spine)."""
    fichiers = {"META-INF/container.xml": CONTAINER}
    manifest, spine, items = [], [], []
    for index, (nom, paragraphes) in enumerate(chapitres, 1):
        fichiers[f"OEBPS/chap{index}.xhtml"] = XHTML.format(titre=nom, corps=_corps(nom, paragraphes))
        manifest.append(f'<item id="c{index}" href="chap{index}.xhtml" media-type="application/xhtml+xml"/>')
        spine.append(f'<itemref idref="c{index}"/>')
        items.append(f'<li><a href="chap{index}.xhtml">{nom}</a></li>')
    if sommaire:
        fichiers["OEBPS/nav.xhtml"] = NAV.format(items="".join(items))
        manifest.append('<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>')
    fichiers["OEBPS/content.opf"] = _opf(titre, auteur, manifest, spine)
    return _zipp(fichiers)


def epub_par_ancres(chapitres):
    """Tout le livre dans un seul XHTML, chapitres repérés par ancre #id."""
    fichiers = {"META-INF/container.xml": CONTAINER}
    sections, items = [], []
    for index, (nom, paragraphes) in enumerate(chapitres, 1):
        sections.append(f'<section id="sec{index}">{_corps(nom, paragraphes)}</section>')
        items.append(f'<li><a href="livre.xhtml#sec{index}">{nom}</a></li>')
    fichiers["OEBPS/livre.xhtml"] = XHTML.format(titre="Livre entier", corps="".join(sections))
    fichiers["OEBPS/nav.xhtml"] = NAV.format(items="".join(items))
    fichiers["OEBPS/content.opf"] = _opf(
        "Livre en un fichier", "A. Ancres",
        ['<item id="livre" href="livre.xhtml" media-type="application/xhtml+xml"/>',
         '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>'],
        ['<itemref idref="livre"/>'])
    return _zipp(fichiers)


def epub_ncx(chapitres):
    """Sommaire EPUB2 (toc.ncx) au lieu du nav EPUB3."""
    fichiers = {"META-INF/container.xml": CONTAINER}
    manifest, spine, points = [], [], []
    for index, (nom, paragraphes) in enumerate(chapitres, 1):
        fichiers[f"OEBPS/chap{index}.xhtml"] = XHTML.format(titre=nom, corps=_corps(nom, paragraphes))
        manifest.append(f'<item id="c{index}" href="chap{index}.xhtml" media-type="application/xhtml+xml"/>')
        spine.append(f'<itemref idref="c{index}"/>')
        points.append(f'<navPoint id="n{index}"><navLabel><text>{nom}</text></navLabel>'
                      f'<content src="chap{index}.xhtml"/></navPoint>')
    manifest.append('<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>')
    fichiers["OEBPS/toc.ncx"] = NCX.format(titre="Livre EPUB2", points="".join(points))
    fichiers["OEBPS/content.opf"] = _opf("Livre EPUB2", "N. Ceyx", manifest, spine, attributs_spine=' toc="ncx"')
    return _zipp(fichiers)


class LivresContracts(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.patches = [patch.object(server, "LIVRES", self.root),
                        patch.object(server, "FICHIER_IA", self.root / "ia.json")]
        for p in self.patches:
            p.start()
        self.client = TestClient(server.app)

    def tearDown(self):
        self.client.close()
        for p in reversed(self.patches):
            p.stop()
        self.tmp.cleanup()

    def importer(self, brut, nom="livre.epub"):
        return self.client.post("/api/livres", files={"epub": (nom, brut, "application/epub+zip")})

    def test_import_decoupe_par_toc_et_expose_le_projet(self):
        reponse = self.importer(epub_par_fichiers(CHAPITRES))
        self.assertEqual(reponse.status_code, 200, reponse.text)
        livre = reponse.json()
        self.assertEqual(livre["titre"], "Le Livre de Test")
        self.assertEqual(livre["auteur"], "Aurore Testeur")
        self.assertEqual([c["titre"] for c in livre["chapitres"]],
                         ["Premier chapitre", "Deuxième chapitre", "Troisième chapitre"])
        self.assertTrue(all(c["mots"] >= 60 for c in livre["chapitres"]))
        self.assertEqual(livre["mots"], sum(c["mots"] for c in livre["chapitres"]))

        self.assertEqual(len(self.client.get("/api/livres").json()["livres"]), 1)
        self.assertEqual(self.client.get(f"/api/livres/{livre['id']}").json()["titre"], livre["titre"])
        chapitre = self.client.get(f"/api/livres/{livre['id']}/chapitre/2").json()
        self.assertIn("plongee0", chapitre["texte"])
        self.assertIn("plongee0", chapitre["texte_source"])
        self.assertEqual(chapitre["texte_source"], chapitre["texte"])
        self.assertNotIn("mot0", chapitre["texte"])          # pas de mélange avec le chapitre 1
        self.assertFalse(chapitre["texte"].startswith("#"))  # ligne de titre retirée du texte
        self.assertEqual(self.client.get(f"/api/livres/{livre['id']}/couverture").status_code, 404)

    def test_import_decoupe_un_fichier_par_ancres(self):
        livre = self.importer(epub_par_ancres(CHAPITRES)).json()
        titres = [c["titre"] for c in livre["chapitres"]]
        self.assertEqual(titres, ["Premier chapitre", "Deuxième chapitre", "Troisième chapitre"])
        premier = self.client.get(f"/api/livres/{livre['id']}/chapitre/1").json()["texte"]
        troisieme = self.client.get(f"/api/livres/{livre['id']}/chapitre/3").json()["texte"]
        self.assertIn("final0", troisieme)
        self.assertNotIn("final0", premier)

    def test_import_epub2_avec_ncx(self):
        livre = self.importer(epub_ncx(CHAPITRES[:2])).json()
        self.assertEqual([c["titre"] for c in livre["chapitres"]], ["Premier chapitre", "Deuxième chapitre"])

    def test_pages_trop_courtes_et_sommaire_ecartes(self):
        chapitres = [("Partie une", ["quelques mots seulement"])] + CHAPITRES[:2] + [
            ("Sommaire", [" ".join(f"entree{i}" for i in range(60))])]
        livre = self.importer(epub_par_fichiers(chapitres)).json()
        self.assertEqual([c["titre"] for c in livre["chapitres"]],
                         ["Premier chapitre", "Deuxième chapitre"])

    def test_repli_sans_sommaire_un_chapitre_par_fichier(self):
        livre = self.importer(epub_par_fichiers(CHAPITRES[:2], sommaire=False)).json()
        self.assertEqual([c["titre"] for c in livre["chapitres"]], ["Premier chapitre", "Deuxième chapitre"])

    def test_fichiers_invalides_refuses(self):
        self.assertEqual(self.importer(b"").status_code, 400)
        self.assertEqual(self.importer(b"ceci n est pas une archive").status_code, 400)
        zip_sans_manifest = _zipp({"rien.txt": "vide"})
        reponse = self.importer(zip_sans_manifest)
        self.assertEqual(reponse.status_code, 400)
        self.assertIn("EPUB", reponse.json()["detail"])

    def test_edition_de_chapitre_et_suppression_de_livre(self):
        livre = self.importer(epub_par_fichiers(CHAPITRES[:1])).json()
        texte = "Texte entièrement réécrit " + " ".join(f"neuf{i}" for i in range(50))
        reponse = self.client.put(f"/api/livres/{livre['id']}/chapitre/1", json={"texte": texte})
        self.assertEqual(reponse.status_code, 200, reponse.text)
        relu = self.client.get(f"/api/livres/{livre['id']}/chapitre/1").json()
        self.assertEqual(relu["texte"], texte.strip())
        self.assertGreaterEqual(relu["mots"], 51)
        self.assertEqual(self.client.get(f"/api/livres/{livre['id']}").json()["mots"], relu["mots"])
        self.assertEqual(self.client.put(f"/api/livres/{livre['id']}/chapitre/1",
                                         json={"texte": " "}).status_code, 400)
        self.assertEqual(self.client.delete(f"/api/livres/{livre['id']}").status_code, 200)
        self.assertEqual(self.client.get("/api/livres").json()["livres"], [])
        self.assertEqual(self.client.get(f"/api/livres/{livre['id']}").status_code, 404)

    def test_edition_renomme_aussi_le_titre_du_chapitre(self):
        livre = self.importer(epub_par_fichiers(CHAPITRES[:1])).json()
        reponse = self.client.put(f"/api/livres/{livre['id']}/chapitre/1",
                                  json={"texte": "Nouveau corps du chapitre " + " ".join(f"mot{i}" for i in range(50)),
                                        "titre": "Prologue"})
        self.assertEqual(reponse.status_code, 200, reponse.text)
        self.assertEqual(reponse.json()["titre"], "Prologue")
        self.assertEqual(self.client.get(f"/api/livres/{livre['id']}").json()["chapitres"][0]["titre"], "Prologue")
        # un titre vide ne doit pas écraser le titre existant
        relu = self.client.put(f"/api/livres/{livre['id']}/chapitre/1",
                               json={"texte": "Corps " + " ".join(f"mot{i}" for i in range(50)), "titre": "  "})
        self.assertEqual(relu.json()["titre"], "Prologue")

    def test_scission_de_chapitre_renumerote_les_suivants(self):
        livre = self.importer(epub_par_fichiers(CHAPITRES)).json()
        texte = self.client.get(f"/api/livres/{livre['id']}/chapitre/2").json()["texte"]
        position = texte.index("plongee0")                      # début du 2e paragraphe
        mots_avant = self.client.get(f"/api/livres/{livre['id']}").json()["mots"]
        reponse = self.client.post(f"/api/livres/{livre['id']}/chapitre/2/scinder",
                                   json={"texte": texte, "position": position,
                                         "titre1": "Avant la plongée", "titre2": "La plongée"})
        self.assertEqual(reponse.status_code, 200, reponse.text)
        projet = reponse.json()
        self.assertEqual([c["num"] for c in projet["chapitres"]], [1, 2, 3, 4])
        self.assertEqual(projet["chapitres"][1]["titre"], "Avant la plongée")
        self.assertEqual(projet["chapitres"][2]["titre"], "La plongée")
        self.assertEqual(projet["chapitres"][3]["titre"], "Troisième chapitre")
        deuxieme = self.client.get(f"/api/livres/{livre['id']}/chapitre/2").json()["texte"]
        troisieme = self.client.get(f"/api/livres/{livre['id']}/chapitre/3").json()["texte"]
        self.assertNotIn("plongee0", deuxieme)
        self.assertIn("plongee0", troisieme)
        self.assertEqual(projet["mots"], mots_avant)            # rien de perdu ni dupliqué

    def test_scission_refuse_les_positions_invalides(self):
        livre = self.importer(epub_par_fichiers(CHAPITRES[:1])).json()
        texte = self.client.get(f"/api/livres/{livre['id']}/chapitre/1").json()["texte"]
        for position in (-5, 0, len(texte) + 10):
            reponse = self.client.post(f"/api/livres/{livre['id']}/chapitre/1/scinder",
                                       json={"texte": texte, "position": position})
            self.assertEqual(reponse.status_code, 400, reponse.text)
        self.assertEqual(self.client.post(f"/api/livres/{livre['id']}/chapitre/9/scinder",
                                          json={"texte": texte, "position": 5}).status_code, 404)

    def test_renommage_de_livre(self):
        livre = self.importer(epub_par_fichiers(CHAPITRES[:1])).json()
        reponse = self.client.post(f"/api/livres/{livre['id']}/renommer",
                                   json={"titre": "Étoiles, garde-à-vous", "auteur": "Robert A. Heinlein"})
        self.assertEqual(reponse.status_code, 200, reponse.text)
        relu = self.client.get(f"/api/livres/{livre['id']}").json()
        self.assertEqual(relu["titre"], "Étoiles, garde-à-vous")
        self.assertEqual(relu["auteur"], "Robert A. Heinlein")
        self.assertEqual(self.client.post(f"/api/livres/{livre['id']}/renommer",
                                          json={"titre": "  "}).status_code, 400)
        self.assertEqual(self.client.post(f"/api/livres/{livre['id']}/renommer",
                                          json={}).status_code, 400)

    def test_identifiants_malformes_rejetes(self):
        for chemin in ("/api/livres/abc", "/api/livres/abc/chapitre/1",
                       "/api/livres/ZZZ0ZZZ0ZZZ0/couverture",
                       "/api/livres/1234567890ab/chapitre/1"):
            self.assertIn(self.client.get(chemin).status_code, (404, 422), chemin)


# --------------------------------------------------------------- analyse IA

def faux_llm(cfg, messages, **kwargs):
    """Faux LLM : répond selon la TÂCHE marquée dans le prompt (corps complet + usage)."""
    prompt = messages[-1]["content"]

    def corps(contenu):
        return {"choices": [{"message": {"role": "assistant", "content": contenu}}],
                "usage": {"prompt_tokens": 90, "completion_tokens": 10, "total_tokens": 100}}

    if "TÂCHE: CAST" in prompt:
        return corps(json.dumps({"cast": [
            {"id": "narrateur", "nom": "Narrateur", "genre": "femme", "role": "narrateur",
             "description": "", "importance": "principal"},
            {"id": "marc", "nom": "Marc", "genre": "homme", "role": "personnage",
             "description": "Capitaine", "importance": "principal"},
            {"id": "lea", "nom": "Léa", "genre": "femme", "role": "personnage",
             "description": "", "importance": "secondaire"},
        ]}))
    if "TÂCHE: TAGAGE" in prompt:
        morceau = prompt.split("<<<\n", 1)[1].split("\n>>>", 1)[0]
        lignes = []
        for index, ligne in enumerate(morceau.splitlines()):
            if ligne.strip():
                lignes.append(("///narrateur " if index == 0 else "///marc ") + ligne.strip())
        lignes.append("///np1 Attendez-moi !")
        return corps("\n".join(lignes))
    if "TÂCHE: GENRES" in prompt:
        return corps(json.dumps({"np1": "homme"}))
    raise AssertionError(f"prompt inattendu : {prompt[:80]}")


class AnalyseContracts(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.patches = [
            patch.object(server, "LIVRES", self.root),
            patch.object(server, "FICHIER_IA", self.root / "ia.json"),
            patch.object(livres.ia, "appeler", faux_llm),
        ]
        for p in self.patches:
            p.start()
        self.client = TestClient(server.app)
        self.cfg = {"base_url": "https://exemple.test/v1", "cle": "sk-test", "modele": "faux"}

    def tearDown(self):
        self.client.close()
        for p in reversed(self.patches):
            p.stop()
        self.tmp.cleanup()

    def livre(self, chapitres=CHAPITRES[:2]):
        reponse = self.client.post("/api/livres", files={
            "epub": ("livre.epub", epub_par_fichiers(chapitres), "application/epub+zip")})
        self.assertEqual(reponse.status_code, 200, reponse.text)
        return reponse.json()

    def test_config_ia_masque_la_cle(self):
        self.assertEqual(self.client.get("/api/ia/config").json()["configuree"], False)
        reponse = self.client.post("/api/ia/config", json={
            "base_url": "https://api.z.ai/api/coding/paas/v4/chat/completions", "cle": "abcd1234efgh", "modele": "glm-5.3-flash"})
        self.assertEqual(reponse.status_code, 200, reponse.text)
        relue = self.client.get("/api/ia/config").json()
        self.assertEqual(relue["configuree"], True)
        # l'URL complète doit être normalisée en URL de base (le suffixe est rajouté aux appels)
        self.assertEqual(relue["base_url"], "https://api.z.ai/api/coding/paas/v4")
        self.assertEqual(relue["modele"], "glm-5.3-flash")
        self.assertNotIn("abcd1234efgh", json.dumps(relue))
        self.assertEqual(relue["cle_masquee"], "…efgh")
        self.assertEqual(self.client.post("/api/ia/config", json={"base_url": "ftp://non"}).status_code, 400)

    def test_profils_ia_crud_et_ollama_sans_cle(self):
        premier = self.client.post("/api/ia/profils", json={
            "nom": "Ollama local", "base_url": "http://localhost:11434/v1", "modele": "qwen3:4b", "cle": ""})
        self.assertEqual(premier.status_code, 200, premier.text)
        profil = premier.json()
        self.assertTrue(profil["configure"])
        self.assertEqual(profil["cle_masquee"], "clé locale")
        distant = self.client.post("/api/ia/profils", json={
            "nom": "Cloud test", "base_url": "https://api.example.test/v1", "modele": "test", "cle": "secret123"})
        self.assertEqual(distant.status_code, 200, distant.text)
        self.assertNotIn("secret123", json.dumps(distant.json()))
        self.assertEqual(self.client.post(f"/api/ia/profils/{distant.json()['id']}/activer").status_code, 200)
        self.assertEqual(self.client.get("/api/ia/profils").json()["actif"], distant.json()["id"])
        self.assertEqual(self.client.delete(f"/api/ia/profils/{distant.json()['id']}").status_code, 200)
        self.assertEqual(self.client.get("/api/ia/profils").json()["actif"], profil["id"])

    def test_tester_ia(self):
        self.assertEqual(self.client.post("/api/ia/tester").status_code, 400)
        self.client.post("/api/ia/config", json={
            "base_url": "https://exemple.test/v1", "cle": "sk-x", "modele": "faux"})
        with patch.object(server.ia, "completer", return_value=" ok "):
            reponse = self.client.post("/api/ia/tester")
        self.assertEqual(reponse.status_code, 200, reponse.text)
        self.assertEqual(reponse.json()["reponse"], "ok")

    def test_analyse_complete_cast_et_voix_par_chapitre(self):
        livre = self.livre()
        projet = livres.analyser_livre(self.root, livre["id"], self.cfg)
        self.assertEqual(projet["analyse"]["etat"], "faite")
        cast = {v["id"]: v for v in projet["cast"]}
        self.assertIn("narrateur", cast)
        self.assertEqual(cast["marc"]["genre"], "homme")
        self.assertEqual(cast["lea"]["genre"], "femme")
        self.assertEqual(cast["np1"]["genre"], "homme")           # découvert puis classé
        self.assertEqual(cast["np1"]["nom"], "Voix inconnue 1")   # pas de « Np1 » cryptique
        for chapitre in projet["chapitres"]:
            self.assertEqual(chapitre["analyse"], "faite")
            self.assertEqual(chapitre["voix"], ["narrateur", "marc", "np1"])
        texte = self.client.get(f"/api/livres/{livre['id']}/chapitre/1").json()["texte"]
        self.assertTrue(texte.startswith("///narrateur"))
        self.assertIn("///marc mot0 mot1", texte)                # texte original préservé
        # le tagage ne change pas le décompte de mots (les tags ne comptent pas)
        mots_avant = next(c["mots"] for c in livre["chapitres"] if c["num"] == 1)
        mots_apres = next(c["mots"] for c in projet["chapitres"] if c["num"] == 1)
        self.assertEqual(mots_avant, mots_apres)
        self.assertEqual(mots_apres, livres._compte_mots(texte.rsplit("\n///np1", 1)[0]))
        # tokens consommés : cast + 2 tagages + classement = 4 appels × 100 tokens
        self.assertEqual(projet["analyse"]["tokens"], 400)
        self.assertEqual(projet["tokens_ia"], 400)
        # le narrateur détecté en anglais reste un rôle unique
        self.assertNotIn("narrator", {v["id"] for v in projet["cast"]})

    def test_reanalyse_retagge_sans_cumuler_les_tags(self):
        livre = self.livre(CHAPITRES[:1])
        livres.analyser_livre(self.root, livre["id"], self.cfg)
        livres.analyser_livre(self.root, livre["id"], self.cfg, forcer=True)
        texte = self.client.get(f"/api/livres/{livre['id']}/chapitre/1").json()["texte"]
        self.assertNotIn("///narrateur ///", texte)   # pas de tag cumulé à la ré-analyse
        self.assertNotIn("[narrateur] [", texte)      # l'ancien format n'en embrique pas non plus

    def test_analyse_un_seul_chapitre_puis_reprise(self):
        livre = self.livre()
        projet = livres.analyser_livre(self.root, livre["id"], self.cfg, numeros=[1])
        self.assertEqual([c.get("analyse") for c in projet["chapitres"]], ["faite", None])
        projet = livres.analyser_livre(self.root, livre["id"], self.cfg)      # reprise : ch2 seul
        self.assertEqual([c.get("analyse") for c in projet["chapitres"]], ["faite", "faite"])

    def test_reanalyse_un_chapitre_conserve_le_cast(self):
        """Re-tagger un chapitre précis ne doit pas refaire la distribution :
        les identifiants de voix resteraient sinon incohérents entre chapitres."""
        livre = self.livre(CHAPITRES[:2])
        livres.analyser_livre(self.root, livre["id"], self.cfg)
        cast_initial = livres.lire(self.root, livre["id"])["cast"]
        self.assertEqual(len(cast_initial), 4)          # narrateur + marc + lea + np1

        appels = {"cast": 0}
        dorigine = livres.ia.appeler

        def compteur(cfg, messages, **kwargs):
            if "TÂCHE: CAST" in messages[-1]["content"]:
                appels["cast"] += 1
            return dorigine(cfg, messages, **kwargs)

        with patch.object(livres.ia, "appeler", compteur):
            livres.analyser_livre(self.root, livre["id"], self.cfg, numeros=[1], forcer=True)
        self.assertEqual(appels["cast"], 0)             # aucun nouvel appel de distribution
        cast_conserve = livres.lire(self.root, livre["id"])["cast"]
        self.assertEqual([v["id"] for v in cast_conserve], [v["id"] for v in cast_initial])

        with patch.object(livres.ia, "appeler", compteur):
            livres.analyser_livre(self.root, livre["id"], self.cfg, forcer=True)   # livre entier
        self.assertEqual(appels["cast"], 1)             # là, la distribution est refaite

    def test_erreur_ia_visible_dans_le_projet(self):
        livre = self.livre(CHAPITRES[:1])
        avec_erreur = patch.object(livres.ia, "appeler",
                                   side_effect=ia.IaErreur("quota dépassé"))
        with avec_erreur:
            projet = livres.analyser_livre(self.root, livre["id"], self.cfg)
        self.assertEqual(projet["analyse"]["etat"], "erreur")
        self.assertIn("quota", projet["analyse"]["erreur"])
        relu = self.client.get(f"/api/livres/{livre['id']}").json()
        self.assertEqual(relu["analyse"]["etat"], "erreur")

    def test_endpoint_analyse_sans_config_refuse(self):
        livre = self.livre(CHAPITRES[:1])
        self.assertEqual(self.client.post(f"/api/livres/{livre['id']}/analyser", json={}).status_code, 400)

    def test_endpoint_analyse_tache_de_fond_et_409(self):
        livre = self.livre(CHAPITRES[:1])
        self.client.post("/api/ia/config", json={
            "base_url": "https://exemple.test/v1", "cle": "sk-x", "modele": "faux"})
        with patch.object(server.threading, "Thread") as thread:
            reponse = self.client.post(f"/api/livres/{livre['id']}/analyser", json={})
            self.assertEqual(reponse.status_code, 202, reponse.text)
            thread.return_value.start.assert_called_once()
        server.analyses_en_cours.add(livre["id"])
        self.assertEqual(self.client.post(f"/api/livres/{livre['id']}/analyser", json={}).status_code, 409)
        self.assertEqual(self.client.delete(f"/api/livres/{livre['id']}").status_code, 409)
        server.analyses_en_cours.discard(livre["id"])

    def test_analyses_en_cours_reparees_au_demarrage(self):
        """Une analyse restée « en_cours » après un arrêt du serveur doit devenir
        « interrompue » (reprise possible) au lieu de bloquer en 409 fantôme."""
        livre = self.livre(CHAPITRES[:2])
        projet = livres.lire(self.root, livre["id"])
        projet["analyse"] = {"etat": "en_cours", "courant": 1, "total": 2}
        projet["chapitres"][0]["analyse"] = "faite"
        livres._ecrire_projet(self.root, livre["id"], projet)

        nombre = livres.reparer_analyses_interrompues(self.root)
        self.assertEqual(nombre, 1)
        repris = livres.lire(self.root, livre["id"])
        self.assertEqual(repris["analyse"]["etat"], "interrompue")
        self.assertIn("1/2 chapitres", repris["analyse"]["erreur"])

        # et l'endpoint n'oppose plus de 409 : l'analyse repart (chapitre 2 seul)
        self.client.post("/api/ia/config", json={
            "base_url": "https://exemple.test/v1", "cle": "sk-x", "modele": "faux"})
        reponse = self.client.post(f"/api/livres/{livre['id']}/analyser", json={})
        self.assertEqual(reponse.status_code, 202, reponse.text)

    def test_decoupage_et_comptage(self):
        self.assertEqual(livres._compte_mots("[marc] un deux trois"), 3)
        decoupe = livres._decouper_analyse("p1 " * 400 + "\n\n" + "p2 " * 400, taille=1000)
        self.assertGreaterEqual(len(decoupe), 2)
        self.assertTrue(all(len(m) <= 2000 for m in decoupe))
        self.assertEqual(livres._decouper_phrases("Il entre. Elle répond : « Bonjour ! » Le feu baisse."),
                         ["Il entre.", "Elle répond : « Bonjour ! »", "Le feu baisse."])
        self.assertEqual(livres.voix_du_texte("[marc] a\n[narrateur] b\n[marc] c"),
                         ["narrateur", "marc"])
        self.assertEqual(livres.voix_du_texte("///marc a\n///narrateur b\n///marc c"),
                         ["narrateur", "marc"])
        self.assertEqual(livres.voix_du_texte("[marc] a\n///narrateur b\n///marc c"),
                         ["narrateur", "marc"])                 # les deux formats cohabitent
        self.assertEqual(livres._compte_mots("[marc] un deux\n///lea trois"), 3)
        self.assertEqual(livres._slug("Léa-Marie Östër"), "lea-marie-oster")
        self.assertEqual(livres._slug("Narrator"), "narrateur")

    def test_verifier_attribution_laya(self):
        class AgentFaux:
            def predict(self, state, questions):
                return {"answers": {"dialogue": {"noul": 0.9 if "«" in state else 0.1,
                                                 "confidence": 0.8}}}

        segments = [
            ("narrateur", "Il tourna la page."),
            ("narrateur", "Elle souffla : « pars vite »."),
            ("marc", "Attends-moi !"),
        ]
        resultats = laya_local.verifier_segments(segments, agent=AgentFaux())
        self.assertEqual([r["num"] for r in resultats], [1, 2, 3])
        self.assertFalse(resultats[0]["dialogue"])          # récit, probabilité 0.1
        self.assertTrue(resultats[1]["dialogue"])           # dialogue suspecté sur le narrateur
        self.assertFalse(resultats[2]["verifie"])           # un personnage n'est pas interrogé
        self.assertRaises(RuntimeError, laya_local.verifier_segments, segments, agent=None)


if __name__ == "__main__":
    unittest.main()
