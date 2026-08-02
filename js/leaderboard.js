(() => {
  "use strict";

  const AimTrainer = (window.AimTrainer = window.AimTrainer || {});
  const LOCAL_KEY = "aimTrainerScoresV2";

  const elements = {
    scores: document.getElementById("scores"),
    status: document.getElementById("leaderboardStatus"),
    refreshButton: document.getElementById("refreshButton"),
    tabs: [...document.querySelectorAll(".tab")]
  };

  let currentTab = "global";

  function config() {
    return window.AIM_CONFIG || {};
  }

  function onlineReady() {
    const { supabaseUrl, supabaseAnonKey } = config();
    return Boolean(
      supabaseUrl &&
      supabaseAnonKey &&
      !supabaseUrl.includes("YOUR_") &&
      !supabaseAnonKey.includes("YOUR_")
    );
  }

  function sortScores(left, right) {
    return (
      right.score - left.score ||
      left.reaction - right.reaction ||
      right.accuracy - left.accuracy
    );
  }

  function bestPerNickname(list) {
    const best = new Map();

    for (const entry of list || []) {
      const key = String(entry.name || "").trim().toLowerCase();
      if (!key) continue;

      const previous = best.get(key);
      if (!previous || sortScores(entry, previous) < 0) {
        best.set(key, entry);
      }
    }

    return [...best.values()].sort(sortScores);
  }

  function rankLabel(score) {
    if (score >= 50) return "👑 Мастер";
    if (score >= 40) return "💎 Алмаз";
    if (score >= 30) return "🥇 Золото";
    if (score >= 20) return "🥈 Серебро";
    return "🥉 Бронза";
  }

  function readLocalScores() {
    try {
      const stored = JSON.parse(localStorage.getItem(LOCAL_KEY) || "[]");
      return Array.isArray(stored) ? stored : [];
    } catch {
      return [];
    }
  }

  function saveLocal(entry) {
    const list = readLocalScores();
    list.push(entry);
    list.sort(sortScores);
    localStorage.setItem(LOCAL_KEY, JSON.stringify(list.slice(0, 100)));
  }

  async function saveOnline(entry) {
    if (!onlineReady()) return false;

    const response = await fetch(`${config().supabaseUrl}/rest/v1/aim_scores`, {
      method: "POST",
      headers: {
        apikey: config().supabaseAnonKey,
        Authorization: `Bearer ${config().supabaseAnonKey}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal"
      },
      body: JSON.stringify(entry)
    });

    if (!response.ok) {
      throw new Error(`Не удалось сохранить результат: HTTP ${response.status}`);
    }

    return true;
  }

  async function getOnlineScores() {
    if (!onlineReady()) return null;

    const query =
      "select=name,score,accuracy,reaction,created_at" +
      "&order=score.desc,reaction.asc,accuracy.desc" +
      "&limit=100";

    const response = await fetch(
      `${config().supabaseUrl}/rest/v1/aim_scores?${query}`,
      {
        headers: {
          apikey: config().supabaseAnonKey,
          Authorization: `Bearer ${config().supabaseAnonKey}`
        },
        cache: "no-store"
      }
    );

    if (!response.ok) {
      throw new Error(`Не удалось загрузить рейтинг: HTTP ${response.status}`);
    }

    return response.json();
  }

  function render(list) {
    const filtered = bestPerNickname(list);
    const currentName = (localStorage.getItem("aimTrainerName") || "").toLowerCase();

    elements.scores.replaceChildren();

    if (!filtered.length) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = "Результатов пока нет";
      elements.scores.appendChild(empty);
      return;
    }

    filtered.slice(0, 50).forEach((entry, index) => {
      const row = document.createElement("div");
      const player = document.createElement("div");
      const name = document.createElement("strong");
      const meta = document.createElement("small");
      const rank = document.createElement("span");

      row.className = "score";
      if (index === 0) row.classList.add("leader");
      if (String(entry.name).toLowerCase() === currentName) row.classList.add("me");

      player.className = "player";
      name.textContent = entry.name;
      meta.textContent = `${entry.accuracy}% · ${
        entry.reaction === 9999 ? "—" : `${entry.reaction} мс`
      }`;
      rank.className = "rank-tag";
      rank.textContent = rankLabel(Number(entry.score));

      player.append(name, meta, rank);
      row.innerHTML = `<div class="rank">${index + 1}</div>`;
      row.append(player);

      const points = document.createElement("div");
      points.className = "points";
      points.textContent = entry.score;
      row.append(points);

      elements.scores.appendChild(row);
    });
  }

  async function loadScores() {
    elements.status.textContent = "Обновление…";

    if (currentTab === "local") {
      render(readLocalScores());
      elements.status.textContent = "Результаты сохранены только в этом браузере";
      return;
    }

    try {
      const online = await getOnlineScores();

      if (online === null) {
        render(readLocalScores());
        elements.status.textContent = "Онлайн-рейтинг не подключён — показан локальный топ";
        return;
      }

      render(online);
      elements.status.textContent = "Общий рейтинг игроков";
    } catch (error) {
      console.error(error);
      render(readLocalScores());
      elements.status.textContent = "Ошибка соединения — показан локальный топ";
    }
  }

  document.addEventListener("aim:round-end", async (event) => {
    const { entry } = event.detail;
    saveLocal(entry);

    try {
      await saveOnline(entry);
    } catch (error) {
      console.error(error);
    }

    loadScores();
  });

  elements.refreshButton.addEventListener("click", loadScores);

  for (const tab of elements.tabs) {
    tab.addEventListener("click", () => {
      for (const item of elements.tabs) item.classList.toggle("active", item === tab);
      currentTab = tab.dataset.tab;
      loadScores();
    });
  }

  AimTrainer.leaderboard = {
    loadScores,
    render,
    saveLocal,
    saveOnline,
    getOnlineScores,
    bestPerNickname
  };

  loadScores();
})();
