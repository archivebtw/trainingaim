window.AIM_CONFIG = {
  // Публичные данные проекта Supabase для онлайн-рейтинга.
  // Никогда не добавляй сюда secret или service_role key.
  supabaseUrl: "https://edadwxggqqjugldngfll.supabase.co",
  supabaseAnonKey: "sb_publishable_mOwditWAOlsz5Xq32b2g8g_6goNvfz0"
};

// index.html загружает этот файл с defer, поэтому первая проверка рейтинга
// может пройти раньше конфигурации. После загрузки повторно запрашиваем топ.
window.setTimeout(() => {
  if (typeof window.loadScores === "function") {
    window.loadScores();
  }
}, 0);
