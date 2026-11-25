import { penpotHomeIcons } from "./penpot-home-icons";
import { syncBrowserTheme } from "./theme";
import { renderArt } from "./ui-art";

const sections = {
  settlement: "Здесь появятся жители и постройки острова.",
  technology: "Здесь можно будет изучать технологии острова.",
  stats: "Здесь появятся показатели острова за игровые дни.",
} as const;

export function mountHomeNavigation() {
  const game = document.getElementById("home-game")!;
  const preview = document.getElementById("home-section")!;
  const title = document.getElementById("home-section-title")!;
  const icon = preview.querySelector<HTMLElement>(".home-section-icon")!;
  const description = preview.querySelector<HTMLElement>(".home-section-description")!;
  const buttons = document.querySelectorAll<HTMLButtonElement>(".home-nav [data-home-tab]");

  for (const button of buttons) {
    const name = button.dataset.homeTab as "game" | keyof typeof sections;
    button.addEventListener("click", () => {
      if (button.hasAttribute("aria-current")) return;
      const onIsland = name === "game";
      for (const tab of buttons) tab.removeAttribute("aria-current");
      button.setAttribute("aria-current", "page");
      game.hidden = !onIsland;
      preview.hidden = onIsland;
      document.body.classList.toggle("home-section-open", !onIsland);
      syncBrowserTheme();

      if (!onIsland) {
        title.textContent = button.textContent.trim();
        description.textContent = sections[name];
        icon.innerHTML = renderArt(penpotHomeIcons[name]);
        title.focus({ preventScroll: true });
      }
    });
  }
}
