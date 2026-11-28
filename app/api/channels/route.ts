import { NextResponse } from "next/server";
import { errorResponse, requireSession } from "@/lib/db/session";
import { listChannels, postizKeyFor } from "@/lib/postiz";

/** GET → { enabled, channels: [{ name, identifier }] }: the social accounts connected in this workspace's Postiz. */
export async function GET() {
  try {
    const s = await requireSession();
    const key = await postizKeyFor(s.workspaceId);
    if (!key) return NextResponse.json({ enabled: false, channels: [] });
    const all = await listChannels(key);
    const channels = all.filter((c) => !c.disabled).map((c) => ({ name: c.name, identifier: c.identifier }));
    return NextResponse.json({ enabled: true, channels });
  } catch (err) {
    return errorResponse(err, "channels list");
  }
}
