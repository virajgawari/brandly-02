import type { ReactNode } from "react";

/** A fixed-width phone-shaped frame around the platform preview. */
export default function PhoneFrame({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-[380px] rounded-[2.2rem] border-[10px] border-text/80 bg-bg overflow-hidden shadow-sm">
      <div className="max-h-[720px] overflow-y-auto">{children}</div>
    </div>
  );
}
