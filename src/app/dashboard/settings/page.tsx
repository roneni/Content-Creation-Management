"use client";

import { Settings } from "lucide-react";

export default function SettingsPage() {
  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <Settings className="w-5 h-5 text-gray-400" />
        <h1 className="text-xl font-semibold text-white">Settings</h1>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
        <p className="text-gray-400 text-sm">
          Account settings and integrations will be available here.
          Google Search Console and Google Analytics connections will be added in Phase 1D.
        </p>
      </div>
    </div>
  );
}
