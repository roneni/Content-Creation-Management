"use client";

import { trpc } from "@/lib/trpc/client";
import { useParams } from "next/navigation";
import { ArrowLeft, Loader2, Zap, Calendar, FilePlus, MessageCircle, ArrowRight, Target } from "lucide-react";
import Link from "next/link";

function healthColor(score: number): string {
  if (score >= 70) return "text-green-400";
  if (score >= 50) return "text-yellow-400";
  return "text-red-400";
}
function healthBg(score: number): string {
  if (score >= 70) return "bg-green-500/10 border-green-500/20";
  if (score >= 50) return "bg-yellow-500/10 border-yellow-500/20";
  return "bg-red-500/10 border-red-500/20";
}
function impactStyle(impact: string) {
  if (impact === "high") return "bg-green-500/10 text-green-400";
  if (impact === "medium") return "bg-yellow-500/10 text-yellow-400";
  return "bg-gray-500/10 text-gray-400";
}

export default function StrategyPage() {
  const params = useParams();
  const siteId = params.siteId as string;
  const utils = trpc.useUtils();

  const { data: strategy, isLoading } = trpc.strategy.getLatest.useQuery({ siteId });
  const generate = trpc.strategy.generate.useMutation({
    onSuccess: () => { utils.strategy.getLatest.invalidate({ siteId }); },
  });

  if (isLoading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 text-gray-500 animate-spin" /></div>;

  // No strategy yet
  if (!strategy) {
    return (
      <div className="max-w-3xl">
        <Link href={"/dashboard/sites/" + siteId} className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors mb-6">
          <ArrowLeft className="w-4 h-4" />Back to site
        </Link>
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 text-center">
          <Target className="w-10 h-10 text-blue-400 mx-auto mb-4" />
          <h2 className="text-lg font-medium text-white mb-2">Generate Site Strategy</h2>
          <p className="text-sm text-gray-400 max-w-md mx-auto mb-6">
            Claude will look at all your page analyses together and create a comprehensive strategy with a health score, priorities, content calendar, and missing page suggestions.
          </p>
          <button onClick={() => generate.mutate({ siteId })} disabled={generate.isPending}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-xl transition-colors disabled:opacity-50">
            {generate.isPending ? <><Loader2 className="w-4 h-4 animate-spin" />Generating strategy...</> : <><Zap className="w-4 h-4" />Generate Strategy</>}
          </button>
          {generate.isError && <p className="text-red-400 text-sm mt-3">{generate.error.message}</p>}
        </div>
      </div>
    );
  }

  const topPriorities = (strategy.topPriorities ?? []) as string[];
  const calendar = (strategy.contentCalendar ?? []) as { week: number; action: string; targetPage: string; expectedImpact: string }[];
  const missingPages = (strategy.missingPages ?? []) as { suggestedUrl: string; reasoning: string }[];
  const questions = (strategy.postScanQuestions ?? []) as { id: string; question: string; options: string[] }[];

  return (
    <div className="max-w-3xl">
      <Link href={"/dashboard/sites/" + siteId} className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors mb-6">
        <ArrowLeft className="w-4 h-4" />Back to site
      </Link>

      {/* Health score */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-white">Site Strategy</h1>
            <p className="text-sm text-gray-400 mt-1">AI-generated strategy based on {topPriorities.length > 0 ? "your full site analysis" : "available data"}</p>
          </div>
          <div className={"text-center px-5 py-3 rounded-xl border " + healthBg(strategy.healthScore ?? 0)}>
            <div className={"text-3xl font-bold " + healthColor(strategy.healthScore ?? 0)}>{strategy.healthScore}</div>
            <div className="text-xs text-gray-400">Health Score</div>
          </div>
        </div>
      </div>

      {/* Top priorities */}
      {topPriorities.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 mb-6">
          <h2 className="text-base font-semibold text-white mb-4 flex items-center gap-2"><Target className="w-4 h-4 text-blue-400" />Top Priorities</h2>
          <div className="space-y-3">
            {topPriorities.map((p, i) => (
              <div key={i} className="flex items-start gap-3">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold shrink-0">{i + 1}</span>
                <p className="text-sm text-gray-300">{p}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Content calendar */}
      {calendar.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 mb-6">
          <h2 className="text-base font-semibold text-white mb-4 flex items-center gap-2"><Calendar className="w-4 h-4 text-purple-400" />Content Calendar</h2>
          <div className="space-y-3">
            {calendar.map((item, i) => (
              <div key={i} className="flex items-start gap-3 p-3 bg-gray-800/50 rounded-xl">
                <span className="px-2 py-1 bg-purple-500/10 text-purple-400 text-xs font-medium rounded shrink-0">Week {item.week}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white">{item.action}</p>
                  <div className="flex items-center gap-3 mt-1.5">
                    <span className="text-xs text-gray-500">{item.targetPage}</span>
                    <span className={"text-xs px-1.5 py-0.5 rounded " + impactStyle(item.expectedImpact)}>{item.expectedImpact} impact</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Missing pages */}
      {missingPages.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 mb-6">
          <h2 className="text-base font-semibold text-white mb-4 flex items-center gap-2"><FilePlus className="w-4 h-4 text-green-400" />Suggested New Pages</h2>
          <div className="space-y-3">
            {missingPages.map((page, i) => (
              <div key={i} className="p-3 bg-gray-800/50 rounded-xl">
                <p className="text-sm text-white font-medium">{page.suggestedUrl}</p>
                <p className="text-xs text-gray-400 mt-1">{page.reasoning}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Moment 2 questions link */}
      {questions.length > 0 && !strategy.postScanCompleted && (
        <div className="bg-blue-900/10 border border-blue-800/30 rounded-2xl p-6 mb-6">
          <div className="flex items-center gap-3">
            <MessageCircle className="w-5 h-5 text-blue-400 shrink-0" />
            <div className="flex-1">
              <h3 className="text-white font-medium">Help refine your strategy</h3>
              <p className="text-sm text-gray-400 mt-1">The AI has {questions.length} questions about your site that would help it give better recommendations.</p>
            </div>
            <Link href={"/dashboard/sites/" + siteId + "/questions"} className="flex items-center gap-1 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors shrink-0">
              Answer<ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        </div>
      )}

      {strategy.postScanCompleted && (
        <p className="text-sm text-green-400 text-center mb-6">Post-scan questions answered — your strategy is fully informed.</p>
      )}

      {/* Regenerate */}
      <div className="text-center">
        <button onClick={() => generate.mutate({ siteId })} disabled={generate.isPending}
          className="text-sm text-gray-400 hover:text-white transition-colors disabled:opacity-50">
          {generate.isPending ? "Regenerating..." : "Regenerate strategy"}
        </button>
      </div>
    </div>
  );
}
