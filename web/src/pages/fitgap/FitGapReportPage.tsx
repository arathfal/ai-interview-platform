import { useEffect, useState, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import ComparisonTable from "@/components/fitgap/ComparisonTable";
import { portfoliosApi } from "@/services/portfolios";
import { sessionsApi } from "@/services/sessions";
import { usePolling } from "@/hooks/usePolling";
import { ArrowLeft, AlertTriangle, CheckCircle, Download, Loader2, RefreshCw, Zap } from "lucide-react";
import type { FitGapReport, Portfolio } from "@/types";

export default function FitGapReportPage() {
  const { id, sessionId, vacancyId } = useParams<{
    id: string;
    sessionId: string;
    vacancyId: string;
  }>();

  const [report, setReport] = useState<FitGapReport | null>(null);
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<"pdf" | "json" | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const [pendingStaleExport, setPendingStaleExport] = useState<"pdf" | "json" | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [pageVisible, setPageVisible] = useState(document.visibilityState === "visible");

  const fetchReport = useCallback(async () => {
    if (!portfolio) return;
    try {
      const res = await portfoliosApi.getFitGap(portfolio.id, Number(vacancyId));
      setReport(res.data.report);
    } catch (e: any) {
      if (e?.response?.status === 404) {
        try {
          const res = await portfoliosApi.triggerFitGap(portfolio.id, Number(vacancyId));
          if ("report" in res.data) setReport(res.data.report);
        } catch {}
      }
    }
  }, [portfolio, vacancyId]);

  useEffect(() => {
    sessionsApi
      .getPortfolio(Number(sessionId))
      .then(async (res) => {
        const data = res.data as any;
        if (data.portfolio) {
          setPortfolio(data.portfolio);
        }
      })
      .finally(() => setLoading(false));
  }, [sessionId]);

  useEffect(() => {
    if (portfolio) fetchReport();
  }, [portfolio, fetchReport]);

  usePolling(fetchReport, 5000, !!portfolio && pageVisible);

  useEffect(() => {
    const refreshOnFocus = () => {
      const visible = document.visibilityState === "visible";
      setPageVisible(visible);
      if (visible) fetchReport();
    };
    window.addEventListener("focus", refreshOnFocus);
    document.addEventListener("visibilitychange", refreshOnFocus);
    return () => {
      window.removeEventListener("focus", refreshOnFocus);
      document.removeEventListener("visibilitychange", refreshOnFocus);
    };
  }, [fetchReport]);

  const handleRegenerate = async () => {
    if (!portfolio) return;
    setRegenerating(true);
    try {
      const res = await portfoliosApi.regenerateFitGap(portfolio.id, Number(vacancyId));
      setReport(res.data.report);
    } finally {
      setRegenerating(false);
    }
  };

  const handleExport = async (format: "pdf" | "json", allowStale = false) => {
    if (!portfolio) return;
    if (report?.freshness === "failed" && !allowStale) {
      setPendingStaleExport(format);
      return;
    }
    setExportError(null);
    setExporting(format);
    try {
      const res = await portfoliosApi.exportPortfolio(portfolio.id, format, Number(vacancyId), allowStale);
      const ext = format;
      const blob = format === "pdf"
        ? new Blob([res.data as BlobPart], { type: "application/pdf" })
        : new Blob([JSON.stringify(res.data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `fitgap-${sessionId}-${vacancyId}.${ext}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setExportError("Export is unavailable until this report is current.");
    } finally {
      setExporting(null);
      setPendingStaleExport(null);
    }
  };

  const hasCompletedReport = report?.has_completed_report ?? false;
  const initialGeneration = report?.freshness === "updating" && !hasCompletedReport;
  const exportBlocked = !report || !hasCompletedReport || report.freshness === "updating" || report.freshness === "outdated";

  const freshnessPresentation = report && {
    current: {
      label: "Current",
      message: "This report reflects the latest vacancy and rating inputs.",
      className: "border-green-200 bg-green-50 text-green-800",
    },
    updating: {
      label: "Updating",
      message: hasCompletedReport
        ? "Inputs changed. The previous report remains visible while a replacement is generated."
        : "Generating the first report for these inputs.",
      className: "border-amber-200 bg-amber-50 text-amber-900",
    },
    outdated: {
      label: "Outdated",
      message: "This report does not match the latest inputs. Regenerate it before relying on the result.",
      className: "border-amber-200 bg-amber-50 text-amber-900",
    },
    failed: {
      label: "Update failed",
      message: report.generation_error || "The previous report is still available, but it is not current.",
      className: "border-red-200 bg-red-50 text-red-800",
    },
  }[report.freshness];

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Link
              to={`/assessments/${id}/sessions/${sessionId}/portfolio`}
              className="text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <h1 className="text-lg font-semibold">Fit/Gap Report</h1>
          </div>
        </div>

        {portfolio && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={handleRegenerate} disabled={regenerating || report?.freshness === "updating"}>
              {regenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1" />}
              Regenerate
            </Button>
            {report && hasCompletedReport && (
              <>
                <Button variant="outline" size="sm" onClick={() => handleExport("pdf")} disabled={!!exporting || exportBlocked}>
                  {exporting === "pdf" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5 mr-1" />}
                  PDF
                </Button>
                <Button variant="outline" size="sm" onClick={() => handleExport("json")} disabled={!!exporting || exportBlocked}>
                  {exporting === "json" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5 mr-1" />}
                  JSON
                </Button>
              </>
            )}
          </div>
        )}
      </div>

      {report && freshnessPresentation && (
        <div className={`rounded-lg border px-4 py-3 text-sm ${freshnessPresentation.className}`} role="status">
          <div className="flex flex-wrap items-center gap-2">
            {report.freshness === "current" ? <CheckCircle className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
            <span className="font-semibold">{freshnessPresentation.label}</span>
            {report.generated_at && (
              <span className="text-xs opacity-80">Generated {new Date(report.generated_at).toLocaleString()}</span>
            )}
          </div>
          <p className="mt-1">{freshnessPresentation.message}</p>
        </div>
      )}

      {exportError && <p className="text-sm text-destructive" role="alert">{exportError}</p>}

      {/* Generating */}
      {initialGeneration && (
        <div className="border rounded-lg p-12 text-center space-y-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
          <p className="text-sm text-muted-foreground">Generating fit/gap report...</p>
        </div>
      )}

      {/* Report ready */}
      {report && hasCompletedReport && (
        <>
          {/* Skill comparison */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Skill Comparison</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <ComparisonTable comparisons={report.skill_comparisons} />
            </CardContent>
          </Card>

          <Separator />

          {/* Culture & competency */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Culture &amp; Competency Fit</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap">
                {report.culture_narrative || report.overall_narrative}
              </p>
            </CardContent>
          </Card>

          {/* Discovered skills */}
          {portfolio && portfolio.skills.some((s) => s.is_discovered) && (
            <>
              <Separator />
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-1.5">
                    <Zap className="h-4 w-4 text-amber-500" />
                    Discovered Skills (not in vacancy requirements)
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4 space-y-2">
                  {portfolio.skills
                    .filter((s) => s.is_discovered)
                    .map((s) => (
                      <div key={s.id} className="text-sm flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="font-medium">{s.skill_label}</span>
                        <span className="text-muted-foreground">
                          {s.ai_level} ({s.ai_confidence?.toLowerCase() === "low" ? "low confidence" : "confirmed"})
                        </span>
                        <span className="text-xs text-muted-foreground">— Not required for this role, may be additive.</span>
                      </div>
                    ))}
                </CardContent>
              </Card>
            </>
          )}
        </>
      )}

      <AlertDialog open={pendingStaleExport !== null} onOpenChange={(open) => !open && setPendingStaleExport(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Export an outdated report?</AlertDialogTitle>
            <AlertDialogDescription>
              Regeneration failed. This export will be clearly marked stale and may not reflect the latest vacancy or assessor rating.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => pendingStaleExport && handleExport(pendingStaleExport, true)}
            >
              Export stale report
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
