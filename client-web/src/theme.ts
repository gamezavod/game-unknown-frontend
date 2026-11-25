/** Цвет страницы и системных зон браузера соответствует текущему экрану. */
export function syncBrowserTheme() {
  const night = document.body.classList.contains("night");
  const inSection = document.body.classList.contains("match3-open")
    || document.body.classList.contains("home-section-open");
  const color = inSection
    ? night ? "#0d202b" : "#f1f5ef"
    : night ? "#102a40" : "#b8d2ce";
  const scheme = night ? "dark" : "light";
  document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute("content", color);
  document.querySelector<HTMLMetaElement>('meta[name="color-scheme"]')?.setAttribute("content", scheme);
  document.documentElement.style.backgroundColor = color;
  document.body.style.backgroundColor = color;
  document.documentElement.style.colorScheme = scheme;
}

export function mountSystemTheme() {
  const preference = window.matchMedia("(prefers-color-scheme: dark)");
  const apply = () => {
    document.body.classList.toggle("night", preference.matches);
    // Меняем оформление на месте, сохраняя поле, модальное окно и анимации.
    document.querySelector("#match3 .m3-screen")?.classList.toggle("m3-screen--night", preference.matches);
    syncBrowserTheme();
  };
  apply();
  preference.addEventListener("change", apply);
}
