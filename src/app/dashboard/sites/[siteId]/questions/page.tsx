"use client";

import { trpc } from "@/lib/trpc/client";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Loader2, MessageCircle, ChevronRight, Check } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

export default function PostScanQuestionsPage() {
  const params = useParams();
  const router = useRouter();
  const siteId = params.siteId as string;
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [step, setStep] = useState(0);

  const { data: strategy, isLoading } = trpc.strategy.getLatest.useQuery({ siteId });
  const saveAnswers = trpc.strategy.savePostScanAnswers.useMutation({
    onSuccess: () => router.push("/dashboard/sites/" + siteId + "/strategy"),
  });

  if (isLoading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 text-gray-500 animate-spin" /></div>;

  if (!strategy) {
    return (
      <div className="max-w-lg mx-auto mt-20 text-center">
        <p className="text-gray-400">No strategy generated yet.</p>
        <Link href={"/dashboard/sites/" + siteId + "/strategy"} className="text-blue-400 text-sm mt-2 inline-block">Generate one first</Link>
      </div>
    );
  }

  if (strategy.postScanCompleted) {
    return (
      <div className="max-w-lg mx-auto mt-20 text-center">
        <Check className="w-10 h-10 text-green-400 mx-auto mb-4" />
        <h2 className="text-lg font-medium text-white mb-2">Already answered</h2>
        <p className="text-gray-400 text-sm mb-4">You have already answered the post-scan questions.</p>
        <Link href={"/dashboard/sites/" + siteId + "/strategy"} className="text-blue-400 text-sm">Back to strategy</Link>
      </div>
    );
  }

  const questions = (strategy.postScanQuestions ?? []) as { id: string; question: string; options: string[] }[];
  if (questions.length === 0) {
    return (
      <div className="max-w-lg mx-auto mt-20 text-center">
        <p className="text-gray-400">No questions to answer.</p>
        <Link href={"/dashboard/sites/" + siteId + "/strategy"} className="text-blue-400 text-sm mt-2 inline-block">Back to strategy</Link>
      </div>
    );
  }

  const currentQuestion = questions[step];
  const isLast = step === questions.length - 1;
  const canProceed = !!answers[currentQuestion.id];

  const handleNext = () => {
    if (isLast) {
      saveAnswers.mutate({ strategyId: strategy.id, answers });
    } else {
      setStep(step + 1);
    }
  };

  return (
    <div className="min-h-[60vh] flex flex-col">
      <div className="max-w-lg mx-auto w-full">
        <Link href={"/dashboard/sites/" + siteId + "/strategy"} className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors mb-8">
          <ArrowLeft className="w-4 h-4" />Back to strategy
        </Link>

        {/* Progress */}
        <div className="w-full bg-gray-900 h-1 rounded-full mb-8">
          <div className="h-full bg-blue-600 rounded-full transition-all duration-300" style={{ width: ((step + 1) / questions.length * 100) + "%" }} />
        </div>

        <div className="flex items-center gap-2 mb-2">
          <MessageCircle className="w-4 h-4 text-blue-400" />
          <span className="text-xs text-gray-500">Question {step + 1} of {questions.length}</span>
        </div>

        <h2 className="text-xl font-semibold text-white mb-6">{currentQuestion.question}</h2>

        <div className="space-y-3">
          {currentQuestion.options.map((option, i) => (
            <button key={i} onClick={() => setAnswers({ ...answers, [currentQuestion.id]: option })}
              className={"w-full text-left px-4 py-4 rounded-xl border transition-colors " +
                (answers[currentQuestion.id] === option
                  ? "border-blue-500 bg-blue-500/10 text-white"
                  : "border-gray-700 bg-gray-800 text-gray-300 hover:border-gray-600")}>
              {option}
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between mt-8">
          <button onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0}
            className="text-sm text-gray-400 hover:text-white transition-colors disabled:opacity-0">
            Back
          </button>
          <button onClick={handleNext} disabled={!canProceed || saveAnswers.isPending}
            className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-xl transition-colors disabled:opacity-50">
            {saveAnswers.isPending ? <><Loader2 className="w-4 h-4 animate-spin" />Saving...</> : isLast ? "Finish" : <>Next<ChevronRight className="w-4 h-4" /></>}
          </button>
        </div>
      </div>
    </div>
  );
}
