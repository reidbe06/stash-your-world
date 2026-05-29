import logo from "@/assets/stashd-mark.png";
import { cn } from "@/lib/utils";

export function Logo({ className, showName = true, size = "md" }: { className?: string; showName?: boolean; size?: "sm" | "md" | "lg" }) {
  const dims = { sm: "h-9 w-9", md: "h-11 w-11", lg: "h-16 w-16" }[size];
  const text = { sm: "text-xl", md: "text-2xl", lg: "text-4xl" }[size];
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <img src={logo} alt="STASHd" className={cn(dims, "object-contain")} />
      {showName && <span className={cn("font-extrabold tracking-tight", text)}>STASHd</span>}
    </div>
  );
}
