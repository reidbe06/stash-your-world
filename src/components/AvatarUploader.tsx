import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Camera, Trash2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useProfile } from "@/hooks/useProfile";
import { UserAvatar } from "@/components/UserAvatar";

const MAX_DIM = 512;
const ALLOWED = ["image/jpeg", "image/png", "image/webp"];

async function resizeImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_DIM / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0, w, h);
  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Resize failed"))), "image/webp", 0.85),
  );
}

export function AvatarUploader() {
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const upload = useMutation({
    mutationFn: async (file: File) => {
      if (!user) throw new Error("Not signed in");
      if (!ALLOWED.includes(file.type)) throw new Error("Use JPG, PNG, or WEBP");
      if (file.size > 10 * 1024 * 1024) throw new Error("Image must be under 10MB");

      const blob = await resizeImage(file);
      const path = `${user.id}/avatar-${Date.now()}.webp`;
      const { error: upErr } = await supabase.storage
        .from("avatars")
        .upload(path, blob, { contentType: "image/webp", upsert: true });
      if (upErr) throw upErr;

      const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
      const url = `${pub.publicUrl}?v=${Date.now()}`;

      const { error: dbErr } = await supabase
        .from("profiles")
        .upsert({ user_id: user.id, avatar_url: url }, { onConflict: "user_id" });
      if (dbErr) throw dbErr;

      // best-effort: remove previous file
      if (profile?.avatar_url) {
        const prev = profile.avatar_url.split("/avatars/")[1]?.split("?")[0];
        if (prev && prev !== path) await supabase.storage.from("avatars").remove([prev]);
      }
      return url;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["profile"] }),
    onError: (e: Error) => setError(e.message),
  });

  const remove = useMutation({
    mutationFn: async () => {
      if (!user || !profile?.avatar_url) return;
      const key = profile.avatar_url.split("/avatars/")[1]?.split("?")[0];
      if (key) await supabase.storage.from("avatars").remove([key]);
      await supabase.from("profiles").upsert(
        { user_id: user.id, avatar_url: null },
        { onConflict: "user_id" },
      );
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["profile"] }),
    onError: (e: Error) => setError(e.message),
  });

  const busy = upload.isPending || remove.isPending;

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative">
        <UserAvatar url={profile?.avatar_url} email={user?.email} size="xl" />
        {busy && (
          <span className="absolute inset-0 flex items-center justify-center rounded-full bg-background/60">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </span>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          setError(null);
          const f = e.target.files?.[0];
          if (f) upload.mutate(f);
          e.target.value = "";
        }}
      />
      <div className="flex gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className="inline-flex items-center gap-2 rounded-full bg-brand-gradient px-4 py-2 text-xs font-semibold text-primary-foreground shadow-brand disabled:opacity-50"
        >
          <Camera className="h-3.5 w-3.5" /> {profile?.avatar_url ? "Replace photo" : "Upload photo"}
        </button>
        {profile?.avatar_url && (
          <button
            type="button"
            disabled={busy}
            onClick={() => remove.mutate()}
            className="inline-flex items-center gap-2 rounded-full border bg-card px-4 py-2 text-xs font-semibold hover:bg-accent disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5" /> Remove
          </button>
        )}
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
