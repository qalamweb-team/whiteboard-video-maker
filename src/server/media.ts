// Recognises uploads by their first bytes, not by the name or type a browser sent.

export const IMAGE_LIMIT_BYTES = 20 * 1024 * 1024;
export const AUDIO_LIMIT_BYTES = 80 * 1024 * 1024;

export function imageType(bytes: Uint8Array): "image/png" | "image/jpeg" | null {
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  return null;
}

const ascii = (bytes: Uint8Array, start: number, end: number) =>
  String.fromCharCode(...bytes.subarray(start, end));

export function audioType(bytes: Uint8Array): "audio/mpeg" | "audio/wav" | "audio/mp4" | null {
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WAVE") return "audio/wav";
  if (ascii(bytes, 4, 8) === "ftyp") return "audio/mp4";
  if (ascii(bytes, 0, 3) === "ID3") return "audio/mpeg";
  if (bytes[0] === 0xff && ((bytes[1] ?? 0) & 0xe0) === 0xe0) return "audio/mpeg";
  return null;
}
