"""HTTP contracts against temporary storage; no model download or user-data changes."""
import importlib.util
import io
import os
from pathlib import Path
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
        server.modele = None; server.moteur_pret = None; server.erreur_modele = None
        self.client = TestClient(server.app)

    def tearDown(self):
        self.client.close()
        for p in reversed(self.patches): p.stop()
        self.tmp.cleanup()

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

    def test_model_catalogue_install_rename_delete(self):
        models = self.client.get('/api/modeles').json()['modeles']
        self.assertEqual(len(models), 4)
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
            self.assertEqual(self.client.delete(f'/api/modeles/{mid}').status_code, 200)
            self.assertFalse(cache.exists())

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


if __name__ == '__main__': unittest.main()
