import { Link, createFileRoute } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { useState } from "react";
import { AppShell } from "@/client/components/AppShell";
import { EmptyState } from "@/client/components/EmptyState";
import { PageHeader } from "@/client/components/PageHeader";
import { Alert, AlertDescription } from "@/client/components/ui/alert";
import { ExportPanel } from "@/client/features/whiteboard/ExportPanel";
import { ScenesPanel } from "@/client/features/whiteboard/ScenesPanel";
import { SettingsPanel } from "@/client/features/whiteboard/SettingsPanel";
import { Stage, useAudioUrl, useSceneImages } from "@/client/features/whiteboard/Stage";
import { VoiceoverPanel, measureAudio } from "@/client/features/whiteboard/VoiceoverPanel";
import { useProjectEditor } from "@/client/features/whiteboard/useProjectEditor";
import { formatClock, shapeLabel, totalMs } from "@/lib/video";
import type { ProjectDetail } from "@/server/projects";
import { getProject } from "@/serverFunctions/projects";

// The editor draws on canvases and records video, so it renders in the browser.
export const Route = createFileRoute("/projects/$projectId")({
  ssr: false,
  loader: ({ params }) => getProject({ data: { projectId: params.projectId } }),
  head: ({ loaderData }) => ({
    meta: [{ title: `${loaderData?.project.name ?? "Project"} · Whiteboard Video Maker` }],
  }),
  component: ProjectPage,
});

const backLink = (
  <Link
    to="/"
    className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
  >
    <ChevronLeft className="size-4" aria-hidden />
    Projects
  </Link>
);

function ProjectPage() {
  const detail = Route.useLoaderData();
  if (!detail) {
    return (
      <AppShell>
        <div data-testid="project-missing">
          <PageHeader title="Project not found" backLink={backLink} />
        </div>
      </AppShell>
    );
  }
  return <Editor key={detail.project.id} initial={detail} />;
}

function Editor({ initial }: { initial: ProjectDetail }) {
  const editor = useProjectEditor(initial);
  const { detail } = editor;
  const { project, scenes } = detail;
  const images = useSceneImages(scenes.map((s) => s.id));
  const audioUrl = useAudioUrl(project.id, project.audio);
  const [uploadError, setUploadError] = useState<{ source: "images" | "audio"; message: string } | null>(null);
  const [uploading, setUploading] = useState<"images" | "audio" | null>(null);

  async function uploadImages(files: File[]) {
    setUploading("images");
    setUploadError(null);
    const body = new FormData();
    for (const file of files) body.append("files", file, file.name);
    const message = await editor.upload("scenes", body);
    if (message) setUploadError({ source: "images", message });
    setUploading(null);
  }

  async function uploadAudio(file: File) {
    setUploading("audio");
    setUploadError(null);
    const durationMs = await measureAudio(file);
    if (!durationMs) {
      setUploadError({ source: "audio", message: "The voiceover must be an MP3, WAV or M4A file." });
      setUploading(null);
      return;
    }
    const body = new FormData();
    body.append("file", file, file.name);
    body.append("durationMs", String(durationMs));
    const message = await editor.upload("audio", body);
    if (message) setUploadError({ source: "audio", message });
    setUploading(null);
  }

  const total = totalMs(
    scenes.map((s) => s.durationMs),
    project.settings.endHold,
  );

  return (
    <AppShell wide>
      <PageHeader
        title={project.name}
        backLink={backLink}
        description={<span data-testid="save-state">{editor.saving ? "Saving…" : "Saved"}</span>}
      />
      {editor.error ? (
        <Alert variant="destructive">
          <AlertDescription>{editor.error}</AlertDescription>
        </Alert>
      ) : null}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-6">
          {scenes.length ? (
            <Stage
              detail={detail}
              images={images}
              audioUrl={audioUrl}
              onMove={(from, to) => void editor.move(from, to)}
              onDuration={(id, ms) => void editor.setDuration(id, ms)}
            />
          ) : (
            <EmptyState title="No scenes yet" description="Add images below to start." />
          )}
        </div>
        <div className="min-w-0 space-y-4">
          <p
            data-testid="summary"
            className="rounded-xl border border-border bg-card px-4 py-3 text-sm text-card-foreground shadow-xs tabular-nums"
          >
            {scenes.length} {scenes.length === 1 ? "image" : "images"} · {formatClock(total)} ·{" "}
            {project.settings.quality} · {shapeLabel(project.settings.shape)}
          </p>
          <ExportPanel detail={detail} audioUrl={audioUrl} />
          <SettingsPanel
            settings={project.settings}
            hasAudio={project.audio !== null}
            onChange={(patch) => void editor.changeSettings(patch)}
          />
        </div>
      </div>
      <div className="grid gap-8 lg:grid-cols-2">
        <ScenesPanel
          scenes={scenes}
          error={uploadError?.source === "images" ? uploadError.message : null}
          uploading={uploading === "images"}
          onUpload={(files) => void uploadImages(files)}
          onDuration={(id, ms) => void editor.setDuration(id, ms)}
          onMove={(from, to) => void editor.move(from, to)}
          onRemove={(id) => void editor.removeScene(id)}
        />
        <VoiceoverPanel
          audio={project.audio}
          error={uploadError?.source === "audio" ? uploadError.message : null}
          uploading={uploading === "audio"}
          onUpload={(file) => void uploadAudio(file)}
          onRemove={() => void editor.removeAudio()}
        />
      </div>
    </AppShell>
  );
}
