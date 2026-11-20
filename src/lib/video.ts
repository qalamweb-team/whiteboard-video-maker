import { z } from "zod";

// Render settings, their bounds and the timing rules, shared by the server
// (which stores and syncs them) and the browser (which renders with them).

export const QUALITIES = ["480p", "720p", "1080p"] as const;
export const SHAPES = ["auto", "16:9", "9:16"] as const;
export type Quality = (typeof QUALITIES)[number];
export type Shape = (typeof SHAPES)[number];

export const NUMERIC_SETTINGS = {
  speed: { label: "Speed", min: 0.25, max: 4, step: 0.05, default: 1, unit: "×" },
  fps: { label: "Frame rate", min: 12, max: 60, step: 1, default: 30, unit: "fps" },
  objectSpeed: { label: "Object detail speed", min: 0.25, max: 4, step: 0.05, default: 1, unit: "×" },
  backgroundSpeed: { label: "Background speed", min: 0.25, max: 4, step: 0.05, default: 1, unit: "×" },
  lineDetail: { label: "Line detail", min: 1, max: 5, step: 1, default: 3, unit: "of 5" },
  endHold: { label: "End-image hold", min: 0, max: 10, step: 0.1, default: 2, unit: "s" },
} as const;
export type NumericSetting = keyof typeof NUMERIC_SETTINGS;

export interface RenderSettings {
  quality: Quality;
  shape: Shape;
  syncToAudio: boolean;
  colorReveal: boolean;
  hand: boolean;
  speed: number;
  fps: number;
  objectSpeed: number;
  backgroundSpeed: number;
  lineDetail: number;
  endHold: number;
}

export const DEFAULT_SETTINGS: RenderSettings = {
  quality: "720p",
  shape: "auto",
  syncToAudio: true,
  colorReveal: true,
  hand: true,
  speed: 1,
  fps: 30,
  objectSpeed: 1,
  backgroundSpeed: 1,
  lineDetail: 3,
  endHold: 2,
};

/** A partial change; numbers out of bounds are clamped, not refused. */
export const settingsPatch = z
  .object({
    quality: z.enum(QUALITIES),
    shape: z.enum(SHAPES),
    syncToAudio: z.boolean(),
    colorReveal: z.boolean(),
    hand: z.boolean(),
    speed: z.number().finite(),
    fps: z.number().finite(),
    objectSpeed: z.number().finite(),
    backgroundSpeed: z.number().finite(),
    lineDetail: z.number().finite(),
    endHold: z.number().finite(),
  })
  .partial()
  .strict();
export type SettingsPatch = z.infer<typeof settingsPatch>;

export function clampSetting(key: NumericSetting, value: number): number {
  const spec = NUMERIC_SETTINGS[key];
  const stepped = Math.round(value / spec.step) * spec.step;
  const clamped = Math.min(spec.max, Math.max(spec.min, stepped));
  return Number(clamped.toFixed(2));
}

/** Stored settings merged over the defaults, every number in bounds. */
export function normalizeSettings(raw: unknown, patch: SettingsPatch = {}): RenderSettings {
  const stored = settingsPatch.safeParse(raw ?? {});
  const merged = { ...DEFAULT_SETTINGS, ...(stored.success ? stored.data : {}), ...patch };
  for (const key of Object.keys(NUMERIC_SETTINGS) as NumericSetting[]) {
    merged[key] = clampSetting(key, merged[key]);
  }
  return merged;
}

export const DEFAULT_SCENE_MS = 5000;
export const MIN_SCENE_MS = 500;
export const MAX_SCENE_MS = 600_000;

export function clampSceneMs(ms: number): number {
  return Math.round(Math.min(MAX_SCENE_MS, Math.max(MIN_SCENE_MS, ms)) / 10) * 10;
}

/**
 * Scene durations that, with the end hold, fill `audioMs`. The current
 * durations set the split; a `pinned` scene keeps the length just given it
 * and the others share what is left.
 */
export function fitToAudio(
  durations: number[],
  audioMs: number,
  endHoldMs: number,
  pinned?: { index: number; ms: number },
): number[] {
  const n = durations.length;
  if (n === 0) return [];
  const target = Math.max(Math.round((audioMs - endHoldMs) / 10) * 10, n * MIN_SCENE_MS);
  const out = [...durations];
  let free = Array.from({ length: n }, (_, i) => i);
  let room = target;
  if (pinned && n > 1) {
    const ms = Math.min(clampSceneMs(pinned.ms), target - (n - 1) * MIN_SCENE_MS);
    out[pinned.index] = Math.max(MIN_SCENE_MS, ms);
    room -= out[pinned.index]!;
    free = free.filter((i) => i !== pinned.index);
  }
  const weight = free.reduce((sum, i) => sum + Math.max(1, durations[i]!), 0);
  for (const i of free) {
    out[i] = Math.max(MIN_SCENE_MS, Math.round((room * Math.max(1, durations[i]!)) / weight / 10) * 10);
  }
  // Rounding leftovers go to the longest free scene so the total is exact.
  const diff = target - out.reduce((a, b) => a + b, 0);
  if (diff !== 0) {
    const longest = free.reduce((best, i) => (out[i]! > out[best]! ? i : best), free[0]!);
    out[longest] = out[longest]! + diff;
  }
  return out;
}

export function totalMs(durations: number[], endHoldSeconds: number): number {
  return durations.reduce((a, b) => a + b, 0) + (durations.length ? endHoldSeconds * 1000 : 0);
}

/** 65000 → "1:05". */
export function formatClock(ms: number): string {
  const seconds = Math.round(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function shapeLabel(shape: Shape): string {
  return shape === "auto" ? "Auto" : shape;
}

/** The output frame in pixels: the short side is the quality's height. */
export function frameSize(
  settings: Pick<RenderSettings, "quality" | "shape">,
  firstImage?: { width: number; height: number },
): { width: number; height: number } {
  const short = Number.parseInt(settings.quality, 10);
  const aspect =
    settings.shape === "16:9"
      ? 16 / 9
      : settings.shape === "9:16"
        ? 9 / 16
        : firstImage && firstImage.width > 0 && firstImage.height > 0
          ? firstImage.width / firstImage.height
          : 16 / 9;
  const even = (v: number) => Math.max(2, Math.round(v / 2) * 2);
  return aspect >= 1
    ? { width: even(short * aspect), height: short }
    : { width: short, height: even(short / aspect) };
}
