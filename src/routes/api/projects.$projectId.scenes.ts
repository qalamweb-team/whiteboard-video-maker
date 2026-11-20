import { createFileRoute } from "@tanstack/react-router";
import { badRequest, memberFrom, notFound, unauthorized } from "@/server/http";
import { IMAGE_LIMIT_BYTES, imageType } from "@/server/media";
import * as projects from "@/server/projects";

// Adds one scene per uploaded JPG or PNG, in the order sent.
export const Route = createFileRoute("/api/projects/$projectId/scenes")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const user = await memberFrom(request);
        if (!user) return unauthorized();
        const id = projects.projectIdInput.safeParse({ projectId: params.projectId });
        if (!id.success) return notFound();
        const form = await request.formData().catch(() => null);
        if (!form) return badRequest("Send the images as a form upload.");
        const images: projects.NewImage[] = [];
        const refused: string[] = [];
        for (const entry of form.getAll("files")) {
          if (typeof entry === "string") continue;
          const bytes = await entry.arrayBuffer();
          const mime = imageType(new Uint8Array(bytes, 0, Math.min(16, bytes.byteLength)));
          if (!mime || bytes.byteLength > IMAGE_LIMIT_BYTES) refused.push(entry.name);
          else images.push({ name: entry.name, mime, bytes });
        }
        if (images.length === 0) {
          return badRequest(
            refused.length ? `${refused.join(", ")}: only JPG or PNG images up to 20 MB can be added.` : "No images were sent.",
          );
        }
        const detail = await projects.addScenes(user.id, id.data.projectId, images);
        return detail ? Response.json({ ...detail, refused }, { status: 201 }) : notFound();
      },
    },
  },
});
