"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import { ArrowLeft, Loader2, Globe } from "lucide-react";
import Link from "next/link";

export default function NewSitePage() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");

  const createSite = trpc.sites.create.useMutation({
    onSuccess: (site) => {
      router.push(`/dashboard/sites/${site.id}`);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;
    createSite.mutate({ url: url.trim(), name: name.trim() || undefined });
  };

  // Basic URL validation
  const isValidUrl = (input: string): boolean => {
    if (!input.trim()) return true; // empty is OK (not submitted yet)
    try {
      new URL(input.startsWith("http") ? input : `https://${input}`);
      return true;
    } catch {
      return false;
    }
  };

  return (
    <div className="max-w-lg mx-auto">
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors mb-8"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to dashboard
      </Link>

      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-blue-600/10 flex items-center justify-center">
          <Globe className="w-5 h-5 text-blue-400" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-white">Add a new site</h1>
          <p className="text-sm text-gray-400">
            Enter the URL and we&apos;ll start analyzing it.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="url" className="block text-sm font-medium text-gray-300 mb-1.5">
            Website URL
          </label>
          <input
            id="url"
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://yoursite.com"
            className={`w-full bg-gray-800 border rounded-xl px-4 py-3 text-white placeholder:text-gray-500 focus:outline-none focus:ring-1 ${
              url && !isValidUrl(url)
                ? "border-red-500 focus:border-red-500 focus:ring-red-500"
                : "border-gray-700 focus:border-blue-500 focus:ring-blue-500"
            }`}
          />
          {url && !isValidUrl(url) && (
            <p className="text-red-400 text-xs mt-1.5">
              Please enter a valid URL
            </p>
          )}
        </div>

        <div>
          <label htmlFor="name" className="block text-sm font-medium text-gray-300 mb-1.5">
            Site name <span className="text-gray-500">(optional)</span>
          </label>
          <input
            id="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My Portfolio"
            className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder:text-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <button
          type="submit"
          disabled={!url.trim() || !isValidUrl(url) || createSite.isPending}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-6"
        >
          {createSite.isPending ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Creating...
            </>
          ) : (
            "Add Site"
          )}
        </button>

        {createSite.isError && (
          <p className="text-red-400 text-sm text-center">
            Failed to add site. Please try again.
          </p>
        )}
      </form>
    </div>
  );
}
