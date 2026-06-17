import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect } from "react";
import { Logo } from "./Logo";

// ── brand colour ──────────────────────────────────────────────────────────────
const PINK = "#FD5897";

// ── source platforms ──────────────────────────────────────────────────────────
const SOURCES = [
  { id: "ig",  label: "Instagram", gradient: "linear-gradient(135deg,#833ab4,#fd1d1d,#fcb045)", abbr: "IG"  },
  { id: "tt",  label: "TikTok",    gradient: "linear-gradient(135deg,#010101,#69C9D0)",          abbr: "TT"  },
  { id: "pin", label: "Pinterest", gradient: "linear-gradient(135deg,#E60023,#ff6b6b)",          abbr: "Pin" },
  { id: "yt",  label: "YouTube",   gradient: "linear-gradient(135deg,#FF0000,#ff6b35)",          abbr: "YT"  },
  { id: "web", label: "Web",       gradient: "linear-gradient(135deg,#3b82f6,#8b5cf6)",          abbr: "🌐"  },
] as const;

// ── cards that fly from each icon into the phone ──────────────────────────────
const SAVE_CARDS = [
  { si: 0, label: "Pink Linen Dress",  tag: "Fashion",  color: PINK       },
  { si: 1, label: "Creamy Pasta",      tag: "Recipes",  color: "#f59e0b"  },
  { si: 2, label: "Santorini Hotel",   tag: "Travel",   color: "#06b6d4"  },
  { si: 3, label: "Morning Pilates",   tag: "Workouts", color: "#10b981"  },
  { si: 4, label: "Linen Tote Bag",    tag: "Products", color: "#a855f7"  },
] as const;

// ── phone interior categories ──────────────────────────────────────────────────
const CATS = [
  { label: "Fashion",  color: PINK,      count: 132 },
  { label: "Recipes",  color: "#f59e0b", count: 243 },
  { label: "Travel",   color: "#06b6d4", count: 87  },
  { label: "Workouts", color: "#10b981", count: 58  },
  { label: "Products", color: "#a855f7", count: 164 },
] as const;

// ── layout constants (container = 380 × 440 px) ───────────────────────────────
const W             = 380;   // container width
const H             = 440;   // container height

// source icons  ─  44×44, left column
const ICON_SIZE     = 44;
const ICON_L        = 10;
const ICON_TOPS     = [14, 84, 154, 224, 294] as const;
const ICON_CX       = ICON_L + ICON_SIZE / 2;                          // 32
const ICON_CYS      = ICON_TOPS.map((t) => t + ICON_SIZE / 2);        // [36,106,176,246,316]

// phone
const PHONE_L       = 160;
const PHONE_T       = 20;
const PHONE_W       = 206;
const PHONE_H       = 390;
const PHONE_CX      = PHONE_L + PHONE_W / 2;                          // 263
const PHONE_CY      = PHONE_T + PHONE_H / 2;                          // 215

// flying card dimensions
const CARD_W        = 110;
const CARD_H        = 36;

// flying card starts at right-edge of the icon; ends near phone centre
const FLY_START_X   = (i: number) => ICON_CX + ICON_SIZE / 2;        // 54
const FLY_START_Y   = (i: number) => ICON_CYS[i] - CARD_H / 2;
const FLY_DX        = PHONE_CX - CARD_W / 2 - FLY_START_X(0);        // 263-55-54 = 154
const FLY_DY        = (i: number) => PHONE_CY - ICON_CYS[i];

// spring preset
const spring = { type: "spring" as const, stiffness: 200, damping: 24 };

// ── helper: SVG path string between two points ────────────────────────────────
function linePath(x1: number, y1: number, x2: number, y2: number) {
  // slight quadratic curve toward the phone edge
  const mx = (x1 + x2) / 2;
  return `M ${x1} ${y1} Q ${mx} ${y1} ${x2} ${y2}`;
}

// ── main component ────────────────────────────────────────────────────────────
export function HeroAnimation() {
  const [cycle, setCycle]               = useState(0);
  const [flyIdx, setFlyIdx]             = useState(-1);
  const [catCount, setCatCount]         = useState(0);
  const [showOutcome, setShowOutcome]   = useState(false);

  useEffect(() => {
    // reset for this cycle
    setFlyIdx(-1);
    setCatCount(0);
    setShowOutcome(false);

    const timers: ReturnType<typeof setTimeout>[] = [];
    const at = (ms: number, fn: () => void) =>
      timers.push(setTimeout(fn, ms));

    // 5 cards fly in, 550 ms apart, starting at 1 200 ms
    SAVE_CARDS.forEach((_, i) => at(1200 + i * 550, () => setFlyIdx(i)));

    // categories appear inside phone
    CATS.forEach((_, i) => at(4200 + i * 320, () => setCatCount(i + 1)));

    // outcome card reveal
    at(6400, () => setShowOutcome(true));

    // next loop
    at(9400, () => setCycle((c) => c + 1));

    return () => timers.forEach(clearTimeout);
  }, [cycle]);

  return (
    // Responsive wrapper: scales the fixed canvas to fit its parent
    <div className="relative mx-auto w-full" style={{ maxWidth: W, height: H }}>

      {/* ── ambient pink glow ── */}
      <div
        className="absolute pointer-events-none"
        style={{
          width: 260, height: 220,
          left: 80, top: 100,
          background: "radial-gradient(circle, #FD589750 0%, #a855f720 100%)",
          filter: "blur(40px)",
        }}
      />

      {/* ── dotted connector lines (SVG, opacity only) ── */}
      <svg
        className="absolute inset-0 pointer-events-none"
        width={W} height={H}
        style={{ overflow: "visible" }}
      >
        {SOURCES.map((src, i) => (
          <motion.path
            key={src.id}
            d={linePath(
              ICON_CX + ICON_SIZE / 2 + 2,
              ICON_CYS[i],
              PHONE_L - 2,
              PHONE_CY,
            )}
            fill="none"
            stroke={`${PINK}35`}
            strokeWidth={1.5}
            strokeDasharray="5 4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 + i * 0.1, duration: 0.5 }}
          />
        ))}
      </svg>

      {/* ── source icon chips (left column) ── */}
      {SOURCES.map((src, i) => (
        <motion.div
          key={src.id}
          className="absolute flex flex-col items-center justify-center rounded-2xl shadow-lg select-none cursor-default"
          style={{
            left: ICON_L,
            top: ICON_TOPS[i],
            width: ICON_SIZE,
            height: ICON_SIZE,
            background: src.gradient,
            zIndex: 5,
          }}
          initial={{ opacity: 0, x: -16, scale: 0.8 }}
          animate={{
            opacity: 1,
            x: 0,
            scale: 1,
            y: [0, -5, 0],
          }}
          transition={{
            opacity: { delay: i * 0.1,       duration: 0.35 },
            x:       { delay: i * 0.1,       duration: 0.35, type: "spring", stiffness: 220, damping: 20 },
            scale:   { delay: i * 0.1,       duration: 0.35 },
            y:       { delay: i * 0.3 + 0.4, duration: 2.2 + i * 0.25, repeat: Infinity, repeatType: "mirror", ease: "easeInOut" },
          }}
        >
          <span className="text-white font-extrabold text-[10px] leading-none">{src.abbr}</span>
          <span className="text-white/75 font-medium text-[7px] leading-none mt-[2px]">{src.label}</span>
        </motion.div>
      ))}

      {/* ── flying save cards ── */}
      <AnimatePresence>
        {SAVE_CARDS.map((card, i) =>
          flyIdx >= i ? (
            <motion.div
              key={`${cycle}-fly-${i}`}
              className="absolute flex items-center gap-1.5 rounded-xl bg-white shadow-md pointer-events-none"
              style={{
                left: FLY_START_X(i),
                top: FLY_START_Y(i),
                width: CARD_W,
                height: CARD_H,
                border: `1.5px solid ${card.color}35`,
                zIndex: 20,
                paddingLeft: 8,
                paddingRight: 8,
              }}
              initial={{ opacity: 0, x: 0, y: 0, scale: 0.7 }}
              animate={{
                opacity: [0, 1, 1, 0],
                x: [0, FLY_DX],
                y: [0, FLY_DY(i)],
                scale: [0.7, 1, 0.85, 0.5],
              }}
              transition={{
                duration: 1.15,
                ease: [0.25, 0.46, 0.45, 0.94],
                times: [0, 0.2, 0.7, 1],
              }}
            >
              <span
                className="shrink-0 rounded-full"
                style={{ width: 8, height: 8, background: card.color, display: "inline-block" }}
              />
              <div className="min-w-0">
                <p className="text-[9px] font-bold text-gray-800 truncate leading-tight">{card.label}</p>
                <p className="text-[8px] font-semibold leading-tight" style={{ color: card.color }}>
                  #{card.tag}
                </p>
              </div>
            </motion.div>
          ) : null
        )}
      </AnimatePresence>

      {/* ── phone frame ── */}
      <div
        className="absolute overflow-hidden bg-white"
        style={{
          left: PHONE_L,
          top: PHONE_T,
          width: PHONE_W,
          height: PHONE_H,
          borderRadius: "2.4rem",
          border: "9px solid #111",
          boxShadow: "0 24px 64px -12px #00000040, 0 0 0 1px #ffffff20 inset",
          zIndex: 10,
        }}
      >
        {/* notch */}
        <div className="flex justify-center pt-2 pb-1">
          <div className="w-14 h-[5px] rounded-full bg-gray-800/20" />
        </div>

        {/* screen content */}
        <div className="px-3 pb-3 flex flex-col" style={{ height: PHONE_H - 24 }}>
          {/* header */}
          <div className="flex items-center justify-between mb-2 shrink-0">
            <div className="flex items-center gap-1.5">
              <Logo size="sm" showName={false} />
              <span className="font-extrabold text-[13px] tracking-tight text-gray-900">STASHd</span>
            </div>
            <motion.span
              className="rounded-full px-2 py-0.5 text-[8px] font-bold text-white shrink-0"
              style={{ background: PINK }}
              animate={{ opacity: flyIdx >= 0 && catCount === 0 ? [1, 0.55, 1] : 1 }}
              transition={{ duration: 0.7, repeat: flyIdx >= 0 && catCount === 0 ? Infinity : 0 }}
            >
              {flyIdx >= 0 && catCount === 0 ? "saving…" : "Your Library"}
            </motion.span>
          </div>

          {/* body */}
          <div className="flex-1 overflow-hidden">
            <AnimatePresence mode="wait">
              {!showOutcome ? (
                /* ── categories list ── */
                <motion.div
                  key="cats"
                  className="space-y-1.5"
                  exit={{ opacity: 0, y: -8, transition: { duration: 0.25 } }}
                >
                  {/* placeholder skeleton while nothing has landed */}
                  {catCount === 0 && (
                    <div className="space-y-1.5 mt-1">
                      {[1, 0.75, 0.55, 0.38].map((op, k) => (
                        <div
                          key={k}
                          className="h-9 rounded-2xl bg-gray-100"
                          style={{ opacity: op, animation: "pulse 1.8s ease-in-out infinite" }}
                        />
                      ))}
                    </div>
                  )}

                  {CATS.slice(0, catCount).map((cat, i) => (
                    <motion.div
                      key={cat.label}
                      className="flex items-center justify-between rounded-2xl px-3 py-2.5"
                      style={{ background: `${cat.color}18` }}
                      initial={{ opacity: 0, x: 18, scale: 0.95 }}
                      animate={{ opacity: 1, x: 0, scale: 1 }}
                      transition={{ ...spring, delay: 0.04 * i }}
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className="shrink-0 rounded-full"
                          style={{ width: 8, height: 8, background: cat.color, display: "inline-block" }}
                        />
                        <span className="text-[11px] font-bold text-gray-800">{cat.label}</span>
                      </div>
                      <span className="text-[10px] font-bold" style={{ color: cat.color }}>
                        {cat.count}
                      </span>
                    </motion.div>
                  ))}
                </motion.div>
              ) : (
                /* ── outcome card ── */
                <motion.div
                  key="outcome"
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ ...spring }}
                >
                  {/* found label */}
                  <p
                    className="text-[8px] font-extrabold tracking-widest mb-2"
                    style={{ color: PINK }}
                  >
                    ✨ FOUND FOR YOU
                  </p>

                  {/* dress card */}
                  <motion.div
                    className="rounded-2xl overflow-hidden"
                    style={{ border: `1.5px solid ${PINK}35`, boxShadow: `0 4px 20px ${PINK}25` }}
                    initial={{ scale: 0.88 }}
                    animate={{ scale: 1 }}
                    transition={{ ...spring, delay: 0.08 }}
                  >
                    {/* image block */}
                    <div
                      className="flex items-center justify-center relative"
                      style={{
                        height: 96,
                        background: "linear-gradient(135deg,#fce7f3 0%,#fdf4ff 100%)",
                      }}
                    >
                      <span style={{ fontSize: 54, lineHeight: 1 }}>👗</span>
                      <span
                        className="absolute top-2 right-2 rounded-full px-2 py-0.5 text-[8px] font-bold text-white"
                        style={{ background: PINK }}
                      >
                        Fashion
                      </span>
                    </div>

                    {/* card details */}
                    <div className="bg-white px-3 py-2.5">
                      <p className="text-[11px] font-extrabold text-gray-900 leading-snug">
                        Pink Linen Dress
                      </p>
                      <p className="text-[9px] text-gray-400 leading-tight mt-0.5">
                        Saved from Instagram
                      </p>
                      <div className="flex gap-1.5 mt-2">
                        <motion.button
                          className="flex-1 rounded-full py-1.5 text-[9px] font-bold text-white"
                          style={{ background: `linear-gradient(90deg, ${PINK}, #f472b6)` }}
                          animate={{ scale: [1, 1.05, 1] }}
                          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                        >
                          Buy Now
                        </motion.button>
                        <button
                          className="rounded-full px-2.5 py-1 text-[9px] font-semibold text-gray-500"
                          style={{ border: "1.5px solid #e5e7eb" }}
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  </motion.div>

                  {/* mini category rows below */}
                  <div className="mt-2 space-y-1">
                    {CATS.slice(1, 3).map((cat) => (
                      <div
                        key={cat.label}
                        className="flex items-center justify-between rounded-xl px-2.5 py-1.5"
                        style={{ background: `${cat.color}15` }}
                      >
                        <span className="text-[9px] font-bold text-gray-700">{cat.label}</span>
                        <span className="text-[9px] font-bold" style={{ color: cat.color }}>
                          {cat.count}
                        </span>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* bottom CTA */}
          <motion.button
            className="mt-2 w-full shrink-0 rounded-full py-2.5 text-[11px] font-bold text-white"
            style={{ background: `linear-gradient(90deg, ${PINK}, #f472b6)` }}
          >
            + Save an Item
          </motion.button>
        </div>
      </div>

    </div>
  );
}
