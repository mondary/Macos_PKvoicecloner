/* PK Voice Studio v2 — bibliothèque de voix + éditeur texte → voix.
 * Tout tourne contre le serveur local FastAPI (voir src/server/serveur.py).
 */
(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);

  const ICON_PLAY = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 3.1v9.8c0 .7.8 1.1 1.4.7l6.2-4.9c.5-.4.5-1.1 0-1.5L6.4 2.4C5.8 2 5 2.4 5 3.1Z"/></svg>';
  const ICON_PAUSE = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 3.2h2.4v9.6H4.5zM9.1 3.2h2.4v9.6H9.1z"/></svg>';
  const ICON_TRASH = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M2.5 4h11M6.5 4V2.8h3V4M4 4l.7 9h6.6L12 4M6.6 6.6v4M9.4 6.6v4"/></svg>';
  const ICON_MIC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>';
  const ICON_DOWNLOAD = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" aria-hidden="true"><path d="M12 3v12m0-12 4 4m-4-4-4 4M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/></svg>';
  const ICON_ARROW = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" aria-hidden="true"><path d="M5 12h14m0 0-6-6m6 6-6 6"/></svg>';
  const ICON_SPARK = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m8 1 .9 2.2L11 4l-2.1.8L8 7l-.9-2.2L5 4l2.1-.8L8 1Zm5 7 .6 1.4L15 10l-1.4.6L13 12l-.6-1.4L11 10l1.4-.6L13 8ZM3 9l.6 1.4L5 11l-1.4.6L3 13l-.6-1.4L1 11l1.4-.6L3 9Z"/></svg>';

  let speed = 1;
  let generating = false;
  let voiceReady = false;
  let shuttingDown = false;
  let voices = [];
  let selectedId = null;

  let recorder = null;
  let recordingStream = null;
  let recordingSeconds = 0;
  let recordingClock = null;
  let micAnalyser = null;
  let micRaf = null;
  let renaming = false;

  const previewAudio = new Audio();
  let previewId = null;
  let systemTimer = null;
  let toastTimer = null;

  const PANNEAU_AIDE = "Choisis un clone à gauche, écris à droite, génère la prise";

  /* ---------------------- Navigation par sections ---------------------- */
  const VUES = {
    studio: "Vue d’ensemble",
    voices: "Bibliothèque de voix",
    editor: "Texte vers voix",
    books: "Livres",
    models: "Modèles",
    settings: "Réglages",
  };
  let vueActive = "studio";

  function appliquerVue(id, { pousserAncre = true } = {}) {
    if (!VUES[id]) id = "studio";
    vueActive = id;
    document.body.classList.toggle("book-focus", id === "books" && Boolean(pageLivre));
    const accueil = id === "studio";
    const panneau = document.querySelector(".demo-panel");
    document.querySelector(".hero").hidden = !accueil;
    document.querySelector(".dashboard-stats").hidden = !accueil;
    $("overviewActivity").hidden = !accueil;
    panneau.hidden = !(id === "voices" || id === "editor");
    const stage = document.querySelector(".demo-stage");
    stage.classList.toggle("only-voices", id === "voices");
    stage.classList.toggle("only-editor", id === "editor");
    $("takes").hidden = id !== "editor";
    $("books").hidden = id !== "books";
    $("models").hidden = id !== "models";
    $("settings").hidden = id !== "settings";
    document.querySelectorAll(".dashboard-nav a").forEach((lien) => {
      const actif = lien.dataset.vue === id;
      lien.classList.toggle("active", actif);
      if (actif) lien.setAttribute("aria-current", "page");
      else lien.removeAttribute("aria-current");
    });
    document.querySelector(".breadcrumbs strong").textContent = VUES[id];
    document.title = `PK Voice Studio — ${VUES[id]}`;
    if (pousserAncre) {
      history.replaceState(null, "", `#${id}`);
      window.scrollTo(0, 0);
    }
  }

  function bindNavEvents() {
    document.querySelectorAll("[data-vue]").forEach((lien) => {
      lien.addEventListener("click", (event) => {
        event.preventDefault();
        appliquerVue(lien.dataset.vue);
      });
    });
    // naviguer d'une ancre à l'autre ne recharge pas la page : suivre quand même
    window.addEventListener("hashchange", () => appliquerVue(location.hash.slice(1)));
  }

  /* ---------------------- Prises générées & tableau de bord ---------------------- */
  let audios = [];
  let takePlaying = null;

  async function refreshAudios() {
    try {
      const response = await fetch("/api/audios");
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.detail || "prise indisponible");
      audios = payload.audios || [];
    } catch (_) {
      return;
    }
    renderTakes();
    renderOverview();
  }

  function dureeTexte(secondes) {
    const s = Math.round(secondes || 0);
    if (s < 60) return `${s} s`;
    return `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, "0")}`;
  }

  function makeTakeRow(take) {
    const row = document.createElement("div");
    row.className = "take-row";
    const info = document.createElement("div");
    info.className = "take-info";
    const nom = document.createElement("div");
    nom.className = "take-name";
    nom.textContent = take.nom;
    const extrait = document.createElement("div");
    extrait.className = "take-excerpt";
    extrait.textContent = take.transcript ? take.transcript.slice(0, 110) : "Transcript non disponible";
    info.append(nom, extrait);
    const duree = document.createElement("span");
    duree.className = "take-duration";
    duree.textContent = dureeTexte(take.duree);
    const play = document.createElement("button");
    play.className = "icon-btn";
    play.type = "button";
    play.setAttribute("aria-label", `Écouter ${take.nom}`);
    play.innerHTML = ICON_PLAY;
    play.addEventListener("click", (event) => {
      event.stopPropagation();
      toggleTake(take.nom, play);
    });
    const download = document.createElement("a");
    download.className = "icon-btn";
    download.href = `/api/audio/${encodeURIComponent(take.nom)}`;
    download.download = take.nom;
    download.setAttribute("aria-label", `Télécharger ${take.nom}`);
    download.innerHTML = ICON_DOWNLOAD;
    row.append(info, duree, play, download);
    return row;
  }

  function toggleTake(nom, bouton) {
    if (takePlaying === nom && !previewAudio.paused) {
      previewAudio.pause();
      return;
    }
    if (!previewAudio.paused) previewAudio.pause();
    takePlaying = nom;
    previewAudio.src = `/api/audio/${encodeURIComponent(nom)}`;
    previewAudio.play().catch(() => notify("Lecture impossible", "error"));
  }

  function paintTakeButtons() {
    document.querySelectorAll(".take-row").forEach((row) => {
      const bouton = row.querySelector(".icon-btn");
      if (!bouton) return;
      const nom = row.querySelector(".take-name")?.textContent;
      bouton.innerHTML = nom === takePlaying && !previewAudio.paused ? ICON_PAUSE : ICON_PLAY;
    });
  }

  function renderTakes() {
    const list = $("prisesList");
    list.textContent = "";
    if (!audios.length) {
      const vide = document.createElement("div");
      vide.className = "take-empty";
      vide.textContent = "Aucune prise pour le moment — écris un texte à droite et clique Générer.";
      list.appendChild(vide);
      return;
    }
    audios.forEach((take) => list.appendChild(makeTakeRow(take)));
  }

  function renderOverview() {
    // tuiles
    $("statVoix").textContent = voices.length || "—";
    $("statModeles").textContent = modelesInstalles() || "—";
    $("statLivres").textContent = books.length || "—";
    $("statPrises").textContent = audios.length || "—";

    // derniers livres
    const zoneLivres = $("overviewBooks");
    zoneLivres.textContent = "";
    if (!books.length) {
      const vide = document.createElement("div");
      vide.className = "take-empty";
      vide.textContent = "Aucun livre — importe un EPUB depuis la section Livres.";
      zoneLivres.appendChild(vide);
    } else {
      books.slice(0, 3).forEach((book) => {
        const row = document.createElement("div");
        row.className = "take-row";
        const info = document.createElement("div");
        info.className = "take-info";
        const nom = document.createElement("div");
        nom.className = "take-name";
        nom.textContent = book.titre;
        const detail = document.createElement("div");
        detail.className = "take-excerpt";
        const analysees = book.chapitres.filter((c) => c.analyse === "faite").length;
        detail.textContent = `${book.chapitres.length} chapitres · ${book.mots.toLocaleString("fr-FR")} mots` +
                             (book.cast?.length ? ` · ${book.cast.length} voix${analysees ? ` · ${analysees} chap. analysés` : ""}` : "");
        info.append(nom, detail);
        const ouvrir = document.createElement("button");
        ouvrir.className = "icon-btn";
        ouvrir.setAttribute("aria-label", `Ouvrir ${book.titre}`);
        ouvrir.innerHTML = ICON_ARROW;
        ouvrir.addEventListener("click", () => ouvrirPageLivre(book.id));
        row.append(info, ouvrir);
        zoneLivres.appendChild(row);
      });
    }

    // dernières prises
    const zonePrises = $("overviewTakes");
    zonePrises.textContent = "";
    if (!audios.length) {
      const vide = document.createElement("div");
      vide.className = "take-empty";
      vide.textContent = "Aucune prise générée pour le moment.";
      zonePrises.appendChild(vide);
    } else {
      audios.slice(0, 3).forEach((take) => zonePrises.appendChild(makeTakeRow(take)));
    }
  }

  let modelesCatalogue = [];

  function modelesInstalles() {
    return modelesCatalogue.filter((m) => m.installe).length || null;
  }

  /* ---------------------- Toast & états ---------------------- */
  function notify(message, tone = "") {
    const toast = $("toast");
    toast.textContent = message;
    toast.className = `toast show ${tone}`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.className = "toast"; }, 2600);
  }

  function setPresence(element, state) {
    element.className = `chip presence ${state}`;
  }

  function setVoiceStatus(message, tone = "") {
    $("etatVoix").textContent = message;
    $("etatVoix").className = `voice-status ${tone}`;
  }

  function setTakeStatus(message, tone = "") {
    $("etatGen").textContent = message;
    $("etatGen").className = `take-status ${tone}`;
  }

  function setPanelStatus(message, busy = false) {
    $("demoSub").textContent = message;
    $("demoSub").classList.toggle("busy", busy);
  }

  function setGenerating(state) {
    generating = state;
    $("generer").classList.toggle("busy", state);
    if (state) {
      $("genererLabel").textContent = "Rendu… 0 s";
      setPanelStatus("Rendu lancé…", true);
    } else {
      $("genererLabel").textContent = "Générer";
      setPanelStatus(PANNEAU_AIDE);
    }
    updateGenerateState();
  }

  /* ---------------------- Vitesse & estimation ---------------------- */
  function updatePace() {
    speed = Number($("vitesse").value);
    $("vitesse").style.setProperty("--pace-fill", `${((speed - 0.75) / 0.75) * 100}%`);
    $("vitesseVal").textContent = `${speed.toFixed(2)}×`;
    updateEstimate();
  }

  function updateEstimate() {
    const text = $("texte").value.trim();
    $("estimation").textContent = text ? `· ≈ ${Math.max(1, Math.round(text.length / 15 / speed))} s` : "";
  }

  function updateGenerateState() {
    $("generer").disabled = shuttingDown || generating || !voiceReady || !$("texte").value.trim();
  }

  /* ---------------------- Bibliothèque de voix ---------------------- */
  function prettyName(nom) {
    const base = (nom || "").replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
    return base || "voix sans nom";
  }

  function orbClass(id) {
    return `c${parseInt(id[0], 16) % 4}`;
  }

  async function refreshVoices(selectId = null) {
    try {
      const response = await fetch("/api/voix");
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.detail || "bibliothèque indisponible");
      voices = payload.voix || [];
    } catch (error) {
      setVoiceStatus(`Bibliothèque indisponible : ${error.message}`, "error");
      return;
    }
    renderVoices();
    renderOverview();
    const count = voices.length;
    $("voiceCount").textContent = count ? `${count} voix` : "0 voix";
    $("voiceFooterCount").textContent = count ? `${count} clone${count > 1 ? "s" : ""}` : "";
    if (selectId && voices.some((v) => v.id === selectId)) {
      selectVoice(selectId, { silent: true });
    } else if (!count) {
      voiceReady = false;
      selectedId = null;
      $("transcript").value = "";
      $("transcript").disabled = true;
      setVoiceStatus("Aucune voix : importe un clip ou enregistre-toi.");
      updateGenerateState();
    } else if (!selectedId && voices.length) {
      selectVoice(voices[0].id, { silent: true });
    } else if (!selectedId) {
      setVoiceStatus("Sélectionne une voix pour l'activer.");
    }
  }

  function renderVoices() {
    const list = $("voiceList");
    list.textContent = "";
    if (!voices.length) {
      const empty = document.createElement("div");
      empty.className = "voice-empty";
      empty.innerHTML = `${ICON_MIC}<strong>Aucune voix en cabine.</strong><p>Importe un clip (m4a, mp3, wav…) ou enregistre-toi :<br>la transcription part toute seule.</p>`;
      const actions = document.createElement("div");
      actions.className = "empty-actions";
      const importer = document.createElement("button");
      importer.className = "pill-light";
      importer.type = "button";
      importer.textContent = "Importer un clip";
      importer.addEventListener("click", () => $("fichier").click());
      const micro = document.createElement("button");
      micro.className = "pill-light";
      micro.type = "button";
      micro.innerHTML = '<span class="rec-dot" aria-hidden="true"></span>Enregistrer';
      micro.addEventListener("click", toggleRecording);
      actions.append(importer, micro);
      empty.appendChild(actions);
      list.appendChild(empty);
      return;
    }
    voices.forEach((voice) => list.appendChild(voiceRow(voice)));
  }

  function voiceRow(voice) {
    const row = document.createElement("div");
    row.className = `voice-row${voice.id === selectedId ? " selected" : ""}`;
    row.tabIndex = 0;
    row.dataset.vid = voice.id;
    row.setAttribute("role", "button");
    row.setAttribute("aria-label", `Voix ${prettyName(voice.nom)}, ${voice.duree} secondes`);
    row.innerHTML =
      `<span class="orb ${orbClass(voice.id)}" aria-hidden="true"></span>` +
      `<span class="check" aria-hidden="true">✓</span>` +
      `<span class="vname">${prettyName(voice.nom).replace(/</g, "&lt;")}</span>` +
      `<span class="vmeta">${voice.duree} s</span>`;

    const play = document.createElement("button");
    play.className = "play";
    play.type = "button";
    play.setAttribute("aria-label", `Écouter ${prettyName(voice.nom)}`);
    play.innerHTML = ICON_PLAY;
    play.addEventListener("click", (event) => { event.stopPropagation(); togglePreview(voice.id, play); });
    row.appendChild(play);

    const del = document.createElement("button");
    del.className = "vdel";
    del.type = "button";
    del.setAttribute("aria-label", `Supprimer ${prettyName(voice.nom)}`);
    del.innerHTML = ICON_TRASH;
    del.addEventListener("click", (event) => { event.stopPropagation(); deleteVoice(voice.id); });
    row.appendChild(del);

    const rename = document.createElement("button");
    rename.className = "vrename";
    rename.type = "button";
    rename.setAttribute("aria-label", `Renommer ${prettyName(voice.nom)}`);
    rename.textContent = "Renommer";
    rename.addEventListener("click", (event) => { event.stopPropagation(); startRename(voice, row); });
    row.appendChild(rename);

    const activate = () => selectVoice(voice.id);
    row.addEventListener("click", activate);
    row.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") { event.preventDefault(); activate(); }
    });
    row.title = "Clic : sélectionner · double-clic : renommer";
    row.addEventListener("dblclick", (event) => {
      if (event.target.closest(".play, .vdel, .rename-input")) return;
      startRename(voice, row);
    });
    return row;
  }

  function startRename(voice, row) {
    if (renaming) return;
    renaming = true;
    const nameEl = row.querySelector(".vname");
    const input = document.createElement("input");
    input.type = "text";
    input.className = "rename-input";
    input.value = prettyName(voice.nom);
    input.setAttribute("aria-label", "Nouveau nom de la voix");
    nameEl.replaceWith(input);
    input.focus();
    input.select();
    let closed = false;
    const done = (save) => {
      if (closed) return;
      closed = true;
      const value = input.value.trim();
      input.replaceWith(nameEl);
      renaming = false;
      if (!save || !value || value === prettyName(voice.nom)) return;
      fetch(`/api/voix/${voice.id}/renommer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nom: value.slice(0, 60) }),
      })
        .then(async (response) => {
          if (!response.ok) throw new Error((await response.json()).detail || "renommage impossible");
          notify("Voix renommée");
          refreshVoices(selectedId);
        })
        .catch((error) => notify(`Renommage impossible : ${error.message}`, "error"));
    };
    input.addEventListener("keydown", (event) => {
      event.stopPropagation();
      if (event.key === "Enter") done(true);
      else if (event.key === "Escape") done(false);
    });
    input.addEventListener("click", (event) => event.stopPropagation());
    input.addEventListener("blur", () => done(true));
  }

  async function selectVoice(id, { silent = false } = {}) {
    setVoiceStatus("Chargement de la voix…");
    try {
      const response = await fetch(`/api/voix/${id}/choisir`, { method: "POST" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.detail || "voix inconnue");
      selectedId = id;
      voiceReady = true;
      $("transcript").value = payload.transcript || "";
      $("transcript").disabled = false;
      setVoiceStatus(`Voix prête · ${payload.duree} s de référence`, "good");
      if (!silent) notify(`Voix « ${prettyName(payload.nom)} » sélectionnée`);
      setTakeStatus("La cabine est prête — écris ton texte.");
    } catch (error) {
      setVoiceStatus(`Sélection impossible : ${error.message}`, "error");
      return;
    }
    renderVoices();
    updateGenerateState();
  }

  function togglePreview(id, button) {
    if (previewId === id && !previewAudio.paused) {
      previewAudio.pause();
      return;
    }
    if (!previewAudio.paused) previewAudio.pause();
    previewId = id;
    previewAudio.src = `/api/voix/${id}/wav`;
    previewAudio.play().catch(() => notify("Lecture impossible", "error"));
  }

  function paintPlayButtons() {
    document.querySelectorAll(".voice-row").forEach((row) => {
      const play = row.querySelector(".play");
      if (!play) return;
      const id = row.dataset.vid;
      play.innerHTML = id && id === previewId && !previewAudio.paused ? ICON_PAUSE : ICON_PLAY;
    });
  }

  function bindPreviewEvents() {
    previewAudio.addEventListener("play", () => { $("resultat").pause(); paintPlayButtons(); paintTakeButtons(); });
    previewAudio.addEventListener("pause", () => { paintPlayButtons(); paintTakeButtons(); });
    previewAudio.addEventListener("ended", () => { paintPlayButtons(); paintTakeButtons(); });
    $("resultat").addEventListener("play", () => previewAudio.pause());
  }

  async function deleteVoice(id) {
    const voice = voices.find((v) => v.id === id);
    if (!window.confirm(`Supprimer la voix « ${prettyName(voice?.nom)} » et son clip de référence ?`)) return;
    try {
      const response = await fetch(`/api/voix/${id}`, { method: "DELETE" });
      if (!response.ok) throw new Error((await response.json()).detail || "suppression impossible");
      if (id === selectedId) {
        selectedId = null;
        voiceReady = false;
        $("transcript").value = "";
        $("transcript").disabled = true;
        updateGenerateState();
      }
      notify("Voix supprimée");
      refreshVoices();
    } catch (error) {
      notify(`Suppression impossible : ${error.message}`, "error");
    }
  }

  /* ---------------------- Ajouter une voix ---------------------- */
  function setAddBusy(busy) {
    $("ajouterFichier").disabled = busy;
    $("ajouterMicro").disabled = busy;
  }

  async function loadVoice(file) {
    if (shuttingDown) return;
    setAddBusy(true);
    const label = prettyName(file.name || "enregistrement");
    setVoiceStatus(`Préparation de « ${label} » : conversion + transcription…`);
    notify(`Analyse de « ${label} » — la transcription peut prendre un moment.`);
    try {
      const form = new FormData();
      form.append("audio", file);
      const response = await fetch("/api/voix", { method: "POST", body: form });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.detail || "import impossible");
      await refreshVoices(payload.id);
      notify(`Voix « ${label} » ajoutée à la bibliothèque`);
    } catch (error) {
      if (!shuttingDown) {
        setVoiceStatus(`Import impossible : ${error.message}`, "error");
        notify(`Import impossible : ${error.message}`, "error");
      }
    } finally {
      setAddBusy(false);
    }
  }

  /* ---------------------- Enregistrement micro ---------------------- */
  function micLevelLoop(bars) {
    if (!micAnalyser) return;
    const data = new Uint8Array(micAnalyser.frequencyBinCount);
    const tick = () => {
      if (!micAnalyser) return;
      micAnalyser.getByteFrequencyData(data);
      let sum = 0;
      for (let i = 0; i < 24; i += 1) sum += data[i] / 255;
      const energy = Math.min(1, (sum / 24) * 1.9);
      bars.forEach((bar, index) => {
        bar.style.height = `${Math.max(3, energy * (10 + index * 2.4))}px`;
      });
      micRaf = requestAnimationFrame(tick);
    };
    micRaf = requestAnimationFrame(tick);
  }

  function insertRecordingRow() {
    const row = document.createElement("div");
    row.className = "voice-row recording-row";
    row.id = "recordingRow";
    row.innerHTML =
      '<span class="rec-dot" aria-hidden="true"></span>' +
      '<span>Enregistrement…</span>' +
      '<span class="rec-time" id="recTime">0 s</span>' +
      '<div class="rec-level" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>';
    const stop = document.createElement("button");
    stop.className = "pill-light";
    stop.type = "button";
    stop.style.marginLeft = "auto";
    stop.textContent = "Arrêter";
    stop.addEventListener("click", () => recorder?.state === "recording" && recorder.stop());
    row.appendChild(stop);
    $("voiceList").prepend(row);
    return [...row.querySelectorAll(".rec-level i")];
  }

  async function toggleRecording() {
    if (shuttingDown) return;
    if (recorder?.state === "recording") { recorder.stop(); return; }
    try {
      recordingStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const Context = window.AudioContext || window.webkitAudioContext;
      const context = audioContext();
      context.resume();
      const source = context.createMediaStreamSource(recordingStream);
      micAnalyser = context.createAnalyser();
      micAnalyser.fftSize = 256;
      micAnalyser.smoothingTimeConstant = 0.6;
      source.connect(micAnalyser);

      const mimeType = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm"].find((type) => MediaRecorder.isTypeSupported(type));
      const chunks = [];
      recorder = new MediaRecorder(recordingStream, mimeType ? { mimeType } : undefined);
      recorder.addEventListener("dataavailable", (event) => chunks.push(event.data));
      recorder.addEventListener("stop", () => {
        clearInterval(recordingClock);
        cancelAnimationFrame(micRaf);
        micAnalyser = null;
        recordingStream?.getTracks().forEach((track) => track.stop());
        recordingStream = null;
        $("recordingRow")?.remove();
        setAddBusy(false);
        const ext = (recorder.mimeType || "").includes("mp4") ? "m4a" : "webm";
        const file = new File(chunks, `prise-${new Date().toISOString().slice(11, 19).replaceAll(":", "")}.${ext}`, { type: recorder.mimeType });
        loadVoice(file);
      }, { once: true });
      recorder.start();
      setAddBusy(true);
      const bars = insertRecordingRow();
      micLevelLoop(bars);
      recordingSeconds = 0;
      recordingClock = setInterval(() => {
        recordingSeconds += 1;
        $("recTime").textContent = `${recordingSeconds} s`;
      }, 1000);
    } catch (error) {
      setAddBusy(false);
      notify(`Micro indisponible : ${error.message}`, "error");
    }
  }

  function audioContext() {
    toggleRecording.context ??= new (window.AudioContext || window.webkitAudioContext)();
    return toggleRecording.context;
  }

  /* ---------------------- Génération ---------------------- */
  async function createTake() {
    if (shuttingDown) return;
    const text = $("texte").value.trim();
    if (!voiceReady || !text || generating) return;
    setGenerating(true);
    $("resultPanel").classList.remove("show");
    $("progress").style.width = "0%";
    setTakeStatus("La prise entre en cabine…");

    try {
      const response = await fetch("/api/generer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texte: text, vitesse: speed, transcript: $("transcript").value }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.detail || "génération impossible");
      await watchTake(payload.job, text);
    } catch (error) {
      if (shuttingDown) return;
      setGenerating(false);
      setTakeStatus(`Erreur : ${error.message}`, "error");
      notify(`Génération impossible : ${error.message}`, "error");
    }
  }

  async function watchTake(jobId, text) {
    const predicted = Math.max(45, (text.length / 15 / speed) * 15);
    const timer = setInterval(async () => {
      if (shuttingDown) { clearInterval(timer); return; }
      try {
        const response = await fetch(`/api/job/${jobId}`);
        const job = await response.json();
        const elapsed = job.ecoule || 0;
        $("genererLabel").textContent = `Rendu… ${elapsed} s`;
        $("progress").style.width = `${Math.min(96, Math.round((elapsed / (predicted + 24)) * 100))}%`;
        if (job.etat === "chargement") {
          setTakeStatus(`Le modèle chauffe la cabine · ${elapsed} s`);
          setPanelStatus(`Modèle en chargement · ${elapsed} s`, true);
        } else if (job.etat === "generation") {
          setTakeStatus(`La prise se construit · ${elapsed} s écoulées`);
          setPanelStatus(`Rendu en cours · ${elapsed} s`, true);
        }
        if (job.etat === "erreur") throw new Error(job.erreur || "rendu interrompu");
        if (job.etat !== "pret") return;

        clearInterval(timer);
        $("progress").style.width = "100%";
        setTimeout(() => { $("progress").style.width = "0%"; }, 1000);
        setGenerating(false);
        const url = `/api/audio/${job.fichier}`;
        $("resultat").src = url;
        $("telecharger").href = url;
        $("resultPanel").classList.add("show");
        setTakeStatus(`Prise finalisée · ${job.duree} s`, "good");
        setPanelStatus(`Prise prête · ${job.duree} s d'audio`);
        notify("Prise finalisée, à l'écoute.");
        refreshAudios();
        try { await $("resultat").play(); } catch (_) { /* autoplay bloqué : le lecteur reste là */ }
      } catch (error) {
        if (shuttingDown) { clearInterval(timer); return; }
        clearInterval(timer);
        setGenerating(false);
        $("progress").style.width = "0%";
        setTakeStatus(`Erreur : ${error.message}`, "error");
        notify(`Rendu interrompu : ${error.message}`, "error");
      }
    }, 1000);
  }

  /* ---------------------- Modèles téléchargeables ---------------------- */
  let moteurActif = "";
  async function refreshModeles() {
    if (shuttingDown) return;
    let payload;
    try {
      payload = await (await fetch("/api/modeles")).json();
    } catch (_) {
      return;
    }
    modelesCatalogue = payload.modeles || [];
    renderOverview();
    const list = $("modelesList");
    list.textContent = "";
    let enCours = false;
    const groups = { tts: "TEXT-TO-SPEECH", transcription: "SPEECH-TO-TEXT", categorisation: "CATÉGORISATION" };
    let lastCategory = "";
    (payload.modeles || []).forEach((m) => {
      const category = m.categorie || "tts";
      if (category !== lastCategory) {
        const heading = document.createElement("h3");
        heading.className = "models-category";
        heading.textContent = groups[category] || category;
        list.appendChild(heading);
        lastCategory = category;
      }
      const item = document.createElement("div");
      item.className = "model-item";
      const link = document.createElement("a");
      link.href = `https://huggingface.co/${m.repo}`;
      link.target = "_blank";
      link.rel = "noopener";
      link.textContent = `${m.label} · ${m.taille}`;
      const actions = document.createElement("div");
      actions.className = "model-actions";
      if (m.etat === "en_cours") {
        const btn = document.createElement("button");
        btn.className = "model-delete";
        btn.type = "button";
        btn.textContent = "Installation…";
        btn.disabled = true;
        enCours = true;
        actions.appendChild(btn);
      } else if (m.installe) {
        if (m.actif || (category === "tts" && m.moteur === moteurActif)) {
          const actif = document.createElement("span");
          actif.className = "model-actif";
          actif.textContent = "● Actif";
          actions.appendChild(actif);
        } else {
          const activer = document.createElement("button");
          activer.className = "pill-light";
          activer.type = "button";
          activer.textContent = "Activer";
          activer.addEventListener("click", () => category === "tts" ? switchEngine(m.moteur) : activerModele(m.id));
          actions.appendChild(activer);
        }
        if (!m.core) {
          const suppr = document.createElement("button");
          suppr.className = "model-suppr";
          suppr.type = "button";
          suppr.textContent = "Supprimer";
          suppr.addEventListener("click", () => supprimerModele(m.id));
          actions.appendChild(suppr);
        }
      } else {
        const btn = document.createElement("button");
        btn.className = "model-delete";
        btn.type = "button";
        btn.textContent = m.etat === "erreur" ? "Réessayer" : "Installer";
        if (m.etat === "erreur") btn.title = `Échec : ${m.erreur || "erreur"} — clique pour réessayer`;
        btn.addEventListener("click", () => installerModele(m.id));
        actions.appendChild(btn);
      }
      item.append(link, actions);
      if (m.etat === "erreur") {
        const erreur = document.createElement("div");
        erreur.className = "model-erreur";
        erreur.textContent = m.erreur;
        item.appendChild(erreur);
        if (m.aide === "gated") {
          const guide = document.createElement("div");
          guide.className = "model-guide";
          const etapes = [
            `<a href="https://huggingface.co/${m.repo}" target="_blank" rel="noopener">1. Ouvrir la page du modèle</a> et accepter les conditions (« Agree and access repository »)`,
            `<a href="https://huggingface.co/settings/tokens" target="_blank" rel="noopener">2. Créer un token</a> — « Create new token » → type « Read » → copier le hf_…`,
            `3. Le coller dans « Token Hugging Face » ci-dessus → Enregistrer`,
            `4. Recliquer <b>Installer</b> ici même`,
          ];
          guide.innerHTML = etapes.join("<br>");
          item.appendChild(guide);
        }
      }
      list.appendChild(item);
      const engine = document.querySelector(`.engine[data-moteur="${m.moteur}"]`);
      if (engine) engine.classList.toggle("hidden", !m.installe);
    });
    if (enCours) setTimeout(refreshModeles, 2000);
  }

  async function installerModele(id, relancerMoteur = false) {
    try {
      const response = await fetch(`/api/modeles/${id}/installer`, { method: "POST" });
      if (!response.ok) throw new Error((await response.json()).detail || "installation impossible");
      notify("Installation du composant lancée…");
      if (relancerMoteur) {
        $("installerDependance").disabled = true;
        $("installerDependance").textContent = "Installation…";
        const deadline = Date.now() + 15 * 60_000;
        while (Date.now() < deadline) {
          await new Promise((resolve) => setTimeout(resolve, 2000));
          const models = await (await fetch("/api/modeles")).json();
          const model = (models.modeles || []).find((item) => item.id === id);
          if (model?.etat === "erreur") throw new Error(model.erreur || "installation impossible");
          if (model?.etat === "pret") {
            $("recuperationMoteur").hidden = true;
            const selected = (models.modeles || []).find((item) => item.id === id);
            if (selected?.categorie === "tts") await switchEngine(selected.moteur);
            else await activerModele(id);
            refreshModeles();
            return;
          }
        }
        throw new Error("délai d’installation dépassé");
      }
      refreshModeles();
    } catch (error) {
      $("installerDependance").disabled = false;
      notify(`Installation impossible : ${error.message}`, "error");
      refreshSystem();
    }
  }

  async function activerModele(id) {
    try {
      const response = await fetch(`/api/modeles/${id}/activer`, { method: "POST" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.detail || "activation impossible");
      notify("Modèle activé.");
      refreshModeles();
    } catch (error) { notify(`Activation impossible : ${error.message}`, "error"); }
  }

  async function supprimerModele(id) {
    if (!window.confirm("Supprimer ce modèle du cache local ?")) return;
    try {
      const response = await fetch(`/api/modeles/${id}`, { method: "DELETE" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.detail || "suppression impossible");
      notify("Modèle supprimé du cache local.");
      refreshModeles();
    } catch (error) {
      notify(`Suppression impossible : ${error.message}`, "error");
    }
  }

  async function enregistrerHfToken() {
    const token = $("hfChamp").value.trim();
    $("hfBouton").disabled = true;
    $("hfStatut").textContent = "Enregistrement…";
    $("hfStatut").className = "chapter-status";
    try {
      const response = await fetch("/api/hf/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.detail || "enregistrement impossible");
      $("hfChamp").value = "";
      $("hfStatut").textContent = payload.configure ? "Token enregistré — relance Installer." : "Token retiré.";
      $("hfStatut").className = `chapter-status ${payload.configure ? "saved" : ""}`;
      notify(payload.configure ? "Token Hugging Face enregistré." : "Token Hugging Face retiré.");
    } catch (error) {
      $("hfStatut").textContent = error.message;
      $("hfStatut").className = "chapter-status dirty";
    } finally {
      $("hfBouton").disabled = false;
    }
  }

  /* ---------------------- Livres & audiobooks ---------------------- */
  let books = [];
  let libraryVoices = null;
  let pageLivre = null;             // id du livre dont la page dédiée est ouverte
  let chapitreOuvert = null;        // numéro du chapitre consulté dans la page
  const modesChapitre = new Map();  // "id:num" -> "colore" | "brut" | "editer"
  const chapterTexts = new Map();    // "id:num" -> texte servi par le serveur
  const chapterSources = new Map();  // "id:num" -> texte d'origine conservé côté serveur
  const chapterDrafts = new Map();   // "id:num" -> {texte, titre, dirty, savedAt}
  const chapterPainters = new Map(); // "id:num" -> rafraîchit l'éditeur affiché
  const analysesVues = new Set();    // id des livres dont l'analyse terminée a purgé le cache
  let premierRenduLivres = true;     // le premier rendu n'annonce pas les analyses déjà faites
  const BOOKS_HINT = "Dépose un EPUB : découpé en chapitres sur ce Mac, prêt à être narré.";
  const MOTS_PAR_MINUTE = 160;       // débit de narration d'un audiobook français
  const MARQUEUR_VOIX = /^(?:\/\/\/\s*([a-zA-Z0-9_-]+)\s+|\[([a-zA-Z0-9_-]+)\]\s*)/;
  let chapterPlaybackAudio = null;

  function nomVoix(book, id) {
    const voice = (book.cast || []).find((v) => v.id === id);
    if (voice) return voice.nom;
    const inconnu = id.match(/^np(\d+)$/i);
    if (inconnu) return `Voix inconnue ${inconnu[1]}`;
    return id;
  }

  function dureeEstimee(mots) {
    const minutes = Math.max(1, Math.round(mots / MOTS_PAR_MINUTE));
    if (minutes < 60) return `≈ ${minutes} min`;
    return `≈ ${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")}`;
  }

  async function refreshBooks() {
    try {
      const response = await fetch("/api/livres");
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.detail || "bibliothèque indisponible");
      books = payload.livres || [];
    } catch (_) {
      return;   // serveur absent ou éteint : les cartes déjà affichées restent en place
    }
    renderBooks();
  }

  async function importBook(file) {
    if (shuttingDown) return;
    if (!/\.epub$/i.test(file.name || "")) {
      notify("Seuls les fichiers EPUB sont acceptés.", "error");
      return;
    }
    $("ajouterLivre").disabled = true;
    $("booksSub").textContent = `Analyse de « ${file.name} » : découpage en chapitres…`;
    try {
      const form = new FormData();
      form.append("epub", file);
      const response = await fetch("/api/livres", { method: "POST", body: form });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.detail || "import impossible");
      notify(`« ${payload.titre} » importé : ${payload.chapitres.length} chapitres, ` +
             `${payload.mots.toLocaleString("fr-FR")} mots`);
      await refreshBooks();
    } catch (error) {
      notify(`Import impossible : ${error.message}`, "error");
    } finally {
      $("ajouterLivre").disabled = false;
      $("booksSub").textContent = BOOKS_HINT;
    }
  }

  async function deleteBook(book) {
    if (!window.confirm(`Supprimer « ${book.titre} » et ses ${book.chapitres.length} chapitres ?`)) return;
    try {
      const response = await fetch(`/api/livres/${book.id}`, { method: "DELETE" });
      if (!response.ok) throw new Error((await response.json()).detail || "suppression impossible");
      if (pageLivre === book.id) { pageLivre = null; chapitreOuvert = null; }
      notify("Livre supprimé.");
      refreshBooks();
    } catch (error) {
      notify(`Suppression impossible : ${error.message}`, "error");
    }
  }

  /* ---------------------- Réglages IA (endpoint + clé + modèle) ---------------------- */
  function setIaStatut(message, tone = "") {
    $("iaStatut").textContent = message;
    $("iaStatut").className = `chapter-status ${tone}`;
  }

  let iaProfiles = [];
  let activeIaProfile = "";

  async function loadIaConfig() {
    try {
      const response = await fetch("/api/ia/profils");
      const payload = await response.json();
      if (!response.ok) throw new Error(response.status === 404
        ? "Cette version du serveur ne gère pas encore les profils IA. Redémarre PK Voice Studio."
        : (payload.detail || "impossible de lire les profils IA"));
      iaProfiles = payload.profils || [];
      activeIaProfile = payload.actif || "";
      renderIaProfiles();
      const actif = iaProfiles.find((profil) => profil.id === activeIaProfile);
      if (actif) setIaStatut(`Provider actif : ${actif.nom}`, "saved");
    } catch (error) {
      setIaStatut(error.message || "API IA indisponible.", "dirty");
    }
  }

  function renderIaProfiles() {
    const list = $("iaProviders");
    if (!list) return;
    list.textContent = "";
    if (!iaProfiles.length) {
      const empty = document.createElement("p");
      empty.className = "chapter-stats";
      empty.textContent = "Aucun provider enregistré. Ajoute un service distant ou Ollama local.";
      list.appendChild(empty);
      return;
    }
    iaProfiles.forEach((profil) => {
      const row = document.createElement("div");
      row.className = `ia-provider${profil.id === activeIaProfile ? " actif" : ""}`;
      const info = document.createElement("div");
      const name = document.createElement("strong");
      name.textContent = profil.nom + (profil.id === activeIaProfile ? " · actif" : "");
      const detail = document.createElement("small");
      detail.textContent = `${profil.modele} · ${profil.base_url} · ${profil.cle_masquee || "sans clé"}`;
      info.append(name, detail);
      const actions = document.createElement("div");
      actions.className = "ia-provider-actions";
      if (profil.id !== activeIaProfile) {
        const use = document.createElement("button");
        use.type = "button"; use.className = "ia-small-btn"; use.textContent = "Activer";
        use.addEventListener("click", () => setActiveIaProfile(profil.id));
        actions.appendChild(use);
      }
      const edit = document.createElement("button");
      edit.type = "button"; edit.className = "ia-small-btn"; edit.textContent = "Modifier";
      edit.addEventListener("click", () => {
        $("iaProfileId").value = profil.id;
        $("iaNom").value = profil.nom;
        $("iaUrl").value = profil.base_url;
        $("iaModele").value = profil.modele;
        $("iaCle").value = "";
        $("iaCle").placeholder = `${profil.cle_masquee || "clé locale"} — vide = conserver`;
        $("iaSupprimerCle").checked = false;
        $("iaEnregistrer").textContent = "Enregistrer les modifications";
        $("iaNom").focus();
      });
      const remove = document.createElement("button");
      remove.type = "button"; remove.className = "ia-small-btn danger"; remove.textContent = "Supprimer";
      remove.addEventListener("click", () => deleteIaProfile(profil));
      actions.append(edit, remove);
      row.append(info, actions);
      list.appendChild(row);
    });
  }

  function nouveauProfilIa() {
    $("iaProfileId").value = "";
    $("iaNom").value = "";
    $("iaUrl").value = "";
    $("iaModele").value = "";
    $("iaCle").value = "";
    $("iaCle").placeholder = "clé distante — vide pour Ollama local";
    $("iaSupprimerCle").checked = false;
    $("iaEnregistrer").textContent = "Ajouter le provider";
    setIaStatut("Nouveau profil IA.");
    $("iaNom").focus();
  }

  async function setActiveIaProfile(id) {
    try {
      const response = await fetch(`/api/ia/profils/${id}/activer`, { method: "POST" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.detail || "activation impossible");
      activeIaProfile = id;
      renderIaProfiles();
      const profile = iaProfiles.find((p) => p.id === id);
      setIaStatut(`Provider actif : ${profile?.nom || id}`, "saved");
      notify(`Provider IA actif : ${profile?.nom || id}`);
    } catch (error) { setIaStatut(error.message, "dirty"); }
  }

  async function deleteIaProfile(profile) {
    if (!window.confirm(`Supprimer le provider « ${profile.nom} » ? Sa clé sera retirée des réglages locaux.`)) return;
    try {
      const response = await fetch(`/api/ia/profils/${profile.id}`, { method: "DELETE" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.detail || "suppression impossible");
      await loadIaConfig();
      if ($("iaProfileId").value === profile.id) nouveauProfilIa();
      setIaStatut("Provider supprimé.", "saved");
    } catch (error) { setIaStatut(error.message, "dirty"); }
  }

  async function saveIaConfig() {
    const corps = { nom: $("iaNom").value.trim(), base_url: $("iaUrl").value.trim(), modele: $("iaModele").value.trim() };
    const cle = $("iaCle").value.trim();
    if (cle) corps.cle = cle;
    if ($("iaSupprimerCle").checked) corps.supprimer_cle = true;
    setIaStatut("Enregistrement…");
    $("iaEnregistrer").disabled = true;
    try {
      const profileId = $("iaProfileId").value;
      const response = await fetch(profileId ? `/api/ia/profils/${profileId}` : "/api/ia/profils", {
        method: profileId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corps),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.detail || "enregistrement impossible");
      $("iaCle").value = "";
      $("iaSupprimerCle").checked = false;
      await loadIaConfig();
      nouveauProfilIa();
      setIaStatut("Provider enregistré. Active-le pour les prochaines analyses.", "saved");
      notify("Provider IA enregistré.");
    } catch (error) {
      setIaStatut(error.message, "dirty");
    } finally {
      $("iaEnregistrer").disabled = false;
    }
  }

  async function testIa() {
    $("iaTester").disabled = true;
    setIaStatut("Test de la connexion…");
    try {
      const response = await fetch("/api/ia/tester", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profil_id: activeIaProfile }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.detail || "test impossible");
      setIaStatut(`Connexion OK (« ${payload.reponse} »).`, "saved");
    } catch (error) {
      setIaStatut(error.message, "dirty");
    } finally {
      $("iaTester").disabled = false;
    }
  }

  /* ---------------------- Analyse IA d'un livre ---------------------- */
  let analyseTimer = null;

  function surveillerAnalyses() {
    if (analyseTimer) return;
    analyseTimer = setInterval(async () => {
      if (!books.some((b) => b.analyse?.etat === "en_cours")) {
        clearInterval(analyseTimer);
        analyseTimer = null;
        return;
      }
      await refreshBooks();
    }, 3000);
  }

  async function analyzeBook(book, options = {}) {
    if (shuttingDown) return;
    const corps = {};
    if (options.chapitre) corps.chapitre = options.chapitre;
    if (options.forcer) corps.forcer = true;
    try {
      const response = await fetch(`/api/livres/${book.id}/analyser`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corps),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.detail || "lancement impossible");
      const cibles = corps.chapitre
        ? [corps.chapitre]
        : book.chapitres.map((c) => c.num);
      cibles.forEach((num) => {
        const ancienne = `${book.id}:${num}`;
        chapterTexts.delete(ancienne);
        chapterDrafts.delete(ancienne);
      });
      notify(`Analyse IA lancée sur « ${book.titre} » — progression sur la carte.`);
      await refreshBooks();
      surveillerAnalyses();
    } catch (error) {
      notify(`Analyse impossible : ${error.message}`, "error");
    }
  }

  function castChips(book, limit = 0) {
    const div = document.createElement("div");
    div.className = "cast-chips";
    const cast = limit ? book.cast.slice(0, limit) : book.cast;
    cast.forEach((voice) => {
      const chip = document.createElement("span");
      chip.className = `cast-chip ${voice.genre}`;
      const symbole = voice.genre === "homme" ? "♂" : voice.genre === "femme" ? "♀" : "·";
      chip.title = `${voice.nom} — ${voice.role === "narrateur" ? "narration" : "personnage"}` +
                   `${voice.description ? ` · ${voice.description}` : ""} · ${voice.importance}`;
      const icone = document.createElement("i");
      icone.textContent = symbole;
      icone.setAttribute("aria-hidden", "true");
      chip.append(icone, document.createTextNode(voice.nom));
      div.appendChild(chip);
    });
    if (limit && book.cast.length > limit) {
      const reste = document.createElement("span");
      reste.className = "cast-chip indetermine";
      reste.textContent = `+${book.cast.length - limit}`;
      div.appendChild(reste);
    }
    return div;
  }

  function analyseZone(book) {
    const zone = document.createElement("div");
    const analyse = book.analyse || {};
    const faites = book.chapitres.filter((c) => c.analyse === "faite").length;
    const total = book.chapitres.length;
    if (analyse.etat === "en_cours") {
      const barre = document.createElement("div");
      barre.className = "analyse-barre";
      const remplissage = document.createElement("i");
      const cible = analyse.total || 1;
      const pourcentage = Math.min(100, Math.round(((analyse.courant || 0) / cible) * 100));
      remplissage.style.width = `${pourcentage}%`;
      barre.appendChild(remplissage);
      const texte = document.createElement("div");
      texte.className = "chapter-stats";
      texte.textContent = (analyse.phase || "Analyse IA en cours") + ` · ${pourcentage} %` +
                          (analyse.tokens ? ` · ${analyse.tokens.toLocaleString("fr-FR")} tokens` : "");
      zone.append(texte, barre);
    } else if (analyse.etat === "interrompue") {
      const message = document.createElement("div");
      message.className = "analyse-interrompue";
      const pourcentage = total ? Math.round((faites / total) * 100) : 0;
      message.textContent = `Analyse interrompue (studio arrêté) · ${faites}/${total} chapitres · ${pourcentage} % — ` +
                            "« Continuer l'analyse » reprend où elle s'était arrêtée.";
      zone.appendChild(message);
    } else if (analyse.etat === "erreur") {
      const erreur = document.createElement("div");
      erreur.className = "analyse-erreur";
      erreur.textContent = `Analyse interrompue : ${analyse.erreur || "erreur inconnue"}`;
      zone.appendChild(erreur);
    } else if (analyse.etat === "faite") {
      const fait = document.createElement("div");
      fait.className = "chapter-stats";
      const tokens = book.tokens_ia || analyse.tokens;
      fait.textContent = `${book.cast.length} voix · ${faites}/${total} chapitres analysés` +
                         (tokens ? ` · ${tokens.toLocaleString("fr-FR")} tokens` : "");
      zone.appendChild(fait);
    }
    return zone;
  }

  function renameBook(book, titleEl) {
    if (titleEl.querySelector("input")) return;
    const input = document.createElement("input");
    input.type = "text";
    input.className = "rename-input";
    input.value = book.titre;
    input.setAttribute("aria-label", "Nouveau titre du livre");
    titleEl.textContent = "";
    titleEl.appendChild(input);
    input.focus();
    input.select();
    let closed = false;
    const done = (save) => {
      if (closed) return;
      closed = true;
      const value = input.value.trim();
      if (!save || !value || value === book.titre) { renderBooks(); return; }
      fetch(`/api/livres/${book.id}/renommer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ titre: value.slice(0, 160) }),
      })
        .then(async (response) => {
          if (!response.ok) throw new Error((await response.json()).detail || "renommage impossible");
          notify("Livre renommé");
          refreshBooks();
        })
        .catch((error) => { notify(`Renommage impossible : ${error.message}`, "error"); renderBooks(); });
    };
    input.addEventListener("keydown", (event) => {
      event.stopPropagation();
      if (event.key === "Enter") done(true);
      else if (event.key === "Escape") done(false);
    });
    input.addEventListener("blur", () => done(true));
  }

  function renderBooks() {
    recolteEditeurs();
    chapterPainters.clear();
    document.body.classList.toggle("book-focus", vueActive === "books" && Boolean(books.find((b) => b.id === pageLivre)));
    const list = $("bookList");
    list.textContent = "";
    books.forEach((book) => {
      // une analyse qui vient de se terminer : les textes servis ont changé (tags)
      if (book.analyse?.etat === "faite" && !analysesVues.has(book.id)) {
        const silencieux = premierRenduLivres;   // au chargement : pas de toast rétroactif
        analysesVues.add(book.id);
        book.chapitres.forEach((c) => {
          chapterTexts.delete(`${book.id}:${c.num}`);
          chapterDrafts.delete(`${book.id}:${c.num}`);
        });
        if (!silencieux) {
          const faites = book.chapitres.filter((c) => c.analyse === "faite").length;
          const tokens = book.tokens_ia || book.analyse?.tokens;
          notify(`Analyse terminée : ${faites}/${book.chapitres.length} chapitres · ` +
                 `${book.cast.length} voix${tokens ? ` · ${tokens.toLocaleString("fr-FR")} tokens` : ""}`);
        }
      }
    });
    const page = books.find((b) => b.id === pageLivre);
    if (page) {
      list.appendChild(renderBookPage(page));
      $("bookDrop").hidden = true;
      document.querySelector(".breadcrumbs strong").textContent = `Livres / ${page.titre}`;
    } else {
      books.forEach((book) => list.appendChild(bookCard(book)));
      $("bookDrop").hidden = false;
      document.querySelector(".breadcrumbs strong").textContent = "Livres";
    }
    if (books.some((b) => b.analyse?.etat === "en_cours")) surveillerAnalyses();
    renderOverview();
    premierRenduLivres = false;
  }

  /* Ramasse les éditeurs ouverts avant un re-rendu : rien ne se perd. */
  function recolteEditeurs() {
    document.querySelectorAll(".chapter-edit").forEach((edit) => {
      const cle = edit.dataset.chapter;
      const textarea = edit.querySelector("textarea");
      const input = edit.querySelector(".chapter-title-input");
      if (!textarea || !input) return;
      const draft = chapterDrafts.get(cle) || {};
      draft.texte = textarea.value;
      draft.titre = input.value;
      const served = chapterTexts.get(cle);
      draft.dirty = served != null && (textarea.value !== served || input.value !== edit.dataset.titre);
      draft.savedAt = draft.dirty ? null : draft.savedAt;
      chapterDrafts.set(cle, draft);
    });
  }

  function bookCard(book) {
    const card = document.createElement("article");
    card.className = "book-card";
    card.tabIndex = 0;
    card.setAttribute("role", "button");
    card.setAttribute("aria-label", `Ouvrir « ${book.titre} »`);

    const cover = document.createElement("img");
    cover.className = "book-cover";
    cover.src = `/api/livres/${book.id}/couverture`;
    cover.alt = "";
    cover.addEventListener("error", () => cover.remove());

    const info = document.createElement("div");
    info.className = "book-info";
    const title = document.createElement("div");
    title.className = "book-title";
    title.textContent = book.titre;
    title.title = book.titre;
    const author = document.createElement("div");
    author.className = "book-author";
    author.textContent = book.auteur || "Auteur inconnu";
    const meta = document.createElement("div");
    meta.className = "book-meta";
    const faites = book.chapitres.filter((c) => c.analyse === "faite").length;
    const date = book.importe ? new Date(book.importe).toLocaleDateString("fr-FR") : "";
    meta.textContent = `${book.chapitres.length} chapitres · ${book.mots.toLocaleString("fr-FR")} mots · ` +
                       `${dureeEstimee(book.mots)} d'audio${date ? ` · ${date}` : ""}`;
    info.append(title, author, meta);
    if (book.cast?.length) info.append(castChips(book, 8));
    info.appendChild(analyseZone(book));

    const actions = document.createElement("div");
    actions.className = "book-actions";
    actions.append(boutonAnalyse(book), boutonSuppression(book));

    card.append(cover, info, actions);
    const ouvrir = () => ouvrirPageLivre(book.id);
    card.addEventListener("click", ouvrir);
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") { event.preventDefault(); ouvrir(); }
    });
    return card;
  }

  function ouvrirPageLivre(id) {
    pageLivre = id;
    const book = books.find((b) => b.id === id);
    chapitreOuvert = book?.chapitres?.[0]?.num ?? null;
    if (vueActive !== "books") appliquerVue("books");
    renderBooks();
    if (chapitreOuvert != null && book) loadChapter(book, chapitreOuvert);
  }

  function gardePropre(book) {
    if (chapitreOuvert == null) return true;
    const cle = `${book.id}:${chapitreOuvert}`;
    if (chapterDrafts.get(cle)?.dirty &&
        !window.confirm("Des modifications ne sont pas enregistrées. Continuer quand même ?")) return false;
    return true;
  }

  function boutonAnalyse(book) {
    const analyse = book.analyse || {};
    const restants = book.chapitres.filter((c) => c.analyse !== "faite").length;
    const analyseBtn = document.createElement("button");
    analyseBtn.className = "pill-light";
    analyseBtn.type = "button";
    if (analyse.etat === "en_cours") {
      analyseBtn.textContent = "Analyse…";
      analyseBtn.disabled = true;
    } else if (!book.cast?.length) {
      analyseBtn.textContent = "Analyser les voix (IA)";
      analyseBtn.addEventListener("click", () => analyzeBook(book));
    } else if (restants > 0) {
      analyseBtn.textContent = `Continuer l'analyse (${restants} chap.)`;
      analyseBtn.title = analyse.etat === "interrompue"
        ? "L'analyse avait été interrompue : reprise à partir du premier chapitre non analysé"
        : "Analyse les chapitres restants";
      analyseBtn.addEventListener("click", () => analyzeBook(book));
    } else {
      analyseBtn.textContent = "Réanalyser (IA)";
      analyseBtn.title = "Refait la distribution des voix et le tagage complet";
      analyseBtn.addEventListener("click", () => {
        if (window.confirm("Refaire toute l'analyse IA du livre (coût API complet) ?")) {
          analyzeBook(book, { forcer: true });
        }
      });
    }
    return analyseBtn;
  }

  function boutonSuppression(book) {
    const del = document.createElement("button");
    del.className = "icon-btn";
    del.type = "button";
    del.setAttribute("aria-label", `Supprimer « ${book.titre} »`);
    del.innerHTML = ICON_TRASH;
    del.addEventListener("click", (event) => {
      event.stopPropagation();
      deleteBook(book);
    });
    return del;
  }

  let voicesLoad = null;
  function voiceAssignments(book) {
    const section = document.createElement("section");
    section.className = "voice-assignment";
    const heading = document.createElement("div");
    heading.className = "voice-assignment-title";
    heading.textContent = "Associer les personnages à la bibliothèque de voix";
    const hint = document.createElement("p");
    hint.className = "chapter-stats";
    hint.textContent = "Ces associations serviront à générer chaque segment avec la bonne voix.";
    section.append(heading, hint);
    if (libraryVoices === null) {
      const pending = document.createElement("div");
      pending.className = "chapter-stats";
      pending.textContent = "Chargement de la bibliothèque de voix…";
      section.appendChild(pending);
      if (!voicesLoad) {
        voicesLoad = fetch("/api/voix").then((r) => r.json()).then((p) => {
          libraryVoices = p.voix || [];
          renderBooks();
        }).catch(() => { libraryVoices = []; }).finally(() => { voicesLoad = null; });
      }
      return section;
    }
    const form = document.createElement("div");
    form.className = "voice-assignment-grid";
    const selects = new Map();
    book.cast.forEach((role) => {
      const label = document.createElement("label");
      const genre = genreVoix(book.cast || [], role.id);
      label.className = `voice-assignment-row ${genre}`;
      const name = document.createElement("span");
      name.className = `voice-assignment-name ${genre}`;
      name.textContent = role.nom;
      const select = document.createElement("select");
      select.setAttribute("aria-label", `Voix de bibliothèque pour ${role.nom}`);
      const empty = document.createElement("option");
      empty.value = "";
      empty.textContent = "Choisir une voix…";
      select.appendChild(empty);
      libraryVoices.forEach((voice) => {
        const option = document.createElement("option");
        option.value = voice.id;
        option.textContent = voice.nom;
        select.appendChild(option);
      });
      select.value = book.voix_assignees?.[role.id] || "";
      selects.set(role.id, select);
      label.append(name, select);
      form.appendChild(label);
    });
    const save = document.createElement("button");
    save.type = "button";
    save.className = "voice-save-btn";
    save.textContent = "Enregistrer les associations";
    const status = document.createElement("span");
    status.className = "chapter-status";
    save.addEventListener("click", async () => {
      save.disabled = true;
      status.textContent = "Enregistrement…";
      const voix_assignees = Object.fromEntries([...selects].map(([id, select]) => [id, select.value]).filter(([, value]) => value));
      try {
        const response = await fetch(`/api/livres/${book.id}/voix`, {
          method: "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ voix_assignees }),
        });
        const payload = await response.json();
        if (!response.ok) {
          const detail = response.status === 404
            ? "Cette API manque sur le serveur actuellement lancé. Redémarre PK Voice Studio pour charger la version récente."
            : (payload.detail || "enregistrement impossible");
          throw new Error(detail);
        }
        book.voix_assignees = payload.voix_assignees;
        status.textContent = "Associations enregistrées";
        status.className = "chapter-status saved";
      } catch (error) {
        status.textContent = error.message;
        status.className = "chapter-status dirty";
      } finally { save.disabled = false; }
    });
    section.append(form, save, status);
    if (!libraryVoices.length) {
      const empty = document.createElement("p");
      empty.className = "chapter-stats";
      empty.textContent = "Aucune voix dans la bibliothèque — ajoute d’abord des voix dans l’onglet Voix.";
      section.appendChild(empty);
    }
    return section;
  }

  function renderBookPage(book) {
    const page = document.createElement("div");
    page.className = "book-page book-focus-layout";

    const toolbar = document.createElement("div");
    toolbar.className = "book-page-toolbar";
    const retour = document.createElement("button");
    retour.className = "pill-light";
    retour.type = "button";
    retour.textContent = "← Tous les livres";
    retour.addEventListener("click", () => {
      if (!gardePropre(book)) return;
      pageLivre = null;
      chapitreOuvert = null;
      renderBooks();
    });
    toolbar.append(retour);
    page.appendChild(toolbar);

    const head = document.createElement("div");
    head.className = "bp-head";
    const cover = document.createElement("img");
    cover.className = "book-cover";
    cover.src = `/api/livres/${book.id}/couverture`;
    cover.alt = "";
    cover.addEventListener("error", () => cover.remove());
    const infos = document.createElement("div");
    infos.className = "bp-infos";
    const title = document.createElement("div");
    title.className = "book-title bp-title";
    title.textContent = book.titre;
    title.title = "Double-clic pour renommer";
    title.addEventListener("dblclick", () => renameBook(book, title));
    const author = document.createElement("div");
    author.className = "book-author";
    author.textContent = book.auteur || "Auteur inconnu";
    const meta = document.createElement("div");
    meta.className = "book-meta";
    meta.textContent = `${book.chapitres.length} chapitres · ${book.mots.toLocaleString("fr-FR")} mots · ` +
                       `${dureeEstimee(book.mots)} d'audio`;
    const analysisSummary = analyseZone(book);
    analysisSummary.classList.add("book-analyse-zone");
    infos.append(title, author, meta, analysisSummary);
    if (book.cast?.length) infos.appendChild(castChips(book));
    const actions = document.createElement("div");
    actions.className = "book-actions";
    const exporterLivre = document.createElement("button");
    exporterLivre.className = "pill-light";
    exporterLivre.type = "button";
    exporterLivre.textContent = "Exporter l'audiobook (M4B)";
    exporterLivre.title = "Assemble les chapitres générés en un M4B chapitré — les chapitres sans audio complet sont ignorés";
    const exportStatus = document.createElement("span");
    exportStatus.className = "chapter-status";
    exporterLivre.addEventListener("click", async () => {
      exporterLivre.disabled = true;
      try {
        await fetch(`/api/livres/${book.id}/exporter`, { method: "POST" });
        for (;;) {
          const job = await (await fetch(`/api/livres/${book.id}/export`)).json();
          if (job.etat === "erreur") throw new Error(job.erreur || "export impossible");
          if (job.etat === "pret") {
            const lien = document.createElement("a");
            lien.href = `/api/livres/${book.id}/fichier`;
            lien.textContent = `⤓ Télécharger le M4B (${job.total - job.ignores.length} chapitres)`;
            exportStatus.textContent = job.ignores.length
              ? ` Ignorés sans audio complet : ${job.ignores.map((i) => i.num).join(", ")}.`
              : "";
            actions.querySelectorAll(".chapter-link").forEach((l) => l.remove());
            actions.insertBefore(lien, exportStatus);
            lien.className = "chapter-link";
            notify("Audiobook exporté.");
            break;
          }
          exportStatus.textContent = `Export du chapitre ${job.chapitre}/${job.total}…`;
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      } catch (error) {
        exportStatus.textContent = error.message;
        exportStatus.classList.add("dirty");
      } finally {
        exporterLivre.disabled = false;
      }
    });
    actions.append(boutonAnalyse(book), exporterLivre, boutonSuppression(book), exportStatus);
    head.append(cover, infos, actions);
    page.appendChild(head);
    if (book.cast?.length) {
      const castDetails = document.createElement("details");
      castDetails.className = "book-voice-details";
      const summary = document.createElement("summary");
      summary.textContent = `Voix et attribution · ${book.cast.length} rôles`;
      castDetails.append(summary, voiceAssignments(book));
      page.appendChild(castDetails);
    }

    const liste = document.createElement("div");
    liste.className = "bp-chapters";
    const entete = document.createElement("div");
    entete.className = "bp-chapters-head";
    const titreListe = document.createElement("strong");
    titreListe.textContent = "Chapitres";
    const faites = book.chapitres.filter((c) => c.analyse === "faite").length;
    const compte = document.createElement("span");
    compte.className = "chapter-stats";
    compte.textContent = faites
      ? `${faites}/${book.chapitres.length} analysés · ${book.cast?.length || 0} voix`
      : "aucun chapitre analysé — ouvre un chapitre ou lance l'analyse du livre";
    entete.append(titreListe, compte);
    liste.appendChild(entete);
    book.chapitres.forEach((chapter) => liste.appendChild(chapterRow(book, chapter)));
    liste.setAttribute("aria-label", "Liste des chapitres");
    const chapter = book.chapitres.find((c) => c.num === chapitreOuvert);
    const workspace = document.createElement("div");
    workspace.className = "book-workspace";
    workspace.appendChild(liste);
    const reader = document.createElement("div");
    reader.className = "book-reader";
    if (chapter) reader.appendChild(chapterPanel(book, chapter));
    else {
      const empty = document.createElement("div");
      empty.className = "book-reader-empty";
      empty.textContent = "Choisis un chapitre dans la liste pour afficher sa lecture et son statut.";
      reader.appendChild(empty);
    }
    workspace.appendChild(reader);
    page.appendChild(workspace);
    return page;
  }

  function chapterRow(book, chapter) {
    const row = document.createElement("div");
    row.className = `chapter-row${chapitreOuvert === chapter.num ? " actif" : ""}`;
    row.dataset.chapterNum = String(chapter.num);
    row.tabIndex = 0;
    row.setAttribute("role", "button");
    row.setAttribute("aria-expanded", String(chapitreOuvert === chapter.num));

    const num = document.createElement("span");
    num.className = "chapter-num";
    num.textContent = String(chapter.num).padStart(2, "0");
    const titre = document.createElement("span");
    titre.className = "chapter-title";
    titre.textContent = chapter.titre;
    const etat = document.createElement("span");
    if (chapter.analyse === "faite") {
      const totalSegments = chapter.segments || 0;
      const audioReady = chapter.audio_generes ?? Object.keys(chapter.audio_segments || {}).length;
      etat.className = "chapter-etat fait chapter-state-stack";
      etat.textContent = `✓ ${chapter.voix?.length || 0} voix · ${totalSegments} phrases\n${audioReady}/${totalSegments} audio`;
      etat.title = `Analyse terminée · ${chapter.voix?.length || 0} voix · ${totalSegments} segments détectés · ${audioReady} segments générés`;
    } else if (book.analyse?.etat === "en_cours") {
      etat.className = "chapter-etat attente";
      etat.textContent = "en file…";
    } else {
      etat.className = "chapter-etat";
      etat.textContent = "à analyser";
      etat.title = "Pas encore analysé";
    }
    const mots = document.createElement("span");
    mots.className = "chapter-words";
    mots.textContent = `${chapter.mots.toLocaleString("fr-FR")} mots · ${dureeEstimee(chapter.mots)}`;

    const analyseIa = document.createElement("button");
    analyseIa.className = "icon-btn chapter-ia";
    analyseIa.type = "button";
    analyseIa.innerHTML = ICON_SPARK;
    const dejaFait = chapter.analyse === "faite";
    analyseIa.title = dejaFait
      ? "Réanalyser ce chapitre avec l'IA (les voix actuelles sont conservées)"
      : "Analyser ce chapitre avec l'IA : attribution des voix ligne par ligne";
    analyseIa.setAttribute("aria-label", analyseIa.title);
    analyseIa.disabled = book.analyse?.etat === "en_cours";
    analyseIa.addEventListener("click", (event) => {
      event.stopPropagation();
      analyzeBook(book, { chapitre: chapter.num, forcer: dejaFait });
    });

    const side = document.createElement("div");
    side.className = "chapter-list-row-side";
    side.append(etat, analyseIa);
    row.append(num, titre, side);
    const ouvrir = () => {
      if (chapitreOuvert === chapter.num) return;
      if (!gardePropre(book)) return;
      chapitreOuvert = chapter.num;
      renderBooks();
      loadChapter(book, chapter.num);
    };
    row.addEventListener("click", ouvrir);
    row.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") { event.preventDefault(); ouvrir(); }
    });
    return row;
  }

  function chapterPanel(book, chapter) {
    const cle = `${book.id}:${chapter.num}`;
    const analyseFait = chapter.analyse === "faite";
    const mode = analyseFait ? (modesChapitre.get(cle) || "compare") : "editer";
    modesChapitre.set(cle, mode);

    const panel = document.createElement("section");
    panel.className = "chapter-panel";

    const head = document.createElement("div");
    head.className = "cp-head";
    const titre = document.createElement("h3");
    titre.className = "cp-title";
    titre.textContent = `${String(chapter.num).padStart(2, "0")} · ${chapter.titre}`;
    const modes = document.createElement("div");
    modes.className = "cp-modes";
    if (analyseFait) {
      modes.append(boutonMode(cle, "compare", "Comparer"), boutonMode(cle, "colore", "Coloré"), boutonMode(cle, "brut", "Texte brut"));
    }
    modes.append(boutonMode(cle, "editer", "Éditer"));
    head.append(titre, modes);

    const corps = document.createElement("div");
    corps.className = "cp-corps";
    if (mode === "editer") {
      corps.appendChild(modeEditeur(book, chapter, cle));
    } else {
      const texte = chapterTexts.get(cle);
      if (texte == null) {
        const vide = document.createElement("div");
        vide.className = "take-empty";
        vide.textContent = "Chargement du chapitre…";
        corps.appendChild(vide);
      } else if (mode === "compare") {
        corps.appendChild(vueComparee(book, chapter, chapterSources.get(cle) ?? texte, texte));
      } else if (mode === "colore") {
        corps.appendChild(vueColoree(book, texte));
      } else {
        const pre = document.createElement("div");
        pre.className = "cl-brut";
        pre.textContent = texte.replace(/^(?:\/\/\/\s*[a-zA-Z0-9_-]+\s+|\[[a-zA-Z0-9_-]+\]\s*)/gm, "");
        corps.appendChild(pre);
      }
    }

    const actions = document.createElement("div");
    actions.className = "cp-actions";
    const relance = document.createElement("button");
    relance.className = "pill-light";
    relance.type = "button";
    relance.innerHTML = `${ICON_SPARK} ${analyseFait ? "Réanalyser ce chapitre" : "Analyser ce chapitre"}`;
    relance.title = analyseFait
      ? "Réattribue les voix de ce chapitre (la distribution du livre est conservée)"
      : "Attribue les voix ligne par ligne via l'IA";
    relance.disabled = book.analyse?.etat === "en_cours";
    relance.addEventListener("click", () => analyzeBook(book, {
      chapitre: chapter.num, forcer: analyseFait,
    }));
    actions.appendChild(relance);
    if (analyseFait) {
      const verifier = document.createElement("button");
      verifier.className = "pill-light";
      verifier.type = "button";
      verifier.textContent = "Vérifier l'attribution (local)";
      verifier.title = "Laya, un petit modèle local : signale les segments « narrateur » qui ressemblent à du dialogue — sans consommer de tokens";
      const verifierStatus = document.createElement("span");
      verifierStatus.className = "chapter-status";
      verifier.addEventListener("click", async () => {
        verifier.disabled = true;
        try {
          let etatLaya = await (await fetch("/api/laya/etat")).json();
          if (!etatLaya.installe) throw new Error("Laya n'est pas installé : .venv/bin/python -m pip install laya");
          if (!etatLaya.pret) {
            if (!etatLaya.chargement) await fetch("/api/laya/charger", { method: "POST" });
            verifierStatus.textContent = "Chargement de Laya — une seule fois (~800 Mo au premier lancement)…";
            while (!(etatLaya = await (await fetch("/api/laya/etat")).json()).pret) {
              if (etatLaya.erreur) throw new Error(etatLaya.erreur);
              await new Promise((resolve) => setTimeout(resolve, 2000));
            }
          }
          verifierStatus.textContent = "Vérification des attributions en local…";
          const response = await fetch(`/api/livres/${book.id}/chapitre/${chapter.num}/verifier`, { method: "POST" });
          const payload = await response.json();
          if (!response.ok) throw new Error(payload.detail || "vérification impossible");
          panel.querySelectorAll(".cl-segment-row.suspect").forEach((row) => {
            row.classList.remove("suspect");
            row.querySelector(".cl-suspect-note")?.remove();
          });
          payload.segments.forEach((segment) => {
            if (!segment.dialogue) return;
            const row = panel.querySelector(`.cl-segment-row[data-segment-index="${segment.num}"]`);
            if (!row) return;
            row.classList.add("suspect");
            const note = document.createElement("span");
            note.className = "cl-suspect-note";
            note.textContent = `dialogue probable · ${(segment.probabilite * 100).toFixed(0)} %`;
            note.title = "Laya détecte des paroles prononcées sur un segment attribué au narrateur — à relire";
            row.querySelector(".cl-segment-head")?.appendChild(note);
          });
          verifierStatus.textContent = payload.suspects
            ? `${payload.suspects} dialogue(s) probable(s) attribué(s) au narrateur — relis les lignes surlignées.`
            : `Aucun dialogue attribué au narrateur sur ${payload.total} segments.`;
        } catch (error) {
          verifierStatus.textContent = error.message;
          verifierStatus.classList.add("dirty");
        } finally {
          verifier.disabled = false;
        }
      });
      actions.append(verifier, verifierStatus);
      const exporter = document.createElement("button");
      exporter.className = "pill-light";
      exporter.type = "button";
      exporter.textContent = "Exporter le chapitre";
      exporter.title = "Concatène les segments générés en un seul WAV, pauses de ponctuation incluses";
      const exporterStatus = document.createElement("span");
      exporterStatus.className = "chapter-status";
      exporter.addEventListener("click", async () => {
        exporter.disabled = true;
        exporterStatus.textContent = "Assemblage du chapitre…";
        try {
          const response = await fetch(`/api/livres/${book.id}/chapitre/${chapter.num}/exporter`, { method: "POST" });
          const payload = await response.json();
          if (!response.ok) throw new Error(payload.detail || "export impossible");
          const lien = document.createElement("a");
          lien.href = `/api/livres/${book.id}/chapitre/${chapter.num}/fichier`;
          lien.className = "chapter-link";
          lien.textContent = `⤓ Télécharger le chapitre (${payload.duree} s)`;
          exporterStatus.textContent = "";
          const precedent = exporterStatus.parentElement?.querySelector(".chapter-link");
          precedent?.remove();
          actions.insertBefore(lien, exporterStatus);
        } catch (error) {
          exporterStatus.textContent = error.message;
          exporterStatus.classList.add("dirty");
        } finally {
          exporter.disabled = false;
        }
      });
      actions.append(exporter, exporterStatus);
      const batch = document.createElement("button");
      batch.className = "pill-light";
      batch.type = "button";
      batch.textContent = "Générer les segments du chapitre";
      const batchStatus = document.createElement("span");
      batchStatus.className = "chapter-status";
      batch.addEventListener("click", async () => {
        const rows = [...panel.querySelectorAll(".cl-structured .cl-segment-row")];
        if (!rows.length) {
          modesChapitre.set(cle, "compare");
          renderBooks();
          notify("Vue comparaison activée. Relance le lot pour générer les segments.");
          return;
        }
        const todo = rows.filter((row) => {
          const index = Number(row.dataset.segmentIndex);
          return !segmentFichier(book, chapter.num, index, row.querySelector(".cl-text")?.textContent || "",
            book.voix_assignees?.[row.dataset.speaker] || "");
        });
        if (!todo.length) { batchStatus.textContent = "Tous les segments sont déjà générés."; return; }
        batch.disabled = true;
        for (let i = 0; i < todo.length; i += 1) {
          const row = todo[i];
          const index = Number(row.dataset.segmentIndex);
          batchStatus.textContent = `Génération du segment ${i + 1}/${todo.length}…`;
          await generateSegment(book, chapter.num, index, row.querySelector(".cl-text")?.textContent || "",
            row.dataset.speaker, row.querySelector(".cl-segment-audio"), row.querySelector(".cl-segment-audio button"), batchStatus);
          if (batchStatus.classList.contains("dirty")) break;
        }
        batch.disabled = false;
        if (!batchStatus.classList.contains("dirty")) batchStatus.textContent = "Génération du lot terminée.";
      });
      actions.append(batch, batchStatus);

      const listen = document.createElement("button");
      listen.className = "pill-light";
      listen.type = "button";
      listen.textContent = "Écouter le chapitre";
      listen.title = "Enchaîne les segments avec une respiration adaptée à la ponctuation";
      listen.addEventListener("click", async () => {
        if (chapterPlaybackAudio) {
          chapterPlaybackAudio.pause();
          chapterPlaybackAudio = null;
          listen.textContent = "Écouter le chapitre";
          return;
        }
        const rows = [...panel.querySelectorAll(".cl-structured .cl-segment-row")];
        const segments = rows.map((row) => {
          const text = row.querySelector(".cl-text")?.textContent || "";
          const index = Number(row.dataset.segmentIndex);
          const fichier = segmentFichier(book, chapter.num, index, text,
            book.voix_assignees?.[row.dataset.speaker] || "");
          return { text, fichier };
        });
        if (!segments.length || segments.some((segment) => !segment.fichier)) {
          batchStatus.textContent = "Génère d’abord tous les segments du chapitre.";
          batchStatus.className = "chapter-status dirty";
          return;
        }
        listen.textContent = "Arrêter la lecture";
        try {
          for (let i = 0; i < segments.length; i += 1) {
            if (listen.textContent !== "Arrêter la lecture") break;
            const audio = new Audio(`/api/audio/${encodeURIComponent(segments[i].fichier)}`);
            chapterPlaybackAudio = audio;
            await new Promise((resolve, reject) => {
              audio.addEventListener("ended", resolve, { once: true });
              audio.addEventListener("pause", resolve, { once: true });
              audio.addEventListener("error", () => reject(new Error("lecture audio impossible")), { once: true });
              audio.play().catch(reject);
            });
            chapterPlaybackAudio = null;
            if (listen.textContent !== "Arrêter la lecture") break;
            const pause = /[,;:]$/.test(segments[i].text.trim()) ? 220
              : /[.!?…»”\"]$/.test(segments[i].text.trim()) ? 520 : 300;
            if (i < segments.length - 1) await new Promise((resolve) => setTimeout(resolve, pause));
          }
        } catch (error) {
          batchStatus.textContent = error.message;
          batchStatus.className = "chapter-status dirty";
        } finally {
          if (chapterPlaybackAudio) chapterPlaybackAudio.pause();
          chapterPlaybackAudio = null;
          listen.textContent = "Écouter le chapitre";
        }
      });
      actions.appendChild(listen);
    }

    chapterPainters.set(cle, () => renderBooks());
    panel.append(head, corps, actions);
    return panel;
  }

  function boutonMode(cle, mode, label) {
    const bouton = document.createElement("button");
    bouton.type = "button";
    bouton.className = `mode-btn${modesChapitre.get(cle) === mode ? " actif" : ""}`;
    bouton.textContent = label;
    if (mode === "compare") bouton.title = "Texte d'origine à gauche, phrases attribuées et colorées à droite";
    if (mode === "colore") bouton.title = "Vue colorée par orateur : narrateur en vert, hommes en bleu, femmes en rose";
    if (mode === "brut") bouton.title = "Le texte sans les préfixes de voix";
    bouton.addEventListener("click", () => {
      if (modesChapitre.get(cle) === mode) return;
      if (chapterDrafts.get(cle)?.dirty &&
          !window.confirm("Des modifications ne sont pas enregistrées. Changer de vue quand même ?")) return;
      modesChapitre.set(cle, mode);
      renderBooks();
    });
    return bouton;
  }

  function genreVoix(cast, id) {
    const voice = cast.find((v) => v.id === id);
    if (id === "narrateur" || id === "narrator" || voice?.role === "narrateur") return "narrateur";
    return voice?.genre || "indetermine";
  }

  function vueColoree(book, texte) {
    const vue = document.createElement("div");
    vue.className = "cl-vue";
    const cast = book.cast || [];
    texte.split("\n").forEach((ligne) => {
      const brut = ligne.trim();
      if (!brut) return;
      const trouve = MARQUEUR_VOIX.exec(brut);
      const id = trouve ? (trouve[1] || trouve[2]).toLowerCase() : "narrateur";
      const reste = trouve ? brut.slice(trouve[0].length) : brut;
      const role = genreVoix(cast, id);
      const row = document.createElement("div");
      row.className = `cl-row ${role}`;
      const chip = document.createElement("span");
      chip.className = `cl-chip ${role}`;
      chip.textContent = nomVoix(book, id);
      chip.title = `voix ${role}`;
      const contenu = document.createElement("span");
      contenu.className = "cl-text";
      contenu.textContent = reste;
      row.append(chip, contenu);
      vue.appendChild(row);
    });
    if (!vue.children.length) {
      const vide = document.createElement("div");
      vide.className = "take-empty";
      vide.textContent = "Chapitre vide.";
      vue.appendChild(vide);
    }
    return vue;
  }

  function empreinteSegment(text, voiceId) {
    let hash = 2166136261;
    for (const char of `${text}\0${voiceId}`) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
    return (hash >>> 0).toString(16).padStart(8, "0");
  }

  function segmentStorageKey(bookId, chapterNum, index, text = "", voiceId = "") {
    return `pkvs-segment:${bookId}:${chapterNum}:${index}:${empreinteSegment(text, voiceId)}`;
  }

  function segmentFichier(book, chapterNum, index, text = "", voiceId = "") {
    const empreinte = empreinteSegment(text, voiceId);
    const stored = book.chapitres.find((c) => c.num === chapterNum)?.audio_segments?.[String(index)];
    if (stored?.empreinte === empreinte) return stored.fichier;
    try { return localStorage.getItem(segmentStorageKey(book.id, chapterNum, index, text, voiceId)); }
    catch (_) { return null; }
  }

  function afficherAudioSegment(book, chapterNum, index, text, speakerId, actions, fichier) {
    actions.replaceChildren();
    if (!fichier) {
      const generate = document.createElement("button");
      generate.type = "button";
      generate.className = "segment-control segment-generate";
      generate.textContent = "Générer";
      generate.title = `Générer l’ID ${index} avec ${nomVoix(book, speakerId)}`;
      generate.addEventListener("click", () => generateSegment(book, chapterNum, index, text, speakerId, actions, generate));
      actions.appendChild(generate);
      return;
    }
    const player = document.createElement("audio");
    player.controls = true;
    player.preload = "none";
    player.setAttribute("aria-label", `Écouter le segment ${index}`);
    player.src = `/api/audio/${encodeURIComponent(fichier)}`;
    const regenerate = document.createElement("button");
    regenerate.type = "button";
    regenerate.className = "segment-control segment-regenerate";
    regenerate.textContent = "↻ Régénérer";
    regenerate.title = `Créer un nouvel audio pour l’ID ${index} avec ${nomVoix(book, speakerId)}`;
    regenerate.addEventListener("click", () => generateSegment(book, chapterNum, index, text, speakerId, actions, regenerate));
    actions.append(player, regenerate);
  }

  async function generateSegment(book, chapterNum, index, text, speakerId, actions, button, status = null) {
    if (!actions || !text.trim()) return false;
    const referenceId = book.voix_assignees?.[speakerId];
    if (!referenceId) {
      if (status) { status.textContent = `Aucune voix associée à ${nomVoix(book, speakerId)}.`; status.className = "chapter-status dirty"; }
      else notify(`Associe d'abord une voix à ${nomVoix(book, speakerId)}.`, "error");
      return false;
    }
    if (button) { button.disabled = true; button.textContent = "…"; }
    if (status) { status.textContent = `Préparation du segment ${index}…`; status.className = "chapter-status"; }
    try {
      const response = await fetch("/api/generer", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texte: text, reference_id: referenceId }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.detail || "génération impossible");
      let job;
      for (;;) {
        await new Promise((resolve) => setTimeout(resolve, 1200));
        const stateResponse = await fetch(`/api/job/${payload.job}`);
        job = await stateResponse.json();
        if (!stateResponse.ok) throw new Error(job.detail || "suivi de génération indisponible");
        if (["pret", "erreur"].includes(job.etat)) break;
        if (status) status.textContent = `Génération du segment ${index} · ${job.etat}…`;
      }
      if (job.etat === "erreur") throw new Error(job.erreur || "erreur de synthèse");
      const empreinte = empreinteSegment(text, referenceId);
      const saved = await fetch(`/api/livres/${book.id}/chapitre/${chapterNum}/segment/${index}/audio`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fichier: job.fichier, empreinte }),
      });
      const savedPayload = await saved.json();
      if (!saved.ok) throw new Error(savedPayload.detail || "impossible d'enregistrer l'état audio du segment");
      const chapter = book.chapitres.find((c) => c.num === chapterNum);
      if (chapter) {
        chapter.audio_segments = chapter.audio_segments || {};
        chapter.audio_segments[String(index)] = { fichier: job.fichier, empreinte };
        chapter.audio_generes = Object.keys(chapter.audio_segments).length;
        const row = document.querySelector(`.chapter-row[data-chapter-num="${chapterNum}"] .chapter-etat`);
        if (row) row.textContent = `✓ ${chapter.voix?.length || 0} voix · ${chapter.segments || 0} phrases\n${chapter.audio_generes}/${chapter.segments || 0} audio`;
      }
      try { localStorage.setItem(segmentStorageKey(book.id, chapterNum, index, text, referenceId), job.fichier); } catch (_) { /* stockage navigateur désactivé */ }
      afficherAudioSegment(book, chapterNum, index, text, speakerId, actions, job.fichier);
      if (status) { status.textContent = `Segment ${index} prêt`; status.className = "chapter-status saved"; }
      return true;
    } catch (error) {
      if (status) { status.textContent = error.message; status.className = "chapter-status dirty"; }
      else notify(`Segment ${index} : ${error.message}`, "error");
      if (button) {
        button.disabled = false;
        button.textContent = button.classList.contains("segment-regenerate") ? "↻ Régénérer" : "Générer";
      }
      return false;
    }
  }

  function vueComparee(book, chapter, original, structure) {
    const chapterNum = chapter.num;
    const grid = document.createElement("div");
    grid.className = "cl-compare";
    const labels = document.createElement("div");
    labels.className = "cl-compare-labels";
    ["Texte d’origine", "Texte structuré · segments audio"].forEach((label) => {
      const heading = document.createElement("strong");
      heading.textContent = label;
      labels.appendChild(heading);
    });
    const body = document.createElement("div");
    body.className = "cl-compare-body";
    const alignment = document.createElement("div");
    alignment.className = "cl-compare-alignment cl-structured";

    const sourceParts = original.split(/([.!?…]+[ \t]*[»”"']*\s+)/u);
    const sourceSentences = [];
    for (let i = 0; i < sourceParts.length; i += 2) {
      const phrase = `${sourceParts[i] || ""}${sourceParts[i + 1] || ""}`.trim();
      if (phrase) sourceSentences.push(phrase);
    }
    const normalize = (value) => value.toLocaleLowerCase("fr-FR").normalize("NFD")
      .replace(/\p{M}/gu, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
    const words = (value) => normalize(value).split(/\s+/).filter(Boolean);
    const similarity = (leftText, rightText) => {
      const a = words(leftText); const b = words(rightText);
      if (!a.length || !b.length) return 0;
      let previous = new Uint16Array(b.length + 1);
      for (const word of a) {
        const current = new Uint16Array(b.length + 1);
        for (let j = 1; j <= b.length; j += 1) {
          current[j] = word === b[j - 1] ? previous[j - 1] + 1 : Math.max(previous[j], current[j - 1]);
        }
        previous = current;
      }
      return (2 * previous[b.length]) / (a.length + b.length);
    };
    const segments = structure.split("\n").map((raw) => {
      const line = raw.trim();
      if (!line) return null;
      const match = MARQUEUR_VOIX.exec(line);
      const id = match ? (match[1] || match[2]).toLowerCase() : "narrateur";
      const text = (match ? line.slice(match[0].length) : line).trim();
      return text ? { id, text } : null;
    }).filter(Boolean);

    let sourceAt = 0;
    const correspondances = segments.map((segment) => {
      let best = { end: sourceAt, score: 0, text: "" };
      let candidate = "";
      for (let end = sourceAt; end < Math.min(sourceSentences.length, sourceAt + 14); end += 1) {
        candidate += `${sourceSentences[end]} `;
        const score = similarity(candidate, segment.text);
        if (score > best.score) best = { end: end + 1, score, text: sourceSentences.slice(sourceAt, end + 1).join(" ") };
        if (normalize(candidate) === normalize(segment.text)) {
          best = { end: end + 1, score: 1, text: sourceSentences.slice(sourceAt, end + 1).join(" ") };
          break;
        }
      }
      if (best.score < 0.38) return { ...segment, original: "", matched: false };
      sourceAt = best.end;
      return { ...segment, original: best.text, matched: true };
    });

    const addPair = (segment, index) => {
      const pair = document.createElement("div");
      pair.className = "cl-compare-pair";
      const source = document.createElement("div");
      source.className = `cl-source-cell${segment.matched === false ? " non-aligne" : ""}`;
      source.textContent = segment.original || "Aucune correspondance exacte dans la source";
      const role = genreVoix(book.cast || [], segment.id);
      const right = document.createElement("div");
      right.className = `cl-segment-row cl-row ${role}`;
      right.dataset.speaker = segment.id;
      right.dataset.segmentIndex = String(index + 1);
      const head = document.createElement("div");
      head.className = "cl-segment-head";
      const number = document.createElement("span");
      number.className = "cl-segment-num";
      number.textContent = `ID ${String(index + 1).padStart(3, "0")}`;
      const speaker = document.createElement("span");
      speaker.className = `cl-chip ${role}`;
      speaker.textContent = nomVoix(book, segment.id);
      head.append(number, speaker);
      const text = document.createElement("div");
      text.className = "cl-text";
      text.textContent = segment.text;
      const audioActions = document.createElement("span");
      audioActions.className = "cl-segment-audio";
      const savedFile = segmentFichier(book, chapterNum, index + 1, segment.text, book.voix_assignees?.[segment.id] || "");
      afficherAudioSegment(book, chapterNum, index + 1, segment.text, segment.id, audioActions, savedFile);
      right.append(head, text, audioActions);
      pair.append(source, right);
      alignment.appendChild(pair);
    };

    correspondances.forEach(addPair);
    const restants = sourceSentences.slice(sourceAt);
    if (restants.length) {
      const unmatched = document.createElement("div");
      unmatched.className = "cl-compare-pair cl-unmatched";
      const source = document.createElement("div");
      source.className = "cl-source-cell";
      source.textContent = restants.join(" ");
      const note = document.createElement("div");
      note.className = "cl-source-cell cl-unmatched-note";
      note.textContent = "Texte source restant sans segment correspondant — à vérifier avant génération.";
      unmatched.append(source, note);
      alignment.appendChild(unmatched);
    }
    body.appendChild(alignment);
    grid.append(labels, body);
    return grid;
  }

  function modeEditeur(book, chapter, cle) {
    const draft = chapterDrafts.get(cle) || { texte: null, titre: chapter.titre, dirty: false, savedAt: null };
    chapterDrafts.set(cle, draft);

    const edit = document.createElement("div");
    edit.className = "chapter-edit";
    edit.dataset.chapter = cle;
    edit.dataset.titre = chapter.titre;

    const head = document.createElement("div");
    head.className = "chapter-edit-head";
    const input = document.createElement("input");
    input.type = "text";
    input.className = "chapter-title-input";
    input.value = draft.titre;
    input.setAttribute("aria-label", "Titre du chapitre");
    input.placeholder = "Titre du chapitre";
    const stats = document.createElement("span");
    stats.className = "chapter-stats";
    head.append(input, stats);

    const legende = document.createElement("div");
    legende.className = "chapter-voices";
    legende.hidden = true;

    const textarea = document.createElement("textarea");
    textarea.className = "chapter-textarea";
    textarea.spellcheck = false;
    textarea.value = draft.texte ?? chapterTexts.get(cle) ?? "";
    textarea.disabled = !chapterTexts.has(cle) && draft.texte == null;

    const foot = document.createElement("div");
    foot.className = "chapter-edit-foot";
    const saveBtn = document.createElement("button");
    saveBtn.className = "pill-light";
    saveBtn.type = "button";
    saveBtn.textContent = "Enregistrer";
    const splitBtn = document.createElement("button");
    splitBtn.className = "pill-light";
    splitBtn.type = "button";
    splitBtn.textContent = "Scinder au curseur";
    splitBtn.title = "Coupe le chapitre en deux à la position du curseur (utile pour les EPUB au sommaire cassé)";
    const status = document.createElement("span");
    status.className = "chapter-status";
    foot.append(saveBtn, splitBtn, status);

    edit.append(head, legende, textarea, foot);

    let saving = false;
    const updateStats = () => {
      const mots = (textarea.value.match(/\S+/g) || []).length;
      stats.textContent = `${mots.toLocaleString("fr-FR")} mots · ${dureeEstimee(mots)}`;
      const ids = [...new Set([...textarea.value.matchAll(/^\/\/\/\s*([a-zA-Z0-9_-]+)\s+/gm)]
        .concat([...textarea.value.matchAll(/^\[([a-zA-Z0-9_-]+)\]\s*/gm)])
        .map((m) => m[1].toLowerCase()))];
      legende.textContent = "";
      legende.hidden = ids.length === 0;
      ids.forEach((id) => {
        const chip = document.createElement("span");
        chip.className = `cast-chip ${genreVoix(book.cast || [], id)}`;
        const role = genreVoix(book.cast || [], id);
        const symbole = role === "homme" ? "♂" : role === "femme" ? "♀" : role === "narrateur" ? "✓" : "·";
        const icone = document.createElement("i");
        icone.textContent = symbole;
        icone.setAttribute("aria-hidden", "true");
        chip.append(icone, document.createTextNode(nomVoix(book, id)));
        legende.appendChild(chip);
      });
    };
    const paintDirty = () => {
      const served = chapterTexts.get(cle);
      const dirty = served != null && (textarea.value !== served || input.value !== edit.dataset.titre);
      draft.texte = textarea.value;
      draft.titre = input.value;
      draft.dirty = dirty;
      if (dirty) draft.savedAt = null;
      saveBtn.disabled = saving || !dirty;
      status.textContent = dirty ? "Modifié — non enregistré"
                                 : (draft.savedAt ? "Enregistré" : "");
      status.className = `chapter-status ${dirty ? "dirty" : "saved"}`;
    };

    input.addEventListener("input", paintDirty);
    textarea.addEventListener("input", () => { updateStats(); paintDirty(); });
    textarea.addEventListener("keydown", (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        saveChapter();
      }
    });
    saveBtn.addEventListener("click", saveChapter);
    splitBtn.addEventListener("click", splitChapter);

    async function saveChapter() {
      if (saveBtn.disabled || saving) return;
      saving = true;
      saveBtn.disabled = true;
      status.textContent = "Enregistrement…";
      status.className = "chapter-status";
      try {
        const response = await fetch(`/api/livres/${book.id}/chapitre/${chapter.num}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ texte: textarea.value, titre: input.value }),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.detail || "enregistrement impossible");
        chapterTexts.set(cle, payload.texte);
        draft.texte = payload.texte;
        draft.titre = payload.titre;
        draft.dirty = false;
        draft.savedAt = Date.now();
        textarea.value = payload.texte;
        edit.dataset.titre = payload.titre;
        updateStats();
        paintDirty();
        notify("Chapitre enregistré");
        await refreshBooks();
      } catch (error) {
        notify(`Enregistrement impossible : ${error.message}`, "error");
        saving = false;
        paintDirty();
      }
    }

    async function splitChapter() {
      const position = textarea.selectionStart;
      if (!position || position >= textarea.value.length) {
        notify("Place le curseur à l'endroit où couper le chapitre.", "error");
        return;
      }
      if (!window.confirm("Scinder le chapitre à la position du curseur ?")) return;
      splitBtn.disabled = true;
      try {
        const response = await fetch(`/api/livres/${book.id}/chapitre/${chapter.num}/scinder`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ texte: textarea.value, position, titre1: input.value }),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.detail || "scission impossible");
        for (let num = chapter.num; num <= book.chapitres.length + 1; num += 1) {
          const ancienne = `${book.id}:${num}`;
          chapterTexts.delete(ancienne);
          chapterDrafts.delete(ancienne);
          modesChapitre.delete(ancienne);
        }
        chapitreOuvert = chapter.num + 1;
        notify("Chapitre scindé en deux.");
        await refreshBooks();
      } catch (error) {
        splitBtn.disabled = false;
        notify(`Scission impossible : ${error.message}`, "error");
      }
    }

    updateStats();
    paintDirty();
    return edit;
  }

  async function loadChapter(book, num) {
    const cle = `${book.id}:${num}`;
    if (chapterTexts.has(cle)) {
      chapterPainters.get(cle)?.();
      return;
    }
    const painter = chapterPainters.get(cle);
    if (painter) {
      const edit = document.querySelector(`.chapter-edit[data-chapter="${cle}"] textarea`);
      if (edit) edit.placeholder = "Chargement du chapitre…";
    }
    try {
      const response = await fetch(`/api/livres/${book.id}/chapitre/${num}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.detail || "chapitre indisponible");
      chapterTexts.set(cle, payload.texte);
      chapterSources.set(cle, payload.texte_source || payload.texte.replace(/^(?:\/\/\/\s*[a-zA-Z0-9_-]+\s+|\[[a-zA-Z0-9_-]+\]\s*)/gm, ""));
      chapterPainters.get(cle)?.();
    } catch (error) {
      const zone = document.querySelector(`.chapter-edit[data-chapter="${cle}"] textarea`);
      if (zone) zone.placeholder = `Chargement impossible : ${error.message}`;
      notify(`Chapitre indisponible : ${error.message}`, "error");
    }
  }

  function bindBooksEvents() {
    $("ajouterLivre").addEventListener("click", () => $("fichierLivre").click());
    $("fichierLivre").addEventListener("change", (event) => {
      const [file] = event.target.files || [];
      if (file) importBook(file);
      event.target.value = "";
    });
    $("iaEnregistrer").addEventListener("click", saveIaConfig);
    $("iaTester").addEventListener("click", testIa);
    $("iaNouveau").addEventListener("click", nouveauProfilIa);
    const drop = $("bookDrop");
    ["dragenter", "dragover"].forEach((name) => drop.addEventListener(name, (event) => {
      event.preventDefault();
      drop.classList.add("drag");
    }));
    ["dragleave", "drop"].forEach((name) => drop.addEventListener(name, (event) => {
      event.preventDefault();
      drop.classList.remove("drag");
    }));
    drop.addEventListener("drop", (event) => {
      const file = [...(event.dataTransfer?.files || [])].find((f) => /\.epub$/i.test(f.name));
      if (file) importBook(file);
      else notify("Dépose un fichier EPUB.", "error");
    });
  }

  /* ---------------------- État système & extinction ---------------------- */
  let engineLoading = false;

  function setEngineUI(system) {
    const labels = { dots: "dots.tts", qwen3: "Qwen3 · 0,6B", pocket: "Pocket TTS", voxcpm2: "VoxCPM2" };
    const label = labels[system.moteur] || system.moteur;
    $("modelPresence").innerHTML = `<i></i>${label}`;
    document.querySelectorAll(".engine").forEach((button) => {
      const active = button.dataset.moteur === system.moteur;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
      button.disabled = !system.modele && !system.erreur;
    });
  }

  async function refreshSystem() {
    if (shuttingDown) return;
    const labels = { dots: "dots.tts", qwen3: "Qwen3-TTS 0,6B", pocket: "Pocket TTS", voxcpm2: "VoxCPM2" };
    try {
      const system = await (await fetch("/api/etat")).json();
      const ancienMoteur = moteurActif;
      moteurActif = system.moteur || "";
      if (moteurActif !== ancienMoteur) refreshModeles();
      if (system.version) {
        $("version").textContent = system.version;
        $("versionFooter").textContent = system.version;
        $("versionReglages").textContent = system.version;
      }
      setPresence($("serverPresence"), "ready");
      setPresence($("modelPresence"), system.modele ? "ready" : "wait");
      setEngineUI(system);
      if (!generating) {
        if (system.erreur) {
          engineLoading = false;
          const recovery = $("recuperationMoteur");
          recovery.hidden = false;
          $("erreurMoteur").textContent = `Échec du chargement : ${system.erreur}.`;
          $("installerDependance").textContent = `Installer ${labels[system.moteur] || system.moteur}`;
          $("installerDependance").onclick = () => installerModele(system.moteur, true);
          setPanelStatus("Moteur indisponible — une installation est nécessaire.");
          setTakeStatus("Le moteur n’a pas pu démarrer. Installe le composant requis puis réessaie.", "error");
        } else if (!system.modele) {
          $("recuperationMoteur").hidden = true;
          engineLoading = true;
          const labels = { dots: "dots.tts", qwen3: "Qwen3-TTS 0,6B", pocket: "Pocket TTS", voxcpm2: "VoxCPM2" };
          setPanelStatus(`Chargement de ${labels[system.moteur] || system.moteur}…`, true);
        } else if (engineLoading) {
          $("recuperationMoteur").hidden = true;
          engineLoading = false;
          setPanelStatus(PANNEAU_AIDE);
          setTakeStatus("La cabine est prête — écris ton texte.");
        }
      }
    } catch (_) {
      setPresence($("serverPresence"), "");
      setPresence($("modelPresence"), "");
    }
  }

  async function switchEngine(moteur) {
    if (shuttingDown || generating) return;
    try {
      const response = await fetch("/api/moteur", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ moteur }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.detail || "changement impossible");
      engineLoading = true;
      const labels = { dots: "dots.tts", qwen3: "Qwen3-TTS 0,6B", pocket: "Pocket TTS", voxcpm2: "VoxCPM2" };
      setPanelStatus(`Chargement de ${labels[moteur] || moteur}…`, true);
      setTakeStatus("Changement de moteur en cours (~1-2 min)…");
      notify("Changement de moteur — le chargement prend une à deux minutes.");
      refreshSystem();
    } catch (error) {
      notify(`Changement impossible : ${error.message}`, "error");
    }
  }

  async function stopStudio() {
    if (shuttingDown || !window.confirm("Éteindre le studio ? Le modèle VoxCPM et toute prise en cours seront arrêtés pour libérer la mémoire.")) return;
    shuttingDown = true;
    $("stopStudio").disabled = true;
    $("stopLabel").textContent = "Libération…";
    updateGenerateState();
    setAddBusy(true);
    setTakeStatus("Arrêt du studio et libération du modèle…");
    try {
      const response = await fetch("/api/arreter", { method: "POST" });
      if (!response.ok) throw new Error("le serveur a refusé l'arrêt");
      clearInterval(systemTimer);
      clearInterval(recordingClock);
      recorder?.state === "recording" && recorder.stop();
      recordingStream?.getTracks().forEach((track) => track.stop());
      previewAudio.pause();
      $("resultat").pause();
      setPresence($("serverPresence"), "");
      setPresence($("modelPresence"), "");
      setTakeStatus("Studio éteint — le modèle est libéré.", "good");
      setVoiceStatus("Studio éteint.");
      $("stopLabel").textContent = "Studio éteint";
      notify("Studio éteint, modèle libéré.");
    } catch (error) {
      shuttingDown = false;
      $("stopStudio").disabled = false;
      $("stopLabel").textContent = "Éteindre";
      setAddBusy(false);
      updateGenerateState();
      setTakeStatus(`Arrêt impossible : ${error.message}`, "error");
    }
  }

  /* ---------------------- Init ---------------------- */
  function bindEvents() {
    $("ajouterFichier").addEventListener("click", () => $("fichier").click());
    $("ajouterMicro").addEventListener("click", toggleRecording);
    $("fichier").addEventListener("change", (event) => {
      if (event.target.files?.[0]) loadVoice(event.target.files[0]);
      event.target.value = "";
    });
    $("vitesse").addEventListener("input", updatePace);
    $("texte").addEventListener("input", () => {
      window.localStorage.setItem("pk-voice-studio-script", $("texte").value);
      updateEstimate();
      updateGenerateState();
    });
    $("generer").addEventListener("click", createTake);
    $("stopStudio").addEventListener("click", stopStudio);
    $("hfBouton").addEventListener("click", enregistrerHfToken);
    document.querySelectorAll(".engine").forEach((button) => {
      button.addEventListener("click", () => switchEngine(button.dataset.moteur));
    });
    bindPreviewEvents();
  }

  function init() {
    $("texte").value = window.localStorage.getItem("pk-voice-studio-script") || "";
    updatePace();
    bindEvents();
    bindBooksEvents();
    bindNavEvents();
    appliquerVue((location.hash || "#studio").slice(1), { pousserAncre: false });
    refreshVoices();
    refreshSystem();
    refreshModeles();
    refreshBooks();
    refreshAudios();
    loadIaConfig();
    systemTimer = setInterval(refreshSystem, 5000);
  }

  init();
})();
