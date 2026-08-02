(() => {
  "use strict";

  const STORE = "aimMotionProfileV1";
  const ACHIEVEMENTS = "aimMotionAchievementsV1";
  const W = 1000;
  const H = 625;
  const MODES = {
    moving: { title: "Moving Target", duration: 30000, size: 70, speed: 235 },
    tracking: { title: "Tracking", duration: 30000, size: 96, speed: 145 },
    flick: { title: "Flick Chain", duration: 30000, size: 62, chain: 4 }
  };
  const PROGRAMS = {
    warmup: { title: "Разминка", stages: [["speed", 60000], ["precision", 60000], ["tracking", 60000]] },
    precision: { title: "Точность", stages: [["precision", 100000], ["microshot", 100000], ["flick", 100000]] },
    full: { title: "Полная тренировка", stages: [["speed", 120000], ["precision", 120000], ["moving", 120000], ["tracking", 120000], ["microshot", 120000]] }
  };

  const id = (name) => document.getElementById(name);
  const ui = {
    arena: id("arena"), field: id("playfield"), target: id("target"), overlay: id("overlay"),
    start: id("startButton"), name: id("playerName"), eyebrow: id("menuEyebrow"), title: id("menuTitle"),
    description: id("menuDescription"), results: id("resultGrid"), resultHits: id("resultHits"),
    resultAccuracy: id("resultAccuracy"), resultReaction: id("resultReaction"), hud: id("modeHud"),
    hits: id("hitsValue"), misses: id("missesValue"), accuracy: id("accuracyValue"), reaction: id("reactionValue"),
    time: id("timeValue"), open: id("motionOpenButton"), modal: id("motionModal"), close: id("motionCloseButton"),
    radar: id("motionRadar"), skills: id("motionSkills"), achievements: id("motionAchievements"),
    recommendation: id("motionRecommendation"), status: id("motionProgramStatus")
  };

  let selected = null;
  let running = false;
  let mode = null;
  let endAt = 0;
  let startedAt = 0;
  let frame = 0;
  let target = null;
  let hits = 0;
  let misses = 0;
  let reactions = [];
  let pointer = { x: 0, y: 0, active: false };
  let trackedMs = 0;
  let trackingLosses = 0;
  let longestTracking = 0;
  let currentTracking = 0;
  let wasInside = false;
  let flickTargets = [];
  let flickNodes = [];
  let flickIndex = 0;
  let completedChains = 0;
  let lastHitAt = 0;
  let program = null;

  const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
  const write = (key, value) => localStorage.setItem(key, JSON.stringify(value));
  const profile = () => ({ speed: 0, accuracy: 0, reaction: 0, stability: 0, tracking: 0, flick: 0, movingHits: 0, longestTracking: 0, programs: 0, ...read(STORE, {}) });
  const average = (list) => list.length ? Math.round(list.reduce((a, b) => a + b, 0) / list.length) : 0;
  const fieldScale = () => Math.min(ui.field.clientWidth / W, ui.field.clientHeight / H);
  const point = (event) => { const r = ui.field.getBoundingClientRect(); return { x: (event.clientX - r.left) / r.width * W, y: (event.clientY - r.top) / r.height * H }; };
  const inside = (p, t = target) => t && (p.x - t.x - t.size / 2) ** 2 + (p.y - t.y - t.size / 2) ** 2 <= (t.size / 2) ** 2;

  function drawTarget() {
    if (!target) return;
    const scale = fieldScale();
    ui.target.style.setProperty("--size", `${target.size * scale}px`);
    ui.target.style.left = `${target.x * scale}px`;
    ui.target.style.top = `${target.y * scale}px`;
    ui.target.classList.add("visible", "motion-target");
  }

  function hideTarget() {
    ui.target.classList.remove("visible", "motion-target", "tracking-target");
    target = null;
  }

  function velocity(speed) {
    const angle = Math.random() * Math.PI * 2;
    return { vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed };
  }

  function spawnMoving() {
    const cfg = MODES[mode];
    const v = velocity(cfg.speed);
    target = {
      x: 30 + Math.random() * (W - cfg.size - 60),
      y: 30 + Math.random() * (H - cfg.size - 60),
      size: cfg.size,
      vx: v.vx,
      vy: v.vy,
      born: performance.now(),
      turnAt: performance.now() + 900 + Math.random() * 800
    };
    drawTarget();
    if (mode === "tracking") ui.target.classList.add("tracking-target");
  }

  function clearFlick() {
    flickNodes.forEach((node) => node.remove());
    flickTargets = [];
    flickNodes = [];
    flickIndex = 0;
  }

  function spawnFlick() {
    clearFlick();
    const cfg = MODES.flick;
    let tries = 0;
    while (flickTargets.length < cfg.chain && tries < 200) {
      tries += 1;
      const item = { x: 35 + Math.random() * (W - cfg.size - 70), y: 35 + Math.random() * (H - cfg.size - 70), size: cfg.size };
      if (flickTargets.every((old) => Math.hypot(old.x - item.x, old.y - item.y) > 170)) flickTargets.push(item);
    }
    const scale = fieldScale();
    flickTargets.forEach((item, index) => {
      const node = document.createElement("button");
      node.type = "button";
      node.className = `flick-target${index === 0 ? " active" : ""}`;
      node.textContent = index + 1;
      node.style.width = node.style.height = `${item.size * scale}px`;
      node.style.left = `${item.x * scale}px`;
      node.style.top = `${item.y * scale}px`;
      ui.field.appendChild(node);
      flickNodes.push(node);
    });
    lastHitAt = performance.now();
  }

  function move(dt, now) {
    if (!target) return;
    target.x += target.vx * dt;
    target.y += target.vy * dt;
    if (target.x <= 0 || target.x + target.size >= W) { target.x = Math.max(0, Math.min(W - target.size, target.x)); target.vx *= -1; }
    if (target.y <= 0 || target.y + target.size >= H) { target.y = Math.max(0, Math.min(H - target.size, target.y)); target.vy *= -1; }
    if (now >= target.turnAt) {
      const v = velocity(MODES[mode].speed * (0.9 + Math.random() * 0.25));
      target.vx = v.vx; target.vy = v.vy; target.turnAt = now + 850 + Math.random() * 900;
    }
    drawTarget();
  }

  function trackingUpdate(dt) {
    const isInside = pointer.active && inside(pointer);
    if (isInside) {
      trackedMs += dt;
      currentTracking += dt;
      longestTracking = Math.max(longestTracking, currentTracking);
    } else {
      currentTracking = 0;
      if (wasInside) trackingLosses += 1;
    }
    wasInside = isInside;
    hits = Math.floor(trackedMs / 100);
  }

  function updateHud(remaining) {
    const attempts = hits + misses;
    const accuracy = mode === "tracking" ? Math.round(trackedMs / Math.max(1, performance.now() - startedAt) * 100) : attempts ? Math.round(hits / attempts * 100) : 100;
    ui.time.textContent = (Math.max(0, remaining) / 1000).toFixed(1);
    ui.hits.textContent = hits;
    ui.misses.textContent = misses;
    ui.accuracy.textContent = `${Math.min(100, accuracy)}%`;
    ui.reaction.textContent = reactions.length ? `${average(reactions)} мс` : "—";
  }

  function finish() {
    if (!running) return;
    running = false;
    cancelAnimationFrame(frame);
    hideTarget();
    clearFlick();
    ui.overlay.classList.remove("hidden");
    ui.hud.classList.remove("visible");

    const elapsed = Math.max(1, performance.now() - startedAt);
    const accuracy = mode === "tracking" ? Math.min(100, Math.round(trackedMs / elapsed * 100)) : hits + misses ? Math.round(hits / (hits + misses) * 100) : 0;
    const reaction = average(reactions) || 9999;
    const entry = { name: ui.name.value.trim(), score: hits, accuracy, reaction, created_at: new Date().toISOString() };
    const motion = {
      type: mode,
      movingHits: mode === "moving" ? hits : 0,
      trackingAccuracy: mode === "tracking" ? accuracy : 0,
      trackedMs: Math.round(trackedMs),
      losses: trackingLosses,
      longestContinuousMs: Math.round(longestTracking),
      chainsCompleted: completedChains,
      clean: mode === "flick" && misses === 0
    };

    ui.resultHits.textContent = hits;
    ui.resultAccuracy.textContent = `${accuracy}%`;
    ui.resultReaction.textContent = reaction === 9999 ? "—" : `${reaction} мс`;
    ui.eyebrow.textContent = `${MODES[mode].title} завершён`;
    ui.title.innerHTML = `${hits}<br>ОЧКОВ`;
    ui.description.textContent = "Результат сохранён в локальном профиле Motion Lab.";
    ui.results.classList.add("show");
    ui.start.textContent = `Повторить ${MODES[mode].title}`;
    ui.start.disabled = false;

    document.dispatchEvent(new CustomEvent("aim:round-end", { detail: { entry, hits, misses, reaction: reaction === 9999 ? null : reaction, accuracy, mode, ranked: false, motion, duration: elapsed, program } }));
    updateProfile(entry, motion);
    const finishedProgram = program;
    program = null;
    if (finishedProgram) advanceProgram(finishedProgram, entry);
  }

  function loop(now) {
    if (!running) return;
    const dt = Math.min(40, now - (loop.last || now));
    loop.last = now;
    const remaining = endAt - now;
    if (mode === "moving" || mode === "tracking") move(dt / 1000, now);
    if (mode === "tracking") trackingUpdate(dt);
    updateHud(remaining);
    if (remaining <= 0) return finish();
    frame = requestAnimationFrame(loop);
  }

  function startMotion(options = {}) {
    if (running || !MODES[selected]) return;
    const name = ui.name.value.trim().slice(0, 20);
    if (!name) { ui.name.focus(); return; }
    mode = selected;
    program = options.program || null;
    const duration = options.duration || MODES[mode].duration;
    hits = misses = trackedMs = trackingLosses = longestTracking = currentTracking = completedChains = 0;
    reactions = [];
    pointer.active = false;
    wasInside = false;
    ui.results.classList.remove("show");
    id("rankBanner").hidden = true;
    ui.start.disabled = true;
    ui.overlay.classList.add("hidden");
    ui.hud.textContent = `${MODES[mode].title}${program ? ` · ${program.index + 1}/${program.total}` : ""}`;
    ui.hud.classList.add("visible");
    startedAt = performance.now();
    endAt = startedAt + duration;
    running = true;
    loop.last = startedAt;
    if (mode === "flick") spawnFlick(); else spawnMoving();
    document.dispatchEvent(new CustomEvent("aim:round-start", { detail: { mode, program } }));
    frame = requestAnimationFrame(loop);
  }

  function selectMode(value) {
    selected = value;
    const cfg = MODES[value];
    ui.eyebrow.textContent = "Motion Lab";
    ui.title.textContent = cfg.title.toUpperCase();
    ui.description.textContent = value === "tracking" ? "Удерживай указатель внутри движущейся цели." : value === "flick" ? "Нажимай цели строго по порядку." : "Перехватывай цель, которая меняет направление и отражается от границ.";
    ui.start.textContent = `Начать ${cfg.title}`;
    document.querySelectorAll("[data-game-mode]").forEach((button) => button.classList.toggle("active", button.dataset.gameMode === value));
  }

  function handleFlick(p) {
    const item = flickTargets[flickIndex];
    if (!inside(p, item)) { misses += 1; return; }
    const now = performance.now();
    reactions.push(now - lastHitAt);
    lastHitAt = now;
    hits += 1;
    flickNodes[flickIndex]?.classList.add("done");
    flickNodes[flickIndex]?.classList.remove("active");
    flickIndex += 1;
    flickNodes[flickIndex]?.classList.add("active");
    document.dispatchEvent(new CustomEvent("aim:hit", { detail: { mode, hits } }));
    if (flickIndex >= flickTargets.length) { completedChains += 1; clearFlick(); setTimeout(() => running && spawnFlick(), 90); }
  }

  ui.field.addEventListener("pointerdown", (event) => {
    if (!running || !MODES[mode]) return;
    event.preventDefault();
    const p = point(event);
    pointer = { ...p, active: true };
    if (mode === "tracking") return;
    if (mode === "flick") return handleFlick(p);
    if (inside(p)) {
      reactions.push(performance.now() - target.born);
      hits += 1;
      document.dispatchEvent(new CustomEvent("aim:hit", { detail: { mode, hits } }));
      hideTarget();
      setTimeout(() => running && spawnMoving(), 80 + Math.random() * 150);
    } else {
      misses += 1;
      document.dispatchEvent(new CustomEvent("aim:miss", { detail: { mode, misses } }));
    }
  });
  ui.field.addEventListener("pointermove", (event) => { if (running) pointer = { ...point(event), active: true }; });
  ["pointerup", "pointercancel", "pointerleave"].forEach((type) => ui.field.addEventListener(type, (event) => { if (event.pointerType !== "mouse" || type === "pointerleave") pointer.active = false; }));

  document.querySelectorAll(".motion-mode").forEach((button) => button.addEventListener("click", () => selectMode(button.dataset.gameMode)));
  ui.start.addEventListener("click", (event) => { if (!selected) return; event.preventDefault(); event.stopImmediatePropagation(); startMotion(); }, true);

  function skillValues() {
    const p = profile();
    return {
      speed: p.speed,
      accuracy: p.accuracy,
      reaction: p.reaction,
      stability: p.stability,
      tracking: p.tracking,
      flick: p.flick
    };
  }

  function updateProfile(entry, motion) {
    const p = profile();
    const stability = reactions.length > 1 ? Math.max(0, Math.round(100 - Math.sqrt(reactions.reduce((sum, value) => sum + (value - average(reactions)) ** 2, 0) / reactions.length) / 5)) : entry.accuracy;
    p.speed = Math.max(p.speed, Math.min(100, Math.round(entry.score * 2.2)));
    p.accuracy = Math.max(p.accuracy, entry.accuracy);
    p.reaction = Math.max(p.reaction, entry.reaction === 9999 ? 0 : Math.max(0, Math.round(120 - entry.reaction / 5)));
    p.stability = Math.max(p.stability, stability);
    if (motion.type === "tracking") p.tracking = Math.max(p.tracking, motion.trackingAccuracy);
    if (motion.type === "flick") p.flick = Math.max(p.flick, Math.min(100, motion.chainsCompleted * 18 + (motion.clean ? 20 : 0)));
    if (motion.type === "moving") p.movingHits = Math.max(p.movingHits, motion.movingHits);
    p.longestTracking = Math.max(p.longestTracking, motion.longestContinuousMs || 0);
    write(STORE, p);
    unlock(p, motion);
    render();
  }

  function unlock(p, motion) {
    const unlocked = new Set(read(ACHIEVEMENTS, []));
    if (p.longestTracking >= 10000) unlocked.add("tracker");
    if (p.movingHits >= 30) unlocked.add("interceptor");
    if (motion.type === "flick" && motion.clean) unlocked.add("clean-chain");
    if (p.programs >= 1) unlocked.add("marathon");
    if (Object.values(skillValues()).every((value) => value >= 70)) unlocked.add("universal");
    write(ACHIEVEMENTS, [...unlocked]);
  }

  const achievementList = [
    ["tracker", "🛰️", "Следопыт", "Удерживать цель 10 секунд без потери"],
    ["interceptor", "🎯", "Перехватчик", "Попасть по 30 движущимся целям"],
    ["clean-chain", "⚡", "Чистая цепочка", "Пройти Flick Chain без ошибки"],
    ["marathon", "🏃", "Марафонец", "Завершить тренировочную программу"],
    ["universal", "🏆", "Универсал", "Получить 70+ по всем навыкам"]
  ];

  function drawRadar(values) {
    const canvas = ui.radar;
    const ratio = Math.min(2, devicePixelRatio || 1);
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, rect.width * ratio);
    canvas.height = Math.max(1, rect.height * ratio);
    const ctx = canvas.getContext("2d");
    ctx.scale(ratio, ratio);
    const names = Object.keys(values);
    const cx = rect.width / 2, cy = rect.height / 2, radius = Math.min(rect.width, rect.height) * 0.34;
    ctx.clearRect(0, 0, rect.width, rect.height);
    ctx.strokeStyle = "rgba(255,255,255,.12)";
    for (let ring = 1; ring <= 4; ring++) {
      ctx.beginPath(); names.forEach((_, i) => { const a = -Math.PI / 2 + i * Math.PI * 2 / names.length; const r = radius * ring / 4; const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.closePath(); ctx.stroke();
    }
    ctx.fillStyle = "rgba(139,92,246,.28)"; ctx.strokeStyle = "#a78bfa"; ctx.beginPath();
    names.forEach((name, i) => { const a = -Math.PI / 2 + i * Math.PI * 2 / names.length; const r = radius * values[name] / 100; const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.closePath(); ctx.fill(); ctx.stroke();
  }

  function render() {
    const values = skillValues();
    const labels = { speed: "Скорость", accuracy: "Точность", reaction: "Реакция", stability: "Стабильность", tracking: "Tracking", flick: "Flick" };
    ui.skills.innerHTML = Object.entries(values).map(([key, value]) => `<div><span>${labels[key]}</span><strong>${value}</strong></div>`).join("");
    const unlocked = new Set(read(ACHIEVEMENTS, []));
    ui.achievements.innerHTML = achievementList.map(([key, icon, title, text]) => `<div class="motion-achievement${unlocked.has(key) ? " unlocked" : ""}"><i>${icon}</i><div><strong>${title}</strong><span>${text}</span></div></div>`).join("");
    const weakest = Object.entries(values).sort((a, b) => a[1] - b[1])[0];
    ui.recommendation.textContent = weakest ? `Слабая сторона: ${labels[weakest[0]]} (${weakest[1]}). Рекомендуется ${weakest[0] === "tracking" ? "Tracking" : weakest[0] === "flick" ? "Flick Chain" : weakest[0] === "accuracy" ? "Precision" : "Moving Target"}.` : "Заверши первый раунд.";
    requestAnimationFrame(() => drawRadar(values));
  }

  function open() { ui.modal.classList.add("show"); ui.modal.setAttribute("aria-hidden", "false"); render(); }
  function close() { if (running) return; ui.modal.classList.remove("show"); ui.modal.setAttribute("aria-hidden", "true"); }

  function startProgram(key) {
    const cfg = PROGRAMS[key];
    if (!cfg) return;
    close();
    runStage({ key, title: cfg.title, stages: cfg.stages, index: 0, results: [] });
  }

  function runStage(info) {
    const [stageMode, duration] = info.stages[info.index];
    if (MODES[stageMode]) {
      selected = stageMode;
      selectMode(stageMode);
      startMotion({ duration, program: { ...info, total: info.stages.length } });
    } else if (window.AimTrainer?.game?.setMode && window.AimTrainer?.game?.startRound) {
      selected = null;
      window.AimTrainer.game.setMode(stageMode);
      window.AimTrainer.game.startRound({ mode: stageMode, durationOverride: duration, program: { ...info, total: info.stages.length }, skipCountdown: info.index > 0 });
    }
    ui.status.textContent = `${info.title}: этап ${info.index + 1}/${info.stages.length}`;
  }

  function advanceProgram(info, entry) {
    const next = { ...info, results: [...(info.results || []), entry], index: info.index + 1 };
    if (next.index < next.stages.length) return setTimeout(() => runStage(next), 900);
    const p = profile(); p.programs += 1; write(STORE, p); unlock(p, { type: "program" });
    ui.status.textContent = `${info.title} завершена · средний результат ${average(next.results.map((item) => item.score))}`;
    open();
  }

  document.addEventListener("aim:round-end", (event) => {
    const info = event.detail.program;
    if (!info || MODES[event.detail.mode]) return;
    updateProfile(event.detail.entry, event.detail.motion || { type: event.detail.mode });
    setTimeout(() => advanceProgram(info, event.detail.entry), 900);
  });

  ui.open.addEventListener("click", open);
  ui.close.addEventListener("click", close);
  ui.modal.addEventListener("pointerdown", (event) => { if (event.target === ui.modal) close(); });
  document.querySelectorAll("[data-motion-program]").forEach((button) => button.addEventListener("click", () => startProgram(button.dataset.motionProgram)));
  window.addEventListener("resize", () => ui.modal.classList.contains("show") && render());

  window.AimTrainer.motion = { open, close, startProgram, profile };
  render();
})();