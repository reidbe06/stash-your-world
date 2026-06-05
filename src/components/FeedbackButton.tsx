import { useState } from "react";
import { MessageSquarePlus, X, Smile, Meh, AlertCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { submitFeedback } from "@/lib/feedback.functions";
import { useAuth } from "@/lib/auth";

type Rating = "great" | "okay" | "issue";

const RATINGS: { value: Rating; label: string; icon: React.ReactNode; active: string }[] = [
  { value: "great", label: "Loving it", icon: <Smile className="h-4 w-4" />, active: "border-emerald-400 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400" },
  { value: "okay",  label: "It's okay",  icon: <Meh className="h-4 w-4" />,   active: "border-amber-400 bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400" },
  { value: "issue", label: "Found a bug", icon: <AlertCircle className="h-4 w-4" />, active: "border-red-400 bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400" },
];

export function FeedbackButton() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState<Rating | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setRating(null);
    setMessage("");
    setBusy(false);
  };

  const close = () => {
    setOpen(false);
    reset();
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;
    setBusy(true);
    try {
      await submitFeedback({
        data: {
          message: message.trim(),
          rating: rating ?? undefined,
          page: typeof window !== "undefined" ? window.location.pathname : undefined,
          email: user?.email || "",
          user_id: user?.id || "",
        },
      });
      toast.success("Thanks for the feedback!");
      close();
    } catch {
      toast.error("Couldn't send feedback — please try again.");
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold text-muted-foreground transition hover:border-primary/30 hover:text-primary"
        aria-label="Send feedback"
      >
        <MessageSquarePlus className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Feedback</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" aria-modal="true">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={close} />
          <div className="relative z-10 w-full max-w-sm rounded-t-2xl sm:rounded-2xl border bg-card p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold">Share feedback</h2>
                <p className="text-xs text-muted-foreground">Private beta — your input shapes the product</p>
              </div>
              <button type="button" onClick={close} className="rounded-full p-1.5 text-muted-foreground hover:bg-accent">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mb-4 grid grid-cols-3 gap-2">
              {RATINGS.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => setRating(r.value === rating ? null : r.value)}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-xl border px-2 py-2.5 text-[11px] font-semibold transition",
                    rating === r.value
                      ? r.active
                      : "border-border bg-background text-muted-foreground hover:border-primary/30 hover:text-foreground"
                  )}
                >
                  {r.icon}
                  {r.label}
                </button>
              ))}
            </div>

            <form onSubmit={submit}>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="What's on your mind? A bug, a feature idea, general thoughts…"
                rows={4}
                required
                disabled={busy}
                className="w-full resize-none rounded-xl border bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={!message.trim() || busy}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-full bg-brand-gradient py-2.5 text-sm font-semibold text-primary-foreground shadow-brand disabled:opacity-50"
              >
                {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending…</> : "Send feedback"}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
