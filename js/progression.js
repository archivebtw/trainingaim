(() => {
  "use strict";

  const AimTrainer = (window.AimTrainer = window.AimTrainer || {});
  const PROGRESS_KEY = "aimTrainerProgressV1";
  const DAILY_KEY = "aimTrainerDailyV1";
  const HISTORY_KEY = "aimTrainerHistoryV1";

  const elements = {
    levelBadge: document.getElementById("levelBadge"),
    xpText: document.getElementById("xpText"),
    xpFill: document.getElementById("xpFill"),
    progressDot: document.getElementById("progressDot"),
    openButton: document.getElementById("progressOpenButton"),
    closeButton: document.getElementById("progressCloseButton"),
    modal: document.getElementById("progressModal"),
    tabs: [...document.querySelectorAll(".progress-tab")],
    panes: [...document.querySelectorAll(".progress-pane")],
    missionList: document.getElementById("missionList"),
    achievementList: document.getElementById("achievementList"),
    historyList: document.getElementById("historyList")
  };

  function read(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key));
      return value ?? fallback;
    } catch {
      return fallback;
    }
  }

  function write(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function dateKey() {
    return new Date().toISOString().slice(0, 10);
  }

  function getProgress() {
    const saved = read(PROGRESS_KEY, {});
    return {
      xp: Number(saved.xp) || 0,
      achievements: Array.isArray(saved.achievements) ? saved.achievements : []
    };
  }

  function getLevelData(totalXp) {
    let level = 1;
    let current = totalXp;
    let needed = 300;

    while (current >= needed) {
      current -= needed;
      level += 1;
      needed = 300 + (level - 1) * 100;
    }

    return {
      level,
      current,
      needed,
      percent: Math.min(100, Math.round((current / needed) * 100))
    };
  }

  function getMissions() {
    const daySeed = Number(dateKey().replaceAll("-", "").slice(-4));
    const score = 25 + (daySeed % 3) * 5;
    const accuracy = 85 + (daySeed % 3) * 5;
    const combo = 8 + (daySeed % 3) * 2;

    return [
      {
        id: "score",
        title: "Охотник",
        text: `Попади по ${score} целям за раунд`,
        target: score,
        reward: 120
      },
      {
        id: "accuracy",
        title: "Снайпер",
        text: `Заверши раунд с точностью ${accuracy}%`,
        target: accuracy,
        reward: 100
      },
      {
        id: "combo",
        title: "Без промаха",
        text: `Собери серию ${combo}×`,
        target: combo,
        reward: 140
      }
    ];
  }

  function getDaily() {
    const saved = read(DAILY_KEY, {});

    if (saved.date !== dateKey()) {
      return {
        date: dateKey(),
        done: {}
      };
    }

    return {
      date: saved.date,
      done: saved.done || {}
    };
  }

  function getHistory() {
    const saved = read(HISTORY_KEY, []);
    return Array.isArray(saved) ? saved : [];
  }

  function getAchievements() {
    return [
      {
        id: "first",
        icon: "🎯",
        title: "Первый шаг",
        text: "Завершить первый раунд"
      },
      {
        id: "score30",
        icon: "⚡",
        title: "Тридцатка",
        text: "Попасть по 30 целям за раунд"
      },
      {
        id: "accurate",
        icon: "🔭",
        title: "Идеальная рука",
        text: "Получить точность не ниже 95%"
      },
      {
        id: "combo10",
        icon: "🔥",
        title: "На серии",
        text: "Собрать серию 10×"
      },
      {
        id: "veteran",
        icon: "🏅",
        title: "Ветеран",
        text: "Завершить 25 раундов"
      }
    ];
  }

  function showToast(title, text) {
    document.querySelector(".progress-toast")?.remove();

    const toast = document.createElement("div");
    const heading = document.createElement("strong");
    const description = document.createElement("span");

    toast.className = "progress-toast";
    heading.textContent = title;
    description.textContent = text;
    toast.append(heading, description);
    document.body.appendChild(toast);

    window.setTimeout(() => toast.remove(), 3600);
  }

  function renderMissions(progressDaily) {
    elements.missionList.replaceChildren();

    for (const mission of getMissions()) {
      const item = document.createElement("div");
      const info = document.createElement("div");
      const title = document.createElement("strong");
      const text = document.createElement("small");
      const reward = document.createElement("div");
      const done = Boolean(progressDaily.done[mission.id]);

      item.className = `mission${done ? " done" : ""}`;
      title.textContent = `${done ? "✓ " : ""}${mission.title}`;
      text.textContent = mission.text;
      reward.className = "mission-reward";
      reward.textContent = `+${mission.reward} XP`;

      info.append(title, text);
      item.append(info, reward);
      elements.missionList.appendChild(item);
    }
  }

  function renderAchievements(progress) {
    const unlocked = new Set(progress.achievements);
    elements.achievementList.replaceChildren();

    for (const achievement of getAchievements()) {
      const item = document.createElement("div");
      const icon = document.createElement("div");
      const info = document.createElement("div");
      const title = document.createElement("strong");
      const text = document.createElement("small");
      const isUnlocked = unlocked.has(achievement.id);

      item.className = `achievement${isUnlocked ? " unlocked" : ""}`;
      icon.className = "achievement-icon";
      icon.textContent = achievement.icon;
      title.textContent = achievement.title;
      text.textContent = `${achievement.text}${isUnlocked ? " · Получено" : ""}`;

      info.append(title, text);
      item.append(icon, info);
      elements.achievementList.appendChild(item);
    }
  }

  function renderHistory() {
    const history = getHistory();
    elements.historyList.replaceChildren();

    if (!history.length) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = "Сыграй первый раунд, чтобы появилась история";
      elements.historyList.appendChild(empty);
      return;
    }

    for (const entry of history) {
      const row = document.createElement("div");
      const info = document.createElement("div");
      const date = document.createElement("strong");
      const details = document.createElement("small");
      const stats = document.createElement("div");
      const accuracy = document.createElement("small");

      row.className = "history-row";
      date.textContent = new Date(entry.date).toLocaleString("ru-RU", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit"
      });
      details.textContent =
        `Серия ${entry.combo}× · реакция ${entry.reaction || "—"} мс`;
      stats.className = "history-stats";
      stats.textContent = `${entry.score} целей`;
      accuracy.textContent = `${entry.accuracy}%`;
      stats.appendChild(accuracy);

      info.append(date, details);
      row.append(info, stats);
      elements.historyList.appendChild(row);
    }
  }

  function renderAll() {
    const progress = getProgress();
    const level = getLevelData(progress.xp);
    const daily = getDaily();
    const remaining = getMissions().filter((mission) => !daily.done[mission.id]).length;

    elements.levelBadge.textContent = `Уровень ${level.level}`;
    elements.xpText.textContent = `${level.current} / ${level.needed} XP`;
    elements.xpFill.style.width = `${level.percent}%`;
    elements.progressDot.textContent = remaining;
    elements.progressDot.style.display = remaining ? "inline-grid" : "none";

    renderMissions(daily);
    renderAchievements(progress);
    renderHistory();
  }

  function unlockAchievements(ids, progress) {
    const unlocked = new Set(progress.achievements);
    const newAchievements = [];
    let gainedXp = 0;

    for (const id of ids) {
      if (unlocked.has(id)) continue;

      unlocked.add(id);
      gainedXp += 75;

      const achievement = getAchievements().find((item) => item.id === id);
      if (achievement) newAchievements.push(achievement);
    }

    progress.achievements = [...unlocked];

    return {
      gainedXp,
      newAchievements
    };
  }

  function processRound(event) {
    const { entry } = event.detail;
    const combo = Number(event.detail.maxCombo) || 0;
    const rounds = Number(event.detail.profile?.rounds) || 0;
    const progress = getProgress();
    const levelBefore = getLevelData(progress.xp).level;
    const daily = getDaily();

    let earnedXp =
      Number(entry.score) * 3 +
      Math.floor(Number(entry.accuracy) / 10) +
      Math.floor(combo / 2);

    let missionXp = 0;

    for (const mission of getMissions()) {
      let completed = false;

      if (mission.id === "score") completed = entry.score >= mission.target;
      if (mission.id === "accuracy") completed = entry.accuracy >= mission.target;
      if (mission.id === "combo") completed = combo >= mission.target;

      if (completed && !daily.done[mission.id]) {
        daily.done[mission.id] = true;
        missionXp += mission.reward;
      }
    }

    write(DAILY_KEY, daily);

    const achievementIds = [];
    if (rounds >= 1) achievementIds.push("first");
    if (entry.score >= 30) achievementIds.push("score30");
    if (entry.accuracy >= 95) achievementIds.push("accurate");
    if (combo >= 10) achievementIds.push("combo10");
    if (rounds >= 25) achievementIds.push("veteran");

    const unlocked = unlockAchievements(achievementIds, progress);

    earnedXp += missionXp + unlocked.gainedXp;
    progress.xp += earnedXp;
    write(PROGRESS_KEY, progress);

    const history = getHistory();
    history.unshift({
      date: entry.created_at,
      score: entry.score,
      accuracy: entry.accuracy,
      reaction: entry.reaction === 9999 ? 0 : entry.reaction,
      combo
    });
    write(HISTORY_KEY, history.slice(0, 12));

    renderAll();

    const levelAfter = getLevelData(progress.xp).level;

    if (levelAfter > levelBefore) {
      showToast(`Новый уровень: ${levelAfter}`, `Получено ${earnedXp} XP за раунд`);
    } else if (unlocked.newAchievements.length) {
      showToast(
        `Достижение: ${unlocked.newAchievements[0].title}`,
        `Получено ${earnedXp} XP за раунд`
      );
    } else if (missionXp) {
      showToast("Задание выполнено", `Получено ${earnedXp} XP за раунд`);
    } else {
      showToast(`+${earnedXp} XP`, `Уровень ${levelAfter} · серия ${combo}×`);
    }
  }

  function openModal() {
    elements.modal.classList.add("show");
    elements.modal.setAttribute("aria-hidden", "false");
    renderAll();
  }

  function closeModal() {
    elements.modal.classList.remove("show");
    elements.modal.setAttribute("aria-hidden", "true");
  }

  elements.openButton.addEventListener("click", openModal);
  elements.closeButton.addEventListener("click", closeModal);

  elements.modal.addEventListener("pointerdown", (event) => {
    if (event.target === elements.modal) closeModal();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeModal();
  });

  for (const tab of elements.tabs) {
    tab.addEventListener("click", () => {
      for (const item of elements.tabs) {
        item.classList.toggle("active", item === tab);
      }

      for (const pane of elements.panes) {
        pane.classList.toggle(
          "active",
          pane.id === `progressPane-${tab.dataset.progressTab}`
        );
      }
    });
  }

  document.addEventListener("aim:round-end", processRound);

  AimTrainer.progression = {
    renderAll,
    getProgress,
    getLevelData,
    getMissions,
    getAchievements,
    getHistory,
    openModal,
    closeModal
  };

  renderAll();
})();
