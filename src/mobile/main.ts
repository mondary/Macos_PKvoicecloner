import '@fontsource/dm-sans/400.css';
import '@fontsource/dm-sans/500.css';
import '@fontsource/dm-sans/600.css';
import '@fontsource/dm-sans/700.css';
import '@fontsource/literata/400.css';
import '@fontsource/literata/500.css';
import { createIcons, icons } from 'lucide';
import './style.css';
import { library, readSettings, saveSettings } from './storage';
import { importBook, welcomeBook, chapterAt, minutesLeft } from './books';
import { audio, native, Reader, modelCatalog } from './engine';
import type { Book, Voice } from './types';

const app = document.querySelector<HTMLDivElement>('#app')!;
const sheet = document.querySelector<HTMLDialogElement>('#sheet')!;
const fileInput = document.querySelector<HTMLInputElement>('#file-input')!;
const settings = readSettings();
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
const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const icon = (name: string, cls = '') => `<i data-lucide="${name}" class="${cls}" aria-hidden="true"></i>`;
const iconButton = (name: string, label: string, action: string, cls = '') => `<button class="icon-button ${cls}" aria-label="${esc(label)}" title="${esc(label)}" data-action="${action}">${icon(name)}</button>`;
const current = () => books.find(b => b.id === currentId);
const active = () => books.find(b => b.id === audio.state.bookId);
const voiceName = () => [...voices,...models,...clones].find(v=>v.id===settings.voice)?.name ?? (settings.voice.startsWith('clone:') ? 'Voix clonée' : 'Voix du téléphone');
const percent = (book: Book) => Math.round(book.position / book.segments.length * 100);

function toast(message: string) {
  const el = document.querySelector<HTMLDivElement>('#toast')!;
  el.textContent = message; el.classList.add('visible'); clearTimeout(toastTimer);
  toastTimer = setTimeout(()=>el.classList.remove('visible'),5000);
}
function decorate() { createIcons({ icons, attrs: { 'stroke-width': 1.7 } }); }
function savePrefs() { saveSettings(settings); document.documentElement.dataset.theme = settings.theme; document.documentElement.style.setProperty('--reader-size',`${settings.fontSize}px`); }
function cover(book: Book, cls = '') {
  if (book.cover) return `<div class="book-cover image-cover ${cls}"><img src="${esc(book.cover)}" alt="Couverture de ${esc(book.title)}" /></div>`;
  return `<div class="book-cover cover-${book.color} ${cls}"><span class="cover-edition">${book.sample ? 'LE GOÛT DES HISTOIRES' : esc(book.format)}</span><span class="cover-title">${esc(book.title).replace(/\n/g,'<br>')}</span><span class="cover-art" aria-hidden="true"><b></b><b></b><b></b></span><span class="cover-author">${esc(book.sample ? 'PK READER' : book.author)}</span></div>`;
}
function navigation() {
  return `<nav class="navigation" aria-label="Navigation principale"><a class="brand" href="#library" aria-label="PK Reader, bibliothèque"><span class="brand-mark">${icon('audio-lines')}</span><span>pk<span class="brand-light">reader</span><small>LE PLAISIR D’ÉCOUTER</small></span></a><div class="nav-items">${[
    ['library','library-big','Bibliothèque'],['voices','audio-lines','Voix'],['settings','sliders-horizontal','Réglages'],
  ].map(([id,ic,label])=>`<button class="nav-item ${screen===id?'selected':''}" data-action="nav" data-id="${id}" ${screen===id?'aria-current="page"':''}>${icon(ic)}<span>${label}</span></button>`).join('')}</div><div class="nav-footer">Vos livres restent<br>entre vos mains.${icon('shield-check')}</div></nav>`;
}
function miniPlayer() {
  const book = active(); if (!book || screen==='reader') return '';
  return `<aside class="mini-player" aria-label="Lecture en cours"><button class="mini-book" data-action="open" data-id="${book.id}">${cover(book,'tiny')}<span><strong>${esc(book.title.replace(/\n/g,' '))}</strong><small>${esc(audio.state.loading?'Préparation de la voix…':chapterAt(book)?.title ?? '')}</small></span></button>${iconButton(audio.state.playing?'pause':'play',audio.state.playing?'Mettre en pause':'Reprendre la lecture','toggle','mini-play')}<div class="mini-progress" style="width:${percent(book)}%"></div></aside>`;
}
function libraryView() {
  const real = books.filter(b=>!b.sample);
  const resume = [...books].sort((a,b)=>b.opened-a.opened)[0];
  const filtered = books.filter(b => (filter==='all' || (filter==='reading' && b.position>0 && !b.completed) || (filter==='finished' && b.completed)) && `${b.title} ${b.author}`.toLowerCase().includes(search.toLowerCase()));
  return `<header class="page-heading"><div><p class="eyebrow">VOTRE BULLE DE LECTURE</p><h1>Mes livres<span>.</span></h1></div><button class="add-button" data-action="import" aria-label="Importer un livre">${icon('plus')}<span>Ajouter un livre</span></button></header>
  ${resume && !search && filter==='all' ? `<section class="resume-card"><div class="resume-copy"><span class="label-dot">${resume.opened?'REPRENDRE LE FIL':'VOTRE PREMIÈRE ÉCOUTE'}</span><h2>${esc(resume.sample?'Vos livres.\nÀ voix haute.':resume.title).replace(/\n/g,'<br>')}</h2><p>${resume.sample?'Installez-vous. Vos histoires ont<br>tant de choses à vous raconter.':`${esc(resume.author)}<br>${esc(chapterAt(resume)?.title ?? '')}`}</p><button class="primary" data-action="listen" data-id="${resume.id}">${icon('play')} ${resume.opened?'Reprendre l’écoute':'Écouter le guide'}</button><div class="resume-meta">${icon('headphones')}<span>${minutesLeft(resume,settings.rate)} min ${resume.sample?'pour découvrir':'restantes'}</span><span>·</span><span>${resume.sample?'Texte de démonstration':`${percent(resume)} % lu`}</span></div></div><button class="hero-book" data-action="open" data-id="${resume.id}" aria-label="Lire ${esc(resume.title)}">${cover(resume,'hero-cover')}</button></section>`:''}
  <section class="library-section"><div class="section-heading"><h2>Sur votre étagère <span>${books.length}</span></h2>${iconButton('search','Rechercher un livre','search')}</div><div class="library-tools"><div class="segmented" role="group" aria-label="Filtrer les livres">${[['all','Tous'],['reading','En cours'],['finished','Terminés']].map(([id,label])=>`<button data-action="filter" data-id="${id}" class="${filter===id?'active':''}" aria-pressed="${filter===id}">${label}</button>`).join('')}</div><span class="library-count">${real.length ? `${real.length} livre${real.length>1?'s':''} importé${real.length>1?'s':''}`:'Un peu de place pour vos histoires'}</span></div>
  <div class="search-row ${search?'expanded':''}" id="search-row"><label class="sr-only" for="search">Rechercher dans la bibliothèque</label>${icon('search')}<input id="search" type="search" placeholder="Un titre, un auteur…" value="${esc(search)}" autocomplete="off" /></div>
  <div class="books-grid">${filtered.map(b=>`<article class="book-item"><button class="book-open" data-action="open" data-id="${b.id}">${cover(b)}<strong>${esc(b.title.replace(/\n/g,' '))}</strong><span>${esc(b.author)}</span></button><div class="book-bottom"><span>${b.completed?'Terminé':b.position>0?`${percent(b)} % · ${minutesLeft(b,settings.rate)} min restantes`:b.sample?'GUIDE DE DÉCOUVERTE':b.format}</span>${iconButton('ellipsis','Options du livre','book-menu').replace('data-action="book-menu"',`data-action="book-menu" data-id="${b.id}"`)}</div>${b.position>0?`<div class="book-progress"><span style="width:${percent(b)}%"></span></div>`:''}</article>`).join('')}${filter==='all'&&!search?`<button class="import-tile" data-action="import"><span>${icon('plus')}</span><strong>La suite vous appartient.</strong><small>Importez votre prochain livre<br>EPUB, PDF ou texte</small></button>`:''}</div>
  ${!filtered.length?'<div class="empty-state">Aucun livre ici pour le moment.</div>':''}</section>
  <div class="privacy-note">${icon('lock-keyhole')}<p>Votre bibliothèque, sur votre appareil.<br><span>Sans compte. Sans publicité. Juste vos livres.</span></p></div>`;
}
function readerView() {
  const book = current(); if (!book) return libraryView();
  const chapter = chapterAt(book);
  const isPlaying = audio.state.bookId===book.id && audio.state.playing;
  return `<header class="reader-header">${iconButton('arrow-left','Retour à la bibliothèque','back')}<div><span>${esc(book.title.replace(/\n/g,' '))}</span><small>${esc(book.author)}</small></div>${iconButton('type','Apparence du texte','appearance')}</header>
    <div class="reader-subhead"><button data-action="chapters">${icon('list')} ${esc(chapter.title)} ${icon('chevron-down')}</button>${iconButton(book.bookmarks.includes(book.position)?'bookmark-check':'bookmark','Marquer le passage','bookmark')}</div>
    <article class="reading-page"><p class="eyebrow">${book.sample?'PRENDRE LE TEMPS':esc(book.author.toUpperCase())}</p><h1>${esc(chapter.title)}</h1><div class="reader-text">${book.segments.slice(chapter.start,chapter.end).map((text,i)=>`<button class="sentence ${chapter.start+i===book.position?'current-sentence':''} ${book.bookmarks.includes(chapter.start+i)?'marked':''}" data-action="sentence" data-index="${chapter.start+i}" ${chapter.start+i===book.position?'aria-current="true"':''}>${esc(text)}</button>`).join('')}</div><button class="next-chapter" data-action="chapter-next">${chapter.end<book.segments.length?'Chapitre suivant':'Retour à la bibliothèque'} ${icon('arrow-right')}</button></article>
    <section class="player" aria-label="Lecteur audio"><div class="player-top"><button class="voice-chip" data-action="choose-voice">${icon('audio-lines')}<span>${esc(voiceName())}</span>${icon('chevron-down')}</button><button class="sleep-chip ${audio.state.sleepAt?'on':''}" data-action="sleep">${icon('moon')}${audio.state.sleepAt?`${Math.max(1,Math.ceil((audio.state.sleepAt-Date.now())/60000))} min`:'Minuteur'}</button></div><label class="sr-only" for="progress">Position dans le livre</label><input class="progress-slider" id="progress" type="range" min="0" max="${book.segments.length-1}" value="${Math.min(book.position,book.segments.length-1)}" style="--progress:${percent(book)}%" /><div class="time-row"><span>${percent(book)} % du livre</span><span>${book.completed?'Lecture terminée':`${minutesLeft(book,settings.rate)} min restantes`}</span></div><div class="transport"><button class="speed-button" data-action="speed">${settings.rate.toLocaleString('fr')}<span>×</span></button>${iconButton('skip-back','Phrase précédente','previous')}<button class="play-button ${audio.state.loading?'loading':''}" data-action="toggle" aria-label="${isPlaying?'Mettre en pause':'Lire à voix haute'}">${icon(audio.state.loading?'loader-circle':isPlaying?'pause':'play')}</button>${iconButton('skip-forward','Phrase suivante','next')}${iconButton('download','Préparer ce chapitre hors ligne','prepare')}</div><p class="player-status" aria-live="polite">${esc(audio.state.error || (audio.state.preparing?`Préparation ${audio.state.prepared ?? 0} / ${audio.state.total ?? 0} passages`:audio.state.loading?'La voix prépare le prochain passage…':isPlaying?'Laissez l’histoire vous emporter.':'Touchez une phrase pour choisir le départ.'))}</p></section>`;
}
function voiceCard(v: Voice, index: number) {
  const selected = settings.voice === v.id;
  return `<article class="voice-card ${selected?'chosen':''}"><div class="voice-card-main"><span class="voice-avatar avatar-${index%4}">${icon(v.kind==='clone'?'mic':'audio-lines')}</span><div><h3>${esc(v.name)} ${selected?icon('circle-check'):''}</h3><p>${esc(v.detail ?? `${v.language} · ${v.network?'connexion requise':'sur cet appareil'}`)}</p></div></div><div class="voice-card-bottom"><span class="voice-status">${icon(v.installed?'check':'download')}${v.installed?(v.network?'En ligne':'Disponible'): `${v.size} Mo · hors ligne après installation`}</span><div>${v.installed?`<button class="text-button" data-action="preview" data-id="${esc(v.id)}" aria-label="Écouter ${esc(v.name)}">${icon('play')}</button><button class="small-button ${selected?'selected':''}" data-action="select-voice" data-id="${esc(v.id)}">${selected?'Choisie':'Choisir'}</button>${v.kind==='neural'?`<button class="text-button" data-action="remove-model" data-id="${esc(v.id)}" aria-label="Supprimer ${esc(v.name)}">${icon('trash-2')}</button>`:''}`:`<button class="small-button" data-action="install" data-id="${esc(v.id)}">${icon('download')} Télécharger</button>`}</div></div></article>`;
}
function voicesView() {
  const list = voiceTab==='neural'?models:voiceTab==='clone'?clones:voices;
  return `<header class="page-heading"><div><p class="eyebrow">À CHAQUE HISTOIRE, SA VOIX</p><h1>À l’écoute<span>.</span></h1></div><span class="heading-icon">${icon('audio-lines')}</span></header><section class="voice-intro"><span class="voice-orbit">${icon('audio-lines')}</span><div><h2>Le ton juste.<br>Pour tous vos livres.</h2><p>Une voix familière, un nouveau timbre.<br>Choisissez celle que vous aimez entendre.</p></div></section><div class="segmented voice-tabs" role="group" aria-label="Types de voix">${[['neural','À télécharger'],['system','Mon téléphone'],['clone','Mes clones']].map(([id,label])=>`<button data-action="voice-tab" data-id="${id}" class="${voiceTab===id?'active':''}" aria-pressed="${voiceTab===id}">${label}</button>`).join('')}</div><div class="voice-list">${list.map(voiceCard).join('')}</div><p id="download-status" role="status"></p>${voiceTab==='clone'&&!clones.length?`<div class="empty-card">${icon('mic')}<h2>Votre propre voix, dans vos livres.</h2><p>Connectez PK Voice Studio sur votre Mac pour retrouver vos voix clonées et générer les passages à écouter.</p><button class="primary" data-action="nav" data-id="settings">Connecter mon studio ${icon('arrow-right')}</button></div>`:''}${voiceTab==='system'?`<button class="setting-row" data-action="voice-settings"><span>${icon('settings-2')} Installer ou régler les voix Android</span>${icon('arrow-up-right')}</button>`:''}<div class="privacy-note">${icon('wifi-off')}<p>${voiceTab==='neural'?'Un téléchargement, puis la liberté.':'Vous gardez le choix.'}<br><span>${voiceTab==='neural'?'Les voix Piper lisent directement sur votre téléphone.':'Les voix clonées sont générées par votre studio, puis mises en cache.'}</span></p></div>${!native?'<p class="web-note">Aperçu web : les voix du navigateur sont utilisables ici. Les modèles Piper et les voix du studio fonctionnent dans l’app Android.</p>':''}`;
}
function settingsView() {
  return `<header class="page-heading"><div><p class="eyebrow">FAITES COMME CHEZ VOUS</p><h1>À votre rythme<span>.</span></h1></div></header><section class="settings-section"><h2>Le confort de lecture</h2><div class="theme-picker">${[['light','sun','Clair'],['paper','book-open','Papier'],['dark','moon','Nuit']].map(([id,ic,label])=>`<button class="theme-option theme-${id} ${settings.theme===id?'active':''}" data-action="theme" data-id="${id}" aria-pressed="${settings.theme===id}">${icon(ic)}<span>${label}</span></button>`).join('')}</div><button class="setting-row" data-action="appearance"><span>${icon('type')} Taille du texte</span><strong>${settings.fontSize} px ${icon('chevron-right')}</strong></button><button class="setting-row" data-action="speed"><span>${icon('gauge')} Vitesse d’écoute</span><strong>${settings.rate.toLocaleString('fr')}× ${icon('chevron-right')}</strong></button></section><section class="settings-section"><div class="section-heading"><h2>Votre studio vocal</h2><span class="pill">FACULTATIF</span></div><p class="section-description">Retrouvez vos voix clonées depuis PK Voice Studio. Les passages générés restent sur le téléphone pour les prochaines écoutes.</p><form id="studio-form"><label for="server">Adresse du studio</label><input id="server" name="server" type="url" placeholder="http://192.168.1.20:8810" value="${esc(settings.server)}" autocapitalize="none" spellcheck="false" required /><label for="token">Code de connexion</label><input id="token" name="token" type="password" placeholder="Le code affiché par votre Mac" value="${esc(settings.token)}" autocomplete="off" required /><button type="submit" class="primary">${icon('plug')} Connecter le studio</button></form><details class="connection-help"><summary>Comment connecter mon Mac ?</summary><p>Démarrez PK Voice Studio, puis la passerelle mobile depuis le dossier du projet :</p><code>python3 src/server/mobile_gateway.py</code><p>Recopiez l’adresse et le code affichés. Votre téléphone et votre Mac doivent être sur le même réseau. La génération se fait sur le Mac ; l’audio est enregistré sur le téléphone.</p></details></section><section class="settings-section about"><span class="brand-mark">${icon('audio-lines')}</span><div><h2>PK Reader <span>2026.10.48</span></h2><p>Vos livres. Votre rythme. Votre voix.</p></div><a href="https://ko-fi.com/pouark" target="_blank" rel="noopener noreferrer" aria-label="Soutenir PK Reader sur Ko-fi">${icon('heart')}</a></section>`;
}
function render() {
  savePrefs();
  app.className = `app-shell ${screen==='reader'?'reader-mode':''} ${active()?'has-player':''}`;
  app.innerHTML = `${navigation()}<main id="main" class="main-content ${screen==='reader'?'reader-content':''}">${screen==='library'?libraryView():screen==='reader'?readerView():screen==='voices'?voicesView():settingsView()}</main>${miniPlayer()}`;
  decorate();
}
function modal(title: string, body: string) {
  sheet.innerHTML = `<div class="sheet-handle"></div><header><h2>${title}</h2>${iconButton('x','Fermer','close')}</header>${body}`;
  if (!sheet.open) sheet.showModal(); decorate();
}
async function openBook(id: string, listen = false) {
  sheet.close();
  const book = books.find(b=>b.id===id); if (!book) return;
  currentId = id; book.opened = Date.now();
  if (book.completed && listen) { book.position = 0; book.completed = false; }
  await library.save(book); screen='reader';
  if (audio.state.bookId!==id) await audio.load(book,settings);
  render(); window.scrollTo(0,0);
  if (listen) await audio.play();
  else document.querySelector('.current-sentence')?.scrollIntoView({ block:'center' });
}
async function importFiles(files: File[]) {
  if (importing) return; importing=true; sheet.close(); toast('Import des livres…');
  let count=0;
  for (const file of files) {
    try {
      const book = await importBook(file);
      if (books.some(b=>b.id===book.id)) { toast(`${book.title} est déjà dans votre bibliothèque.`); continue; }
      await library.save(book); books.unshift(book); count++;
    } catch(e) { toast(`${file.name} : ${e instanceof Error?e.message:e}`); }
  }
  importing=false; screen='library'; filter='all'; search=''; render();
  if(count) toast(`${count} livre${count>1?'s':''} ajouté${count>1?'s':''} à votre bibliothèque.`);
  fileInput.value='';
}
function updatePlayback() {
  const b = active(); if (!b) { if(audio.state.error) toast(audio.state.error); return; }
  const changed = savedPosition!==`${b.id}:${audio.state.index}`;
  b.position = audio.state.index; b.completed = b.position>=b.segments.length;
  if(changed) { savedPosition=`${b.id}:${b.position}`; void library.save(b).catch(e=>toast(String(e))); }
  if(screen==='reader' && currentId===b.id) {
    const pageChapter = document.querySelector('.reading-page h1')?.textContent;
    if(pageChapter!==chapterAt(b)?.title) render();
    document.querySelectorAll('.sentence').forEach(el=>{
      const selected=Number((el as HTMLElement).dataset.index)===b.position;
      el.classList.toggle('current-sentence',selected); if(selected) el.setAttribute('aria-current','true'); else el.removeAttribute('aria-current');
    });
    if(changed && audio.state.playing) document.querySelector('.current-sentence')?.scrollIntoView({block:'center',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
    const player = document.querySelector('.player');
    if(player) { const temp = document.createElement('div'); temp.innerHTML=readerView(); player.replaceWith(temp.querySelector('.player')!); decorate(); }
  } else {
    const old=document.querySelector('.mini-player');
    if(old) old.outerHTML=miniPlayer(); else app.insertAdjacentHTML('beforeend',miniPlayer());
    app.classList.add('has-player'); decorate();
  }
}
audio.onChange = updatePlayback;

async function handle(action: string, el: HTMLElement) {
  const id=el.dataset.id ?? ''; const book=current() ?? active();
  switch(action) {
    case 'nav': screen=id as typeof screen; sheet.close(); render(); window.scrollTo(0,0); break;
    case 'back': screen='library'; render(); window.scrollTo(0,0); break;
    case 'open': await openBook(id); break;
    case 'listen': await openBook(id,true); break;
    case 'toggle': if(audio.state.playing || audio.state.loading) await audio.pause(); else { if(book && audio.state.bookId!==book.id) await audio.load(book,settings); await audio.play(); } break;
    case 'previous': await audio.seek(audio.state.index-1); break;
    case 'next': await audio.seek(audio.state.index+1); break;
    case 'sentence': await audio.seek(Number(el.dataset.index)); break;
    case 'filter': filter=id; render(); break;
    case 'search': document.querySelector('#search-row')?.classList.add('expanded'); document.querySelector<HTMLInputElement>('#search')?.focus(); break;
    case 'close': sheet.close(); break;
    case 'import': modal('Une nouvelle histoire',`<p class="sheet-description">Choisissez un livre sur votre appareil. Il restera dans votre bibliothèque, prêt à lire et à écouter.</p><button class="import-choice" data-action="pick-file">${icon('file-up')}<span><strong>Importer des fichiers</strong><small>EPUB, PDF, TXT, Markdown</small></span>${icon('chevron-right')}</button><button class="import-choice" data-action="paste">${icon('clipboard-paste')}<span><strong>Ajouter un texte</strong><small>Un article, une note, quelques pages</small></span>${icon('chevron-right')}</button>`); break;
    case 'pick-file': fileInput.click(); break;
    case 'paste': modal('Un texte à écouter',`<form id="paste-form"><label for="text-title">Titre</label><input id="text-title" name="title" placeholder="Ma prochaine lecture" required maxlength="160" /><label for="text-content">Votre texte</label><textarea id="text-content" name="text" rows="8" placeholder="Collez le texte ici…" required></textarea><button class="primary" type="submit">${icon('plus')} Ajouter à la bibliothèque</button></form>`); break;
    case 'speed': modal('Trouvez votre rythme',`<p class="sheet-description">Le temps restant s’adapte à votre vitesse.</p><div class="choice-grid">${[0.75,1,1.25,1.5,1.75,2,2.5,3].map(n=>`<button class="choice ${settings.rate===n?'active':''}" data-action="set-speed" data-id="${n}">${n.toLocaleString('fr')}×</button>`).join('')}</div>`); break;
    case 'set-speed': settings.rate=Number(id); savePrefs(); await audio.rate(settings.rate); sheet.close(); render(); break;
    case 'sleep': modal('Encore quelques pages',`<p class="sheet-description">La lecture s’arrêtera automatiquement. Votre place sera conservée.</p><div class="choice-grid">${[0,5,15,30,45,60].map(n=>`<button class="choice" data-action="set-sleep" data-id="${n}">${n?`${n} min`:'Désactivé'}</button>`).join('')}</div>`); break;
    case 'set-sleep': await audio.sleep(Number(id)); sheet.close(); render(); toast(id==='0'?'Minuteur désactivé.':`Arrêt de la lecture dans ${id} minutes.`); break;
    case 'appearance': modal('Le confort des mots',`<p class="sheet-description">Une taille de texte adaptée à vos yeux.</p><div class="choice-grid">${[18,20,22,25,28,32].map(n=>`<button class="choice ${settings.fontSize===n?'active':''}" data-action="font" data-id="${n}" style="font-size:${n}px">Aa</button>`).join('')}</div><div class="choice-grid themes">${[['light','Clair'],['paper','Papier'],['dark','Nuit']].map(([id,label])=>`<button class="choice ${settings.theme===id?'active':''}" data-action="theme" data-id="${id}">${label}</button>`).join('')}</div>`); break;
    case 'font': settings.fontSize=Number(id); sheet.close(); render(); break;
    case 'theme': settings.theme=id as typeof settings.theme; sheet.close(); render(); break;
    case 'chapters': if(book) modal('Dans ce livre',`<div class="chapter-list">${book.chapters.map((c,i)=>`<button data-action="chapter" data-index="${c.start}" class="${chapterAt(book)===c?'active':''}"><span>${String(i+1).padStart(2,'0')}</span><strong>${esc(c.title)}</strong>${icon(chapterAt(book)===c?'audio-lines':'chevron-right')}</button>`).join('')}</div>${book.bookmarks.length?`<h3 class="bookmarks-heading">Vos signets</h3><div class="chapter-list">${book.bookmarks.map(i=>`<button data-action="chapter" data-index="${i}">${icon('bookmark')}<strong>${esc(book.segments[i]?.slice(0,90))}…</strong></button>`).join('')}</div>`:''}`); break;
    case 'chapter': await audio.seek(Number(el.dataset.index)); sheet.close(); render(); window.scrollTo(0,0); break;
    case 'chapter-next': if(book) { const next=chapterAt(book).end; if(next<book.segments.length){ await audio.seek(next); render(); window.scrollTo(0,0); }else{screen='library';render();} } break;
    case 'bookmark': if(book){const pos=Math.min(book.position,book.segments.length-1); book.bookmarks=book.bookmarks.includes(pos)?book.bookmarks.filter(i=>i!==pos):[...book.bookmarks,pos].sort((a,b)=>a-b);await library.save(book);render();toast(book.bookmarks.includes(pos)?'Passage ajouté aux signets.':'Signet retiré.');} break;
    case 'voice-tab': voiceTab=id; render(); break;
    case 'choose-voice': screen='voices'; render(); window.scrollTo(0,0); break;
    case 'select-voice': settings.voice=id; savePrefs(); if(active()) await audio.load(active()!,settings);render();toast('Voix sélectionnée pour vos prochaines lectures.');break;
    case 'preview': {
      const demo=welcomeBook(); demo.id='voice-preview'; demo.title='Aperçu de la voix'; demo.segments=['Fermez les yeux, ouvrez un livre. Je vous accompagne au fil des pages, à votre rythme.'];
      await audio.load(demo,{...settings,voice:id}); await audio.play(); toast('Aperçu de la voix en cours.'); break;
    }
    case 'install':
      if(!native){toast('Le téléchargement des modèles est disponible dans l’APK Android.');break;}
      await Reader.installModel({id}); downloading=true; toast('Téléchargement démarré. Gardez l’app ouverte.'); void pollModels(); break;
    case 'remove-model': if(native){await audio.pause();await Reader.removeModel({id});if(settings.voice===id){settings.voice='system:default';savePrefs();}models=(await Reader.models()).voices;render();toast('Voix supprimée de cet appareil.');}break;
    case 'voice-settings': if(native) await Reader.voiceSettings();else toast('Les réglages des voix Android sont accessibles dans l’APK.');break;
    case 'prepare': if(native && book){if(settings.voice.startsWith('system:')){toast('Choisissez une voix Piper ou clonée pour préparer un chapitre.');break;}modal('Emporter ce chapitre',`<p class="sheet-description">Les passages de « ${esc(chapterAt(book).title)} » seront générés et conservés sur le téléphone. Avec une voix clonée, votre Mac doit rester connecté pendant la préparation.</p><button class="primary" data-action="prepare-confirm">${icon('download')} Préparer le chapitre</button>`);}else toast('La préparation hors ligne est disponible dans l’APK Android.');break;
    case 'prepare-confirm': if(book){await Reader.command({action:'prepare',index:chapterAt(book).start,end:chapterAt(book).end});sheet.close();toast('Préparation du chapitre démarrée.');}break;
    case 'book-menu': {const b=books.find(b=>b.id===id);if(b)modal(esc(b.title.replace(/\n/g,' ')),`<button class="setting-row" data-action="open" data-id="${id}"><span>${icon('book-open')} Ouvrir le livre</span></button><button class="setting-row" data-action="clear-audio" data-id="${id}"><span>${icon('hard-drive')} Effacer les audios préparés</span></button><button class="setting-row danger" data-action="delete-confirm" data-id="${id}"><span>${icon('trash-2')} Retirer de la bibliothèque</span></button>`);break;}
    case 'clear-audio':if(native){await audio.pause();await Reader.clearAudio({bookId:id});toast('Audios de ce livre effacés.');}else toast('Aucun audio conservé dans cet aperçu web.');sheet.close();break;
    case 'delete-confirm':modal('Retirer ce livre ?',`<p class="sheet-description">Le livre, sa position et ses signets seront retirés de cette bibliothèque. Le fichier d’origine restera intact.</p><button class="primary danger-button" data-action="delete" data-id="${id}">Retirer le livre</button>`);break;
    case 'delete':if(audio.state.bookId===id)await audio.pause();await library.remove(id);books=books.filter(b=>b.id!==id);sheet.close();render();toast('Livre retiré de la bibliothèque.');break;
  }
}
async function pollModels() {
  if(!native)return;
  try {
    const result=await Reader.models();models=result.voices;
    const entries=Object.entries(result.downloads);
    downloading=entries.some(([,d])=>d.progress<100&&!d.error);
    const status=entries.map(([id,d])=>`${modelCatalog.find(m=>m.id===id)?.name ?? id} : ${d.error || `${Math.round(d.progress)} %`}`).join(' · ');
    const el=document.querySelector('#download-status');if(el)el.textContent=status;
    if(!downloading){render();if(status)toast(status);}
  }catch(e){toast(String(e));downloading=false;}
  if(downloading)setTimeout(()=>void pollModels(),1000);
}
document.addEventListener('click',e=>{const el=(e.target as Element).closest<HTMLElement>('[data-action]');if(el)void handle(el.dataset.action!,el).catch(error=>toast(error instanceof Error?error.message:String(error)));});
document.addEventListener('input',e=>{if((e.target as HTMLElement).id==='search'){const input=e.target as HTMLInputElement;const position=input.selectionStart;search=input.value;render();const next=document.querySelector<HTMLInputElement>('#search');next?.focus();try{next?.setSelectionRange(position,position);}catch{}}});
document.addEventListener('change',e=>{if((e.target as HTMLElement).id==='progress')void audio.seek(Number((e.target as HTMLInputElement).value)).catch(e=>toast(String(e)));});
fileInput.addEventListener('change',()=>void importFiles(Array.from(fileInput.files ?? [])));
sheet.addEventListener('click',e=>{if(e.target===sheet){const r=sheet.getBoundingClientRect();if(e.clientY<r.top||e.clientX<r.left||e.clientX>r.right)sheet.close();}});
document.addEventListener('submit',e=>{
  const form=e.target as HTMLFormElement;e.preventDefault();
  if(form.id==='paste-form'){const data=new FormData(form);void importFiles([new File([String(data.get('text'))],`${data.get('title')}.txt`,{type:'text/plain'})]);}
  if(form.id==='studio-form'){
    const data=new FormData(form);settings.server=String(data.get('server')).replace(/\/+$/,'');settings.token=String(data.get('token')).trim();
    if(!native){toast('La connexion au studio se fait dans l’APK Android.');return;}
    const button=form.querySelector<HTMLButtonElement>('button')!;button.disabled=true;button.textContent='Connexion…';
    void Reader.connect({server:settings.server,token:settings.token}).then(r=>{clones=r.voices;savePrefs();voiceTab='clone';screen='voices';render();toast(`${clones.length} voix retrouvée${clones.length>1?'s':''}.`);}).catch(error=>{button.disabled=false;button.textContent='Connecter le studio';toast(error.message ?? String(error));});
  }
});
window.addEventListener('hashchange',()=>{if(location.hash==='#library'){screen='library';render();}});
async function init() {
  try {
    books=await library.all();
    if(!books.length&&!localStorage.getItem('pk-reader-welcomed')){const book=welcomeBook();await library.save(book);books=[book];localStorage.setItem('pk-reader-welcomed','1');}
    voices=await audio.voices();
    if(native){models=(await Reader.models()).voices;if(settings.server&&settings.token)void Reader.connect({server:settings.server,token:settings.token}).then(r=>{clones=r.voices;if(screen==='voices')render();}).catch(()=>{});}
    render();await audio.init();
    if(!native&&'speechSynthesis'in window)speechSynthesis.addEventListener('voiceschanged',()=>{void audio.voices().then(v=>{voices=v;if(screen==='voices')render();});});
  }catch(error){app.innerHTML='<main class="fatal"><h1>La bibliothèque ne peut pas s’ouvrir.</h1><p>Fermez puis relancez l’application. Vérifiez que le stockage de l’app est autorisé.</p></main>';toast(error instanceof Error?error.message:String(error));}
}
void init();
