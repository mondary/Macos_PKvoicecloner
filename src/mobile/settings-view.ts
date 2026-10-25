import type { Settings } from './types';
import { FOURNISSEURS, fournisseurParUrl, optionsModeles, type FournisseurIA } from './ia-providers';

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const icon = (name: string) => `<i data-lucide="${name}" aria-hidden="true"></i>`;

export type SettingsTab = 'lecture' | 'voix' | 'apropos';

/** Réglages de lecture, partagés entre la page Réglages et la feuille rapide
 *  ouverte depuis le lecteur : un seul contenu, deux points d'entrée. */
export function lectureBody(settings: Settings): string {
  return `<div class="settings-group"><h3>Thème</h3>
  <div class="theme-picker">${[['light','sun','Clair'],['paper','book-open','Papier'],['dark','moon','Nuit']].map(([id,ic,label]) =>
    `<button class="theme-option theme-${id} ${settings.theme===id?'active':''}" data-action="theme" data-id="${id}" aria-pressed="${settings.theme===id}">${icon(ic)}<span>${label}</span></button>`).join('')}</div></div>
  <div class="settings-group"><h3>Taille du texte</h3>
  <div class="choice-grid" role="group" aria-label="Taille du texte">${[18,20,22,25,28,32].map(n =>
    `<button class="choice ${settings.fontSize===n?'active':''}" data-action="font" data-id="${n}" style="font-size:${n}px" aria-pressed="${settings.fontSize===n}">Aa</button>`).join('')}</div></div>
  <div class="settings-group"><h3>Interligne</h3>
  <div class="choice-grid" role="group" aria-label="Interligne">${[[1.6,'Serré'],[1.95,'Normal'],[2.1,'Aéré']].map(([n,label]) =>
    `<button class="choice ${Math.abs((settings.interligne??1.95)-Number(n))<0.01?'active':''}" data-action="interligne" data-id="${n}" aria-pressed="${Math.abs((settings.interligne??1.95)-Number(n))<0.01}">${label}</button>`).join('')}</div></div>
  <div class="settings-group"><h3>Marges</h3>
  <div class="choice-grid" role="group" aria-label="Marges">${[[0,'Normales'],[16,'Confort'],[32,'Larges']].map(([n,label]) =>
    `<button class="choice ${Number(settings.marges??0)===Number(n)?'active':''}" data-action="marges" data-id="${n}" aria-pressed="${Number(settings.marges??0)===Number(n)}">${label}</button>`).join('')}</div></div>
  <div class="settings-group"><h3>Mise en page</h3>
  <div class="choice-grid" role="group" aria-label="Mise en page">${[['pages','Pages à tourner'],['scroll','Défilement continu']].map(([id,label]) =>
    `<button class="choice ${settings.layout===id?'active':''}" data-action="layout" data-id="${id}" aria-pressed="${settings.layout===id}">${label}</button>`).join('')}</div></div>
  <div class="settings-group"><h3>Vitesse d’écoute</h3>
  <button class="setting-row" data-action="speed"><span>${icon('gauge')} Vitesse par défaut du lecteur</span><strong>${settings.rate.toLocaleString('fr')}× ${icon('chevron-right')}</strong></button>
  <p class="section-description">La vitesse se règle aussi par voix, dans le lecteur : chaque timbre garde la sienne.</p></div>
  <div class="settings-group"><h3>Surlignage pendant l’écoute</h3>
  <p class="section-description">Chaque mot (karaoké), la phrase seule, ou rien du tout. Le suivi de lecture reste actif dans les trois modes.</p>
  <div class="choice-grid" role="group" aria-label="Surlignage">${[['mots','Mots'],['phrase','Phrase'],['aucun','Aucun']].map(([id,label]) =>
    `<button class="choice ${(settings.surlignage??'mots')===id?'active':''}" data-action="surlignage" data-id="${id}" aria-pressed="${(settings.surlignage??'mots')===id}">${label}</button>`).join('')}</div></div>
  <div class="settings-group"><h3>Suivi de lecture</h3>
  <p class="section-description">La page se recadre quand la phrase sort de cette zone, jamais à chaque mot.</p>
  <div class="choice-grid" role="group" aria-label="Suivi de lecture">${[[0.18,'Serré'],[0.28,'Normal'],[0.35,'Large']].map(([n,label]) =>
    `<button class="choice ${Math.abs((settings.bande??0.28)-Number(n))<0.01?'active':''}" data-action="bande" data-id="${n}" aria-pressed="${Math.abs((settings.bande??0.28)-Number(n))<0.01}">${label}</button>`).join('')}</div></div>`;
}

export interface SettingsViewOptions {
  settings: Settings; tab: SettingsTab; version: string; native: boolean;
  /** Section « Mises à jour » déjà rendue par main.ts (état des téléchargements). */
  updateHTML: string;
}

const optionsFournisseur = (actuel: FournisseurIA) => FOURNISSEURS.map(f =>
  `<option value="${f.id}" ${f.id === actuel.id ? 'selected' : ''}>${esc(f.nom)}</option>`).join('');

function optionsModele(fournisseur: FournisseurIA, actuel: string): string {
  const liste = optionsModeles(fournisseur, actuel);
  return `${liste.length ? liste.map(id => `<option value="${esc(id)}" ${id === actuel ? 'selected' : ''}>${esc(id)}</option>`).join('') : '<option value="">Choisir un modèle…</option>'}<option value="__libre__">Autre modèle (saisie libre)</option>`;
}

/** Réglages IA : fournisseur → adresse + lien de clé remplis, puis modèle
 *  choisi dans la liste chargée depuis le fournisseur (ou saisie libre). */
function iaSection(settings: Settings): string {
  const fournisseur = settings.ia?.url ? fournisseurParUrl(settings.ia.url) : FOURNISSEURS[0];
  const actuel = settings.ia?.modele ?? '';
  const cle = settings.ia?.hasKey ? 'Clé enregistrée — laisser vide pour la conserver' : 'Collez votre clé API';
  return `<section class="settings-section"><div class="section-heading"><h2>Analyse IA du téléphone</h2><span class="pill">FACULTATIF</span></div><p class="section-description">La même analyse des personnages que le studio, appelée directement depuis le téléphone : aucun Mac requis.</p>${settings.ia?.enabled ? `<p class="section-description"><strong>Active</strong> · ${esc(settings.ia.modele)}</p>` : ''}
  <form id="ia-form">
    <label for="ia-provider">Fournisseur</label>
    <select id="ia-provider" name="provider">${optionsFournisseur(fournisseur)}</select>
    <label for="ia-url">Adresse du fournisseur</label>
    <input id="ia-url" name="url" type="url" placeholder="https://…" value="${esc(settings.ia?.url || fournisseur.url)}" autocapitalize="none" spellcheck="false" required />
    <p class="ia-keys-line"><a id="ia-keys" class="link-button" href="${esc(fournisseur.cles)}" target="_blank" rel="noopener noreferrer" ${fournisseur.cles ? '' : 'hidden'}>Trouver ma clé chez ${esc(fournisseur.nom)} →</a></p>
    <p class="ia-note" id="ia-note" ${fournisseur.note ? '' : 'hidden'}>${esc(fournisseur.note ?? '')}</p>
    <label for="ia-key">Clé API</label>
    <input id="ia-key" name="key" type="password" placeholder="${cle}" autocomplete="off" />
    ${settings.ia?.hasKey ? `<p class="ia-saved">${icon('shield-check')} Clé enregistrée sur ce téléphone — laissez le champ vide pour la conserver.</p>` : ''}
    <label for="ia-model-select">Modèle</label>
    <div class="ia-model-row"><select id="ia-model-select" name="model-select">${optionsModele(fournisseur, actuel)}</select><button type="button" class="small-button" data-action="ia-load-models">Charger les modèles</button></div>
    <label for="ia-model-manual">Ou saisir un identifiant de modèle</label>
    <input id="ia-model-manual" name="model-manual" type="text" placeholder="ex. glm-4.7" value="${esc(actuel)}" autocapitalize="none" spellcheck="false" />
    <button type="submit" class="primary">${icon('sparkles')} Tester et enregistrer</button>
  </form>
  <p id="ia-status" role="status"></p>${settings.ia?.enabled ? `<button class="setting-row danger" data-action="ia-clear"><span>${icon('trash-2')} Désactiver l’IA du téléphone</span>${icon('chevron-right')}</button>` : ''}
  <details class="connection-help"><summary>Que se passe-t-il quand elle est activée ?</summary><p>À l’ouverture d’un livre, les personnages sont identifiés puis les dialogues attribués par ce modèle, avec une relecture critique des passages incertains. La préparation prend plusieurs minutes et consomme des tokens ; chaque lot est sauvegardé et une coupure se reprend sans refaire le travail déjà fait.</p><p>Le texte des passages analysés est envoyé au fournisseur choisi. La clé reste chiffrée sur ce téléphone (Android Keystore) : elle n’est jamais réaffichée. Désactivez l’IA à tout moment : le repérage local reprend la main, les attributions déjà obtenues restent acquises.</p></details></section>`;
}

/** La page Réglages en trois onglets : Lecture, Voix & analyse, À propos. */
export function settingsViewHTML(o: SettingsViewOptions): string {
  const { settings, tab, version, native } = o;
  const tabs: [SettingsTab, string, string][] = [['lecture','book-open','Lecture'], ['voix','audio-lines','Voix & analyse'], ['apropos','info','À propos']];
  const navigation = `<div class="segmented settings-tabs" role="group" aria-label="Sections des réglages">${tabs.map(([id, ic, label]) =>
    `<button data-action="settings-tab" data-id="${id}" class="${tab===id?'active':''}" aria-pressed="${tab===id}">${icon(ic)}<span>${label}</span></button>`).join('')}</div>`;
  const lecture = `<div class="settings-group-list">${lectureBody(settings)}</div>`;
  const voix = `
  ${iaSection(settings)}
  <section class="settings-section"><div class="section-heading"><h2>Votre studio vocal</h2><span class="pill">FACULTATIF</span></div><p class="section-description">Retrouvez vos voix clonées depuis PK Voice Studio. Les passages générés restent sur le téléphone pour les prochaines écoutes.</p><form id="studio-form"><label for="server">Adresse du studio</label><input id="server" name="server" type="url" placeholder="http://192.168.1.20:8810" value="${esc(settings.server)}" autocapitalize="none" spellcheck="false" required /><label for="token">Code de connexion</label><input id="token" name="token" type="password" placeholder="Le code affiché par votre Mac" value="${esc(settings.token)}" autocomplete="off" required /><button type="submit" class="primary">${icon('plug')} Connecter le studio</button></form><details class="connection-help"><summary>Comment connecter mon Mac ?</summary><p>Démarrez PK Voice Studio, puis la passerelle mobile depuis le dossier du projet :</p><code>python3 src/server/mobile_gateway.py</code><p>Recopiez l’adresse et le code affichés. Votre téléphone et votre Mac doivent être sur le même réseau. La génération se fait sur le Mac ; l’audio est enregistré sur le téléphone.</p></details></section>
  <button class="setting-row" data-action="nav" data-id="voices"><span>${icon('sliders-horizontal')} Télécharger ou gérer les voix</span>${icon('chevron-right')}</button>`;
  const apropos = `
  ${o.updateHTML}
  <section class="settings-section"><h2>Crédits & inspirations</h2><div class="credits-list"><p>PK Reader est un projet original. Son ergonomie de lecture s’inspire de <a href="https://play.google.com/store/apps/details?id=voice.reader.ai" target="_blank" rel="noopener noreferrer">TTS Reader Pro</a> et de <a href="https://readexa.uk/" target="_blank" rel="noopener noreferrer">Readexa</a>.</p><p>Moteurs et bibliothèques : Capacitor, sherpa-onnx, Piper, PDF.js, fflate, Lucide, DM Sans et Literata — licences dans <code>THIRD_PARTY.md</code>.</p></div></section>
  <section class="settings-section about"><span class="brand-mark">${icon('audio-lines')}</span><div><h2>PK Reader <span>${version}</span></h2><p>Vos livres. Votre rythme. Votre voix.</p></div><a href="https://ko-fi.com/pouark" target="_blank" rel="noopener noreferrer" aria-label="Soutenir PK Reader sur Ko-fi">${icon('heart')}</a></section>
  ${!native ? '<p class="web-note">Aperçu web : les voix Piper, l’IA du téléphone et les mises à jour fonctionnent dans l’APK Android.</p>' : ''}`;
  return `<header class="page-heading"><div><p class="eyebrow">FAITES COMME CHEZ VOUS</p><h1>À votre rythme<span>.</span></h1></div><span class="build-chip">${version}</span></header>
  ${navigation}
  <div class="settings-pane">${tab === 'lecture' ? lecture : tab === 'voix' ? voix : apropos}</div>`;
}
