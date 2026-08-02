(() => {
  "use strict";

  const AimTrainer = (window.AimTrainer = window.AimTrainer || {});
  const VIRTUAL_WIDTH = 1000;
  const VIRTUAL_HEIGHT = 625;
  const FIELD_ASPECT = VIRTUAL_WIDTH / VIRTUAL_HEIGHT;
  const RUSH_BEST_KEY = "aimTrainerRushBestV1";

  const MODES = {
    ranked: {
      id: "ranked",
      title: "Рейтинг",
      eyebrow: "Fair Play",
      duration: 30_000,
      minSpawnDelay: 120,
      maxSpawnDelay: 420,
      minTargetSize: 72,
      maxTargetSize: 88,
      targetLifetime: null,
      description:
        "Единая виртуальная арена и точная круглая зона попадания. Результат входит в общий рейтинг."
    },
    rush: {
      id: "rush",
      title: "Focus Rush",
      eyebrow: "Испытание",
      duration: 30_000,
      minSpawnDelay: 80,
      maxSpawnDelay: 230,
      minTargetSize: 66,
      maxTargetSize: 78,
      targetLifetime: 850,
      description:
        "Цели исчезают всё быстрее. Промедление считается промахом, а результат сохраняется как личный рекорд."
    }
  };

  const elements = {
    arena: document.getElementById("arena"),
    playfield: document.getElementById("playfield"),
    target: document.getElementById("target"),
    overlay: document.getElementById("overlay"),
    startButton: document.getElementById("startButton"),
    playerName: document.getElementById("playerName"),
    menuEyebrow: document.getElementById("menuEyebrow"),
    menuTitle: document.getElementById("menuTitle"),
    menuDescription: document.getElementById("menuDescription"),
    resultGrid: document.getElementById("resultGrid"),
    resultHits: document.getElementById("resultHits"),
    resultAccuracy: document.getElementById("resultAccuracy"),
    resultReaction: document.getElementById("resultReaction"),
    timeValue: document.getElementById("timeValue"),
    hitsValue: document.getElementById("hitsValue"),
    missesValue: document.getElementById("missesValue"),
    accuracyValue: document.getElementById("accuracyValue"),
    reactionValue: document.getElementById("reactionValue"),
    modeHud: document.getElementById("modeHud"),
    inputBadge: document.getElementById("inputBadge"),
    rushBest: document.getElementById("rushBest"),
    modeButtons: [...document.querySelectorAll("[data-game-mode]")]
  };

  const state = {
    running: false,
    mode: "ranked",
    inputType: matchMedia("(pointer: coarse)").matches ? "touch" : "mouse",
    hits: 0,
    misses: 0,
    reactions: [],
    spawnAt: 0,
    endAt: 0,
    animationFrame: 0,
    spawnTimer: 0,
    lifetimeTimer: 0,
    target: null,
    roundToken: 0
  };

  elements.playerName.value = localStorage.getItem("aimTrainerName") || "";

  function modeConfig() {
    return MODES[state.mode];
  }

  function averageReaction() {
    if (!state.reactions.length) return null;
    return Math.round(
      state.reactions.reduce((sum, value) => sum + value, 0) /
        state.reactions.length
    );
  }

  function accuracy() {
    const attempts = state.hits + state.misses;
    return attempts ? Math.round((state.hits / attempts) * 100) : 100;
  }

  function updateStats(remaining = modeConfig().duration) {
    const reaction = averageReaction();
    elements.timeValue.textContent = (Math.max(0, remaining) / 1000).toFixed(1);
    elements.hitsValue.textContent = state.hits;
    elements.missesValue.textContent = state.misses;
    elements.accuracyValue.textContent = `${accuracy()}%`;
    elements.reactionValue.textContent =
      reaction === null ? "—" : `${reaction} мс`;
  }

  function updateInputType(pointerType) {
    if (pointerType === "touch" || pointerType === "pen") {
      state.inputType = "touch";
    } else if (pointerType === "mouse") {
      state.inputType = "mouse";
    }

    const label = state.inputType === "touch" ? "касание" : "мышь";
    elements.inputBadge.textContent = `Ввод: ${label}`;
    elements.modeHud.textContent = `${modeConfig().title} · Fair Play · ${label}`;
  }

  function updateRushBest() {
    elements.rushBest.textContent = Number(localStorage.getItem(RUSH_BEST_KEY)) || 0;
  }

  function setMode(mode) {
    if (state.running || !MODES[mode]) return;
    state.mode = mode;
    const config = modeConfig();

    for (const button of elements.modeButtons) {
      const active = button.dataset.gameMode === mode;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    }

    elements.menuEyebrow.textContent = config.eyebrow;
    elements.menuTitle.textContent = config.title.toUpperCase();
    elements.menuDescription.textContent = config.description;
    elements.startButton.textContent =
      mode === "ranked" ? "Начать рейтинг" : "Начать испытание";
    document.getElementById("rankBanner").hidden = true;
    updateStats();
    updateInputType();
  }

  function resizePlayfield() {
    const rect = elements.arena.getBoundingClientRect();
    const inset = 18;
    const maxWidth = Math.max(200, rect.width - inset * 2);
    const maxHeight = Math.max(180, rect.height - inset * 2);

    let width = maxWidth;
    let height = width / FIELD_ASPECT;

    if (height > maxHeight) {
      height = maxHeight;
      width = height * FIELD_ASPECT;
    }

    elements.playfield.style.width = `${width}px`;
    elements.playfield.style.height = `${height}px`;

    if (state.target) placeTarget(state.target);
  }

  function hideTarget() {
    clearTimeout(state.lifetimeTimer);
    state.target = null;
    elements.target.classList.remove("visible");
    elements.target.setAttribute("aria-hidden", "true");
  }

  function placeTarget(targetData) {
    const rect = elements.playfield.getBoundingClientRect();
    const scale = Math.min(rect.width / VIRTUAL_WIDTH, rect.height / VIRTUAL_HEIGHT);
    const size = targetData.size * scale;

    elements.target.style.setProperty("--size", `${size}px`);
    elements.target.style.left = `${targetData.x * scale}px`;
    elements.target.style.top = `${targetData.y * scale}px`;
  }

  function currentLifetime() {
    const config = modeConfig();
    if (!config.targetLifetime) return null;

    const elapsed = config.duration - Math.max(0, state.endAt - performance.now());
    const progress = Math.min(1, elapsed / config.duration);
    return Math.max(360, config.targetLifetime - progress * 420);
  }

  function showTarget() {
    if (!state.running) return;

    const config = modeConfig();
    const size =
      config.minTargetSize +
      Math.random() * (config.maxTargetSize - config.minTargetSize);
    const padding = 20;

    state.target = {
      x: padding + Math.random() * (VIRTUAL_WIDTH - size - padding * 2),
      y: padding + Math.random() * (VIRTUAL_HEIGHT - size - padding * 2),
      size
    };

    placeTarget(state.target);
    state.spawnAt = performance.now();
    elements.target.classList.add("visible");
    elements.target.setAttribute("aria-hidden", "false");

    const lifetime = currentLifetime();
    if (lifetime) {
      const token = state.roundToken;
      state.lifetimeTimer = window.setTimeout(() => {
        if (!state.running || token !== state.roundToken || !state.target) return;
        state.misses += 1;
        document.dispatchEvent(
          new CustomEvent("aim:miss", {
            detail: { misses: state.misses, reason: "timeout", mode: state.mode }
          })
        );
        updateStats(state.endAt - performance.now());
        scheduleTarget();
      }, lifetime);
    }
  }

  function scheduleTarget() {
    clearTimeout(state.spawnTimer);
    hideTarget();
    if (!state.running) return;

    const config = modeConfig();
    const delay =
      config.minSpawnDelay +
      Math.random() * (config.maxSpawnDelay - config.minSpawnDelay);
    state.spawnTimer = window.setTimeout(showTarget, delay);
  }

  function pointerToVirtual(event) {
    const rect = elements.playfield.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * VIRTUAL_WIDTH,
      y: ((event.clientY - rect.top) / rect.height) * VIRTUAL_HEIGHT
    };
  }

  function hitTest(point) {
    if (!state.target) return false;
    const centerX = state.target.x + state.target.size / 2;
    const centerY = state.target.y + state.target.size / 2;
    const dx = point.x - centerX;
    const dy = point.y - centerY;
    const radius = state.target.size / 2;
    return dx * dx + dy * dy <= radius * radius;
  }

  function createMissMarker(event) {
    const rect = elements.playfield.getBoundingClientRect();
    const marker = document.createElement("i");
    marker.className = "miss-marker";
    marker.style.left = `${event.clientX - rect.left}px`;
    marker.style.top = `${event.clientY - rect.top}px`;
    elements.playfield.appendChild(marker);
    window.setTimeout(() => marker.remove(), 450);
  }

  function tick() {
    if (!state.running) return;
    const remaining = state.endAt - performance.now();
    updateStats(remaining);

    if (remaining <= 0) {
      finishRound();
      return;
    }

    state.animationFrame = requestAnimationFrame(tick);
  }

  const sleep = (milliseconds) =>
    new Promise((resolve) => window.setTimeout(resolve, milliseconds));

  async function startRound() {
    if (state.running || elements.startButton.disabled) return;

    const name = elements.playerName.value.trim().slice(0, 20);
    if (!name) {
      elements.playerName.focus();
      elements.playerName.style.borderColor = "var(--accent)";
      return;
    }

    localStorage.setItem("aimTrainerName", name);
    elements.playerName.style.borderColor = "";
    elements.startButton.disabled = true;
    elements.resultGrid.classList.remove("show");
    document.getElementById("rankBanner").hidden = true;

    state.hits = 0;
    state.misses = 0;
    state.reactions = [];
    state.roundToken += 1;
    updateStats();

    elements.menuEyebrow.textContent = "Приготовься";
    elements.menuDescription.textContent = `${modeConfig().title}: одинаковое виртуальное поле для всех устройств.`;

    document.dispatchEvent(
      new CustomEvent("aim:round-start", {
        detail: { mode: state.mode, inputType: state.inputType }
      })
    );

    for (let number = 3; number > 0; number -= 1) {
      elements.menuTitle.textContent = number;
      await sleep(600);
    }

    elements.menuTitle.textContent = "GO!";
    await sleep(300);

    elements.overlay.classList.add("hidden");
    elements.modeHud.classList.add("visible");
    state.running = true;
    state.endAt = performance.now() + modeConfig().duration;
    resizePlayfield();
    scheduleTarget();
    tick();
  }

  function finishRound() {
    if (!state.running) return;

    state.running = false;
    clearTimeout(state.spawnTimer);
    clearTimeout(state.lifetimeTimer);
    cancelAnimationFrame(state.animationFrame);
    hideTarget();
    updateStats(0);

    const reaction = averageReaction();
    const entry = {
      name: elements.playerName.value.trim().slice(0, 20),
      score: state.hits,
      accuracy: accuracy(),
      reaction: reaction || 9999,
      created_at: new Date().toISOString()
    };

    if (state.mode === "rush") {
      const previousBest = Number(localStorage.getItem(RUSH_BEST_KEY)) || 0;
      if (entry.score > previousBest) {
        localStorage.setItem(RUSH_BEST_KEY, String(entry.score));
      }
      updateRushBest();
    }

    elements.resultHits.textContent = entry.score;
    elements.resultAccuracy.textContent = `${entry.accuracy}%`;
    elements.resultReaction.textContent =
      reaction === null ? "—" : `${reaction} мс`;
    elements.menuEyebrow.textContent =
      state.mode === "ranked" ? "Раунд завершён" : "Focus Rush завершён";
    elements.menuTitle.innerHTML = `${entry.score}<br>ЦЕЛЕЙ`;
    elements.menuDescription.textContent =
      state.mode === "ranked"
        ? "Результат сохранён в рейтинге. Поле и зона попадания одинаковы на всех устройствах."
        : `Личный рекорд Focus Rush: ${Number(localStorage.getItem(RUSH_BEST_KEY)) || 0}.`;
    elements.resultGrid.classList.add("show");
    elements.startButton.textContent =
      state.mode === "ranked" ? "Играть рейтинг" : "Повторить Rush";
    elements.startButton.disabled = false;
    elements.overlay.classList.remove("hidden");
    elements.modeHud.classList.remove("visible");

    document.dispatchEvent(
      new CustomEvent("aim:round-end", {
        detail: {
          entry,
          hits: state.hits,
          misses: state.misses,
          reaction,
          accuracy: entry.accuracy,
          mode: state.mode,
          inputType: state.inputType,
          ranked: state.mode === "ranked"
        }
      })
    );
  }

  elements.playfield.addEventListener("pointerdown", (event) => {
    if (!state.running) return;

    event.preventDefault();
    updateInputType(event.pointerType);
    const point = pointerToVirtual(event);

    if (hitTest(point)) {
      const reaction = performance.now() - state.spawnAt;
      state.hits += 1;
      state.reactions.push(reaction);
      updateStats(state.endAt - performance.now());

      document.dispatchEvent(
        new CustomEvent("aim:hit", {
          detail: { reaction, hits: state.hits, mode: state.mode }
        })
      );

      scheduleTarget();
      return;
    }

    state.misses += 1;
    createMissMarker(event);
    updateStats(state.endAt - performance.now());

    document.dispatchEvent(
      new CustomEvent("aim:miss", {
        detail: { misses: state.misses, reason: "click", mode: state.mode }
      })
    );
  });

  for (const button of elements.modeButtons) {
    button.addEventListener("click", () => setMode(button.dataset.gameMode));
  }

  elements.startButton.addEventListener("click", startRound);
  window.addEventListener("resize", resizePlayfield);
  window.visualViewport?.addEventListener("resize", resizePlayfield);

  AimTrainer.game = {
    getState: () => ({ ...state }),
    getMode: () => state.mode,
    setMode,
    startRound,
    finishRound,
    resizePlayfield
  };

  updateRushBest();
  updateInputType();
  setMode("ranked");
  resizePlayfield();
})();