export const PASTE_SIDE_STORAGE_KEY = "quicknav-paste-side-v1";

export type PasteSide = "left" | "right";

export function readPasteSidePreference(value: string | null): PasteSide {
  return value === "left" ? "left" : "right";
}
