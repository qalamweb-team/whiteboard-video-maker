// The whiteboard renderer: turns an image into pen strokes and draws a frame
// of the animation at any moment. Used by the preview and by the export.
import type { RenderSettings } from "@/lib/video";

// The board and its pencil. These are colours inside the video, not the page.
const BOARD = "#ffffff";
const INK = "#262626";

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PreparedScene {
  width: number;
  height: number;
  rect: Rect;
  strokes: Float32Array[];
  totalLength: number;
  shade: HTMLCanvasElement;
  colour: HTMLCanvasElement;
  ink: HTMLCanvasElement;
  inkState: { stroke: number; point: number; drawn: number; pen: [number, number] };
}

const DETAIL_KEEP = [0.015, 0.025, 0.04, 0.06, 0.09];

// The pen keeps its direction where it can, then turns as little as it must.
const STEP = 2;
const TURNS = [0, 1, -1, 2, -2, 3, -3, 4];

function canvas(width: number, height: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  return c;
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("An image couldn't be loaded."));
    img.src = src;
  });
}

export function prepareScene(
  img: HTMLImageElement,
  frame: { width: number; height: number },
  lineDetail: number,
): PreparedScene {
  const iw = img.naturalWidth || 1;
  const ih = img.naturalHeight || 1;
  const scale = Math.min(frame.width / iw, frame.height / ih);
  const rect = { w: iw * scale, h: ih * scale, x: 0, y: 0 };
  rect.x = (frame.width - rect.w) / 2;
  rect.y = (frame.height - rect.h) / 2;

  // Edges, found on a small copy of the image.
  const a = Math.min(1, 360 / Math.max(iw, ih));
  const aw = Math.max(8, Math.round(iw * a));
  const ah = Math.max(8, Math.round(ih * a));
  const small = canvas(aw, ah);
  const sctx = small.getContext("2d", { willReadFrequently: true })!;
  sctx.fillStyle = BOARD;
  sctx.fillRect(0, 0, aw, ah);
  sctx.drawImage(img, 0, 0, aw, ah);
  const data = sctx.getImageData(0, 0, aw, ah).data;
  const gray = new Float32Array(aw * ah);
  for (let i = 0; i < aw * ah; i++) {
    gray[i] = 0.299 * data[i * 4]! + 0.587 * data[i * 4 + 1]! + 0.114 * data[i * 4 + 2]!;
  }
  const blur = new Float32Array(aw * ah);
  for (let y = 0; y < ah; y++) {
    for (let x = 0; x < aw; x++) {
      let s = 0;
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx >= 0 && yy >= 0 && xx < aw && yy < ah) {
            s += gray[yy * aw + xx]!;
            n++;
          }
        }
      }
      blur[y * aw + x] = s / n;
    }
  }
  const mag = new Float32Array(aw * ah);
  const angle = new Uint8Array(aw * ah);
  for (let y = 1; y < ah - 1; y++) {
    for (let x = 1; x < aw - 1; x++) {
      const p = (dx: number, dy: number) => blur[(y + dy) * aw + x + dx]!;
      const gx = p(1, -1) + 2 * p(1, 0) + p(1, 1) - p(-1, -1) - 2 * p(-1, 0) - p(-1, 1);
      const gy = p(-1, 1) + 2 * p(0, 1) + p(1, 1) - p(-1, -1) - 2 * p(0, -1) - p(1, -1);
      mag[y * aw + x] = Math.min(1023, Math.hypot(gx, gy));
      const deg = ((Math.atan2(gy, gx) * 180) / Math.PI + 180) % 180;
      angle[y * aw + x] = deg < 22.5 || deg >= 157.5 ? 0 : deg < 67.5 ? 1 : deg < 112.5 ? 2 : 3;
    }
  }
  // Thin each edge to one pixel: keep a point only where it is the ridge.
  const across = [[1, 0], [1, 1], [0, 1], [-1, 1]] as const;
  const thin = new Float32Array(aw * ah);
  const hist = new Uint32Array(1024);
  for (let y = 1; y < ah - 1; y++) {
    for (let x = 1; x < aw - 1; x++) {
      const i = y * aw + x;
      const [ox, oy] = across[angle[i]!]!;
      const m = mag[i]!;
      if (m >= mag[i + oy * aw + ox]! && m > mag[i - oy * aw - ox]!) {
        thin[i] = m;
        hist[Math.floor(m)]!++;
      }
    }
  }
  const keep = DETAIL_KEEP[Math.min(4, Math.max(0, Math.round(lineDetail) - 1))]!;
  let threshold = 1023;
  for (let seen = 0; threshold > 0; threshold--) {
    seen += hist[threshold]!;
    if (seen >= keep * aw * ah) break;
  }
  threshold = Math.max(threshold, 40);
  const edge = new Uint8Array(aw * ah);
  for (let i = 0; i < aw * ah; i++) edge[i] = thin[i]! >= threshold ? 1 : 0;

  // Trace edges into strokes, region by region so the pen moves naturally.
  const visited = new Uint8Array(aw * ah);
  const dirs = [
    [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1],
  ] as const;
  const sx = rect.w / aw;
  const sy = rect.h / ah;
  const strokes: Float32Array[] = [];
  const cell = 32;
  const rows = Math.ceil(ah / cell);
  const cols = Math.ceil(aw / cell);
  for (let r = 0; r < rows; r++) {
    for (let k = 0; k < cols; k++) {
      const c = r % 2 === 0 ? k : cols - 1 - k;
      for (let y = r * cell; y < Math.min(ah, (r + 1) * cell); y++) {
        for (let x = c * cell; x < Math.min(aw, (c + 1) * cell); x++) {
          const start = y * aw + x;
          if (!edge[start] || visited[start]) continue;
          const pts: number[] = [];
          let cx = x;
          let cy = y;
          let dir = 0;
          visited[start] = 1;
          pts.push(cx, cy);
          while (pts.length < 600) {
            let moved = false;
            for (const turn of TURNS) {
              const d = (dir + turn + 8) % 8;
              const nx = cx + dirs[d]![0];
              const ny = cy + dirs[d]![1];
              if (nx < 0 || ny < 0 || nx >= aw || ny >= ah) continue;
              const ni = ny * aw + nx;
              if (edge[ni] && !visited[ni]) {
                visited[ni] = 1;
                cx = nx;
                cy = ny;
                dir = d;
                pts.push(cx, cy);
                moved = true;
                break;
              }
            }
            if (!moved) break;
          }
          if (pts.length < 4) continue;
          const out: number[] = [];
          for (let i = 0; i < pts.length; i += 2 * STEP) {
            out.push(rect.x + (pts[i]! + 0.5) * sx, rect.y + (pts[i + 1]! + 0.5) * sy);
          }
          const lx = pts[pts.length - 2]!;
          const ly = pts[pts.length - 1]!;
          out.push(rect.x + (lx + 0.5) * sx, rect.y + (ly + 0.5) * sy);
          strokes.push(new Float32Array(out));
        }
      }
    }
  }
  let totalLength = 0;
  for (const s of strokes) {
    for (let i = 2; i < s.length; i += 2) totalLength += Math.hypot(s[i]! - s[i - 2]!, s[i + 1]! - s[i - 1]!);
  }

  // The pencil shading the background phase lays down, and the colours.
  const colour = canvas(frame.width, frame.height);
  colour.getContext("2d")!.drawImage(img, rect.x, rect.y, rect.w, rect.h);
  const shade = canvas(frame.width, frame.height);
  const shctx = shade.getContext("2d", { willReadFrequently: true })!;
  shctx.drawImage(img, rect.x, rect.y, rect.w, rect.h);
  const rx = Math.floor(rect.x);
  const ry = Math.floor(rect.y);
  const rw = Math.max(1, Math.ceil(rect.w));
  const rh = Math.max(1, Math.ceil(rect.h));
  const px = shctx.getImageData(rx, ry, rw, rh);
  for (let i = 0; i < px.data.length; i += 4) {
    const g = 0.299 * px.data[i]! + 0.587 * px.data[i + 1]! + 0.114 * px.data[i + 2]!;
    const v = 255 - (255 - g) * 0.55;
    px.data[i] = v;
    px.data[i + 1] = v;
    px.data[i + 2] = v;
  }
  shctx.putImageData(px, rx, ry);

  return {
    width: frame.width,
    height: frame.height,
    rect,
    strokes,
    totalLength,
    shade,
    colour,
    ink: canvas(frame.width, frame.height),
    inkState: { stroke: 0, point: 0, drawn: 0, pen: [rect.x, rect.y] },
  };
}

/** Draws the strokes up to `length` on the scene's ink layer, continuing where it stopped. */
function inkTo(scene: PreparedScene, length: number) {
  const st = scene.inkState;
  const ctx = scene.ink.getContext("2d")!;
  if (length < st.drawn) {
    ctx.clearRect(0, 0, scene.width, scene.height);
    st.stroke = 0;
    st.point = 0;
    st.drawn = 0;
  }
  ctx.strokeStyle = INK;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(1, (scene.height / 480) * 1.3);
  ctx.beginPath();
  while (st.stroke < scene.strokes.length && st.drawn < length) {
    const s = scene.strokes[st.stroke]!;
    if (st.point === 0) st.point = 2;
    if (st.point >= s.length) {
      st.stroke++;
      st.point = 0;
      continue;
    }
    const x0 = s[st.point - 2]!;
    const y0 = s[st.point - 1]!;
    const x1 = s[st.point]!;
    const y1 = s[st.point + 1]!;
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    st.drawn += Math.hypot(x1 - x0, y1 - y0);
    st.pen = [x1, y1];
    st.point += 2;
  }
  ctx.stroke();
}

/** How a scene of `ms` splits into outline, background, colour and hold. */
export function scenePhases(ms: number, settings: RenderSettings) {
  const draw = ms * Math.min(0.9, Math.max(0.1, 0.7 / settings.speed));
  const wO = 1 / settings.objectSpeed;
  const wB = 0.5 / settings.backgroundSpeed;
  const outline = (draw * wO) / (wO + wB);
  const colour = settings.colorReveal ? Math.min(ms * 0.15, ms - draw) : 0;
  return { outline, background: draw - outline, draw, colour };
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** Draws the video's frame at `t` ms. */
export function drawFrame(
  ctx: CanvasRenderingContext2D,
  scenes: PreparedScene[],
  durations: number[],
  settings: RenderSettings,
  t: number,
) {
  const { width, height } = ctx.canvas;
  ctx.globalAlpha = 1;
  ctx.fillStyle = BOARD;
  ctx.fillRect(0, 0, width, height);
  if (scenes.length === 0) return;
  let index = 0;
  let local = t;
  while (index < scenes.length - 1 && local >= durations[index]!) {
    local -= durations[index]!;
    index++;
  }
  const scene = scenes[index]!;
  const d = durations[index]!;
  local = Math.min(local, d);
  const ph = scenePhases(d, settings);
  const oP = ph.outline > 0 ? clamp01(local / ph.outline) : 1;
  const bP = ph.background > 0 ? clamp01((local - ph.outline) / ph.background) : 1;
  const cP = settings.colorReveal ? (ph.colour > 0 ? clamp01((local - ph.draw) / ph.colour) : local >= ph.draw ? 1 : 0) : 0;

  if (bP > 0) {
    const reach = bP * (width + height * 0.4);
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(reach, 0);
    ctx.lineTo(reach - height * 0.4, height);
    ctx.lineTo(0, height);
    ctx.closePath();
    ctx.clip();
    ctx.globalAlpha = 0.8;
    ctx.drawImage(scene.shade, 0, 0);
    ctx.restore();
  }
  inkTo(scene, oP * scene.totalLength);
  ctx.globalAlpha = 1;
  ctx.drawImage(scene.ink, 0, 0);
  if (cP > 0) {
    ctx.globalAlpha = cP;
    ctx.drawImage(scene.colour, 0, 0);
    ctx.globalAlpha = 1;
  }
  if (settings.hand && local < ph.draw && t < durations.reduce((a, b) => a + b, 0)) {
    let pen: [number, number];
    if (oP < 1) pen = scene.inkState.pen;
    else {
      const r = scene.rect;
      const reach = bP * (width + height * 0.4);
      const y = r.y + r.h * (0.5 + 0.42 * Math.sin(local / 90));
      pen = [Math.min(r.x + r.w, Math.max(r.x, reach - (y / height) * height * 0.4)), y];
    }
    drawHand(ctx, pen[0], pen[1], height / 720);
  }
}

/** A hand holding a pen, its tip at (x, y). */
function drawHand(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.rotate(-0.5);
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#4a3426";
  // pen
  ctx.fillStyle = "#2f4f8f";
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(8, -16);
  ctx.lineTo(8, -150);
  ctx.lineTo(-8, -150);
  ctx.lineTo(-8, -16);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // hand
  ctx.fillStyle = "#f0c6a2";
  ctx.beginPath();
  ctx.ellipse(28, -88, 48, 34, 0.35, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(-6, -60, 14, 26, -0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(60, -110);
  ctx.lineTo(130, -170);
  ctx.lineTo(160, -120);
  ctx.lineTo(70, -60);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

export interface ExportResult {
  url: string;
  fileExtension: "mp4" | "webm";
  mimeType: string;
  width: number;
  height: number;
  durationMs: number;
}

const RECORDER_TYPES = [
  "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
  "video/mp4",
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
];

export function exportSupported(): boolean {
  return typeof MediaRecorder !== "undefined" && RECORDER_TYPES.some((t) => MediaRecorder.isTypeSupported(t));
}

/**
 * Plays the animation onto a canvas in real time and records it with the
 * voiceover. Resolves with the file, or rejects with an AbortError when cancelled.
 */
export async function recordVideo(options: {
  scenes: PreparedScene[];
  durations: number[];
  settings: RenderSettings;
  audio: AudioBuffer | null;
  audioContext: AudioContext | null;
  onProgress: (fraction: number) => void;
  signal: AbortSignal;
}): Promise<ExportResult> {
  const { scenes, durations, settings, audio, audioContext, onProgress, signal } = options;
  const width = scenes[0]!.width;
  const height = scenes[0]!.height;
  const total = durations.reduce((a, b) => a + b, 0) + settings.endHold * 1000;
  const out = canvas(width, height);
  const ctx = out.getContext("2d")!;
  for (const s of scenes) inkTo(s, -1);
  drawFrame(ctx, scenes, durations, settings, 0);
  const stream = out.captureStream(settings.fps);
  let source: AudioBufferSourceNode | null = null;
  if (audio && audioContext) {
    const dest = audioContext.createMediaStreamDestination();
    source = audioContext.createBufferSource();
    source.buffer = audio;
    source.connect(dest);
    for (const track of dest.stream.getAudioTracks()) stream.addTrack(track);
  }
  const mimeType = RECORDER_TYPES.find((t) => MediaRecorder.isTypeSupported(t))!;
  const bitrate = { "480p": 2_500_000, "720p": 5_000_000, "1080p": 8_000_000 }[settings.quality];
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: bitrate });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  return new Promise<ExportResult>((resolve, reject) => {
    let timer: ReturnType<typeof setInterval> | undefined;
    let finished = false;
    const stopAll = () => {
      if (timer) clearInterval(timer);
      try {
        source?.stop();
      } catch {
        // never started
      }
      for (const track of stream.getTracks()) track.stop();
    };
    const abort = () => {
      if (finished) return;
      finished = true;
      recorder.onstop = null;
      if (recorder.state !== "inactive") recorder.stop();
      stopAll();
      reject(new DOMException("Export cancelled", "AbortError"));
    };
    signal.addEventListener("abort", abort, { once: true });
    recorder.onstop = () => {
      if (finished) return;
      finished = true;
      signal.removeEventListener("abort", abort);
      const type = mimeType.split(";")[0]!;
      const blob = new Blob(chunks, { type });
      resolve({
        url: URL.createObjectURL(blob),
        fileExtension: type === "video/mp4" ? "mp4" : "webm",
        mimeType: type,
        width,
        height,
        durationMs: total,
      });
    };
    recorder.onerror = () => {
      if (finished) return;
      finished = true;
      stopAll();
      reject(new Error("The browser stopped the recording."));
    };
    void audioContext?.resume();
    recorder.start(250);
    source?.start();
    const started = performance.now();
    timer = setInterval(() => {
      const t = performance.now() - started;
      drawFrame(ctx, scenes, durations, settings, Math.min(t, total));
      onProgress(Math.min(1, t / total));
      if (t >= total) {
        if (timer) clearInterval(timer);
        if (recorder.state !== "inactive") recorder.stop();
        stopAll();
      }
    }, 1000 / settings.fps);
  });
}
