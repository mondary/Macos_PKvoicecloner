"""Projets de livres : import EPUB → chapitres (découpage, ancres, replis, HTTP).

Les EPUB de test sont fabriqués en mémoire (zipfile) — aucun fichier réel requis.
"""
import importlib.util
import io
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
        self.patches = [patch.object(server, "LIVRES", self.root)]
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


if __name__ == "__main__":
    unittest.main()
