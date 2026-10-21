"""HTTP contracts against temporary storage; no model download or user-data changes."""
import importlib.util
import io
import json
import os
import sys
import time
import types
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

os.environ['PKVOICE_SKIP_MODEL_LOAD'] = '1'
spec = importlib.util.spec_from_file_location('studio_server', Path(__file__).resolve().parents[2] / 'src/server/serveur.py')
server = importlib.util.module_from_spec(spec)
spec.loader.exec_module(server)
from fastapi.testclient import TestClient
import numpy as np
import soundfile as sf


class StudioContracts(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.patches = [patch.object(server, 'VOIX', self.root),
                        patch.object(server, 'SORTIES', self.root),
                        patch.object(server, 'ALIAS_FILE', self.root / 'aliases.json'),
                        patch.object(server, '_cache_modele', lambda repo: self.root / repo.replace('/', '--'))]
        for p in self.patches: p.start()
        server.voix_courante.clear(); server.jobs.clear(); server.installations.clear(); server.transcripts.clear()
        server.PIPER_VOIX.clear()          # une voix Piper gardée chaude ne doit pas fuir d'un test à l'autre
        server.modele = None; server.moteur_pret = None; server.erreur_modele = None
        server.moteur_actif = 'voxcpm2'; server.moteur_eteint = False; server._piper_catalogue_cache = None
        self.client = TestClient(server.app)

    def tearDown(self):
        self.client.close()
        for p in reversed(self.patches): p.stop()
        self.tmp.cleanup()

    def test_etat_exposes_running_version(self):
        version = self.client.get('/api/etat').json()['version']
        self.assertIsInstance(version, str)
        self.assertRegex(version, r'^\d+\.\d+\.\d+$')
        self.assertEqual(version, server.VERSION)

    def test_audio_import_select_rename_preview_delete(self):
        audio = io.BytesIO()
        sf.write(audio, np.zeros(1600), 16000, format='WAV')
        with patch.object(server, 'transcrire', return_value='Bonjour le studio'):
            result = self.client.post('/api/voix', files={'audio': ('reference.wav', audio.getvalue(), 'audio/wav')})
        self.assertEqual(result.status_code, 200, result.text)
        vid = result.json()['id']
        self.assertEqual(self.client.get('/api/voix').json()['voix'][0]['transcript'], 'Bonjour le studio')
        self.assertEqual(self.client.post(f'/api/voix/{vid}/choisir').status_code, 200)
        self.assertEqual(self.client.get(f'/api/voix/{vid}/wav').headers['content-type'], 'audio/wav')
        self.assertEqual(self.client.post(f'/api/voix/{vid}/renommer', json={'nom': 'Référence test'}).status_code, 200)
        self.assertEqual(self.client.get('/api/voix').json()['voix'][0]['nom'], 'Référence test')
        self.assertEqual(self.client.delete(f'/api/voix/{vid}').status_code, 200)
        self.assertEqual(self.client.get('/api/voix').json()['voix'], [])
        self.assertFalse(server.voix_courante)

    def test_import_reports_invalid_audio(self):
        self.assertEqual(self.client.post('/api/voix', files={'audio': ('empty.wav', b'')}).status_code, 400)
        response = self.client.post('/api/voix', files={'audio': ('bad.wav', b'not audio')})
        self.assertEqual(response.status_code, 400)
        self.assertIn('Conversion', response.json()['detail'])

    def test_transcription_engine_selection_is_explicit_and_offline_for_whisper(self):
        (self.root / 'data').mkdir(exist_ok=True)
        (self.root / 'data/moteurs_actifs.json').write_text('{"transcription":"whisper"}')
        with patch.object(server, 'PROJET', self.root), \
             patch.object(server.subprocess, 'run', return_value=subprocess.CompletedProcess([], 0, 'Bonjour', '')) as run:
            self.assertEqual(server.transcrire(self.root / 'clip.wav'), 'Bonjour')
        self.assertEqual(run.call_args.args[0][-1], 'whisper')
        self.assertEqual(run.call_args.kwargs['env']['HF_HUB_OFFLINE'], '1')

    def test_unknown_transcription_engine_fails_clearly(self):
        (self.root / 'data').mkdir(exist_ok=True)
        (self.root / 'data/moteurs_actifs.json').write_text('{"transcription":"unknown"}')
        with patch.object(server, 'PROJET', self.root):
            with self.assertRaisesRegex(RuntimeError, 'aucun modèle de transcription actif'):
                server.transcrire(self.root / 'clip.wav')
        # un modèle explicitement désactivé produit le même message clair
        (self.root / 'data/moteurs_actifs.json').write_text('{"transcription":null}')
        with patch.object(server, 'PROJET', self.root):
            with self.assertRaisesRegex(RuntimeError, 'aucun modèle de transcription actif'):
                server.transcrire(self.root / 'clip.wav')

    def test_desactivation_modele_eteint_le_moteur(self):
        server.moteur_actif = 'voxcpm2'; server.moteur_pret = 'voxcpm2'; server.modele = object()
        self.assertTrue(self.client.get('/api/etat').json()['modele'])
        response = self.client.post('/api/modeles/voxcpm2/desactiver')
        self.assertEqual(response.status_code, 200, response.text)
        self.assertIsNone(server.modele)
        self.assertIsNone(server.moteur_pret)
        self.assertFalse(self.client.get('/api/etat').json()['modele'])
        self.assertEqual(self.client.post('/api/modeles/inconnu/desactiver').status_code, 404)

    def test_generation_refusee_sans_moteur_charge(self):
        self.assertEqual(self.client.post('/api/generer', json={'texte': 'Bonjour', 'tonalite': 99}).status_code, 400)
        self.assertEqual(self.client.post('/api/generer', json={'texte': 'Bonjour', 'tonalite': 'haut'}).status_code, 400)
        audio = io.BytesIO(); sf.write(audio, np.zeros(1600), 16000, format='WAV')
        with patch.object(server, 'transcrire', return_value='Bonjour'):
            vid = self.client.post('/api/voix', files={'audio': ('reference.wav', audio.getvalue(), 'audio/wav')}).json()['id']
        self.assertEqual(self.client.post(f'/api/voix/{vid}/choisir').status_code, 200)
        server.modele = None; server.moteur_pret = None
        with patch.object(server.threading, 'Thread') as thread:
            reponse = self.client.post('/api/generer', json={'texte': 'Bonjour le monde'})
            self.assertEqual(reponse.status_code, 200, reponse.text)
            thread.return_value.start.assert_called()        # le moteur manquant se charge en fond
        # « Désactiver veut dire éteint » : un arrêt explicite refuse la génération
        server.moteur_eteint = True
        reponse = self.client.post('/api/generer', json={'texte': 'Bonjour le monde'})
        self.assertEqual(reponse.status_code, 409)
        self.assertIn('aucun moteur', reponse.json()['detail'])

    def test_desactivation_transcription_efface_le_moteur_actif(self):
        (self.root / 'data').mkdir(exist_ok=True)
        (self.root / 'data/moteurs_actifs.json').write_text('{"transcription":"whisper"}')
        server.moteur_asr = 'whisper'
        with patch.object(server, 'PROJET', self.root):
            reponse = self.client.post('/api/modeles/whisper-large-v3/desactiver')
        self.assertEqual(reponse.status_code, 200, reponse.text)
        self.assertIsNone(json.loads((self.root / 'data/moteurs_actifs.json').read_text())['transcription'])
        self.assertIsNone(server.moteur_asr)

    def test_filtres_audio_vitesse_et_tonalite(self):
        self.assertEqual(server._filtres_audio(1.0, 0.0, 1.0, 16000), [])
        self.assertEqual(server._filtres_audio(1.2, 0.0, 1.2, 16000), ['atempo=1.200000'])
        # Piper : la vitesse est déjà native (length_scale), pas de double atempo
        self.assertEqual(server._filtres_audio(1.2, 0.0, 1.0, 16000), [])
        haut = server._filtres_audio(1.0, 12.0, 1.0, 16000)
        self.assertEqual(haut, ['asetrate=32000', 'aresample=16000', 'atempo=0.500000'])
        # au-delà de 2×, atempo se chaîne au lieu de dépasser sa plage
        self.assertEqual(server._filtres_audio(2.5, 0.0, 2.5, 16000), ['atempo=2.0', 'atempo=1.250000'])
        self.assertEqual(server._filtres_audio(0.4, 0.0, 0.4, 16000), ['atempo=0.5', 'atempo=0.800000'])

    def test_desactivation_veut_dire_eteint(self):
        server.moteur_actif = 'piper'; server.moteur_pret = 'piper'; server.modele = {'voix': {}}
        self.assertEqual(self.client.post('/api/modeles/piper/desactiver').status_code, 200)
        self.assertTrue(server.moteur_eteint)
        # même une voix Piper ne relance rien implicitement : message clair
        with patch.object(server, '_piper_voix_installees',
                          return_value={'fr_FR-siwis-medium': {'onnx': 'x', 'config': 'y', 'taille_mo': 1}}):
            reponse = self.client.post('/api/generer', json={
                'texte': 'Bonjour', 'piper_voix': 'fr_FR-siwis-medium'})
        self.assertEqual(reponse.status_code, 409)
        self.assertIn('aucun moteur', reponse.json()['detail'])
        # une activation explicite rouvre la voie (le chargement réel est simulé)
        with patch.object(server, 'charger_modele', lambda moteur: None):
            self.assertEqual(self.client.post('/api/moteur', json={'moteur': 'piper'}).status_code, 202)
        self.assertFalse(server.moteur_eteint)

    def test_genre_piper_devine_par_nom(self):
        self.assertEqual(server._genre_piper('fr_FR-siwis-medium'), 'femme')
        self.assertEqual(server._genre_piper('fr_FR-upmc-medium', 'pierre'), 'homme')
        self.assertEqual(server._genre_piper('fr_FR-upmc-medium', 'jessica'), 'femme')
        self.assertEqual(server._genre_piper('fr_FR-mls-medium'), 'inconnu')

    def test_attribution_auto_par_genre_puis_reutilisation(self):
        projet = {"cast": [
            {"id": "narrateur", "nom": "Narrateur", "role": "narrateur", "genre": "femme", "importance": "principal"},
            {"id": "marc", "nom": "Marc", "role": "personnage", "genre": "homme", "importance": "principal"},
            {"id": "lea", "nom": "Léa", "role": "personnage", "genre": "femme", "importance": "secondaire"},
            {"id": "np1", "nom": "Voix inconnue 1", "role": "personnage", "genre": "homme", "importance": "figurant"},
        ], "voix_assignees": {}}
        candidats = [{"ref": "clone-f", "nom": "Narratrice", "genre": "femme", "famille": "clone"},
                     {"ref": "piper:fr_FR-upmc-medium:1", "nom": "upmc · pierre", "genre": "homme", "famille": "piper"}]
        with patch.object(server, '_candidats_voix', return_value=candidats):
            rapport = server._attribution_auto(projet)
        self.assertEqual(rapport, {"attribues": 2, "reutilisations": 2, "manquants": 0})
        # chaque rôle reçoit une voix de son genre, le narrateur d'abord
        self.assertEqual(projet["voix_assignees"]["narrateur"], "clone-f")
        self.assertEqual(projet["voix_assignees"]["marc"], "piper:fr_FR-upmc-medium:1")
        self.assertEqual(projet["voix_assignees"]["lea"], "clone-f")
        self.assertEqual(projet["voix_assignees"]["np1"], "piper:fr_FR-upmc-medium:1")
        # une association manuelle est conservée et réserve sa voix
        projet2 = {"cast": projet["cast"], "voix_assignees": {"marc": "clone-f"}}
        with patch.object(server, '_candidats_voix', return_value=candidats):
            rapport2 = server._attribution_auto(projet2)
        self.assertEqual(projet2["voix_assignees"]["marc"], "clone-f")
        self.assertEqual(rapport2["attribues"], 1)
        self.assertEqual(rapport2["reutilisations"], 2)
        # sans voix disponible, on le dit au lieu d'inventer
        with patch.object(server, '_candidats_voix', return_value=[]):
            self.assertEqual(server._attribution_auto({"cast": projet["cast"], "voix_assignees": {}}),
                             {"attribues": 0, "reutilisations": 0, "manquants": 4})
        # pas de voix libre du bon genre : réutiliser plutôt que trahir le genre
        projet3 = {"cast": [
            {"id": "a", "nom": "A", "role": "personnage", "genre": "homme", "importance": "principal"},
            {"id": "b", "nom": "B", "role": "personnage", "genre": "homme", "importance": "secondaire"},
        ], "voix_assignees": {}}
        candidats3 = [{"ref": "h1", "nom": "Pierre", "genre": "homme", "famille": "piper"},
                      {"ref": "f1", "nom": "Jessica", "genre": "femme", "famille": "piper"}]
        with patch.object(server, '_candidats_voix', return_value=candidats3):
            rapport3 = server._attribution_auto(projet3)
        self.assertEqual(projet3["voix_assignees"], {"a": "h1", "b": "h1"})
        self.assertEqual(rapport3["reutilisations"], 1)
        self.assertEqual(projet3["auto_assigne"], ["a", "b"])
        # une attribution automatique précédente est recalculée, une manuelle est gardée
        projet4 = {"cast": projet3["cast"], "voix_assignees": {"a": "f1", "b": "h1"},
                   "auto_assigne": ["a"]}
        with patch.object(server, '_candidats_voix', return_value=candidats3):
            server._attribution_auto(projet4)
        self.assertEqual(projet4["voix_assignees"], {"a": "h1", "b": "h1"})
        self.assertEqual(projet4["auto_assigne"], ["a"])

    def test_model_catalogue_install_rename_delete(self):
        models = self.client.get('/api/modeles').json()['modeles']
        self.assertEqual(len(models), 8)
        self.assertTrue(all(not m['installe'] for m in models))
        for model in models:
            mid = model['id']
            with patch.object(server.threading, 'Thread') as thread:
                response = self.client.post(f'/api/modeles/{mid}/installer')
                self.assertEqual(response.status_code, 202)
                thread.return_value.start.assert_called_once()
            self.assertEqual(self.client.delete(f'/api/modeles/{mid}').status_code, 409)
            server.installations[mid] = {'etat': 'pret'}
            cache = server._cache_modele(model['repo']); cache.mkdir()
            (cache / 'test-weight').write_text('test')
            self.assertEqual(self.client.post(f'/api/modeles/{mid}/renommer', json={'nom': 'Mon moteur'}).status_code, 200)
            self.assertEqual(next(m for m in self.client.get('/api/modeles').json()['modeles'] if m['id'] == mid)['label'], 'Mon moteur')
            supprime = self.client.delete(f'/api/modeles/{mid}')
            self.assertEqual(supprime.status_code, 200, supprime.text)
            self.assertFalse(cache.exists())

    def test_model_catalogue_groups_and_activation_persists_asr_choice(self):
        models = self.client.get('/api/modeles').json()['modeles']
        self.assertEqual({m['categorie'] for m in models}, {'tts', 'transcription', 'categorisation'})
        with patch.object(server, 'PROJET', self.root), patch.object(server, '_est_installe', return_value=True):
            response = self.client.post('/api/modeles/parakeet-redux/activer')
            self.assertEqual(response.status_code, 202, response.text)
            active = server.json.loads((self.root / 'data/moteurs_actifs.json').read_text())
        self.assertEqual(active['transcription'], 'parakeet-redux')

    def test_cached_model_still_installs_missing_python_package(self):
        cache = server._cache_modele('openbmb/VoxCPM2')
        blobs = cache / 'blobs'
        blobs.mkdir(parents=True)
        (blobs / 'weights').write_bytes(b'x' * 50_000_001)
        with patch.object(server.importlib.util, 'find_spec', return_value=None), \
             patch.object(server.threading, 'Thread') as thread:
            response = self.client.post('/api/modeles/voxcpm2/installer')
        self.assertEqual(response.status_code, 202)
        thread.return_value.start.assert_called_once()

    def test_install_uses_vendored_editable_and_refreshes_import_caches(self):
        captured = {}

        def fake_run(args, **kwargs):
            captured['args'] = args
            return subprocess.CompletedProcess(args, 0, '', '')

        with patch.object(server.importlib.util, 'find_spec', return_value=None), \
             patch.object(server.subprocess, 'run', side_effect=fake_run), \
             patch.object(server.importlib, 'invalidate_caches') as invalide, \
             patch.object(server, '_est_installe', return_value=True):
            server._installer_modele('voxcpm2')
        self.assertIn('-e', captured['args'])
        self.assertTrue(captured['args'][-1].endswith('vendor/VoxCPM'))
        invalide.assert_called_once()
        self.assertEqual(server.installations['voxcpm2']['etat'], 'pret')

    def test_failed_model_is_reported_and_generation_rejected(self):
        with patch.dict(server.CHARGEURS, {'voxcpm2': lambda: (_ for _ in ()).throw(RuntimeError('poids absents'))}):
            server.charger_modele('voxcpm2')
        self.assertEqual(self.client.get('/api/etat').json()['erreur'], 'poids absents')
        server.voix_courante.update({'id': 'test', 'wav': self.root / 'ref.wav'})
        response = self.client.post('/api/generer', json={'texte': 'Bonjour'})
        self.assertEqual(response.status_code, 503)
        self.assertIn('poids absents', response.json()['detail'])

    def test_generation_uses_snapshot_and_produces_downloadable_wav(self):
        class FakeModel:
            class tts_model: sample_rate = 16000
            def generate(self, **kwargs):
                self.reference = kwargs['reference_wav_path']
                return np.zeros(1600)
        server.modele = FakeModel(); server.moteur_actif = server.moteur_pret = 'voxcpm2'
        server.voix_courante.update({'wav': self.root / 'original.wav', 'transcript': 'Bonjour'})
        with patch.object(server.threading, 'Thread') as thread:
            response = self.client.post('/api/generer', json={'texte': 'Bonjour', 'vitesse': 1.1})
            self.assertEqual(response.status_code, 200)
            args = thread.call_args.kwargs['args']
        server.voix_courante['wav'] = self.root / 'different.wav'
        server.executer_generation(*args)
        job = self.client.get('/api/job/' + response.json()['job']).json()
        self.assertEqual(job['etat'], 'pret', job)
        self.assertEqual(server.modele.reference, str(self.root / 'original.wav'))
        wav = self.client.get('/api/audio/' + job['fichier'])
        self.assertEqual(wav.status_code, 200)
        self.assertGreater(len(wav.content), 44)

    def test_destructive_actions_and_engine_switch_refuse_busy_generation(self):
        server.jobs['busy'] = {'etat': 'generation'}
        self.assertEqual(self.client.delete('/api/modeles/pocket-tts').status_code, 409)
        self.assertEqual(self.client.post('/api/moteur', json={'moteur': 'dots'}).status_code, 409)

    def test_gated_failure_returns_actionable_help(self):
        """Un modèle protégé doit renvoyer un message pas à pas + un flag aide=gated."""
        faux_hf = types.ModuleType('huggingface_hub')

        def telecharge(*args, **kwargs):
            raise RuntimeError('401 Client Error: gated repo access denied')

        faux_hf.snapshot_download = telecharge
        with patch.dict(sys.modules, {'huggingface_hub': faux_hf}), \
             patch.object(server.importlib.util, 'find_spec', return_value=object()), \
             patch.object(server, '_est_installe', return_value=False):
            server._installer_modele('pocket-tts')
        etat = server.installations['pocket-tts']
        self.assertEqual(etat['etat'], 'erreur')
        self.assertEqual(etat['aide'], 'gated')
        self.assertIn('huggingface.co/settings/tokens', etat['erreur'])
        self.assertIn('Installer', etat['erreur'])
        self.assertNotIn('HF_TOKEN', etat['erreur'])   # plus de jargon développeur
        modele = next(m for m in self.client.get('/api/modeles').json()['modeles']
                      if m['id'] == 'pocket-tts')
        self.assertEqual(modele['aide'], 'gated')      # le flag remonte jusqu'à l'UI


class PiperContracts(unittest.TestCase):
    """Catalogue de voix Piper : contrat HTTP avec cache HF simulé."""

    CATALOGUE = {
        'fr_FR-siwis-medium': {
            'name': 'siwis',
            'language': {'code': 'fr_FR', 'family': 'fr', 'name_native': 'Français'},
            'quality': 'medium', 'num_speakers': 1, 'speaker_id_map': {},
            'files': {'fr/fr_FR/siwis/medium/fr_FR-siwis-medium.onnx': {'size_bytes': 63_000_000}},
        },
        'fr_FR-upmc-medium': {
            'name': 'upmc',
            'language': {'code': 'fr_FR', 'family': 'fr', 'name_native': 'Français'},
            'quality': 'medium', 'num_speakers': 2, 'speaker_id_map': {'jessica': 0, 'pierre': 1},
            'files': {'fr/fr_FR/upmc/medium/fr_FR-upmc-medium.onnx': {'size_bytes': 76_000_000}},
        },
        'en_US-lessac-high': {
            'name': 'lessac',
            'language': {'code': 'en_US', 'family': 'en', 'name_native': 'English'},
            'quality': 'high', 'num_speakers': 1, 'speaker_id_map': {},
            'files': {'en/en_US/lessac/high/en_US-lessac-high.onnx': {'size_bytes': 80_000_000}},
        },
    }

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        (self.root / 'apercus').mkdir()
        self.patches = [patch.object(server, 'SORTIES', self.root),
                        patch.object(server, 'APERCUS', self.root / 'apercus'),
                        patch.object(server, '_cache_modele', lambda repo: self.root / repo.replace('/', '--')),
                        patch.object(server, '_piper_catalogue', return_value=self.CATALOGUE),
                        patch.object(server, '_piper_voix_installees', side_effect=self._scan)]
        for p in self.patches:
            p.start()
        server.voix_courante.clear(); server.jobs.clear(); server.installations.clear()
        server.PIPER_VOIX.clear()          # une voix Piper gardée chaude ne doit pas fuir d'un test à l'autre
        server.modele = None; server.moteur_pret = None; server.erreur_modele = None
        server.moteur_actif = 'piper'; server.moteur_eteint = False
        self.client = TestClient(server.app)

    def tearDown(self):
        self.client.close()
        for p in reversed(self.patches):
            p.stop()
        server.moteur_actif = 'voxcpm2'
        self.tmp.cleanup()

    def _scan(self):
        cache = self.root / 'rhasspy--piper-voices' / 'snapshots'
        installes = {}
        if not cache.is_dir():
            return installes
        for onnx in cache.rglob('*.onnx'):
            vid = onnx.name[:-len('.onnx')]
            config = onnx.with_name(onnx.name + '.json')
            if config.is_file() and onnx.resolve().is_file():
                installes[vid] = {'onnx': str(onnx), 'config': str(config),
                                  'taille_mo': round((onnx.stat().st_size + config.stat().st_size) / 1e6, 1)}
        return installes

    def _simuler_voix(self, vid='fr_FR-siwis-medium'):
        """Crée onnx + json + blob dans le cache HF simulé."""
        morceaux = vid.split('-')
        chemin = (self.root / 'rhasspy--piper-voices' / 'snapshots' / 'abc123'
                  / morceaux[0][:2] / morceaux[0] / morceaux[1] / morceaux[2])
        chemin.mkdir(parents=True, exist_ok=True)
        blobs = self.root / 'rhasspy--piper-voices' / 'blobs'
        blobs.mkdir(parents=True, exist_ok=True)
        blob = blobs / 'blob-onnx'
        blob.write_bytes(b'm' * 63_000_000)
        (chemin / f'{vid}.onnx').symlink_to(blob)
        (chemin / f'{vid}.onnx.json').write_text('{"num_speakers": 1}')
        return chemin

    def test_catalogue_filtres_et_etat(self):
        payload = self.client.get('/api/piper/catalogue').json()
        self.assertEqual(payload['total'], 3)
        self.assertEqual(payload['installees'], 0)
        self.assertFalse(any(v['telechargee'] for v in payload['voix']))
        self.assertEqual(self.client.get('/api/piper/catalogue?langue=fr').json()['total'], 2)
        self.assertEqual(self.client.get('/api/piper/catalogue?q=upmc').json()['total'], 1)
        # le français d'abord
        self.assertTrue(self.client.get('/api/piper/catalogue').json()['voix'][0]['langue'].startswith('fr'))

    def test_installation_voix_puis_liste(self):
        self._simuler_voix()
        # voix déjà complète : réponse immédiate, aucun thread lancé
        with patch.object(server.threading, 'Thread') as thread:
            payload = self.client.post('/api/piper/voix/fr_FR-siwis-medium/installer').json()
            thread.return_value.start.assert_not_called()
        self.assertTrue(payload['installe'])
        voix = self.client.get('/api/piper/voix').json()['voix']
        self.assertEqual([v['id'] for v in voix], ['fr_FR-siwis-medium'])
        catalogue = self.client.get('/api/piper/catalogue?langue=fr').json()
        self.assertEqual(catalogue['installees'], 1)
        self.assertTrue(catalogue['voix'][0]['telechargee'])
        # le moteur piper compte comme installé dès la première voix
        self.assertIn('piper', self.client.get('/api/etat').json()['installes'])

    def test_installation_voix_inconnue_et_suivi(self):
        self.assertEqual(self.client.post('/api/piper/voix/fr_FR-ghost-medium/installer').status_code, 404)
        self.assertEqual(self.client.post('/api/piper/voix/invalide/installer').status_code, 404)
        with patch.object(server.threading, 'Thread') as thread:
            self.assertEqual(self.client.post('/api/piper/voix/en_US-lessac-high/installer').status_code, 202)
            thread.return_value.start.assert_called_once()
        self.assertEqual(server.installations['piper:en_US-lessac-high']['etat'], 'en_cours')

    def test_suppression_voix_retire_blob_et_snapshot(self):
        chemin = self._simuler_voix('fr_FR-upmc-medium')
        blob = self.root / 'rhasspy--piper-voices' / 'blobs' / 'blob-onnx'
        self.assertTrue(blob.exists())
        self.assertEqual(self.client.delete('/api/piper/voix/fr_FR-upmc-medium').status_code, 200)
        self.assertFalse((chemin / 'fr_FR-upmc-medium.onnx').exists())
        self.assertFalse(blob.exists())
        self.assertEqual(self.client.delete('/api/piper/voix/fr_FR-upmc-medium').status_code, 404)

    def test_apercu_voix_synthetise_puis_sert_le_cache(self):
        self._simuler_voix()
        appels = []

        def faux_synthese(texte, config):
            appels.append({'texte': texte, 'locuteur': getattr(config, 'speaker_id', None)})
            return [types.SimpleNamespace(audio_int16_array=np.zeros(2205, dtype=np.int16),
                                          sample_rate=22050)]

        faux_piper = types.SimpleNamespace(
            PiperVoice=types.SimpleNamespace(load=lambda chemin: types.SimpleNamespace(synthesize=faux_synthese)),
            SynthesisConfig=lambda **kwargs: types.SimpleNamespace(**kwargs))
        with patch.dict(sys.modules, {'piper': faux_piper}):
            premier = self.client.get('/api/piper/apercu/fr_FR-ghost-medium')
            self.assertEqual(premier.status_code, 404)         # voix non téléchargée
            self.assertEqual(self.client.get('/api/piper/apercu/pas-un-id').status_code, 404)
            reponse = self.client.get('/api/piper/apercu/fr_FR-siwis-medium')
            self.assertEqual(reponse.status_code, 200, reponse.text)
            self.assertTrue(reponse.content.startswith(b'RIFF'))
            self.assertIn('Bonjour', appels[0]['texte'])      # phrase française pour fr_FR
            # le second appel ressort le cache : aucune nouvelle synthèse
            encore = self.client.get('/api/piper/apercu/fr_FR-siwis-medium')
            self.assertEqual(encore.status_code, 200)
            self.assertEqual(len(appels), 1)
            # multi-locuteurs : le locuteur demandé est honoré
            upmc = self._simuler_voix('fr_FR-upmc-medium')
            self.assertEqual(self.client.get('/api/piper/apercu/fr_FR-upmc-medium?locuteur=1').status_code, 200)
            self.assertEqual(appels[1]['locuteur'], 1)
            # la suppression de la voix emporte ses extraits
            self.client.delete('/api/piper/voix/fr_FR-upmc-medium')
            self.assertEqual(list(server.APERCUS.glob('fr_FR-upmc-medium-*.wav')), [])

    def test_generation_piper_valide_la_voix_et_normalise(self):
        self.assertEqual(self.client.post('/api/generer', json={'texte': 'Bonjour'}).status_code, 400)
        self.assertEqual(self.client.post('/api/generer', json={
            'texte': 'Bonjour', 'piper_voix': 'fr_FR-ghost-medium'}).status_code, 400)
        self._simuler_voix()
        server.moteur_pret = 'piper'
        server.modele = {'voix': {}}
        capturé = {}

        def faux_synthese(texte, config):
            capturé['texte'] = texte
            return [types.SimpleNamespace(audio_int16_array=np.zeros(2000, dtype=np.int16),
                                          sample_rate=22050)]

        faux_piper = types.SimpleNamespace(
            PiperVoice=types.SimpleNamespace(load=lambda chemin: types.SimpleNamespace(synthesize=faux_synthese)),
            SynthesisConfig=lambda **kwargs: kwargs)
        # le patch reste actif pendant la synthèse : elle tourne dans son fil,
        # un patch refermé trop tôt laisserait le vrai Piper répondre
        with patch.dict(sys.modules, {'piper': faux_piper}):
            response = self.client.post('/api/generer', json={
                'texte': 'Louis XVI promulgua 1789 lois.', 'vitesse': 1.2,
                'piper_voix': 'fr_FR-siwis-medium', 'piper_locuteur': 1})
            self.assertEqual(response.status_code, 200, response.text)
            job = response.json()['job']
            for _ in range(200):
                etat = self.client.get(f'/api/job/{job}').json()
                if etat.get('etat') in ('pret', 'erreur'):
                    break
                time.sleep(0.05)
            self.assertEqual(etat['etat'], 'pret', etat)
        # la synthèse a reçu la forme normalisée, pas la notation imprimée
        self.assertIn('Louis seize', capturé['texte'])
        self.assertIn('mille sept cent quatre-vingt-neuf', capturé['texte'])


class LiveReadContracts(PiperContracts):
    """Lecture au fil de l'eau : phrases découpées, WAV par phrase, arrêt."""

    def _attendre(self, lid, total):
        for _ in range(400):
            etat = self.client.get(f'/api/lire/{lid}').json()
            if etat['etat'] in ('pret', 'arrete', 'erreur') or etat['prets'] >= total:
                return etat
            time.sleep(0.02)
        self.fail(f'lecture non prête : {etat}')

    def test_lecture_decoupe_les_phrases_et_sert_chaque_wav(self):
        self._simuler_voix()
        appels = []

        def faux_synthese(texte, config):
            appels.append(texte)
            return [types.SimpleNamespace(audio_int16_array=np.zeros(2205, dtype=np.int16),
                                          sample_rate=22050)]

        faux_piper = types.SimpleNamespace(
            PiperVoice=types.SimpleNamespace(load=lambda chemin: types.SimpleNamespace(synthesize=faux_synthese)),
            SynthesisConfig=lambda **kwargs: types.SimpleNamespace(**kwargs))
        with patch.dict(sys.modules, {'piper': faux_piper}):
            reponse = self.client.post('/api/lire', json={
                'texte': 'Première phrase. Deuxième phrase ! Et la troisième ?',
                'vitesse': 1.0, 'piper_voix': 'fr_FR-siwis-medium'})
            self.assertEqual(reponse.status_code, 200, reponse.text)
            lecture = reponse.json()
            self.assertEqual(lecture['total'], 3)
            self.assertEqual(lecture['moteur'], 'piper')
            etat = self._attendre(lecture['lecture'], 3)
            self.assertEqual(etat['prets'], 3, etat)
            for index in range(3):
                phrase = self.client.get(f"/api/lire/{lecture['lecture']}/{index}")
                self.assertEqual(phrase.status_code, 200, phrase.text)
                self.assertTrue(phrase.content.startswith(b'RIFF'))
            self.assertEqual(len(appels), 3)
            self.assertEqual(self.client.get(f"/api/lire/{lecture['lecture']}/9").status_code, 404)
            stop = self.client.post(f"/api/lire/{lecture['lecture']}/arreter")
            self.assertEqual(stop.status_code, 200)
            self.assertEqual(self.client.get(f"/api/lire/{lecture['lecture']}").json()['etat'], 'arrete')
            self.assertEqual(self.client.get('/api/lire/inconnue').status_code, 404)

    def test_lecture_respecte_les_segments_du_studio(self):
        self._simuler_voix()

        def faux_synthese(texte, config):
            return [types.SimpleNamespace(audio_int16_array=np.zeros(2205, dtype=np.int16),
                                          sample_rate=22050)]

        faux_piper = types.SimpleNamespace(
            PiperVoice=types.SimpleNamespace(load=lambda chemin: types.SimpleNamespace(synthesize=faux_synthese)),
            SynthesisConfig=lambda **kwargs: types.SimpleNamespace(**kwargs))
        with patch.dict(sys.modules, {'piper': faux_piper}):
            reponse = self.client.post('/api/lire', json={
                'respecter_segments': True,
                'segments': [
                    {'texte': 'Première phrase. Deuxième phrase du même segment.', 'piper_voix': 'fr_FR-siwis-medium'},
                    {'texte': 'Troisième phrase.', 'piper_voix': 'fr_FR-siwis-medium'},
                ]})
            self.assertEqual(reponse.status_code, 200, reponse.text)
            self.assertEqual(reponse.json()['total'], 2)      # pas de re-découpage
            self._attendre(reponse.json()['lecture'], 2)

    def test_lecture_valide_la_voix_et_le_texte(self):
        self._simuler_voix()
        self.assertEqual(self.client.post('/api/lire', json={'texte': ''}).status_code, 400)
        self.assertEqual(self.client.post('/api/lire', json={
            'texte': 'Bonjour', 'piper_voix': 'fr_FR-ghost-medium'}).status_code, 400)
        self.assertEqual(self.client.post('/api/lire', json={
            'texte': 'Bonjour', 'piper_voix': 'fr_FR-siwis-medium', 'vitesse': 9}).status_code, 400)

    def test_lecture_d_un_chapitre_garde_la_voix_de_chaque_segment(self):
        self._simuler_voix()
        self._simuler_voix('fr_FR-upmc-medium')
        voix_vues = []

        def faux_synthese(texte, config):
            voix_vues.append(getattr(config, 'speaker_id', None))
            return [types.SimpleNamespace(audio_int16_array=np.zeros(2205, dtype=np.int16),
                                          sample_rate=22050)]

        faux_piper = types.SimpleNamespace(
            PiperVoice=types.SimpleNamespace(load=lambda chemin: types.SimpleNamespace(synthesize=faux_synthese)),
            SynthesisConfig=lambda **kwargs: types.SimpleNamespace(**kwargs))
        with patch.dict(sys.modules, {'piper': faux_piper}):
            reponse = self.client.post('/api/lire', json={'segments': [
                {'texte': 'Le narrateur ouvre le récit.', 'piper_voix': 'fr_FR-siwis-medium'},
                {'texte': 'Le personnage répond.', 'piper_voix': 'fr_FR-upmc-medium', 'piper_locuteur': 1},
            ]})
            self.assertEqual(reponse.status_code, 200, reponse.text)
            lecture = reponse.json()
            self.assertEqual(lecture['total'], 2)
            self._attendre(lecture['lecture'], 2)
            self.assertEqual(voix_vues, [None, 1])       # une voix par rôle, locuteur compris


class AttributionMobileContracts(StudioContracts):
    """Analyse du studio réutilisée par le lecteur Android (passerelle mobile)."""

    def setUp(self):
        super().setUp()
        self.ia_file = self.root / 'ia.json'
        self.ia_patch = patch.object(server, 'FICHIER_IA', self.ia_file)
        self.ia_patch.start()

    def tearDown(self):
        self.ia_patch.stop()
        super().tearDown()

    def test_refuse_sans_provider_ia(self):
        self.ia_file.write_text('{}', encoding='utf-8')
        reponse = self.client.post('/api/attribuer', json={'titre': 'Test', 'phrases': ['Bonjour.']})
        self.assertEqual(reponse.status_code, 400)
        self.assertIn('configuration IA', reponse.json()['detail'])

    def test_valide_les_phrases(self):
        self.ia_file.write_text('{}', encoding='utf-8')
        self.assertEqual(self.client.post('/api/attribuer', json={'phrases': []}).status_code, 400)
        self.assertEqual(self.client.post('/api/attribuer', json={'phrases': ['x' * 601]}).status_code, 400)
        self.assertEqual(self.client.post('/api/attribuer', json={'phrases': 'pas une liste'}).status_code, 400)

    def test_quota_ia_devient_un_message_actionnable(self):
        self.ia_file.write_text(json.dumps({"base_url": "http://x", "cle": "k", "modele": "m"}), encoding="utf-8")

        def quota(*args, **kwargs):
            raise server.ia.IaErreur("l'API a répondu HTTP 429 : {\"error\":{\"code\":\"1308\",\"message\":\"Usage limit reached\"}}")

        with patch.object(server.livres.ia, 'completer_detail', side_effect=quota):
            reponse = self.client.post('/api/attribuer', json={'titre': 'Test', 'phrases': ['Bonjour.']})
        self.assertEqual(reponse.status_code, 429)
        self.assertIn('limite d’usage', reponse.json()['detail'])
        self.assertIn('Réglages IA', reponse.json()['detail'])
        self.assertNotIn('1308', reponse.json()['detail'])

    def test_cle_refusee_devient_un_message_actionnable(self):
        self.assertEqual(server.ia.message_lisible(server.ia.IaErreur('HTTP 401 unauthorized')),
                         "Le fournisseur IA refuse la clé ou l’accès — vérifie la clé API dans Réglages IA.")

    def test_attribution_aligne_un_locuteur_par_phrase(self):
        appels = []

        def faux_completer(cfg, messages, **options):
            texte = messages[0]['content']
            appels.append(texte)
            if 'TÂCHE: CAST' in texte:
                return (json.dumps({'cast': [
                    {'id': 'narrateur', 'nom': 'Narrateur', 'genre': 'indetermine', 'role': 'narrateur'},
                    {'id': 'pierre', 'nom': 'Pierre', 'genre': 'homme', 'role': 'personnage'},
                ]}), {'total_tokens': 1})
            return (json.dumps({'locuteurs': ['narrateur', 'pierre', 'narrateur']}), {'total_tokens': 1})

        with patch.object(server.livres.ia, 'completer_detail', side_effect=faux_completer):
            resultat = server.livres.attribuer_telephone({}, 'Test', ['Le soir tombe.', '— Bonjour !', 'Il repart.'])
        self.assertEqual(resultat['locuteurs'], ['narrateur', 'pierre', 'narrateur'])
        self.assertEqual([p['id'] for p in resultat['personnages']], ['narrateur', 'pierre'])
        self.assertTrue(all(p['id'] and p['nom'] for p in resultat['personnages']))
        # une seule passe de tagage pour un chapitre court
        self.assertEqual(sum(1 for appel in appels if 'TÂCHE: ATTRIBUTION' in appel), 1)


if __name__ == '__main__': unittest.main()
