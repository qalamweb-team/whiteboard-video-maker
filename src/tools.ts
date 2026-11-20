// The app's tools for AI clients, served by the Gateway at /mcp with the
// signed-in user. Rendering happens in the browser, so the tools only read.
import { defineTools } from "@every-app/sdk/server";
import { z } from "zod";
import * as projects from "@/server/projects";

export const tools = defineTools({
  list_projects: {
    description: "List the user's whiteboard video projects with their scene counts.",
    risk: "read",
    input: z.object({}).strict(),
    handler: (_input, { user }) => projects.listProjects(user.id),
  },
});
