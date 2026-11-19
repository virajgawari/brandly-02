import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { errorResponse, requireSession, WORKSPACE_COOKIE } from "@/lib/db/session";
import { isInviteToken } from "@/lib/team/invite";

/** POST { token } → joins the workspace (the invite must match the signed-in email) and switches to it. */
export async function POST(req: NextRequest) {
  try {
    const s = await requireSession();
    const { token } = (await req.json().catch(() => ({}))) as { token?: unknown };
    if (!isInviteToken(token)) return NextResponse.json({ error: "This invite link isn't valid." }, { status: 400 });
    const { data, error } = await s.db.rpc("accept_invite", { invite_token: token });
    if (error) {
      return NextResponse.json({ error: "This invite is invalid, expired, or was sent to a different email address." }, { status: 403 });
    }
    (await cookies()).set(WORKSPACE_COOKIE, String(data), { path: "/", sameSite: "lax", httpOnly: true, maxAge: 60 * 60 * 24 * 365 });
    return NextResponse.json({ ok: true, workspaceId: data });
  } catch (err) {
    return errorResponse(err, "accept-invite");
  }
}
