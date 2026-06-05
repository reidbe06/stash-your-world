import { useState, useRef, useEffect } from "react";
import { Bell, BellOff, Calendar, ChevronRight, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

function getDateOptions(): { label: string; sublabel: string; getValue: () => Date }[] {
  const now = new Date();

  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(9, 0, 0, 0);

  const thisWeekend = new Date(now);
  const dayOfWeek = now.getDay();
  const daysUntilSat = dayOfWeek === 6 ? 7 : 6 - dayOfWeek;
  thisWeekend.setDate(thisWeekend.getDate() + daysUntilSat);
  thisWeekend.setHours(9, 0, 0, 0);

  const nextWeek = new Date(now);
  nextWeek.setDate(nextWeek.getDate() + 7);
  nextWeek.setHours(9, 0, 0, 0);

  const nextMonth = new Date(now);
  nextMonth.setMonth(nextMonth.getMonth() + 1);
  nextMonth.setHours(9, 0, 0, 0);

  const fmt = (d: Date) =>
    d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });

  return [
    { label: "Tomorrow", sublabel: fmt(tomorrow), getValue: () => tomorrow },
    { label: "This Weekend", sublabel: fmt(thisWeekend), getValue: () => thisWeekend },
    { label: "Next Week", sublabel: fmt(nextWeek), getValue: () => nextWeek },
    { label: "Next Month", sublabel: fmt(nextMonth), getValue: () => nextMonth },
  ];
}

export function ReminderPicker({
  itemId,
  reminderAt,
}: {
  itemId: string;
  reminderAt?: string | null;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [customMode, setCustomMode] = useState(false);
  const [customDate, setCustomDate] = useState("");
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const hasReminder = Boolean(reminderAt);
  const isOverdue = hasReminder && new Date(reminderAt!) < new Date();

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setCustomMode(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const saveReminder = async (date: Date) => {
    setSaving(true);
    const { error } = await supabase
      .from("items")
      .update({ reminder_at: date.toISOString() } as never)
      .eq("id", itemId);
    setSaving(false);
    if (error) {
      toast.error("Couldn't set reminder");
      return;
    }
    const label = date.toLocaleDateString(undefined, {
      weekday: "short", month: "short", day: "numeric",
    });
    toast.success(`Reminder set for ${label}`);
    qc.invalidateQueries({ queryKey: ["items"] });
    qc.invalidateQueries({ queryKey: ["reminders"] });
    setOpen(false);
    setCustomMode(false);
  };

  const clearReminder = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("items")
      .update({ reminder_at: null } as never)
      .eq("id", itemId);
    setSaving(false);
    if (error) {
      toast.error("Couldn't clear reminder");
      return;
    }
    toast.success("Reminder cleared");
    qc.invalidateQueries({ queryKey: ["items"] });
    qc.invalidateQueries({ queryKey: ["reminders"] });
    setOpen(false);
  };

  const handleCustomSubmit = () => {
    if (!customDate) return;
    const d = new Date(customDate);
    d.setHours(9, 0, 0, 0);
    if (isNaN(d.getTime())) {
      toast.error("Invalid date");
      return;
    }
    saveReminder(d);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        disabled={saving}
        className={cn(
          "rounded-full bg-card/95 p-2 shadow-sm backdrop-blur transition",
          hasReminder
            ? isOverdue
              ? "text-destructive hover:bg-destructive/10"
              : "text-primary hover:bg-primary/10"
            : "text-muted-foreground hover:bg-accent hover:text-foreground"
        )}
        aria-label="Set reminder"
      >
        <Bell className="h-3.5 w-3.5" />
      </button>

      {open && (
        <div
          className="absolute right-0 top-10 z-50 w-56 rounded-xl border bg-card shadow-lg"
          onClick={(e) => e.stopPropagation()}
        >
          {hasReminder && !customMode && (
            <div className="border-b px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Current reminder
              </p>
              <p className={cn("text-xs font-medium", isOverdue ? "text-destructive" : "text-primary")}>
                {new Date(reminderAt!).toLocaleDateString(undefined, {
                  weekday: "short", month: "short", day: "numeric",
                })}
                {isOverdue && " (overdue)"}
              </p>
            </div>
          )}

          {!customMode ? (
            <>
              <div className="py-1">
                <p className="px-3 pt-1.5 pb-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {hasReminder ? "Change reminder" : "Remind me later"}
                </p>
                {getDateOptions().map(({ label, sublabel, getValue }) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => saveReminder(getValue())}
                    disabled={saving}
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-accent disabled:opacity-50"
                  >
                    <span className="font-medium">{label}</span>
                    <span className="text-[11px] text-muted-foreground">{sublabel}</span>
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setCustomMode(true)}
                  className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-accent"
                >
                  <span className="font-medium">Custom Date</span>
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              </div>
              {hasReminder && (
                <div className="border-t py-1">
                  <button
                    type="button"
                    onClick={clearReminder}
                    disabled={saving}
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-destructive hover:bg-destructive/10 disabled:opacity-50"
                  >
                    <BellOff className="h-3.5 w-3.5" />
                    Clear reminder
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-semibold">Pick a date</p>
                <button
                  type="button"
                  onClick={() => setCustomMode(false)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <input
                type="date"
                value={customDate}
                min={new Date().toISOString().split("T")[0]}
                onChange={(e) => setCustomDate(e.target.value)}
                className="mb-2 w-full rounded-lg border bg-background px-3 py-1.5 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <button
                type="button"
                onClick={handleCustomSubmit}
                disabled={!customDate || saving}
                className="w-full rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground disabled:opacity-40"
              >
                Set Reminder
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
