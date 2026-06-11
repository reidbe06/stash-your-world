import { useState } from "react";
import { X, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

// Preset emojis users can pick with one tap
const PRESET_EMOJIS = [
  "📁","🎄","🏰","🌟","🎬","🎮","🎵","📚",
  "🌿","🎨","💝","🦋","🌈","🍕","🏃","🎪",
  "🎭","🐾","🌺","🏖️","🎃","💡","🎯","🌙",
];

// Auto-assigned gradient palette — cycles by the user's existing category count
export const CUSTOM_CATEGORY_GRADIENTS = [
  { bgFrom: "#E8F4FD", bgTo: "#F0F8FF" },
  { bgFrom: "#FDF6E8", bgTo: "#FFFBF0" },
  { bgFrom: "#EDF8ED", bgTo: "#F4FFF0" },
  { bgFrom: "#FDE8F4", bgTo: "#FFF0FB" },
  { bgFrom: "#EDE8FD", bgTo: "#F4F0FF" },
  { bgFrom: "#FDE8E8", bgTo: "#FFF0F0" },
  { bgFrom: "#E8FDFD", bgTo: "#F0FFFF" },
  { bgFrom: "#FDEEE8", bgTo: "#FFF5F0" },
];

export type UserCategory = {
  id: string;
  user_id: string;
  name: string;
  emoji: string;
  bg_from: string;
  bg_to: string;
  created_at: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  existingCount: number;
};

export function CreateCategoryModal({ open, onClose, existingCount }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();

  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("📁");
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  const gradient = CUSTOM_CATEGORY_GRADIENTS[existingCount % CUSTOM_CATEGORY_GRADIENTS.length];

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) { toast.error("Please enter a category name."); return; }
    if (!user) return;

    setSaving(true);
    try {
      const { error } = await supabase.from("user_categories").insert({
        user_id: user.id,
        name: trimmed.slice(0, 40),
        emoji,
        bg_from: gradient.bgFrom,
        bg_to: gradient.bgTo,
      });
      if (error) throw error;

      toast.success(`"${trimmed}" category created!`);
      qc.invalidateQueries({ queryKey: ["user-categories"] });
      handleClose();
    } catch (err: any) {
      toast.error(err.message || "Failed to create category.");
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    setName("");
    setEmoji("📁");
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ background: "rgba(0,0,0,0.4)" }}
      onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
    >
      <div className="w-full max-w-lg rounded-t-[28px] bg-white pb-10 pt-5 px-5 shadow-2xl">
        {/* Drag handle */}
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-[#e8e0f0]" />

        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-[17px] font-bold text-[#1a1a1a]">New Category</h2>
          <button
            type="button"
            onClick={handleClose}
            className="flex h-7 w-7 items-center justify-center rounded-full bg-[#f2ede9] text-[#8c8096]"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Preview */}
        <div
          className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl text-3xl shadow-sm"
          style={{ background: `linear-gradient(160deg, ${gradient.bgFrom}, ${gradient.bgTo})`, border: "1px solid rgba(0,0,0,0.06)" }}
        >
          {emoji}
        </div>

        {/* Category name */}
        <label className="mb-1 block text-xs font-semibold uppercase tracking-widest text-[#b0a5b8]">
          Category Name
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSave()}
          placeholder="e.g. Disney, Christmas, Garden…"
          maxLength={40}
          autoFocus
          className="mb-5 w-full rounded-xl border border-[#ede8f4] bg-[#faf8fd] px-4 py-3 text-sm text-[#1a1a1a] placeholder:text-[#c8bfd2] outline-none focus:border-[#FD5897]/40 focus:ring-2 focus:ring-[#FD5897]/10"
        />

        {/* Emoji picker */}
        <label className="mb-2 block text-xs font-semibold uppercase tracking-widest text-[#b0a5b8]">
          Icon
        </label>
        <div className="mb-5 flex flex-wrap gap-2">
          {PRESET_EMOJIS.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => setEmoji(e)}
              className={`flex h-9 w-9 items-center justify-center rounded-xl text-xl transition ${
                emoji === e
                  ? "bg-[#FD5897]/10 ring-2 ring-[#FD5897]/40 scale-110"
                  : "bg-[#f5f0fa] hover:bg-[#ede8f4]"
              }`}
            >
              {e}
            </button>
          ))}
          {/* Freeform emoji input */}
          <input
            type="text"
            value={emoji}
            onChange={(e) => {
              const val = [...(e.target.value ?? "")].filter((_, i, a) => i === a.length - 1 || i === 0);
              const last = [...(e.target.value ?? "")].pop();
              if (last) setEmoji(last);
            }}
            placeholder="✏️"
            className="h-9 w-9 rounded-xl border border-[#ede8f4] bg-[#faf8fd] text-center text-xl outline-none focus:border-[#FD5897]/40"
          />
        </div>

        {/* Save button */}
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !name.trim()}
          className="w-full rounded-2xl py-3.5 text-[15px] font-bold text-white transition disabled:opacity-50"
          style={{ background: "linear-gradient(135deg, #FD5897 0%, #fd7eb3 100%)" }}
        >
          {saving ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Creating…
            </span>
          ) : (
            "Create Category"
          )}
        </button>
      </div>
    </div>
  );
}
