import logo from "@/assets/stashd-mark.png";
import { cn } from "@/lib/utils";

export function Logo({ className, showName = true, size = "md" }: { className?: string; showName?: boolean; size?: "sm" | "md" | "lg" }) {
  const dims = { sm: "h-7 w-7", md: "h-9 w-9", lg: "h-14 w-14" }[size];
  const text = { sm: "text-lg", md: "text-xl", lg: "text-3xl" }[size];
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <img src={logo} alt="STASHd" className={cn(dims, "object-contain")} />
      {showName && <span className={cn("font-extrabold tracking-tight", text)}>STASHd</span>}
    </div>
  );
}
