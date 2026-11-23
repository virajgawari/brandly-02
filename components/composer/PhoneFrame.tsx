import type { ReactNode } from "react";

/** A clean, frameless card around the platform preview (no device bezel). */
export default function PhoneFrame({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-[480px] rounded-3xl border border-border/70 bg-card p-5 shadow-pop">
      {children}
    </div>
  );
}
