import Link from "next/link";

// Plain reading layout shared by /privacy and /terms.
export default function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <Link href="/" className="text-sm text-text-muted underline underline-offset-2">
        Back to Brandly
      </Link>
      <h1 className="mt-6 text-2xl font-semibold">{title}</h1>
      <p className="mt-1 text-xs text-text-muted">Last updated {updated}</p>
      <p className="mt-4 rounded-md border border-border p-3 text-xs text-text-muted">
        Draft written in plain language from how the product works today. Have it reviewed by a lawyer before launch.
      </p>
      <div className="mt-6 space-y-6 text-sm leading-relaxed [&_h2]:mb-2 [&_h2]:text-base [&_h2]:font-semibold [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5">
        {children}
      </div>
    </main>
  );
}
