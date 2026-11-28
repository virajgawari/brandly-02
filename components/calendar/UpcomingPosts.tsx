"use client";
import Link from "next/link";
import { addDays, format, isAfter, isBefore, parseISO } from "date-fns";
import { ArrowRight } from "lucide-react";
import { Card } from "@/components/ui";
import { PlatformIcon } from "@/components/ui/icons";
import { useStore } from "@/lib/store";

/** "This week" and "Drafts to review" for one brand, shown at the top of the Calendar. */
export default function UpcomingPosts({ brandId }: { brandId: string }) {
  const { posts } = useStore();
  const now = new Date();
  const weekEnd = addDays(now, 7);
  const brandPosts = posts.filter((p) => p.brandId === brandId);
  const thisWeek = brandPosts
    .filter((p) => p.status === "scheduled" && isAfter(parseISO(p.scheduledAt), now) && isBefore(parseISO(p.scheduledAt), weekEnd))
    .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  const drafts = brandPosts.filter((p) => p.status === "draft");

  return (
    <div className="space-y-5">
      <Card className="p-4">
        <h2 className="text-sm font-medium mb-3">This week</h2>
        {thisWeek.length === 0 ? (
          <p className="text-sm text-text-muted py-1">
            Nothing scheduled for the next 7 days.{" "}
            <Link href="/composer" className="underline underline-offset-2 hover:text-text">
              Write a post
            </Link>
          </p>
        ) : (
          <ul className="divide-y divide-border -mx-4">
            {thisWeek.map((p) => (
              <li key={p.id} className="px-4 py-2.5 flex items-center gap-4">
                <div className="w-14 shrink-0 text-center">
                  <p className="text-xs text-text-muted">{format(parseISO(p.scheduledAt), "EEE")}</p>
                  <p className="text-sm font-medium tabular-nums">{format(parseISO(p.scheduledAt), "HH:mm")}</p>
                </div>
                <p className="text-sm flex-1 min-w-0 truncate">{p.content.caption}</p>
                <span className="flex gap-1.5 text-text-muted">
                  {p.platforms.map((pl) => (
                    <PlatformIcon key={pl} platform={pl} />
                  ))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-medium">Drafts to review</h2>
          <span className="text-sm text-text-muted tabular-nums">{drafts.length}</span>
        </div>
        {drafts.length === 0 ? (
          <p className="text-sm text-text-muted py-1">No drafts waiting.</p>
        ) : (
          <ul className="space-y-2">
            {drafts.slice(0, 5).map((p) => (
              <li key={p.id} className="flex items-center gap-3 rounded-lg border border-border px-3 h-11">
                <span className="text-sm truncate flex-1">{p.content.caption}</span>
                <ArrowRight size={14} className="text-text-muted shrink-0" />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
