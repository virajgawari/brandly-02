import "server-only";
import { isAdminRole } from "./config";
import { AuthError, requireSession, type Session } from "@/lib/db/session";

export class ForbiddenError extends Error {
  status = 403;
}

/** The signed-in user's role in the current workspace. */
export async function roleOf(s: Session): Promise<string | null> {
  const { data } = await s.db.from("workspace_members").select("role").eq("workspace_id", s.workspaceId).eq("user_id", s.userId).maybeSingle();
  return (data?.role as string | undefined) ?? null;
}


/** Session for an owner or admin of the workspace; throws ForbiddenError for everyone else. */
export async function requireAdmin(): Promise<Session> {
  const s = await requireSession();
  if (!isAdminRole(await roleOf(s))) throw new ForbiddenError("Only workspace owners and admins can do this.");
  return s;
}

export async function audit(s: Session, action: string, target?: string, detail: Record<string, unknown> = {}) {
  await s.db.from("admin_audit").insert({ workspace_id: s.workspaceId, user_id: s.userId, action, target: target ?? null, detail });
}

export function adminError(err: unknown, label: string) {
  if (err instanceof ForbiddenError) return Response.json({ error: err.message }, { status: 403 });
  if (err instanceof AuthError) return Response.json({ error: err.message }, { status: 401 });
  console.error(`[${label}]`, err);
  const msg = err instanceof Error ? err.message : typeof err === "object" && err && "message" in err ? String((err as { message: unknown }).message) : String(err);
  return Response.json({ error: msg }, { status: 500 });
}
