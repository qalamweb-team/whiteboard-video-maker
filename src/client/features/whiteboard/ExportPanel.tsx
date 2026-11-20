import { Download, Film, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Alert, AlertDescription } from "@/client/components/ui/alert";
import { Button } from "@/client/components/ui/button";
import { Progress } from "@/client/components/ui/progress";
import { formatClock, frameSize } from "@/lib/video";
import type { ProjectDetail } from "@/server/projects";
import { exportSupported, loadImage, prepareScene, recordVideo, type ExportResult } from "./engine";

type State =
  | { step: "idle" }
  | { step: "working"; progress: number }
  | { step: "done"; result: ExportResult }
  | { step: "failed"; message: string };

export function ExportPanel({ detail, audioUrl }: { detail: ProjectDetail; audioUrl: string | null }) {
  const [state, setState] = useState<State>({ step: "idle" });
  const [supported, setSupported] = useState(true);
  const abortRef = useRef<AbortController | null>(null);
  const lastUrl = useRef<string | null>(null);

  useEffect(() => setSupported(exportSupported()), []);
  useEffect(
    () => () => {
      abortRef.current?.abort();
      if (lastUrl.current) URL.revokeObjectURL(lastUrl.current);
    },
    [],
  );

  async function start() {
    const { scenes, project } = detail;
    const controller = new AbortController();
    abortRef.current = controller;
    // Made inside the click so the browser lets it play.
    const audioContext = project.audio && audioUrl ? new AudioContext() : null;
    setState({ step: "working", progress: 0 });
    try {
      const images = await Promise.all(scenes.map((s) => loadImage(`/api/files/scenes/${s.id}`)));
      controller.signal.throwIfAborted();
      const frame = frameSize(project.settings, {
        width: images[0]!.naturalWidth,
        height: images[0]!.naturalHeight,
      });
      const prepared = images.map((img) => prepareScene(img, frame, project.settings.lineDetail));
      controller.signal.throwIfAborted();
      let audio: AudioBuffer | null = null;
      if (audioContext && audioUrl) {
        audio = await audioContext.decodeAudioData(await (await fetch(audioUrl)).arrayBuffer());
      }
      controller.signal.throwIfAborted();
      const result = await recordVideo({
        scenes: prepared,
        durations: scenes.map((s) => s.durationMs),
        settings: project.settings,
        audio,
        audioContext,
        signal: controller.signal,
        onProgress: (progress) => setState({ step: "working", progress }),
      });
      if (lastUrl.current) URL.revokeObjectURL(lastUrl.current);
      lastUrl.current = result.url;
      setState({ step: "done", result });
    } catch (error) {
      if (controller.signal.aborted) setState({ step: "idle" });
      else setState({ step: "failed", message: error instanceof Error ? error.message : "The export failed." });
    } finally {
      void audioContext?.close();
      abortRef.current = null;
    }
  }

  const fileName = (ext: string) => `${detail.project.name.replace(/[\\/:*?"<>|]+/g, "-").trim() || "video"}.${ext}`;

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-4 text-card-foreground shadow-xs">
      {state.step === "working" ? (
        <div data-testid="export-progress" className="space-y-3">
          <Progress value={Math.round(state.progress * 100)} aria-label="Export progress" />
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-muted-foreground tabular-nums">
              Recording… {Math.round(state.progress * 100)}%
            </span>
            <Button variant="outline" size="sm" data-testid="export-cancel" onClick={() => abortRef.current?.abort()}>
              <X />
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button
          className="w-full"
          data-testid="export"
          disabled={!supported || detail.scenes.length === 0}
          onClick={() => void start()}
        >
          <Film />
          Export video
        </Button>
      )}
      {!supported ? <p className="text-sm text-muted-foreground">This browser can't record video.</p> : null}
      {state.step === "failed" ? (
        <Alert variant="destructive">
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      ) : null}
      {state.step === "done" ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p data-testid="export-result" className="text-sm text-muted-foreground tabular-nums">
            {state.result.width}×{state.result.height} · {formatClock(state.result.durationMs)} ·{" "}
            {state.result.fileExtension.toUpperCase()}
          </p>
          <Button
            variant="outline"
            size="sm"
            render={<a href={state.result.url} download={fileName(state.result.fileExtension)} />}
            data-testid="download-link"
            nativeButton={false}
          >
            <Download />
            Download
          </Button>
        </div>
      ) : null}
    </div>
  );
}
