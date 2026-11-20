import { createFileRoute } from "@tanstack/react-router";
import { badRequest, memberFrom, notFound, readJson, unauthorized } from "@/server/http";
import * as projects from "@/server/projects";

export const Route = createFileRoute("/api/projects/$projectId")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const user = await memberFrom(request);
        if (!user) return unauthorized();
        const id = projects.projectIdInput.safeParse({ projectId: params.projectId });
        if (!id.success) return notFound();
        const detail = await projects.getProject(user.id, id.data.projectId);
        return detail ? Response.json(detail) : notFound();
      },
      PATCH: async ({ request, params }) => {
        const user = await memberFrom(request);
        if (!user) return unauthorized();
        const body = await readJson(request);
        const input = projects.updateProjectInput.safeParse({
          ...(body && typeof body === "object" ? body : {}),
          projectId: params.projectId,
        });
        if (!input.success) {
          return projects.projectIdInput.safeParse({ projectId: params.projectId }).success
            ? badRequest(input.error.issues[0]?.message ?? "Invalid change")
            : notFound();
        }
        const detail = await projects.updateProject(user.id, input.data);
        return detail ? Response.json(detail) : notFound();
      },
      DELETE: async ({ request, params }) => {
        const user = await memberFrom(request);
        if (!user) return unauthorized();
        const id = projects.projectIdInput.safeParse({ projectId: params.projectId });
        if (!id.success) return notFound();
        const done = await projects.deleteProject(user.id, id.data.projectId);
        return done ? Response.json(done) : notFound();
      },
    },
  },
});
