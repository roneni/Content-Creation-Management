"use client";

import { trpc } from "@/lib/trpc/client";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Globe, Loader2, Trash2, ExternalLink, Zap, FileText, AlertTriangle, Clock, ArrowRight } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import type { SiteStatus } from "@/types";

const STATUS_STYLES: Record<SiteStatus, { bg: string; text: string; label: string }> = {
  pending: { bg: "bg-yellow-500/10", text: "text-yellow-400", label: "Pending" },
  crawling: { bg: "bg-blue-500/10", text: "text-blue-400", label: "Crawling..." },
  analyzing: { bg: "bg-purple-500/10", text: "text-purple-400", label: "Analyzing..." },
  ready: { bg: "bg-green-500/10", text: "text-green-400", label: "Ready" },
  error: { bg: "bg-red-500/10", text: "text-red-400", label: "Error" },
};

function scoreColor(score: number): string {
  if (score >= 7) return "text-green-400";
  if (score >= 5) return "text-yellow-400";
  return "text-red-400";
}

function priorityStyle(priority: string) {
  switch (priority) {
    case "critical": return { bg: "bg-red-500/10", text: "text-red-400" };
    case "high": return { bg: "bg-orange-500/10", text: "text-orange-400" };
    case "medium": return { bg: "bg-yellow-500/10", text: "text-yellow-400" };
    default: return { bg: "bg-gray-500/10", text: "text-gray-400" };
  }
}

export default function SiteDetailPage() {
  const params = useParams();
  const router = useRouter();
  const siteId = params.siteId as string;
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const utils = trpc.useUtils();

  const { data: site, isLoading } = trpc.sites.get.useQuery(
    { id: siteId },
    { refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "crawling" || status === "analyzing" ? 3000 : false;
    }}
  );
  const { data: pageAnalysisData } = trpc.analysis.getPageAnalyses.useQuery(
    { siteId }, { enabled: !!site && site.status === "ready" }
  );
  const { data: recsData } = trpc.analysis.getRecommendations.useQuery(
    { siteId }, { enabled: !!site && site.status === "ready" }
  );

  const startAnalysis = trpc.crawl.startAnalysis.useMutation({
    onSuccess: () => {
      utils.sites.get.invalidate({ id: siteId });
      utils.analysis.getPageAnalyses.invalidate({ siteId });
      utils.analysis.getRecommendations.invalidate({ siteId });
    },
    onError: () => { utils.sites.get.invalidate({ id: siteId }); },
  });

  const deleteSite = trpc.sites.delete.useMutation({
    onSuccess: () => router.push("/dashboard"),
  });

  if (isLoading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 text-gray-500 animate-spin" /></div>;
  if (!site) return <div className="text-center mt-20"><p className="text-gray-400">Site not found.</p><Link href="/dashboard" className="text-blue-400 text-sm mt-2 inline-block">Back to dashboard</Link></div>;

  const status = STATUS_STYLES[(site.status as SiteStatus) ?? "pending"];
  const isProcessing = site.status === "crawling" || site.status === "analyzing";
  const analyses = pageAnalysisData ?? [];
  const recs = recsData ?? [];
  const criticalRecs = recs.filter((r) => r.priority === "critical" || r.priority === "high");

  return (
    <div className="max-w-4xl">
      <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors mb-6">
        <ArrowLeft className="w-4 h-4" />Dashboard
      </Link>

      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 mb-6">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-gray-800 flex items-center justify-center"><Globe className="w-6 h-6 text-gray-400" /></div>
            <div>
              <h1 className="text-xl font-semibold text-white">{site.name}</h1>
              <a href={site.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-blue-400 transition-colors">
                {site.domain}<ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
          <span className={`inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium ${status.bg} ${status.text}`}>
            {isProcessing && <Loader2 className="w-3 h-3 animate-spin mr-1.5" />}{status.label}
          </span>
        </div>
        <div className="mt-4 pt-4 border-t border-gray-800 flex flex-wrap items-center gap-3">
          <button onClick={() => startAnalysis.mutate({ siteId })} disabled={isProcessing || startAnalysis.isPending}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
            {isProcessing || startAnalysis.isPending ? (
              <><Loader2 className="w-4 h-4 animate-spin" />{site.status === "crawling" ? "Crawling..." : site.status === "analyzing" ? "Analyzing..." : "Starting..."}</>
            ) : (<><Zap className="w-4 h-4" />{site.status === "ready" ? "Re-analyze" : "Start Analysis"}</>)}
          </button>
          {site.pageCount > 0 && <span className="text-sm text-gray-500">{site.pageCount} pages</span>}
          {site.lastAnalysisAt && <span className="text-sm text-gray-500">Analyzed {new Date(site.lastAnalysisAt).toLocaleDateString()}</span>}
        </div>
        {startAnalysis.isError && <p className="text-red-400 text-sm mt-3">{startAnalysis.error.message}</p>}
      </div>

      {isProcessing && (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 mb-6 text-center">
          <Loader2 className="w-10 h-10 text-blue-400 animate-spin mx-auto mb-4" />
          <h2 className="text-lg font-medium text-white mb-2">{site.status === "crawling" ? "Crawling your site..." : "AI is analyzing your pages..."}</h2>
          <p className="text-sm text-gray-400">{site.status === "crawling" ? "Discovering and fetching all pages. This can take a minute." : "Claude is reviewing each page. This takes a few minutes."}</p>
        </div>
      )}

      {site.status === "pending" && (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 mb-6 text-center">
          <Zap className="w-10 h-10 text-yellow-400 mx-auto mb-4" />
          <h2 className="text-lg font-medium text-white mb-2">Ready to analyze</h2>
          <p className="text-sm text-gray-400 max-w-md mx-auto">Click &quot;Start Analysis&quot; to crawl your site and get AI-powered recommendations.</p>
        </div>
      )}

      {site.status === "error" && (
        <div className="bg-red-900/10 border border-red-800/30 rounded-2xl p-6 mb-6">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
            <div><h3 className="text-white font-medium">Analysis failed</h3><p className="text-sm text-gray-400 mt-1">Something went wrong. Try again.</p></div>
          </div>
        </div>
      )}

      {site.status === "ready" && analyses.length > 0 && (
        <>
          {criticalRecs.length > 0 && (
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-white mb-3">Top Priorities</h2>
              <div className="space-y-3">
                {criticalRecs.slice(0, 5).map((rec) => {
                  const style = priorityStyle(rec.priority);
                  return (
                    <div key={rec.id} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                      <div className="flex items-start gap-3">
                        <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium shrink-0 ${style.bg} ${style.text}`}>{rec.priority}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-white text-sm">{rec.action}</p>
                          {rec.reasoning && <p className="text-gray-400 text-xs mt-1.5">{rec.reasoning}</p>}
                          <div className="flex items-center gap-3 mt-2">
                            <span className="text-xs text-gray-500">{rec.category}</span>
                            {rec.effort && <span className="text-xs text-gray-500">{rec.effort === "quick_win" ? "Quick win" : rec.effort}</span>}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              {recs.length > 5 && (
                <Link href={`/dashboard/sites/${siteId}/recommendations`} className="inline-flex items-center gap-1 text-sm text-blue-400 hover:text-blue-300 mt-3">
                  View all {recs.length} recommendations<ArrowRight className="w-3 h-3" />
                </Link>
              )}
            </div>
          )}

          <div className="mb-6">
            <h2 className="text-lg font-semibold text-white mb-3">Page Analysis ({analyses.length} pages)</h2>
            <div className="space-y-2">
              {analyses.map((analysis) => (
                <Link key={analysis.id} href={`/dashboard/sites/${siteId}/pages/${analysis.id}`}
                  className="flex items-center justify-between bg-gray-900 border border-gray-800 rounded-xl p-4 hover:border-gray-700 transition-colors group">
                  <div className="flex items-center gap-3 min-w-0">
                    <FileText className="w-4 h-4 text-gray-500 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm text-white truncate">{analysis.pageTitle || analysis.pageUrl}</p>
                      <p className="text-xs text-gray-500 truncate">{analysis.pageUrl}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 shrink-0 ml-4">
                    {analysis.intentClassification && <span className="text-xs text-gray-500 hidden sm:block">{analysis.intentClassification}</span>}
                    <span className={`text-sm font-semibold ${scoreColor(analysis.contentQualityScore ?? 0)}`}>{analysis.contentQualityScore}/10</span>
                    <ArrowRight className="w-4 h-4 text-gray-600 group-hover:text-gray-400 transition-colors" />
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </>
      )}

      <div className="mt-8 pt-6 border-t border-gray-800">
        {!showDeleteConfirm ? (
          <button onClick={() => setShowDeleteConfirm(true)} className="flex items-center gap-2 text-sm text-gray-500 hover:text-red-400 transition-colors">
            <Trash2 className="w-4 h-4" />Delete this site
          </button>
        ) : (
          <div className="flex items-center gap-3">
            <p className="text-sm text-red-400">Delete this site and all data?</p>
            <button onClick={() => deleteSite.mutate({ id: siteId })} disabled={deleteSite.isPending}
              className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white text-sm rounded-lg disabled:opacity-50">
              {deleteSite.isPending ? "Deleting..." : "Yes, delete"}
            </button>
            <button onClick={() => setShowDeleteConfirm(false)} className="px-3 py-1.5 text-gray-400 hover:text-white text-sm">Cancel</button>
          </div>
        )}
      </div>
    </div>
  );
}
