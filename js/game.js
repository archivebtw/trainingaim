(() => {
  "use strict";

  const AimTrainer = (window.AimTrainer = window.AimTrainer || {});
  const ROUND_DURATION = 30_000;
  const MIN_SPAWN_DELAY = 120;
  const MAX_SPAWN_DELAY = 420;

  const elements = {
    arena: document.getElementById("arena"),
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
    reactionValue: document.getElementById("reactionValue")
  };

  const state = {
    running: false,
    hits: 0,
    misses: 0,
    reactions: [],
    spawnAt: 0,
    endAt: 0,
    animationFrame: 0,
    spawnTimer: 0
  };

  elements.playerName.value = localStorage.getItem("aimTrainerName") || "";

  function averageReaction() {
    if (!state.reactions.length) return null;
    const total = state.reactions.reduce((sum, value) => sum + value, 0);
    return Math.round(total / state.reactions.length);
  }

  function accuracy() {
    const attempts = state.hits + state.misses;
    return attempts ? Math.round((state.hits / attempts) * 100) : 100;
  }

  function updateStats(remaining = ROUND_DURATION) {
    const reaction = averageReaction();

    elements.timeValue.textContent = (Math.max(0, remaining) / 1000).toFixed(1);
    elements.hitsValue.textContent = state.hits;
    elements.missesValue.textContent = state.misses;
    elements.accuracyValue.textContent = `${accuracy()}%`;
    elements.reactionValue.textContent = reaction === null ? "—" : `${reaction} мс`;
  }

  function hideTarget() {
    elements.target.classList.remove("visible");
  }

  function showTarget() {
    if (!state.running) return;

    const arenaRect = elements.arena.getBoundingClientRect();
    const size = Math.round(48 + Math.random() * 24);
    const padding = 12;

    elements.target.style.setProperty("--size", `${size}px`);
    elements.target.style.left = `${padding + Math.random() * Math.max(1, arenaRect.width - size - padding * 2)}px`;
    elements.target.style.top = `${padding + Math.random() * Math.max(1, arenaRect.height - size - padding * 2)}px`;
    state.spawnAt = performance.now();
    elements.target.classList.add("visible");
  }

  function scheduleTarget() {
    clearTimeout(state.spawnTimer);
    hideTarget();

    if (!state.running) return;

    const delay = MIN_SPAWN_DELAY + Math.random() * (MAX_SPAWN_DELAY - MIN_SPAWN_DELAY);
    state.spawnTimer = window.setTimeout(showTarget, delay);
  }

  function createMissMarker(event) {
    const arenaRect = elements.arena.getBoundingClientRect();
    const marker = document.createElement("i");

    marker.className = "miss-marker";
    marker.style.left = `${event.clientX - arenaRect.left}px`;
    marker.style.top = `${event.clientY - arenaRect.top}px`;

    elements.arena.appendChild(marker);
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
    updateStats();

    elements.menuEyebrow.textContent = "Приготовься";
    elements.menuDescription.textContent = "Цели появятся после обратного отсчёта.";

    document.dispatchEvent(new CustomEvent("aim:round-start"));

    for (let number = 3; number > 0; number -= 1) {
      elements.menuTitle.textContent = number;
      await sleep(600);
    }

    elements.menuTitle.textContent = "GO!";
    await sleep(300);

    elements.overlay.classList.add("hidden");
    state.running = true;
    state.endAt = performance.now() + ROUND_DURATION;
    scheduleTarget();
    tick();
  }

  function finishRound() {
    if (!state.running) return;

    state.running = false;
    clearTimeout(state.spawnTimer);
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

    elements.resultHits.textContent = entry.score;
    elements.resultAccuracy.textContent = `${entry.accuracy}%`;
    elements.resultReaction.textContent = reaction === null ? "—" : `${reaction} мс`;
    elements.menuEyebrow.textContent = "Раунд завершён";
    elements.menuTitle.innerHTML = `${entry.score}<br>ЦЕЛЕЙ`;
    elements.menuDescription.textContent =
      "Результат сохранён. Попробуй улучшить скорость, точность и серию.";
    elements.resultGrid.classList.add("show");
    elements.startButton.textContent = "Играть ещё";
    elements.startButton.disabled = false;
    elements.overlay.classList.remove("hidden");

    document.dispatchEvent(
      new CustomEvent("aim:round-end", {
        detail: {
          entry,
          hits: state.hits,
          misses: state.misses,
          reaction,
          accuracy: entry.accuracy
        }
      })
    );
  }

  elements.target.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    event.stopPropagation();

    if (!state.running || !elements.target.classList.contains("visible")) return;

    const reaction = performance.now() - state.spawnAt;
    state.hits += 1;
    state.reactions.push(reaction);
    updateStats(state.endAt - performance.now());

    document.dispatchEvent(
      new CustomEvent("aim:hit", {
        detail: {
          reaction,
          hits: state.hits
        }
      })
    );

    scheduleTarget();
  });

  elements.arena.addEventListener("pointerdown", (event) => {
    if (!state.running) return;

    state.misses += 1;
    createMissMarker(event);
    updateStats(state.endAt - performance.now());

    document.dispatchEvent(
      new CustomEvent("aim:miss", {
        detail: {
          misses: state.misses
        }
      })
    );
  });

  elements.startButton.addEventListener("click", startRound);

  AimTrainer.game = {
    getState: () => ({ ...state }),
    startRound,
    finishRound
  };

  updateStats();
})();
