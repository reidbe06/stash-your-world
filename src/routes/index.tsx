import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Bookmark, Brain, Search, Tag, Users, Sparkles, ArrowRight } from "lucide-react";
import { Logo } from "@/components/Logo";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "STASHd — Save. Search. Share." },
      { name: "description", content: "AI-powered organizer for everything you save online — posts, links, recipes, products and inspiration." },
    ],
  }),
  component: Landing,
});

const features = [
  { icon: Bookmark, title: "Save from anywhere", desc: "Instagram, TikTok, YouTube, Pinterest & more." },
  { icon: Brain, title: "AI that understands", desc: "Auto-categorizes and extracts key info." },
  { icon: Search, title: "Find it in seconds", desc: "Search by keyword, image, or voice." },
  { icon: Tag, title: "Organize with tags", desc: "Smart collections that build themselves." },
  { icon: Users, title: "Share & collaborate", desc: "Build shared folders with friends." },
];

function Landing() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  useEffect(() => { if (!loading && user) navigate({ to: "/dashboard" }); }, [user, loading, navigate]);

  return (
    <div className="min-h-screen bg-soft-gradient">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <Logo />
        <Link to="/auth" className="rounded-full bg-brand-gradient px-5 py-2 text-sm font-semibold text-primary-foreground shadow-brand">
          Sign in
        </Link>
      </header>

      <section className="mx-auto max-w-6xl px-6 pt-10 pb-20 md:pt-20">
        <div className="grid items-center gap-12 md:grid-cols-2">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs font-medium text-muted-foreground shadow-card">
              <Sparkles className="h-3.5 w-3.5 text-primary" /> SAVE · SEARCH · SHARE
            </div>
            <h1 className="mt-5 text-5xl font-extrabold tracking-tight md:text-6xl">
              Save inspiration.<br />
              Find it fast. <span className="text-brand-gradient">Share it.</span>
            </h1>
            <p className="mt-5 max-w-md text-lg text-muted-foreground">
              The AI-powered organizer for everything you save — posts, links, recipes, products and ideas in one beautiful place.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/auth" className="inline-flex items-center gap-2 rounded-full bg-brand-gradient px-7 py-3.5 text-sm font-semibold text-primary-foreground shadow-brand">
                Get started free <ArrowRight className="h-4 w-4" />
              </Link>
              <a href="#features" className="inline-flex items-center rounded-full border bg-card px-7 py-3.5 text-sm font-semibold shadow-card">
                See how it works
              </a>
            </div>
          </div>

          <div className="relative">
            <div className="absolute -inset-8 bg-brand-gradient opacity-20 blur-3xl" />
            <div className="relative mx-auto w-full max-w-sm rounded-[2.5rem] border-8 border-foreground/90 bg-card p-4 shadow-brand">
              <div className="flex items-center justify-between pb-3">
                <Logo size="sm" />
                <div className="h-2 w-2 rounded-full bg-primary" />
              </div>
              <div className="space-y-2">
                {["All Saves", "Recipes", "Fashion", "Home & Decor", "Travel"].map((c, i) => (
                  <div key={c} className="flex items-center justify-between rounded-2xl bg-muted/60 px-4 py-3">
                    <span className="text-sm font-semibold">{c}</span>
                    <span className="text-xs text-muted-foreground">{[1248, 243, 132, 98, 87][i]}</span>
                  </div>
                ))}
              </div>
              <button className="mt-4 w-full rounded-full bg-brand-gradient py-3 text-sm font-semibold text-primary-foreground">
                + Save New
              </button>
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="border-t bg-card/50">
        <div className="mx-auto grid max-w-6xl gap-6 px-6 py-16 md:grid-cols-3 lg:grid-cols-5">
          {features.map((f) => (
            <div key={f.title} className="rounded-2xl border bg-card p-6 shadow-card transition hover:shadow-brand">
              <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-primary">
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="font-bold">{f.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t py-8 text-center text-sm text-muted-foreground">
        © {new Date().getFullYear()} STASHd. Save. Search. Share.
      </footer>
    </div>
  );
}
