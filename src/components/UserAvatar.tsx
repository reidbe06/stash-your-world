import { cn } from "@/lib/utils";

interface Props {
  url?: string | null;
  email?: string | null;
  name?: string | null;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  className?: string;
}

const sizeMap = {
  xs: "h-7 w-7 text-xs",
  sm: "h-9 w-9 text-sm",
  md: "h-10 w-10 text-base",
  lg: "h-14 w-14 text-lg",
  xl: "h-20 w-20 text-3xl",
};

export function UserAvatar({ url, email, name, size = "md", className }: Props) {
  const initial = (name || email || "?").trim()[0]?.toUpperCase() ?? "?";
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-gradient font-bold text-primary-foreground shadow-brand",
        sizeMap[size],
        className,
      )}
    >
      {url ? (
        <img src={url} alt={name ?? email ?? "Avatar"} className="h-full w-full object-cover" loading="lazy" />
      ) : (
        initial
      )}
    </span>
  );
}
