"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { TRPCProvider } from "@/lib/trpc/provider";
import { trpc } from "@/lib/trpc/client";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import type { OnboardingAnswers } from "@/types";

const TOTAL_STEPS = 7;

const SUCCESS_GOALS = [
  { id: "more_traffic", label: "More organic traffic from Google" },
  { id: "more_subscribers", label: "More subscribers / followers" },
  { id: "more_sales", label: "More sales or revenue" },
  { id: "brand_awareness", label: "Brand awareness" },
  { id: "community_building", label: "Community building" },
  { id: "other", label: "Something else" },
] as const;

const PROFIT_OPTIONS = [
  { value: "yes", label: "Yes", description: "It generates or should generate revenue" },
  { value: "no", label: "No", description: "It's a personal or community project" },
  { value: "not_yet", label: "Not yet", description: "But maybe later" },
] as const;

const BUDGET_OPTIONS = [
  { value: "not_now", label: "Not right now", description: "Free tools only for now" },
  { value: "small", label: "Small budget", description: "Under $50/month" },
  { value: "moderate", label: "Moderate budget", description: "$50–500/month" },
  { value: "whatever_it_takes", label: "Whatever it takes", description: "Growth is the priority" },
] as const;

const ROLE_OPTIONS = [
  { value: "solo_creator", label: "Solo creator", description: "I do everything myself" },
  { value: "small_team", label: "Small team", description: "2–10 people" },
  { value: "agency", label: "Agency / Freelancer", description: "Managing client sites" },
  { value: "other", label: "Other", description: "Something different" },
] as const;

function OnboardingForm() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [answers, setAnswers] = useState<Partial<OnboardingAnswers>>({
    success_goals: [],
  });
  const [otherGoal, setOtherGoal] = useState("");

  const updateOnboarding = trpc.user.updateOnboarding.useMutation({
    onSuccess: () => router.push("/dashboard"),
  });

  const canProceed = (): boolean => {
    switch (step) {
      case 1: return !!answers.site_description?.trim();
      case 2: return !!answers.target_audience?.trim();
      case 3: return (answers.success_goals?.length ?? 0) > 0;
      case 4: return !!answers.for_profit;
      case 5: return !!answers.budget_willingness;
      case 6: return !!answers.perfect_vision?.trim();
      case 7: return !!answers.role;
      default: return false;
    }
  };

  const handleNext = () => {
    if (step < TOTAL_STEPS) {
      setStep(step + 1);
    } else {
      const finalGoals = [...(answers.success_goals ?? [])];
      if (otherGoal.trim() && finalGoals.includes("other")) {
        const idx = finalGoals.indexOf("other");
        finalGoals[idx] = otherGoal.trim();
      }
      updateOnboarding.mutate({ ...answers, success_goals: finalGoals } as OnboardingAnswers);
    }
  };

  const toggleGoal = (goalId: string) => {
    const current = answers.success_goals ?? [];
    const updated = current.includes(goalId)
      ? current.filter((g) => g !== goalId)
      : [...current, goalId];
    setAnswers({ ...answers, success_goals: updated });
  };

  const inputClass =
    "w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder:text-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 resize-none";

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">
      {/* Progress bar */}
      <div className="w-full bg-gray-900 h-1">
        <div
          className="h-full bg-blue-600 transition-all duration-300"
          style={{ width: `${(step / TOTAL_STEPS) * 100}%` }}
        />
      </div>

      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-lg">
          <p className="text-sm text-gray-500 mb-8 text-center">
            Step {step} of {TOTAL_STEPS}
          </p>

          {/* Step 1 */}
          {step === 1 && (
            <Step title="What is your website about?">
              <textarea
                value={answers.site_description ?? ""}
                onChange={(e) => setAnswers({ ...answers, site_description: e.target.value })}
                placeholder="e.g., A music community platform for psytrance fans..."
                maxLength={500}
                rows={4}
                className={inputClass}
              />
              <CharCount current={answers.site_description?.length ?? 0} max={500} />
            </Step>
          )}

          {/* Step 2 */}
          {step === 2 && (
            <Step title="Who are you trying to reach?">
              <textarea
                value={answers.target_audience ?? ""}
                onChange={(e) => setAnswers({ ...answers, target_audience: e.target.value })}
                placeholder="e.g., Electronic music fans who haven't discovered our YouTube channel yet..."
                maxLength={500}
                rows={4}
                className={inputClass}
              />
              <CharCount current={answers.target_audience?.length ?? 0} max={500} />
            </Step>
          )}

          {/* Step 3 */}
          {step === 3 && (
            <Step title="What does success look like for this site?">
              <p className="text-sm text-gray-400 mb-4">Select all that apply.</p>
              <div className="space-y-3">
                {SUCCESS_GOALS.map((goal) => (
                  <ToggleButton
                    key={goal.id}
                    active={answers.success_goals?.includes(goal.id) ?? false}
                    onClick={() => toggleGoal(goal.id)}
                    label={goal.label}
                  />
                ))}
              </div>
              {answers.success_goals?.includes("other") && (
                <input
                  type="text"
                  value={otherGoal}
                  onChange={(e) => setOtherGoal(e.target.value)}
                  placeholder="Describe your goal..."
                  className={`mt-3 ${inputClass}`}
                />
              )}
            </Step>
          )}

          {/* Step 4 */}
          {step === 4 && (
            <Step title="Is this site for profit?">
              <CardSelect
                options={PROFIT_OPTIONS}
                selected={answers.for_profit}
                onSelect={(v) => setAnswers({ ...answers, for_profit: v as OnboardingAnswers["for_profit"] })}
              />
            </Step>
          )}

          {/* Step 5 */}
          {step === 5 && (
            <Step title="Are you willing to invest money to grow it?">
              <CardSelect
                options={BUDGET_OPTIONS}
                selected={answers.budget_willingness}
                onSelect={(v) => setAnswers({ ...answers, budget_willingness: v as OnboardingAnswers["budget_willingness"] })}
              />
            </Step>
          )}

          {/* Step 6 */}
          {step === 6 && (
            <Step title="How do you see your site when it's already finished and perfect?">
              <p className="text-sm text-gray-400 mb-4">
                Dream big — describe what the ideal version of this site looks like.
              </p>
              <textarea
                value={answers.perfect_vision ?? ""}
                onChange={(e) => setAnswers({ ...answers, perfect_vision: e.target.value })}
                placeholder="The number one destination for..."
                maxLength={1000}
                rows={6}
                className={inputClass}
              />
              <CharCount current={answers.perfect_vision?.length ?? 0} max={1000} />
            </Step>
          )}

          {/* Step 7 */}
          {step === 7 && (
            <Step title="What best describes your role?">
              <CardSelect
                options={ROLE_OPTIONS}
                selected={answers.role}
                onSelect={(v) => setAnswers({ ...answers, role: v as OnboardingAnswers["role"] })}
              />
            </Step>
          )}

          {/* Navigation */}
          <div className="flex items-center justify-between mt-8">
            <button
              onClick={() => setStep(step - 1)}
              disabled={step === 1}
              className="flex items-center gap-1 text-gray-400 hover:text-white transition-colors disabled:opacity-0 disabled:pointer-events-none"
            >
              <ChevronLeft className="w-4 h-4" />
              Back
            </button>
            <button
              onClick={handleNext}
              disabled={!canProceed() || updateOnboarding.isPending}
              className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {updateOnboarding.isPending ? (
                <><Loader2 className="w-4 h-4 animate-spin" />Saving...</>
              ) : step === TOTAL_STEPS ? (
                "Finish"
              ) : (
                <>Next<ChevronRight className="w-4 h-4" /></>
              )}
            </button>
          </div>

          {updateOnboarding.isError && (
            <p className="text-red-400 text-sm text-center mt-4">
              Something went wrong. Please try again.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// Wrap with provider
export default function OnboardingPage() {
  return (
    <TRPCProvider>
      <OnboardingForm />
    </TRPCProvider>
  );
}

// --- Reusable components ---

function Step({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-xl font-semibold text-white mb-6">{title}</h2>
      {children}
    </div>
  );
}

function CharCount({ current, max }: { current: number; max: number }) {
  return (
    <p className="text-xs text-gray-500 text-right mt-1.5">
      {current}/{max}
    </p>
  );
}

function ToggleButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-4 py-3 rounded-xl border transition-colors ${
        active
          ? "border-blue-500 bg-blue-500/10 text-white"
          : "border-gray-700 bg-gray-800 text-gray-300 hover:border-gray-600"
      }`}
    >
      {label}
    </button>
  );
}

function CardSelect({
  options,
  selected,
  onSelect,
}: {
  options: readonly { value: string; label: string; description: string }[];
  selected: string | undefined;
  onSelect: (value: string) => void;
}) {
  return (
    <div className="space-y-3">
      {options.map((option) => (
        <button
          key={option.value}
          onClick={() => onSelect(option.value)}
          className={`w-full text-left px-4 py-4 rounded-xl border transition-colors ${
            selected === option.value
              ? "border-blue-500 bg-blue-500/10"
              : "border-gray-700 bg-gray-800 hover:border-gray-600"
          }`}
        >
          <div className="text-white font-medium">{option.label}</div>
          <div className="text-sm text-gray-400 mt-0.5">{option.description}</div>
        </button>
      ))}
    </div>
  );
}
