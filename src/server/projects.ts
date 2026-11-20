import { and, asc, count, desc, eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { z } from "zod";
import { db } from "@/db";
import { projects, scenes } from "@/db/schema";
import {
  DEFAULT_SCENE_MS,
  clampSceneMs,
  fitToAudio,
  normalizeSettings,
  settingsPatch,
  type RenderSettings,
} from "@/lib/video";

// Every query takes the owner's user id: a project and its scenes and files
// are private to the member who made them.

export const nameInput = z.string().trim().min(1, "Give the project a name").max(120);
export const createProjectInput = z.object({ name: nameInput }).strict();
export const projectIdInput = z.object({ projectId: z.string().uuid() }).strict();
export const updateProjectInput = z
  .object({ projectId: z.string().uuid(), name: nameInput.optional(), settings: settingsPatch.optional() })
  .strict();
export const sceneDurationInput = z
  .object({ projectId: z.string().uuid(), sceneId: z.string().uuid(), durationMs: z.number().finite() })
  .strict();
export const sceneIdInput = z.object({ projectId: z.string().uuid(), sceneId: z.string().uuid() }).strict();
export const reorderInput = z
  .object({ projectId: z.string().uuid(), sceneIds: z.array(z.string().uuid()).max(1000) })
  .strict();

export interface ProjectSummary {
  id: string;
  name: string;
  sceneCount: number;
  updatedAt: string;
}

export interface SceneView {
  id: string;
  name: string;
  position: number;
  durationMs: number;
  mime: string;
}

export interface ProjectDetail {
  project: {
    id: string;
    name: string;
    settings: RenderSettings;
    audio: { name: string; mime: string; durationMs: number; version: string } | null;
    createdAt: string;
    updatedAt: string;
  };
  scenes: SceneView[];
}

const now = () => new Date().toISOString();

export async function listProjects(userId: string): Promise<ProjectSummary[]> {
  const rows = await db
    .select({
      id: projects.id,
      name: projects.name,
      updatedAt: projects.updatedAt,
      sceneCount: count(scenes.id),
    })
    .from(projects)
    .leftJoin(scenes, eq(scenes.projectId, projects.id))
    .where(eq(projects.userId, userId))
    .groupBy(projects.id)
    .orderBy(desc(projects.updatedAt), projects.id);
  return rows;
}

async function ownedProject(userId: string, projectId: string) {
  const [row] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)));
  return row ?? null;
}

async function projectScenes(userId: string, projectId: string) {
  return db
    .select()
    .from(scenes)
    .where(and(eq(scenes.projectId, projectId), eq(scenes.userId, userId)))
    .orderBy(asc(scenes.position), scenes.id);
}

export async function getProject(userId: string, projectId: string): Promise<ProjectDetail | null> {
  const project = await ownedProject(userId, projectId);
  if (!project) return null;
  const rows = await projectScenes(userId, projectId);
  return {
    project: {
      id: project.id,
      name: project.name,
      settings: normalizeSettings(safeJson(project.settings)),
      audio:
        project.audioKey && project.audioName && project.audioMime && project.audioDurationMs != null
          ? {
              name: project.audioName,
              mime: project.audioMime,
              durationMs: project.audioDurationMs,
              version: project.audioKey.slice(-8),
            }
          : null,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    },
    scenes: rows.map((s, i) => ({ id: s.id, name: s.name, position: i, durationMs: s.durationMs, mime: s.mime })),
  };
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

export async function createProject(userId: string, input: z.infer<typeof createProjectInput>) {
  const id = crypto.randomUUID();
  await db.insert(projects).values({
    id,
    userId,
    name: input.name,
    settings: JSON.stringify(normalizeSettings({})),
    updatedAt: now(),
  });
  return (await getProject(userId, id))!;
}

/**
 * When the project has a voiceover and syncs to it, spreads the scene
 * durations so the video ends with the audio. `pinned` is a scene whose
 * length was just set by hand.
 */
async function resync(userId: string, projectId: string, pinned?: { sceneId: string; ms: number }) {
  const project = await ownedProject(userId, projectId);
  if (!project) return;
  const settings = normalizeSettings(safeJson(project.settings));
  if (!settings.syncToAudio || project.audioDurationMs == null) return;
  const rows = await projectScenes(userId, projectId);
  if (rows.length === 0) return;
  const index = pinned ? rows.findIndex((r) => r.id === pinned.sceneId) : -1;
  const fit = fitToAudio(
    rows.map((r) => r.durationMs),
    project.audioDurationMs,
    settings.endHold * 1000,
    index >= 0 ? { index, ms: pinned!.ms } : undefined,
  );
  const changes = rows
    .map((r, i) => ({ id: r.id, ms: fit[i]! }))
    .filter((c, i) => c.ms !== rows[i]!.durationMs);
  if (changes.length === 0) return;
  const [first, ...rest] = changes.map((c) =>
    db.update(scenes).set({ durationMs: c.ms }).where(and(eq(scenes.id, c.id), eq(scenes.userId, userId))),
  );
  await db.batch([first!, ...rest]);
}

async function touch(userId: string, projectId: string) {
  await db
    .update(projects)
    .set({ updatedAt: now() })
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)));
}

export async function updateProject(userId: string, input: z.infer<typeof updateProjectInput>) {
  const project = await ownedProject(userId, input.projectId);
  if (!project) return null;
  const settings = normalizeSettings(safeJson(project.settings), input.settings ?? {});
  await db
    .update(projects)
    .set({ name: input.name ?? project.name, settings: JSON.stringify(settings), updatedAt: now() })
    .where(and(eq(projects.id, project.id), eq(projects.userId, userId)));
  if (input.settings) await resync(userId, project.id);
  return getProject(userId, project.id);
}

/** Deletes the project's rows and returns the file keys to remove from storage. */
export async function deleteProject(userId: string, projectId: string) {
  const project = await ownedProject(userId, projectId);
  if (!project) return null;
  const rows = await projectScenes(userId, projectId);
  await db.batch([
    db.delete(scenes).where(and(eq(scenes.projectId, projectId), eq(scenes.userId, userId))),
    db.delete(projects).where(and(eq(projects.id, projectId), eq(projects.userId, userId))),
  ]);
  const keys = rows.map((r) => r.imageKey);
  if (project.audioKey) keys.push(project.audioKey);
  if (keys.length) await env.files.delete(keys);
  return { id: projectId };
}

export interface NewImage {
  name: string;
  mime: string;
  bytes: ArrayBuffer;
}

export async function addScenes(userId: string, projectId: string, images: NewImage[]) {
  const project = await ownedProject(userId, projectId);
  if (!project) return null;
  const existing = await projectScenes(userId, projectId);
  let position = existing.length ? existing[existing.length - 1]!.position + 1 : 0;
  const added: (typeof scenes.$inferInsert)[] = [];
  for (const image of images) {
    const id = crypto.randomUUID();
    const imageKey = `${userId}/${projectId}/scenes/${id}`;
    await env.files.put(imageKey, image.bytes, { httpMetadata: { contentType: image.mime } });
    added.push({
      id,
      projectId,
      userId,
      position: position++,
      durationMs: DEFAULT_SCENE_MS,
      name: image.name.slice(0, 200) || "image",
      mime: image.mime,
      imageKey,
    });
  }
  if (added.length) {
    await db.insert(scenes).values(added);
    await resync(userId, projectId);
    await touch(userId, projectId);
  }
  return getProject(userId, projectId);
}

export async function setSceneDuration(userId: string, input: z.infer<typeof sceneDurationInput>) {
  const project = await ownedProject(userId, input.projectId);
  if (!project) return null;
  const ms = clampSceneMs(input.durationMs);
  const [row] = await db
    .update(scenes)
    .set({ durationMs: ms })
    .where(and(eq(scenes.id, input.sceneId), eq(scenes.projectId, project.id), eq(scenes.userId, userId)))
    .returning({ id: scenes.id });
  if (!row) return null;
  await resync(userId, project.id, { sceneId: row.id, ms });
  await touch(userId, project.id);
  return getProject(userId, project.id);
}

export async function removeScene(userId: string, input: z.infer<typeof sceneIdInput>) {
  const project = await ownedProject(userId, input.projectId);
  if (!project) return null;
  const [row] = await db
    .delete(scenes)
    .where(and(eq(scenes.id, input.sceneId), eq(scenes.projectId, project.id), eq(scenes.userId, userId)))
    .returning({ imageKey: scenes.imageKey });
  if (!row) return null;
  await env.files.delete(row.imageKey);
  await resync(userId, project.id);
  await touch(userId, project.id);
  return getProject(userId, project.id);
}

export async function reorderScenes(userId: string, input: z.infer<typeof reorderInput>) {
  const project = await ownedProject(userId, input.projectId);
  if (!project) return null;
  const rows = await projectScenes(userId, project.id);
  const ids = new Set(rows.map((r) => r.id));
  if (input.sceneIds.length !== rows.length || !input.sceneIds.every((id) => ids.has(id))) {
    throw new Error("The scene list changed. Reload and try again.");
  }
  if (rows.length) {
    const [first, ...rest] = input.sceneIds.map((id, position) =>
      db.update(scenes).set({ position }).where(and(eq(scenes.id, id), eq(scenes.userId, userId))),
    );
    await db.batch([first!, ...rest]);
  }
  await touch(userId, project.id);
  return getProject(userId, project.id);
}

export async function setAudio(
  userId: string,
  projectId: string,
  audio: { name: string; mime: string; durationMs: number; bytes: ArrayBuffer },
) {
  const project = await ownedProject(userId, projectId);
  if (!project) return null;
  const key = `${userId}/${projectId}/audio-${crypto.randomUUID()}`;
  await env.files.put(key, audio.bytes, { httpMetadata: { contentType: audio.mime } });
  await db
    .update(projects)
    .set({
      audioKey: key,
      audioName: audio.name.slice(0, 200) || "voiceover",
      audioMime: audio.mime,
      audioDurationMs: Math.round(audio.durationMs),
      updatedAt: now(),
    })
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)));
  if (project.audioKey) await env.files.delete(project.audioKey);
  await resync(userId, projectId);
  return getProject(userId, projectId);
}

export async function removeAudio(userId: string, projectId: string) {
  const project = await ownedProject(userId, projectId);
  if (!project) return null;
  await db
    .update(projects)
    .set({ audioKey: null, audioName: null, audioMime: null, audioDurationMs: null, updatedAt: now() })
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)));
  if (project.audioKey) await env.files.delete(project.audioKey);
  return getProject(userId, projectId);
}

/** A stored file of the user's, by scene or by project's voiceover. */
export async function sceneFile(userId: string, sceneId: string) {
  const [row] = await db
    .select({ key: scenes.imageKey, mime: scenes.mime })
    .from(scenes)
    .where(and(eq(scenes.id, sceneId), eq(scenes.userId, userId)));
  return row ? { ...row, object: await env.files.get(row.key) } : null;
}

export async function audioFile(userId: string, projectId: string) {
  const project = await ownedProject(userId, projectId);
  if (!project?.audioKey || !project.audioMime) return null;
  return { mime: project.audioMime, object: await env.files.get(project.audioKey) };
}
