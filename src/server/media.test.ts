import { describe, expect, it } from "vitest";
import { audioType, imageType } from "./media";

const bytes = (...parts: (string | number[])[]) =>
  new Uint8Array(parts.flatMap((p) => (typeof p === "string" ? [...p].map((c) => c.charCodeAt(0)) : p)));

describe("upload types", () => {
  it("accepts JPG and PNG images only", () => {
    expect(imageType(bytes([0x89], "PNG", [13, 10]))).toBe("image/png");
    expect(imageType(bytes([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(imageType(bytes("GIF89a"))).toBeNull();
    expect(imageType(bytes("hello"))).toBeNull();
  });
  it("accepts MP3, WAV and M4A audio only", () => {
    expect(audioType(bytes("RIFF", [0, 0, 0, 0], "WAVE"))).toBe("audio/wav");
    expect(audioType(bytes([0, 0, 0, 32], "ftypM4A "))).toBe("audio/mp4");
    expect(audioType(bytes("ID3", [4, 0]))).toBe("audio/mpeg");
    expect(audioType(bytes([0xff, 0xfb, 0x90]))).toBe("audio/mpeg");
    expect(audioType(bytes([0x89], "PNG"))).toBeNull();
  });
});
