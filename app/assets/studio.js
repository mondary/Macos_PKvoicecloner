/* PK Voice Studio v2 — bibliothèque de voix + éditeur texte → voix.
 * Tout tourne contre le serveur local FastAPI (voir app/serveur.py).
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

  /* ---------------------- État système & extinction ---------------------- */
  let engineLoading = false;

  function setEngineUI(system) {
    const label = system.moteur === "dots" ? "dots.tts" : "VoxCPM2";
    $("modelPresence").innerHTML = `<i></i>${label}`;
    document.querySelectorAll(".engine").forEach((button) => {
      const active = button.dataset.moteur === system.moteur;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
      button.disabled = !system.modele;
    });
  }

  async function refreshSystem() {
    if (shuttingDown) return;
    try {
      const system = await (await fetch("/api/etat")).json();
      setPresence($("serverPresence"), "ready");
      setPresence($("modelPresence"), system.modele ? "ready" : "wait");
      setEngineUI(system);
      if (!generating) {
        if (!system.modele) {
          engineLoading = true;
          setPanelStatus(`Chargement de ${system.moteur === "dots" ? "dots.tts" : "VoxCPM2"}…`, true);
        } else if (engineLoading) {
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
      setPanelStatus(moteur === "dots" ? "Chargement de dots.tts…" : "Chargement de VoxCPM2…", true);
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
    refreshVoices();
    refreshSystem();
    systemTimer = setInterval(refreshSystem, 5000);
  }

  init();
})();
