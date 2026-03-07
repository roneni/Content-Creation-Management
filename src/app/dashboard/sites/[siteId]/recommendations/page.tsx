"use client";

import { trpc } from "@/lib/trpc/client";
import { useParams } from "next/navigation";
import { ArrowLeft, Loader2, Check, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

type FP = "all" | "critical" | "high" | "medium" | "low";
type FC = "all" | "content" | "seo" | "ux" | "technical" | "strategy";

function priorityStyle(p: string) {
  if (p === "critical") return "bg-red-500/10 text-red-400";
  if (p === "high") return "bg-orange-500/10 text-orange-400";
  if (p === "medium") return "bg-yellow-500/10 text-yellow-400";
  return "bg-gray-500/10 text-gray-400";
}

export default function RecommendationsPage() {
  const params = useParams();
  const siteId = params.siteId as string;
  const [pf, setPf] = useState<FP>("all");
  const [cf, setCf] = useState<FC>("all");
  const utils = trpc.useUtils();

  const { data: recs, isLoading } = trpc.analysis.getRecommendations.useQuery({ siteId });
  const updateStatus = trpc.analysis.updateRecommendationStatus.useMutation({
    onSuccess: () => { utils.analysis.getRecommendations.invalidate({ siteId }); },
  });

  const filtered = (recs ?? []).filter((r) => {
    if (pf !== "all" && r.priority !== pf) return false;
    if (cf !== "all" && r.category !== cf) return false;
    return true;
  });

  const po: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  const so: Record<string, number> = { pending: 0, in_progress: 1, completed: 2, dismissed: 3 };
  const sorted = [...filtered].sort((a, b) => {
    const sd = (so[a.status] ?? 9) - (so[b.status] ?? 9);
    return sd !== 0 ? sd : (po[a.priority] ?? 9) - (po[b.priority] ?? 9);
  });

  if (isLoading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 text-gray-500 animate-spin" /></div>;

  return (
    <div className="max-w-4xl">
      <Link href={"/dashboard/sites/" + siteId} className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors mb-6">
        <ArrowLeft className="w-4 h-4" />Back to site
      </Link>
      <h1 className="text-xl font-semibold text-white mb-4">Recommendations ({recs?.length ?? 0})</h1>

      <div className="flex flex-wrap items-center gap-2 mb-6">
        <span className="text-xs text-gray-500 mr-1">Priority:</span>
        {(["all","critical","high","medium","low"] as FP[]).map((p) => (
          <button key={p} onClick={() => setPf(p)} className={"px-2.5 py-1 rounded-lg text-xs font-medium transition-colors " + (pf === p ? "bg-gray-700 text-white" : "bg-gray-800/50 text-gray-400 hover:text-white")}>{p === "all" ? "All" : p}</button>
        ))}
        <span className="text-xs text-gray-500 mr-1 ml-3">Category:</span>
        {(["all","content","seo","ux","technical","strategy"] as FC[]).map((c) => (
          <button key={c} onClick={() => setCf(c)} className={"px-2.5 py-1 rounded-lg text-xs font-medium transition-colors " + (cf === c ? "bg-gray-700 text-white" : "bg-gray-800/50 text-gray-400 hover:text-white")}>{c === "all" ? "All" : c}</button>
        ))}
      </div>

      <div className="space-y-3">
        {sorted.map((rec) => (
          <div key={rec.id} className={"bg-gray-900 border border-gray-800 rounded-xl p-4 " + (rec.status === "completed" || rec.status === "dismissed" ? "opacity-60" : "")}>
            <div className="flex items-start gap-3">
              <span className={"inline-flex items-center px-2 py-1 rounded text-xs font-medium shrink-0 " + priorityStyle(rec.priority)}>{rec.priority}</span>
              <div className="flex-1 min-w-0">
                <p className={"text-sm " + (rec.status === "completed" ? "line-through text-gray-400" : "text-white")}>{rec.action}</p>
                {rec.reasoning && <p className="text-xs text-gray-400 mt-1.5">{rec.reasoning}</p>}
                <div className="flex flex-wrap items-center gap-3 mt-2">
                  <span className="text-xs text-gray-500">{rec.category}</span>
                  {rec.effort && <span className="text-xs text-gray-500">{rec.effort === "quick_win" ? "Quick win" : rec.effort}</span>}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => updateStatus.mutate({ id: rec.id, status: rec.status === "completed" ? "pending" : "completed" })}
                  className={"p-1.5 rounded-lg transition-colors " + (rec.status === "completed" ? "bg-green-500/10 text-green-400" : "hover:bg-gray-800 text-gray-500 hover:text-green-400")}>
                  <Check className="w-4 h-4" />
                </button>
                <button onClick={() => updateStatus.mutate({ id: rec.id, status: rec.status === "dismissed" ? "pending" : "dismissed" })}
                  className={"p-1.5 rounded-lg transition-colors " + (rec.status === "dismissed" ? "bg-gray-500/10 text-gray-400" : "hover:bg-gray-800 text-gray-500 hover:text-gray-300")}>
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
        {sorted.length === 0 && <p className="text-gray-500 text-sm text-center py-8">No recommendations match your filters.</p>}
      </div>
    </div>
  );
}
