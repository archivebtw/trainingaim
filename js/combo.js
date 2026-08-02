(() => {
  "use strict";

  const AimTrainer = (window.AimTrainer = window.AimTrainer || {});
  const PROFILE_KEY = "aimTrainerProfileV3";
  const SOUND_KEY = "aimTrainerSoundV1";

  const elements = {
    arena: document.getElementById("arena"),
    comboValue: document.getElementById("comboValue"),
    soundButton: document.getElementById("soundButton"),
    profileBest: document.getElementById("profileBest"),
    profileRounds: document.getElementById("profileRounds"),
    profileCombo: document.getElementById("profileCombo"),
    rankBanner: document.getElementById("rankBanner")
  };

  let streak = 0;
  let maxStreak = 0;
  let soundEnabled = localStorage.getItem(SOUND_KEY) !== "off";
  let audioContext = null;

  function readProfile() {
    try {
      const saved = JSON.parse(localStorage.getItem(PROFILE_KEY) || "{}");
      return {
        best: Number(saved.best) || 0,
        rounds: Number(saved.rounds) || 0,
        combo: Number(saved.combo) || 0
      };
    } catch {
      return { best: 0, rounds: 0, combo: 0 };
    }
  }

  function saveProfile(profile) {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  }

  function drawProfile() {
    const profile = readProfile();
    elements.profileBest.textContent = profile.best;
    elements.profileRounds.textContent = profile.rounds;
    elements.profileCombo.textContent = `${profile.combo}×`;
  }

  function rankLabel(score) {
    if (score >= 50) return "👑 Мастер";
    if (score >= 40) return "💎 Алмаз";
    if (score >= 30) return "🥇 Золото";
    if (score >= 20) return "🥈 Серебро";
    return "🥉 Бронза";
  }

  function beep(frequency = 650, duration = 0.06) {
    if (!soundEnabled) return;

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;

    audioContext = audioContext || new AudioContextClass();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();

    oscillator.type = "square";
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.025, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(
      0.0001,
      audioContext.currentTime + duration
    );

    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + duration);
  }

  function updateSoundButton() {
    elements.soundButton.textContent = soundEnabled ? "🔊" : "🔇";
  }

  function updateCombo() {
    elements.comboValue.textContent = `${streak}×`;
  }

  function showComboEffect() {
    if (streak < 5 || streak % 5 !== 0) return;

    const effect = document.createElement("div");
    effect.className = "combo-fx";
    effect.textContent = `${streak}× COMBO`;
    elements.arena.appendChild(effect);
    window.setTimeout(() => effect.remove(), 750);
  }

  document.addEventListener("aim:round-start", () => {
    streak = 0;
    maxStreak = 0;
    updateCombo();
  });

  document.addEventListener("aim:hit", () => {
    streak += 1;
    maxStreak = Math.max(maxStreak, streak);
    updateCombo();
    beep(streak % 5 === 0 ? 900 : 680);
    showComboEffect();
  });

  document.addEventListener("aim:miss", () => {
    streak = 0;
    updateCombo();
    beep(150, 0.09);
  });

  document.addEventListener("aim:round-end", (event) => {
    const profileBefore = readProfile();
    const score = Number(event.detail.entry.score) || 0;
    const isRanked = event.detail.mode === "ranked";

    const profileAfter = {
      best: isRanked ? Math.max(profileBefore.best, score) : profileBefore.best,
      rounds: profileBefore.rounds + 1,
      combo: Math.max(profileBefore.combo, maxStreak)
    };

    saveProfile(profileAfter);
    drawProfile();

    event.detail.maxCombo = maxStreak;
    event.detail.profile = profileAfter;

    elements.rankBanner.hidden = false;
    elements.rankBanner.textContent = isRanked
      ? `${rankLabel(score)}${score > profileBefore.best ? " · Новый рекорд!" : ""}`
      : "⚡ Focus Rush · личное испытание";
  });

  elements.soundButton.addEventListener("click", () => {
    soundEnabled = !soundEnabled;
    localStorage.setItem(SOUND_KEY, soundEnabled ? "on" : "off");
    updateSoundButton();
    if (soundEnabled) beep(800);
  });

  AimTrainer.combo = {
    rankLabel,
    getCurrentStreak: () => streak,
    getMaxStreak: () => maxStreak,
    readProfile
  };

  updateSoundButton();
  drawProfile();
})();