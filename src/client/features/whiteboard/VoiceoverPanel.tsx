import { Mic, Trash2 } from "lucide-react";
import { useRef } from "react";
import { SettingsSection } from "@/client/components/SettingsSection";
import { Alert, AlertDescription } from "@/client/components/ui/alert";
import { Button } from "@/client/components/ui/button";
import { formatClock } from "@/lib/video";
import type { ProjectDetail } from "@/server/projects";

export function VoiceoverPanel({
  audio,
  error,
  uploading,
  onUpload,
  onRemove,
}: {
  audio: ProjectDetail["project"]["audio"];
  error: string | null;
  uploading: boolean;
  onUpload: (file: File) => void;
  onRemove: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const pick = () => inputRef.current?.click();
  return (
    <SettingsSection title="Voiceover">
      <input
        ref={inputRef}
        type="file"
        accept=".mp3,.wav,.m4a,audio/mpeg,audio/wav,audio/x-wav,audio/mp4,audio/x-m4a"
        data-testid="audio-input"
        className="sr-only"
        tabIndex={-1}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) onUpload(file);
        }}
      />
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-4 text-card-foreground shadow-xs">
        <Mic className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        {audio ? (
          <>
            <p data-testid="audio-info" className="min-w-0 flex-1 truncate text-sm">
              {audio.name} <span className="text-muted-foreground">· {formatClock(audio.durationMs)}</span>
            </p>
            <Button variant="outline" size="sm" pending={uploading} onClick={pick}>
              Replace
            </Button>
            <Button variant="ghost" size="sm" data-testid="remove-audio" onClick={onRemove}>
              <Trash2 />
              Remove
            </Button>
          </>
        ) : (
          <>
            <p className="min-w-0 flex-1 text-sm text-muted-foreground">MP3, WAV or M4A</p>
            <Button variant="outline" size="sm" pending={uploading} onClick={pick}>
              Add voiceover
            </Button>
          </>
        )}
      </div>
      {error ? (
        <Alert variant="destructive" data-testid="upload-error">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
    </SettingsSection>
  );
}

/** The audio's length in ms, read by the browser; null when it can't be played. */
export async function measureAudio(file: File): Promise<number | null> {
  const url = URL.createObjectURL(file);
  try {
    const fromElement = await new Promise<number | null>((resolve) => {
      const el = new Audio();
      el.preload = "metadata";
      el.onloadedmetadata = () => resolve(Number.isFinite(el.duration) && el.duration > 0 ? el.duration * 1000 : null);
      el.onerror = () => resolve(null);
      el.src = url;
    });
    if (fromElement) return Math.round(fromElement);
    const context = new AudioContext();
    try {
      const buffer = await context.decodeAudioData(await file.arrayBuffer());
      return Math.round(buffer.duration * 1000);
    } catch {
      return null;
    } finally {
      void context.close();
    }
  } finally {
    URL.revokeObjectURL(url);
  }
}
