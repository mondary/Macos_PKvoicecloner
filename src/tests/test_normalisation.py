"""Normalisation française avant synthèse : abréviations, rois, siècles, nombres."""
import importlib.util
import sys
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location(
    'normalisation', Path(__file__).resolve().parents[1] / 'server/normalisation.py')
normalisation = importlib.util.module_from_spec(spec)
spec.loader.exec_module(normalisation)


class NombresEnLettres(unittest.TestCase):
    def test_nombres_francais(self):
        cas = {
            0: 'zéro', 8: 'huit', 16: 'seize', 20: 'vingt', 21: 'vingt-et-un',
            30: 'trente', 55: 'cinquante-cinq', 61: 'soixante-et-un',
            70: 'soixante-dix', 71: 'soixante et onze', 75: 'soixante-quinze',
            80: 'quatre-vingts', 81: 'quatre-vingt-un', 91: 'quatre-vingt-onze',
            99: 'quatre-vingt-dix-neuf', 100: 'cent', 101: 'cent un',
            200: 'deux cents', 205: 'deux cent cinq',
            999: 'neuf cent quatre-vingt-dix-neuf', 1000: 'mille',
            1789: 'mille sept cent quatre-vingt-neuf',
            2000: 'deux mille', 63_000: 'soixante-trois mille',
            1_000_000: 'un million', 2_000_000_000: 'deux milliards',
        }
        for valeur, attendu in cas.items():
            self.assertEqual(normalisation.nombre_en_lettres(valeur), attendu, f"échec pour {valeur}")

    def test_ordinaux(self):
        cas = {1: 'premier', 2: 'deuxième', 3: 'troisième', 4: 'quatrième',
               5: 'cinquième', 9: 'neuvième', 20: 'vingtième', 21: 'vingt-et-unième',
               80: 'quatre-vingtième', 100: 'centième', 1000: 'millième'}
        for valeur, attendu in cas.items():
            self.assertEqual(normalisation._ordinal(valeur), attendu, f"échec pour {valeur}")
        self.assertEqual(normalisation._ordinal(1, feminin=True), 'première')


class Romains(unittest.TestCase):
    def test_valeurs(self):
        for texte, attendu in {'I': 1, 'IV': 4, 'XVI': 16, 'XIV': 14, 'XL': 40,
                               'MCMLXXXIX': 1989, 'MMM': 3000}.items():
            self.assertEqual(normalisation.romain_valeur(texte), attendu)
        self.assertIsNone(normalisation.romain_valeur('IIII'))
        self.assertIsNone(normalisation.romain_valeur('ABC'))
        self.assertIsNone(normalisation.romain_valeur(''))


class Normalisation(unittest.TestCase):
    def test_abreviations_et_nombres(self):
        self.assertEqual(normalisation.normaliser('M. Dupont'), 'Monsieur Dupont')
        self.assertEqual(normalisation.normaliser('Mme de Sévigné'), 'Madame de Sévigné')
        self.assertEqual(normalisation.normaliser('le Dr Pascal'), 'le Docteur Pascal')
        self.assertEqual(normalisation.normaliser('1 500 fusils'), 'mille cinq cents fusils')
        self.assertEqual(normalisation.normaliser('12 % de perte'), 'douze pour cent de perte')
        self.assertEqual(normalisation.normaliser('45 €'), 'quarante-cinq euros')
        self.assertEqual(normalisation.normaliser('N° 7'), 'numéro sept')
        self.assertEqual(normalisation.normaliser('3,14 points'), 'trois virgule quatorze points')
        self.assertEqual(normalisation.normaliser('le 1er janvier'), 'le premier janvier')
        self.assertEqual(normalisation.normaliser('la 2e fois'), 'la deuxième fois')
        self.assertEqual(normalisation.normaliser('20 °C'), 'vingt degrés')

    def test_rois_et_siecles(self):
        self.assertEqual(normalisation.normaliser('Louis XVI'), 'Louis seize')
        self.assertEqual(normalisation.normaliser('Henri IV'), 'Henri quatre')
        self.assertEqual(normalisation.normaliser('Élisabeth II'), 'Élisabeth deux')
        self.assertEqual(normalisation.normaliser('le XXe siècle'), 'le vingtième siècle')
        self.assertEqual(normalisation.normaliser('au XVIe et au XXIe'), 'au seizième et au vingt-et-unième')
        self.assertEqual(normalisation.normaliser('François Ier'), 'François premier')

    def test_mots_courants_intacts(self):
        phrase = ('Le de ce que la vie donne, il le dit : demain, bien, Dien, '
                  'Cie du Midi, Valide, Maître Ce et Le 2e')
        normalisee = normalisation.normaliser(phrase)
        for mot in ('Le ', 'de ', 'ce ', 'vie', 'Dien', 'Cie', 'dit'):
            self.assertIn(mot, normalisee)
        self.assertIn('deuxième', normalisee)


if __name__ == '__main__':
    unittest.main()
