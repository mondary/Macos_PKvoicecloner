// QA locale : vraie application web, données fictives, états natifs simulés via
// les composants de production. Aucun compte ni appel IA. Serveur Vite requis.
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
const base = process.env.PK_QA_URL ?? 'http://127.0.0.1:5201/';
const out = process.env.PK_QA_OUT ?? join(tmpdir(), 'pk-reader-qa-shots');
await mkdir(out, { recursive: true });
const profile = await mkdtemp(join(tmpdir(), 'pk-reader-qa-'));
const chrome = spawn(process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--hide-scrollbars', '--no-first-run', 'about:blank'],
  { stdio: ['ignore', 'ignore', 'pipe'] });
let socket;
try {
  const endpoint = await new Promise((resolve, reject) => {
    let log = '';
    const timeout = setTimeout(() => reject(new Error('Chrome ne démarre pas')), 15000);
    chrome.stderr.on('data', chunk => {
      log += chunk;
      const ws = log.match(/DevTools listening on (ws:\/\/\S+)/)?.[1];
      if (ws) { clearTimeout(timeout); resolve(ws); }
    });
    chrome.once('error', reject);
  });
  const address = new URL(endpoint);
  const tab = await (await fetch(`http://${address.host}/json/new?${encodeURIComponent(base)}`, { method: 'PUT' })).json();
  socket = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise(resolve => { socket.onopen = resolve; });
  let id = 0; const pending = new Map(), errors = [];
  socket.onmessage = event => {
    const msg = JSON.parse(event.data);
    if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails);
    if (pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id); pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message)); else resolve(msg.result);
    }
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    pending.set(++id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  const wait = async expression => {
    for (let i = 0; i < 80; i++) { if (await evaluate(expression)) return; await delay(100); }
    throw new Error(`État introuvable : ${expression}`);
  };
  const click = async selector => {
    await wait(`!!document.querySelector(${JSON.stringify(selector)})`);
    await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  };
  const viewport = (width, height = 844) => send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 2, mobile: false });
  const shot = async name => {
    await wait(`!document.querySelector('#toast')?.classList.contains('visible')`);
    await delay(250);
    const overflow = await evaluate('document.documentElement.scrollWidth > innerWidth');
    if (overflow) {
      const offenders = await evaluate(`Array.from(document.querySelectorAll('body *')).filter(el => el.getBoundingClientRect().right > innerWidth + 1).slice(0,8).map(el=>[el.className,el.getBoundingClientRect().right])`);
      throw new Error(`Débordement horizontal : ${name} ${JSON.stringify(offenders)}`);
    }
    const result = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    await writeFile(join(out, `${name}.png`), Buffer.from(result.data, 'base64'));
  };
  await send('Runtime.enable'); await send('Page.enable'); await viewport(390);
  await wait('!!document.querySelector(".book-open")');
  await evaluate(`(async () => {
    const { library } = await import('/storage.ts');
    const sentences = ['Camille longeait le fleuve, attentive au murmure des arbres.',
      'Plus loin, les maisons apparaissaient entre les branches.',
      'Elle reconnut le chemin de son enfance et ralentit le pas.',
      'Au village, les fenêtres s’éclairaient une à une.',
      'Un air de piano venait de la place, porté par le vent du soir.',
      'Elle sourit : le voyage lui semblait déjà moins long.'];
    const segments = Array.from({length: 90}, (_, i) => sentences[i % sentences.length]);
    await library.save({id:'demo-controls',title:'Le voyage de Camille',author:'Camille Roy',format:'EPUB',language:'fr',color:2,
      segments, paragraphs: segments.map((_, i) => Math.floor(i / 3)),
      chapters:[{title:'Inconnu',start:0,end:30},{title:'Inconnu',start:30,end:60},{title:'Le retour',start:60,end:90}],
      position:0,completed:false,added:Date.now(),opened:Date.now(),bookmarks:[],
      casting:{enabled:true,characters:[{id:'narrator',name:'Narrateur',voice:'system:default',pitch:1,rate:1,automaticVoice:true},
      {id:'camille',name:'Camille',voice:'system:default',pitch:1,rate:1,gender:'femme',automaticVoice:true},
      {id:'pierre',name:'Pierre',voice:'system:default',pitch:1,rate:1,gender:'homme',automaticVoice:true}],
      assignments:{'1':'camille','31':'camille','61':'pierre'},analysis:{state:'local',completed:[],localRevision:2}}});
    const cover = (title, bg, width, height) => {
      const canvas = document.createElement('canvas'); canvas.width=width; canvas.height=height;
      const ctx=canvas.getContext('2d'); ctx.fillStyle=bg; ctx.fillRect(0,0,width,height);
      ctx.fillStyle='#f5f7fc'; ctx.font='32px Georgia'; ctx.fillText(title,24,90,width-48);
      ctx.font='14px sans-serif';ctx.fillText('COLLECTION DES RIVAGES',24,height-36,width-48);
      return canvas.toDataURL('image/webp');
    };
    const demo = (await library.all()).find(book=>book.id==='demo-controls');
    demo.cover=cover('Le voyage de Camille','#314686',320,480); await library.save(demo);
    await library.save({...demo,id:'demo-crossing',title:'La traversée',author:'Élise Marin',opened:0,position:0,cover:cover('La traversée','#397366',320,460)});
    await library.save({...demo,id:'demo-hours',title:'Les heures claires',author:'Noé Rivière',opened:0,position:0,cover:cover('Les heures claires','#a95b44',320,500)});
  })()`);
  await send('Page.reload');
  await wait('document.querySelectorAll(".book-item").length >= 4');
  await shot('library-redesign');
  await evaluate(`document.documentElement.dataset.theme='dark'`); await shot('library-redesign-dark');
  await evaluate(`document.documentElement.dataset.theme='light'`);
  await viewport(1280,900); await shot('library-redesign-desktop'); await viewport(390);
  // Nombre de colonnes : le choix 3 s'applique à la grille mobile.
  await click('[data-action="library-columns"][data-id="3"]');
  await wait(`getComputedStyle(document.querySelector('.library-section .books-grid')).gridTemplateColumns.split(' ').length === 3`);
  if (await evaluate('document.querySelector(".library-columns button.active")?.dataset.id') !== '3') throw new Error('Colonnes : 3 attendues');
  await shot('library-3-columns');
  await click('[data-action="library-columns"][data-id="2"]');
  await wait(`getComputedStyle(document.querySelector('.library-section .books-grid')).gridTemplateColumns.split(' ').length === 2`);
  // Tri alphabétique puis retour au dernier ajout.
  await evaluate(`(() => {const select=document.querySelector('#library-sort');select.value='alpha';select.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await wait('document.querySelector(".books-grid .book-open strong")?.textContent === "La traversée"');
  await evaluate(`(() => {const select=document.querySelector('#library-sort');select.value='recent';select.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await wait('document.querySelector(".books-grid .book-open strong")?.textContent === "Le voyage de Camille"');
  await evaluate(`(() => {const search=document.querySelector('#search');search.value='traversée';search.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await wait('document.querySelectorAll(".book-item").length === 1');
  await evaluate(`(() => {const search=document.querySelector('#search');search.value='';search.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await click('.book-open[data-id="demo-controls"]');
  await wait('!!document.querySelector(".player") && document.querySelector("#page-footer")?.textContent.includes("/")');
  // Recherche dans le livre : le résultat mène à la phrase.
  await click('[data-action="book-search"]');
  await wait('!!document.querySelector("#book-search-input")');
  await evaluate(`(() => { const input=document.querySelector('#book-search-input'); input.value='Camille'; input.dispatchEvent(new Event('input',{bubbles:true})); })()`);
  await wait('document.querySelectorAll(".book-search-hit").length > 0');
  await shot('book-search');
  await click('.book-search-hit');
  await wait('!document.querySelector("dialog[open]")');
  await evaluate(`document.querySelector('.sentence[data-index="1"]').focus()`);
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
  await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
  await wait(`document.querySelector('#progress').value === '1'`);
  await click('.reader-nav-mini [data-action="previous"]');
  if (!await evaluate('document.querySelector("#page-heading").textContent === "Chapitre 1"')) throw new Error('Titre inconnu non réparé');
  // Barre compacte : le texte garde la majorité de l'écran, les options restent visibles.
  if (await evaluate('!!document.querySelector(".player.reduit")')) throw new Error('Ancien lecteur réduit encore présent');
  const hauteurLecteur = await evaluate('parseInt(getComputedStyle(document.documentElement).getPropertyValue("--player-h"))');
  if (hauteurLecteur > 240) throw new Error(`Barre de lecture trop haute : ${hauteurLecteur}px`);
  if (await evaluate('document.querySelectorAll(".player-option").length') !== 5) throw new Error('Options de lecture incomplètes');
  if (!await evaluate('!!document.querySelector(".player-voice") && !!document.querySelector("#page-footer") && !!document.querySelector(".player-chapter")')) throw new Error('Pied de lecteur incomplet');
  const miniBoutons = await evaluate('document.querySelectorAll(".reader-nav-mini button").length');
  if (miniBoutons !== 7) throw new Error(`Transport incomplet : ${miniBoutons} boutons`);
  const premierePage = await evaluate('document.querySelector("#page-footer").textContent');
  await click('.reader-nav-mini [data-action="page-next"]');
  await wait(`document.querySelector('#page-footer').textContent !== ${JSON.stringify(premierePage)}`);
  await click('.reader-nav-mini [data-action="page-prev"]');
  await wait(`document.querySelector('#page-footer').textContent === ${JSON.stringify(premierePage)}`);
  await click('.reader-nav-mini [data-action="next"]');
  await wait('document.querySelector("#progress").value === "1"');
  await click('.reader-nav-mini [data-action="previous"]');
  await wait('document.querySelector("#progress").value === "0"');
  await click('.reader-nav-mini [data-action="chapter-step"][data-id="1"]');
  await wait('document.querySelector(".player-chapter").textContent.includes("Chapitre 2")');
  await click('.reader-nav-mini [data-action="chapter-step"][data-id="-1"]');
  await wait('document.querySelector(".player-chapter").textContent.includes("Chapitre 1")');
  // Plein écran de lecture : l'en-tête s'efface, la barre reste accessible.
  await click('.player-option[data-action="immersive"]');
  await wait('getComputedStyle(document.querySelector(".reader-header")).display === "none"');
  if (!await evaluate('document.querySelector("#app").classList.contains("reader-immersive")')) throw new Error('Mode immersif non appliqué');
  await click('.player-option[data-action="immersive"]');
  await wait('getComputedStyle(document.querySelector(".reader-header")).display !== "none"');
  // Bascule défilement continu ↔ pages, sans quitter le lecteur.
  await click('.player-option[data-action="layout"]');
  await wait('document.querySelector("#app").className.includes("layout-scroll") && !document.querySelector("#page-text")');
  await shot('reader-scroll');
  if (!await evaluate(`document.querySelector('.book-paragraph').querySelectorAll('.sentence').length === 3`)) throw new Error('Paragraphes non regroupés');
  await click('.player-option[data-action="layout"]');
  await wait('document.querySelector("#app").className.includes("layout-pages") && !!document.querySelector("#page-text")');
  await evaluate(`(async () => {
    const {analysisChip} = await import('/activity-view.ts');
    document.querySelector('#reader-analysis').innerHTML = analysisChip([{id:'demo-controls',title:'Le voyage de Camille',state:'running',source:'IA de démonstration',debut:Date.now(),progress:{done:28,total:141,chapter:'Chapitre 2'}}],'demo-controls', true);
  })()`);
  await shot('reader-controls');
  await evaluate(`document.documentElement.dataset.theme='dark'`); await shot('reader-controls-dark');
  await evaluate(`document.documentElement.dataset.theme='light'`);
  await viewport(320, 740); await delay(500); await shot('reader-controls-small');
  await viewport(1280, 900); await delay(500); await shot('reader-controls-desktop');
  await viewport(390);
  await click('[data-action="toggle"]');
  await wait('!!document.querySelector(".chapter-review")');
  const ecoutes = await evaluate('document.querySelectorAll(\'[data-action="chapter-voice-preview"]\').length');
  if (ecoutes !== 2) throw new Error(`Boutons d’écoute attendus : 2, trouvés : ${ecoutes}`);
  await shot('chapter-voice-review');
  // Écoute d’essai avec la voix sélectionnée, avant validation.
  await evaluate('speechSynthesis.speak = () => {};');
  await click('[data-action="chapter-voice-preview"]');
  await delay(300);
  if (!await evaluate('document.querySelector("#toast")?.textContent.includes("Aperçu")')) throw new Error('Aperçu de voix non signalé');
  // Voix système pour éviter tout téléchargement natif ; synthèse neutralisée
  // dans ce profil de test, le contrôle de lecture reste celui de production.
  await evaluate(`document.querySelectorAll('[data-role-id]').forEach(select => { select.value = 'system:default'; }); speechSynthesis.speak = () => {};`);
  await click('[data-action="chapter-voices-confirm"]');
  await wait('!document.querySelector("dialog[open]")');
  // Suivi réel du lecteur après bascule, synthèse seule neutralisée. Le test
  // passe par les boutons, sans instance parallèle du module audio via HMR.
  await click('.player-option[data-action="layout"]');
  await wait(`document.querySelector('#app').classList.contains('layout-scroll')`);
  await click('.sentence[data-index="12"]');
  await delay(1000);
  if (await evaluate(`!document.querySelector('#now-bar').hidden`)) throw new Error('Suivi perdu après bascule vers le défilement');
  await evaluate(`window.dispatchEvent(new WheelEvent('wheel',{deltaY:120}));window.scrollTo(0,document.documentElement.scrollHeight);`);
  await wait(`!document.querySelector('#now-bar').hidden`);
  await shot('reader-return');
  await click('#now-bar');
  await wait(`document.querySelector('#now-bar').hidden`);
  await click('.sentence[data-index="0"]');
  await click('.player-option[data-action="layout"]');
  await wait(`document.querySelector('#app').classList.contains('layout-pages')`);
  await click('[data-action="chapter-step"][data-id="1"]');
  await wait('document.querySelector(".player-chapter").textContent.includes("Chapitre 2")');
  if (await evaluate('!!document.querySelector("dialog[open]")')) throw new Error('Les voix connues sont redemandées');
  await click('[data-action="chapter-step"][data-id="1"]');
  await wait('!!document.querySelector("dialog[open] .chapter-review")');
  if (!await evaluate('document.querySelector(".chapter-review").textContent.includes("Pierre")')) throw new Error('Nouveau personnage non proposé');
  await click('dialog [data-action="close"]');
  await click('[data-action="book-settings"][data-id="demo-controls"]');
  await click('[data-action="edit-book"]');
  await wait('!!document.querySelector("#edit-book-form")');
  await evaluate(`(() => { const year=document.querySelector('#edit-year'); year.value='2019'; document.querySelector('#edit-book-form').requestSubmit(); })()`);
  await wait('!document.querySelector("dialog[open]")');
  await wait('document.querySelector(".book-page-head > div > p:not(.eyebrow)")?.textContent.includes("2019")');
  await click('[data-action="appearance"]');
  await wait('!!document.querySelector("dialog[open]")');
  await click('dialog [data-action="close"]');
  await click('[data-action="back"]');
  await click('[data-action="nav"][data-id="settings"]');
  if (await evaluate('document.querySelectorAll(".nav-item").length') !== 2) throw new Error('Navigation principale : deux entrées attendues');
  await click('[data-action="settings-tab"][data-id="voix"]');
  await click('[data-action="nav"][data-id="voices"]');
  await wait('document.querySelectorAll(".voice-row").length > 0');
  if (!await evaluate('document.querySelector(".voice-tabs .active")?.textContent.includes("Voix de l’app")')) throw new Error('Onglet Voix de l’app attendu');
  // Filtre des voix.
  await evaluate(`(() => { const input=document.querySelector('#voice-search'); input.value='siwis'; input.dispatchEvent(new Event('input',{bubbles:true})); })()`);
  await wait('document.querySelector("#voice-search")?.value === "siwis" && document.querySelectorAll(".voice-row").length > 0');
  if (!await evaluate('[...document.querySelectorAll(".voice-row strong")].every(el => el.textContent.toLowerCase().includes("siwis"))')) throw new Error('Filtre des voix incorrect');
  await evaluate(`(() => { const input=document.querySelector('#voice-search'); input.value=''; input.dispatchEvent(new Event('input',{bubbles:true})); })()`);
  await wait('document.querySelectorAll(".voice-row").length > 5');
  if (!await evaluate('document.querySelector(".voice-summary")?.textContent.includes("installée")')) throw new Error('Résumé des voix installées absent');
  const hauteurVoix = await evaluate('document.querySelector(".voice-row").getBoundingClientRect().height');
  if (hauteurVoix > 64) throw new Error(`Ligne de voix trop haute : ${hauteurVoix}px`);
  // Capture propre : les pastilles flottantes et le mini-lecteur ne font pas
  // partie de la liste de voix et masqueraient les dernières lignes.
  await evaluate(`document.querySelectorAll("#notification-center > *, .mini-player").forEach(el => el.remove())`);
  await shot('voices');
  await click('[data-action="back-settings"]');
  await wait('!!document.querySelector(".settings-tabs")');
  await click('[data-action="settings-tab"][data-id="apropos"]');
  await evaluate('document.querySelector(".about").scrollIntoView({block:"center"})');
  await delay(150);
  const support = await evaluate('({href:document.querySelector(".support-kofi").href,text:document.querySelector(".support-kofi").textContent})');
  if (support.href !== 'https://ko-fi.com/pouark' || !support.text.includes('Soutenir sur Ko-fi')) throw new Error('Bouton Ko-fi incorrect');
  await shot('about-support-download');
  if (errors.length) throw new Error(JSON.stringify(errors));
  console.log('QA OK : chapitre/page/phrase, colonnes et tri de la bibliothèque, accès réglages, Ko-fi, mobile 320/390 + bureau. Captures :', out);
} finally {
  socket?.close();
  const exited = new Promise(resolve => chrome.once('exit', resolve));
  chrome.kill(); await exited;
  await rm(profile, { recursive: true, force: true });
}
