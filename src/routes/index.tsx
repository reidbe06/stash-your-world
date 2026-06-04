import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Bookmark, Search, Share2, ArrowRight, Sparkles, Brain, Tag, Users, ShoppingBag, ShoppingCart, MapPin, Home } from "lucide-react";
import { Logo } from "@/components/Logo";
import { useAuth } from "@/lib/auth";
import { joinWaitlist } from "@/lib/waitlist.functions";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "STASHd — Coming Soon" },
      { name: "description", content: "STASHd organizes your saved recipes, products, places, workouts, and ideas — then helps you actually use them when the time is right." },
    ],
  }),
  component: Landing,
});

const pillars = [
  {
    icon: Bookmark,
    eyebrow: "SAVE",
    title: "Save from anywhere",
    desc: "Drop in a link from Instagram, TikTok, Pinterest or the open web. We pull the thumbnail, title and source in one tap.",
  },
  {
    icon: Search,
    eyebrow: "SEARCH",
    title: "Find it in seconds",
    desc: "Search by keyword, tag, collection or URL. Smart filters surface exactly what past-you stashed.",
  },
  {
    icon: Share2,
    eyebrow: "SHARE",
    title: "Share with your people",
    desc: "Turn any collection into a beautiful public link. Friends view it without an account.",
  },
] as const;

const extras = [
  { icon: Brain, title: "AI that understands", desc: "Auto-categorizes and extracts the key info." },
  { icon: Tag, title: "Organize with tags", desc: "Smart collections that build themselves." },
  { icon: Users, title: "Collaborate", desc: "Build shared folders with friends." },
];

const executeCards = [
  {
    icon: ShoppingBag,
    label: "RETAIL",
    title: "At Target",
    desc: "Saved products appear when you walk into the store.",
  },
  {
    icon: ShoppingCart,
    label: "FOOD",
    title: "Grocery Trips",
    desc: "See ingredients and saved recipes while shopping.",
  },
  {
    icon: MapPin,
    label: "TRAVEL",
    title: "Travel",
    desc: "Get reminders about saved restaurants, hotels, and places nearby.",
  },
  {
    icon: Home,
    label: "HOME",
    title: "Home Projects",
    desc: "Surface saved ideas when you're shopping for supplies.",
  },
] as const;

function WaitlistForm() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      await joinWaitlist({ data: { email } });
      setSubmitted(true);
    } catch {
      setFormError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="rounded-2xl border bg-card p-8 shadow-card text-center">
        <Sparkles className="mx-auto h-8 w-8 text-primary" />
        <p className="mt-4 font-semibold text-lg">You're on the list!</p>
        <p className="mt-1 text-sm text-muted-foreground">We'll let you know when STASHd launches.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 sm:flex-row">
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Email Address"
        required
        className="flex-1 rounded-full border bg-card px-5 py-3 text-sm shadow-card focus:outline-none focus:ring-2 focus:ring-primary/40"
      />
      <button
        type="submit"
        disabled={submitting}
        className="rounded-full bg-brand-gradient px-7 py-3 text-sm font-semibold text-primary-foreground shadow-brand transition hover:translate-y-[-1px] disabled:opacity-60"
      >
        {submitting ? "Joining…" : "Join Waitlist"}
      </button>
      {formError && <p className="w-full text-center text-xs text-destructive">{formError}</p>}
    </form>
  );
}

function Landing() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  useEffect(() => { if (!loading && user) navigate({ to: "/dashboard" }); }, [user, loading, navigate]);

  return (
    <div className="min-h-screen bg-soft-gradient">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <Logo />
      </header>

      {/* HERO */}
      <section className="relative mx-auto max-w-6xl px-6 pt-8 pb-20 md:pt-16">
        <div className="grid items-center gap-14 md:grid-cols-2">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold tracking-widest text-primary">
              <Sparkles className="h-3.5 w-3.5" /> COMING SOON
            </div>
            <h1 className="mt-6 text-5xl font-extrabold leading-[1.05] tracking-tight md:text-7xl">
              <span className="text-brand-gradient">STOP LOSING</span><br />
              <span className="text-brand-gradient">THE THINGS</span><br />
              <span className="text-brand-gradient">YOU SAVE.</span>
            </h1>
            <p className="mt-6 max-w-md text-lg text-muted-foreground">
              STASHd organizes your saved recipes, products, places, workouts, and ideas — then helps you actually use them when the time is right.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href="#waitlist" className="inline-flex items-center gap-2 rounded-full bg-brand-gradient px-7 py-3.5 text-sm font-semibold text-primary-foreground shadow-brand transition hover:translate-y-[-1px]">
                Join the Waitlist <ArrowRight className="h-4 w-4" />
              </a>
              <a href="#how" className="inline-flex items-center rounded-full border bg-card px-7 py-3.5 text-sm font-semibold shadow-card hover:bg-accent">
                See how it works
              </a>
            </div>
          </div>

          {/* Phone mock */}
          <div className="relative">
            <div className="absolute -inset-10 bg-brand-gradient opacity-25 blur-3xl" />
            <div className="relative mx-auto w-full max-w-sm rounded-[2.5rem] border-[10px] border-foreground/90 bg-card p-4 shadow-brand">
              <div className="flex items-center justify-between pb-3">
                <Logo size="sm" />
                <div className="h-2 w-2 rounded-full bg-primary" />
              </div>
              <div className="space-y-2">
                {[
                  { label: "All Saves", n: 1248 },
                  { label: "Recipes", n: 243 },
                  { label: "Fashion", n: 132 },
                  { label: "Home & Decor", n: 98 },
                  { label: "Travel", n: 87 },
                ].map((c) => (
                  <div key={c.label} className="flex items-center justify-between rounded-2xl bg-muted/60 px-4 py-3">
                    <span className="text-sm font-semibold">{c.label}</span>
                    <span className="text-xs font-medium text-muted-foreground">{c.n}</span>
                  </div>
                ))}
              </div>
              <button className="mt-4 w-full rounded-full bg-brand-gradient py-3 text-sm font-semibold text-primary-foreground shadow-brand">
                + Save an Item
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* WAITLIST FORM */}
      <section id="waitlist" className="border-t bg-card/60">
        <div className="mx-auto max-w-xl px-6 py-16">
          <div className="mb-6 text-center">
            <p className="text-xs font-semibold tracking-widest text-primary">EARLY ACCESS</p>
            <h2 className="mt-2 text-3xl font-extrabold tracking-tight">Get notified at launch</h2>
            <p className="mt-2 text-sm text-muted-foreground">Drop your email and we'll reach out the moment STASHd is ready.</p>
          </div>
          <WaitlistForm />
        </div>
      </section>

      {/* THREE PILLARS */}
      <section id="how" className="border-t">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <div className="mb-12 max-w-2xl">
            <p className="text-xs font-semibold tracking-widest text-primary">HOW IT WORKS</p>
            <h2 className="mt-2 text-4xl font-extrabold tracking-tight md:text-5xl">Three moves. One beautiful library.</h2>
          </div>
          <div className="grid gap-5 md:grid-cols-3">
            {pillars.map((p) => (
              <div key={p.eyebrow} className="flex flex-col rounded-3xl border bg-card p-7 shadow-card">
                <div className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-gradient text-primary-foreground shadow-brand">
                  <p.icon className="h-6 w-6" />
                </div>
                <p className="text-xs font-bold tracking-widest text-primary">{p.eyebrow}</p>
                <h3 className="mt-1 text-xl font-bold">{p.title}</h3>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">{p.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* SAVE. ORGANIZE. EXECUTE. */}
      <section className="border-t bg-soft-gradient">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <div className="mb-14 text-center">
            <h2 className="text-4xl font-extrabold tracking-tight md:text-5xl">
              <span className="text-brand-gradient">SAVE. ORGANIZE. EXECUTE.</span>
            </h2>
            <p className="mx-auto mt-5 max-w-lg text-muted-foreground leading-relaxed">
              Most apps help you save content.<br />STASHd helps you actually use it.
            </p>
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            {executeCards.map((card) => (
              <div key={card.title} className="group relative overflow-hidden rounded-3xl border bg-card shadow-card">
                <div className="absolute inset-x-0 top-0 h-[3px] bg-brand-gradient" />
                <div className="p-8">
                  <div className="mb-5 flex items-center gap-3">
                    <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-gradient text-primary-foreground shadow-brand">
                      <card.icon className="h-5 w-5" />
                    </div>
                    <span className="text-[10px] font-bold tracking-widest text-primary">{card.label}</span>
                  </div>
                  <h3 className="text-xl font-bold">{card.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{card.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* EXTRAS */}
      <section className="border-t">
        <div className="mx-auto grid max-w-6xl gap-6 px-6 py-16 md:grid-cols-3">
          {extras.map((f) => (
            <div key={f.title} className="rounded-2xl border bg-card p-6 shadow-card">
              <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-primary">
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="font-bold">{f.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="border-t bg-card/60">
        <div className="mx-auto max-w-4xl px-6 py-20 text-center">
          <h2 className="text-4xl font-extrabold tracking-tight md:text-5xl">Your saves deserve better.</h2>
          <p className="mx-auto mt-4 max-w-xl text-muted-foreground">Join the waitlist for early access to STASHd.</p>
          <a href="#waitlist" className="mt-8 inline-flex items-center gap-2 rounded-full bg-brand-gradient px-8 py-4 text-base font-semibold text-primary-foreground shadow-brand transition hover:translate-y-[-1px]">
            Join the Waitlist <ArrowRight className="h-4 w-4" />
          </a>
        </div>
      </section>

      <footer className="border-t py-8 text-center text-xs tracking-widest text-muted-foreground">
        © {new Date().getFullYear()} STASHd · COMING SOON
      </footer>
    </div>
  );
}
