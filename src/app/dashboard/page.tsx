"use client";

import { trpc } from "@/lib/trpc/client";
import { useRouter } from "next/navigation";
import { Globe, Plus, ArrowRight, Loader2 } from "lucide-react";
import { useState } from "react";
import type { SiteStatus } from "@/types";

const STATUS_STYLES: Record<SiteStatus, { bg: string; text: string; label: string }> = {
  pending: { bg: "bg-yellow-500/10", text: "text-yellow-400", label: "Pending" },
  crawling: { bg: "bg-blue-500/10", text: "text-blue-400", label: "Crawling" },
  analyzing: { bg: "bg-purple-500/10", text: "text-purple-400", label: "Analyzing" },
  ready: { bg: "bg-green-500/10", text: "text-green-400", label: "Ready" },
  error: { bg: "bg-red-500/10", text: "text-red-400", label: "Error" },
};

export default function DashboardPage() {
  const router = useRouter();
  const { data: sites, isLoading } = trpc.sites.list.useQuery();
  const [url, setUrl] = useState("");
  const [siteName, setSiteName] = useState("");

  const utils = trpc.useUtils();
  const createSite = trpc.sites.create.useMutation({
    onSuccess: (site) => {
      utils.sites.list.invalidate();
      router.push(`/dashboard/sites/${site.id}`);
    },
  });

  const handleQuickAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;
    createSite.mutate({ url: url.trim(), name: siteName.trim() || undefined });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 text-gray-500 animate-spin" />
      </div>
    );
  }

  // Empty state
  if (!sites || sites.length === 0) {
    return (
      <div className="max-w-lg mx-auto mt-20">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-blue-600/10 mb-4">
            <Globe className="w-7 h-7 text-blue-400" />
          </div>
          <h1 className="text-2xl font-semibold text-white">Add your first site</h1>
          <p className="text-gray-400 mt-2">
            Enter your website URL and we&apos;ll analyze it for you.
          </p>
        </div>

        <form onSubmit={handleQuickAdd} className="space-y-3">
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://yoursite.com"
            className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder:text-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
          <input
            type="text"
            value={siteName}
            onChange={(e) => setSiteName(e.target.value)}
            placeholder="Site name (optional)"
            className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder:text-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
          <button
            type="submit"
            disabled={!url.trim() || createSite.isPending}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {createSite.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Plus className="w-4 h-4" />
            )}
            Add Site
          </button>
        </form>

        {createSite.isError && (
          <p className="text-red-400 text-sm text-center mt-3">
            Failed to add site. Check the URL and try again.
          </p>
        )}
      </div>
    );
  }

  // Sites grid
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-white">My Sites</h1>
        <button
          onClick={() => router.push("/dashboard/sites/new")}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Site
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {sites.map((site) => {
          const status = STATUS_STYLES[(site.status as SiteStatus) ?? "pending"];
          return (
            <button
              key={site.id}
              onClick={() => router.push(`/dashboard/sites/${site.id}`)}
              className="bg-gray-900 border border-gray-800 rounded-2xl p-5 text-left hover:border-gray-700 transition-colors group"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gray-800 flex items-center justify-center">
                    <Globe className="w-5 h-5 text-gray-400" />
                  </div>
                  <div>
                    <h3 className="font-medium text-white">{site.name}</h3>
                    <p className="text-xs text-gray-500">{site.domain}</p>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-gray-600 group-hover:text-gray-400 transition-colors" />
              </div>

              <div className="flex items-center gap-3">
                <span
                  className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${status.bg} ${status.text}`}
                >
                  {status.label}
                </span>
                {site.healthScore !== null && (
                  <span className="text-xs text-gray-500">
                    Health: {site.healthScore}/100
                  </span>
                )}
              </div>

              {site.lastAnalysisAt && (
                <p className="text-xs text-gray-600 mt-3">
                  Last analyzed: {new Date(site.lastAnalysisAt).toLocaleDateString()}
                </p>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
