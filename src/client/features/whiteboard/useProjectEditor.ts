import { useCallback, useRef, useState } from "react";
import type { ProjectDetail } from "@/server/projects";
import {
  clampSceneMs,
  fitToAudio,
  normalizeSettings,
  type SettingsPatch,
} from "@/lib/video";
import {
  removeAudio as removeAudioFn,
  removeScene as removeSceneFn,
  reorderScenes as reorderScenesFn,
  setSceneDuration as setSceneDurationFn,
  updateProject,
} from "@/serverFunctions/projects";

/**
 * The open project: shown at once, saved one change at a time in order, and
 * replaced by what the server returns (which applies the audio sync).
 */
export function useProjectEditor(initial: ProjectDetail) {
  const [detail, setDetail] = useState(initial);
  const [pending, setPending] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const id = initial.project.id;
  const detailRef = useRef(detail);
  detailRef.current = detail;

  const save = useCallback(
    (work: () => Promise<ProjectDetail>, optimistic?: (d: ProjectDetail) => ProjectDetail) => {
      if (optimistic) setDetail(optimistic);
      setPending((n) => n + 1);
      const run = queue.current.then(async () => {
        try {
          setDetail(await work());
          setError(null);
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : "Couldn't save that change.");
        } finally {
          setPending((n) => n - 1);
        }
      });
      queue.current = run;
      return run;
    },
    [],
  );

  const synced = (d: ProjectDetail, pinned?: { index: number; ms: number }): ProjectDetail => {
    const audio = d.project.audio;
    if (!audio || !d.project.settings.syncToAudio || d.scenes.length === 0) return d;
    const fit = fitToAudio(
      d.scenes.map((s) => s.durationMs),
      audio.durationMs,
      d.project.settings.endHold * 1000,
      pinned,
    );
    return { ...d, scenes: d.scenes.map((s, i) => ({ ...s, durationMs: fit[i]! })) };
  };

  const changeSettings = (patch: SettingsPatch) =>
    save(
      () => updateProject({ data: { projectId: id, settings: patch } }),
      (d) =>
        synced({
          ...d,
          project: { ...d.project, settings: normalizeSettings(d.project.settings, patch) },
        }),
    );

  const setDuration = (sceneId: string, ms: number) =>
    save(
      () => setSceneDurationFn({ data: { projectId: id, sceneId, durationMs: ms } }),
      (d) => {
        const index = d.scenes.findIndex((s) => s.id === sceneId);
        const next = {
          ...d,
          scenes: d.scenes.map((s) => (s.id === sceneId ? { ...s, durationMs: clampSceneMs(ms) } : s)),
        };
        return index >= 0 ? synced(next, { index, ms: clampSceneMs(ms) }) : next;
      },
    );

  const move = (from: number, to: number) => {
    const scenes = [...detailRef.current.scenes];
    const [moved] = scenes.splice(from, 1);
    if (!moved || to < 0 || to > scenes.length) return Promise.resolve();
    scenes.splice(to, 0, moved);
    const reordered = scenes.map((s, i) => ({ ...s, position: i }));
    detailRef.current = { ...detailRef.current, scenes: reordered };
    return save(
      () => reorderScenesFn({ data: { projectId: id, sceneIds: reordered.map((s) => s.id) } }),
      (d) => ({ ...d, scenes: reordered }),
    );
  };

  const removeScene = (sceneId: string) =>
    save(
      () => removeSceneFn({ data: { projectId: id, sceneId } }),
      (d) => synced({ ...d, scenes: d.scenes.filter((s) => s.id !== sceneId) }),
    );

  const removeAudio = () =>
    save(
      () => removeAudioFn({ data: { projectId: id } }),
      (d) => ({ ...d, project: { ...d.project, audio: null } }),
    );

  /** Sends files to an upload route; resolves with the server's message on refusal. */
  const upload = (path: "scenes" | "audio", body: FormData) => {
    let message: string | null = null;
    return save(async () => {
      const response = await fetch(`/api/projects/${id}/${path}`, { method: "POST", body });
      const json = (await response.json().catch(() => ({}))) as Partial<ProjectDetail> & {
        error?: string;
        refused?: string[];
      };
      if (!response.ok || !json.project || !json.scenes) {
        message = json.error ?? "The upload didn't go through.";
        return detailRef.current;
      }
      if (json.refused?.length) {
        message = `${json.refused.join(", ")}: only JPG or PNG images can be added.`;
      }
      return { project: json.project, scenes: json.scenes };
    }).then(() => message);
  };

  return {
    detail,
    saving: pending > 0,
    error,
    changeSettings,
    setDuration,
    move,
    removeScene,
    removeAudio,
    upload,
  };
}

export type ProjectEditor = ReturnType<typeof useProjectEditor>;
