import { useRef, useState } from "react";
import { clampSceneMs } from "@/lib/video";
import type { SceneView } from "@/server/projects";

interface Drag {
  kind: "move" | "resize";
  index: number;
  dx: number;
  ms: number;
}

/**
 * The scenes in order, each as wide as it is long, then the end hold. Drag a
 * scene to move it, or its right edge to change its length.
 */
export function Timeline({
  scenes,
  endHoldMs,
  time,
  onSeek,
  onMove,
  onDuration,
}: {
  scenes: SceneView[];
  endHoldMs: number;
  time: number;
  onSeek: (ms: number) => void;
  onMove: (from: number, to: number) => void;
  onDuration: (sceneId: string, ms: number) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const durations = scenes.map((s, i) =>
    drag?.kind === "resize" && drag.index === i ? drag.ms : s.durationMs,
  );
  const hold = scenes.length ? endHoldMs : 0;
  const total = durations.reduce((a, b) => a + b, 0) + hold || 1;
  const starts = durations.map((_, i) => durations.slice(0, i).reduce((a, b) => a + b, 0));

  function follow(
    event: React.PointerEvent,
    onMoveTo: (dx: number) => void,
    onDone: (dx: number, x: number) => void,
  ) {
    event.preventDefault();
    const startX = event.clientX;
    const move = (e: PointerEvent) => onMoveTo(e.clientX - startX);
    const up = (e: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      onDone(e.clientX - startX, e.clientX);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  function startMove(event: React.PointerEvent, index: number) {
    if (event.button !== 0) return;
    const clips = [...(trackRef.current?.querySelectorAll<HTMLElement>("[data-clip]") ?? [])];
    const centers = clips.map((c) => {
      const r = c.getBoundingClientRect();
      return r.left + r.width / 2;
    });
    follow(
      event,
      (dx) => {
        if (Math.abs(dx) > 4) setDrag({ kind: "move", index, dx, ms: 0 });
      },
      (dx, x) => {
        setDrag(null);
        if (Math.abs(dx) <= 4) {
          onSeek(starts[index]!);
          return;
        }
        const target = centers.filter((c, i) => i !== index && c < x).length;
        if (target !== index) onMove(index, target);
      },
    );
  }

  function startResize(event: React.PointerEvent, index: number) {
    if (event.button !== 0) return;
    event.stopPropagation();
    const width = trackRef.current?.getBoundingClientRect().width ?? 1;
    const msPerPx = total / width;
    const from = scenes[index]!.durationMs;
    const at = (dx: number) => clampSceneMs(Math.round((from + dx * msPerPx) / 100) * 100);
    follow(
      event,
      (dx) => setDrag({ kind: "resize", index, dx, ms: at(dx) }),
      (dx) => {
        setDrag(null);
        const ms = at(dx);
        if (ms !== from) onDuration(scenes[index]!.id, ms);
      },
    );
  }

  return (
    <div
      ref={trackRef}
      data-testid="timeline"
      className="relative flex h-20 w-full touch-none overflow-hidden rounded-lg border border-border bg-muted select-none"
    >
      {scenes.map((scene, i) => (
        <div
          key={scene.id}
          data-clip
          data-testid="timeline-clip"
          title={scene.name}
          onPointerDown={(e) => startMove(e, i)}
          style={{
            width: `${(durations[i]! / total) * 100}%`,
            transform: drag?.kind === "move" && drag.index === i ? `translateX(${drag.dx}px)` : undefined,
          }}
          className={`relative h-full min-w-0 shrink-0 cursor-grab overflow-hidden border-r border-border bg-card ${
            drag?.kind === "move" && drag.index === i ? "z-10 opacity-80 shadow-lg" : ""
          }`}
        >
          <img
            src={`/api/files/scenes/${scene.id}`}
            alt=""
            draggable={false}
            className="pointer-events-none absolute inset-0 size-full object-cover opacity-60"
          />
          <span className="absolute top-1 left-1 rounded bg-background/90 px-1.5 text-xs font-medium tabular-nums">
            {i + 1}
          </span>
          <span className="absolute bottom-1 left-1 rounded bg-background/90 px-1.5 text-xs text-muted-foreground tabular-nums">
            {seconds(durations[i]!)}s
          </span>
          <div
            data-testid="clip-resize"
            role="separator"
            aria-label={`Length of scene ${i + 1}`}
            onPointerDown={(e) => startResize(e, i)}
            className="absolute inset-y-0 right-0 w-2.5 cursor-ew-resize bg-primary/40 hover:bg-primary"
          />
        </div>
      ))}
      {hold > 0 ? (
        <div
          style={{ width: `${(hold / total) * 100}%` }}
          className="flex h-full shrink-0 items-end overflow-hidden p-1 text-xs text-muted-foreground"
        >
          Hold
        </div>
      ) : null}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 w-0.5 bg-primary"
        style={{ left: `${Math.min(100, (time / total) * 100)}%` }}
      />
    </div>
  );
}

export const seconds = (ms: number) => String(Number((ms / 1000).toFixed(2)));
