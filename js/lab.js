(() => {
  "use strict";

  const STORAGE_KEY = "aimTrainerLabHistoryV1";
  const elements = {
    modal: document.getElementById("labModal"),
    close: document.getElementById("labCloseButton"),
    open: document.getElementById("labOpenButton"),
    score: document.getElementById("labAimScore"),
    stability: document.getElementById("labStability"),
    best: document.getElementById("labBestReaction"),
    worst: document.getElementById("labWorstReaction"),
    mode: document.getElementById("labMode"),
    reactionCanvas: document.getElementById("reactionCanvas"),
    heatCanvas: document.getElementById("heatCanvas"),
    recommendation: document.getElementById("labRecommendation")
  };

  let lastAnalysis = null;

  function average(values) {
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
  }

  function standardDeviation(values) {
    if (values.length < 2) return 0;
    const mean = average(values);
    return Math.sqrt(average(values.map((value) => (value - mean) ** 2)));
  }

  function calculateAnalysis(detail) {
    const reactions = (detail.samples || [])
      .filter((sample) => sample.hit && Number.isFinite(sample.reaction))
      .map((sample) => sample.reaction);
    const avgReaction = reactions.length ? Math.round(average(reactions)) : 9999;
    const deviation = standardDeviation(reactions);
    const stability = reactions.length
      ? Math.max(0, Math.min(100, Math.round(100 - (deviation / Math.max(avgReaction, 1)) * 100)))
      : 0;
    const speedScore = avgReaction === 9999 ? 0 : Math.max(0, Math.min(400, Math.round(160000 / Math.max(avgReaction, 180))));
    const accuracyScore = Math.round((Number(detail.accuracy) || 0) * 3);
    const stabilityScore = Math.round(stability * 2);
    const comboScore = Math.min(100, (Number(detail.maxCombo) || 0) * 5);
    const aimScore = speedScore + accuracyScore + stabilityScore + comboScore;

    return {
      date: new Date().toISOString(),
      mode: detail.mode,
      score: Number(detail.entry?.score) || 0,
      accuracy: Number(detail.accuracy) || 0,
      averageReaction: avgReaction,
      bestReaction: reactions.length ? Math.round(Math.min(...reactions)) : 0,
      worstReaction: reactions.length ? Math.round(Math.max(...reactions)) : 0,
      stability,
      aimScore,
      samples: detail.samples || []
    };
  }

  function saveAnalysis(analysis) {
    let history = [];
    try {
      history = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      if (!Array.isArray(history)) history = [];
    } catch {
      history = [];
    }
    history.unshift(analysis);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(0, 20)));
  }

  function modeName(mode) {
    return {
      ranked: "Рейтинг",
      rush: "Focus Rush",
      precision: "Precision",
      speed: "Speed",
      microshot: "Microshot"
    }[mode] || mode;
  }

  function recommendation(analysis) {
    if (analysis.accuracy < 85) return "Сконцентрируйся на точности: следующий раунд лучше провести в режиме Precision.";
    if (analysis.averageReaction > 550) return "Скорость реакции проседает. Попробуй режим Speed и держи курсор ближе к центру поля.";
    if (analysis.stability < 70) return "Реакция нестабильна. Играй короче и ровнее: не спеши после каждого попадания.";
    const zones = [0, 0, 0, 0];
    for (const sample of analysis.samples.filter((item) => item.hit)) {
      const index = (sample.x >= 500 ? 1 : 0) + (sample.y >= 312.5 ? 2 : 0);
      zones[index] += sample.reaction || 0;
    }
    const weakest = zones.indexOf(Math.max(...zones));
    const names = ["левом верхнем", "правом верхнем", "левом нижнем", "правом нижнем"];
    return `Хороший результат. Самая медленная зона — в ${names[weakest]} секторе поля.`;
  }

  function setupCanvas(canvas, height = 240) {
    const width = Math.max(320, Math.round(canvas.clientWidth || 420));
    const ratio = window.devicePixelRatio || 1;
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    canvas.style.height = `${height}px`;
    const context = canvas.getContext("2d");
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    return { context, width, height };
  }

  function drawReactionGraph(analysis) {
    const { context, width, height } = setupCanvas(elements.reactionCanvas);
    const points = analysis.samples.filter((sample) => sample.hit && sample.reaction);
    context.clearRect(0, 0, width, height);
    context.strokeStyle = "rgba(255,255,255,.1)";
    context.lineWidth = 1;
    for (let i = 1; i < 5; i += 1) {
      const y = (height / 5) * i;
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(width, y);
      context.stroke();
    }
    if (!points.length) return;
    const max = Math.max(900, ...points.map((item) => item.reaction));
    context.strokeStyle = "#22d3ee";
    context.lineWidth = 2;
    context.beginPath();
    points.forEach((point, index) => {
      const x = points.length === 1 ? width / 2 : (index / (points.length - 1)) * width;
      const y = height - (point.reaction / max) * (height - 18) - 9;
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    context.stroke();
  }

  function drawHeatmap(analysis) {
    const { context, width, height } = setupCanvas(elements.heatCanvas);
    context.clearRect(0, 0, width, height);
    context.strokeStyle = "rgba(255,255,255,.1)";
    context.strokeRect(0.5, 0.5, width - 1, height - 1);
    for (const sample of analysis.samples) {
      const x = (sample.x / 1000) * width;
      const y = (sample.y / 625) * height;
      const radius = sample.hit ? 17 : 12;
      const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
      gradient.addColorStop(0, sample.hit ? "rgba(66,245,164,.7)" : "rgba(255,59,92,.7)");
      gradient.addColorStop(1, "rgba(0,0,0,0)");
      context.fillStyle = gradient;
      context.beginPath();
      context.arc(x, y, radius, 0, Math.PI * 2);
      context.fill();
    }
  }

  function render(analysis) {
    if (!analysis) return;
    elements.score.textContent = analysis.aimScore;
    elements.stability.textContent = `${analysis.stability}%`;
    elements.best.textContent = analysis.bestReaction ? `${analysis.bestReaction} мс` : "—";
    elements.worst.textContent = analysis.worstReaction ? `${analysis.worstReaction} мс` : "—";
    elements.mode.textContent = modeName(analysis.mode);
    elements.recommendation.textContent = recommendation(analysis);
    drawReactionGraph(analysis);
    drawHeatmap(analysis);
  }

  function open() {
    if (!lastAnalysis) return;
    render(lastAnalysis);
    elements.modal.classList.add("show");
    elements.modal.setAttribute("aria-hidden", "false");
  }

  function close() {
    elements.modal.classList.remove("show");
    elements.modal.setAttribute("aria-hidden", "true");
  }

  document.addEventListener("aim:round-end", (event) => {
    lastAnalysis = calculateAnalysis(event.detail);
    saveAnalysis(lastAnalysis);
    elements.open.hidden = false;
    elements.open.textContent = `Разбор раунда · Aim Score ${lastAnalysis.aimScore}`;
  });

  elements.open.addEventListener("click", open);
  elements.close.addEventListener("click", close);
  elements.modal.addEventListener("pointerdown", (event) => {
    if (event.target === elements.modal) close();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") close();
  });
  window.addEventListener("resize", () => {
    if (elements.modal.classList.contains("show")) render(lastAnalysis);
  });
})();