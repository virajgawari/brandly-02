"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import clsx from "clsx";
import { CalendarDays, Check, ChevronsUpDown, Home, Images, LogOut, Package, Palette, PenLine, Plus, Settings, SlidersHorizontal, Workflow, Zap, Ellipsis } from "lucide-react";
import { useStore } from "@/lib/store";

type NavItem = { href: string; icon: typeof Home; label: string };
const HOME: NavItem = { href: "/", icon: Home, label: "Home" };
const NAV_GROUPS: { label?: string; items: NavItem[] }[] = [
  { items: [HOME] },
  {
    label: "Make",
    items: [
      { href: "/composer", icon: PenLine, label: "Create" },
      { href: "/sprint", icon: Zap, label: "Sprint" },
    ],
  },
  {
    label: "Plan",
    items: [
      { href: "/calendar", icon: CalendarDays, label: "Calendar" },
      { href: "/automation", icon: Workflow, label: "Automations" },
    ],
  },
  {
    label: "Your brand",
    items: [
      { href: "/brand", icon: Palette, label: "Brand" },
      { href: "/catalog", icon: Package, label: "Catalogue" },
      { href: "/assets", icon: Images, label: "Assets" },
    ],
  },
];
const NAV: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);
const MOBILE_MAIN = NAV.filter((n) => ["/", "/composer", "/sprint", "/calendar"].includes(n.href));
const MOBILE_MORE = NAV.filter((n) => !MOBILE_MAIN.includes(n));
const isActive = (pathname: string, href: string) => pathname === href || (href !== "/" && pathname.startsWith(href));

function BrandDot({ colors, size = 20 }: { colors: string[]; size?: number }) {
  return (
    <span className="grid grid-cols-2 overflow-hidden rounded-md shrink-0 border border-border" style={{ width: size, height: size }}>
      {colors.slice(0, 4).map((c, i) => (
        <span key={i} style={{ background: c }} />
      ))}
    </span>
  );
}

export default function Sidebar() {
  const pathname = usePathname();
  const { brands, activeBrandId, setActiveBrand, getActiveBrand } = useStore();
  const activeBrand = getActiveBrand();
  const role = useStore((s) => s.account?.role);
  const isAdmin = role === "owner" || role === "admin";
  const [open, setOpen] = useState(false);
  const colorsOf = (b: (typeof brands)[number]) => Object.values(b.dna.colors);

  return (
    <aside className="hidden md:flex w-60 shrink-0 h-screen bg-surface border-r border-border flex-col sticky top-0">
      {/* Plain anchor on purpose: a full page load refreshes the data and lands on Home. */}
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <a href="/" aria-label="Brandly home" className="px-4 h-14 flex items-center gap-2 border-b border-border">
        <span className="w-6 h-6 rounded-md bg-text text-bg grid place-items-center text-[13px] font-bold">B</span>
        <span className="text-[15px] font-semibold tracking-tight">Brandly</span>
      </a>

      {/* Brand switcher */}
      <div className="p-3 border-b border-border relative">
        {activeBrand ? (
          <button
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="w-full flex items-center gap-2.5 px-2 h-10 rounded-lg hover:bg-text/5 text-left"
          >
            <BrandDot colors={colorsOf(activeBrand)} />
            <span className="truncate text-sm font-medium flex-1">{activeBrand.name}</span>
            <ChevronsUpDown size={14} className="text-text-muted" />
          </button>
        ) : (
          <Link href="/onboarding" className="w-full flex items-center gap-2 px-2 h-10 rounded-lg text-sm font-medium hover:bg-text/5">
            <Plus size={16} /> Set up your brand
          </Link>
        )}
        {open && activeBrand && (
          <div className="absolute left-3 right-3 top-[52px] z-20 bg-card border border-border rounded-xl shadow-pop p-1 animate-fade-in">
            {brands.map((b) => (
              <button
                key={b.id}
                onClick={() => {
                  setActiveBrand(b.id);
                  setOpen(false);
                }}
                className="w-full flex items-center gap-2.5 px-2 h-9 rounded-lg hover:bg-text/5 text-left text-sm"
              >
                <BrandDot colors={colorsOf(b)} size={16} />
                <span className="truncate flex-1">{b.name}</span>
                {b.id === activeBrandId && <Check size={14} />}
              </button>
            ))}
            <div className="h-px bg-border my-1" />
            <Link
              href="/onboarding"
              onClick={() => setOpen(false)}
              className="w-full flex items-center gap-2.5 px-2 h-9 rounded-lg hover:bg-text/5 text-sm text-text-muted"
            >
              <Plus size={14} /> Add a brand
            </Link>
          </div>
        )}
      </div>

      <nav className="flex-1 p-3 space-y-0.5" aria-label="Main">
        {[...NAV_GROUPS, ...(isAdmin ? [{ label: "Admin", items: [{ href: "/admin/agent", icon: SlidersHorizontal, label: "Admin" }] }] : [])].map((g, gi) => (
          <div key={g.label ?? gi} className={gi ? "pt-3" : ""}>
            {g.label && g.label !== "Admin" && <p className="px-2.5 pb-1 text-[11px] uppercase tracking-wide text-text-muted/80">{g.label}</p>}
            {g.items.map(({ href, icon: Icon, label }) => {
              const active = isActive(pathname, href);
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={clsx(
                    "flex items-center gap-3 px-2.5 h-9 rounded-lg text-sm transition-colors",
                    active ? "bg-text/[0.07] text-text font-medium" : "text-text-muted hover:bg-text/5 hover:text-text"
                  )}
                >
                  <Icon size={16} strokeWidth={1.75} />
                  {label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
      <AccountMenu />
    </aside>
  );
}

/** Signed-in user, workspace, data-use consent and sign out. */
function AccountMenu() {
  const account = useStore((s) => s.account);
  const [open, setOpen] = useState(false);
  const [optIn, setOptIn] = useState(account?.workspace.data_training_opt_in ?? false);
  if (!account) return null;
  const label = account.user.name || account.user.email || "Account";

  const toggleOptIn = async () => {
    const next = !optIn;
    setOptIn(next);
    const res = await fetch("/api/workspace", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dataTrainingOptIn: next }),
    }).catch(() => null);
    if (!res?.ok) setOptIn(!next);
  };

  return (
    <div className="p-3 border-t border-border relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full flex items-center gap-2.5 px-2 h-11 rounded-lg hover:bg-text/5 text-left"
      >
        <span className="w-7 h-7 rounded-full bg-text/10 grid place-items-center text-xs font-semibold uppercase shrink-0">{label.slice(0, 1)}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{label}</span>
          <span className="block truncate text-xs text-text-muted">{account.workspace.name}</span>
        </span>
        <ChevronsUpDown size={14} className="text-text-muted" />
      </button>
      {open && (
        <div className="absolute left-3 right-3 bottom-[60px] z-20 bg-card border border-border rounded-xl shadow-pop p-1 animate-fade-in">
          {account.user.email && <p className="px-2 pt-1.5 pb-1 text-xs text-text-muted truncate">{account.user.email}</p>}
          <label className="flex items-start gap-2 px-2 py-2 rounded-lg hover:bg-text/5 text-sm cursor-pointer">
            <input type="checkbox" className="mt-0.5" checked={optIn} onChange={toggleOptIn} />
            <span>
              Help improve Brandly
              <span className="block text-xs text-text-muted">Let us use this workspace&apos;s edits and ratings to improve the AI.</span>
            </span>
          </label>
          <div className="h-px bg-border my-1" />
          <Link href="/settings" onClick={() => setOpen(false)} className="w-full flex items-center gap-2.5 px-2 h-9 rounded-lg hover:bg-text/5 text-sm text-left">
            <Settings size={14} /> Settings
          </Link>
          <form action="/auth/signout" method="post">
            <button type="submit" className="w-full flex items-center gap-2.5 px-2 h-9 rounded-lg hover:bg-text/5 text-sm text-left">
              <LogOut size={14} /> Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

/** Bottom tab bar on phones (the sidebar is hidden below md). Four main tabs plus a More sheet. */
export function MobileNav() {
  const pathname = usePathname();
  const [more, setMore] = useState(false);
  const moreActive = MOBILE_MORE.some((n) => isActive(pathname, n.href));
  const tab = "flex flex-col items-center justify-center gap-0.5 h-14 text-[11px]";
  return (
    <>
      {more && (
        <div className="md:hidden fixed inset-0 z-30" onClick={() => setMore(false)}>
          <div className="absolute bottom-[calc(3.5rem+env(safe-area-inset-bottom))] inset-x-3 bg-card border border-border rounded-2xl shadow-pop p-2 animate-fade-in" onClick={(e) => e.stopPropagation()}>
            {[...MOBILE_MORE, { href: "/settings", icon: Settings, label: "Settings" }].map(({ href, icon: Icon, label }) => (
              <Link key={href} href={href} onClick={() => setMore(false)} className="flex items-center gap-3 px-3 h-11 rounded-lg text-sm hover:bg-text/5">
                <Icon size={16} strokeWidth={1.75} />
                {label}
              </Link>
            ))}
          </div>
        </div>
      )}
      <nav aria-label="Main" className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-surface border-t border-border grid grid-cols-5 pb-[env(safe-area-inset-bottom)]">
        {MOBILE_MAIN.map(({ href, icon: Icon, label }) => {
          const active = isActive(pathname, href);
          return (
            <Link key={href} href={href} onClick={() => setMore(false)} aria-current={active ? "page" : undefined} className={clsx(tab, active ? "text-text font-medium" : "text-text-muted")}>
              <Icon size={18} strokeWidth={1.75} />
              {label}
            </Link>
          );
        })}
        <button onClick={() => setMore((m) => !m)} aria-expanded={more} className={clsx(tab, moreActive || more ? "text-text font-medium" : "text-text-muted")}>
          <Ellipsis size={18} strokeWidth={1.75} />
          More
        </button>
      </nav>
    </>
  );
}
