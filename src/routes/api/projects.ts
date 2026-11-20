import { createFileRoute } from "@tanstack/react-router";
import { badRequest, memberFrom, readJson, unauthorized } from "@/server/http";
import * as projects from "@/server/projects";

export const Route = createFileRoute("/api/projects")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const user = await memberFrom(request);
        if (!user) return unauthorized();
        return Response.json({ projects: await projects.listProjects(user.id) });
      },
      POST: async ({ request }) => {
        const user = await memberFrom(request);
        if (!user) return unauthorized();
        const input = projects.createProjectInput.safeParse(await readJson(request));
        if (!input.success) return badRequest(input.error.issues[0]?.message ?? "Invalid project");
        return Response.json(await projects.createProject(user.id, input.data), { status: 201 });
      },
    },
  },
});
