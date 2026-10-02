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
  };
  let vueActive = "studio";

  function appliquerVue(id, { pousserAncre = true } = {}) {
    if (!VUES[id]) id = "studio";
    vueActive = id;
    const accueil = id === "studio";
    const panneau = document.querySelector(".demo-panel");
    document.querySelector(".hero").hidden = !accueil;
    document.querySelector(".dashboard-stats").hidden = !accueil;
    panneau.hidden = !(accueil || id === "voices" || id === "editor");
    const stage = document.querySelector(".demo-stage");
    stage.classList.toggle("only-voices", id === "voices");
    stage.classList.toggle("only-editor", id === "editor");
    $("books").hidden = id !== "books";
    $("models").hidden = id !== "models";
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
    previewAudio.addEventListener("play", () => { $("resultat").pause(); paintPlayButtons(); });
    previewAudio.addEventListener("pause", paintPlayButtons);
    previewAudio.addEventListener("ended", paintPlayButtons);
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
  async function refreshModeles() {
    if (shuttingDown) return;
    let payload;
    try {
      payload = await (await fetch("/api/modeles")).json();
    } catch (_) {
      return;
    }
    const list = $("modelesList");
    list.textContent = "";
    let enCours = false;
    (payload.modeles || []).forEach((m) => {
      if (m.core) return; // moteurs de base : gérés hors du panneau « à tester »
      const row = document.createElement("div");
      row.className = "model-item";
      const link = document.createElement("a");
      link.href = `https://huggingface.co/${m.repo}`;
      link.target = "_blank";
      link.rel = "noopener";
      link.textContent = `${m.label} · ${m.taille}`;
      const btn = document.createElement("button");
      btn.className = "model-delete";
      btn.type = "button";
      if (m.etat === "en_cours") {
        btn.textContent = "Installation…";
        btn.disabled = true;
        enCours = true;
      } else if (m.installe) {
        btn.textContent = "Supprimer";
        btn.addEventListener("click", () => supprimerModele(m.id));
      } else {
        btn.textContent = m.etat === "erreur" ? "Réessayer" : "Installer";
        if (m.etat === "erreur") btn.title = `Échec : ${m.erreur || "erreur"} — clique pour réessayer`;
        btn.addEventListener("click", () => installerModele(m.id));
      }
      row.append(link, btn);
      list.appendChild(row);
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
            await switchEngine(id);
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

  /* ---------------------- Livres & audiobooks ---------------------- */
  let books = [];
  let openBook = null;
  const openChapters = new Set();
  const chapterTexts = new Map();    // "id:num" -> texte servi par le serveur
  const chapterDrafts = new Map();   // "id:num" -> {texte, titre, dirty, savedAt}
  const chapterPainters = new Map(); // "id:num" -> rafraîchit l'éditeur affiché
  const analysesVues = new Set();    // id des livres dont l'analyse terminée a purgé le cache
  const BOOKS_HINT = "Dépose un EPUB : découpé en chapitres sur ce Mac, prêt à être narré.";
  const MOTS_PAR_MINUTE = 160;       // débit de narration d'un audiobook français

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
      if (openBook === book.id) openBook = null;
      [...openChapters].filter((cle) => cle.startsWith(`${book.id}:`)).forEach((cle) => {
        openChapters.delete(cle);
        chapterTexts.delete(cle);
        chapterDrafts.delete(cle);
      });
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

  async function loadIaConfig() {
    try {
      const payload = await (await fetch("/api/ia/config")).json();
      $("iaUrl").value = payload.base_url || "";
      $("iaModele").value = payload.modele || "";
      if (payload.configuree) {
        $("iaCle").placeholder = `${payload.cle_masquee || "•••"} — laisse vide pour conserver`;
        setIaStatut("IA configurée.", "saved");
      }
    } catch (_) { /* serveur absent : silencieux */ }
  }

  async function saveIaConfig() {
    const corps = { base_url: $("iaUrl").value.trim(), modele: $("iaModele").value.trim() };
    const cle = $("iaCle").value.trim();
    if (cle) corps.cle = cle;
    setIaStatut("Enregistrement…");
    $("iaEnregistrer").disabled = true;
    try {
      const response = await fetch("/api/ia/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corps),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.detail || "enregistrement impossible");
      $("iaCle").value = "";
      setIaStatut("Configuration enregistrée.", "saved");
      notify("Configuration IA enregistrée.");
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
      const response = await fetch("/api/ia/tester", { method: "POST" });
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
    if (analyse.etat === "en_cours") {
      const barre = document.createElement("div");
      barre.className = "analyse-barre";
      const remplissage = document.createElement("i");
      const total = analyse.total || 1;
      remplissage.style.width = `${Math.round(((analyse.courant || 0) / total) * 100)}%`;
      barre.appendChild(remplissage);
      const texte = document.createElement("div");
      texte.className = "chapter-stats";
      texte.textContent = `Analyse IA en cours · chapitre ${analyse.courant || 0}/${total}`;
      zone.append(texte, barre);
    } else if (analyse.etat === "erreur") {
      const erreur = document.createElement("div");
      erreur.className = "analyse-erreur";
      erreur.textContent = `Analyse interrompue : ${analyse.erreur || "erreur inconnue"}`;
      zone.appendChild(erreur);
    } else if (analyse.etat === "faite") {
      const fait = document.createElement("div");
      fait.className = "chapter-stats";
      const analysees = book.chapitres.filter((c) => c.analyse === "faite").length;
      fait.textContent = `${book.cast.length} voix · ${analysees}/${book.chapitres.length} chapitres analysés`;
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
    const list = $("bookList");
    list.textContent = "";
    books.forEach((book) => {
      // une analyse qui vient de se terminer : les textes servis ont changé (tags)
      if (book.analyse?.etat === "faite" && !analysesVues.has(book.id)) {
        analysesVues.add(book.id);
        book.chapitres.forEach((c) => {
          chapterTexts.delete(`${book.id}:${c.num}`);
          chapterDrafts.delete(`${book.id}:${c.num}`);
        });
      }
      list.appendChild(bookCard(book));
    });
    if (books.some((b) => b.analyse?.etat === "en_cours")) surveillerAnalyses();
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
    title.title = `${book.titre} — double-clic pour renommer`;
    title.addEventListener("dblclick", () => renameBook(book, title));
    const author = document.createElement("div");
    author.className = "book-author";
    author.textContent = book.auteur || "Auteur inconnu";
    const meta = document.createElement("div");
    meta.className = "book-meta";
    const date = book.importe ? new Date(book.importe).toLocaleDateString("fr-FR") : "";
    meta.textContent = `${book.chapitres.length} chapitres · ${book.mots.toLocaleString("fr-FR")} mots · ` +
                       `${dureeEstimee(book.mots)} d'audio${date ? ` · ${date}` : ""}`;
    info.append(title, author, meta);
    if (book.cast?.length) info.append(castChips(book, 8));
    info.appendChild(analyseZone(book));

    const actions = document.createElement("div");
    actions.className = "book-actions";
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
    const chaptersBtn = document.createElement("button");
    chaptersBtn.className = "pill-light";
    chaptersBtn.type = "button";
    chaptersBtn.textContent = openBook === book.id ? "Replier" : "Chapitres";
    chaptersBtn.addEventListener("click", () => {
      openBook = openBook === book.id ? null : book.id;
      renderBooks();
    });
    const del = document.createElement("button");
    del.className = "icon-btn";
    del.type = "button";
    del.setAttribute("aria-label", `Supprimer « ${book.titre} »`);
    del.innerHTML = ICON_TRASH;
    del.addEventListener("click", () => deleteBook(book));
    actions.append(analyseBtn, chaptersBtn, del);

    card.append(cover, info, actions);
    if (openBook === book.id) {
      const chapters = document.createElement("div");
      chapters.className = "chapter-list";
      book.chapitres.forEach((chapter) => chapters.appendChild(chapterBlock(book, chapter)));
      const wrapper = document.createElement("div");
      wrapper.className = "book-chapters";
      wrapper.appendChild(chapters);
      card.appendChild(wrapper);
    }
    return card;
  }

  function chapterBlock(book, chapter) {
    const cle = `${book.id}:${chapter.num}`;
    const block = document.createElement("div");
    block.className = "chapter-bloc";
    block.dataset.chapter = cle;

    const row = document.createElement("div");
    row.className = "chapter-row";
    row.tabIndex = 0;
    row.setAttribute("role", "button");
    row.setAttribute("aria-expanded", String(openChapters.has(cle)));
    row.innerHTML =
      `<span class="chapter-num">${String(chapter.num).padStart(2, "0")}</span>` +
      `<span class="chapter-title"></span>` +
      `<span class="chapter-words">${chapter.mots.toLocaleString("fr-FR")} mots · ${dureeEstimee(chapter.mots)}` +
      `${chapter.voix?.length ? ` · ${chapter.voix.length} voix` : ""}</span>`;
    row.querySelector(".chapter-title").textContent = chapter.titre;
    const toggle = () => {
      if (openChapters.has(cle)) {
        if (chapterDrafts.get(cle)?.dirty &&
            !window.confirm("Des modifications ne sont pas enregistrées. Fermer quand même le chapitre ?")) return;
        openChapters.delete(cle);
      } else {
        openChapters.add(cle);
      }
      renderBooks();
      if (openChapters.has(cle)) loadChapter(book, chapter.num);
    };
    row.addEventListener("click", toggle);
    row.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") { event.preventDefault(); toggle(); }
    });
    block.appendChild(row);

    if (openChapters.has(cle)) block.appendChild(chapterEditor(book, chapter, cle));
    return block;
  }

  function chapterEditor(book, chapter, cle) {
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
    const analyseBtn = document.createElement("button");
    analyseBtn.className = "pill-light";
    analyseBtn.type = "button";
    analyseBtn.textContent = chapter.analyse === "faite" ? "Réanalyser ce chapitre" : "Analyser ce chapitre";
    analyseBtn.title = "Envoie ce chapitre à l'IA pour attribuer les voix ligne par ligne";
    analyseBtn.addEventListener("click", () => analyzeBook(book, {
      chapitre: chapter.num, forcer: chapter.analyse === "faite",
    }));
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
    foot.append(analyseBtn, saveBtn, splitBtn, status);

    edit.append(head, legende, textarea, foot);

    let saving = false;
    const updateStats = () => {
      const mots = (textarea.value.match(/\S+/g) || []).length;
      stats.textContent = `${mots.toLocaleString("fr-FR")} mots · ${dureeEstimee(mots)}`;
      const ids = [...new Set([...textarea.value.matchAll(/^\[([a-z0-9_-]+)\]/gm)].map((m) => m[1].toLowerCase()))];
      legende.textContent = "";
      legende.hidden = ids.length === 0;
      ids.forEach((id) => {
        const voice = (book.cast || []).find((v) => v.id === id);
        const chip = document.createElement("span");
        chip.className = `cast-chip ${voice?.genre || "indetermine"}`;
        const symbole = voice?.genre === "homme" ? "♂" : voice?.genre === "femme" ? "♀" : "·";
        const icone = document.createElement("i");
        icone.textContent = symbole;
        icone.setAttribute("aria-hidden", "true");
        chip.append(icone, document.createTextNode(voice?.nom || id));
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
          openChapters.delete(ancienne);
        }
        openChapters.add(`${book.id}:${chapter.num + 1}`);
        notify("Chapitre scindé en deux.");
        await refreshBooks();
      } catch (error) {
        splitBtn.disabled = false;
        notify(`Scission impossible : ${error.message}`, "error");
      }
    }

    chapterPainters.set(cle, () => {
      textarea.value = chapterTexts.get(cle) ?? "";
      textarea.disabled = false;
      draft.texte = textarea.value;
      updateStats();
      paintDirty();
    });
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
      if (system.version) $("version").textContent = system.version;
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
    loadIaConfig();
    systemTimer = setInterval(refreshSystem, 5000);
  }

  init();
})();
