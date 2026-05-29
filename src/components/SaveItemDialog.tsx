import { useEffect, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

const schema = z.object({
  title: z.string().trim().min(1, "Title required").max(200),
  url: z.string().trim().max(2000).optional().or(z.literal("")),
  description: z.string().max(1000).optional(),
  type: z.string().max(40),
  tags: z.string().max(300).optional(),
  collection_id: z.string().optional(),
});

interface Props { open: boolean; onOpenChange: (v: boolean) => void; defaultCollection?: string }

export function SaveItemDialog({ open, onOpenChange, defaultCollection }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [form, setForm] = useState({ title: "", url: "", description: "", type: "link", tags: "", collection_id: defaultCollection ?? "" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setForm((f) => ({ ...f, collection_id: defaultCollection ?? f.collection_id }));
  }, [open, defaultCollection]);

  const { data: collections } = useQuery({
    queryKey: ["collections", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("collections").select("id,name").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = schema.safeParse(form);
    if (!parsed.success) { toast.error(parsed.error.issues[0].message); return; }
    if (!user) return;
    setBusy(true);
    try {
      const tags = form.tags.split(",").map((t) => t.trim()).filter(Boolean).slice(0, 20);
      let source: string | null = null;
      try { if (form.url) source = new URL(form.url).hostname.replace("www.", ""); } catch {}
      const { error } = await supabase.from("items").insert({
        user_id: user.id,
        title: form.title.trim(),
        url: form.url || null,
        description: form.description || null,
        type: form.type,
        tags,
        source,
        collection_id: form.collection_id || null,
      });
      if (error) throw error;
      toast.success("Saved!");
      qc.invalidateQueries({ queryKey: ["items"] });
      qc.invalidateQueries({ queryKey: ["collection-items"] });
      setForm({ title: "", url: "", description: "", type: "link", tags: "", collection_id: defaultCollection ?? "" });
      onOpenChange(false);
    } catch (err: any) { toast.error(err.message); } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Save something new</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label htmlFor="title">Title *</Label>
            <Input id="title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Creamy Garlic Chicken Pasta" required maxLength={200} className="mt-1.5" />
          </div>
          <div>
            <Label htmlFor="url">URL</Label>
            <Input id="url" type="url" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://…" maxLength={2000} className="mt-1.5" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Type</Label>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["link", "recipe", "video", "product", "fashion", "idea", "article"].map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Collection</Label>
              <Select value={form.collection_id || "none"} onValueChange={(v) => setForm({ ...form, collection_id: v === "none" ? "" : v })}>
                <SelectTrigger className="mt-1.5"><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No collection</SelectItem>
                  {collections?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label htmlFor="tags">Tags (comma separated)</Label>
            <Input id="tags" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="dinner, chicken, easy" maxLength={300} className="mt-1.5" />
          </div>
          <div>
            <Label htmlFor="desc">Notes</Label>
            <Textarea id="desc" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} maxLength={1000} className="mt-1.5" />
          </div>
          <button type="submit" disabled={busy} className="w-full rounded-full bg-brand-gradient py-3 text-sm font-semibold text-primary-foreground shadow-brand disabled:opacity-60">
            {busy ? "Saving…" : "Save to STASHd"}
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
