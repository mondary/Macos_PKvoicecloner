/* PK Voice Studio
 * Scène de cabine de doublage Three.js + contrôles de clonage VoxCPM.
 * Three.js est servi localement depuis app/assets/three.min.js (source ThreeUI/MIT).
 */
(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const THREE = window.THREE;
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let speed = 1;
  let voiceReady = false;
  let generating = false;
  let recorder = null;
  let recordingStream = null;
  let recordingSeconds = 0;
  let recordingClock = null;
  let currentSourceUrl = null;
  let currentSourceFile = null;
  let currentResultUrl = null;
  let studioScene = null;

  /* ---------------------- Audio : énergie, aperçu, niveaux ---------------------- */
  const audio = {
    context: null,
    micAnalyser: null,
    micSource: null,
    previewAnalyser: null,
    previewSource: null,
    resultAnalyser: null,
    resultSource: null,
    frequency: new Uint8Array(128),

    ensureContext() {
      if (!this.context) {
        const Context = window.AudioContext || window.webkitAudioContext;
        this.context = new Context();
      }
      return this.context;
    },

    bindMediaElement(element, kind) {
      const keySource = `${kind}Source`;
      const keyAnalyser = `${kind}Analyser`;
      if (this[keyAnalyser]) return this[keyAnalyser];
      const context = this.ensureContext();
      const source = context.createMediaElementSource(element);
      const analyser = context.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.78;
      source.connect(analyser);
      analyser.connect(context.destination);
      this[keySource] = source;
      this[keyAnalyser] = analyser;
      return analyser;
    },

    bindMicrophone(stream) {
      const context = this.ensureContext();
      this.micSource = context.createMediaStreamSource(stream);
      this.micAnalyser = context.createAnalyser();
      this.micAnalyser.fftSize = 256;
      this.micAnalyser.smoothingTimeConstant = 0.58;
      this.micSource.connect(this.micAnalyser);
    },

    energy() {
      let analyser = this.micAnalyser;
      if (!analyser && !$("resultat").paused) analyser = this.resultAnalyser;
      if (!analyser && !$("voicePreview").paused) analyser = this.previewAnalyser;
      if (!analyser) return 0;
      if (this.frequency.length !== analyser.frequencyBinCount) this.frequency = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(this.frequency);
      const count = Math.min(32, this.frequency.length);
      let sum = 0;
      for (let i = 0; i < count; i += 1) sum += this.frequency[i] / 255;
      return Math.min(1, sum / count * 1.85);
    },

    stopMicrophone() {
      if (this.micSource) this.micSource.disconnect();
      if (this.micAnalyser) this.micAnalyser.disconnect();
      this.micSource = null;
      this.micAnalyser = null;
    },
  };

  /* ---------------------- Three.js : cabine, micro, lumière, audio ---------------------- */
  class VoiceBooth {
    constructor(host) {
      this.host = host;
      this.state = "idle";
      this.energy = 0;
      this.pointer = { x: 0, y: 0 };
      this.palette = {
        idle: new THREE.Color(0xbf8b4a),
        loading: new THREE.Color(0x9c7b68),
        recording: new THREE.Color(0xdf5d45),
        generating: new THREE.Color(0xe6ad59),
        ready: new THREE.Color(0x78ad86),
        playback: new THREE.Color(0xb783d3),
      };

      this.scene = new THREE.Scene();
      this.camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
      this.camera.position.set(0.8, 0.25, 8.6);

      this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      this.renderer.setClearColor(0x000000, 0);
      if ("outputColorSpace" in this.renderer && THREE.SRGBColorSpace) this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      else if ("outputEncoding" in this.renderer && THREE.sRGBEncoding) this.renderer.outputEncoding = THREE.sRGBEncoding;
      host.appendChild(this.renderer.domElement);

      this.world = new THREE.Group();
      this.scene.add(this.world);
      this.createRoom();
      this.createMicrophone();
      this.createSoundField();
      this.createLights();
      this.resize();

      window.addEventListener("resize", () => this.resize());
      window.addEventListener("pointermove", (event) => {
        this.pointer.x = (event.clientX / window.innerWidth - 0.5) * 2;
        this.pointer.y = (event.clientY / window.innerHeight - 0.5) * 2;
      }, { passive: true });

      window.__voiceStudioScene = this;
      if (prefersReducedMotion) this.render(0);
      else requestAnimationFrame((time) => this.animate(time));
    }

    createRoom() {
      const panelMaterial = new THREE.MeshStandardMaterial({ color: 0x251b18, roughness: 0.9, metalness: 0.03 });
      const trimMaterial = new THREE.MeshStandardMaterial({ color: 0x9b6945, roughness: 0.52, metalness: 0.55 });
      const floorMaterial = new THREE.MeshStandardMaterial({ color: 0x130f0e, roughness: 0.7, metalness: 0.12 });

      const floor = new THREE.Mesh(new THREE.PlaneGeometry(22, 13), floorMaterial);
      floor.rotation.x = -Math.PI / 2;
      floor.position.set(0, -2.5, -0.7);
      this.world.add(floor);

      const wall = new THREE.Mesh(new THREE.PlaneGeometry(14, 8), new THREE.MeshStandardMaterial({ color: 0x191311, roughness: 1, metalness: 0 }));
      wall.position.set(0, 0.7, -2.5);
      this.world.add(wall);

      this.panels = new THREE.Group();
      const panelGeometry = new THREE.BoxGeometry(1.48, 2.55, 0.12);
      for (let i = -3; i <= 3; i += 1) {
        const panel = new THREE.Mesh(panelGeometry, panelMaterial.clone());
        panel.position.set(i * 1.67, 0.65 + (Math.abs(i) % 2) * 0.1, -2.32);
        panel.rotation.y = i * -0.055;
        this.panels.add(panel);

        const trim = new THREE.Mesh(new THREE.BoxGeometry(1.54, 0.055, 0.15), trimMaterial);
        trim.position.set(panel.position.x, panel.position.y + 1.31, -2.2);
        trim.rotation.y = panel.rotation.y;
        this.panels.add(trim);
      }
      this.world.add(this.panels);

      const carpet = new THREE.Mesh(
        new THREE.CylinderGeometry(2.65, 2.85, 0.045, 80),
        new THREE.MeshStandardMaterial({ color: 0x3d2320, roughness: 0.95, metalness: 0 }),
      );
      carpet.position.set(0.5, -2.47, 0.1);
      this.world.add(carpet);
    }

    createMicrophone() {
      this.microphone = new THREE.Group();
      this.microphone.position.set(0.5, -0.4, 0.1);

      const chrome = new THREE.MeshStandardMaterial({ color: 0xe9d6c3, metalness: 0.9, roughness: 0.24 });
      const darkChrome = new THREE.MeshStandardMaterial({ color: 0x4c3730, metalness: 0.78, roughness: 0.3 });
      const grille = new THREE.MeshStandardMaterial({ color: 0xd0b49d, metalness: 0.86, roughness: 0.34 });

      const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 2.2, 20), darkChrome);
      stand.position.y = -1.1;
      this.microphone.add(stand);
      const base = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.18, 0.16, 52), darkChrome);
      base.position.y = -2.16;
      this.microphone.add(base);
      const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.73, 0.8, 0.09, 52), chrome);
      foot.position.y = -2.04;
      this.microphone.add(foot);

      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.47, 0.6, 2.15, 42), chrome);
      body.position.y = -0.3;
      this.microphone.add(body);
      const collar = new THREE.Mesh(new THREE.TorusGeometry(0.49, 0.042, 10, 42), darkChrome);
      collar.rotation.x = Math.PI / 2;
      collar.position.y = 0.7;
      this.microphone.add(collar);

      const head = new THREE.Mesh(new THREE.SphereGeometry(0.82, 44, 30), grille);
      head.scale.y = 1.18;
      head.position.y = 1.18;
      this.microphone.add(head);

      for (let y = 0.61; y < 1.8; y += 0.19) {
        const normalized = (y - 1.18) / 0.76;
        const radius = Math.max(0.35, 0.82 * Math.sqrt(Math.max(0.08, 1 - normalized * normalized)));
        const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.018, 8, 54), darkChrome);
        ring.rotation.x = Math.PI / 2;
        ring.position.y = y;
        this.microphone.add(ring);
      }

      const shock = new THREE.Group();
      for (let i = 0; i < 6; i += 1) {
        const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.82, 8), darkChrome);
        arm.position.y = 0.2;
        arm.rotation.z = Math.PI / 3;
        arm.rotation.y = i * Math.PI / 3;
        shock.add(arm);
      }
      shock.position.y = -0.7;
      this.microphone.add(shock);

      this.world.add(this.microphone);
    }

    createSoundField() {
      this.rings = [];
      this.ringMaterials = [];
      for (let i = 0; i < 4; i += 1) {
        const material = new THREE.MeshBasicMaterial({
          color: this.palette.idle,
          transparent: true,
          opacity: 0.23 - i * 0.035,
          depthWrite: false,
        });
        const ring = new THREE.Mesh(new THREE.TorusGeometry(1.22 + i * 0.47, 0.012, 8, 90), material);
        ring.rotation.x = Math.PI / 2;
        ring.position.set(0.5, -0.28, -0.2 - i * 0.12);
        this.rings.push(ring);
        this.ringMaterials.push(material);
        this.world.add(ring);
      }

      const count = 460;
      const positions = new Float32Array(count * 3);
      for (let i = 0; i < count; i += 1) {
        positions[i * 3] = (Math.random() - 0.5) * 12;
        positions[i * 3 + 1] = (Math.random() - 0.3) * 7;
        positions[i * 3 + 2] = -1.9 - Math.random() * 2.5;
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      this.particleMaterial = new THREE.PointsMaterial({ color: this.palette.idle, size: 0.028, transparent: true, opacity: 0.58, depthWrite: false });
      this.particles = new THREE.Points(geometry, this.particleMaterial);
      this.world.add(this.particles);

      this.bars = [];
      const barMaterial = new THREE.MeshStandardMaterial({ color: 0x72503b, metalness: 0.45, roughness: 0.4 });
      for (let i = 0; i < 17; i += 1) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(0.075, 1, 0.075), barMaterial.clone());
        bar.position.set(-1.85 + i * 0.16, -2.16, -1.4);
        bar.scale.y = 0.12;
        this.bars.push(bar);
        this.world.add(bar);
      }
    }

    createLights() {
      this.ambient = new THREE.AmbientLight(0xffdfc4, 0.5);
      this.keyLight = new THREE.PointLight(0xffc17a, 10, 16, 2);
      this.keyLight.position.set(3.7, 4.2, 4);
      this.fillLight = new THREE.PointLight(0xc58275, 6, 14, 2);
      this.fillLight.position.set(-3.5, 1.4, 2.5);
      this.rimLight = new THREE.PointLight(0xb9844f, 8, 12, 2);
      this.rimLight.position.set(0.4, 1.5, -0.6);
      this.world.add(this.ambient, this.keyLight, this.fillLight, this.rimLight);
    }

    setState(next) {
      this.state = next;
      const captions = {
        idle: "Micro prêt",
        loading: "Préparation de la voix",
        recording: "Enregistrement en cours",
        generating: "La prise se construit",
        ready: "Prise prête à écouter",
        playback: "Écoute de la prise",
      };
      $("threeCaption").textContent = captions[next] || captions.idle;
      $("sceneMode").textContent = (next === "generating" ? "en rendu" : next === "recording" ? "enregistrement" : next === "ready" ? "prête" : "au repos");
    }

    resize() {
      const width = this.host.clientWidth || window.innerWidth;
      const height = this.host.clientHeight || window.innerHeight;
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(width, height, false);
    }

    animate(time) {
      this.render(time);
      requestAnimationFrame((next) => this.animate(next));
    }

    render(time) {
      const seconds = time * 0.001;
      const actualEnergy = audio.energy();
      const generatedPulse = this.state === "generating" ? 0.18 + Math.sin(seconds * 6.4) * 0.08 : 0;
      const targetEnergy = Math.max(actualEnergy, generatedPulse);
      this.energy = THREE.MathUtils.lerp(this.energy, targetEnergy, 0.11);
      const colour = this.palette[this.state] || this.palette.idle;

      this.microphone.rotation.y = Math.sin(seconds * 0.34) * 0.1 + this.pointer.x * 0.08;
      this.microphone.rotation.z = Math.sin(seconds * 0.56) * 0.012;
      this.microphone.position.y = -0.4 + Math.sin(seconds * 0.9) * (0.025 + this.energy * 0.05);
      this.panels.rotation.y = Math.sin(seconds * 0.12) * 0.018;
      this.particles.rotation.y = seconds * 0.018;
      this.particles.rotation.z = Math.sin(seconds * 0.1) * 0.012;

      this.rings.forEach((ring, index) => {
        const phase = seconds * (this.state === "generating" ? 2.0 : 0.56) + index * 0.8;
        const breath = 1 + Math.sin(phase) * 0.025 + this.energy * (0.17 + index * 0.04);
        ring.scale.setScalar(breath);
        ring.rotation.z = phase * 0.04;
        this.ringMaterials[index].color.lerp(colour, 0.06);
        this.ringMaterials[index].opacity = 0.08 + this.energy * 0.22 + (this.state === "generating" ? 0.08 : 0);
      });

      this.particleMaterial.color.lerp(colour, 0.045);
      this.particleMaterial.opacity = 0.34 + this.energy * 0.35;
      this.keyLight.color.lerp(colour, 0.035);
      this.keyLight.intensity = 8 + this.energy * 10 + (this.state === "generating" ? 3 : 0);
      this.fillLight.intensity = 4.5 + this.energy * 3;
      this.rimLight.color.lerp(colour, 0.04);

      this.bars.forEach((bar, index) => {
        const oscillation = Math.sin(seconds * 2.6 + index * 0.72) * 0.09;
        const height = 0.1 + this.energy * (0.2 + (index % 4) * 0.12) + oscillation + (this.state === "generating" ? 0.12 : 0);
        bar.scale.y = Math.max(0.08, height);
        bar.position.y = -2.2 + bar.scale.y * 0.5;
        bar.material.color.lerp(colour, 0.035);
      });

      this.camera.position.x = THREE.MathUtils.lerp(this.camera.position.x, 0.8 + this.pointer.x * 0.26, 0.025);
      this.camera.position.y = THREE.MathUtils.lerp(this.camera.position.y, 0.25 - this.pointer.y * 0.16, 0.025);
      this.camera.lookAt(0.5, -0.25, -0.2);
      this.renderer.render(this.scene, this.camera);
    }
  }

  function initScene() {
    if (!THREE) {
      $("threeCaption").textContent = "Prévisualisation indisponible";
      return;
    }
    try {
      studioScene = new VoiceBooth($("three-stage"));
    } catch (error) {
      console.error("Three.js scene failed", error);
      $("threeCaption").textContent = "Prévisualisation indisponible";
    }
  }

  function setStudioState(state) {
    studioScene?.setState(state);
  }

  /* ---------------------- Interface studio ---------------------- */
  function setPresence(element, state) {
    element.className = `presence ${state}`;
  }

  function setVoiceStatus(message, tone = "") {
    const target = $("etatVoix");
    target.textContent = message;
    target.className = `take-state ${tone}`;
  }

  function setTakeStatus(message, tone = "") {
    const target = $("etatGen");
    target.textContent = message;
    target.className = `take-state ${tone}`;
  }

  function formatTime(seconds) {
    const value = Math.max(0, Math.round(seconds));
    return value >= 60 ? `${Math.floor(value / 60)} min ${String(value % 60).padStart(2, "0")} s` : `${value} s`;
  }

  function updatePace() {
    speed = Number($("vitesse").value);
    const fill = ((speed - 0.75) / (1.5 - 0.75)) * 100;
    $("vitesse").style.setProperty("--pace-fill", `${fill}%`);
    $("vitesseVal").textContent = `${speed.toFixed(2)} ×`;
    updateEstimate();
  }

  function updateEstimate() {
    const text = $("texte").value.trim();
    if (!text) {
      $("estimation").textContent = "—";
      return;
    }
    const audibleSeconds = text.length / 15;
    const renderSeconds = audibleSeconds * 15 / speed;
    $("estimation").textContent = `≈ ${formatTime(renderSeconds)}`;
  }

  function prepareCanvas(canvas) {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.round(rect.width * ratio));
    canvas.height = Math.max(1, Math.round(rect.height * ratio));
    return canvas.getContext("2d");
  }

  function drawIdleWave() {
    const canvas = $("ondeVoix");
    const context = prepareCanvas(canvas);
    context.fillStyle = "#e9ddd0";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = "rgba(93, 72, 60, .24)";
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(0, canvas.height / 2);
    context.lineTo(canvas.width, canvas.height / 2);
    context.stroke();
  }

  async function drawWaveform(file) {
    const canvas = $("ondeVoix");
    const context = prepareCanvas(canvas);
    context.fillStyle = "#e9ddd0";
    context.fillRect(0, 0, canvas.width, canvas.height);
    try {
      const audioContext = audio.ensureContext();
      const data = await file.arrayBuffer();
      const buffer = await audioContext.decodeAudioData(data.slice(0));
      const channel = buffer.getChannelData(0);
      const columns = Math.max(2, Math.floor(canvas.width / 2));
      const step = Math.max(1, Math.floor(channel.length / columns));
      context.strokeStyle = "#b94b38";
      context.lineWidth = Math.max(1, window.devicePixelRatio || 1);
      context.beginPath();
      for (let x = 0; x < columns; x += 1) {
        const start = x * step;
        let min = 1;
        let max = -1;
        for (let i = 0; i < step && start + i < channel.length; i += 1) {
          const sample = channel[start + i];
          min = Math.min(min, sample);
          max = Math.max(max, sample);
        }
        const y1 = (1 - (max + 1) / 2) * canvas.height;
        const y2 = (1 - (min + 1) / 2) * canvas.height;
        context.moveTo(x * 2, y1);
        context.lineTo(x * 2, y2);
      }
      context.stroke();
    } catch (error) {
      // Certains codecs navigateur ne se décodent pas en Web Audio. Le backend les accepte quand même.
      drawIdleWave();
    }
  }

  function makeMeter() {
    const meter = $("meter");
    for (let i = 0; i < 22; i += 1) {
      const bar = document.createElement("i");
      meter.appendChild(bar);
    }
  }

  function renderMeter() {
    const bars = $("meter").children;
    const energy = audio.energy();
    const live = Math.round(energy * bars.length);
    for (let index = 0; index < bars.length; index += 1) {
      const active = index < live;
      bars[index].style.height = active ? `${22 + ((index + 1) / bars.length) * 78}%` : "12%";
      bars[index].classList.toggle("hot", active && index > bars.length * 0.72);
    }
    if (!prefersReducedMotion) requestAnimationFrame(renderMeter);
  }

  async function refreshSystem() {
    try {
      const response = await fetch("/api/etat");
      const system = await response.json();
      setPresence($("serverPresence"), "ready");
      setPresence($("modelPresence"), system.modele ? "ready" : "wait");
    } catch (error) {
      setPresence($("serverPresence"), "");
      setPresence($("modelPresence"), "");
    }
  }

  function setSourcePreview(file) {
    if (currentSourceUrl) URL.revokeObjectURL(currentSourceUrl);
    currentSourceUrl = URL.createObjectURL(file);
    const preview = $("voicePreview");
    preview.src = currentSourceUrl;
    preview.hidden = false;
  }

  async function loadVoice(file) {
    currentSourceFile = file;
    voiceReady = false;
    $("generer").disabled = true;
    $("sourceName").textContent = file.name || "Enregistrement direct";
    $("takeName").textContent = file.name || "Nouvelle voix";
    $("sourceDuration").textContent = "analyse…";
    setVoiceStatus("Préparation du clip et de son transcript…");
    setStudioState("loading");
    setSourcePreview(file);
    drawWaveform(file);

    try {
      const form = new FormData();
      form.append("audio", file);
      const response = await fetch("/api/voix", { method: "POST", body: form });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.detail || "Import impossible");
      $("transcript").value = payload.transcript;
      $("sourceDuration").textContent = `${payload.duree} s`;
      $("takeName").textContent = payload.source;
      setVoiceStatus(`Voix prête · ${payload.duree} s de référence`, "good");
      voiceReady = true;
      $("generer").disabled = !$("texte").value.trim();
      setStudioState("ready");
    } catch (error) {
      setVoiceStatus(`Import impossible : ${error.message}`, "error");
      $("sourceDuration").textContent = "—";
      setStudioState("idle");
    }
  }

  async function beginRecording() {
    if (recorder?.state === "recording") {
      recorder.stop();
      return;
    }
    try {
      recordingStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audio.ensureContext().resume();
      audio.bindMicrophone(recordingStream);
      const mimeType = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm"].find((type) => MediaRecorder.isTypeSupported(type));
      const chunks = [];
      recorder = new MediaRecorder(recordingStream, mimeType ? { mimeType } : undefined);
      recorder.addEventListener("dataavailable", (event) => chunks.push(event.data));
      recorder.addEventListener("stop", () => {
        clearInterval(recordingClock);
        recordingStream?.getTracks().forEach((track) => track.stop());
        recordingStream = null;
        audio.stopMicrophone();
        $("micro").classList.remove("recording");
        $("micro").innerHTML = '<span class="record-dot"></span>Enregistrer';
        const ext = (recorder.mimeType || "").includes("mp4") ? "m4a" : "webm";
        const file = new File(chunks, `prise-${new Date().toISOString().slice(11, 19).replaceAll(":", "")}.${ext}`, { type: recorder.mimeType });
        loadVoice(file);
      }, { once: true });
      recorder.start();
      recordingSeconds = 0;
      recordingClock = setInterval(() => {
        recordingSeconds += 1;
        setVoiceStatus(`Enregistrement en cours · ${recordingSeconds} s`, "error");
      }, 1000);
      $("micro").classList.add("recording");
      $("micro").textContent = "Arrêter la prise";
      setVoiceStatus("Enregistrement en cours · 0 s", "error");
      setStudioState("recording");
    } catch (error) {
      setVoiceStatus(`Micro indisponible : ${error.message}`, "error");
      setStudioState("idle");
    }
  }

  function bindPlayer(element, kind) {
    element.addEventListener("play", () => {
      audio.ensureContext().resume();
      audio.bindMediaElement(element, kind);
      if (!generating) setStudioState("playback");
    });
    element.addEventListener("pause", () => {
      if (!generating && voiceReady) setStudioState("ready");
    });
    element.addEventListener("ended", () => {
      if (!generating && voiceReady) setStudioState("ready");
    });
  }

  async function createTake() {
    const text = $("texte").value.trim();
    if (!voiceReady || !text || generating) return;
    generating = true;
    $("generer").disabled = true;
    $("resultPanel").classList.remove("show");
    $("progress").style.width = "0%";
    setTakeStatus("La prise entre en cabine…");
    setStudioState("generating");

    try {
      const response = await fetch("/api/generer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texte: text, vitesse: speed, transcript: $("transcript").value }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.detail || "Génération impossible");
      await watchTake(payload.job, text);
    } catch (error) {
      generating = false;
      $("generer").disabled = false;
      setTakeStatus(`Erreur : ${error.message}`, "error");
      setStudioState(voiceReady ? "ready" : "idle");
    }
  }

  async function watchTake(jobId, text) {
    const predicted = Math.max(45, text.length / 15 * 15 / speed);
    const timer = setInterval(async () => {
      try {
        const response = await fetch(`/api/job/${jobId}`);
        const job = await response.json();
        const elapsed = job.ecoule || 0;
        $("progress").style.width = `${Math.min(96, Math.round(elapsed / (predicted + 24) * 100))}%`;
        if (job.etat === "chargement") setTakeStatus(`Le modèle chauffe la cabine · ${elapsed} s`);
        else if (job.etat === "generation") setTakeStatus(`La prise se construit · ${elapsed} s écoulées`);
        if (job.etat === "erreur") throw new Error(job.erreur || "Rendu interrompu");
        if (job.etat !== "pret") return;

        clearInterval(timer);
        generating = false;
        $("progress").style.width = "100%";
        window.setTimeout(() => { $("progress").style.width = "0%"; }, 1000);
        $("generer").disabled = false;
        currentResultUrl = `/api/audio/${job.fichier}`;
        $("resultat").src = currentResultUrl;
        $("telecharger").href = currentResultUrl;
        $("resultPanel").classList.add("show");
        setTakeStatus(`Prise finalisée · ${job.duree} s`, "good");
        setStudioState("ready");
        try { await $("resultat").play(); } catch (_) { /* le lecteur reste disponible si l'autoplay est bloqué */ }
      } catch (error) {
        clearInterval(timer);
        generating = false;
        $("generer").disabled = false;
        $("progress").style.width = "0%";
        setTakeStatus(`Erreur : ${error.message}`, "error");
        setStudioState(voiceReady ? "ready" : "idle");
      }
    }, 1800);
  }

  function bindEvents() {
    $("choisir").addEventListener("click", () => $("fichier").click());
    $("fichier").addEventListener("change", (event) => {
      if (event.target.files?.[0]) loadVoice(event.target.files[0]);
    });
    $("micro").addEventListener("click", beginRecording);
    $("vitesse").addEventListener("input", updatePace);
    $("texte").addEventListener("input", () => {
      window.localStorage.setItem("pk-voice-studio-script", $("texte").value);
      updateEstimate();
      if (voiceReady && !generating) $("generer").disabled = !$("texte").value.trim();
    });
    $("generer").addEventListener("click", createTake);
    bindPlayer($("voicePreview"), "preview");
    bindPlayer($("resultat"), "result");
    window.addEventListener("resize", () => {
      if (currentSourceFile) drawWaveform(currentSourceFile);
      else drawIdleWave();
    }, { passive: true });
  }

  function init() {
    $("texte").value = window.localStorage.getItem("pk-voice-studio-script") || "";
    makeMeter();
    drawIdleWave();
    updatePace();
    bindEvents();
    initScene();
    if (!prefersReducedMotion) requestAnimationFrame(renderMeter);
    refreshSystem();
    window.setInterval(refreshSystem, 5000);
    window.setInterval(() => { $("clock").textContent = new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }); }, 1000);
  }

  init();
})();
