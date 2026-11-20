import { getEveryAppUser } from "@every-app/sdk/server";
import { env } from "cloudflare:workers";
import { ensureUser, type Member } from "@/server/users";

/** The signed-in member behind a server route, recorded on first sight. */
export async function memberFrom(request: Request): Promise<Member | null> {
  const user = await getEveryAppUser(request, env);
  if (!user) return null;
  await ensureUser(user);
  return user;
}

export const unauthorized = () => Response.json({ error: "Sign in through your Gateway." }, { status: 401 });
export const notFound = () => Response.json({ error: "Project not found" }, { status: 404 });
export const badRequest = (error: string) => Response.json({ error }, { status: 400 });

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
