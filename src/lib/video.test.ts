import { describe, expect, it } from "vitest";
import { fitToAudio, formatClock, frameSize, normalizeSettings, totalMs } from "./video";

describe("render settings", () => {
  it("fills defaults and clamps numbers", () => {
    const s = normalizeSettings({ fps: 500, endHold: -3 }, { quality: "1080p" });
    expect(s).toMatchObject({ quality: "1080p", shape: "auto", fps: 60, endHold: 0, speed: 1, lineDetail: 3, syncToAudio: true });
    expect(normalizeSettings("junk").quality).toBe("720p");
  });
  it("sizes the frame from quality and shape", () => {
    expect(frameSize({ quality: "720p", shape: "16:9" })).toEqual({ width: 1280, height: 720 });
    expect(frameSize({ quality: "1080p", shape: "9:16" })).toEqual({ width: 1080, height: 1920 });
    expect(frameSize({ quality: "480p", shape: "auto" }, { width: 800, height: 450 })).toEqual({ width: 854, height: 480 });
  });
});

describe("sync to audio", () => {
  it("spreads scenes so the video with its end hold matches the audio", () => {
    const fit = fitToAudio([5000, 5000, 5000], 10000, 2000);
    expect(fit.reduce((a, b) => a + b, 0)).toBe(8000);
    expect(totalMs(fit, 2)).toBe(10000);
  });
  it("keeps the proportions of the current split", () => {
    expect(fitToAudio([1000, 3000], 10000, 2000)).toEqual([2000, 6000]);
  });
  it("turns a manual edit into the new split", () => {
    const fit = fitToAudio([2000, 3000, 3000], 10000, 2000, { index: 0, ms: 4000 });
    expect(fit).toEqual([4000, 2000, 2000]);
  });
  it("formats clock times", () => {
    expect(formatClock(65000)).toBe("1:05");
    expect(formatClock(0)).toBe("0:00");
  });
});
