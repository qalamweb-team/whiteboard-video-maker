import { Pause, Play } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/client/components/ui/button";
import { formatClock, frameSize, type RenderSettings } from "@/lib/video";
import type { ProjectDetail } from "@/server/projects";
import { drawFrame, loadImage, prepareScene, type PreparedScene } from "./engine";
import { Timeline } from "./Timeline";

/** Loads each scene's image once, keyed by scene id. */
export function useSceneImages(sceneIds: string[]) {
  const [images, setImages] = useState<Record<string, HTMLImageElement>>({});
  const key = sceneIds.join(",");
  useEffect(() => {
    let live = true;
    for (const id of sceneIds) {
      if (images[id]) continue;
      loadImage(`/api/files/scenes/${id}`)
        .then((img) => {
          if (live) setImages((prev) => ({ ...prev, [id]: img }));
        })
        .catch(() => undefined);
    }
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return images;
}

/** The voiceover as a local file URL, fetched once per version. */
export function useAudioUrl(projectId: string, audio: ProjectDetail["project"]["audio"]) {
  const [url, setUrl] = useState<string | null>(null);
  const version = audio?.version;
  useEffect(() => {
    if (!version) {
      setUrl(null);
      return;
    }
    let live = true;
    let made: string | null = null;
    fetch(`/api/files/audio/${projectId}?v=${version}`)
      .then((r) => (r.ok ? r.blob() : null))
      .then((blob) => {
        if (!blob || !live) return;
        made = URL.createObjectURL(blob);
        setUrl(made);
      })
      .catch(() => undefined);
    return () => {
      live = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [projectId, version]);
  return url;
}

export function Stage({
  detail,
  images,
  audioUrl,
  onMove,
  onDuration,
}: {
  detail: ProjectDetail;
  images: Record<string, HTMLImageElement>;
  audioUrl: string | null;
  onMove: (from: number, to: number) => void;
  onDuration: (sceneId: string, ms: number) => void;
}) {
  const { scenes, project } = detail;
  const settings: RenderSettings = project.settings;
  const first = scenes[0] ? images[scenes[0].id] : undefined;
  const frame = frameSize(
    { quality: "480p", shape: settings.shape },
    first ? { width: first.naturalWidth, height: first.naturalHeight } : undefined,
  );
  const durations = scenes.map((s) => s.durationMs);
  const total = durations.reduce((a, b) => a + b, 0) + (scenes.length ? settings.endHold * 1000 : 0);

  const cache = useRef(new Map<string, PreparedScene>());
  const prepared = useMemo(() => {
    const out: PreparedScene[] = [];
    for (const s of scenes) {
      const img = images[s.id];
      if (!img) return null;
      const key = `${s.id}:${frame.width}x${frame.height}:${settings.lineDetail}`;
      let p = cache.current.get(key);
      if (!p) {
        p = prepareScene(img, frame, settings.lineDetail);
        cache.current.set(key, p);
      }
      out.push(p);
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenes.map((s) => s.id).join(","), images, frame.width, frame.height, settings.lineDetail]);

  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const timeRef = useRef(0);
  timeRef.current = time;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    if (time > total) setTime(total);
  }, [time, total]);

  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    drawFrame(ctx, prepared ?? [], durations, settings, Math.min(time, total));
  });

  useEffect(() => {
    const audio = audioRef.current;
    if (!playing) {
      audio?.pause();
      return;
    }
    const startedAt = performance.now() - timeRef.current;
    if (audio && audioUrl) {
      if (timeRef.current / 1000 < (audio.duration || Infinity)) {
        audio.currentTime = timeRef.current / 1000;
        void audio.play().catch(() => undefined);
      }
    }
    let frameId = requestAnimationFrame(function tick() {
      const now = performance.now() - startedAt;
      if (now >= total) {
        setTime(total);
        setPlaying(false);
        return;
      }
      setTime(now);
      frameId = requestAnimationFrame(tick);
    });
    return () => {
      cancelAnimationFrame(frameId);
      audio?.pause();
    };
  }, [playing, total, audioUrl]);

  const canPlay = scenes.length > 0 && prepared !== null;
  const toggle = () => {
    if (!canPlay) return;
    if (!playing && timeRef.current >= total) setTime(0);
    setPlaying((p) => !p);
  };
  const toggleRef = useRef(toggle);
  toggleRef.current = toggle;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.code !== "Space" && event.key !== " ") return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, button, a, [role=switch], [contenteditable=true]")) return;
      event.preventDefault();
      toggleRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="space-y-3">
      <div className="flex justify-center overflow-hidden rounded-xl border border-border bg-muted p-2">
        <canvas
          ref={canvasRef}
          data-testid="preview-canvas"
          width={frame.width}
          height={frame.height}
          className="block h-auto max-h-[420px] w-auto max-w-full rounded-sm shadow-xs"
        />
      </div>
      <div className="flex items-center gap-3">
        <Button
          size="icon"
          variant="outline"
          data-testid="play-toggle"
          aria-label={playing ? "Pause" : "Play"}
          disabled={!canPlay}
          onClick={toggle}
        >
          {playing ? <Pause /> : <Play />}
        </Button>
        <span data-testid="preview-time" className="text-sm text-muted-foreground tabular-nums">
          {formatClock(Math.min(time, total))} / {formatClock(total)}
        </span>
        <span className="ml-auto hidden text-xs text-muted-foreground sm:inline">Space to play or pause</span>
      </div>
      {scenes.length ? (
        <Timeline
          scenes={scenes}
          endHoldMs={settings.endHold * 1000}
          time={Math.min(time, total)}
          onSeek={(ms) => {
            setPlaying(false);
            setTime(ms);
          }}
          onMove={onMove}
          onDuration={onDuration}
        />
      ) : null}
      {audioUrl ? <audio ref={audioRef} src={audioUrl} preload="auto" className="hidden" /> : null}
    </div>
  );
}
