import { useState } from "react";
import { Bookmark } from "lucide-react";

interface ItemImageProps {
  src: string | null | undefined;
  alt: string;
  url?: string | null;
  source?: string | null;
  className?: string;
  imgClassName?: string;
}

function detectPlatform(url?: string | null, source?: string | null): string | null {
  const s = ((url ?? "") + " " + (source ?? "")).toLowerCase();
  if (s.includes("tiktok")) return "tiktok";
  if (s.includes("instagram")) return "instagram";
  if (s.includes("youtube") || s.includes("youtu.be")) return "youtube";
  if (s.includes("pinterest")) return "pinterest";
  if (s.includes("vimeo")) return "vimeo";
  return null;
}

const PLATFORM_STYLE: Record<string, { bg: string; label: string; icon: string }> = {
  tiktok:    { bg: "bg-[#010101]",  label: "TikTok",    icon: "𝕋" },
  instagram: { bg: "bg-gradient-to-br from-[#f09433] via-[#dc2743] to-[#bc1888]", label: "Instagram", icon: "📷" },
  youtube:   { bg: "bg-[#FF0000]",  label: "YouTube",   icon: "▶" },
  pinterest: { bg: "bg-[#E60023]",  label: "Pinterest", icon: "P" },
  vimeo:     { bg: "bg-[#1AB7EA]",  label: "Vimeo",     icon: "V" },
};

function PlatformFallback({ platform, className }: { platform: string | null; className?: string }) {
  const cfg = platform ? PLATFORM_STYLE[platform] : null;
  if (cfg) {
    return (
      <div className={`flex h-full w-full flex-col items-center justify-center gap-1 ${cfg.bg} ${className ?? ""}`}>
        <span className="text-2xl leading-none text-white/90">{cfg.icon}</span>
        <span className="text-xs font-semibold tracking-wide text-white/70">{cfg.label}</span>
      </div>
    );
  }
  return (
    <div className={`flex h-full w-full items-center justify-center bg-brand-gradient/10 ${className ?? ""}`}>
      <Bookmark className="h-10 w-10 text-primary/40" />
    </div>
  );
}

export function ItemImage({ src, alt, url, source, className, imgClassName }: ItemImageProps) {
  const [failed, setFailed] = useState(false);
  const platform = detectPlatform(url, source);

  if (!src || failed) {
    return (
      <div className={`h-full w-full ${className ?? ""}`}>
        <PlatformFallback platform={platform} />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className={imgClassName ?? "h-full w-full object-cover"}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}
