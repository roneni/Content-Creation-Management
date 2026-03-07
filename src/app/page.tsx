import Link from "next/link";
import { Zap, Globe, Brain, Target } from "lucide-react";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gray-950">
      {/* Nav */}
      <nav className="border-b border-gray-800/50">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
              <Zap className="w-4 h-4 text-white" />
            </div>
            <span className="font-semibold text-white text-sm">AI Site Strategist</span>
          </div>
          <Link
            href="/login"
            className="px-4 py-2 bg-white hover:bg-gray-100 text-gray-900 text-sm font-medium rounded-lg transition-colors"
          >
            Get Started
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-3xl mx-auto px-4 pt-24 pb-20 text-center">
        <h1 className="text-4xl sm:text-5xl font-bold text-white tracking-tight leading-tight">
          Understand Your Website.
          <br />
          Improve It.
        </h1>
        <p className="mt-5 text-lg text-gray-400 max-w-xl mx-auto">
          AI-powered analysis that tells you exactly what to fix, what to
          create, and what to prioritize — specific to your goals, your
          audience, your site.
        </p>
        <div className="mt-8">
          <Link
            href="/login"
            className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-xl transition-colors"
          >
            Get Started
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
            </svg>
          </Link>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-5xl mx-auto px-4 pb-24">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <FeatureCard
            icon={Globe}
            title="Smart Crawling"
            description="We crawl every page of your site, understanding its structure, content, and technical health automatically."
          />
          <FeatureCard
            icon={Brain}
            title="AI Analysis"
            description="Each page is analyzed by AI that understands your goals. Not generic advice — recommendations built for your specific situation."
          />
          <FeatureCard
            icon={Target}
            title="Actionable Recommendations"
            description="Prioritized actions with effort estimates. Know what to tackle first for the biggest impact on your site."
          />
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-800/50 py-8">
        <div className="max-w-5xl mx-auto px-4 text-center text-sm text-gray-500">
          AI Site Strategist
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
}) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
      <div className="w-10 h-10 rounded-xl bg-blue-600/10 flex items-center justify-center mb-4">
        <Icon className="w-5 h-5 text-blue-400" />
      </div>
      <h3 className="text-white font-medium mb-2">{title}</h3>
      <p className="text-sm text-gray-400 leading-relaxed">{description}</p>
    </div>
  );
}
