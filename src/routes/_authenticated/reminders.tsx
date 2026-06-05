import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, BellOff, Calendar, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { ItemImage } from "@/components/ItemImage";
import { ReminderPicker } from "@/components/ReminderPicker";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/reminders")({
  component: RemindersPage,
});

function groupByDate(items: ReminderItem[]): { label: string; items: ReminderItem[] }[] {
  const now = new Date();
  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(now); todayEnd.setHours(23, 59, 59, 999);
  const tomorrowEnd = new Date(todayEnd); tomorrowEnd.setDate(tomorrowEnd.getDate() + 1);
  const weekEnd = new Date(todayEnd); weekEnd.setDate(weekEnd.getDate() + 7);

  const overdue: ReminderItem[] = [];
  const today: ReminderItem[] = [];
  const tomorrow: ReminderItem[] = [];
  const thisWeek: ReminderItem[] = [];
  const later: ReminderItem[] = [];

  for (const item of items) {
    const d = new Date(item.reminder_at!);
    if (d < todayStart)        overdue.push(item);
    else if (d <= todayEnd)    today.push(item);
    else if (d <= tomorrowEnd) tomorrow.push(item);
    else if (d <= weekEnd)     thisWeek.push(item);
    else                       later.push(item);
  }

  const groups = [
    { label: "Overdue", items: overdue },
    { label: "Today", items: today },
    { label: "Tomorrow", items: tomorrow },
    { label: "This Week", items: thisWeek },
    { label: "Later", items: later },
  ];

  return groups.filter((g) => g.items.length > 0);
}

interface ReminderItem {
  id: string;
  title: string;
  url: string | null;
  image_url: string | null;
  type: string;
  source: string | null;
  reminder_at: string | null;
}

function ReminderCard({ item }: { item: ReminderItem }) {
  const qc = useQueryClient();
  const isOverdue = new Date(item.reminder_at!) < new Date();

  let host: string | null = item.source;
  if (!host && item.url) {
    try { host = new URL(item.url).hostname.replace("www.", ""); } catch {}
  }

  const clearReminder = async () => {
    const { error } = await supabase
      .from("items")
      .update({ reminder_at: null } as never)
      .eq("id", item.id);
    if (error) { toast.error("Couldn't clear reminder"); return; }
    toast.success("Reminder cleared");
    qc.invalidateQueries({ queryKey: ["reminders"] });
    qc.invalidateQueries({ queryKey: ["items"] });
  };

  return (
    <div className={cn(
      "flex items-start gap-3 rounded-xl border bg-card p-3 shadow-sm transition hover:shadow-md",
      isOverdue && "border-destructive/30 bg-destructive/5"
    )}>
      <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-muted">
        <ItemImage src={item.image_url} alt={item.title} url={item.url} source={item.source} />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="line-clamp-2 text-sm font-semibold leading-snug">{item.title}</p>
            {host && (
              <p className="mt-0.5 truncate text-xs text-muted-foreground">{host}</p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <ReminderPicker itemId={item.id} reminderAt={item.reminder_at} />
            <button
              type="button"
              onClick={clearReminder}
              className="rounded-full p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              aria-label="Clear reminder"
            >
              <BellOff className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <div className="mt-1.5 flex items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent-foreground">
            {item.type}
          </span>
          {item.reminder_at && (
            <span className={cn(
              "inline-flex items-center gap-1 text-[11px] font-medium",
              isOverdue ? "text-destructive" : "text-muted-foreground"
            )}>
              <Calendar className="h-3 w-3" />
              {new Date(item.reminder_at).toLocaleDateString(undefined, {
                weekday: "short", month: "short", day: "numeric",
              })}
              {isOverdue && " · overdue"}
            </span>
          )}
          {item.url && (
            <a
              href={item.url}
              target="_blank"
              rel="noreferrer"
              className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
            >
              Open <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function RemindersPage() {
  const { user } = useAuth();

  const { data: items = [], isLoading } = useQuery<ReminderItem[]>({
    queryKey: ["reminders", user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("items")
        .select("id, title, url, image_url, type, source, reminder_at")
        .eq("user_id", user!.id)
        .not("reminder_at", "is", null)
        .order("reminder_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ReminderItem[];
    },
  });

  const groups = groupByDate(items);
  const hasAny = groups.length > 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Reminders</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Saves you've flagged to revisit — tap the bell on any card to set one.
        </p>
      </div>

      {isLoading && (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-pulse rounded-full bg-brand-gradient" />
        </div>
      )}

      {!isLoading && !hasAny && (
        <div className="flex flex-col items-center gap-4 py-16 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-accent">
            <Bell className="h-8 w-8 text-muted-foreground" />
          </div>
          <div>
            <p className="font-semibold">No reminders yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Open any saved item and tap the{" "}
              <Bell className="inline h-3.5 w-3.5 align-text-bottom" /> bell to schedule a reminder.
            </p>
          </div>
          <Link
            to="/search"
            className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground"
          >
            Browse your saves
          </Link>
        </div>
      )}

      {groups.map(({ label, items: groupItems }) => (
        <section key={label}>
          <h2 className={cn(
            "mb-3 text-sm font-bold uppercase tracking-wide",
            label === "Overdue" ? "text-destructive" : "text-muted-foreground"
          )}>
            {label}
            <span className="ml-2 font-normal normal-case">
              {groupItems.length} {groupItems.length === 1 ? "item" : "items"}
            </span>
          </h2>
          <div className="space-y-2">
            {groupItems.map((item) => (
              <ReminderCard key={item.id} item={item} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
