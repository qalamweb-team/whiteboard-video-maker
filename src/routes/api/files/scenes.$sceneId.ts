import { createFileRoute } from "@tanstack/react-router";
import { memberFrom, unauthorized } from "@/server/http";
import { sceneFile } from "@/server/projects";

export const Route = createFileRoute("/api/files/scenes/$sceneId")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const user = await memberFrom(request);
        if (!user) return unauthorized();
        const file = await sceneFile(user.id, params.sceneId);
        if (!file?.object) return new Response("Not found", { status: 404 });
        return new Response(file.object.body, {
          headers: { "content-type": file.mime, "cache-control": "private, max-age=86400" },
        });
      },
    },
  },
});
