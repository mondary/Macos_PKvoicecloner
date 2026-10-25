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
    await delay(250);
    const overflow = await evaluate('document.documentElement.scrollWidth > innerWidth');
    if (overflow) throw new Error(`Débordement horizontal : ${name}`);
    const result = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    await writeFile(join(out, `${name}.png`), Buffer.from(result.data, 'base64'));
  };
  await send('Runtime.enable'); await send('Page.enable'); await viewport(390);
  await wait('!!document.querySelector(".book-open")');
  await evaluate(`(async () => {
    const { library } = await import('/storage.ts');
    const segments = Array.from({length: 90}, (_, i) => 'Camille avançait le long du fleuve. Les fenêtres s’éclairaient une à une et le vent portait les voix du village. ' + (i + 1));
    await library.save({id:'demo-controls',title:'Le voyage de Camille',author:'Camille Roy',format:'EPUB',language:'fr',color:2,
      segments, paragraphs: segments.map((_, i) => Math.floor(i / 3)),
      chapters:[{title:'Inconnu',start:0,end:30},{title:'Inconnu',start:30,end:60},{title:'Le retour',start:60,end:90}],
      position:0,completed:false,added:Date.now(),opened:Date.now(),bookmarks:[],
      casting:{enabled:true,characters:[{id:'narrator',name:'Narrateur',voice:'system:default',pitch:1,rate:1,automaticVoice:true},
      {id:'camille',name:'Camille',voice:'system:default',pitch:1,rate:1,gender:'femme',automaticVoice:true},
      {id:'pierre',name:'Pierre',voice:'system:default',pitch:1,rate:1,gender:'homme',automaticVoice:true}],
      assignments:{'1':'camille','31':'camille','61':'pierre'},analysis:{state:'local',completed:[],localRevision:2}}});
  })()`);
  await send('Page.reload');
  await click('.book-open[data-id="demo-controls"]');
  await wait('!!document.querySelector(".reader-navigation") && document.querySelector("#page-footer")?.textContent.includes("/")');
  if (!await evaluate('document.querySelector("#page-heading").textContent === "Chapitre 1"')) throw new Error('Titre inconnu non réparé');
  const first = await evaluate('document.querySelector("#page-footer").textContent');
  await click('.reader-navigation [data-action="page-next"]');
  await wait(`document.querySelector('#page-footer').textContent !== ${JSON.stringify(first)}`);
  await click('[data-action="next"]');
  await wait('document.querySelector("#progress").value === "1"');
  await click('[data-action="previous"]');
  await wait('document.querySelector("#progress").value === "0"');
  await click('[data-action="chapter-step"][data-id="1"]');
  await wait('document.querySelector(".reader-nav-location").textContent === "Chapitre 2"');
  await click('[data-action="chapter-step"][data-id="-1"]');
  await wait('document.querySelector(".reader-nav-location").textContent === "Chapitre 1"');
  await evaluate(`(async () => {
    const {analysisChip, downloadActivityView} = await import('/activity-view.ts');
    window.qaDownloads = downloadActivityView([{id:'neural:miro', name:'Miro', progress:64, state:'running'}]);
    document.querySelector('#reader-analysis').innerHTML = analysisChip([{id:'demo-controls',title:'Le voyage de Camille',state:'running',source:'IA de démonstration',debut:Date.now(),progress:{done:28,total:141,chapter:'Chapitre 2'}}],'demo-controls');
    document.querySelector('#analysis-activities').innerHTML = window.qaDownloads;
  })()`);
  await shot('reader-controls');
  await viewport(320, 740); await delay(500); await shot('reader-controls-small');
  await viewport(1280, 900); await delay(500); await shot('reader-controls-desktop');
  await viewport(390);
  await click('[data-action="toggle"]');
  await wait('!!document.querySelector(".chapter-review")');
  await shot('chapter-voice-review');
  // Voix système pour éviter tout téléchargement natif ; synthèse neutralisée
  // dans ce profil de test, le contrôle de lecture reste celui de production.
  await evaluate(`document.querySelectorAll('[data-role-id]').forEach(select => { select.value = 'system:default'; }); speechSynthesis.speak = () => {};`);
  await click('[data-action="chapter-voices-confirm"]');
  await wait('!document.querySelector("dialog[open]")');
  await click('[data-action="chapter-step"][data-id="1"]');
  await wait('document.querySelector(".reader-nav-location").textContent === "Chapitre 2"');
  if (await evaluate('!!document.querySelector("dialog[open]")')) throw new Error('Les voix connues sont redemandées');
  await click('[data-action="chapter-step"][data-id="1"]');
  await wait('!!document.querySelector("dialog[open] .chapter-review")');
  if (!await evaluate('document.querySelector(".chapter-review").textContent.includes("Pierre")')) throw new Error('Nouveau personnage non proposé');
  await click('dialog [data-action="close"]');
  await click('[data-action="book-settings"][data-id="demo-controls"]');
  await click('[data-action="appearance"]');
  await wait('!!document.querySelector("dialog[open]")');
  await click('dialog [data-action="close"]');
  await click('[data-action="back"]');
  await click('[data-action="nav"][data-id="settings"]');
  await click('[data-action="settings-tab"][data-id="apropos"]');
  await evaluate(`document.querySelector('#analysis-activities').innerHTML = window.qaDownloads`);
  const y = await evaluate('document.querySelector(".download-bubble").getBoundingClientRect().bottom');
  await evaluate('document.querySelector(".about").scrollIntoView({block:"center"})');
  await delay(150);
  const after = await evaluate('document.querySelector(".download-bubble").getBoundingClientRect().bottom');
  if (Math.abs(after - y) > 1) throw new Error('Le téléchargement défile avec la page');
  const support = await evaluate('({href:document.querySelector(".support-kofi").href,text:document.querySelector(".support-kofi").textContent})');
  if (support.href !== 'https://ko-fi.com/pouark' || !support.text.includes('Soutenir sur Ko-fi')) throw new Error('Bouton Ko-fi incorrect');
  await shot('about-support-download');
  await evaluate(`(async () => { const {downloadActivityView} = await import('/activity-view.ts'); document.querySelector('#analysis-activities').innerHTML = downloadActivityView([{id:'neural:miro',name:'Miro',state:'done',progress:100}]); })()`);
  await shot('download-complete');
  if (errors.length) throw new Error(JSON.stringify(errors));
  console.log('QA OK : chapitre/page/phrase, titres, accès réglages, téléchargement fixe après scroll, Ko-fi, mobile 320/390 + bureau. Captures :', out);
} finally {
  socket?.close();
  const exited = new Promise(resolve => chrome.once('exit', resolve));
  chrome.kill(); await exited;
  await rm(profile, { recursive: true, force: true });
}
