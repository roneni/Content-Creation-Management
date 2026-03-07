"use client";

import { trpc } from "@/lib/trpc/client";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Globe, Loader2, Trash2, ExternalLink } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import type { SiteStatus } from "@/types";

const STATUS_STYLES: Record<SiteStatus, { bg: string; text: string; label: string }> = {
  pending: { bg: "bg-yellow-500/10", text: "text-yellow-400", label: "Pending" },
  crawling: { bg: "bg-blue-500/10", text: "text-blue-400", label: "Crawling" },
  analyzing: { bg: "bg-purple-500/10", text: "text-purple-400", label: "Analyzing" },
  ready: { bg: "bg-green-500/10", text: "text-green-400", label: "Ready" },
  error: { bg: "bg-red-500/10", text: "text-red-400", label: "Error" },
};

export default function SiteDetailPage() {
  const params = useParams();
  const router = useRouter();
  const siteId = params.siteId as string;
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const { data: site, isLoading } = trpc.sites.get.useQuery({ id: siteId });

  const deleteSite = trpc.sites.delete.useMutation({
    onSuccess: () => router.push("/dashboard"),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 text-gray-500 animate-spin" />
      </div>
    );
  }

  if (!site) {
    return (
      <div className="text-center mt-20">
        <p className="text-gray-400">Site not found.</p>
        <Link href="/dashboard" className="text-blue-400 hover:text-blue-300 text-sm mt-2 inline-block">
          Back to dashboard
        </Link>
      </div>
    );
  }

  const status = STATUS_STYLES[(site.status as SiteStatus) ?? "pending"];

  return (
    <div className="max-w-2xl">
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Dashboard
      </Link>

      {/* Site header */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 mb-6">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-gray-800 flex items-center justify-center">
              <Globe className="w-6 h-6 text-gray-400" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-white">{site.name}</h1>
              <a
                href={site.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-blue-400 transition-colors"
              >
                {site.domain}
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
          <span
            className={`inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium ${status.bg} ${status.text}`}
          >
            {status.label}
          </span>
        </div>

        {site.healthScore !== null && (
          <div className="mt-4 pt-4 border-t border-gray-800">
            <p className="text-sm text-gray-400">Health Score</p>
            <p className="text-3xl font-bold text-white">{site.healthScore}/100</p>
          </div>
        )}
      </div>

      {/* Pending state */}
      {site.status === "pending" && (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
          <div className="text-center py-8">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-yellow-500/10 mb-4">
              <Globe className="w-6 h-6 text-yellow-400" />
            </div>
            <h2 className="text-lg font-medium text-white mb-2">
              Waiting for analysis
            </h2>
            <p className="text-sm text-gray-400 max-w-sm mx-auto">
              Site crawling and AI analysis will be available in Phase 1B.
              Your site has been saved and is ready to go.
            </p>
          </div>
        </div>
      )}

      {/* Delete */}
      <div className="mt-8 pt-6 border-t border-gray-800">
        {!showDeleteConfirm ? (
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="flex items-center gap-2 text-sm text-gray-500 hover:text-red-400 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            Delete this site
          </button>
        ) : (
          <div className="flex items-center gap-3">
            <p className="text-sm text-red-400">Delete this site permanently?</p>
            <button
              onClick={() => deleteSite.mutate({ id: siteId })}
              disabled={deleteSite.isPending}
              className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white text-sm rounded-lg transition-colors disabled:opacity-50"
            >
              {deleteSite.isPending ? "Deleting..." : "Yes, delete"}
            </button>
            <button
              onClick={() => setShowDeleteConfirm(false)}
              className="px-3 py-1.5 text-gray-400 hover:text-white text-sm transition-colors"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
