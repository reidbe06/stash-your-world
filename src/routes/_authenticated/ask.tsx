import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Sparkles, Send, Loader2, Bookmark, Library, ChevronDown, ChevronUp, Grid2X2 } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { askStashd, type AskMatchItem, type AskCollection } from "@/lib/ask-stashd.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/ask")({
  head: () => ({ meta: [{ title: "Ask My STASHd" }] }),
  component: AskPage,
});

type Turn = {
  role: "user" | "assistant";
  content: string;
  items?: AskMatchItem[];
  collections?: AskCollection[];
  allItems?: AskMatchItem[];
  totalCount?: number;
  isBrowse?: boolean;
};

const SUGGESTIONS = [
  "What recipes have I saved using chicken?",
  "Show me outfit ideas for summer.",
  "What home decor ideas have I saved?",
  "What products have I saved from Target?",
  "Find birthday gift ideas.",
];

function AskPage() {
  const ask = useServerFn(askStashd);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const send = async (q: string) => {
    const question = q.trim();
    if (!question || loading) return;
    const history = turns.slice(-8).map((t) => ({ role: t.role, content: t.content }));
    setTurns((prev) => [...prev, { role: "user", content: question }]);
    setInput("");
    setLoading(true);
    try {
      const res = await ask({ data: { question, history } });
      setTurns((prev) => [
        ...prev,
        {
          role: "assistant",
          content: res.answer,
          items: res.items,
          collections: res.collections,
          allItems: res.allItems,
          totalCount: res.totalCount,
          isBrowse: res.isBrowse,
        },
      ]);
      requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: 1e9, behavior: "smooth" }));
    } catch (err: any) {
      toast.error(err.message || "Something went wrong");
      setTurns((prev) => [
        ...prev,
        { role: "assistant", content: err.message || "Sorry, I couldn't answer that." },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-brand-gradient text-primary-foreground shadow-brand">
          <Sparkles className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Ask My STASHd</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Ask anything about what you've saved. Answers only come from your own stash — never the open web.
          </p>
        </div>
      </div>

      <div ref={scrollRef} className="space-y-4">
        {turns.length === 0 && (
          <div className="rounded-3xl border bg-card/60 p-5">
            <p className="mb-3 text-sm font-semibold text-foreground">Try asking</p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="rounded-full border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:bg-accent hover:text-foreground"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {turns.map((t, i) => (
          <Turn key={i} turn={t} />
        ))}

        {loading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Searching your stash…
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="sticky bottom-20 z-10 flex items-center gap-2 rounded-full border bg-card/95 p-1.5 shadow-card backdrop-blur md:bottom-4"
      >
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about your saved items…"
          className="h-11 flex-1 border-0 bg-transparent pl-4 text-sm shadow-none focus-visible:ring-0"
          disabled={loading}
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-full bg-brand-gradient text-primary-foreground shadow-brand transition",
            (loading || !input.trim()) && "opacity-50",
          )}
          aria-label="Send"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>
      </form>
    </div>
  );
}

function ItemCard({ it }: { it: AskMatchItem }) {
  const navigate = useNavigate();
  return (
    <div
      className="group block cursor-pointer"
      onClick={() => navigate({ to: "/item/$id", params: { id: it.id } })}
    >
      <div className="relative aspect-square overflow-hidden rounded-2xl bg-muted shadow-card">
        {it.image_url ? (
          <img
            src={it.image_url}
            alt={it.title}
            className="h-full w-full object-cover transition group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-brand-gradient/10">
            <Bookmark className="h-8 w-8 text-primary/40" />
          </div>
        )}
        <span className="absolute left-2 top-2 rounded-full bg-card/95 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary backdrop-blur">
          {it.type}
        </span>
      </div>
      <h3 className="mt-2 line-clamp-2 text-sm font-semibold leading-snug">{it.title}</h3>
      <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
        {it.source ?? it.category ?? "Saved"}
      </p>
    </div>
  );
}

function ShowAllSection({
  allItems,
  totalCount,
  highlightCount,
}: {
  allItems: AskMatchItem[];
  totalCount: number;
  highlightCount: number;
}) {
  const [expanded, setExpanded] = useState(false);

  if (allItems.length === 0) return null;

  const remaining = totalCount - highlightCount;

  return (
    <div className="ml-9 mt-1">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-1.5 rounded-full border bg-card px-3 py-1.5 text-xs font-semibold text-muted-foreground transition hover:bg-accent hover:text-foreground"
      >
        <Grid2X2 className="h-3.5 w-3.5" />
        {expanded ? "Hide" : `Show all ${remaining} result${remaining !== 1 ? "s" : ""}`}
        {expanded ? (
          <ChevronUp className="h-3 w-3" />
        ) : (
          <ChevronDown className="h-3 w-3" />
        )}
      </button>

      {expanded && (
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {allItems.map((it) => (
            <ItemCard key={it.id} it={it} />
          ))}
        </div>
      )}
    </div>
  );
}

function Turn({ turn }: { turn: Turn }) {
  if (turn.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-brand-gradient px-4 py-2.5 text-sm text-primary-foreground shadow-brand">
          {turn.content}
        </div>
      </div>
    );
  }

  const highlightCount = turn.items?.length ?? 0;
  const hasMore = (turn.allItems?.length ?? 0) > 0;

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2">
        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-primary">
          <Sparkles className="h-3.5 w-3.5" />
        </div>
        <div className="max-w-[85%] space-y-1">
          <div className="rounded-2xl rounded-tl-sm border bg-card px-4 py-2.5 text-sm leading-relaxed text-foreground shadow-card">
            {turn.content}
          </div>
          {turn.isBrowse && turn.totalCount != null && turn.totalCount > 0 && (
            <p className="px-1 text-xs text-muted-foreground">
              {turn.totalCount} item{turn.totalCount !== 1 ? "s" : ""} found in your STASHd
            </p>
          )}
        </div>
      </div>

      {turn.collections && turn.collections.length > 0 && (
        <div className="ml-9 flex flex-wrap gap-2">
          {turn.collections.map((c) => (
            <Link
              key={c.id}
              to="/collections/$id"
              params={{ id: c.id }}
              className="inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1 text-xs font-semibold text-foreground hover:bg-accent"
            >
              <Library className="h-3 w-3" />
              {c.name}
            </Link>
          ))}
        </div>
      )}

      {turn.items && turn.items.length > 0 && (
        <div className="ml-9">
          {turn.isBrowse && turn.items.length > 0 && (
            <p className="mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Highlights
            </p>
          )}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {turn.items.map((it) => (
              <ItemCard key={it.id} it={it} />
            ))}
          </div>
        </div>
      )}

      {hasMore && (
        <ShowAllSection
          allItems={turn.allItems!}
          totalCount={turn.totalCount!}
          highlightCount={highlightCount}
        />
      )}
    </div>
  );
}
