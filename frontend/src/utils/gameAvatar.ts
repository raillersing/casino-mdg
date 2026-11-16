export const AVATAR_COLORS = [
  "#e57373",
  "#ba68c8",
  "#64b5f6",
  "#4db6ac",
  "#ffb74d",
  "#a1887f",
  "#90a4ae",
  "#f06292",
  "#7986cb",
  "#4dd0e1",
  "#81c784",
  "#fff176",
];

export function avatarColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}
