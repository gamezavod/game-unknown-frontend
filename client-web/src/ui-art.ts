/** SVG Penpot встраивается для наследования цвета; цветные SVG остаются файлами. */
export function renderArt(source: string, className = "") {
  if (source.startsWith("<svg")) {
    return `<span class="m3-art ${className}" aria-hidden="true">${source}</span>`;
  }
  return `<img class="m3-art ${className}" src="${source}" alt="" aria-hidden="true">`;
}
