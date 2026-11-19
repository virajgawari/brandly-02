export const INVITE_ROLES = ["admin", "editor", "viewer"] as const;
export type InviteRole = (typeof INVITE_ROLES)[number];

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Cleans and checks an invite request. Returns the normalised values or a message for the user. */
export function parseInvite(input: { email?: unknown; role?: unknown }): { email: string; role: InviteRole } | { error: string } {
  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  if (!email || email.length > 254 || !EMAIL.test(email)) return { error: "Enter a valid email address." };
  const role = (input.role ?? "editor") as InviteRole;
  if (!INVITE_ROLES.includes(role)) return { error: "Choose a role: admin, editor or viewer." };
  return { email, role };
}

export function inviteLink(origin: string, token: string): string {
  return `${origin.replace(/\/+$/, "")}/invite/${token}`;
}

/** Tokens are 48 hex characters (see workspace_invites.token). */
export function isInviteToken(t: unknown): t is string {
  return typeof t === "string" && /^[0-9a-f]{48}$/.test(t);
}
