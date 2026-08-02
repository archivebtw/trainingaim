(() => {
  "use strict";

  const STORE = "aimChallengeProfileV1";
  const ATTEMPTS = "aimChallengeAttemptsV1";
  const GHOST = "aimChallengeGhostV1";
  const VIRTUAL_WIDTH = 1000;
  const VIRTUAL_HEIGHT = 625;
  const TARGETS = 40;
  const ROUND_MS = 25000;

  const el = (id) => document.getElementById(id);
  const ui = {
    open: el("challengeOpenButton"), modal: el("challengeModal"), close: el("challengeCloseButton"), start: el("challengeStartButton"), refresh: el("challengeRefreshButton"),
    date: el("challengeDate"), seed: el("challengeSeed"), streak: el("challengeStreak"), best: el("challengeBest"), goal: el("challengeGoal"), calendar: el("challengeCalendar"), ranking: el("challengeRanking"), status: el("challengeStatus"),
    arena: el("arena"), playfield: el("playfield"), target: el("target"), overlay: el("overlay"), modeHud: el("modeHud"), playerName: el("playerName")
  };

  let running = false, index = 0, hits = 0, misses = 0, startedAt = 0, spawnAt = 0, timer = 0, frame = 0, current = null, reactions = [], hitTimes = [], ghostDot = null, ghostDelta = null;

  function read(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } }
  function write(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
  function todayKey() { return new Date().toISOString().slice(0, 10); }
  function seedNumber() { return Number(todayKey().replaceAll("-", "")); }
  function monday(date = new Date()) { const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())); const day = d.getUTCDay() || 7; d.setUTCDate(d.getUTCDate() - day + 1); return d.toISOString().slice(0, 10); }
  function rng(seed) { let value = seed >>> 0; return () => { value = (value * 1664525 + 1013904223) >>> 0; return value / 4294967296; }; }
  function sequence() { const random = rng(seedNumber()); return Array.from({ length: TARGETS }, (_, i) => ({ x: 40 + random() * 870, y: 40 + random() * 495, size: 58 + random() * 18, delay: 90 + random() * 250, lifetime: Math.max(430, 920 - i * 9) })); }
  function sequenceHash(items) { let h = 2166136261; for (const item of items) { const text = `${Math.round(item.x)}:${Math.round(item.y)}:${Math.round(item.size)};`; for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); } } return (h >>> 0).toString(16); }
  function config() { return window.AIM_CONFIG || {}; }
  function profile() { return { days: [], best: 0, bestAccuracy: 0, ...read(STORE, {}) }; }
  function attempts() { const saved = read(ATTEMPTS, {}); return saved.date === todayKey() ? saved.count || 0 : 0; }

  function updateActivity(result) {
    const p = profile();
    if (!p.days.includes(todayKey())) p.days.push(todayKey());
    p.days = p.days.slice(-60);
    p.best = Math.max(p.best, result.score);
    p.bestAccuracy = Math.max(p.bestAccuracy, result.accuracy);
    write(STORE, p);
    write(ATTEMPTS, { date: todayKey(), count: attempts() + 1 });
  }

  function streakCount(days) {
    const set = new Set(days); let total = 0; const d = new Date();
    for (;;) { const key = d.toISOString().slice(0, 10); if (!set.has(key)) break; total += 1; d.setUTCDate(d.getUTCDate() - 1); }
    return total;
  }

  function renderCalendar() {
    const p = profile(), set = new Set(p.days), start = new Date(); start.setUTCDate(start.getUTCDate() - 6); ui.calendar.replaceChildren();
    for (let i = 0; i < 7; i++) { const d = new Date(start); d.setUTCDate(start.getUTCDate() + i); const key = d.toISOString().slice(0, 10); const box = document.createElement("div"); box.className = `challenge-day${set.has(key) ? " done" : ""}`; box.innerHTML = `<strong>${["Вс","Пн","Вт","Ср","Чт","Пт","Сб"][d.getUTCDay()]}</strong><small>${String(d.getUTCDate()).padStart(2,"0")}</small>`; ui.calendar.appendChild(box); }
    ui.streak.textContent = streakCount(p.days);
    ui.best.textContent = p.best;
    const target = Math.max(p.best + 2, 20); ui.goal.textContent = `Персональная цель: набрать ${target} очков или точность выше ${Math.max(90, p.bestAccuracy)}%.`;
  }

  function open() { ui.modal.classList.add("show"); ui.modal.setAttribute("aria-hidden", "false"); render(); loadRanking(); }
  function close() { if (running) return; ui.modal.classList.remove("show"); ui.modal.setAttribute("aria-hidden", "true"); }
  function render() { ui.date.textContent = new Date().toLocaleDateString("ru-RU", { day: "2-digit", month: "long" }); ui.seed.textContent = seedNumber(); ui.status.textContent = `Попыток сегодня: ${attempts()}`; renderCalendar(); }

  function place(item) { const rect = ui.playfield.getBoundingClientRect(); const scale = Math.min(rect.width / VIRTUAL_WIDTH, rect.height / VIRTUAL_HEIGHT); ui.target.style.setProperty("--size", `${item.size * scale}px`); ui.target.style.left = `${item.x * scale}px`; ui.target.style.top = `${item.y * scale}px`; ui.target.classList.add("visible", "expiring"); ui.target.style.setProperty("--lifetime", `${item.lifetime}ms`); current = item; spawnAt = performance.now(); }
  function hide() { ui.target.classList.remove("visible", "expiring"); current = null; clearTimeout(timer); }
  function virtualPoint(event) { const r = ui.playfield.getBoundingClientRect(); return { x: (event.clientX - r.left) / r.width * VIRTUAL_WIDTH, y: (event.clientY - r.top) / r.height * VIRTUAL_HEIGHT }; }
  function isHit(point) { if (!current) return false; const dx = point.x - (current.x + current.size / 2), dy = point.y - (current.y + current.size / 2); return dx * dx + dy * dy <= (current.size / 2) ** 2; }

  function showGhost() {
    const ghost = read(GHOST, null); if (!ghost || ghost.date !== todayKey() || !ghost.points?.length || !running) return;
    const elapsed = performance.now() - startedAt; let point = ghost.points[0]; for (const item of ghost.points) { if (item.t <= elapsed) point = item; else break; }
    if (!ghostDot) { ghostDot = document.createElement("i"); ghostDot.className = "ghost-dot"; ui.playfield.appendChild(ghostDot); }
    const r = ui.playfield.getBoundingClientRect(); ghostDot.style.left = `${point.x / VIRTUAL_WIDTH * r.width}px`; ghostDot.style.top = `${point.y / VIRTUAL_HEIGHT * r.height}px`;
    const mine = hitTimes.length ? hitTimes[hitTimes.length - 1].t : elapsed; const reference = ghost.points[Math.min(hitTimes.length, ghost.points.length - 1)]?.t || elapsed; const delta = mine - reference;
    if (!ghostDelta) { ghostDelta = document.createElement("div"); ghostDelta.className = "ghost-delta"; ui.arena.appendChild(ghostDelta); }
    ghostDelta.textContent = `${delta <= 0 ? "Опережение" : "Отставание"}: ${(Math.abs(delta) / 1000).toFixed(2)} c`;
  }

  function next() {
    hide(); if (!running || index >= TARGETS || performance.now() - startedAt >= ROUND_MS) return finish();
    const item = sequence()[index++]; timer = setTimeout(() => { place(item); timer = setTimeout(() => { if (!running || !current) return; misses++; next(); }, item.lifetime); }, item.delay);
  }

  function tick() { if (!running) return; showGhost(); if (performance.now() - startedAt >= ROUND_MS) return finish(); frame = requestAnimationFrame(tick); }

  async function start() {
    const name = ui.playerName.value.trim().slice(0, 20); if (!name) { ui.playerName.focus(); return; }
    close(); ui.modal.classList.remove("show"); ui.overlay.classList.add("hidden"); ui.modeHud.textContent = `Ежедневное испытание #${seedNumber()}`; ui.modeHud.classList.add("visible");
    running = true; index = hits = misses = 0; reactions = []; hitTimes = []; startedAt = performance.now(); next(); tick();
  }

  async function finish() {
    if (!running) return; running = false; hide(); cancelAnimationFrame(frame); ghostDot?.remove(); ghostDot = null; ghostDelta?.remove(); ghostDelta = null; ui.overlay.classList.remove("hidden"); ui.modeHud.classList.remove("visible");
    const duration = Math.min(ROUND_MS, Math.round(performance.now() - startedAt)); const accuracy = hits + misses ? Math.round(hits / (hits + misses) * 100) : 0; const reaction = reactions.length ? Math.round(reactions.reduce((a,b)=>a+b,0)/reactions.length) : 9999;
    const result = { name: ui.playerName.value.trim().slice(0,20), challenge_date: todayKey(), week_start: monday(), seed: seedNumber(), sequence_hash: sequenceHash(sequence()), score: hits, accuracy, reaction, duration_ms: Math.max(3000, duration), created_at: new Date().toISOString() };
    updateActivity(result); const old = read(GHOST, null); if (!old || old.date !== todayKey() || result.score > old.score) write(GHOST, { date: todayKey(), score: result.score, points: hitTimes });
    ui.status.textContent = `Результат: ${hits}/${TARGETS} · ${accuracy}% · ${reaction === 9999 ? "—" : reaction + " мс"}`; ui.modal.classList.add("show"); renderCalendar(); await saveOnline(result); await loadRanking();
  }

  async function saveOnline(result) { const c = config(); if (!c.supabaseUrl || !c.supabaseAnonKey) return; try { const response = await fetch(`${c.supabaseUrl}/rest/v1/aim_challenge_scores`, { method: "POST", headers: { apikey: c.supabaseAnonKey, Authorization: `Bearer ${c.supabaseAnonKey}`, "Content-Type": "application/json", Prefer: "return=minimal" }, body: JSON.stringify(result) }); if (!response.ok) throw new Error(String(response.status)); } catch { ui.status.textContent += " · запусти challenge_update.sql для онлайн-топа"; } }

  async function loadRanking() {
    const c = config(); ui.ranking.innerHTML = '<div class="challenge-message">Загрузка недельного рейтинга…</div>'; if (!c.supabaseUrl || !c.supabaseAnonKey) return;
    try { const q = `select=name,score,accuracy,reaction,created_at&week_start=eq.${monday()}&order=score.desc,reaction.asc,accuracy.desc&limit=50`; const response = await fetch(`${c.supabaseUrl}/rest/v1/aim_challenge_scores?${q}`, { headers: { apikey: c.supabaseAnonKey, Authorization: `Bearer ${c.supabaseAnonKey}` }, cache: "no-store" }); if (!response.ok) throw new Error(); const rows = await response.json(); const best = new Map(); for (const row of rows) { const key = row.name.toLowerCase(); const old = best.get(key); if (!old || row.score > old.score || row.score === old.score && row.reaction < old.reaction) best.set(key, row); }
      const list = [...best.values()].slice(0,10); ui.ranking.replaceChildren(); if (!list.length) ui.ranking.innerHTML = '<div class="challenge-message">На этой неделе результатов пока нет.</div>'; list.forEach((row,i)=>{ const div=document.createElement("div"); div.className="challenge-rank"; div.innerHTML=`<strong>${i+1}</strong><div><b></b><small>${row.accuracy}% · ${row.reaction} мс</small></div><strong>${row.score}</strong>`; div.querySelector("b").textContent=row.name; ui.ranking.appendChild(div); });
    } catch { ui.ranking.innerHTML = '<div class="challenge-message">Онлайн-рейтинг испытания ещё не подключён. Выполни challenge_update.sql в Supabase.</div>'; }
  }

  ui.playfield.addEventListener("pointerdown", (event) => { if (!running) return; event.preventDefault(); const point = virtualPoint(event); if (isHit(point)) { const reaction = performance.now() - spawnAt; hits++; reactions.push(reaction); hitTimes.push({ t: performance.now() - startedAt, x: current.x + current.size / 2, y: current.y + current.size / 2 }); next(); } else { misses++; } });
  ui.open.addEventListener("click", open); ui.close.addEventListener("click", close); ui.start.addEventListener("click", start); ui.refresh.addEventListener("click", loadRanking); ui.modal.addEventListener("pointerdown", (event) => { if (event.target === ui.modal) close(); });
  render();
})();