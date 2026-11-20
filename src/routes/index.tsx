import { Link, createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/client/components/AppShell";
import { ConfirmDialog } from "@/client/components/ConfirmDialog";
import { EmptyState } from "@/client/components/EmptyState";
import { FormDialog } from "@/client/components/FormDialog";
import { PageHeader } from "@/client/components/PageHeader";
import { Button } from "@/client/components/ui/button";
import { Input } from "@/client/components/ui/input";
import { Label } from "@/client/components/ui/label";
import { createProject, deleteProject, listProjects, updateProject } from "@/serverFunctions/projects";

export const Route = createFileRoute("/")({
  loader: () => listProjects(),
  head: () => ({ meta: [{ title: "Projects · Whiteboard Video Maker" }] }),
  component: ProjectsPage,
});

type Project = Awaited<ReturnType<typeof listProjects>>[number];

function ProjectsPage() {
  const projects = Route.useLoaderData();
  const router = useRouter();
  const navigate = useNavigate();
  const [naming, setNaming] = useState<{ project: Project | null } | null>(null);
  const [deleting, setDeleting] = useState<Project | null>(null);
  const [pending, setPending] = useState(false);

  async function remove(project: Project) {
    setPending(true);
    try {
      await deleteProject({ data: { projectId: project.id } });
      setDeleting(null);
      await router.invalidate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't delete the project.");
    } finally {
      setPending(false);
    }
  }

  return (
    <AppShell>
      <PageHeader
        title="Projects"
        actions={
          <Button data-testid="new-project" onClick={() => setNaming({ project: null })}>
            <Plus />
            New project
          </Button>
        }
      />
      {projects.length === 0 ? (
        <div data-testid="projects-empty">
          <EmptyState
            title="No projects yet"
            description="Create one to turn your images into a whiteboard video."
          />
        </div>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-xs">
          {projects.map((project) => (
            <li key={project.id} data-testid="project-row" className="flex items-center gap-3 py-3 pr-3 pl-5">
              <div className="min-w-0 flex-1">
                <Link
                  to="/projects/$projectId"
                  params={{ projectId: project.id }}
                  className="block truncate font-medium hover:underline"
                >
                  {project.name}
                </Link>
                <p className="text-sm text-muted-foreground" suppressHydrationWarning>
                  {project.sceneCount} {project.sceneCount === 1 ? "scene" : "scenes"} · Updated{" "}
                  {relativeTime(project.updatedAt)}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Rename ${project.name}`}
                data-testid="rename-project"
                onClick={() => setNaming({ project })}
              >
                <Pencil />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Delete ${project.name}`}
                data-testid="delete-project"
                className="text-muted-foreground hover:text-destructive"
                onClick={() => setDeleting(project)}
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      )}
      {naming ? (
        <NameDialog
          project={naming.project}
          onClose={() => setNaming(null)}
          onSaved={async (id) => {
            setNaming(null);
            if (naming.project) await router.invalidate();
            else await navigate({ to: "/projects/$projectId", params: { projectId: id } });
          }}
        />
      ) : null}
      {deleting ? (
        <ConfirmDialog
          title={`Delete “${deleting.name}”?`}
          confirmLabel="Delete"
          destructive
          pending={pending}
          testId="confirm-delete"
          onConfirm={() => void remove(deleting)}
          onClose={() => setDeleting(null)}
        >
          Its images and voiceover are deleted too.
        </ConfirmDialog>
      ) : null}
    </AppShell>
  );
}

function NameDialog({
  project,
  onClose,
  onSaved,
}: {
  project: Project | null;
  onClose: () => void;
  onSaved: (id: string) => Promise<void>;
}) {
  const [name, setName] = useState(project?.name ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const next = name.trim();
    if (!next) {
      setError("Give the project a name.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const saved = project
        ? await updateProject({ data: { projectId: project.id, name: next } })
        : await createProject({ data: { name: next } });
      await onSaved(saved.project.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn't save the project.");
      setPending(false);
    }
  }

  return (
    <FormDialog
      title={project ? "Rename project" : "New project"}
      onClose={onClose}
      actions={
        <>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" form="project-name-form" pending={pending} data-testid="project-name-submit">
            {project ? "Save" : "Create"}
          </Button>
        </>
      }
    >
      <form
        id="project-name-form"
        className="space-y-2"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <Label htmlFor="project-name">Name</Label>
        <Input
          id="project-name"
          data-testid="project-name-input"
          value={name}
          maxLength={120}
          autoFocus
          onChange={(event) => setName(event.target.value)}
        />
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </form>
    </FormDialog>
  );
}

function relativeTime(iso: string): string {
  const seconds = Math.round((new Date(iso).getTime() - Date.now()) / 1000);
  const format = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const steps: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 31536000],
    ["month", 2592000],
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
  ];
  for (const [unit, size] of steps) {
    if (Math.abs(seconds) >= size) return format.format(Math.round(seconds / size), unit);
  }
  return "just now";
}
