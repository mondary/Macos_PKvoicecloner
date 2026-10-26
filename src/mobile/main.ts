import '@fontsource/dm-sans/400.css';
import '@fontsource/dm-sans/500.css';
import '@fontsource/dm-sans/600.css';
import '@fontsource/dm-sans/700.css';
import '@fontsource/literata/400.css';
import '@fontsource/literata/500.css';
import { createIcons, icons } from 'lucide';
import './style.css';
import './reader.css';
import { App } from '@capacitor/app';
import { SystemBars, SystemBarsStyle } from '@capacitor/core';
import { library, readSettings, saveSettings } from './storage';
import { importBook, welcomeBook, chapterAt, minutesLeft, reparerParagraphes, normaliserTitresChapitres } from './books';
import { readerHeaderView, readerNavigationView } from './reader-controls';
import { chapterRuns, paginateReading, renderReadingText, type ReadingPage as Page } from './reading-text';
import { chapterAnalysisReady, proposeChapterVoices, confirmChapterVoices, chapterReviewView, type ChapterVoiceChoice } from './chapter-voices';
import { audio, native, Reader, Update, modelCatalog } from './engine';
import type { Book, UpdateInfo, Voice } from './types';
import { openCasting } from './casting-ui';
import { analyseLocalePerimee, besoinsVoix, characterAt, relancerAnalyse, speechProfile } from './casting';
import { castingBusy, castingActivities, castingProgress, dismissCastingActivity, prepareCasting, watchCasting } from './casting-jobs';
import { activityView, analysisChip, downloadActivityView } from './activity-view';
import { voiceDownloads, installVoice, monitorVoiceDownloads, watchVoiceDownloads, dismissVoiceDownload } from './voice-downloads';
import { etapesLivre } from './book-progress';
import { preparerLivreAudio } from './book-setup';
import { lectureBody, settingsViewHTML, type SettingsTab } from './settings-view';
import { adresseLocale, fournisseurParId, fournisseurParUrl, optionsModeles } from './ia-providers';
import { decouperMots, motPourPlage, motPourProgression, rendreMots } from './karaoke';

/* ------------------------------------------------------------------ état */

const app = document.querySelector<HTMLDivElement>('#app')!;
const sheet = document.querySelector<HTMLDialogElement>('#sheet')!;
const fileInput = document.querySelector<HTMLInputElement>('#file-input')!;
const settings = readSettings();
/** Version injectée au build depuis package.json : identique au nom de l'APK et au versionName Android. */
declare const __PK_VERSION__: string;
const version = typeof __PK_VERSION__ === 'string' ? __PK_VERSION__ : 'dev';

let books: Book[] = [];
let voices: Voice[] = [];
let models = [...modelCatalog];
let clones: Voice[] = [];
let screen: 'library' | 'reader' | 'voices' | 'settings' | 'book' = 'library';
let currentId = '';
let filter = 'all';
let voiceTab = 'neural';
let settingsTab: SettingsTab = 'lecture';
let search = '';
let importing = false;
let savedPosition = '';
let toastTimer: ReturnType<typeof setTimeout>;
let systemTheme = '';
let wasPreparing = false;
/** Chapitre audio en cours (détection du changement de chapitre) et livre dont
 *  la distribution a été affinée pendant l'écoute (rechargement différé). */
let chapitreCharge = -1;
let rafraichissementAttente = '';
let chapterReview: { book: Book; start: number; choices: ChapterVoiceChoice[]; ready: boolean; working: boolean } | undefined;
let chapterPlaybackRequest = false;
let chapterPendingKey = '';
/** Séquence « Tout préparer » : livre en cours de préparation complète. */
let bookSetup: string | null = null;
let setupStatus = '';

/** Mise à jour intégrée : état de la vérification, du téléchargement et de l'installateur. */
let updateInfo: UpdateInfo | null = null;
let updateState: 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'error' = 'idle';
let updateProgress = 0;
let updateMessage = '';
let updatePath = '';

/** Lecture : suivi automatique du texte lu. */
let follow = true;
let page = 0;
let pages: Page[] = [];
let pagesKey = '';
let pagesChapter = -1;
/** Hauteur du lecteur au dernier découpage : les pages suivent l'espace réel,
 *  mini-lecteur ou commandes complètes. */
let pagesHauteur = -1;
let fontsChecked = false;
/** Les défilements déclenchés par l'app sont ignorés par la détection de geste. */
let scrollGuard = 0;
let playerObserver: ResizeObserver | undefined;
/** Signature du dernier état « structurel » : la progression seule ne redessine pas la page. */
let derniereLecture = '';


/* --------------------------------------------------------------- fabriques */

const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const icon = (name: string, cls = '') => `<i data-lucide="${name}" class="${cls}" aria-hidden="true"></i>`;
const iconButton = (name: string, label: string, action: string, cls = '') =>
  `<button class="icon-button ${cls}" aria-label="${esc(label)}" title="${esc(label)}" data-action="${action}">${icon(name)}</button>`;
const current = () => books.find(b => b.id === currentId);
const active = () => books.find(b => b.id === audio.state.bookId);
const voiceName = () => [...voices, ...models, ...clones].find(v => v.id === settings.voice)?.name ?? (settings.voice.startsWith('clone:') ? 'Voix clonée' : 'Voix du téléphone');
const percent = (book: Book) => book.position >= book.segments.length ? 100 : Math.round(book.position / book.segments.length * 100);
const progress = (book: Book) => `${book.position>=book.segments.length?100:Math.round((book.position+0.5)/book.segments.length*100)}%`;
const guard = () => { scrollGuard = performance.now() + 900; };
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

function toast(message: string) {
  const el = document.querySelector<HTMLDivElement>('#toast')!;
  el.textContent = message; el.classList.add('visible'); clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('visible'), 5000);
}
function decorate() { createIcons({ icons, attrs: { 'stroke-width': 1.7 } }); }
function savePrefs() {
  saveSettings(settings);
  document.documentElement.dataset.theme = settings.theme;
  document.documentElement.style.setProperty('--reader-size', `${settings.fontSize}px`);
  document.documentElement.style.setProperty('--reader-leading', String(settings.interligne ?? 1.95));
  document.documentElement.style.setProperty('--reader-margins', `${settings.marges ?? 0}px`);
  document.documentElement.dataset.surlignage = settings.surlignage ?? 'mots';
  if (native && systemTheme !== settings.theme) {
    systemTheme = settings.theme;
    void SystemBars.setStyle({ style: settings.theme === 'dark' ? SystemBarsStyle.Dark : SystemBarsStyle.Light }).catch(() => {});
  }
}
function cover(book: Book, cls = '') {
  if (book.cover) return `<div class="book-cover image-cover ${cls}"><img src="${esc(book.cover)}" alt="Couverture de ${esc(book.title)}" /></div>`;
  return `<div class="book-cover cover-${book.color} ${cls}"><span class="cover-edition">${book.sample ? 'LE GOÛT DES HISTOIRES' : esc(book.format)}</span><span class="cover-title">${esc(book.title).replace(/\n/g,'<br>')}</span><span class="cover-art" aria-hidden="true"><b></b><b></b><b></b></span><span class="cover-author">${esc(book.sample ? 'PK READER' : book.author)}</span></div>`;
}
function ring(book: Book, cls = '') {
  return `<span class="ring ${cls}" style="--value:${percent(book)}" role="img" aria-label="${percent(book)} % du livre"><span class="ring-face"><b>${percent(book)}</b><i>%</i></span></span>`;
}
function minutes(book: Book) {
  const total = minutesLeft(book, settings.rate);
  const hours = Math.floor(total / 60);
  return hours ? `${hours} h ${String(total % 60).padStart(2, '0')}` : `${total} min`;
}

/* ------------------------------------------------------------- navigation */

/** Paragraphes du chapitre en cours : [{debut, fin}) en indices de phrases.
 *  Repli quand le livre a été importé avant le suivi des paragraphes : une
 *  phrase = un paragraphe (la navigation reste utilisable). */
function paragraphesChapitre(book: Book): { debut: number; fin: number }[] {
  const chapitre = chapterAt(book);
  const groupes: { debut: number; fin: number }[] = [];
  for (let i = chapitre.start; i < chapitre.end; i++) {
    const p = book.paragraphs?.[i];
    const dernier = groupes[groupes.length - 1];
    if (dernier && (p === undefined || p === book.paragraphs?.[dernier.debut])) dernier.fin = i + 1;
    else groupes.push({ debut: i, fin: i + 1 });
  }
  return groupes;
}

async function sauterParagraphe(book: Book, direction: -1 | 1) {
  const groupes = paragraphesChapitre(book);
  if (!groupes.length) return;
  const courant = Math.max(0, groupes.findIndex(g => book.position >= g.debut && book.position < g.fin));
  const cible = groupes[Math.max(0, Math.min(groupes.length - 1, courant + direction))];
  follow = true;
  await seekTo(cible.debut);
  syncNowBar();
}

/** Une page : la page feuilletée en mode pages, un écran de texte en défilement. */
function tournerPage(direction: -1 | 1) {
  follow = false;
  if (settings.layout === 'pages') {
    if (page + direction < 0 || page + direction >= pages.length) return;
    page += direction; drawPage(direction === 1 ? 'next' : 'prev'); syncNowBar();
    return;
  }
  guard();
  const hauteur = Math.max(240, innerHeight - (document.querySelector<HTMLElement>('.player')?.getBoundingClientRect().height ?? 0) - 32);
  window.scrollBy({ top: direction * hauteur, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  syncNowBar();
}

function navigation() {
  return `<nav class="navigation" aria-label="Navigation principale"><a class="brand" href="#library" aria-label="PK Reader, bibliothèque"><span class="brand-mark">${icon('audio-lines')}</span><span>pk<span class="brand-light">reader</span><small>LE PLAISIR D’ÉCOUTER</small></span></a><div class="nav-items">${[
    ['library','library-big','Bibliothèque'],['voices','audio-lines','Voix'],['settings','sliders-horizontal','Réglages'],
  ].map(([id, ic, label]) => `<button class="nav-item ${screen===id || (id==='library' && screen==='book')?'selected':''}" data-action="nav" data-id="${id}" ${screen===id || (id==='library' && screen==='book')?'aria-current="page"':''}>${icon(ic)}<span>${label}</span></button>`).join('')}</div><div class="nav-footer">Vos livres restent<br>entre vos mains.${icon('shield-check')}</div></nav>`;
}
function miniPlayer() {
  const book = active(); if (!book || screen === 'reader') return '';
  return `<aside class="mini-player" aria-label="Lecture en cours"><button class="mini-book" data-action="open" data-id="${book.id}">${cover(book,'tiny')}<span><strong>${esc(book.title.replace(/\n/g,' '))}</strong><small>${esc(audio.state.loading?'Préparation de la voix…':chapterAt(book)?.title ?? '')}</small></span></button>${iconButton(audio.state.playing?'pause':'play',audio.state.playing?'Mettre en pause':'Reprendre la lecture','toggle','mini-play')}<div class="mini-progress" style="width:${percent(book)}%"></div></aside>`;
}

/* -------------------------------------------------------------- bibliothèque */

function libraryView() {
  const real = books.filter(b => !b.sample);
  const enCours = real.filter(b => b.position > 0 && !b.completed).length;
  const resume = [...(real.length ? real : books)].sort((a, b) => b.opened - a.opened)[0];
  const filtered = books.filter(b => (filter === 'all' || (filter === 'reading' && b.position > 0 && !b.completed) || (filter === 'finished' && b.completed)) && `${b.title} ${b.author}`.toLowerCase().includes(search.toLowerCase()));
  return `<header class="page-heading library-heading"><div><h1>Bibliothèque<span>.</span></h1></div><button class="add-button" data-action="import" aria-label="Importer un livre">${icon('plus')}<span>Ajouter un livre</span></button></header>
  <div class="search-row expanded" id="search-row"><label class="sr-only" for="search">Rechercher dans la bibliothèque</label>${icon('search')}<input id="search" type="search" placeholder="Rechercher un livre, un auteur…" value="${esc(search)}" autocomplete="off" /></div>
  ${resume && !resume.sample && resume.opened && !search && filter === 'all' ? `<section class="library-resume" aria-label="Reprendre le livre en cours"><button class="resume-open" data-action="open" data-id="${resume.id}">${cover(resume, 'tiny')}<span><small>Reprendre la lecture</small><strong>${esc(resume.title.replace(/\n/g, ' '))}</strong><small>${percent(resume)} % · ${minutes(resume)} restantes</small></span></button><button class="primary" data-action="listen" data-id="${resume.id}">${icon('play')}<span>Écouter</span></button></section>` : ''}
  ${resume?.sample && !search && filter === 'all' ? `<section class="resume-card">
    <div class="resume-copy"><span class="label-dot">${resume.opened?'REPRENDRE LE FIL':'VOTRE PREMIÈRE ÉCOUTE'}</span>
      <h2>${esc(resume.sample?'Vos livres.\nÀ voix haute.':resume.title).replace(/\n/g,'<br>')}</h2>
      <p class="resume-sub">${resume.sample?'Installez-vous. Vos histoires ont<br>tant de choses à vous raconter.':`${esc(resume.author)}<br>${esc(chapterAt(resume)?.title ?? '')}`}</p>
      <div class="resume-figures">${ring(resume)}<span class="resume-time">${resume.sample?'Texte de démonstration':resume.completed?'Lu en entier':`${minutes(resume)} restantes`}</span></div>
      <button class="primary" data-action="listen" data-id="${resume.id}">${icon('play')} ${resume.completed?'Réécouter':resume.opened?'Reprendre l’écoute':'Écouter le guide'}</button></div>
    <button class="hero-book" data-action="open" data-id="${resume.id}" aria-label="Ouvrir ${esc(resume.title.replace(/\n/g,' '))}">${cover(resume,'hero-cover')}</button></section>` : ''}
  <section class="library-section"><div class="section-heading"><h2>Vos livres <span class="count">${books.length}</span></h2></div>
  <div class="library-tools"><div class="segmented" role="group" aria-label="Filtrer les livres">${[['all','Tous'],['reading','En cours'],['finished','Terminés']].map(([id,label]) => `<button data-action="filter" data-id="${id}" class="${filter===id?'active':''}" aria-pressed="${filter===id}">${label}</button>`).join('')}</div><span class="library-count">${real.length ? `${real.length} livre${real.length>1?'s':''}${enCours ? ` · ${enCours} en cours` : ''}` : 'Votre étagère vous attend'}</span></div>
  <div class="books-grid">${filtered.map((b, i) => `<article class="book-item" style="--i:${Math.min(i, 12)}">${b.completed && !b.cover?`<span class="book-flag">Terminé</span>`:''}<button class="book-open" data-action="open" data-id="${b.id}">${cover(b)}<strong>${esc(b.title.replace(/\n/g,' '))}</strong><span>${esc(b.author)}</span></button><div class="book-bottom"><span>${b.completed?'Lu en entier':b.position>0?`${percent(b)} % · ${minutes(b)} restantes`:b.sample?'GUIDE DE DÉCOUVERTE':b.format}</span><button class="book-manage" data-action="book-settings" data-id="${b.id}" aria-label="Gérer ${esc(b.title.replace(/\n/g,' '))}">Gérer</button></div>${b.position>0 && !b.completed?`<div class="book-progress"><span style="width:${percent(b)}%"></span></div>`:''}</article>`).join('')}${filter==='all'&&!search?`<button class="import-tile" data-action="import"><span>${icon('plus')}</span><strong>La suite vous appartient.</strong><small>Importez votre prochain livre<br>EPUB, PDF ou texte</small></button>`:''}</div>
  ${!filtered.length && (search || filter !== 'all') ? `<div class="empty-state">${icon('library-big')}<strong>${search ? 'Aucun livre ne correspond.' : 'Rien sur cette étagère.'}</strong><span>${search ? 'Essayez un autre titre ou le nom de l’auteur.' : 'Changez de filtre pour retrouver vos livres.'}</span></div>` : ''}</section>
  <div class="privacy-note">${icon('lock-keyhole')}<p>Votre bibliothèque, sur votre appareil.<br><span>Sans compte. Sans publicité. Juste vos livres.</span></p></div>
  <p class="build-line">PK Reader <b>${version}</b></p>`;
}

/* ------------------------------------------------------------------ lecture */

function paginate(book: Book, chapter: { start: number; end: number }, width: number, capFirst: number, capOther: number): Page[] {
  const host = document.querySelector<HTMLElement>('.page-measure') ?? (() => {
    const el = document.createElement('div'); el.className = 'reader-text page-measure'; el.setAttribute('aria-hidden', 'true'); document.body.appendChild(el); return el;
  })();
  host.style.width = `${width}px`;
  const pages = paginateReading(book, chapter.start, chapter.end, capFirst, capOther, (runs, height) => {
    host.innerHTML = renderReadingText(book, runs);
    return host.scrollHeight <= height + 1;
  });
  host.innerHTML = '';
  return pages;
}
const pageOf = (index: number) => Math.max(0, pages.findIndex(p => p.some(r => r.index === index)));

function readerHeader() {
  const book = current()!;
  return readerHeaderView(book, analysisChip(castingActivities(), book.id));
}
function readingScroll() {
  const book = current()!; const chapter = chapterAt(book);
  return `<article class="reading-page"><div class="page-title"><h1>${esc(chapter.title)}</h1></div><div class="reader-text">${renderReadingText(book, chapterRuns(book, chapter.start, chapter.end))}</div></article>`;
}
function readingPages() {
  return `<article class="reading-page paged"><div class="page-title"><p class="eyebrow" id="page-eyebrow"></p><h1 id="page-heading"></h1></div><div class="reader-text" id="page-text"></div></article>`;
}
function playerHTML() {
  const book = current()!; const chapter = chapterAt(book);
  const isPlaying = audio.state.bookId === book.id && audio.state.playing;
  const speaker = characterAt(book, book.position)?.name || '';
  const focus = Boolean(settings.focus);
  const status = audio.state.error || (audio.state.preparing?`Préparation ${audio.state.prepared ?? 0} / ${audio.state.total ?? 0} passages`:audio.state.loading?`${speaker?`${speaker} · `:''}La voix prépare le prochain passage…`:isPlaying?`${speaker?`${esc(speaker)} · `:''}${esc(chapter.title)} — laissez l’histoire vous emporter.`:'Touchez une phrase pour choisir le départ.');
  return `<section class="player ${focus ? 'reduit' : ''}" aria-label="Lecteur audio"><div class="player-top"><button class="voice-chip" data-action="choose-voice">${icon('audio-lines')}<span>${esc(characterAt(book, book.position)?.name || voiceName())}</span>${icon('chevron-down')}</button><button class="speed-chip" data-action="speed" aria-label="Vitesse de ${esc(voiceName())}">${settings.rate.toLocaleString('fr')}<span>×</span></button><span class="mini-stats">${percent(book)} % · ${minutes(book)} min</span><button class="sleep-chip ${audio.state.sleepAt?'on':''}" data-action="sleep">${icon('moon')}${audio.state.sleepAt?`${Math.max(1,Math.ceil((audio.state.sleepAt-Date.now())/60000))} min`:'Minuteur'}</button><button class="icon-button" data-action="layout" aria-label="${settings.layout === 'pages' ? 'Passer en défilement continu' : 'Passer en lecture page à page'}">${icon(settings.layout === 'pages' ? 'align-justify' : 'book-open')}</button><button class="icon-button focus-button" data-action="focus" aria-label="${focus?'Afficher les commandes':'Réduire le lecteur'}">${icon(focus?'chevrons-up':'chevrons-down')}</button></div>
    <label class="sr-only" for="progress">Position dans le livre</label><input class="progress-slider" id="progress" type="range" min="0" max="${book.segments.length-1}" value="${Math.min(book.position,book.segments.length-1)}" style="--progress:${progress(book)}" /><div class="time-row"><span>${percent(book)} % du livre</span><span>${book.completed?'Lecture terminée':`${minutes(book)} restantes`}</span></div>
    ${readerNavigationView(book, settings.layout, isPlaying, audio.state.loading)}
    <div class="transport"><button class="sentence-jump" data-action="previous" aria-label="Revenir d’une phrase">${icon('rotate-ccw')}<span>Phrase −1</span></button><button class="play-button ${audio.state.loading?'loading':''}" data-action="toggle" aria-label="${isPlaying?'Mettre en pause':'Lire à voix haute'}">${icon(audio.state.loading?'loader-circle':isPlaying?'pause':'play')}</button><button class="sentence-jump" data-action="next" aria-label="Avancer d’une phrase">${icon('rotate-cw')}<span>Phrase +1</span></button></div><p class="player-status" aria-live="polite">${esc(status)}</p><span class="player-mini-progress" style="width:${percent(book)}%" aria-hidden="true"></span></section>`;
}
function nowBar() {
  return `<aside class="now-bar" id="now-bar" hidden data-action="follow" role="button" tabindex="0" aria-label="Revenir à la phrase en cours"><span class="now-wave" aria-hidden="true"><b></b><b></b><b></b></span><div class="now-copy"><small>EN COURS · <span id="now-chapter"></span></small><p id="now-text"></p></div><span class="now-return">${icon('locate-fixed')}<i>Revenir</i></span></aside>`;
}
function readerView() {
  const book = current()!; if (!book) return libraryView();
  return `${readerHeader()}${settings.layout === 'pages' ? readingPages() : readingScroll()}${nowBar()}${playerHTML()}`;
}

/* ---------------------------------------------------- gérer un livre (page) */

/** Une page de réglages lisible plutôt qu'un menu caché : chaque action est
 *  visible, avec une phrase qui dit exactement ce qu'elle fait. */
function actionRow(action: string, id: string, ic: string, titre: string, description: string, danger = false) {
  return `<button class="action-row ${danger ? 'danger' : ''}" data-action="${action}" data-id="${id}"><span class="action-icon">${icon(ic)}</span><span class="action-copy"><strong>${titre}</strong><small>${description}</small></span>${icon('chevron-right')}</button>`;
}
function bookView() {
  const book = current();
  if (!book) { screen = 'library'; return libraryView(); }
  const etapes = etapesLivre(book, [...voices, ...models], {
    busy: castingBusy(book),
    progress: castingProgress(book),
    setup: bookSetup === book.id ? (setupStatus || 'Préparation en cours…') : '',
    ia: !!(settings.ia?.enabled && settings.ia.modele && settings.ia.revision),
  });
  const pretes = etapes.filter(e => e.etat === 'done').length;
  const icone = (etat: string) => etat === 'done' ? 'check' : etat === 'running' ? 'loader' : etat === 'error' ? 'alert-triangle' : 'circle';
  return `<header class="book-page-head">${iconButton('arrow-left','Retour à la bibliothèque','back')}<div><p class="eyebrow">VOTRE LIVRE</p><h1>${esc(book.title.replace(/\n/g,' '))}</h1><p>${esc(book.author)} · ${book.format}${book.completed ? ' · lu en entier' : book.position > 0 ? ` · ${percent(book)} %` : ''}</p></div></header>
  <section class="book-hero"><div class="book-detail-cover">${cover(book)}</div><div class="book-hero-copy"><p class="section-description">${book.position > 0 ? `${percent(book)} % lu${book.completed ? '' : ` · ${minutes(book)} restantes`}` : 'Pas encore commencé'}</p><button class="primary" data-action="listen" data-id="${book.id}">${icon('play')} ${book.completed ? 'Réécouter' : book.position > 0 ? 'Reprendre l’écoute' : 'Écouter'}</button></div></section>
  <section class="settings-section"><div class="section-heading"><h2>Progression</h2><span class="pill">${pretes}/4 PRÊTES</span></div>
    <ol class="book-steps">${etapes.map(e => `<li class="book-step ${e.etat}">
      <span class="step-icon">${icon(icone(e.etat))}</span>
      <div class="step-copy"><div class="step-head"><strong>${esc(e.titre)}</strong><span class="step-pct">${e.pct} %</span></div>
      <small>${esc(e.detail)}</small><span class="step-track" aria-hidden="true"><i style="width:${e.pct}%"></i></span></div>
      <button class="small-button" data-action="${e.action}" data-id="${book.id}">${esc(e.libelle)}</button>
    </li>`).join('')}</ol>
    <button class="setting-row" data-action="relancer-tout" data-id="${book.id}"><span>${icon('refresh-cw')} Tout relancer</span><strong>Paragraphes, analyse, voix, lecture ${icon('chevron-right')}</strong></button>
  </section>
  <section class="settings-section"><h2>Réglages du livre</h2>
    ${actionRow('appearance', book.id, 'text-cursor-input', 'Réglages de lecture', 'Taille du texte, thème, marges, mise en page et surlignage.')}
    ${actionRow('prepare', book.id, 'download', 'Emporter le chapitre en cours', 'Prépare les passages audio pour l’écoute hors ligne.')}
    ${actionRow('clear-audio', book.id, 'hard-drive', 'Effacer les audios préparés', 'Libère l’espace des passages déjà générés. Les chapitres se réécoutent en direct ou se préparent à nouveau.')}
  </section>
  <section class="settings-section danger-zone"><h2>Supprimer</h2>
    ${actionRow('delete-confirm', book.id, 'trash-2', 'Supprimer ce livre de la bibliothèque', 'Retire le livre, sa position et ses signets. Le fichier d’origine reste intact.', true)}
  </section>`;
}

/* ------------------------------------------------------- montage page à page */

function mountPages(reset = false) {
  const book = current(); if (!book) return;
  const chapter = chapterAt(book);
  const box = document.querySelector<HTMLElement>('#page-text'); if (!box) return;
  /* Le titre du chapitre compte dans la capacité de la page : il est rempli avant toute mesure. */
  const eyebrow = document.querySelector('#page-eyebrow'); const heading = document.querySelector('#page-heading');
  if (eyebrow) eyebrow.textContent = book.sample ? 'PRENDRE LE TEMPS' : book.author.toUpperCase();
  if (heading) heading.textContent = chapter.title;
  const key = [book.id, chapter.start, settings.fontSize, settings.theme, innerWidth, innerHeight, pagesHauteur].join(':');
  if (reset || key !== pagesKey || pagesChapter !== chapter.start) {
    const title = document.querySelector<HTMLElement>('.page-title');
    title?.style.removeProperty('display');
    const capFull = box.clientHeight;
    title?.style.setProperty('display', 'none');
    const capNoTitle = box.clientHeight;
    title?.style.removeProperty('display');
    const showTitle = capFull >= 150;
    pages = paginate(book, chapter, box.clientWidth, showTitle ? capFull : capNoTitle, capNoTitle);
    pagesKey = key; pagesChapter = chapter.start;
    if (reset || follow) page = pageOf(book.position);
    page = clamp(page, 0, pages.length - 1);
  }
  drawPage();
}
function drawPage(direction?: 'next' | 'prev' | 'auto') {
  const book = current(); if (!book) return;
  const chapter = chapterAt(book);
  const title = document.querySelector<HTMLElement>('.page-title');
  const box = document.querySelector<HTMLElement>('#page-text');
  const footer = document.querySelector<HTMLElement>('#page-footer');
  if (!box || !footer) return;
  const first = page === 0;
  if (title) {
    title.style.display = first ? '' : 'none';
    const eyebrow = document.querySelector('#page-eyebrow'); const heading = document.querySelector('#page-heading');
    if (eyebrow) eyebrow.textContent = book.sample ? 'PRENDRE LE TEMPS' : book.author.toUpperCase();
    if (heading) heading.textContent = chapter.title;
  }
  box.innerHTML = renderReadingText(book, pages[page] ?? []);
  box.classList.remove('turn-next', 'turn-prev');
  if (direction === 'next' || direction === 'prev') { void box.offsetWidth; box.classList.add(direction === 'next' ? 'turn-next' : 'turn-prev'); }
  syncPageControls();
  decorate();
}
function syncNowBar() {
  const bar = document.querySelector<HTMLElement>('#now-bar'); if (!bar) return;
  const book = active();
  const sentence = document.querySelector<HTMLElement>('.current-sentence');
  const rect = sentence?.getBoundingClientRect();
  const playerTop = document.querySelector('.player')?.getBoundingClientRect().top ?? innerHeight;
  const headerBottom = document.querySelector('.reader-header')?.getBoundingClientRect().bottom ?? 0;
  const outside = !rect || rect.bottom < headerBottom || rect.top > playerTop;
  const visible = screen === 'reader' && !!book && currentId === book.id && !follow &&
    (audio.state.playing || audio.state.loading) && outside && !!book.segments[book.position];
  bar.hidden = !visible;
  if (!book || !visible) return;
  const chapter = document.querySelector('#now-chapter'); const text = document.querySelector('#now-text');
  const speaker = characterAt(book, book.position)?.name;
  if (chapter) chapter.textContent = [chapterAt(book).title, speaker].filter(Boolean).join(' · ');
  if (text) text.textContent = book.segments[book.position];
}
function observePlayer() {
  playerObserver?.disconnect();
  const player = document.querySelector<HTMLElement>('.player'); if (!player) return;
  const apply = () => {
    const hauteur = Math.ceil(player.getBoundingClientRect().height);
    document.documentElement.style.setProperty('--player-h', `${hauteur}px`);
    // Le lecteur se replie ou se déplie : les pages sont redécoupées pour
    // remplir l'espace réellement disponible, jamais avec une hauteur périmée.
    if (hauteur !== pagesHauteur) {
      pagesHauteur = hauteur;
      if (screen === 'reader' && settings.layout === 'pages' && document.querySelector('#page-text')) mountPages();
    }
  };
  apply();
  playerObserver = new ResizeObserver(apply);
  playerObserver.observe(player);
}
function replacePlayer() {
  const player = document.querySelector('.player'); if (!player) return;
  const temp = document.createElement('div'); temp.innerHTML = playerHTML();
  player.replaceWith(temp.querySelector('.player')!); syncPageControls(); decorate(); observePlayer();
}
function syncPageControls() {
  if (settings.layout !== 'pages') return;
  const label = document.querySelector('#page-footer');
  if (label) label.innerHTML = `<b>${page + 1}</b> / ${pages.length || 1}`;
  // Les boutons Page existent en double : navigation complète et mini-lecteur.
  document.querySelectorAll<HTMLButtonElement>('[data-action="page-prev"]').forEach(bouton => { bouton.disabled = page <= 0; });
  document.querySelectorAll<HTMLButtonElement>('[data-action="page-next"]').forEach(bouton => { bouton.disabled = page >= pages.length - 1; });
}
function refreshReaderAnalysis() {
  const host = document.querySelector('#reader-analysis');
  const book = current();
  if (host && book) host.innerHTML = analysisChip(castingActivities(), book.id);
}
const karaoke = { index: -1, mot: -1 };

const behaviorDoux = (): ScrollBehavior => matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth';

/** Le suivi ne bouge que si l'élément sort de la bande de confort : la page reste calme. */
function centrerSiBesoin(element: HTMLElement | null) {
  if (!element) return;
  const bande = Math.min(0.4, Math.max(0.18, settings.bande ?? 0.28));
  const rect = element.getBoundingClientRect();
  if (rect.top < innerHeight * bande || rect.bottom > innerHeight * (1 - bande)) {
    element.scrollIntoView({ block: 'center', behavior: behaviorDoux() });
  }
}

function suivreMot(phrase: HTMLElement) {
  if (!follow) return;
  centrerSiBesoin(phrase.querySelector<HTMLElement>('.mot-actif'));
}

/** Karaoké : la phrase en cours est rendue mot à mot, le mot lu en surbrillance.
 *  TTS Android = plage exacte ; WAV Piper = estimation au prorata des caractères. */
function syncKaraoke() {
  const book = active();
  const courante = document.querySelector<HTMLElement>('.sentence.current-sentence');
  document.querySelectorAll<HTMLElement>('.sentence[data-karaoke]').forEach((autre) => {
    if (autre === courante) return;
    if (autre.dataset.texte != null) autre.textContent = autre.dataset.texte;
    delete autre.dataset.karaoke; delete autre.dataset.texte;
  });
  if (!book || !courante) return;
  if ((settings.surlignage ?? 'mots') !== 'mots') {
    // suivi sans surlignage des mots : on garde seulement le repère de phrase
    if (courante.dataset.karaoke) { courante.textContent = courante.dataset.texte ?? courante.textContent; delete courante.dataset.karaoke; delete courante.dataset.texte; }
    return;
  }
  const debut = Number(courante.dataset.debut || 0);
  const texte = courante.dataset.texte ?? courante.textContent ?? '';
  courante.dataset.texte = texte;
  const mots = decouperMots(texte);
  let actif = -1;
  if (audio.state.bookId === book.id && audio.state.playing && !audio.state.loading) {
    if (audio.state.mot) actif = motPourPlage(mots, audio.state.mot.debut - debut, audio.state.mot.fin - debut);
    else if (audio.state.duree) actif = motPourProgression(mots, audio.state.position ?? 0, audio.state.duree);
  } else if (karaoke.index === book.position) {
    actif = karaoke.mot;                       // à l'arrêt : le dernier mot lu reste marqué
  }
  const cle = `${book.position}:${actif}`;
  if (courante.dataset.karaoke !== cle) {
    courante.dataset.karaoke = cle;
    courante.innerHTML = rendreMots(texte, actif, esc);
  }
  karaoke.index = book.position; karaoke.mot = actif;
  suivreMot(courante);
}

function syncHighlight() {
  const book = current(); if (!book) return;
  document.querySelectorAll('.sentence').forEach(el => {
    const selected = Number((el as HTMLElement).dataset.index) === book.position;
    el.classList.toggle('current-sentence', selected);
    if (selected) el.setAttribute('aria-current', 'true'); else el.removeAttribute('aria-current');
  });
  syncKaraoke();
}
function jumpToCurrent() {
  const book = current(); if (!book) return;
  if (settings.layout === 'pages') { page = pageOf(book.position); drawPage('auto'); return; }
  guard();
  document.querySelector('.current-sentence')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
}
async function seekTo(index: number) {
  follow = true;
  await audio.seek(index);
  if (screen !== 'reader' || audio.state.playing) return;
  if (settings.layout === 'pages') { page = pageOf(index); drawPage('auto'); }
  else { guard(); document.querySelector('.current-sentence')?.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
}

/* -------------------------------------------------------------------- voix */

function voiceCard(v: Voice, index: number) {
  const selected = settings.voice === v.id;
  return `<article class="voice-card ${selected?'chosen':''}"><div class="voice-card-main"><span class="voice-avatar avatar-${index%4}">${icon(v.kind==='clone'?'mic':'audio-lines')}</span><div><h3>${esc(v.name)} ${selected?icon('circle-check'):''}</h3><p>${esc(v.detail ?? `${v.language} · ${v.network?'connexion requise':'sur cet appareil'}`)}</p></div></div><div class="voice-card-bottom"><span class="voice-status">${icon(v.installed?'check':'download')}${v.installed?(v.network?'En ligne':'Disponible'): `${v.size} Mo · hors ligne après installation`}</span><div>${v.installed?`<button class="text-button" data-action="preview" data-id="${esc(v.id)}" aria-label="Écouter ${esc(v.name)}">${icon('play')}</button><button class="small-button ${selected?'selected':''}" data-action="select-voice" data-id="${esc(v.id)}">${selected?'Choisie':'Choisir'}</button>${v.kind==='neural'?`<button class="text-button" data-action="remove-model" data-id="${esc(v.id)}" aria-label="Supprimer ${esc(v.name)}">${icon('trash-2')}</button>`:''}`:`<button class="small-button" data-action="install" data-id="${esc(v.id)}">${icon('download')} Télécharger</button>`}</div></div></article>`;
}
function voiceOption(v: Voice) {
  const selected = settings.voice === v.id;
  return `<button class="voice-option ${selected?'selected':''}" data-action="select-voice" data-id="${esc(v.id)}" role="menuitemradio" aria-checked="${selected}"><span class="voice-option-copy"><span class="voice-option-name">${esc(v.name)}</span><small>${esc(v.detail ?? v.language)}</small></span>${selected?`<span class="voice-option-check">${icon('check')}</span>`:''}</button>`;
}
const langueDe = (v: Voice) => (v.language || '').toLowerCase().split('-')[0];
/** Voix du téléphone visibles : français par défaut, toutes sur demande. */
const voixTelephone = () => settings.voiceLangues
  ? voices
  : voices.filter(v => langueDe(v) === 'fr' || v.id === settings.voice);
const autresLangues = () => voices.filter(v => langueDe(v) !== 'fr' && v.id !== settings.voice).length;
function quickVoiceBody() {
  const installed = models.filter(m => m.installed);
  const section = (title: string, list: Voice[], limit = 8) => !list.length ? '' : `<h3 class="sheet-group">${title}</h3><div class="voice-options" role="menu">${list.slice(0, limit).map(voiceOption).join('')}</div>`;
  const muettes = autresLangues();
  return `<p class="sheet-description">La voix choisie s’applique tout de suite à cette écoute.</p>${section('Mes clones', clones)}${section('Voix téléchargées', installed)}${section('Voix du téléphone', voixTelephone())}${muettes ? `<button class="setting-row" data-action="voice-langues"><span>${icon('languages')} ${settings.voiceLangues ? 'Masquer' : 'Afficher'} les ${muettes} voix des autres langues</span>${icon('chevron-right')}</button>` : ''}<button class="setting-row" data-action="nav" data-id="voices"><span>${icon('sliders-horizontal')} Télécharger ou gérer les voix</span>${icon('chevron-right')}</button>`;
}
function voicesView() {
  const list = voiceTab === 'neural' ? models : voiceTab === 'clone' ? clones : voixTelephone();
  const masquees = voiceTab === 'system' ? autresLangues() : 0;
  return `<header class="page-heading"><div><p class="eyebrow">À CHAQUE HISTOIRE, SA VOIX</p><h1>À l’écoute<span>.</span></h1></div><span class="heading-icon">${icon('audio-lines')}</span></header><section class="voice-intro"><span class="voice-orbit">${icon('audio-lines')}</span><div><h2>Le ton juste.<br>Pour tous vos livres.</h2><p>Une voix familière, un nouveau timbre.<br>Choisissez celle que vous aimez entendre.</p></div></section><div class="segmented voice-tabs" role="group" aria-label="Types de voix">${[['neural','À télécharger'],['system','Mon téléphone'],['clone','Mes clones']].map(([id,label])=>`<button data-action="voice-tab" data-id="${id}" class="${voiceTab===id?'active':''}" aria-pressed="${voiceTab===id}">${label}</button>`).join('')}</div><div class="voice-list">${list.map(voiceCard).join('')}</div><p id="download-status" role="status"></p>${voiceTab==='clone'&&!clones.length?`<div class="empty-card">${icon('mic')}<h2>Votre propre voix, dans vos livres.</h2><p>Connectez PK Voice Studio sur votre Mac pour retrouver vos voix clonées et générer les passages à écouter.</p><button class="primary" data-action="nav" data-id="settings">Connecter mon studio ${icon('arrow-right')}</button></div>`:''}${voiceTab==='system'?`${masquees?`<button class="setting-row" data-action="voice-langues"><span>${icon('languages')} ${settings.voiceLangues ? 'Masquer' : 'Afficher'} ${masquees} voix dans d’autres langues</span>${icon('chevron-right')}</button>`:''}<button class="setting-row" data-action="voice-settings"><span>${icon('settings-2')} Installer ou régler les voix Android</span>${icon('arrow-up-right')}</button>`:''}<div class="privacy-note">${icon('wifi-off')}<p>${voiceTab==='neural'?'Un téléchargement, puis la liberté.':'Vous gardez le choix.'}<br><span>${voiceTab==='neural'?'Les voix Piper lisent directement sur votre téléphone.':'Les voix clonées sont générées par votre studio, puis mises en cache.'}</span></p></div>${!native?'<p class="web-note">Aperçu web : les voix du navigateur sont utilisables ici. Les modèles Piper et les voix du studio fonctionnent dans l’app Android.</p>':''}`;
}

/* ------------------------------------------------------------------ réglages */

function updateSection() {
  const size = updateInfo?.size ? `${Math.round(updateInfo.size / 1048576)} Mo` : '';
  const disponible = !!updateInfo?.available;
  const versionDispo = updateInfo?.version ?? '';
  const erreur = updateState === 'error' ? (updateMessage || 'La vérification a échoué.') : '';
  const detail = updateState === 'checking' ? 'Recherche de la dernière version publiée sur GitHub…'
    : updateState === 'downloading' ? 'Téléchargement de la nouvelle version en cours…'
    : updateState === 'ready' ? 'Le téléchargement est terminé. Installez la mise à jour pour en profiter.'
    : updateState === 'error' ? 'Une erreur est survenue pendant la mise à jour.'
    : disponible ? `La version ${versionDispo} est disponible${size ? ` · ${size}` : ''}.`
    : updateMessage ? 'Aucune nouvelle version : vous êtes à jour.'
    : 'Vérifiez les nouveautés publiées sur GitHub.';
  const badge = updateState === 'checking' ? 'VÉRIFICATION'
    : updateState === 'downloading' ? 'TÉLÉCHARGEMENT'
    : updateState === 'ready' ? 'PRÊTE À INSTALLER'
    : updateState === 'error' ? 'ÉCHEC'
    : disponible ? 'NOUVELLE VERSION'
    : updateMessage ? 'À JOUR' : 'À VÉRIFIER';
  const progress = updateState === 'downloading'
    ? `<div class="update-bar"><span id="update-progress" style="width:${updateProgress}%"></span></div><p class="update-note" id="update-percent">${updateProgress} % · gardez l’application ouverte</p>` : '';
  const action = updateState === 'checking'
    ? `<button class="primary update-action" disabled>${icon('refresh-cw')} Vérification…</button>`
    : updateState === 'downloading'
    ? `<button class="primary update-action" disabled>${icon('download')} Téléchargement · ${updateProgress} %</button>`
    : updateState === 'ready'
    ? `<button class="primary update-action" data-action="install-update">${icon('download')} Installer la mise à jour</button><button class="link-button" data-action="update-permission">Autoriser l’installation</button>`
    : updateState === 'error'
    ? (disponible
        ? `<button class="primary update-action" data-action="update-now">${icon('download')} Réessayer le téléchargement</button>`
        : `<button class="primary update-action" data-action="check-update">${icon('refresh-cw')} Réessayer la vérification</button>`)
    : disponible
    ? `<button class="primary update-action" data-action="update-now">${icon('download')} Télécharger et installer</button>`
    : `<button class="primary update-action" data-action="check-update">${icon('refresh-cw')} Vérifier les mises à jour</button>`;
  const notes = disponible && updateInfo?.notes
    ? `<details class="update-notes-block"><summary>Nouveautés de la ${esc(versionDispo)}</summary><p class="update-notes">${esc(updateInfo.notes)}</p></details>` : '';
  const release = disponible && updateInfo?.page
    ? `<a class="link-button update-release-link" href="${esc(updateInfo.page)}" target="_blank" rel="noopener noreferrer">Voir la release sur GitHub ${icon('arrow-up-right')}</a>` : '';
  return `<section class="update-hero ${disponible ? 'has-update' : ''}" aria-labelledby="update-title">
    <div class="update-hero-top">
      <span class="update-icon">${icon(disponible ? 'sparkles' : 'refresh-cw')}</span>
      <div class="update-hero-copy">
        <div class="update-kicker"><p class="eyebrow">PK READER</p><span class="update-badge ${disponible ? 'accent' : ''}">${badge}</span></div>
        <h2 id="update-title">Mises à jour</h2>
        <p class="update-hero-detail">Version actuelle <strong>${version}</strong>. ${esc(detail)}</p>
      </div>
    </div>
    ${progress}${erreur ? `<p class="update-note error">${esc(erreur)}</p>` : ''}${action}${notes}${release}
    ${!native ? '<p class="web-note">La mise à jour intégrée fonctionne dans l’APK Android.</p>' : ''}
  </section>`;
}

function settingsView() {
  return settingsViewHTML({ settings, tab: settingsTab, version, native, updateHTML: updateSection() });
}

/* ------------------------------------------------------------------- rendu */

function render() {
  savePrefs();
  app.dataset.screen = screen;
  app.className = `app-shell ${screen==='reader'?'reader-mode':''} layout-${settings.layout} ${active()?'has-player':''}`;
  app.innerHTML = `${navigation()}<main id="main" class="main-content ${screen==='reader'?'reader-content':''}"><div id="analysis-activities" role="region" aria-label="Tâches en cours" aria-live="polite" aria-relevant="additions text">${backgroundActivities()}</div>${screen==='library'?libraryView():screen==='reader'?readerView():screen==='voices'?voicesView():screen==='book'?bookView():settingsView()}</main>${miniPlayer()}`;
  orchestrerFermeture();
  decorate();
  if (screen === 'reader') {
    observePlayer();
    if (settings.layout === 'pages') mountPages(true); else syncHighlight();
    syncNowBar();
    if (!fontsChecked) { fontsChecked = true; void document.fonts?.ready.then(() => { pagesKey = ''; if (screen === 'reader' && settings.layout === 'pages') render(); }); }
  }
}
function modal(title: string, body: string) {
  sheet.setAttribute('aria-labelledby', 'sheet-title');
  sheet.innerHTML = `<div class="sheet-handle"></div><header><h2 id="sheet-title">${title}</h2>${iconButton('x','Fermer','close')}</header>${body}`;
  if (!sheet.open) sheet.showModal(); decorate();
}
const allVoices = () => [...voices, ...models];
function castingSheet(book: Book) {
  return openCasting(book, allVoices(), settings, modal, render, updated => { models = updated; });
}
function prepareBook(book: Book) {
  if (!book.sample && (analyseLocalePerimee(book) || book.casting?.analysis?.state !== 'ready')) {
    // Le chapitre à l'écoute passe devant : la lecture profite de l'analyse
    // affinée sans attendre que tout le livre soit traité.
    void prepareCasting(book, allVoices(), settings, { priorite: chapterAt(book).start })
      .catch(error => toast(`${book.title} : ${error instanceof Error ? error.message : error}`));
  }
}
watchCasting(id => {
  const book = books.find(b => b.id === id);
  if (!book) return;
  if (chapterReview?.book.id === id && !chapterReview.ready && chapterAnalysisReady(book, settings)) {
    chapterReview.ready = true;
    chapterReview.choices = proposeChapterVoices(book, [...allVoices(), ...clones]);
    drawChapterReview();
  } else if (chapterReview?.book.id === id && !chapterReview.ready) drawChapterReview();
  if (!castingBusy(book)) {
    // Distribution affinée pendant l'écoute : la file audio est rechargée au
    // prochain changement de chapitre pour ne pas couper le passage en cours.
    if (audio.state.bookId === id) rafraichissementAttente = id;
    if (screen === 'library') { render(); return; }
  }
  // La page « Gérer le livre » montre l'avancement des quatre étapes en direct.
  if (screen === 'book' && currentId === id) { render(); return; }
  refreshActivities();
});
function refreshActivities() {
  // Pastille flottante hors lecteur ; puce du lecteur sinon. La bulle ne
  // décale plus la mise en page : aucun repagination nécessaire.
  if (screen === 'reader') refreshReaderAnalysis();
  const region = document.querySelector('#analysis-activities');
  if (!region) return;
  // Ne pas perdre le focus clavier à chaque phase IA.
  const focused = region.contains(document.activeElement) ? document.activeElement as HTMLElement : null;
  const action = focused?.dataset.action, id = focused?.dataset.id;
  region.innerHTML = backgroundActivities();
  decorate();
  if (action) [...region.querySelectorAll<HTMLElement>('[data-action]')]
    .find(el => el.dataset.action === action && el.dataset.id === id)?.focus({ preventScroll: true });
  orchestrerFermeture();
}
function backgroundActivities() {
  return downloadActivityView(voiceDownloads()) + (screen === 'reader' ? '' : activityView(castingActivities()));
}
watchVoiceDownloads(updated => {
  if (updated) models = updated;
  if (screen === 'voices') render(); else refreshActivities();
});
/** Un bilan « Analyse terminée » se ferme seul après quelques secondes ; une
 *  erreur reste jusqu'à ce qu'on la lise et la ferme. */
const fermeturesProgrammees = new Map<string, ReturnType<typeof setTimeout>>();
function orchestrerFermeture() {
  for (const item of castingActivities()) {
    if (item.state !== 'done' || fermeturesProgrammees.has(item.id)) continue;
    fermeturesProgrammees.set(item.id, setTimeout(() => {
      fermeturesProgrammees.delete(item.id);
      dismissCastingActivity(item.id);
      refreshActivities();
    }, 6000));
  }
}
/** Séquence unique : analyse prioritaire du chapitre, voix, lecture immédiate,
 *  puis suite en arrière-plan. Utilisée par « Préparer et écouter » et
 *  « Tout relancer ». */
async function lancerPreparation(b: Book) {
  if (castingBusy(b) || bookSetup) { toast('Une préparation est déjà en cours pour ce livre.'); return; }
  bookSetup = b.id; setupStatus = 'Démarrage de la préparation…';
  sheet.close(); render();
  const statut = (texte: string) => {
    setupStatus = texte;
    if (screen === 'book' && currentId === b.id) render();
    toast(texte);
  };
  try {
    await preparerLivreAudio(b, allVoices(), settings, statut, async () => {
      currentId = b.id; b.opened = Date.now();
      await library.save(b);
      screen = 'reader'; follow = true; page = 0; pagesKey = ''; chapitreCharge = chapterAt(b).start;
      await audio.load(b, settings);
      render();
      await requestChapterPlayback(b);
    });
  } catch (e) {
    toast(e instanceof Error ? e.message : String(e));
  } finally {
    bookSetup = null; setupStatus = '';
    if (screen === 'book' && currentId === b.id) render();
  }
}

function drawChapterReview() {
  if (!chapterReview) return;
  modal('Les voix de ce chapitre', chapterReviewView(chapterReview.book, chapterReview.choices,
    [...allVoices(), ...clones], chapterReview.ready, chapterReview.working));
}

async function requestChapterPlayback(book: Book) {
  if (chapterPlaybackRequest) return;
  chapterPlaybackRequest = true;
  try {
    if (book.sample) { await audio.play(); return; }
    prepareBook(book);
    const ready = chapterAnalysisReady(book, settings);
    const choices = proposeChapterVoices(book, [...allVoices(), ...clones]);
    const installed = (id: string) => id === 'system:default' || [...allVoices(), ...clones].some(v => v.id === id && v.installed);
    if (ready && choices.every(c => c.confirmed && installed(c.voice))) {
      await audio.load(book, settings); await audio.play(); return;
    }
    chapterReview = { book, start: chapterAt(book).start, choices: ready ? choices : [], ready, working: false };
    await audio.pause();
    drawChapterReview();
  } finally { chapterPlaybackRequest = false; }
}

async function confirmChapterReview() {
  const review = chapterReview;
  if (!review || !review.ready || review.working) return;
  if (chapterAt(review.book).start !== review.start) {
    chapterReview = undefined; await requestChapterPlayback(review.book); return;
  }
  const selection: Record<string, string> = {};
  sheet.querySelectorAll<HTMLSelectElement>('[data-role-id]').forEach(select => { selection[select.dataset.roleId!] = select.value; });
  const latest = proposeChapterVoices(review.book, [...allVoices(), ...clones]);
  if (latest.some(c => !review.choices.some(old => old.role.id === c.role.id))) {
    review.choices = latest; drawChapterReview(); return;
  }
  review.working = true;
  try {
    confirmChapterVoices(review.choices, selection);
    await library.save(review.book);
    drawChapterReview();
    for (const id of new Set(review.choices.map(c => c.role.voice))) {
      const voice = [...allVoices(), ...clones].find(v => v.id === id);
      if (voice && !voice.installed) {
        await installVoice(id, voice.name);
        while (true) {
          const result = await Reader.models(); models = result.voices;
          if (result.downloads[id]?.error) throw new Error(result.downloads[id].error);
          if (result.voices.some(v => v.id === id && v.installed)) break;
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    }
    if (chapterReview !== review) return;
    chapterReview = undefined; sheet.close();
    currentId = review.book.id; screen = 'reader'; follow = true; pagesKey = '';
    await audio.load(review.book, settings); render(); await audio.play();
  } catch (error) {
    review.working = false;
    if (chapterReview === review) {
      drawChapterReview();
      const status = sheet.querySelector('.chapter-review-status');
      if (status) status.textContent = error instanceof Error ? error.message : String(error);
    }
  }
}

async function openBook(id: string, listen = false) {
  const ancien = books.find(b => b.id === id);
  if (ancien && (!ancien.paragraphs || ancien.paragraphs.length !== ancien.segments.length)) {
    reparerParagraphes(ancien);            // livres importés avant le suivi des paragraphes
    await library.save(ancien);
  }
  sheet.close();
  const book = books.find(b => b.id === id); if (!book) return;
  const distributionPerimee = analyseLocalePerimee(book);
  prepareBook(book);
  currentId = id; book.opened = Date.now();
  if (book.completed && listen) { book.position = 0; book.completed = false; }
  await library.save(book);
  screen = 'reader'; follow = true; page = 0; pagesKey = '';
  if (audio.state.bookId !== id || distributionPerimee) await audio.load(book, settings);
  render();
  if (listen) await requestChapterPlayback(book);
  else if (settings.layout === 'pages') jumpToCurrent();
  else { guard(); document.querySelector('.current-sentence')?.scrollIntoView({ block: 'center' }); }
}
async function importFiles(files: File[]) {
  if (importing) return; importing = true; sheet.close(); toast('Import des livres…');
  let count = 0; const imported: Book[] = [];
  for (const file of files) {
    try {
      const book = await importBook(file);
      normaliserTitresChapitres(book);
      if (books.some(b => b.id === book.id)) { toast(`${book.title} est déjà dans votre bibliothèque.`); continue; }
      await library.save(book); books.unshift(book); imported.push(book); count++;
      prepareBook(book);
    } catch (e) { toast(`${file.name} : ${e instanceof Error?e.message:e}`); }
  }
  importing = false; screen = 'library'; filter = 'all'; search = ''; render();
  if (count) toast(`${count} livre${count>1?'s':''} ajouté${count>1?'s':''} à votre bibliothèque.`);
  fileInput.value = '';
  if (imported.length === 1) { currentId = imported[0].id; screen = 'book'; render(); }
}

/* ------------------------------------------------------------ lecture suivie */

function updatePlayback() {
  const pendingKey = `${audio.state.bookId}:${audio.state.index}`;
  if (!audio.state.awaitingChapter) chapterPendingKey = '';
  if (audio.state.awaitingChapter && !chapterReview && !chapterPlaybackRequest && chapterPendingKey !== pendingKey) {
    chapterPendingKey = pendingKey;
    const target = active();
    if (target && audio.state.index < target.segments.length) {
      target.position = audio.state.index;
      void requestChapterPlayback(target).catch(error => toast(String(error)));
    }
  }
  // La progression (position du WAV, mot du TTS) arrive ~5 fois par seconde :
  // on ne redessine que le karaoké, pas toute la page.
  const lecture = active();
  const signature = lecture ? `${lecture.id}:${audio.state.index}:${audio.state.playing}:${audio.state.loading}:`
    + `${audio.state.error ?? ''}:${audio.state.preparing ? 1 : 0}:${audio.state.prepared ?? 0}:${audio.state.sleepAt ?? 0}` : '';
  const progressionSeule = signature === derniereLecture;
  derniereLecture = signature;
  if (progressionSeule && lecture) { syncKaraoke(); return; }
  if (wasPreparing && !audio.state.preparing && !audio.state.error && audio.state.prepared === audio.state.total && (audio.state.total ?? 0) > 0) toast('Chapitre prêt à être écouté hors ligne.');
  wasPreparing = !!audio.state.preparing;
  const book = active();
  if (!book) { if (audio.state.error) toast(audio.state.error); syncNowBar(); return; }
  const changed = savedPosition !== `${book.id}:${audio.state.index}`;
  book.position = audio.state.index; book.completed = book.position >= book.segments.length;
  if (changed) { savedPosition = `${book.id}:${book.position}`; void library.save(book).catch(e => toast(String(e))); }

  // L'analyse s'est affinée pendant l'écoute : au changement de chapitre, la
  // file est reconstruite avec la distribution à jour — jamais en plein passage.
  const chapitreCourant = chapterAt(book);
  if (rafraichissementAttente === book.id && audio.state.bookId === book.id
      && chapitreCourant.start !== chapitreCharge && !audio.state.preparing) {
    rafraichissementAttente = '';
    const reprise = audio.state.playing; const index = audio.state.index;
    void (async () => {
      await audio.load(book, settings);
      await audio.seek(index);
      if (reprise) await audio.play();
    })().catch(e => toast(e instanceof Error ? e.message : String(e)));
  }
  chapitreCharge = chapitreCourant.start;

  if (screen === 'reader' && currentId === book.id) {
    const chapter = chapterAt(book);
    if (pagesChapter !== chapter.start && settings.layout === 'pages') { render(); }
    else if (settings.layout === 'pages') {
      const target = pageOf(book.position);
      if (follow && changed && target !== page) { page = target; drawPage('auto'); }
      else syncHighlight();
      replacePlayer();
    } else {
      syncHighlight();
      if (changed && follow && audio.state.playing) {
        guard();
        centrerSiBesoin(document.querySelector<HTMLElement>('.current-sentence'));
      }
      replacePlayer();
    }
  } else {
    const old = document.querySelector('.mini-player');
    if (old) old.outerHTML = miniPlayer(); else app.insertAdjacentHTML('beforeend', miniPlayer());
    app.classList.add('has-player'); decorate();
  }
  syncNowBar();
}
audio.onChange = updatePlayback;
sheet.addEventListener('close', () => { chapterReview = undefined; });

/* -------------------------------------------------------------- mises à jour */

/** Les mises à jour se pilotent depuis Réglages : ne pas redessiner une autre page. */
function renderUpdateUI() {
  if (screen === 'settings') render();
}

async function checkUpdate() {
  if (!native) { toast('Les mises à jour se vérifient dans l’application Android.'); return; }
  updateState = 'checking';
  updateMessage = '';
  updateProgress = 0;
  updatePath = '';
  renderUpdateUI();
  try {
    updateInfo = await Update.check();
    updateState = updateInfo.available ? 'available' : 'idle';
    updateMessage = updateInfo.available ? '' : 'PK Reader est à jour.';
  } catch (error) {
    updateInfo = null;
    updateState = 'error';
    updateMessage = `Vérification impossible : ${error instanceof Error ? error.message : error}`;
  }
  renderUpdateUI();
}

async function downloadUpdate() {
  if (!native || !updateInfo?.available || !updateInfo.url || !updateInfo.version) return;
  updateState = 'downloading';
  updateProgress = 0;
  updateMessage = '';
  updatePath = '';
  renderUpdateUI();
  try {
    const result = await Update.download({
      url: updateInfo.url,
      version: updateInfo.version,
      digest: updateInfo.digest,
      size: updateInfo.size,
    });
    updatePath = result.path;
    updateState = 'ready';
    updateProgress = 100;
    updateMessage = 'Téléchargement terminé.';
    renderUpdateUI();
    await installUpdate();
  } catch (error) {
    updateState = 'error';
    updateMessage = error instanceof Error ? error.message : String(error);
    renderUpdateUI();
  }
}

async function installUpdate() {
  if (!native || !updatePath) return;
  try {
    const permission = await Update.canInstall();
    if (!permission.allowed) {
      updateState = 'ready';
      updateMessage = 'Autorisez PK Reader à installer des applications, puis revenez installer la mise à jour.';
      renderUpdateUI();
      return;
    }
    await Update.install({ path: updatePath });
    updateState = 'ready';
    updateMessage = 'L’installateur Android est ouvert. Confirmez la mise à jour.';
    renderUpdateUI();
  } catch (error) {
    updateState = 'error';
    updateMessage = error instanceof Error ? error.message : String(error);
    renderUpdateUI();
  }
}

/* ------------------------------------------------------------------ actions */

async function handle(action: string, el: HTMLElement) {
  const id = el.dataset.id ?? '';
  const book = current() ?? active();
  switch (action) {
    case 'nav': screen = id as typeof screen; sheet.close(); follow = true; guard(); render(); window.scrollTo(0, 0); break;
    case 'back': screen = 'library'; follow = true; render(); window.scrollTo(0, 0); break;
    case 'open': await openBook(id); break;
    case 'listen': await openBook(id, true); break;
    case 'toggle': if (audio.state.playing || audio.state.loading) await audio.pause(); else if (book) { if (audio.state.bookId !== book.id) await audio.load(book, settings); await requestChapterPlayback(book); } break;
    case 'chapter-voices-confirm': await confirmChapterReview(); break;
    case 'chapter-voice-preview': {
      const review = chapterReview;
      if (!review) break;
      // On écoute la voix sélectionnée dans la liste, pas seulement la proposée.
      const select = sheet.querySelector<HTMLSelectElement>(`[data-role-id="${id}"]`);
      const voice = select?.value.trim() || 'system:default';
      const chapter = review.book.chapters.find(c => c.start === review.start);
      let text = '';
      if (chapter) for (let i = chapter.start; i < chapter.end && !text; i++) {
        if (review.book.casting?.assignments[String(i)] === id) text = review.book.segments[i];
      }
      const role = review.choices.find(c => c.role.id === id)?.role;
      const timbre = [...allVoices(), ...clones].find(v => v.id === voice)?.name ?? voice;
      const modele = [...allVoices(), ...clones].find(v => v.id === voice);
      if (modele?.kind === 'neural' && !modele.installed) {
        toast(`Téléchargement de ${timbre} avant l’aperçu…`);
        await installVoice(voice, timbre);
        while (![...allVoices(), ...clones].find(v => v.id === voice)?.installed) {
          const result = await Reader.models(); models = result.voices;
          if (result.downloads[voice]?.error) { toast(result.downloads[voice].error!); return; }
          await new Promise(resolve => setTimeout(resolve, 800));
        }
      }
      const demo = welcomeBook();
      demo.id = 'voice-preview'; demo.title = 'Aperçu de la voix';
      demo.segments = [text || `Bonjour, je m’appelle ${role?.name ?? 'ce personnage'}. Voici la voix que je proposerai pour ce livre.`];
      await audio.pause();
      await audio.load(demo, { ...settings, voice });
      await audio.play();
      toast(`Aperçu : ${timbre}.`);
      break;
    }
    case 'previous': await seekTo(audio.state.index - 1); break;
    case 'next': await seekTo(audio.state.index + 1); break;
    case 'sentence': await seekTo(Number(el.dataset.index)); break;
    case 'page-prev': tournerPage(-1); break;
    case 'page-next': tournerPage(1); break;
    case 'paragraph-prev': if (book) await sauterParagraphe(book, -1); break;
    case 'paragraph-next': if (book) await sauterParagraphe(book, 1); break;
    case 'follow': follow = true; render(); jumpToCurrent(); break;
    case 'chapter-step': {
      if (!book) break;
      const chapter = chapterAt(book); const target = book.chapters[book.chapters.indexOf(chapter) + Number(id)];
      if (target) { follow = true; page = 0; await audio.seek(target.start); render(); window.scrollTo(0, 0); }
      break;
    }
    case 'filter': filter = id; render(); break;
    case 'search': document.querySelector('#search-row')?.classList.add('expanded'); document.querySelector<HTMLInputElement>('#search')?.focus(); break;
    case 'close': sheet.close(); break;
    case 'import': modal('Une nouvelle histoire',`<p class="sheet-description">Choisissez un livre sur votre appareil. Il restera dans votre bibliothèque, prêt à lire et à écouter.</p><button class="import-choice" data-action="pick-file">${icon('file-up')}<span><strong>Importer des fichiers</strong><small>EPUB, PDF, TXT, Markdown</small></span>${icon('chevron-right')}</button><button class="import-choice" data-action="paste">${icon('clipboard-paste')}<span><strong>Ajouter un texte</strong><small>Un article, une note, quelques pages</small></span>${icon('chevron-right')}</button>`); break;
    case 'pick-file': fileInput.click(); break;
    case 'paste': modal('Un texte à écouter',`<form id="paste-form"><label for="text-title">Titre</label><input id="text-title" name="title" placeholder="Ma prochaine lecture" required maxlength="160" /><label for="text-content">Votre texte</label><textarea id="text-content" name="text" rows="8" placeholder="Collez le texte ici…" required></textarea><button class="primary" type="submit">${icon('plus')} Ajouter à la bibliothèque</button></form>`); break;
    case 'speed': modal('Trouvez votre rythme',`<p class="sheet-description">La vitesse est propre à <strong>${esc(voiceName())}</strong> : chaque voix garde la sienne.</p><div class="choice-grid">${[0.75,1,1.25,1.5,1.75,2,2.5,3].map(n=>`<button class="choice ${settings.rate===n?'active':''}" data-action="set-speed" data-id="${n}">${n.toLocaleString('fr')}×</button>`).join('')}</div>`); break;
    case 'set-speed': {
      const valeur = Number(id);
      settings.rate = valeur;
      settings.voiceRates = { ...(settings.voiceRates ?? {}), [settings.voice]: valeur };
      savePrefs(); await audio.rate(valeur); sheet.close(); render();
      toast(`Vitesse de ${voiceName()} : ${valeur.toLocaleString('fr')}×`);
      break;
    }
    case 'voice-langues': settings.voiceLangues = !settings.voiceLangues; savePrefs(); render(); break;
    case 'focus': settings.focus = !settings.focus; savePrefs(); replacePlayer(); break;
    case 'interligne': settings.interligne = Number(id); savePrefs(); sheet.close(); render(); break;
    case 'marges': settings.marges = Number(id); savePrefs(); sheet.close(); render(); break;
    case 'bande': settings.bande = Number(id); savePrefs(); sheet.close(); render(); break;
    case 'surlignage': settings.surlignage = id as 'mots' | 'phrase' | 'aucun'; savePrefs(); sheet.close(); render(); break;
    case 'sleep': modal('Encore quelques pages',`<p class="sheet-description">La lecture s’arrêtera automatiquement. Votre place sera conservée.</p><div class="choice-grid">${[0,5,15,30,45,60].map(n=>`<button class="choice" data-action="set-sleep" data-id="${n}">${n?`${n} min`:'Désactivé'}</button>`).join('')}</div>`); break;
    case 'set-sleep': await audio.sleep(Number(id)); sheet.close(); render(); toast(id==='0'?'Minuteur désactivé.':`Arrêt de la lecture dans ${id} minutes.`); break;
    case 'settings-tab': settingsTab = (id || 'lecture') as SettingsTab; window.scrollTo(0, 0); render(); break;
    case 'appearance': modal('Réglages de lecture', `<p class="sheet-description">Tout le confort de lecture, sans quitter votre page.</p>${lectureBody(settings)}`); break;
    case 'font': settings.fontSize = Number(id); sheet.close(); pagesKey = ''; render(); break;
    case 'theme': settings.theme = id as typeof settings.theme; sheet.close(); render(); break;
    case 'layout': settings.layout = (id || (settings.layout === 'pages' ? 'scroll' : 'pages')) as 'pages' | 'scroll'; pagesKey = ''; follow = true; guard(); sheet.close(); render(); jumpToCurrent(); toast(settings.layout === 'pages' ? 'Lecture page à page.' : 'Lecture en défilement continu.'); break;
    case 'chapters': if (book) modal('Chapitres et signets',`<button class="setting-row" data-action="bookmark"><span>${icon('bookmark')}${book.bookmarks.includes(book.position) ? 'Retirer le signet de ce passage' : 'Ajouter ce passage aux signets'}</span></button><div class="chapter-list">${book.chapters.map((c,i)=>`<button data-action="chapter" data-index="${c.start}" class="${chapterAt(book)===c?'active':''}"><span>${String(i+1).padStart(2,'0')}</span><strong>${esc(c.title)}</strong>${icon(chapterAt(book)===c?'audio-lines':'chevron-right')}</button>`).join('')}</div>${book.bookmarks.length?`<h3 class="bookmarks-heading">Vos signets</h3><div class="chapter-list">${book.bookmarks.map(i=>`<button data-action="chapter" data-index="${i}">${icon('bookmark')}<strong>${esc(book.segments[i]?.slice(0,90))}…</strong></button>`).join('')}</div>`:''}`); break;
    case 'chapter': follow = true; page = 0; await audio.seek(Number(el.dataset.index)); sheet.close(); render(); window.scrollTo(0, 0); break;
    case 'chapter-next': if (book) { const next = chapterAt(book).end; if (next < book.segments.length) { follow = true; page = 0; await audio.seek(next); render(); window.scrollTo(0, 0); } else { screen = 'library'; render(); } } break;
    case 'bookmark': if (book) { const pos = Math.min(book.position, book.segments.length - 1); book.bookmarks = book.bookmarks.includes(pos) ? book.bookmarks.filter(i => i !== pos) : [...book.bookmarks, pos].sort((a, b) => a - b); await library.save(book); render(); toast(book.bookmarks.includes(pos)?'Passage ajouté aux signets.':'Signet retiré.'); } break;
    case 'voice-tab': voiceTab = id; render(); break;
    case 'casting': { const target = id ? books.find(b => b.id === id) : book; if (target) await castingSheet(target); break; }
    case 'choose-voice': modal('Changer de voix', `${book ? '<button class="setting-row" data-action="casting">Une voix par personnage →</button>' : ''}${quickVoiceBody()}`); break;
    case 'select-voice': settings.voice = id; settings.rate = settings.voiceRates?.[id] ?? settings.rate; savePrefs(); if (sheet.open) sheet.close(); if (active()) await audio.load(active()!, settings); render(); toast(`Voix appliquée à cette écoute · ${settings.rate.toLocaleString('fr')}×`); break;
    case 'preview': {
      const demo = welcomeBook(); demo.id = 'voice-preview'; demo.title = 'Aperçu de la voix'; demo.segments = ['Fermez les yeux, ouvrez un livre. Je vous accompagne au fil des pages, à votre rythme.'];
      await audio.load(demo, { ...settings, voice: id }); await audio.play(); toast('Aperçu de la voix en cours.'); break;
    }
    case 'install':
      if (!native) { toast('Le téléchargement des modèles est disponible dans l’APK Android.'); break; }
      await installVoice(id, models.find(v => v.id === id)?.name ?? id); break;
    case 'remove-model': if (native) { await audio.pause(); await Reader.removeModel({ id }); if (settings.voice === id) { settings.voice = 'system:default'; savePrefs(); } models = (await Reader.models()).voices; render(); toast('Voix supprimée de cet appareil.'); } break;
    case 'voice-settings': if (native) await Reader.voiceSettings(); else toast('Les réglages des voix Android sont accessibles dans l’APK.'); break;
    case 'prepare': if (native && book) { if (book.segments.slice(chapterAt(book).start, chapterAt(book).end).some((_, offset) => speechProfile(book, settings, chapterAt(book).start + offset).voice.startsWith('system:'))) { toast('Pour préparer ce chapitre, choisissez une voix Piper pour chaque rôle utilisé.'); break; } modal('Emporter ce chapitre',`<p class="sheet-description">Les passages de « ${esc(chapterAt(book).title)} » seront générés et conservés sur le téléphone. Avec une voix clonée, votre Mac doit rester connecté pendant la préparation.</p><button class="primary" data-action="prepare-confirm">${icon('download')} Préparer le chapitre</button>`); } else toast('La préparation hors ligne est disponible dans l’APK Android.'); break;
    case 'prepare-confirm': if (book) { await Reader.command({ action:'prepare', index:chapterAt(book).start, end:chapterAt(book).end }); sheet.close(); toast('Préparation du chapitre démarrée.'); } break;
    case 'book-settings': {
      const b = books.find(b => b.id === id); if (!b) break;
      sheet.close(); currentId = id; screen = 'book'; render(); window.scrollTo(0, 0); break;
    }
    case 'prepare-book': {
      const b = books.find(b => b.id === id); if (!b) break;
      if (castingBusy(b) || bookSetup) { toast('Une préparation est déjà en cours pour ce livre.'); break; }
      const ia = settings.ia?.enabled && settings.ia.modele ? `l’IA ${esc(settings.ia.modele)}` : 'le repérage local';
      modal('Préparer le livre audio ?', `<p class="sheet-description">Le chapitre à écouter est analysé en priorité (${ia}) : la lecture démarre dès qu'il est prêt, pendant que le reste du livre continue de s'analyser en arrière-plan, chapitre par chapitre. Les voix manquantes sont téléchargées au passage ; celles que vous choisissez servent tout le livre, sans rien redemander aux chapitres suivants. Selon le modèle, l'analyse fine peut aller de quelques minutes à plusieurs heures — lancez-la le soir si besoin, elle reprend où elle s'était arrêtée. La mise en cache hors ligne reste disponible dans le lecteur (« Emporter ce chapitre »).</p><button class="primary" data-action="prepare-book-run" data-id="${id}">${icon('wand-sparkles')} Préparer et écouter</button>`);
      break;
    }
    case 'prepare-book-run': {
      const b = books.find(b => b.id === id); if (!b) break;
      await lancerPreparation(b);
      break;
    }
    case 'relancer-tout': {
      const b = books.find(b => b.id === id); if (!b) break;
      if (castingBusy(b) || bookSetup) { toast('Une préparation est déjà en cours pour ce livre.'); break; }
      modal('Tout relancer ?', `<p class="sheet-description">Les paragraphes sont reconstitués, l'analyse des personnages repart de zéro, les voix manquantes sont téléchargées, puis la préparation et l'écoute redémarrent. Vos corrections manuelles et les voix que vous avez choisies sont conservées.</p><button class="primary" data-action="relancer-tout-confirm" data-id="${id}">${icon('refresh-cw')} Tout relancer</button>`);
      break;
    }
    case 'relancer-tout-confirm': {
      const b = books.find(b => b.id === id); if (!b) break;
      if (castingBusy(b) || bookSetup) { toast('Une préparation est déjà en cours pour ce livre.'); break; }
      reparerParagraphes(b);
      relancerAnalyse(b);
      await library.save(b);
      sheet.close();
      await lancerPreparation(b);
      break;
    }
    case 'reparagrapher': {
      const b = books.find(b => b.id === id);
      if (b) {
        const nombre = reparerParagraphes(b); await library.save(b);
        if (screen === 'reader' || screen === 'book') render();
        toast(`${nombre} paragraphes reconstitués.`);
      }
      sheet.close();
      break;
    }
    case 'clear-audio': if (native) modal('Effacer les audios préparés ?', '<p class="sheet-description">Les passages déjà générés pour ce livre seront supprimés du téléphone. Le texte, les voix choisies et la distribution restent intacts ; les chapitres se réécouteront en direct ou se prépareront à nouveau.</p><button class="primary danger-button" data-action="clear-audio-confirm" data-id="' + id + '">Effacer les audios</button>'); else toast('Aucun audio conservé dans cet aperçu web.'); break;
    case 'clear-audio-confirm': await audio.pause(); await Reader.clearAudio({ bookId: id }); sheet.close(); toast('Audios de ce livre effacés.'); break;
    case 'reanalyser': {
      const b = books.find(b => b.id === id); if (!b) break;
      if (castingBusy(b)) { toast('Attendez la fin de l’analyse en cours.'); break; }
      const mode = settings.ia?.enabled && settings.ia.modele ? ` avec l’IA ${esc(settings.ia.modele)}` : ' par le repérage local';
      modal('Relancer l’analyse ?', `<p class="sheet-description">Les attributions automatiques seront recalculées${mode}. Vos corrections manuelles, vos voix et vos réglages sont conservés. La préparation peut prendre plusieurs minutes.</p><button class="primary" data-action="reanalyser-confirm" data-id="${id}">${icon('refresh-cw')} Relancer l’analyse</button>`);
      break;
    }
    case 'reanalyser-confirm': {
      const b = books.find(b => b.id === id); if (!b) break;
      relancerAnalyse(b);
      await library.save(b);
      sheet.close();
      prepareBook(b);
      render();
      window.scrollTo(0, 0);
      toast('Analyse relancée. Le suivi est affiché en haut de l’écran.');
      break;
    }
    case 'delete-confirm': if (books.some(b => b.id === id && castingBusy(b))) { toast('Attendez la fin de la préparation de ce livre avant de le retirer.'); break; } modal('Supprimer ce livre ?',`<p class="sheet-description">Le livre, sa position et ses signets seront retirés de cette bibliothèque. Le fichier d’origine restera intact.</p><button class="primary danger-button" data-action="delete" data-id="${id}">Supprimer le livre</button>`); break;
    case 'delete': if (audio.state.bookId === id) await audio.pause(); await library.remove(id); books = books.filter(b => b.id !== id); dismissCastingActivity(id); currentId = ''; screen = 'library'; sheet.close(); render(); toast('Livre supprimé de la bibliothèque.'); break;
    case 'check-update': await checkUpdate(); break;
    case 'activity-dismiss': dismissCastingActivity(id); refreshActivities(); break;
    case 'download-dismiss': dismissVoiceDownload(id); break;
    case 'update-now': await downloadUpdate(); break;
    case 'install-update': await installUpdate(); break;
    case 'update-permission': if (native) await Update.openInstallSettings(); else toast('Disponible dans l’application Android.'); break;
    case 'ia-clear': {
      if (!native) break;
      settings.ia = await Reader.clearIA(); savePrefs(); render();
      toast('IA du téléphone désactivée. Le repérage local reprend la main.');
      break;
    }
    case 'ia-load-models': {
      const status = document.querySelector<HTMLElement>('#ia-status');
      const url = document.querySelector<HTMLInputElement>('#ia-url')?.value.trim() ?? '';
      const cle = document.querySelector<HTMLInputElement>('#ia-key')?.value.trim() ?? '';
      const bouton = document.querySelector<HTMLButtonElement>('[data-action="ia-load-models"]');
      if (!native) { if (status) status.textContent = 'Le chargement des modèles se fait dans l’APK Android.'; break; }
      if (!url) { if (status) status.textContent = 'Choisissez un fournisseur ou saisissez son adresse.'; break; }
      if (!cle && !adresseLocale(url)) { if (status) status.textContent = 'Collez d’abord la clé API pour interroger le fournisseur.'; break; }
      if (bouton) { bouton.disabled = true; bouton.textContent = 'Chargement…'; }
      try {
        const result = await Reader.iaModels({ url, cle });
        const fournisseur = fournisseurParUrl(url);
        const select = document.querySelector<HTMLSelectElement>('#ia-model-select');
        const precedent = select && select.value !== '__libre__' ? select.value : '';
        const liste = optionsModeles(fournisseur, precedent, result.modeles);
        if (select) {
          select.innerHTML = `${liste.map(id => `<option value="${esc(id)}" ${id === precedent ? 'selected' : ''}>${esc(id)}</option>`).join('')}<option value="__libre__">Autre modèle (saisie libre)</option>`;
        }
        const masques = result.modeles.filter(id => !liste.includes(id)).length;
        if (status) status.textContent = `${liste.length} modèles utilisables chez ${fournisseur.nom}${masques ? ` · ${masques} réservé${masques > 1 ? 's' : ''} à OpenCode masqué${masques > 1 ? 's' : ''}` : ''}. Choisissez-en un puis enregistrez.`;
      } catch (error) {
        if (status) status.textContent = error instanceof Error ? error.message : String(error);
      } finally {
        if (bouton) { bouton.disabled = false; bouton.textContent = 'Charger les modèles'; }
      }
      break;
    }
  }
}

/* ------------------------------------------------------------------ modèles */


/* ------------------------------------------------------------------ écoute */

document.addEventListener('click', e => { const el = (e.target as Element).closest<HTMLElement>('[data-action]'); if (el) void handle(el.dataset.action!, el).catch(error => toast(error instanceof Error?error.message:String(error))); });
document.addEventListener('input', e => {
  if ((e.target as HTMLElement).id === 'search') {
    const input = e.target as HTMLInputElement; const position = input.selectionStart;
    search = input.value; render();
    const next = document.querySelector<HTMLInputElement>('#search'); next?.focus();
    try { next?.setSelectionRange(position, position); } catch { /* champ masqué */ }
  }
});
document.addEventListener('change', e => { if ((e.target as HTMLElement).id === 'progress') void audio.seek(Number((e.target as HTMLInputElement).value)).catch(e => toast(String(e))); });
document.addEventListener('keydown', e => {
  if (screen !== 'reader' || sheet.open) return;
  const sentence = e.target instanceof Element ? e.target.closest<HTMLElement>('.sentence') : null;
  if (sentence && (e.key === 'Enter' || e.key === ' ')) {
    e.preventDefault(); void seekTo(Number(sentence.dataset.index)); return;
  }
  if (e.target instanceof Element && e.target.closest('input, select, textarea, .player')) return;
  if (e.key === 'PageDown' || e.key === 'PageUp') {
    e.preventDefault(); tournerPage(e.key === 'PageDown' ? 1 : -1); return;
  }
  if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
  e.preventDefault();
  if (e.shiftKey) { const book = current(); if (book) void sauterParagraphe(book, e.key === 'ArrowRight' ? 1 : -1); return; }
  follow = false;
  if (settings.layout === 'pages') {
    if (e.key === 'ArrowRight' && page < pages.length - 1) { page++; drawPage('next'); }
    else if (e.key === 'ArrowLeft' && page > 0) { page--; drawPage('prev'); }
  }
  syncNowBar();
});
window.addEventListener('scroll', () => { if (screen === 'reader') syncNowBar(); }, { passive: true });
const manualScroll = (event: Event) => {
  if (screen !== 'reader' || settings.layout !== 'scroll' || (event.target instanceof Element && event.target.closest('.player, .now-bar, dialog'))) return;
  follow = false;
};
window.addEventListener('wheel', manualScroll, { passive: true });
window.addEventListener('touchmove', manualScroll, { passive: true });
document.addEventListener('touchstart', e => {
  if (screen !== 'reader' || settings.layout !== 'pages') return;
  const touch = e.touches[0]; if (!touch) return;
  if ((e.target as Element).closest('.player, .now-bar, .reader-header, .reader-subhead, .page-footer')) return;
  (window as unknown as { __pkTouch?: { x: number; y: number } }).__pkTouch = { x: touch.clientX, y: touch.clientY };
}, { passive: true });
document.addEventListener('touchend', e => {
  const start = (window as unknown as { __pkTouch?: { x: number; y: number } }).__pkTouch; if (!start) return;
  (window as unknown as { __pkTouch?: unknown }).__pkTouch = undefined;
  const touch = e.changedTouches[0]; if (!touch || screen !== 'reader' || settings.layout !== 'pages') return;
  const dx = touch.clientX - start.x; const dy = touch.clientY - start.y;
  if (Math.abs(dx) < 56 || Math.abs(dy) > 64) return;
  follow = false;
  if (dx < 0 && page < pages.length - 1) { page++; drawPage('next'); } else if (dx > 0 && page > 0) { page--; drawPage('prev'); }
  syncNowBar();
}, { passive: true });
let resizeTimer: ReturnType<typeof setTimeout>;
window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { pagesKey = ''; if (screen === 'reader' && settings.layout === 'pages') render(); }, 220); });
fileInput.addEventListener('change', () => void importFiles(Array.from(fileInput.files ?? [])));
sheet.addEventListener('click', e => { if (e.target === sheet) { const r = sheet.getBoundingClientRect(); if (e.clientY < r.top || e.clientX < r.left || e.clientX > r.right) sheet.close(); } });
document.addEventListener('submit', e => {
  const form = e.target as HTMLFormElement; e.preventDefault();
  if (form.id === 'paste-form') { const data = new FormData(form); void importFiles([new File([String(data.get('text'))], `${data.get('title')}.txt`, { type: 'text/plain' })]); }
  if (form.id === 'studio-form') {
    const data = new FormData(form); settings.server = String(data.get('server')).replace(/\/+$/,''); settings.token = String(data.get('token')).trim();
    if (!native) { toast('La connexion au studio se fait dans l’APK Android.'); return; }
    const button = form.querySelector<HTMLButtonElement>('button')!; button.disabled = true; button.textContent = 'Connexion…';
    void Reader.connect({ server: settings.server, token: settings.token }).then(r => { clones = r.voices; savePrefs(); books.forEach(prepareBook); screen = 'library'; render(); toast('Studio connecté. Préparation automatique des personnages de vos livres.'); }).catch(error => { button.disabled = false; button.textContent = 'Connecter le studio'; toast(error.message ?? String(error)); });
  }
  if (form.id === 'ia-form') {
    const data = new FormData(form);
    const status = document.querySelector<HTMLElement>('#ia-status');
    const choisi = form.querySelector<HTMLSelectElement>('#ia-model-select')?.value ?? '';
    const manuel = String(data.get('model-manual') ?? '').trim();
    const modele = choisi && choisi !== '__libre__' ? choisi : manuel;
    if (!modele) {
      if (status) status.textContent = 'Choisissez un modèle dans la liste ou saisissez son identifiant.';
      return;
    }
    if (!native) { if (status) status.textContent = 'La configuration de l’IA se fait dans l’APK Android.'; return; }
    const button = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    button.disabled = true; button.textContent = 'Test en cours…';
    void Reader.saveIA({ url: String(data.get('url')).trim(), modele, cle: String(data.get('key')).trim() })
      .then(config => {
        // La clé est enregistrée même si le test échoue : on garde la configuration
        // visible (url, modèle, hasKey) et on affiche la raison de l'échec.
        const { erreur, ...etat } = config;
        settings.ia = etat; savePrefs();
        button.disabled = false; button.textContent = 'Tester et enregistrer';
        if (!erreur) books.forEach(prepareBook);
        const message = erreur
          ? `Clé enregistrée, mais le test a échoué : ${erreur}`
          : `IA ${etat.modele} prête. Les livres préparés utiliseront ce modèle.`;
        render();
        requestAnimationFrame(() => {
          const el = document.querySelector<HTMLElement>('#ia-status');
          if (el) el.textContent = message;
        });
        if (erreur) toast('Clé enregistrée. Le test du fournisseur a échoué.');
      })
      .catch(error => {
        button.disabled = false; button.textContent = 'Tester et enregistrer';
        const message = error instanceof Error ? error.message : String(error);
        if (status) status.textContent = message;
        toast(message);
      });
  }
});
window.addEventListener('hashchange', () => { if (location.hash === '#library') { screen = 'library'; render(); } });

/* -------------------------------------------------- voix choisies et installées */

/** Choisir une voix la télécharge tout de suite : l'aperçu et la lecture ne
 *  peuvent plus tomber sur une voix absente du téléphone. */
document.addEventListener('change', event => {
  const select = (event.target as HTMLElement).closest<HTMLSelectElement>('select[data-download-voice]');
  if (!select) return;
  const voice = [...allVoices(), ...clones].find(v => v.id === select.value);
  if (voice?.kind === 'neural' && !voice.installed) {
    void installVoice(voice.id, voice.name).catch(error => toast(`${voice.name} : ${error instanceof Error ? error.message : error}`));
  }
});

/* ------------------------------------------------------------ fournisseur IA */

/** Changement de fournisseur : adresse et lien de clé pré-remplis, modèles
 *  connus proposés dans la déroulante. */
document.addEventListener('change', event => {
  const el = event.target as HTMLElement;
  if (el.id !== 'ia-provider') return;
  const fournisseur = fournisseurParId((el as HTMLSelectElement).value);
  const url = document.querySelector<HTMLInputElement>('#ia-url');
  if (url && fournisseur.url) url.value = fournisseur.url;
  const lien = document.querySelector<HTMLAnchorElement>('#ia-keys');
  if (lien) {
    lien.hidden = !fournisseur.cles;
    lien.href = fournisseur.cles || '#';
    lien.textContent = fournisseur.cles ? `Trouver ma clé chez ${fournisseur.nom} →` : '';
  }
  const note = document.querySelector<HTMLElement>('#ia-note');
  if (note) {
    note.hidden = !fournisseur.note;
    note.textContent = fournisseur.note ?? '';
  }
  const select = document.querySelector<HTMLSelectElement>('#ia-model-select');
  if (select) {
    select.innerHTML = `${optionsModeles(fournisseur).map(id => `<option value="${esc(id)}">${esc(id)}</option>`).join('')}<option value="__libre__">Autre modèle (saisie libre)</option>`;
  }
  const manuel = document.querySelector<HTMLInputElement>('#ia-model-manual');
  if (manuel) manuel.value = '';
  const status = document.querySelector<HTMLElement>('#ia-status');
  if (status) status.textContent = '';
});

async function init() {
  try {
    books = await library.all();
    for (const book of books) if (normaliserTitresChapitres(book)) await library.save(book);
    if (!books.length && !localStorage.getItem('pk-reader-welcomed')) { const book = welcomeBook(); await library.save(book); books = [book]; localStorage.setItem('pk-reader-welcomed','1'); }
    voices = await audio.voices();
    if (native) { models = (await Reader.models()).voices; if (settings.server && settings.token) void Reader.connect({ server: settings.server, token: settings.token }).then(r => { clones = r.voices; if (screen === 'voices') render(); }).catch(() => {}); }
    if (native) { try { settings.ia = await Reader.iaConfig(); } catch { settings.ia = undefined; } }
    render(); await audio.init();
    if (native) void monitorVoiceDownloads();
    if (native) void Update.addListener('progress', ({ progress }) => {
      updateProgress = Math.max(0, Math.min(100, Math.round(progress)));
      const bar = document.querySelector<HTMLElement>('#update-progress');
      if (bar) bar.style.width = `${updateProgress}%`;
      const label = document.querySelector<HTMLElement>('#update-percent');
      if (label) label.textContent = `${updateProgress} % · gardez l’application ouverte`;
    });
    if (native) await App.addListener('backButton', () => {
      if (sheet.open) { sheet.close(); return; }
      if (screen !== 'library') { screen = 'library'; follow = true; render(); window.scrollTo(0,0); return; }
      void App.minimizeApp();
    });
    if (!native && 'speechSynthesis' in window) speechSynthesis.addEventListener('voiceschanged', () => { void audio.voices().then(v => { voices = v; if (screen === 'voices') render(); }); });
  } catch (error) {
    app.innerHTML = '<main class="fatal"><h1>La bibliothèque ne peut pas s’ouvrir.</h1><p>Fermez puis relancez l’application. Vérifiez que le stockage de l’app est autorisé.</p></main>';
    toast(error instanceof Error?error.message:String(error));
  }
}
void init();
