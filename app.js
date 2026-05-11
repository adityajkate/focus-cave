(() => {
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  const STORE_PREFIX = "focus-cave-v1";
  const PRESENCE_TIMEOUT = 9000;
  const HEARTBEAT_MS = 2200;
  const TICK_MS = 250;
  const RING_LENGTH = 640.88;

  const state = {
    id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
    displayName: "",
    room: "moon-den",
    stream: "chill",
    audioOn: false,
    audio: null,
    channel: null,
    tasks: [],
    presence: {},
    vibe: "tokyo",
    shared: true,
    timer: defaultTimer(),
    soloTimer: defaultTimer(),
    streaks: loadJSON(`${STORE_PREFIX}:streaks`, {}),
  };

  const els = {
    displayName: $("#displayName"),
    roomName: $("#roomName"),
    joinRoomBtn: $("#joinRoomBtn"),
    roomTitle: $("#roomTitle"),
    syncPill: $("#syncPill"),
    phaseLabel: $("#phaseLabel"),
    timeLeft: $("#timeLeft"),
    timerStatus: $("#timerStatus"),
    progressRing: $("#progressRing"),
    startPauseBtn: $("#startPauseBtn"),
    resetBtn: $("#resetBtn"),
    skipBtn: $("#skipBtn"),
    focusMinutes: $("#focusMinutes"),
    breakMinutes: $("#breakMinutes"),
    sharedMode: $("#sharedMode"),
    streamGrid: $("#streamGrid"),
    masterAudioBtn: $("#masterAudioBtn"),
    masterVolume: $("#masterVolume"),
    nowPlaying: $("#nowPlaying"),
    taskForm: $("#taskForm"),
    taskInput: $("#taskInput"),
    taskList: $("#taskList"),
    taskCount: $("#taskCount"),
    presenceList: $("#presenceList"),
    presenceCount: $("#presenceCount"),
    clearAmbientBtn: $("#clearAmbientBtn"),
    streakBadge: $("#streakBadge"),
    todaySessions: $("#todaySessions"),
    weekSessions: $("#weekSessions"),
    totalSessions: $("#totalSessions"),
    weekDots: $("#weekDots"),
    vibeGrid: $("#vibeGrid"),
    breakModal: $("#breakModal"),
    closeBreakBtn: $("#closeBreakBtn"),
    breakTitle: $("#breakTitle"),
    breakMessage: $("#breakMessage"),
    taskTemplate: $("#taskTemplate"),
    presenceTemplate: $("#presenceTemplate"),
  };

  boot();

  function boot() {
    state.displayName = localStorage.getItem(`${STORE_PREFIX}:displayName`) || randomName();
    state.room = normalizeRoom(new URLSearchParams(location.search).get("room") || localStorage.getItem(`${STORE_PREFIX}:room`) || "moon-den");
    state.vibe = localStorage.getItem(`${STORE_PREFIX}:vibe`) || "tokyo";
    state.stream = localStorage.getItem(`${STORE_PREFIX}:stream`) || "chill";
    state.shared = localStorage.getItem(`${STORE_PREFIX}:shared`) !== "false";

    els.displayName.value = state.displayName;
    els.roomName.value = state.room;
    els.sharedMode.checked = state.shared;
    document.body.dataset.vibe = state.vibe;

    els.progressRing.style.strokeDasharray = RING_LENGTH;
    setActiveButton(".vibe", "vibe", state.vibe);
    setActiveButton(".stream", "stream", state.stream);
    switchRoom(state.room, { replaceUrl: true });

    bindEvents();
    renderAll();
    tick();
    setInterval(tick, TICK_MS);
    setInterval(sendPresence, HEARTBEAT_MS);
    window.addEventListener("beforeunload", () => {
      removeSelfPresence();
      broadcast({ type: "presence-left", id: state.id });
    });
  }

  function bindEvents() {
    els.joinRoomBtn.addEventListener("click", () => switchRoom(els.roomName.value));
    els.roomName.addEventListener("keydown", event => {
      if (event.key === "Enter") switchRoom(els.roomName.value);
    });

    els.displayName.addEventListener("input", () => {
      state.displayName = els.displayName.value.trim() || "Quiet Owl";
      localStorage.setItem(`${STORE_PREFIX}:displayName`, state.displayName);
      sendPresence();
      renderPresence();
    });

    els.sharedMode.addEventListener("change", () => {
      state.shared = els.sharedMode.checked;
      localStorage.setItem(`${STORE_PREFIX}:shared`, String(state.shared));
      if (!state.shared) {
        state.soloTimer = cloneTimer(getActiveTimer());
      } else {
        publishTimer("sync-mode");
      }
      renderTimer();
      renderSyncPill();
      sendPresence();
    });

    [els.focusMinutes, els.breakMinutes].forEach(input => {
      input.addEventListener("change", () => {
        sanitizeDurations();
        const timer = getActiveTimer();
        if (!timer.running) resetTimer(false);
      });
    });

    els.startPauseBtn.addEventListener("click", toggleTimer);
    els.resetBtn.addEventListener("click", () => resetTimer(true));
    els.skipBtn.addEventListener("click", () => completePhase("manual-skip"));

    els.masterAudioBtn.addEventListener("click", toggleAudio);
    els.masterVolume.addEventListener("input", () => {
      ensureAudio();
      state.audio.master.gain.setTargetAtTime(Number(els.masterVolume.value), state.audio.ctx.currentTime, 0.03);
    });

    els.streamGrid.addEventListener("click", event => {
      const button = event.target.closest(".stream");
      if (!button) return;
      state.stream = button.dataset.stream;
      localStorage.setItem(`${STORE_PREFIX}:stream`, state.stream);
      setActiveButton(".stream", "stream", state.stream);
      updateStreamAudio();
      renderNowPlaying();
    });

    $$('input[data-ambient]').forEach(input => {
      input.addEventListener("input", () => {
        ensureAudio();
        const name = input.dataset.ambient;
        state.audio.ambient[name].gain.gain.setTargetAtTime(Number(input.value), state.audio.ctx.currentTime, 0.06);
      });
    });

    els.clearAmbientBtn.addEventListener("click", () => {
      $$('input[data-ambient]').forEach(input => {
        input.value = 0;
        if (state.audio) {
          state.audio.ambient[input.dataset.ambient].gain.gain.setTargetAtTime(0, state.audio.ctx.currentTime, 0.06);
        }
      });
    });

    els.taskForm.addEventListener("submit", event => {
      event.preventDefault();
      const text = els.taskInput.value.trim();
      if (!text) return;
      state.tasks.unshift({
        id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
        text,
        owner: state.displayName,
        ownerId: state.id,
        done: false,
        createdAt: Date.now(),
      });
      els.taskInput.value = "";
      saveTasks();
      broadcast({ type: "tasks", tasks: state.tasks });
      renderTasks();
    });

    els.taskList.addEventListener("click", event => {
      const item = event.target.closest(".task-item");
      if (!item) return;
      const task = state.tasks.find(entry => entry.id === item.dataset.id);
      if (!task) return;
      if (event.target.closest(".task-check")) {
        task.done = !task.done;
      }
      if (event.target.closest(".task-delete")) {
        state.tasks = state.tasks.filter(entry => entry.id !== task.id);
      }
      saveTasks();
      broadcast({ type: "tasks", tasks: state.tasks });
      renderTasks();
    });

    els.vibeGrid.addEventListener("click", event => {
      const button = event.target.closest(".vibe");
      if (!button) return;
      state.vibe = button.dataset.vibe;
      localStorage.setItem(`${STORE_PREFIX}:vibe`, state.vibe);
      document.body.dataset.vibe = state.vibe;
      setActiveButton(".vibe", "vibe", state.vibe);
      broadcast({ type: "vibe", vibe: state.vibe });
    });

    els.closeBreakBtn.addEventListener("click", () => {
      els.breakModal.hidden = true;
      document.body.classList.remove("celebrate");
    });
  }

  function switchRoom(roomInput, options = {}) {
    const nextRoom = normalizeRoom(roomInput || "moon-den");
    if (state.channel) {
      removeSelfPresence();
      state.channel.close();
    }

    state.room = nextRoom;
    els.roomName.value = state.room;
    localStorage.setItem(`${STORE_PREFIX}:room`, state.room);

    if (!options.replaceUrl) {
      const url = new URL(location.href);
      url.searchParams.set("room", state.room);
      history.replaceState(null, "", url);
    } else if (!new URLSearchParams(location.search).get("room")) {
      const url = new URL(location.href);
      url.searchParams.set("room", state.room);
      history.replaceState(null, "", url);
    }

    const channelName = `${STORE_PREFIX}:channel:${state.room}`;
    state.channel = "BroadcastChannel" in window ? new BroadcastChannel(channelName) : null;
    if (state.channel) state.channel.onmessage = event => receiveBroadcast(event.data);

    window.onstorage = event => {
      if (!event.key || !event.key.startsWith(`${STORE_PREFIX}:${state.room}:`)) return;
      if (event.key.endsWith(":tasks")) {
        state.tasks = loadJSON(tasksKey(), []);
        renderTasks();
      }
      if (event.key.endsWith(":timer")) {
        state.timer = hydrateTimer(loadJSON(timerKey(), defaultTimer()));
        renderTimer();
      }
      if (event.key.endsWith(":presence")) {
        state.presence = loadJSON(presenceKey(), {});
        renderPresence();
      }
    };

    state.tasks = loadJSON(tasksKey(), []);
    state.presence = loadJSON(presenceKey(), {});
    state.timer = hydrateTimer(loadJSON(timerKey(), defaultTimer()));
    state.soloTimer = defaultTimer();

    sendPresence();
    broadcast({ type: "hello", user: selfPresence() });
    renderAll();
  }

  function receiveBroadcast(message) {
    if (!message || message.sender === state.id) return;

    if (message.type === "hello") {
      upsertPresence(message.user);
      sendPresence();
      if (state.shared) publishTimer("hello-sync", false);
      broadcast({ type: "tasks", tasks: state.tasks });
      broadcast({ type: "vibe", vibe: state.vibe });
    }

    if (message.type === "presence") {
      upsertPresence(message.user);
    }

    if (message.type === "presence-left") {
      delete state.presence[message.id];
      persistPresence();
      renderPresence();
    }

    if (message.type === "tasks") {
      state.tasks = Array.isArray(message.tasks) ? message.tasks : [];
      saveTasks(false);
      renderTasks();
    }

    if (message.type === "timer" && state.shared) {
      state.timer = hydrateTimer(message.timer);
      saveTimer(false);
      renderTimer();
      sendPresence();
    }

    if (message.type === "vibe" && message.vibe) {
      state.vibe = message.vibe;
      localStorage.setItem(`${STORE_PREFIX}:vibe`, state.vibe);
      document.body.dataset.vibe = state.vibe;
      setActiveButton(".vibe", "vibe", state.vibe);
    }
  }

  function broadcast(payload) {
    const message = { ...payload, sender: state.id, room: state.room, at: Date.now() };
    if (state.channel) state.channel.postMessage(message);
    localStorage.setItem(`${STORE_PREFIX}:${state.room}:last-broadcast`, JSON.stringify(message));
  }

  function getActiveTimer() {
    return state.shared ? state.timer : state.soloTimer;
  }

  function setActiveTimer(timer) {
    if (state.shared) {
      state.timer = timer;
      saveTimer();
      publishTimer("update");
    } else {
      state.soloTimer = timer;
    }
    renderTimer();
    sendPresence();
  }

  function toggleTimer() {
    unlockAudioContext();
    sanitizeDurations();
    const timer = cloneTimer(getActiveTimer());
    const now = Date.now();
    const remaining = getRemainingMs(timer, now);

    if (timer.running) {
      timer.running = false;
      timer.remainingMs = remaining;
      timer.startedAt = null;
    } else {
      timer.running = true;
      timer.durationMs = getPhaseDuration(timer.phase);
      timer.remainingMs = Math.min(remaining || timer.durationMs, timer.durationMs);
      timer.startedAt = now;
      timer.updatedAt = now;
    }
    setActiveTimer(timer);
  }

  function resetTimer(announce) {
    const current = getActiveTimer();
    const timer = {
      ...defaultTimer(),
      phase: current.phase || "focus",
      durationMs: getPhaseDuration(current.phase || "focus"),
      remainingMs: getPhaseDuration(current.phase || "focus"),
      updatedAt: Date.now(),
    };
    setActiveTimer(timer);
    if (announce) pulseStatus("Timer reset");
  }

  function completePhase(reason = "complete") {
    const timer = cloneTimer(getActiveTimer());
    const completedFocus = timer.phase === "focus";
    const nextPhase = completedFocus ? "break" : "focus";

    if (completedFocus && reason !== "manual-skip") recordSession();

    const nextTimer = {
      phase: nextPhase,
      running: false,
      startedAt: null,
      durationMs: getPhaseDuration(nextPhase),
      remainingMs: getPhaseDuration(nextPhase),
      completed: timer.completed + (completedFocus && reason !== "manual-skip" ? 1 : 0),
      updatedAt: Date.now(),
    };
    setActiveTimer(nextTimer);
    showBreakAlert(completedFocus);
  }

  function tick() {
    const timer = getActiveTimer();
    if (timer.running) {
      const remaining = getRemainingMs(timer);
      if (remaining <= 0) {
        completePhase("complete");
        return;
      }
    }
    prunePresence();
    renderTimer();
  }

  function getRemainingMs(timer, now = Date.now()) {
    if (!timer.running || !timer.startedAt) return timer.remainingMs;
    return Math.max(0, timer.remainingMs - (now - timer.startedAt));
  }

  function getPhaseDuration(phase) {
    const focus = clamp(Number(els.focusMinutes.value || 25), 1, 120);
    const rest = clamp(Number(els.breakMinutes.value || 5), 1, 60);
    return (phase === "break" ? rest : focus) * 60 * 1000;
  }

  function sanitizeDurations() {
    els.focusMinutes.value = clamp(Number(els.focusMinutes.value || 25), 1, 120);
    els.breakMinutes.value = clamp(Number(els.breakMinutes.value || 5), 1, 60);
  }

  function publishTimer(reason = "timer", persist = true) {
    if (persist) saveTimer();
    broadcast({ type: "timer", reason, timer: state.timer });
  }

  function saveTimer(shouldBroadcast = false) {
    localStorage.setItem(timerKey(), JSON.stringify(state.timer));
    if (shouldBroadcast) publishTimer("save", false);
  }

  function defaultTimer() {
    return {
      phase: "focus",
      running: false,
      startedAt: null,
      durationMs: 25 * 60 * 1000,
      remainingMs: 25 * 60 * 1000,
      completed: 0,
      updatedAt: Date.now(),
    };
  }

  function hydrateTimer(timer) {
    const fallback = defaultTimer();
    return {
      phase: timer?.phase === "break" ? "break" : "focus",
      running: Boolean(timer?.running),
      startedAt: typeof timer?.startedAt === "number" ? timer.startedAt : null,
      durationMs: typeof timer?.durationMs === "number" ? timer.durationMs : fallback.durationMs,
      remainingMs: typeof timer?.remainingMs === "number" ? timer.remainingMs : fallback.remainingMs,
      completed: typeof timer?.completed === "number" ? timer.completed : 0,
      updatedAt: typeof timer?.updatedAt === "number" ? timer.updatedAt : Date.now(),
    };
  }

  function cloneTimer(timer) {
    return JSON.parse(JSON.stringify(timer));
  }

  function renderTimer() {
    const timer = getActiveTimer();
    const remaining = getRemainingMs(timer);
    const progress = 1 - remaining / Math.max(timer.durationMs, 1);
    const offset = RING_LENGTH * progress;

    els.timeLeft.textContent = formatTime(remaining);
    els.phaseLabel.textContent = timer.phase === "focus" ? "Focus session" : "Break time";
    els.timerStatus.textContent = timer.running ? (state.shared ? "Synced and running" : "Solo session running") : "Ready to begin";
    els.startPauseBtn.textContent = timer.running ? "Pause" : "Start";
    els.progressRing.style.strokeDashoffset = String(offset);
    renderSyncPill();
  }

  function renderSyncPill() {
    els.syncPill.innerHTML = state.shared
      ? '<span class="dot"></span><strong>Shared</strong>'
      : '<span class="dot"></span><strong>Solo</strong>';
    els.syncPill.querySelector(".dot").style.background = "var(--accent)";
  }

  function pulseStatus(text) {
    els.timerStatus.textContent = text;
    setTimeout(renderTimer, 1000);
  }

  function showBreakAlert(focusCompleted) {
    ensureAudio();
    playChime();
    document.body.classList.add("celebrate");
    els.breakTitle.textContent = focusCompleted ? "Time for a soft break" : "Back to deep focus";
    els.breakMessage.textContent = focusCompleted
      ? "Your focus session is complete. Stretch, breathe, and let the room glow for a minute."
      : "Break complete. Pick one next task and ease back into the cave.";
    els.breakModal.hidden = false;
    setTimeout(() => document.body.classList.remove("celebrate"), 2600);
  }

  function saveTasks(write = true) {
    localStorage.setItem(tasksKey(), JSON.stringify(state.tasks));
    if (write) localStorage.setItem(`${STORE_PREFIX}:${state.room}:tasks-updated`, String(Date.now()));
  }

  function renderTasks() {
    els.taskList.innerHTML = "";
    els.taskCount.textContent = `${state.tasks.length} ${state.tasks.length === 1 ? "task" : "tasks"}`;

    if (!state.tasks.length) {
      const empty = document.createElement("li");
      empty.className = "empty-state";
      empty.textContent = "No tasks yet. Add one to tell the cave what you are working on.";
      els.taskList.append(empty);
      return;
    }

    state.tasks.forEach(task => {
      const node = els.taskTemplate.content.firstElementChild.cloneNode(true);
      node.dataset.id = task.id;
      node.classList.toggle("done", task.done);
      $("strong", node).textContent = task.text;
      $("span", node).textContent = `${task.owner || "Someone"} · ${timeAgo(task.createdAt)}`;
      els.taskList.append(node);
    });
  }

  function sendPresence() {
    const user = selfPresence();
    upsertPresence(user);
    broadcast({ type: "presence", user });
  }

  function selfPresence() {
    const timer = getActiveTimer();
    return {
      id: state.id,
      name: state.displayName,
      initials: initials(state.displayName),
      color: colorFromString(state.id),
      status: timer.running ? (timer.phase === "focus" ? "focusing" : "on break") : "planning",
      timer: formatTime(getRemainingMs(timer)),
      shared: state.shared,
      lastSeen: Date.now(),
    };
  }

  function upsertPresence(user) {
    if (!user?.id) return;
    state.presence[user.id] = user;
    persistPresence();
    renderPresence();
  }

  function prunePresence() {
    const now = Date.now();
    let changed = false;
    Object.keys(state.presence).forEach(id => {
      if (now - state.presence[id].lastSeen > PRESENCE_TIMEOUT) {
        delete state.presence[id];
        changed = true;
      }
    });
    if (!state.presence[state.id] || now - state.presence[state.id].lastSeen > HEARTBEAT_MS) {
      state.presence[state.id] = selfPresence();
      changed = true;
    }
    if (changed) {
      persistPresence();
      renderPresence();
    }
  }

  function removeSelfPresence() {
    state.presence = loadJSON(presenceKey(), {});
    delete state.presence[state.id];
    persistPresence();
  }

  function persistPresence() {
    localStorage.setItem(presenceKey(), JSON.stringify(state.presence));
  }

  function renderPresence() {
    const people = Object.values(state.presence)
      .filter(user => Date.now() - user.lastSeen <= PRESENCE_TIMEOUT)
      .sort((a, b) => (a.id === state.id ? -1 : b.id === state.id ? 1 : a.name.localeCompare(b.name)));

    els.presenceList.innerHTML = "";
    els.presenceCount.textContent = `${people.length || 1} online`;

    people.forEach(user => {
      const node = els.presenceTemplate.content.firstElementChild.cloneNode(true);
      const avatar = $(".avatar", node);
      avatar.textContent = user.initials;
      avatar.style.background = user.color;
      $("strong", node).textContent = `${user.name}${user.id === state.id ? " (you)" : ""}`;
      $("span", node).textContent = `${capitalize(user.status)} · ${user.timer} · ${user.shared ? "shared" : "solo"}`;
      els.presenceList.append(node);
    });
  }

  function recordSession() {
    const key = localDateKey(new Date());
    state.streaks[key] = (state.streaks[key] || 0) + 1;
    localStorage.setItem(`${STORE_PREFIX}:streaks`, JSON.stringify(state.streaks));
    renderStreaks();
  }

  function renderStreaks() {
    const today = new Date();
    const todayKey = localDateKey(today);
    const weekKeys = currentWeekKeys(today);
    const todaySessions = state.streaks[todayKey] || 0;
    const weekSessions = weekKeys.reduce((sum, key) => sum + (state.streaks[key] || 0), 0);
    const totalSessions = Object.values(state.streaks).reduce((sum, value) => sum + Number(value || 0), 0);
    const dayStreak = computeDayStreak(today);

    els.todaySessions.textContent = todaySessions;
    els.weekSessions.textContent = weekSessions;
    els.totalSessions.textContent = totalSessions;
    els.streakBadge.textContent = `${dayStreak} day ${dayStreak === 1 ? "streak" : "streak"}`;

    els.weekDots.innerHTML = "";
    const labels = ["M", "T", "W", "T", "F", "S", "S"];
    weekKeys.forEach((key, index) => {
      const dot = document.createElement("span");
      const count = state.streaks[key] || 0;
      dot.classList.toggle("active", count > 0);
      dot.textContent = count > 0 ? `${labels[index]} · ${count}` : labels[index];
      dot.title = `${key}: ${count} sessions`;
      els.weekDots.append(dot);
    });
  }

  function computeDayStreak(today) {
    let streak = 0;
    const cursor = new Date(today);
    for (let i = 0; i < 366; i += 1) {
      const key = localDateKey(cursor);
      if ((state.streaks[key] || 0) > 0) streak += 1;
      else if (i === 0) {
        cursor.setDate(cursor.getDate() - 1);
        continue;
      } else break;
      cursor.setDate(cursor.getDate() - 1);
    }
    return streak;
  }

  function currentWeekKeys(date) {
    const start = new Date(date);
    const day = start.getDay();
    const diff = (day + 6) % 7;
    start.setDate(start.getDate() - diff);
    return Array.from({ length: 7 }, (_, index) => {
      const entry = new Date(start);
      entry.setDate(start.getDate() + index);
      return localDateKey(entry);
    });
  }

  function ensureAudio() {
    if (state.audio) return state.audio;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return null;

    const ctx = new AudioContext();
    const master = ctx.createGain();
    master.gain.value = state.audioOn ? Number(els.masterVolume.value) : 0;
    master.connect(ctx.destination);

    const radio = createRadioEngine(ctx, master);
    const ambient = {
      rain: createNoiseLayer(ctx, master, 900, 0.22, "highpass"),
      cafe: createCafeLayer(ctx, master),
      fire: createNoiseLayer(ctx, master, 240, 0.1, "bandpass"),
    };

    state.audio = { ctx, master, radio, ambient };
    $$('input[data-ambient]').forEach(input => {
      ambient[input.dataset.ambient].gain.gain.value = Number(input.value);
    });
    updateStreamAudio();
    return state.audio;
  }

  function unlockAudioContext() {
    const audio = ensureAudio();
    if (audio && audio.ctx.state === "suspended") audio.ctx.resume();
  }

  function toggleAudio() {
    const audio = ensureAudio();
    if (!audio) return;
    if (audio.ctx.state === "suspended") audio.ctx.resume();
    state.audioOn = !state.audioOn;
    document.body.classList.toggle("audio-on", state.audioOn);
    els.masterAudioBtn.textContent = state.audioOn ? "Pause" : "Play";
    const target = state.audioOn ? Number(els.masterVolume.value) : 0;
    audio.master.gain.setTargetAtTime(target, audio.ctx.currentTime, 0.08);
  }

  function createRadioEngine(ctx, destination) {
    const engine = {
      oscillators: [],
      rhythm: null,
      gain: ctx.createGain(),
      filter: ctx.createBiquadFilter(),
    };
    engine.gain.gain.value = 0.24;
    engine.filter.type = "lowpass";
    engine.filter.frequency.value = 1400;
    engine.gain.connect(engine.filter);
    engine.filter.connect(destination);
    return engine;
  }

  function updateStreamAudio() {
    if (!state.audio) return;
    const { ctx, radio } = state.audio;
    radio.oscillators.forEach(osc => osc.stop());
    radio.oscillators = [];
    if (radio.rhythm) clearInterval(radio.rhythm);

    const presets = {
      chill: { freqs: [196, 246.94, 329.63, 392], type: "sine", filter: 1450, gain: 0.21, tempo: 1000 },
      dark: { freqs: [110, 146.83, 220, 277.18], type: "triangle", filter: 840, gain: 0.19, tempo: 1250 },
      jazz: { freqs: [174.61, 220, 261.63, 329.63, 392], type: "sine", filter: 1700, gain: 0.2, tempo: 840 },
      rain: { freqs: [164.81, 207.65, 246.94, 311.13], type: "triangle", filter: 980, gain: 0.17, tempo: 1450 },
    };
    const preset = presets[state.stream] || presets.chill;
    radio.filter.frequency.setTargetAtTime(preset.filter, ctx.currentTime, 0.1);
    radio.gain.gain.setTargetAtTime(preset.gain, ctx.currentTime, 0.1);

    preset.freqs.forEach((freq, index) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = preset.type;
      osc.frequency.value = freq / (index < 1 ? 1 : 2);
      gain.gain.value = 0.022 + index * 0.004;
      osc.connect(gain);
      gain.connect(radio.gain);
      osc.start();
      radio.oscillators.push(osc);
    });

    radio.rhythm = setInterval(() => {
      if (!state.audioOn) return;
      const tickGain = ctx.createGain();
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = preset.freqs[Math.floor(Math.random() * preset.freqs.length)] * 2;
      tickGain.gain.setValueAtTime(0.0001, ctx.currentTime);
      tickGain.gain.exponentialRampToValueAtTime(0.045, ctx.currentTime + 0.018);
      tickGain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.34);
      osc.connect(tickGain);
      tickGain.connect(radio.gain);
      osc.start();
      osc.stop(ctx.currentTime + 0.36);
    }, preset.tempo);
  }

  function createNoiseLayer(ctx, destination, frequency, initialGain, filterType) {
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = frequency;
    filter.Q.value = filterType === "bandpass" ? 4.5 : 0.8;

    const gain = ctx.createGain();
    gain.gain.value = initialGain;
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(destination);
    noise.start();
    return { noise, filter, gain };
  }

  function createCafeLayer(ctx, destination) {
    const layer = createNoiseLayer(ctx, destination, 520, 0.12, "bandpass");
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 0.34;
    lfoGain.gain.value = 0.045;
    lfo.connect(lfoGain);
    lfoGain.connect(layer.gain.gain);
    lfo.start();
    return { ...layer, lfo, lfoGain };
  }

  function playChime() {
    const audio = ensureAudio();
    if (!audio) return;
    const { ctx, master } = audio;
    [523.25, 659.25, 783.99].forEach((freq, index) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + index * 0.11);
      gain.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + index * 0.11 + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + index * 0.11 + 0.55);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + index * 0.11);
      osc.stop(ctx.currentTime + index * 0.11 + 0.6);
    });
  }

  function renderNowPlaying() {
    const names = {
      chill: "Chill Stream",
      dark: "Dark Stream",
      jazz: "Jazz Stream",
      rain: "Rain Stream",
    };
    els.nowPlaying.textContent = names[state.stream] || names.chill;
  }

  function renderAll() {
    els.roomTitle.textContent = `${state.room.replace(/-/g, " ")} cave`;
    renderTimer();
    renderTasks();
    renderPresence();
    renderStreaks();
    renderNowPlaying();
  }

  function setActiveButton(selector, dataName, value) {
    $$(selector).forEach(button => button.classList.toggle("active", button.dataset[dataName] === value));
  }

  function timerKey() { return `${STORE_PREFIX}:${state.room}:timer`; }
  function tasksKey() { return `${STORE_PREFIX}:${state.room}:tasks`; }
  function presenceKey() { return `${STORE_PREFIX}:${state.room}:presence`; }

  function loadJSON(key, fallback) {
    try {
      const value = localStorage.getItem(key);
      return value ? JSON.parse(value) : fallback;
    } catch {
      return fallback;
    }
  }

  function normalizeRoom(value) {
    return String(value || "moon-den")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 24) || "moon-den";
  }

  function randomName() {
    const adjectives = ["Quiet", "Cosmic", "Rainy", "Velvet", "Neon", "Soft", "Hidden", "Golden"];
    const animals = ["Owl", "Fox", "Panda", "Moth", "Cat", "Raven", "Otter", "Lynx"];
    return `${adjectives[Math.floor(Math.random() * adjectives.length)]} ${animals[Math.floor(Math.random() * animals.length)]}`;
  }

  function initials(name) {
    return String(name || "FC")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(part => part[0]?.toUpperCase())
      .join("") || "FC";
  }

  function colorFromString(value) {
    let hash = 0;
    for (let i = 0; i < value.length; i += 1) hash = value.charCodeAt(i) + ((hash << 5) - hash);
    const hue = Math.abs(hash) % 360;
    return `linear-gradient(135deg, hsl(${hue} 88% 74%), hsl(${(hue + 55) % 360} 90% 68%))`;
  }

  function formatTime(ms) {
    const total = Math.ceil(ms / 1000);
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  function timeAgo(timestamp) {
    const seconds = Math.max(1, Math.floor((Date.now() - timestamp) / 1000));
    if (seconds < 60) return "just now";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  }

  function localDateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function clamp(number, min, max) {
    return Math.min(max, Math.max(min, Number.isFinite(number) ? number : min));
  }

  function capitalize(text) {
    return String(text || "").replace(/^./, char => char.toUpperCase());
  }
})();
