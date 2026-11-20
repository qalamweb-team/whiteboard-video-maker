import { createFileRoute } from "@tanstack/react-router";
import { memberFrom, unauthorized } from "@/server/http";
import { audioFile } from "@/server/projects";

export const Route = createFileRoute("/api/files/audio/$projectId")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const user = await memberFrom(request);
        if (!user) return unauthorized();
        const file = await audioFile(user.id, params.projectId);
        if (!file?.object) return new Response("Not found", { status: 404 });
        return new Response(file.object.body, {
          headers: {
            "content-type": file.mime,
            "content-length": String(file.object.size),
            "cache-control": "private, no-cache",
          },
        });
      },
    },
  },
});
