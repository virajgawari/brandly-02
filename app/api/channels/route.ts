import { NextResponse } from "next/server";
import { errorResponse, requireSession } from "@/lib/db/session";
import { listChannels, postizEnabled } from "@/lib/postiz";

/** GET → { enabled, channels: [{ name, identifier }] }: the social accounts connected in Postiz. */
export async function GET() {
  try {
    await requireSession();
    if (!postizEnabled()) return NextResponse.json({ enabled: false, channels: [] });
    const all = await listChannels();
    const channels = all.filter((c) => !c.disabled).map((c) => ({ name: c.name, identifier: c.identifier }));
    return NextResponse.json({ enabled: true, channels });
  } catch (err) {
    return errorResponse(err, "channels list");
  }
}
