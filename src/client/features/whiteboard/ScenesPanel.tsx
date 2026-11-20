import { ChevronDown, ChevronUp, ImagePlus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { SettingsSection } from "@/client/components/SettingsSection";
import { Alert, AlertDescription } from "@/client/components/ui/alert";
import { Button } from "@/client/components/ui/button";
import { Input } from "@/client/components/ui/input";
import type { SceneView } from "@/server/projects";
import { seconds } from "./Timeline";

export function ScenesPanel({
  scenes,
  error,
  uploading,
  onUpload,
  onDuration,
  onMove,
  onRemove,
}: {
  scenes: SceneView[];
  error: string | null;
  uploading: boolean;
  onUpload: (files: File[]) => void;
  onDuration: (sceneId: string, ms: number) => void;
  onMove: (from: number, to: number) => void;
  onRemove: (sceneId: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  return (
    <SettingsSection
      title="Scenes"
      action={
        <Button variant="outline" size="sm" pending={uploading} onClick={() => inputRef.current?.click()}>
          <ImagePlus />
          Add images
        </Button>
      }
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".jpg,.jpeg,.png,image/jpeg,image/png"
        data-testid="image-input"
        className="sr-only"
        tabIndex={-1}
        onChange={(event) => {
          const files = [...(event.target.files ?? [])];
          event.target.value = "";
          if (files.length) onUpload(files);
        }}
      />
      <div
        data-testid="image-drop"
        onDragOver={(event) => {
          event.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setOver(false);
          const files = [...event.dataTransfer.files];
          if (files.length) onUpload(files);
        }}
        className={`rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground ${
          over ? "border-primary bg-primary/5" : "border-border"
        }`}
      >
        Drop JPG or PNG images here
      </div>
      {error ? (
        <Alert variant="destructive" data-testid="upload-error">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {scenes.length ? (
        <ol className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-xs">
          {scenes.map((scene, i) => (
            <li key={scene.id} data-testid="scene-item" className="flex items-center gap-3 p-3">
              <img
                src={`/api/files/scenes/${scene.id}`}
                alt={`Scene ${i + 1}`}
                className="h-12 w-20 shrink-0 rounded-md border border-border bg-muted object-cover"
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">Scene {i + 1}</p>
                <p className="truncate text-xs text-muted-foreground">{scene.name}</p>
              </div>
              <DurationInput
                label={`Length of scene ${i + 1} in seconds`}
                ms={scene.durationMs}
                onCommit={(ms) => onDuration(scene.id, ms)}
              />
              <div className="flex shrink-0">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Move scene ${i + 1} earlier`}
                  disabled={i === 0}
                  onClick={() => onMove(i, i - 1)}
                >
                  <ChevronUp />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Move scene ${i + 1} later`}
                  disabled={i === scenes.length - 1}
                  onClick={() => onMove(i, i + 1)}
                >
                  <ChevronDown />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove scene ${i + 1}`}
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => onRemove(scene.id)}
                >
                  <X />
                </Button>
              </div>
            </li>
          ))}
        </ol>
      ) : null}
    </SettingsSection>
  );
}

function DurationInput({ label, ms, onCommit }: { label: string; ms: number; onCommit: (ms: number) => void }) {
  const [value, setValue] = useState(seconds(ms));
  useEffect(() => setValue(seconds(ms)), [ms]);
  const commit = () => {
    const next = Number(value);
    if (!Number.isFinite(next) || next <= 0) {
      setValue(seconds(ms));
      return;
    }
    if (Math.round(next * 1000) !== ms) onCommit(next * 1000);
  };
  return (
    <div className="flex shrink-0 items-center gap-1">
      <Input
        type="number"
        inputMode="decimal"
        min={0.5}
        step={0.1}
        aria-label={label}
        data-testid="scene-duration"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") commit();
        }}
        className="h-8 w-20 bg-card text-right tabular-nums"
      />
      <span className="text-xs text-muted-foreground">s</span>
    </div>
  );
}
