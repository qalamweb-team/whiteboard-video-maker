// Sample media for the suites, drawn here so no file is copied from anywhere.
import { deflateSync } from 'node:zlib';

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** A tiny RGB canvas with filled shapes, encoded as PNG. */
class Picture {
  constructor(w, h, bg) {
    this.w = w;
    this.h = h;
    this.px = new Uint8Array(w * h * 3);
    this.rect(0, 0, w, h, bg);
  }
  set(x, y, c) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 3;
    this.px[i] = c[0];
    this.px[i + 1] = c[1];
    this.px[i + 2] = c[2];
  }
  rect(x0, y0, w, h, c) {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) this.set(x, y, c);
  }
  circle(cx, cy, r, c) {
    for (let y = cy - r; y <= cy + r; y++)
      for (let x = cx - r; x <= cx + r; x++)
        if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) this.set(x, y, c);
  }
  ellipse(cx, cy, rx, ry, c) {
    for (let y = cy - ry; y <= cy + ry; y++)
      for (let x = cx - rx; x <= cx + rx; x++)
        if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) this.set(x, y, c);
  }
  png() {
    const raw = Buffer.alloc((this.w * 3 + 1) * this.h);
    for (let y = 0; y < this.h; y++) {
      raw[y * (this.w * 3 + 1)] = 0;
      Buffer.from(this.px.buffer, y * this.w * 3, this.w * 3).copy(raw, y * (this.w * 3 + 1) + 1);
    }
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(this.w, 0);
    ihdr.writeUInt32BE(this.h, 4);
    ihdr[8] = 8;
    ihdr[9] = 2;
    return Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', ihdr),
      chunk('IDAT', deflateSync(raw)),
      chunk('IEND', Buffer.alloc(0)),
    ]);
  }
}

const SKY = [214, 236, 250];
const SOIL = [122, 84, 52];
const GRASS = [96, 168, 72];
const SUN = [250, 196, 40];
const STEM = [58, 128, 50];
const PETAL = [232, 88, 120];

function ground(p) {
  p.rect(0, 300, p.w, 150, SOIL);
  p.rect(0, 290, p.w, 12, GRASS);
  p.circle(640, 70, 46, SUN);
}

/** Three steps of a seed growing, 800×450. */
export function seedPng() {
  const p = new Picture(800, 450, SKY);
  ground(p);
  p.ellipse(400, 360, 26, 16, [196, 150, 90]);
  p.ellipse(400, 360, 18, 9, [160, 112, 62]);
  for (let i = 0; i < 6; i++) p.circle(120 + i * 110, 200 - (i % 2) * 30, 3, [70, 110, 160]);
  return p.png();
}
export function sproutPng() {
  const p = new Picture(800, 450, SKY);
  ground(p);
  p.rect(395, 200, 10, 100, STEM);
  p.ellipse(360, 215, 38, 16, GRASS);
  p.ellipse(440, 195, 38, 16, GRASS);
  p.ellipse(400, 360, 22, 12, [196, 150, 90]);
  return p.png();
}
export function flowerPng() {
  const p = new Picture(800, 450, SKY);
  ground(p);
  p.rect(395, 130, 10, 170, STEM);
  p.ellipse(350, 230, 44, 16, GRASS);
  p.ellipse(450, 200, 44, 16, GRASS);
  for (const [dx, dy] of [[0, -38], [36, -12], [22, 32], [-22, 32], [-36, -12]])
    p.circle(400 + dx, 120 + dy, 26, PETAL);
  p.circle(400, 120, 22, SUN);
  return p.png();
}

/** A mono 16-bit WAV of a soft hum, `seconds` long. */
export function narrationWav(seconds) {
  const rate = 8000;
  const n = Math.round(rate * seconds);
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0, 'ascii');
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write('WAVE', 8, 'ascii');
  buf.write('fmt ', 12, 'ascii');
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36, 'ascii');
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    const v = Math.sin((2 * Math.PI * 220 * i) / rate) * 0.2 * Math.sin((Math.PI * i) / n);
    buf.writeInt16LE(Math.round(v * 32767), 44 + i * 2);
  }
  return buf;
}

/** A multipart body for runtime.fetch. */
export function form(files, fields = {}) {
  const body = new FormData();
  for (const [name, value] of Object.entries(fields)) body.append(name, String(value));
  for (const f of files) body.append(f.field ?? 'files', new Blob([f.data], { type: f.type }), f.name);
  return body;
}
