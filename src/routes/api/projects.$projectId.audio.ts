import { createFileRoute } from "@tanstack/react-router";
import { badRequest, memberFrom, notFound, unauthorized } from "@/server/http";
import { AUDIO_LIMIT_BYTES, audioType } from "@/server/media";
import * as projects from "@/server/projects";

// The project's one voiceover. The browser measures its length and sends it.
export const Route = createFileRoute("/api/projects/$projectId/audio")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const user = await memberFrom(request);
        if (!user) return unauthorized();
        const id = projects.projectIdInput.safeParse({ projectId: params.projectId });
        if (!id.success) return notFound();
        const form = await request.formData().catch(() => null);
        const file = form?.get("file");
        if (!file || typeof file === "string") return badRequest("No audio file was sent.");
        const bytes = await file.arrayBuffer();
        const mime = audioType(new Uint8Array(bytes, 0, Math.min(16, bytes.byteLength)));
        if (!mime || bytes.byteLength > AUDIO_LIMIT_BYTES) {
          return badRequest("The voiceover must be an MP3, WAV or M4A file up to 80 MB.");
        }
        const durationMs = Number(form?.get("durationMs"));
        if (!Number.isFinite(durationMs) || durationMs <= 0 || durationMs > 6 * 3600_000) {
          return badRequest("Couldn't read the length of this audio file.");
        }
        const detail = await projects.setAudio(user.id, id.data.projectId, { name: file.name, mime, durationMs, bytes });
        return detail ? Response.json(detail) : notFound();
      },
      DELETE: async ({ request, params }) => {
        const user = await memberFrom(request);
        if (!user) return unauthorized();
        const id = projects.projectIdInput.safeParse({ projectId: params.projectId });
        if (!id.success) return notFound();
        const detail = await projects.removeAudio(user.id, id.data.projectId);
        return detail ? Response.json(detail) : notFound();
      },
    },
  },
});
