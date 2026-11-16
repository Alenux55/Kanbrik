export const projectPalette = [
  { key: "teal", name: "Teal", color: "#ccfbf1" },
  { key: "blue", name: "Blue", color: "#dbeafe" },
  { key: "violet", name: "Violet", color: "#ede9fe" },
  { key: "amber", name: "Amber", color: "#fef3c7" },
  { key: "pink", name: "Pink", color: "#fce7f3" },
  { key: "sky", name: "Sky", color: "#e0f2fe" },
] as const;
export type PaletteKey = (typeof projectPalette)[number]["key"];
export function tagColor(key: string) {
  return projectPalette.find((c) => c.key === key)?.color ?? "#f5f5f5";
}
// Presentation only: palette keys, project hashing and stored colors stay stable.
export function themedTint(color: string) {
  const key =
    projectPalette.find((item) => item.color === color)?.key ?? "neutral";
  return `var(--tint-${key}, ${color})`;
}
