"use client";

import { trpc } from "@/lib/trpc/client";
import { useParams } from "next/navigation";
import { ArrowLeft, Loader2, CheckCircle, XCircle, AlertTriangle, ExternalLink } from "lucide-react";
import Link from "next/link";

function scoreColor(score: number): string {
  if (score >= 7) return "text-green-400";
  if (score >= 5) return "text-yellow-400";
  return "text-red-400";
}
function scoreBg(score: number): string {
  if (score >= 7) return "bg-green-500/10 border-green-500/20";
  if (score >= 5) return "bg-yellow-500/10 border-yellow-500/20";
  return "bg-red-500/10 border-red-500/20";
}
function seoQualityIcon(quality: string) {
  if (quality === "good") return <CheckCircle className="w-4 h-4 text-green-400" />;
  if (quality === "missing") return <XCircle className="w-4 h-4 text-red-400" />;
  return <AlertTriangle className="w-4 h-4 text-yellow-400" />;
}

export default function PageAnalysisDetailPage() {
  const params = useParams();
  const siteId = params.siteId as string;
  const pageId = params.pageId as string;
  const { data: analysis, isLoading } = trpc.analysis.getPageAnalysis.useQuery({ id: pageId });

  if (isLoading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 text-gray-500 animate-spin" /></div>;
  if (!analysis) return <div className="text-center mt-20"><p className="text-gray-400">Analysis not found.</p></div>;

  const seo = (analysis.seoAssessment ?? {}) as Record<string, unknown>;
  const strengths = (analysis.strengths ?? []) as string[];
  const weaknesses = (analysis.weaknesses ?? []) as string[];
  const fullAnalysis = (analysis.fullAnalysis ?? {}) as Record<string, unknown>;
  const recs = ((fullAnalysis.recommendations ?? []) as Record<string, unknown>[]);

  return (
    <div className="max-w-3xl">
      <Link href={"/dashboard/sites/" + siteId} className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors mb-6">
        <ArrowLeft className="w-4 h-4" />Back to site
      </Link>

      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 mb-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-semibold text-white">{analysis.pageTitle || "Untitled Page"}</h1>
            <a href={analysis.pageUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-blue-400 mt-1">
              {analysis.pageUrl}<ExternalLink className="w-3 h-3" />
            </a>
          </div>
          <div className={"text-center px-4 py-3 rounded-xl border " + scoreBg(analysis.contentQualityScore ?? 0)}>
            <div className={"text-2xl font-bold " + scoreColor(analysis.contentQualityScore ?? 0)}>{analysis.contentQualityScore}</div>
            <div className="text-xs text-gray-400">Quality</div>
          </div>
        </div>
        <div className="flex flex-wrap gap-3 mt-4 pt-4 border-t border-gray-800">
          {analysis.intentClassification && <span className="px-3 py-1 rounded-full bg-blue-500/10 text-blue-400 text-xs font-medium">{analysis.intentClassification}</span>}
          {analysis.targetAudience && <span className="px-3 py-1 rounded-full bg-gray-800 text-gray-300 text-xs">Audience: {String(analysis.targetAudience)}</span>}
        </div>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 mb-6">
        <h2 className="text-base font-semibold text-white mb-4">SEO Assessment</h2>
        <div className="space-y-3">
          <div className="flex items-center justify-between"><span className="text-sm text-gray-400">Title Tag</span>
            <div className="flex items-center gap-2">{seoQualityIcon(String(seo.title_tag_quality ?? "needs_work"))}<span className="text-sm text-white capitalize">{String(seo.title_tag_quality ?? "Unknown").replace("_", " ")}</span></div>
          </div>
          <div className="flex items-center justify-between"><span className="text-sm text-gray-400">Meta Description</span>
            <div className="flex items-center gap-2">{seoQualityIcon(String(seo.meta_description_quality ?? "needs_work"))}<span className="text-sm text-white capitalize">{String(seo.meta_description_quality ?? "Unknown").replace("_", " ")}</span></div>
          </div>
          {typeof seo.heading_structure === "string" && seo.heading_structure && (
            <div className="flex items-start justify-between"><span className="text-sm text-gray-400">Headings</span><span className="text-sm text-white text-right max-w-xs">{seo.heading_structure}</span></div>
          )}
          <div className="flex items-center justify-between"><span className="text-sm text-gray-400">Internal Links</span><span className="text-sm text-white">{String(seo.internal_links_count ?? 0)}</span></div>
          <div className="flex items-center justify-between"><span className="text-sm text-gray-400">External Links</span><span className="text-sm text-white">{String(seo.external_links_count ?? 0)}</span></div>
          <div className="flex items-center justify-between"><span className="text-sm text-gray-400">Structured Data</span><span className="text-sm text-white">{seo.has_structured_data ? "Yes" : "No"}</span></div>
        </div>
        {Array.isArray(seo.issues) && seo.issues.length > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-800">
            <p className="text-sm text-gray-400 mb-2">Issues Found:</p>
            <div className="space-y-1.5">{seo.issues.map((issue: string, i: number) => (
              <div key={i} className="flex items-start gap-2"><XCircle className="w-3.5 h-3.5 text-red-400 mt-0.5 shrink-0" /><span className="text-sm text-gray-300">{issue}</span></div>
            ))}</div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-green-400 mb-3">Strengths</h3>
          <div className="space-y-2">{strengths.length > 0 ? strengths.map((s, i) => (
            <div key={i} className="flex items-start gap-2"><CheckCircle className="w-3.5 h-3.5 text-green-400 mt-0.5 shrink-0" /><span className="text-sm text-gray-300">{s}</span></div>
          )) : <p className="text-sm text-gray-500">None identified</p>}</div>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-red-400 mb-3">Weaknesses</h3>
          <div className="space-y-2">{weaknesses.length > 0 ? weaknesses.map((w, i) => (
            <div key={i} className="flex items-start gap-2"><XCircle className="w-3.5 h-3.5 text-red-400 mt-0.5 shrink-0" /><span className="text-sm text-gray-300">{w}</span></div>
          )) : <p className="text-sm text-gray-500">None identified</p>}</div>
        </div>
      </div>

      {recs.length > 0 && (
        <div className="mb-6">
          <h2 className="text-base font-semibold text-white mb-3">Recommendations</h2>
          <div className="space-y-3">{recs.map((rec, i) => {
            const p = String(rec.priority);
            const pStyle = p === "critical" || p === "high" ? "bg-orange-500/10 text-orange-400" : p === "medium" ? "bg-yellow-500/10 text-yellow-400" : "bg-gray-500/10 text-gray-400";
            return (
              <div key={i} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <span className={"inline-flex items-center px-2 py-1 rounded text-xs font-medium shrink-0 " + pStyle}>{String(rec.priority)}</span>
                  <div>
                    <p className="text-sm text-white">{String(rec.action)}</p>
                    {typeof rec.reasoning === "string" && rec.reasoning && <p className="text-xs text-gray-400 mt-1.5">{rec.reasoning}</p>}
                    <div className="flex items-center gap-3 mt-2">
                      <span className="text-xs text-gray-500">{String(rec.category)}</span>
                      <span className="text-xs text-gray-500">{rec.effort === "quick_win" ? "Quick win" : String(rec.effort)}</span>
                      <span className="text-xs text-gray-500">Impact: {String(rec.expected_impact)}</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}</div>
        </div>
      )}
    </div>
  );
}
