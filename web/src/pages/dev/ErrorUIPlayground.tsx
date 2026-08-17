import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertCircle,
  AlertTriangle,
  Info,
  CheckCircle2,
  Loader2,
  RefreshCw,
  X,
  WifiOff,
  UserRound,
  ArrowLeft,
  Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* Shared toast store (demo-level; the winner gets extracted to a      */
/* proper components/ui module after the design pick).                 */
/* ------------------------------------------------------------------ */

type ToastKind = "error" | "warning" | "info" | "success";

interface ToastItem {
  id: number;
  kind: ToastKind;
  title: string;
  message: string;
  retryable?: boolean;
  retrying?: boolean;
}

const TOAST_ICONS: Record<ToastKind, typeof AlertCircle> = {
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
  success: CheckCircle2,
};

const TOAST_ICON_STYLES: Record<ToastKind, string> = {
  error: "bg-red-50 text-red-600",
  warning: "bg-amber-50 text-amber-600",
  info: "bg-blue-50 text-blue-600",
  success: "bg-green-50 text-green-600",
};

/* ------------------------------------------------------------------ */
/* Inline alert (candidate B — based on the F-03 alert-draft)          */
/* ------------------------------------------------------------------ */

type BannerKind = "error" | "warning" | "info";

const BANNER_STYLES: Record<BannerKind, string> = {
  error: "border-destructive/40 bg-destructive/10 text-destructive",
  warning: "border-amber-400/50 bg-amber-50 text-amber-800",
  info: "border-blue-200 bg-blue-50 text-blue-800",
};

function InlineBanner({
  kind,
  title,
  message,
  onDismiss,
}: {
  kind: BannerKind;
  title: string;
  message: string;
  onDismiss?: () => void;
}) {
  const Icon = kind === "error" ? AlertCircle : kind === "warning" ? AlertTriangle : Info;
  return (
    <div
      role="alert"
      className={cn(
        "flex items-start gap-2.5 rounded-lg border px-3.5 py-3 text-sm animate-in fade-in duration-200",
        BANNER_STYLES[kind]
      )}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="font-medium leading-snug">{title}</p>
        <p className={cn("mt-0.5 text-xs leading-relaxed", kind === "error" && "text-destructive/90")}>
          {message}
        </p>
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="shrink-0 rounded p-0.5 opacity-60 transition-opacity hover:opacity-100"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Section header helper                                               */
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
        <div className="rounded-lg border border-dashed p-4 space-y-3">{children}</div>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Playground page                                                     */
/* ------------------------------------------------------------------ */

export default function ErrorUIPlayground() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const toastId = useRef(0);

  const dismissToast = (id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const pushToast = (
    kind: ToastKind,
    title: string,
    message: string,
    retryable = false
  ) => {
    const id = ++toastId.current;
    setToasts((prev) => [...prev, { id, kind, title, message, retryable }]);
    window.setTimeout(() => dismissToast(id), 5000);
  };

  const retryToast = (id: number) => {
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, retrying: true } : t)));
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
      pushToast("success", "Request recovered", "The operation completed successfully.");
    }, 900);
  };

  /* --- Option B: inline banner state --- */
  const [banner, setBanner] = useState<{ kind: BannerKind; title: string; message: string } | null>(null);

  /* --- Option C: page-level error state --- */
  type PageState = "ok" | "loading" | "error";
  const [pageState, setPageState] = useState<PageState>("ok");

  /* --- Option D: invite dialog (NEW-F-01 pattern) --- */
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogSubmitting, setDialogSubmitting] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [failMode, setFailMode] = useState(true);

  /* --- Option E: inline field error --- */
  const [fieldName, setFieldName] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ name?: string }>({});

  const simulateDialogCreate = () => {
    setDialogError(null);
    setDialogSubmitting(true);
    window.setTimeout(() => {
      setDialogSubmitting(false);
      if (failMode) {
        setDialogError("Couldn't create the invite link. The server is having trouble — please try again.");
      } else {
        setDialogOpen(false);
        pushToast("success", "Invite link created", "Share the link with your candidate.");
      }
    }, 1200);
  };

  const handleFieldSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fieldName.trim()) {
      setFieldErrors({ name: "Candidate name is required." });
      return;
    }
    setFieldErrors({});
    pushToast("success", "Saved", "Changes saved successfully.");
  };

  const simulatePageFailure = () => {
    setPageState("loading");
    window.setTimeout(() => setPageState("error"), 900);
  };

  const retryPage = () => {
    setPageState("loading");
    window.setTimeout(() => setPageState("ok"), 1200);
  };

  return (
    <div className="min-h-screen bg-muted/30 px-4 py-8">
      {/* Toast viewport — fixed top-right, as it would render in production */}
      <div className="fixed right-4 top-4 z-50 flex w-80 flex-col gap-2" aria-live="polite">
        {toasts.map((t) => {
          const Icon = TOAST_ICONS[t.kind];
          return (
            <div
              key={t.id}
              role={t.kind === "error" ? "alert" : "status"}
              className="flex items-start gap-3 rounded-lg border bg-white p-3.5 shadow-lg animate-in slide-in-from-top-2 fade-in duration-200"
            >
              <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full", TOAST_ICON_STYLES[t.kind])}>
                <Icon className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium leading-snug">{t.title}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{t.message}</p>
                {t.retryable && (
                  <button
                    type="button"
                    disabled={t.retrying}
                    onClick={() => retryToast(t.id)}
                    className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline disabled:opacity-50"
                  >
                    {t.retrying ? (
                      <>
                        <Loader2 className="h-3 w-3 animate-spin" /> Retrying…
                      </>
                    ) : (
                      <>
                        <RefreshCw className="h-3 w-3" /> Retry
                      </>
                    )}
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => dismissToast(t.id)}
                aria-label="Dismiss notification"
                className="shrink-0 rounded p-0.5 text-muted-foreground opacity-60 transition-opacity hover:opacity-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>

      <div className="mx-auto max-w-4xl space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold">Error UI Playground</h1>
            <div className="mt-1 text-sm text-muted-foreground">
              Kandidat gaya error untuk <Badge variant="outline">F-26</Badge> — pilih yang paling cocok untuk
              platform assessor. Semua demo memakai simulasi, tidak menyentuh backend.
            </div>
          </div>
          <Badge variant="destructive">DEV ONLY</Badge>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Option A — Toast notifications */}
          <OptionCard
            letter="A"
            title="Toast notifications (corner popup)"
            useCase="Operasi non-blokir: submit sukses/gagal, rate limit (429), error jaringan. Auto-dismiss + retry."
          >
            <div className="flex flex-wrap gap-2">
              <Button variant="destructive" size="sm" onClick={() => pushToast("error", "Too many requests", "You've made too many requests in a short time. Please wait a minute and try again.", true)}>
                429 — rate limited
              </Button>
              <Button variant="destructive" size="sm" onClick={() => pushToast("error", "Something went wrong", "The server couldn't complete your request. Please try again.", true)}>
                500 — server error
              </Button>
              <Button variant="destructive" size="sm" onClick={() => pushToast("error", "No internet connection", "Check your connection and try again.", true)}>
                <WifiOff className="h-3.5 w-3.5 mr-1.5" /> Offline
              </Button>
              <Button variant="outline" size="sm" onClick={() => pushToast("warning", "Couldn't save changes", "The form has validation errors. Please review and fix them.")}>
                422 — validation
              </Button>
              <Button variant="outline" size="sm" onClick={() => pushToast("success", "Saved", "Changes saved successfully.")}>
                Success demo
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Toast muncul di pojok kanan atas, hilang otomatis 5 detik, error punya tombol Retry.
            </p>
          </OptionCard>

          {/* Option B — Inline alert banner */}
          <OptionCard
            letter="B"
            title="Inline alert banner"
            useCase="Kesalahan konteks halaman/form: resource tidak ditemukan (404), gagal load, peringatan parsial. Menempel di atas konten."
          >
            {banner && <InlineBanner kind={banner.kind} title={banner.title} message={banner.message} onDismiss={() => setBanner(null)} />}
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => setBanner({ kind: "error", title: "Assessment not found", message: "The assessment you're looking for doesn't exist or was deleted. Check the URL and try again." })}>
                404 — not found
              </Button>
              <Button variant="outline" size="sm" onClick={() => setBanner({ kind: "error", title: "Failed to load candidates", message: "We couldn't load the candidate list. Refresh the page to try again." })}>
                Gagal load
              </Button>
              <Button variant="outline" size="sm" onClick={() => setBanner({ kind: "warning", title: "Portfolio partially generated", message: "Some skills could not be generated. The skills below are still valid." })}>
                Partial warning
              </Button>
              <Button variant="outline" size="sm" onClick={() => setBanner({ kind: "info", title: "Tip", message: "Generating the portfolio takes about 2 minutes." })}>
                Info demo
              </Button>
            </div>
          </OptionCard>

          {/* Option C — Page-level error state */}
          <OptionCard
            letter="C"
            title="Page-level error state + retry"
            useCase="Halaman penuh gagal load (data inti tidak bisa ditampilkan). Pola sama seperti error screen interview (F-07)."
          >
            {pageState === "ok" && (
              <div className="space-y-3">
                <div className="rounded-md border bg-white p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-xs font-medium">1</span>
                      <div>
                        <p className="text-sm font-medium">Budi Santoso</p>
                        <p className="text-xs text-muted-foreground">Awaiting candidate</p>
                      </div>
                    </div>
                    <span className="flex items-center gap-1 text-xs text-amber-600">
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-400" /> Pending
                    </span>
                  </div>
                </div>
                <Button size="sm" variant="outline" onClick={simulatePageFailure}>
                  Simulate page load failure
                </Button>
              </div>
            )}
            {pageState === "loading" && (
              <div className="flex flex-col items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" /> Loading…
              </div>
            )}
            {pageState === "error" && (
              <div role="alert" className="py-6 text-center space-y-3">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-600">
                  <AlertTriangle className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-sm font-semibold">Couldn't load candidates</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    We couldn't reach the server. Check your connection and try again.
                  </p>
                </div>
                <div className="flex items-center justify-center gap-2 pt-1">
                  <Button size="sm" onClick={retryPage}>
                    <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Retry
                  </Button>
                  <Button size="sm" variant="outline">
                    <ArrowLeft className="h-3.5 w-3.5 mr-1.5" /> Back
                  </Button>
                </div>
              </div>
            )}
          </OptionCard>

          {/* Option D — Dialog stays open on failure (NEW-F-01) */}
          <OptionCard
            letter="D"
            title="Dialog + inline error (invite)"
            useCase="Dialog tetap terbuka sampai sukses; error tampil di dalam dialog (NEW-F-01). Form create sesi."
          >
            <div className="flex items-center gap-3">
              <Button size="sm" onClick={() => setDialogOpen(true)}>
                <Plus className="h-3.5 w-3.5 mr-1.5" /> Invite Candidate
              </Button>
              <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={failMode}
                  onChange={(e) => setFailMode(e.target.checked)}
                  className="accent-primary"
                />
                Simulate API failure
              </label>
            </div>
            <p className="text-xs text-muted-foreground">
              {failMode
                ? "Mode gagal: dialog akan tetap terbuka dan menampilkan error inline."
                : "Mode sukses: dialog menutup setelah berhasil + toast sukses."}
            </p>

            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogContent className="sm:max-w-sm">
                <DialogHeader>
                  <DialogTitle>Invite Candidate</DialogTitle>
                </DialogHeader>
                <div className="space-y-2 py-2">
                  <Label htmlFor="playground-candidate-name">Candidate name</Label>
                  <Input
                    id="playground-candidate-name"
                    placeholder="e.g. Budi Santoso"
                    defaultValue=""
                  />
                  <p className="text-xs text-muted-foreground">Optional — helps you identify this session later.</p>
                  {dialogError && (
                    <InlineBanner kind="error" title="Couldn't create invite" message={dialogError} />
                  )}
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                  <Button onClick={simulateDialogCreate} disabled={dialogSubmitting}>
                    {dialogSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Create Link
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </OptionCard>

          {/* Option E — Inline field error */}
          <OptionCard
            letter="E"
            title="Inline field error"
            useCase="Validasi form per-field: border merah + pesan di bawah input. Error hilang saat user mulai mengetik."
          >
            <form onSubmit={handleFieldSubmit} className="space-y-3" noValidate>
              <div className="space-y-1.5">
                <Label htmlFor="playground-field-name">Candidate name</Label>
                <Input
                  id="playground-field-name"
                  value={fieldName}
                  onChange={(e) => {
                    setFieldName(e.target.value);
                    if (fieldErrors.name) setFieldErrors({});
                  }}
                  aria-invalid={!!fieldErrors.name}
                  className={cn(fieldErrors.name && "border-destructive focus-visible:ring-destructive/40")}
                />
                {fieldErrors.name && (
                  <p role="alert" className="flex items-center gap-1 text-xs text-destructive">
                    <AlertCircle className="h-3 w-3" /> {fieldErrors.name}
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                <Button type="submit" size="sm">Save</Button>
                <Button type="button" size="sm" variant="outline" onClick={() => pushToast("error", "Couldn't reach server", "The request timed out. Please try again.", true)}>
                  Simulate timeout
                </Button>
              </div>
            </form>
          </OptionCard>
        </div>

        <p className="text-xs text-muted-foreground">
          Catatan: opsi yang dipilih akan diekstrak jadi komponen production (<code className="rounded bg-muted px-1">components/ui</code>)
          dan dipakai di halaman silent-catch (Invite, Portfolio, Edit Assessment, Edit Vacancy) + login.
        </p>
      </div>
    </div>
  );
}