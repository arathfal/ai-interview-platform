import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  LayoutDashboard,
  ClipboardList,
  Briefcase,
  LogOut,
  Menu,
  X,
  Building2,
  MonitorSmartphone,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* Shared nav model (mirrors the real AssessorLayout nav)              */
/* ------------------------------------------------------------------ */

const navItems = [
  { href: "/assessments", label: "Assessments", icon: ClipboardList },
  { href: "/vacancies", label: "Vacancies", icon: Briefcase },
];

type Viewport = "mobile" | "desktop";

/* ------------------------------------------------------------------ */
/* Option card shell (same pattern as ErrorUIPlayground)               */
/* ------------------------------------------------------------------ */

function OptionCard({
  letter,
  title,
  useCase,
  children,
}: {
  letter: string;
  title: string;
  useCase: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="pt-5 space-y-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <span className="inline-flex h-5 w-5 items-center justify-center rounded bg-primary/10 text-xs font-bold text-primary">
                {letter}
              </span>
              {title}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">{useCase}</p>
          </div>
        </div>
        <div className="rounded-lg border border-dashed p-3 sm:p-4">{children}</div>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Simulated page content shown below the navbar (context for the demo)*/
/* ------------------------------------------------------------------ */

function FakePageBody() {
  return (
    <div className="space-y-3 p-4">
      <div className="h-5 w-2/3 rounded bg-muted" />
      <div className="space-y-2">
        <div className="rounded-lg border p-3">
          <div className="h-4 w-1/2 rounded bg-muted" />
          <div className="mt-2 h-3 w-full rounded bg-muted/60" />
          <div className="mt-1 h-3 w-4/5 rounded bg-muted/60" />
        </div>
        <div className="rounded-lg border p-3">
          <div className="h-4 w-2/3 rounded bg-muted" />
          <div className="mt-2 h-3 w-full rounded bg-muted/60" />
          <div className="mt-1 h-3 w-3/5 rounded bg-muted/60" />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Shared desktop header (identical across all three candidates)       */
/* ------------------------------------------------------------------ */

function DesktopHeader({
  active,
  onSelect,
  tenant,
}: {
  active: string;
  onSelect: (href: string) => void;
  tenant: string;
}) {
  return (
    <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
      <div className="flex items-center gap-6">
        <a href="#" onClick={(e) => e.preventDefault()} className="flex items-center gap-2">
          <LayoutDashboard className="h-5 w-5 text-primary" />
          <span className="font-semibold text-sm">Rakamin AI Interview</span>
        </a>
        <nav className="flex items-center gap-1">
          {navItems.map(({ href, label, icon: Icon }) => (
            <a
              key={href}
              href="#"
              onClick={(e) => {
                e.preventDefault();
                onSelect(href);
              }}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors",
                active === href
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </a>
          ))}
        </nav>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-xs text-muted-foreground border rounded-full px-2.5 py-0.5">
          Tenant: {tenant}
        </span>
        <Button variant="ghost" size="sm" onClick={() => {}}>
          <LogOut className="h-4 w-4 mr-1.5" />
          Logout
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Option A — burger menu (drawer at mobile)                           */
/* ------------------------------------------------------------------ */

function BurgerDrawerNavbar({
  mobile,
  active,
  onSelect,
  tenant,
}: {
  mobile: boolean;
  active: string;
  onSelect: (href: string) => void;
  tenant: string;
}) {
  const [open, setOpen] = useState(false);

  const pick = (href: string) => {
    onSelect(href);
    setOpen(false); // auto-close on navigation
  };

  if (!mobile) {
    return (
      <div className="border-b bg-white">
        <DesktopHeader active={active} onSelect={onSelect} tenant={tenant} />
      </div>
    );
  }

  return (
    <div className="relative min-h-0">
      {/* Mobile header */}
      <div className="border-b bg-white h-14 flex items-center justify-between px-4">
        <a href="#" onClick={(e) => e.preventDefault()} className="flex items-center gap-2 min-w-0">
          <LayoutDashboard className="h-5 w-5 text-primary shrink-0" />
          <span className="font-semibold text-sm truncate">Rakamin AI Interview</span>
        </a>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open navigation menu"
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border text-muted-foreground hover:bg-muted"
        >
          <Menu className="h-5 w-5" />
        </button>
      </div>

      {/* Drawer + overlay (absolute within the preview box) */}
      {open && (
        <div className="absolute inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[80%] flex-col bg-white shadow-xl animate-in slide-in-from-left-2 duration-200">
            <div className="flex h-14 items-center justify-between border-b px-4">
              <span className="flex items-center gap-2 min-w-0">
                <LayoutDashboard className="h-5 w-5 text-primary shrink-0" />
                <span className="font-semibold text-sm truncate">Rakamin AI Interview</span>
              </span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close navigation menu"
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="flex-1 space-y-1 overflow-y-auto p-3">
              {navItems.map(({ href, label, icon: Icon }) => (
                <a
                  key={href}
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    pick(href);
                  }}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors",
                    active === href
                      ? "bg-primary/10 text-primary font-medium"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {label}
                </a>
              ))}
            </nav>
            <div className="border-t p-3 space-y-2">
              <span className="flex items-center gap-2 text-xs text-muted-foreground">
                <Building2 className="h-4 w-4 shrink-0" />
                <span className="truncate">Tenant: {tenant}</span>
              </span>
              <Button variant="ghost" size="sm" className="w-full justify-start" onClick={() => setOpen(false)}>
                <LogOut className="h-4 w-4 mr-1.5" />
                Logout
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Option B — icon-only at mobile (labels hidden, tenant badge hidden) */
/* ------------------------------------------------------------------ */

function IconOnlyNavbar({
  mobile,
  active,
  onSelect,
  tenant,
}: {
  mobile: boolean;
  active: string;
  onSelect: (href: string) => void;
  tenant: string;
}) {
  if (!mobile) {
    return (
      <div className="border-b bg-white">
        <DesktopHeader active={active} onSelect={onSelect} tenant={tenant} />
      </div>
    );
  }

  return (
    <div className="border-b bg-white h-14 flex items-center justify-between px-3">
      <a href="#" onClick={(e) => e.preventDefault()} className="flex items-center gap-2 min-w-0">
        <LayoutDashboard className="h-5 w-5 text-primary shrink-0" />
        <span className="font-semibold text-sm truncate">Rakamin</span>
      </a>
      <div className="flex items-center gap-1 shrink-0">
        {navItems.map(({ href, label, icon: Icon }) => (
          <a
            key={href}
            href="#"
            onClick={(e) => {
              e.preventDefault();
              onSelect(href);
            }}
            aria-label={label}
            title={label}
            className={cn(
              "inline-flex h-9 w-9 items-center justify-center rounded-md transition-colors",
              active === href
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <Icon className="h-5 w-5" />
          </a>
        ))}
        <a
          href="#"
          onClick={(e) => e.preventDefault()}
          aria-label="Logout"
          title="Logout"
          className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <LogOut className="h-5 w-5" />
        </a>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Option C — bottom tab bar at mobile                                 */
/* ------------------------------------------------------------------ */

function BottomTabNavbar({
  mobile,
  active,
  onSelect,
  tenant,
}: {
  mobile: boolean;
  active: string;
  onSelect: (href: string) => void;
  tenant: string;
}) {
  if (!mobile) {
    return (
      <div className="border-b bg-white">
        <DesktopHeader active={active} onSelect={onSelect} tenant={tenant} />
      </div>
    );
  }

  return (
    <div className="relative min-h-0">
      {/* Slim mobile header */}
      <div className="border-b bg-white h-12 flex items-center justify-between px-4">
        <a href="#" onClick={(e) => e.preventDefault()} className="flex items-center gap-2 min-w-0">
          <LayoutDashboard className="h-5 w-5 text-primary shrink-0" />
          <span className="font-semibold text-sm truncate">Rakamin AI Interview</span>
        </a>
        <a
          href="#"
          onClick={(e) => e.preventDefault()}
          aria-label="Logout"
          title="Logout"
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
        >
          <LogOut className="h-5 w-5" />
        </a>
      </div>

      {/* Bottom tab bar (absolute within the preview box) */}
      <div className="absolute bottom-0 inset-x-0 z-40 border-t bg-white">
        <nav className="mx-auto max-w-md flex items-stretch">
          {navItems.map(({ href, label, icon: Icon }) => (
            <a
              key={href}
              href="#"
              onClick={(e) => {
                e.preventDefault();
                onSelect(href);
              }}
              className={cn(
                "flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] transition-colors",
                active === href
                  ? "text-primary font-medium"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="h-5 w-5" />
              {label}
            </a>
          ))}
        </nav>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Playground page                                                     */
/* ------------------------------------------------------------------ */

export default function NavbarPlayground() {
  const [viewport, setViewport] = useState<Viewport>("mobile");
  const [active, setActive] = useState("/assessments");
  const [previewKey, setPreviewKey] = useState(0);

  const TENANT = "PT Maju Jaya";

  const changeViewport = (v: Viewport) => {
    setViewport(v);
    setPreviewKey((k) => k + 1); // remount candidates → reset internal state (drawer/tab)
  };

  const mobile = viewport === "mobile";
  const viewportCls = mobile ? "w-[375px] mx-auto" : "w-full";

  const candidates: Array<{
    letter: string;
    title: string;
    useCase: string;
    render: () => React.ReactNode;
  }> = [
    {
      letter: "A",
      title: "Burger menu (drawer)",
      useCase:
        "Pola standar admin tool. Mobile: brand + tombol hamburger → panel drawer (nav lengkap + tenant + logout). Auto-close saat navigasi. Desktop: header seperti sekarang.",
      render: () => (
        <BurgerDrawerNavbar mobile={mobile} active={active} onSelect={setActive} tenant={TENANT} />
      ),
    },
    {
      letter: "B",
      title: "Icon-only (label disembunyikan)",
      useCase:
        "Tanpa komponen baru. Mobile: brand dipersingkat, nav cuma icon (dengan aria-label/title), tenant badge disembunyikan, logout icon. Desktop: header seperti sekarang.",
      render: () => (
        <IconOnlyNavbar mobile={mobile} active={active} onSelect={setActive} tenant={TENANT} />
      ),
    },
    {
      letter: "C",
      title: "Bottom tab bar",
      useCase:
        "Mobile-native, thumb-friendly. Header tipis (brand + tenant + logout), navigasi pindah ke tab bar bawah. Desktop: header seperti sekarang.",
      render: () => (
        <BottomTabNavbar mobile={mobile} active={active} onSelect={setActive} tenant={TENANT} />
      ),
    },
  ];

  return (
    <div className="min-h-screen bg-muted/30 px-4 py-8">
      <div className="mx-auto max-w-5xl space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold">Navbar Playground</h1>
            <div className="mt-1 text-sm text-muted-foreground">
              Kandidat navbar mobile untuk <Badge variant="outline">UI Enhancement</Badge> — pilih yang paling
              cocok untuk platform assessor. Semua demo pakai simulasi lokal (tanpa backend/auth); klik elemen
              untuk mencoba. Desktop header identik di ketiga kandidat.
            </div>
          </div>
          <Badge variant="destructive">DEV ONLY</Badge>
        </div>

        {/* Viewport switcher */}
        <div className="flex flex-wrap items-center gap-2">
          <MonitorSmartphone className="h-4 w-4 text-muted-foreground" />
          <div className="inline-flex rounded-lg border bg-white p-0.5">
            <button
              type="button"
              onClick={() => changeViewport("mobile")}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                mobile ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              📱 Mobile 375px
            </button>
            <button
              type="button"
              onClick={() => changeViewport("desktop")}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                !mobile ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              🖥 Desktop 1280px
            </button>
          </div>
          <span className="text-xs text-muted-foreground">
            {mobile
              ? "Simulasi 375px (produksi memakai breakpoint md:). Coba klik hamburger (A) & tab bawah (C)."
              : "Layout desktop — harus identik dengan navbar saat ini."}
          </span>
        </div>

        {/* Candidates */}
        <div key={previewKey} className="grid grid-cols-1 gap-6">
          {candidates.map((c) => (
            <OptionCard key={c.letter} letter={c.letter} title={c.title} useCase={c.useCase}>
              <div className={cn("overflow-hidden rounded-lg border bg-background relative", viewportCls)}>
                {c.render()}
                {/* Fake page content so the navbar is seen in context */}
                <FakePageBody />
                {/* Spacer for bottom tab bar so it doesn't overlap content */}
                {mobile && c.letter === "C" && <div className="h-14" />}
              </div>
            </OptionCard>
          ))}
        </div>

        <p className="text-xs text-muted-foreground">
          Catatan: drawer (A) & tab bar (C) memakai state simulasi di playground ini. Versi production akan
          mengekstrak komponen <code>sheet.tsx</code> (Radix Dialog variant) dengan focus trap + Escape untuk
          drawer, dan memakai class <code>md:</code> sebagai breakpoint.
        </p>
      </div>
    </div>
  );
}
