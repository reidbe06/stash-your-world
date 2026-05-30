import logo from "@/assets/stashd-mark.png";
import { cn } from "@/lib/utils";

export function Logo({ className, showName = true, size = "md" }: { className?: string; showName?: boolean; size?: "sm" | "md" | "lg" }) {
  const dims = { sm: "h-10 w-10", md: "h-14 w-14", lg: "h-20 w-20" }[size];
  const text = { sm: "text-2xl", md: "text-3xl", lg: "text-5xl" }[size];
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <img src={logo} alt="STASHd" className={cn(dims, "object-contain")} />
      {showName && <span className={cn("font-extrabold tracking-tight", text)}>STASHd</span>}
    </div>
  );
}
