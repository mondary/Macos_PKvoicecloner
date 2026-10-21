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
import { importBook, welcomeBook, chapterAt, minutesLeft } from './books';
import { audio, native, Reader, modelCatalog } from './engine';
import type { Book, Voice } from './types';
import { openCasting } from './casting-ui';
import { characterAt, speechProfile } from './casting';
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
let screen: 'library' | 'reader' | 'voices' | 'settings' = 'library';
let currentId = '';
let filter = 'all';
let voiceTab = 'neural';
let search = '';
let importing = false;
let savedPosition = '';
let toastTimer: ReturnType<typeof setTimeout>;
let downloading = false;
let systemTheme = '';
let wasPreparing = false;

/** Lecture : suivi automatique du texte lu. */
let follow = true;
let page = 0;
let pages: Page[] = [];
let pagesKey = '';
let pagesChapter = -1;
let fontsChecked = false;
/** Les défilements déclenchés par l'app sont ignorés par la détection de geste. */
let scrollGuard = 0;
let playerObserver: ResizeObserver | undefined;
/** Signature du dernier état « structurel » : la progression seule ne redessine pas la page. */
let derniereLecture = '';

type PageRun = { index: number; from: number; to: number };
type Page = PageRun[];

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

function navigation() {
  return `<nav class="navigation" aria-label="Navigation principale"><a class="brand" href="#library" aria-label="PK Reader, bibliothèque"><span class="brand-mark">${icon('audio-lines')}</span><span>pk<span class="brand-light">reader</span><small>LE PLAISIR D’ÉCOUTER</small></span></a><div class="nav-items">${[
    ['library','library-big','Bibliothèque'],['voices','audio-lines','Voix'],['settings','sliders-horizontal','Réglages'],
  ].map(([id, ic, label]) => `<button class="nav-item ${screen===id?'selected':''}" data-action="nav" data-id="${id}" ${screen===id?'aria-current="page"':''}>${icon(ic)}<span>${label}</span></button>`).join('')}</div><div class="nav-footer">Vos livres restent<br>entre vos mains.${icon('shield-check')}</div></nav>`;
}
function miniPlayer() {
  const book = active(); if (!book || screen === 'reader') return '';
  return `<aside class="mini-player" aria-label="Lecture en cours"><button class="mini-book" data-action="open" data-id="${book.id}">${cover(book,'tiny')}<span><strong>${esc(book.title.replace(/\n/g,' '))}</strong><small>${esc(audio.state.loading?'Préparation de la voix…':chapterAt(book)?.title ?? '')}</small></span></button>${iconButton(audio.state.playing?'pause':'play',audio.state.playing?'Mettre en pause':'Reprendre la lecture','toggle','mini-play')}<div class="mini-progress" style="width:${percent(book)}%"></div></aside>`;
}

/* -------------------------------------------------------------- bibliothèque */

function libraryView() {
  const real = books.filter(b => !b.sample);
  const resume = [...books].sort((a, b) => b.opened - a.opened)[0];
  const filtered = books.filter(b => (filter === 'all' || (filter === 'reading' && b.position > 0 && !b.completed) || (filter === 'finished' && b.completed)) && `${b.title} ${b.author}`.toLowerCase().includes(search.toLowerCase()));
  return `<header class="page-heading"><div><p class="eyebrow">VOTRE BULLE DE LECTURE</p><h1>Mes livres<span>.</span></h1></div><button class="add-button" data-action="import" aria-label="Importer un livre">${icon('plus')}<span>Ajouter un livre</span></button></header>
  ${resume && !search && filter === 'all' ? `<section class="resume-card">
    <div class="resume-copy"><span class="label-dot">${resume.opened?'REPRENDRE LE FIL':'VOTRE PREMIÈRE ÉCOUTE'}</span>
      <h2>${esc(resume.sample?'Vos livres.\nÀ voix haute.':resume.title).replace(/\n/g,'<br>')}</h2>
      <p class="resume-sub">${resume.sample?'Installez-vous. Vos histoires ont<br>tant de choses à vous raconter.':`${esc(resume.author)}<br>${esc(chapterAt(resume)?.title ?? '')}`}</p>
      <div class="resume-figures">${ring(resume)}<span class="resume-time">${resume.sample?'Texte de démonstration':resume.completed?'Lu en entier':`${minutes(resume)} restantes`}</span></div>
      <button class="primary" data-action="listen" data-id="${resume.id}">${icon('play')} ${resume.completed?'Réécouter':resume.opened?'Reprendre l’écoute':'Écouter le guide'}</button></div>
    <button class="hero-book" data-action="open" data-id="${resume.id}" aria-label="Ouvrir ${esc(resume.title.replace(/\n/g,' '))}">${cover(resume,'hero-cover')}</button></section>` : ''}
  <section class="library-section"><div class="section-heading"><h2>Sur votre étagère <span class="count">${books.length}</span></h2>${iconButton('search','Rechercher un livre','search')}</div>
  <div class="library-tools"><div class="segmented" role="group" aria-label="Filtrer les livres">${[['all','Tous'],['reading','En cours'],['finished','Terminés']].map(([id,label]) => `<button data-action="filter" data-id="${id}" class="${filter===id?'active':''}" aria-pressed="${filter===id}">${label}</button>`).join('')}</div><span class="library-count">${real.length ? `${real.length} livre${real.length>1?'s':''}` : 'Votre étagère vous attend'}</span></div>
  <div class="search-row ${search?'expanded':''}" id="search-row"><label class="sr-only" for="search">Rechercher dans la bibliothèque</label>${icon('search')}<input id="search" type="search" placeholder="Un titre, un auteur…" value="${esc(search)}" autocomplete="off" /></div>
  <div class="books-grid">${filtered.map((b, i) => `<article class="book-item" style="--i:${Math.min(i, 12)}">${b.completed?`<span class="book-flag">Terminé</span>`:''}<button class="book-open" data-action="open" data-id="${b.id}">${cover(b)}<strong>${esc(b.title.replace(/\n/g,' '))}</strong><span>${esc(b.author)}</span></button><div class="book-bottom"><span>${b.completed?'Lu en entier':b.position>0?`${percent(b)} % · ${minutes(b)} restantes`:b.sample?'GUIDE DE DÉCOUVERTE':b.format}</span>${iconButton('ellipsis','Options du livre','book-menu').replace('data-action="book-menu"',`data-action="book-menu" data-id="${b.id}"`)}</div>${b.position>0?`<div class="book-progress"><span style="width:${percent(b)}%"></span></div>`:''}</article>`).join('')}${filter==='all'&&!search?`<button class="import-tile" data-action="import"><span>${icon('plus')}</span><strong>La suite vous appartient.</strong><small>Importez votre prochain livre<br>EPUB, PDF ou texte</small></button>`:''}</div>
  ${!filtered.length?'<div class="empty-state">Aucun livre ici pour le moment.</div>':''}</section>
  <div class="privacy-note">${icon('lock-keyhole')}<p>Votre bibliothèque, sur votre appareil.<br><span>Sans compte. Sans publicité. Juste vos livres.</span></p></div>
  <p class="build-line">PK Reader <b>${version}</b></p>`;
}

/* ------------------------------------------------------------------ lecture */

function paginate(book: Book, chapter: { start: number; end: number }, width: number, capFirst: number, capOther: number): Page[] {
  const host = document.querySelector<HTMLElement>('.page-measure') ?? (() => {
    const el = document.createElement('div'); el.className = 'reader-text page-measure'; el.setAttribute('aria-hidden', 'true'); document.body.appendChild(el); return el;
  })();
  host.style.width = `${width}px`;
  host.innerHTML = '';
  const pages: Page[] = [];
  let current: Page = [];
  let capacity = Math.max(48, capFirst);
  const fits = () => host.scrollHeight <= capacity + 1;
  const flush = () => { pages.push(current); current = []; capacity = Math.max(48, capOther); host.innerHTML = ''; };
  const node = (text: string) => { const el = document.createElement('button'); el.type = 'button'; el.className = 'sentence'; el.textContent = text; return el; };
  for (let index = chapter.start; index < chapter.end; index++) {
    const text = book.segments[index];
    let from = 0;
    while (from < text.length) {
      const candidate = node(text.slice(from));
      host.appendChild(candidate);
      if (fits()) { current.push({ index, from, to: text.length }); from = text.length; continue; }
      candidate.remove();
      if (current.length) { flush(); continue; }
      const words = text.slice(from).split(' ');
      let best = 0;
      if (words.length > 1) {
        let lo = 1, hi = words.length - 1;
        while (lo <= hi) {
          const mid = (lo + hi) >> 1;
          const probe = node(words.slice(0, mid).join(' ')); host.appendChild(probe);
          if (fits()) { best = mid; probe.remove(); lo = mid + 1; } else { probe.remove(); hi = mid - 1; }
        }
      }
      if (best > 0) {
        const consumed = words.slice(0, best).join(' ');
        current.push({ index, from, to: from + consumed.length });
        from += consumed.length + 1;
      } else {
        let lo = 1, hi = text.length - from, bestChar = 0;
        while (lo <= hi) {
          const mid = (lo + hi) >> 1;
          const probe = node(text.slice(from, from + mid)); host.appendChild(probe);
          if (fits()) { bestChar = mid; probe.remove(); lo = mid + 1; } else { probe.remove(); hi = mid - 1; }
        }
        const cut = Math.max(1, bestChar);
        current.push({ index, from, to: from + cut });
        from += cut;
      }
      flush();
    }
  }
  if (current.length) pages.push(current);
  if (!pages.length) pages.push([]);
  host.innerHTML = '';
  return pages;
}
const pageOf = (index: number) => Math.max(0, pages.findIndex(p => p.some(r => r.index === index)));

function readerHeader() {
  const book = current()!;
  return `<header class="reader-header">${iconButton('arrow-left','Retour à la bibliothèque','back')}<div><span>${esc(book.title.replace(/\n/g,' '))}</span><small>${esc(book.author)}</small></div>${iconButton('users','Personnages et voix de ce livre','casting')}${iconButton('text-cursor-input','Apparence du texte','appearance')}</header>`;
}
function readerSubhead() {
  const book = current()!; const chapter = chapterAt(book); const index = book.chapters.indexOf(chapter);
  const step = (dir: -1 | 1, name: string) => `<button class="chapter-step" data-action="chapter-step" data-id="${dir}" ${index + dir < 0 || index + dir >= book.chapters.length ? 'disabled' : ''} aria-label="${name}">${icon(dir < 0 ? 'chevron-left' : 'chevron-right')}</button>`;
  return `<div class="reader-subhead">${step(-1,'Chapitre précédent')}<button class="chapter-current" data-action="chapters">${icon('list')}<span class="chapter-name">${esc(chapter.title)}</span>${icon('chevron-down')}</button>${step(1,'Chapitre suivant')}${iconButton(book.bookmarks.includes(book.position) ? 'bookmark-check' : 'bookmark','Marquer le passage','bookmark')}</div>`;
}
function sentenceButton(text: string, index: number, book: Book, debut = 0) {
  const isCurrent = index === book.position;
  return `<button class="sentence ${isCurrent?'current-sentence':''} ${book.bookmarks.includes(index)?'marked':''}" data-action="sentence" data-index="${index}" data-debut="${debut}" ${isCurrent?'aria-current="true"':''}>${esc(text)}</button>`;
}
function readingScroll() {
  const book = current()!; const chapter = chapterAt(book);
  return `<article class="reading-page"><div class="page-title"><p class="eyebrow">${book.sample?'PRENDRE LE TEMPS':esc(book.author.toUpperCase())}</p><h1>${esc(chapter.title)}</h1></div><div class="reader-text">${book.segments.slice(chapter.start,chapter.end).map((text,i)=>sentenceButton(text,chapter.start+i,book)).join('')}</div><button class="next-chapter" data-action="chapter-next">${chapter.end<book.segments.length?'Chapitre suivant':'Retour à la bibliothèque'} ${icon('arrow-right')}</button></article>`;
}
function readingPages() {
  return `<article class="reading-page paged"><div class="page-title"><p class="eyebrow" id="page-eyebrow"></p><h1 id="page-heading"></h1></div><div class="reader-text" id="page-text"></div><footer class="page-footer" id="page-footer"><button class="page-turn" disabled aria-hidden="true">${icon('chevron-left')}</button><span class="page-count"><b>1</b><i> / 1</i></span><button class="page-turn" disabled aria-hidden="true">${icon('chevron-right')}</button></footer></article>`;
}
function playerHTML() {
  const book = current()!; const chapter = chapterAt(book);
  const isPlaying = audio.state.bookId === book.id && audio.state.playing;
  const speaker = characterAt(book, book.position)?.name || '';
  const status = audio.state.error || (audio.state.preparing?`Préparation ${audio.state.prepared ?? 0} / ${audio.state.total ?? 0} passages`:audio.state.loading?`${speaker?`${speaker} · `:''}La voix prépare le prochain passage…`:isPlaying?`${speaker?`${esc(speaker)} · `:''}${esc(chapter.title)} — laissez l’histoire vous emporter.`:'Touchez une phrase pour choisir le départ.');
  return `<section class="player" aria-label="Lecteur audio"><div class="player-top"><button class="voice-chip" data-action="choose-voice">${icon('audio-lines')}<span>${esc(characterAt(book, book.position)?.name || voiceName())}</span>${icon('chevron-down')}</button><button class="speed-chip" data-action="speed" aria-label="Vitesse de ${esc(voiceName())}">${settings.rate.toLocaleString('fr')}<span>×</span></button><button class="sleep-chip ${audio.state.sleepAt?'on':''}" data-action="sleep">${icon('moon')}${audio.state.sleepAt?`${Math.max(1,Math.ceil((audio.state.sleepAt-Date.now())/60000))} min`:'Minuteur'}</button></div><label class="sr-only" for="progress">Position dans le livre</label><input class="progress-slider" id="progress" type="range" min="0" max="${book.segments.length-1}" value="${Math.min(book.position,book.segments.length-1)}" style="--progress:${progress(book)}" /><div class="time-row"><span>${percent(book)} % du livre</span><span>${book.completed?'Lecture terminée':`${minutes(book)} restantes`}</span></div><div class="transport">${iconButton('skip-back','Phrase précédente','previous')}<button class="play-button ${audio.state.loading?'loading':''}" data-action="toggle" aria-label="${isPlaying?'Mettre en pause':'Lire à voix haute'}">${icon(audio.state.loading?'loader-circle':isPlaying?'pause':'play')}</button>${iconButton('skip-forward','Phrase suivante','next')}${iconButton('download','Préparer ce chapitre hors ligne','prepare')}</div><p class="player-status" aria-live="polite">${esc(status)}</p></section>`;
}
function nowBar() {
  return `<aside class="now-bar" id="now-bar" hidden data-action="follow" role="button" tabindex="0" aria-label="Revenir à la phrase en cours"><span class="now-wave" aria-hidden="true"><b></b><b></b><b></b></span><div class="now-copy"><small>EN COURS · <span id="now-chapter"></span></small><p id="now-text"></p></div><span class="now-return">${icon('locate-fixed')}<i>Revenir</i></span></aside>`;
}
function readerView() {
  const book = current()!; if (!book) return libraryView();
  return `${readerHeader()}${readerSubhead()}${settings.layout === 'pages' ? readingPages() : readingScroll()}${nowBar()}${playerHTML()}`;
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
  const key = [book.id, chapter.start, settings.fontSize, settings.theme, innerWidth, innerHeight].join(':');
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
  box.innerHTML = (pages[page] ?? []).map(run => sentenceButton(book.segments[run.index].slice(run.from, run.to), run.index, book, run.from)).join('');
  box.classList.remove('turn-next', 'turn-prev');
  if (direction === 'next' || direction === 'prev') { void box.offsetWidth; box.classList.add(direction === 'next' ? 'turn-next' : 'turn-prev'); }
  footer.innerHTML = `<button class="page-turn" data-action="page-prev" ${first?'disabled':''} aria-label="Page précédente">${icon('chevron-left')}</button><span class="page-count"><b>${page+1}</b><i> / ${pages.length}</i></span><button class="page-turn" data-action="page-next" ${page>=pages.length-1?'disabled':''} aria-label="Page suivante">${icon('chevron-right')}</button>`;
  decorate();
}
function syncNowBar() {
  const bar = document.querySelector<HTMLElement>('#now-bar'); if (!bar) return;
  const book = active();
  const visible = screen === 'reader' && !!book && currentId === book.id && !follow && !!book.segments[book.position];
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
  const apply = () => document.documentElement.style.setProperty('--player-h', `${Math.ceil(player.getBoundingClientRect().height)}px`);
  apply();
  playerObserver = new ResizeObserver(apply);
  playerObserver.observe(player);
}
function replacePlayer() {
  const player = document.querySelector('.player'); if (!player) return;
  const temp = document.createElement('div'); temp.innerHTML = playerHTML();
  player.replaceWith(temp.querySelector('.player')!); decorate(); observePlayer();
}
const karaoke = { index: -1, mot: -1 };

function suivreMot(phrase: HTMLElement) {
  if (!follow) return;
  const actif = phrase.querySelector<HTMLElement>('.mot-actif');
  if (!actif) return;
  const rect = actif.getBoundingClientRect();
  if (rect.top < innerHeight * 0.28 || rect.bottom > innerHeight * 0.72) {
    actif.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  }
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

function settingsView() {
  return `<header class="page-heading"><div><p class="eyebrow">FAITES COMME CHEZ VOUS</p><h1>À votre rythme<span>.</span></h1></div><span class="build-chip">${version}</span></header>
  <section class="settings-section"><h2>Le confort de lecture</h2><div class="theme-picker">${[['light','sun','Clair'],['paper','book-open','Papier'],['dark','moon','Nuit']].map(([id,ic,label])=>`<button class="theme-option theme-${id} ${settings.theme===id?'active':''}" data-action="theme" data-id="${id}" aria-pressed="${settings.theme===id}">${icon(ic)}<span>${label}</span></button>`).join('')}</div>
  <button class="setting-row" data-action="appearance"><span>${icon('type')} Taille du texte</span><strong>${settings.fontSize} px ${icon('chevron-right')}</strong></button>
  <button class="setting-row" data-action="layout"><span>${icon('columns-2')} Mise en page</span><strong>${settings.layout==='pages'?'Pages':'Défilement'} ${icon('chevron-right')}</strong></button>
  <button class="setting-row" data-action="speed"><span>${icon('gauge')} Vitesse d’écoute</span><strong>${settings.rate.toLocaleString('fr')}× ${icon('chevron-right')}</strong></button></section>
  <section class="settings-section"><div class="section-heading"><h2>Votre studio vocal</h2><span class="pill">FACULTATIF</span></div><p class="section-description">Retrouvez vos voix clonées depuis PK Voice Studio. Les passages générés restent sur le téléphone pour les prochaines écoutes.</p><form id="studio-form"><label for="server">Adresse du studio</label><input id="server" name="server" type="url" placeholder="http://192.168.1.20:8810" value="${esc(settings.server)}" autocapitalize="none" spellcheck="false" required /><label for="token">Code de connexion</label><input id="token" name="token" type="password" placeholder="Le code affiché par votre Mac" value="${esc(settings.token)}" autocomplete="off" required /><button type="submit" class="primary">${icon('plug')} Connecter le studio</button></form><details class="connection-help"><summary>Comment connecter mon Mac ?</summary><p>Démarrez PK Voice Studio, puis la passerelle mobile depuis le dossier du projet :</p><code>python3 src/server/mobile_gateway.py</code><p>Recopiez l’adresse et le code affichés. Votre téléphone et votre Mac doivent être sur le même réseau. La génération se fait sur le Mac ; l’audio est enregistré sur le téléphone.</p></details></section>
  <section class="settings-section"><h2>Crédits & inspirations</h2><div class="credits-list"><p>PK Reader est un projet original. Son ergonomie de lecture s’inspire de <a href="https://play.google.com/store/apps/details?id=voice.reader.ai" target="_blank" rel="noopener noreferrer">TTS Reader Pro</a> et de <a href="https://readexa.uk/" target="_blank" rel="noopener noreferrer">Readexa</a>.</p><p>Moteurs et bibliothèques : Capacitor, sherpa-onnx, Piper, PDF.js, fflate, Lucide, DM Sans et Literata — licences dans <code>THIRD_PARTY.md</code>.</p></div></section>
  <section class="settings-section about"><span class="brand-mark">${icon('audio-lines')}</span><div><h2>PK Reader <span>${version}</span></h2><p>Vos livres. Votre rythme. Votre voix.</p></div><a href="https://ko-fi.com/pouark" target="_blank" rel="noopener noreferrer" aria-label="Soutenir PK Reader sur Ko-fi">${icon('heart')}</a></section>`;
}

/* ------------------------------------------------------------------- rendu */

function render() {
  savePrefs();
  app.className = `app-shell ${screen==='reader'?'reader-mode':''} layout-${settings.layout} ${active()?'has-player':''}`;
  app.innerHTML = `${navigation()}<main id="main" class="main-content ${screen==='reader'?'reader-content':''}">${screen==='library'?libraryView():screen==='reader'?readerView():screen==='voices'?voicesView():settingsView()}</main>${miniPlayer()}`;
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
async function openBook(id: string, listen = false) {
  sheet.close();
  const book = books.find(b => b.id === id); if (!book) return;
  currentId = id; book.opened = Date.now();
  if (book.completed && listen) { book.position = 0; book.completed = false; }
  await library.save(book);
  screen = 'reader'; follow = true; page = 0; pagesKey = '';
  if (audio.state.bookId !== id) await audio.load(book, settings);
  render();
  if (listen) await audio.play();
  else if (settings.layout === 'pages') jumpToCurrent();
  else { guard(); document.querySelector('.current-sentence')?.scrollIntoView({ block: 'center' }); }
}
async function importFiles(files: File[]) {
  if (importing) return; importing = true; sheet.close(); toast('Import des livres…');
  let count = 0;
  for (const file of files) {
    try {
      const book = await importBook(file);
      if (books.some(b => b.id === book.id)) { toast(`${book.title} est déjà dans votre bibliothèque.`); continue; }
      await library.save(book); books.unshift(book); count++;
    } catch (e) { toast(`${file.name} : ${e instanceof Error?e.message:e}`); }
  }
  importing = false; screen = 'library'; filter = 'all'; search = ''; render();
  if (count) toast(`${count} livre${count>1?'s':''} ajouté${count>1?'s':''} à votre bibliothèque.`);
  fileInput.value = '';
}

/* ------------------------------------------------------------ lecture suivie */

function updatePlayback() {
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
        document.querySelector('.current-sentence')?.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
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

/* ------------------------------------------------------------------ actions */

async function handle(action: string, el: HTMLElement) {
  const id = el.dataset.id ?? '';
  const book = current() ?? active();
  switch (action) {
    case 'nav': screen = id as typeof screen; sheet.close(); follow = true; guard(); render(); window.scrollTo(0, 0); break;
    case 'back': screen = 'library'; follow = true; render(); window.scrollTo(0, 0); break;
    case 'open': await openBook(id); break;
    case 'listen': await openBook(id, true); break;
    case 'toggle': if (audio.state.playing || audio.state.loading) await audio.pause(); else { if (book && audio.state.bookId !== book.id) await audio.load(book, settings); await audio.play(); } break;
    case 'previous': await seekTo(audio.state.index - 1); break;
    case 'next': await seekTo(audio.state.index + 1); break;
    case 'sentence': await seekTo(Number(el.dataset.index)); break;
    case 'page-prev': follow = false; if (page > 0) { page--; drawPage('prev'); syncNowBar(); } break;
    case 'page-next': follow = false; if (page < pages.length - 1) { page++; drawPage('next'); syncNowBar(); } break;
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
    case 'sleep': modal('Encore quelques pages',`<p class="sheet-description">La lecture s’arrêtera automatiquement. Votre place sera conservée.</p><div class="choice-grid">${[0,5,15,30,45,60].map(n=>`<button class="choice" data-action="set-sleep" data-id="${n}">${n?`${n} min`:'Désactivé'}</button>`).join('')}</div>`); break;
    case 'set-sleep': await audio.sleep(Number(id)); sheet.close(); render(); toast(id==='0'?'Minuteur désactivé.':`Arrêt de la lecture dans ${id} minutes.`); break;
    case 'appearance': modal('Le confort des mots',`<p class="sheet-description">Une taille de texte adaptée à vos yeux.</p><div class="choice-grid">${[18,20,22,25,28,32].map(n=>`<button class="choice ${settings.fontSize===n?'active':''}" data-action="font" data-id="${n}" style="font-size:${n}px">Aa</button>`).join('')}</div><div class="choice-grid themes">${[['light','Clair'],['paper','Papier'],['dark','Nuit']].map(([id,label])=>`<button class="choice ${settings.theme===id?'active':''}" data-action="theme" data-id="${id}">${label}</button>`).join('')}</div><div class="choice-grid pair">${[['pages','Pages à tourner'],['scroll','Défilement continu']].map(([id,label])=>`<button class="choice ${settings.layout===id?'active':''}" data-action="layout" data-id="${id}">${label}</button>`).join('')}</div>`); break;
    case 'font': settings.fontSize = Number(id); sheet.close(); pagesKey = ''; render(); break;
    case 'theme': settings.theme = id as typeof settings.theme; sheet.close(); render(); break;
    case 'layout': settings.layout = (id || (settings.layout === 'pages' ? 'scroll' : 'pages')) as 'pages' | 'scroll'; pagesKey = ''; sheet.close(); render(); toast(settings.layout === 'pages' ? 'Lecture page à page.' : 'Lecture en défilement continu.'); break;
    case 'chapters': if (book) modal('Dans ce livre',`<div class="chapter-list">${book.chapters.map((c,i)=>`<button data-action="chapter" data-index="${c.start}" class="${chapterAt(book)===c?'active':''}"><span>${String(i+1).padStart(2,'0')}</span><strong>${esc(c.title)}</strong>${icon(chapterAt(book)===c?'audio-lines':'chevron-right')}</button>`).join('')}</div>${book.bookmarks.length?`<h3 class="bookmarks-heading">Vos signets</h3><div class="chapter-list">${book.bookmarks.map(i=>`<button data-action="chapter" data-index="${i}">${icon('bookmark')}<strong>${esc(book.segments[i]?.slice(0,90))}…</strong></button>`).join('')}</div>`:''}`); break;
    case 'chapter': follow = true; page = 0; await audio.seek(Number(el.dataset.index)); sheet.close(); render(); window.scrollTo(0, 0); break;
    case 'chapter-next': if (book) { const next = chapterAt(book).end; if (next < book.segments.length) { follow = true; page = 0; await audio.seek(next); render(); window.scrollTo(0, 0); } else { screen = 'library'; render(); } } break;
    case 'bookmark': if (book) { const pos = Math.min(book.position, book.segments.length - 1); book.bookmarks = book.bookmarks.includes(pos) ? book.bookmarks.filter(i => i !== pos) : [...book.bookmarks, pos].sort((a, b) => a - b); await library.save(book); render(); toast(book.bookmarks.includes(pos)?'Passage ajouté aux signets.':'Signet retiré.'); } break;
    case 'voice-tab': voiceTab = id; render(); break;
    case 'casting': if (book) await openCasting(book, [...voices, ...models], settings, modal, render); break;
    case 'choose-voice': modal('Changer de voix', `${book ? '<button class="setting-row" data-action="casting">Une voix par personnage →</button>' : ''}${quickVoiceBody()}`); break;
    case 'select-voice': settings.voice = id; settings.rate = settings.voiceRates?.[id] ?? settings.rate; savePrefs(); if (sheet.open) sheet.close(); if (active()) await audio.load(active()!, settings); render(); toast(`Voix appliquée à cette écoute · ${settings.rate.toLocaleString('fr')}×`); break;
    case 'preview': {
      const demo = welcomeBook(); demo.id = 'voice-preview'; demo.title = 'Aperçu de la voix'; demo.segments = ['Fermez les yeux, ouvrez un livre. Je vous accompagne au fil des pages, à votre rythme.'];
      await audio.load(demo, { ...settings, voice: id }); await audio.play(); toast('Aperçu de la voix en cours.'); break;
    }
    case 'install':
      if (!native) { toast('Le téléchargement des modèles est disponible dans l’APK Android.'); break; }
      await Reader.installModel({ id }); downloading = true; toast('Téléchargement démarré. Gardez l’app ouverte.'); void pollModels(); break;
    case 'remove-model': if (native) { await audio.pause(); await Reader.removeModel({ id }); if (settings.voice === id) { settings.voice = 'system:default'; savePrefs(); } models = (await Reader.models()).voices; render(); toast('Voix supprimée de cet appareil.'); } break;
    case 'voice-settings': if (native) await Reader.voiceSettings(); else toast('Les réglages des voix Android sont accessibles dans l’APK.'); break;
    case 'prepare': if (native && book) { if (book.segments.slice(chapterAt(book).start, chapterAt(book).end).some((_, offset) => speechProfile(book, settings, chapterAt(book).start + offset).voice.startsWith('system:'))) { toast('Pour préparer ce chapitre, choisissez une voix Piper pour chaque rôle utilisé.'); break; } modal('Emporter ce chapitre',`<p class="sheet-description">Les passages de « ${esc(chapterAt(book).title)} » seront générés et conservés sur le téléphone. Avec une voix clonée, votre Mac doit rester connecté pendant la préparation.</p><button class="primary" data-action="prepare-confirm">${icon('download')} Préparer le chapitre</button>`); } else toast('La préparation hors ligne est disponible dans l’APK Android.'); break;
    case 'prepare-confirm': if (book) { await Reader.command({ action:'prepare', index:chapterAt(book).start, end:chapterAt(book).end }); sheet.close(); toast('Préparation du chapitre démarrée.'); } break;
    case 'book-menu': { const b = books.find(b => b.id === id); if (b) modal(esc(b.title.replace(/\n/g,' ')),`<button class="setting-row" data-action="open" data-id="${id}"><span>${icon('book-open')} Ouvrir le livre</span></button><button class="setting-row" data-action="clear-audio" data-id="${id}"><span>${icon('hard-drive')} Effacer les audios préparés</span></button><button class="setting-row danger" data-action="delete-confirm" data-id="${id}"><span>${icon('trash-2')} Retirer de la bibliothèque</span></button>`); break; }
    case 'clear-audio': if (native) { await audio.pause(); await Reader.clearAudio({ bookId: id }); toast('Audios de ce livre effacés.'); } else toast('Aucun audio conservé dans cet aperçu web.'); sheet.close(); break;
    case 'delete-confirm': modal('Retirer ce livre ?',`<p class="sheet-description">Le livre, sa position et ses signets seront retirés de cette bibliothèque. Le fichier d’origine restera intact.</p><button class="primary danger-button" data-action="delete" data-id="${id}">Retirer le livre</button>`); break;
    case 'delete': if (audio.state.bookId === id) await audio.pause(); await library.remove(id); books = books.filter(b => b.id !== id); sheet.close(); render(); toast('Livre retiré de la bibliothèque.'); break;
  }
}

/* ------------------------------------------------------------------ modèles */

async function pollModels() {
  if (!native) return;
  try {
    const result = await Reader.models(); models = result.voices;
    const entries = Object.entries(result.downloads);
    downloading = entries.some(([, d]) => d.progress < 100 && !d.error);
    const status = entries.map(([id, d]) => `${modelCatalog.find(m => m.id === id)?.name ?? id} : ${d.error || `${Math.round(d.progress)} %`}`).join(' · ');
    const el = document.querySelector('#download-status'); if (el) el.textContent = status;
    if (!downloading) { render(); if (status) toast(status); }
  } catch (e) { toast(String(e)); downloading = false; }
  if (downloading) setTimeout(() => void pollModels(), 1000);
}

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
  if (screen !== 'reader' || settings.layout !== 'pages' || sheet.open) return;
  const next = e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'PageDown';
  const previous = e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'PageUp';
  if (!next && !previous) return;
  e.preventDefault(); follow = false;
  if (next && page < pages.length - 1) { page++; drawPage('next'); } else if (previous && page > 0) { page--; drawPage('prev'); }
  syncNowBar();
});
window.addEventListener('scroll', () => {
  if (screen !== 'reader' || !follow || performance.now() < scrollGuard) return;
  follow = false; syncNowBar();
}, { passive: true });
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
    void Reader.connect({ server: settings.server, token: settings.token }).then(r => { clones = r.voices; savePrefs(); voiceTab = 'clone'; screen = 'voices'; render(); toast(`${clones.length} voix retrouvée${clones.length>1?'s':''}.`); }).catch(error => { button.disabled = false; button.textContent = 'Connecter le studio'; toast(error.message ?? String(error)); });
  }
});
window.addEventListener('hashchange', () => { if (location.hash === '#library') { screen = 'library'; render(); } });

/* -------------------------------------------------------------------- départ */

async function init() {
  try {
    books = await library.all();
    if (!books.length && !localStorage.getItem('pk-reader-welcomed')) { const book = welcomeBook(); await library.save(book); books = [book]; localStorage.setItem('pk-reader-welcomed','1'); }
    voices = await audio.voices();
    if (native) { models = (await Reader.models()).voices; if (settings.server && settings.token) void Reader.connect({ server: settings.server, token: settings.token }).then(r => { clones = r.voices; if (screen === 'voices') render(); }).catch(() => {}); }
    render(); await audio.init();
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
