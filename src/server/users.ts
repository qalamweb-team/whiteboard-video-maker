import { db } from "@/db";
import { users } from "@/db/schema";

export interface Member {
  id: string;
  email: string;
}

/** Records the person the first time they are seen. */
export async function ensureUser(user: Member): Promise<void> {
  await db
    .insert(users)
    .values({ id: user.id, email: user.email })
    .onConflictDoNothing();
}
