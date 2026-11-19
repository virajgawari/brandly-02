import { NextRequest, NextResponse } from "next/server";
import { errorResponse, requireSession } from "@/lib/db/session";
import { inviteLink, parseInvite } from "@/lib/team/invite";

/** GET → { members, invites }. Invites (with their links) are returned only to owners and admins, enforced by RLS. */
export async function GET(req: NextRequest) {
  try {
    const s = await requireSession();
    const [m, i] = await Promise.all([
      s.db.from("workspace_members").select("user_id, role").eq("workspace_id", s.workspaceId),
      s.db.from("workspace_invites").select("id, email, role, token, expires_at").eq("workspace_id", s.workspaceId).is("accepted_at", null).gt("expires_at", new Date().toISOString()),
    ]);
    if (m.error) throw m.error;
    if (i.error) throw i.error;
    const origin = req.nextUrl.origin;
    const ids = (m.data ?? []).map((x) => x.user_id);
    const pr = ids.length ? await s.db.from("profiles").select("id, email, full_name").in("id", ids) : { data: [], error: null };
    if (pr.error) throw pr.error;
    const byId = new Map((pr.data ?? []).map((p) => [p.id, p]));
    return NextResponse.json({
      you: s.userId,
      members: (m.data ?? []).map((x) => {
        const p = byId.get(x.user_id);
        return { userId: x.user_id, role: x.role, email: p?.email ?? "", name: p?.full_name ?? "" };
      }),
      invites: (i.data ?? []).map((x) => ({ id: x.id, email: x.email, role: x.role, expiresAt: x.expires_at, link: inviteLink(origin, x.token) })),
    });
  } catch (err) {
    return errorResponse(err, "invites");
  }
}

/** POST { email, role } → { invite: { id, email, role, link } }. The link is shared by hand; nothing is emailed. */
export async function POST(req: NextRequest) {
  try {
    const s = await requireSession();
    const parsed = parseInvite((await req.json().catch(() => ({}))) as Record<string, unknown>);
    if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const { data, error } = await s.db
      .from("workspace_invites")
      .insert({ workspace_id: s.workspaceId, email: parsed.email, role: parsed.role, invited_by: s.userId })
      .select("id, email, role, token, expires_at")
      .single();
    if (error) {
      if (error.code === "42501") return NextResponse.json({ error: "Only owners and admins can invite people." }, { status: 403 });
      throw error;
    }
    return NextResponse.json({ invite: { id: data.id, email: data.email, role: data.role, expiresAt: data.expires_at, link: inviteLink(req.nextUrl.origin, data.token) } });
  } catch (err) {
    return errorResponse(err, "invites");
  }
}

/** DELETE ?id=<invite id> revokes a pending invite. */
export async function DELETE(req: NextRequest) {
  try {
    const s = await requireSession();
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
    const { error } = await s.db.from("workspace_invites").delete().eq("id", id).eq("workspace_id", s.workspaceId);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err, "invites");
  }
}
