import { createServerFn } from "@tanstack/react-start";
import { ensureUserMiddleware } from "@every-app/sdk/tanstack-start";
import { z } from "zod";
import * as projects from "@/server/projects";
import { ensureUser } from "@/server/users";

// Behind ensureUserMiddleware, `context.user` is the member the Gateway signed
// in; every query takes their id. Uploads go to the routes in src/routes/api.

const found = <T,>(value: T | null): T => {
  if (value === null) throw new Error("Project not found");
  return value;
};

export const listProjects = createServerFn()
  .middleware([ensureUserMiddleware])
  .handler(async ({ context }) => {
    await ensureUser(context.user);
    return projects.listProjects(context.user.id);
  });

export const getProject = createServerFn()
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => z.object({ projectId: z.string() }).strict().parse(data))
  .handler(async ({ data, context }) => {
    await ensureUser(context.user);
    const id = projects.projectIdInput.safeParse(data);
    return id.success ? projects.getProject(context.user.id, id.data.projectId) : null;
  });

export const createProject = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => projects.createProjectInput.parse(data))
  .handler(async ({ data, context }) => {
    await ensureUser(context.user);
    return projects.createProject(context.user.id, data);
  });

export const updateProject = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => projects.updateProjectInput.parse(data))
  .handler(async ({ data, context }) => found(await projects.updateProject(context.user.id, data)));

export const deleteProject = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => projects.projectIdInput.parse(data))
  .handler(async ({ data, context }) => found(await projects.deleteProject(context.user.id, data.projectId)));

export const setSceneDuration = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => projects.sceneDurationInput.parse(data))
  .handler(async ({ data, context }) => found(await projects.setSceneDuration(context.user.id, data)));

export const removeScene = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => projects.sceneIdInput.parse(data))
  .handler(async ({ data, context }) => found(await projects.removeScene(context.user.id, data)));

export const reorderScenes = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => projects.reorderInput.parse(data))
  .handler(async ({ data, context }) => found(await projects.reorderScenes(context.user.id, data)));

export const removeAudio = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => projects.projectIdInput.parse(data))
  .handler(async ({ data, context }) => found(await projects.removeAudio(context.user.id, data.projectId)));
