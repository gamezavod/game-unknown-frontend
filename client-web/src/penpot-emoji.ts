/** Векторные исходники Noto Emoji, без растрового экспорта. */
export const match3Icons = {
  "backpack": "/ui/noto-emoji/emoji_u1f392.svg",
  "worker": "/ui/noto-emoji/emoji_u1f477.svg",
  "win": "/ui/noto-emoji/emoji_u1f389.svg",
  "basket": "/ui/noto-emoji/emoji_u1f9fa.svg",
  "box": "/ui/noto-emoji/emoji_u1f4e6.svg",
  "resultTree": "/ui/noto-emoji/emoji_u1f333.svg",
} as const;
export type Match3IconName = keyof typeof match3Icons;
