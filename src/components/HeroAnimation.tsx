import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect } from "react";

// ── brand ─────────────────────────────────────────────────────────────────────
const PINK = "#FD5897";
const SPRING = { type: "spring" as const, stiffness: 200, damping: 26 };

// ── platform logo SVGs ────────────────────────────────────────────────────────
function IgLogo({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <defs>
        <linearGradient id="ig-g" x1="0" y1="32" x2="32" y2="0" gradientUnits="userSpaceOnUse">
          <stop stopColor="#f09433" />
          <stop offset=".25" stopColor="#e6683c" />
          <stop offset=".5" stopColor="#dc2743" />
          <stop offset=".75" stopColor="#cc2366" />
          <stop offset="1" stopColor="#bc1888" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="8" fill="url(#ig-g)" />
      <rect x="8" y="8" width="16" height="16" rx="4" stroke="white" strokeWidth="2" />
      <circle cx="16" cy="16" r="4" stroke="white" strokeWidth="2" />
      <circle cx="22" cy="10" r="1.5" fill="white" />
    </svg>
  );
}

function TtLogo({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <rect width="32" height="32" rx="8" fill="#010101" />
      <path d="M19.5 7h-2.8v11.6a2.6 2.6 0 1 1-2.1-2.55V13.2a5.4 5.4 0 1 0 4.9 5.4V13a7.9 7.9 0 0 0 4.1 1.15v-2.8A4.4 4.4 0 0 1 19.5 7z" fill="white" />
      <path d="M21.6 8.15a4.4 4.4 0 0 0 2 3" stroke="#69C9D0" strokeWidth="1.5" strokeLinecap="round" fill="none" />
    </svg>
  );
}

function PinLogo({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <rect width="32" height="32" rx="8" fill="#E60023" />
      <path d="M16 6C10.48 6 6 10.48 6 16c0 4.24 2.65 7.88 6.42 9.32-.09-.79-.17-2 .03-2.86.19-.78 1.25-5.29 1.25-5.29s-.32-.64-.32-1.58c0-1.48.86-2.59 1.93-2.59.91 0 1.35.68 1.35 1.5 0 .91-.58 2.28-.88 3.54-.25 1.06.53 1.92 1.57 1.92 1.88 0 3.14-2.4 3.14-5.24 0-2.18-1.47-3.7-4.07-3.7-2.96 0-4.78 2.2-4.78 4.66 0 .85.24 1.44.62 1.9.17.2.2.28.14.51-.05.17-.15.6-.2.75-.06.24-.26.33-.49.24-1.38-.59-2.02-2.19-2.02-3.97 0-2.93 2.47-6.44 7.36-6.44 3.94 0 6.56 2.85 6.56 5.91 0 4.04-2.24 7.04-5.54 7.04-1.1 0-2.14-.59-2.49-1.28l-.68 2.69c-.25.93-.9 2.1-1.35 2.82 1.02.31 2.1.48 3.21.48 5.52 0 10-4.48 10-10S21.52 6 16 6z" fill="white" />
    </svg>
  );
}

function YtLogo({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <rect width="32" height="32" rx="8" fill="#FF0000" />
      <path d="M26 11.5a3 3 0 0 0-2.1-2.1C21.9 9 16 9 16 9s-5.9 0-7.9.4A3 3 0 0 0 6 11.5C5.6 13.5 5.6 16 5.6 16s0 2.5.4 4.5A3 3 0 0 0 8.1 22.6C10.1 23 16 23 16 23s5.9 0 7.9-.4a3 3 0 0 0 2.1-2.1c.4-2 .4-4.5.4-4.5s0-2.5-.4-4.5z" fill="white" />
      <polygon points="13.5,13 20.5,16 13.5,19" fill="#FF0000" />
    </svg>
  );
}

function WebLogo({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <rect width="32" height="32" rx="8" fill="#3b82f6" />
      <circle cx="16" cy="16" r="8" stroke="white" strokeWidth="1.8" />
      <path d="M16 8c-2.5 2.5-2.5 12 0 16M16 8c2.5 2.5 2.5 12 0 16" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M8 16h16M9 12.5h14M9 19.5h14" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

// ── source card data ──────────────────────────────────────────────────────────
const SOURCES = [
  {
    id: "ig",
    Logo: IgLogo,
    handle: "@style_inspo",
    title: "Pink Linen Dress",
    emoji: "👗",
    bg: "linear-gradient(135deg,#fce7f3 0%,#fda4af 100%)",
    color: PINK,
  },
  {
    id: "tt",
    Logo: TtLogo,
    handle: "@foodtok",
    title: "Creamy Tuscan Pasta",
    emoji: "🍝",
    bg: "linear-gradient(135deg,#fef3c7 0%,#fbbf24 100%)",
    color: "#f59e0b",
  },
  {
    id: "pin",
    Logo: PinLogo,
    handle: "Travel Inspo",
    title: "Santorini Hotel List",
    emoji: "🏛️",
    bg: "linear-gradient(135deg,#dbeafe 0%,#60a5fa 100%)",
    color: "#3b82f6",
  },
  {
    id: "yt",
    Logo: YtLogo,
    handle: "FitWith Sara",
    title: "15 Min Full Body",
    emoji: "💪",
    bg: "linear-gradient(135deg,#ede9fe 0%,#a78bfa 100%)",
    color: "#7c3aed",
  },
  {
    id: "web",
    Logo: WebLogo,
    handle: "sephora.com",
    title: "Glow Serum",
    emoji: "✨",
    bg: "linear-gradient(135deg,#d1fae5 0%,#34d399 100%)",
    color: "#059669",
  },
] as const;

// ── phone dashboard items ─────────────────────────────────────────────────────
const DASH_ITEMS = [
  { emoji: "👗", title: "Pink Linen Dress",       category: "Fashion",  cta: "Buy Now",      catColor: PINK,      bg: "linear-gradient(135deg,#fce7f3,#fda4af)" },
  { emoji: "🍝", title: "Creamy Tuscan Pasta",    category: "Recipes",  cta: "Cook Tonight", catColor: "#f59e0b", bg: "linear-gradient(135deg,#fef3c7,#fbbf24)" },
  { emoji: "🏛️", title: "Santorini Hotel List",   category: "Travel",   cta: "Plan Trip",    catColor: "#3b82f6", bg: "linear-gradient(135deg,#dbeafe,#60a5fa)" },
  { emoji: "💪", title: "15 Min Full Body",       category: "Workouts", cta: "Start Now",    catColor: "#7c3aed", bg: "linear-gradient(135deg,#ede9fe,#a78bfa)" },
  { emoji: "✨", title: "Glow Serum",             category: "Products", cta: "Buy Now",      catColor: "#059669", bg: "linear-gradient(135deg,#d1fae5,#34d399)" },
] as const;

// ── layout ────────────────────────────────────────────────────────────────────
const W          = 380;
const H          = 490;

// source cards
const CARD_W     = 120;
const CARD_H     = 68;
const CARD_TOPS  = [10, 88, 166, 244, 322] as const;
const CARD_CYS   = CARD_TOPS.map((t) => t + CARD_H / 2) as unknown as readonly number[];

// phone
const PHONE_L    = 166;
const PHONE_T    = 14;
const PHONE_W    = 204;
const PHONE_H    = 452;
const PHONE_CX   = PHONE_L + PHONE_W / 2;   // 268
const PHONE_CY   = PHONE_T + PHONE_H / 2;   // 240

// flying chip
const CHIP_W     = 100;
const CHIP_H     = 30;
// chip starts at right edge of source card, centered vertically on the card
const CHIP_START_X = (i: number) => CARD_W;                        // 120
const CHIP_START_Y = (i: number) => CARD_CYS[i] - CHIP_H / 2;
// chip ends near the phone entry point (phone left - chip width, phone center Y)
const CHIP_END_DX  = PHONE_L - CHIP_W - 8;                         // 58
const CHIP_END_DY  = (i: number) => PHONE_CY - CARD_CYS[i];

// ── curved SVG path helpers ───────────────────────────────────────────────────
function curvePath(
  x1: number, y1: number,
  x2: number, y2: number,
  curvature: number = 40
) {
  const mx = (x1 + x2) / 2 + curvature;
  const my = (y1 + y2) / 2;
  return `M ${x1} ${y1} Q ${mx} ${my} ${x2} ${y2}`;
}

// ── component ─────────────────────────────────────────────────────────────────
export function HeroAnimation() {
  const [cycle, setCycle]             = useState(0);
  const [flyIdx, setFlyIdx]           = useState(-1);
  const [dashCount, setDashCount]     = useState(0);
  const [showOutcome, setShowOutcome] = useState(false);
  const [highlight, setHighlight]     = useState(-1);

  useEffect(() => {
    setFlyIdx(-1);
    setDashCount(0);
    setShowOutcome(false);
    setHighlight(-1);

    const T: ReturnType<typeof setTimeout>[] = [];
    const at = (ms: number, fn: () => void) => T.push(setTimeout(fn, ms));

    // fly in 5 cards, 500 ms apart, starting at 1 s
    SOURCES.forEach((_, i) => at(1000 + i * 500, () => setFlyIdx(i)));

    // populate dashboard items
    DASH_ITEMS.forEach((_, i) => at(4000 + i * 300, () => setDashCount(i + 1)));

    // highlight first item + show outcome
    at(6200, () => setHighlight(0));
    at(6600, () => setShowOutcome(true));

    // next loop
    at(10000, () => setCycle((c) => c + 1));

    return () => T.forEach(clearTimeout);
  }, [cycle]);

  return (
    <div
      className="relative mx-auto"
      style={{ width: W, height: H, maxWidth: "100%" }}
    >
      {/* ── ambient glow ── */}
      <div
        className="absolute pointer-events-none"
        style={{
          width: 280, height: 240,
          left: 60, top: 110,
          background: "radial-gradient(circle,#FD589740 0%,#a855f715 60%,transparent 100%)",
          filter: "blur(32px)",
        }}
      />

      {/* ── SVG curved connector paths ── */}
      <svg
        className="absolute inset-0 pointer-events-none"
        width={W} height={H}
        style={{ overflow: "visible" }}
      >
        {SOURCES.map((src, i) => (
          <motion.path
            key={src.id}
            d={curvePath(
              CARD_W + 2, CARD_CYS[i],
              PHONE_L - 2, PHONE_CY,
              24,
            )}
            fill="none"
            stroke={src.color + "40"}
            strokeWidth="1.5"
            strokeDasharray="5 5"
            initial={{ opacity: 0, pathLength: 0 }}
            animate={{ opacity: 1, pathLength: 1 }}
            transition={{ delay: 0.3 + i * 0.12, duration: 0.9, ease: "easeOut" }}
          />
        ))}
      </svg>

      {/* ── source cards (left column) ── */}
      {SOURCES.map((src, i) => {
        const Logo = src.Logo;
        return (
          <motion.div
            key={src.id}
            className="absolute overflow-hidden rounded-2xl bg-white"
            style={{
              left: 0,
              top: CARD_TOPS[i],
              width: CARD_W,
              height: CARD_H,
              boxShadow: "0 4px 20px -4px rgba(0,0,0,0.13)",
              border: "1.5px solid rgba(255,255,255,0.9)",
              zIndex: 4,
            }}
            initial={{ opacity: 0, x: -24, scale: 0.88 }}
            animate={{
              opacity: 1,
              x: 0,
              scale: 1,
              y: [0, -5, 0],
            }}
            transition={{
              opacity: { delay: i * 0.1, duration: 0.4 },
              x:       { delay: i * 0.1, duration: 0.4, type: "spring", stiffness: 220, damping: 22 },
              scale:   { delay: i * 0.1, duration: 0.4 },
              y:       { delay: i * 0.4 + 0.5, duration: 2.4 + i * 0.2, repeat: Infinity, repeatType: "mirror", ease: "easeInOut" },
            }}
          >
            {/* thumbnail area */}
            <div
              className="absolute left-0 top-0 bottom-0 flex items-center justify-center"
              style={{ width: 52, background: src.bg }}
            >
              <span style={{ fontSize: 24, lineHeight: 1 }}>{src.emoji}</span>
            </div>

            {/* content area */}
            <div
              className="absolute right-0 top-0 bottom-0 flex flex-col justify-between"
              style={{ left: 52, padding: "7px 8px 7px 8px" }}
            >
              <div className="flex items-center justify-between">
                <span
                  className="text-[8px] font-semibold truncate"
                  style={{ color: src.color, maxWidth: 44 }}
                >
                  {src.handle}
                </span>
                <Logo size={14} />
              </div>
              <p className="text-[10px] font-bold text-gray-800 leading-snug line-clamp-2">
                {src.title}
              </p>
              <motion.span
                className="self-start rounded-full text-white text-[7px] font-bold px-1.5 py-0.5"
                style={{ background: src.color }}
                animate={{ scale: flyIdx === i ? [1, 1.08, 1] : 1 }}
                transition={{ duration: 0.3 }}
              >
                Save ✦
              </motion.span>
            </div>
          </motion.div>
        );
      })}

      {/* ── flying save chips ── */}
      <AnimatePresence>
        {SOURCES.map((src, i) => {
          const Logo = src.Logo;
          return flyIdx >= i ? (
            <motion.div
              key={`${cycle}-chip-${i}`}
              className="absolute flex items-center gap-1.5 rounded-xl bg-white pointer-events-none"
              style={{
                left: CHIP_START_X(i),
                top: CHIP_START_Y(i),
                width: CHIP_W,
                height: CHIP_H,
                boxShadow: `0 4px 16px ${src.color}35`,
                border: `1.5px solid ${src.color}30`,
                paddingLeft: 7,
                paddingRight: 7,
                zIndex: 20,
              }}
              initial={{ opacity: 0, x: 0, y: 0, scale: 0.75 }}
              animate={{
                opacity: [0, 1, 1, 0],
                x: [0, 14, CHIP_END_DX],
                y: [0, CHIP_END_DY(i) * 0.45, CHIP_END_DY(i)],
                scale: [0.75, 1, 0.8, 0.5],
              }}
              transition={{
                duration: 1.2,
                ease: [0.25, 0.46, 0.45, 0.94],
                times: [0, 0.18, 0.72, 1],
              }}
            >
              <Logo size={14} />
              <div className="min-w-0">
                <p className="text-[8px] font-bold text-gray-800 truncate leading-tight">
                  {src.title}
                </p>
                <p
                  className="text-[7px] font-semibold leading-tight truncate"
                  style={{ color: src.color }}
                >
                  {src.handle}
                </p>
              </div>
            </motion.div>
          ) : null;
        })}
      </AnimatePresence>

      {/* ── phone frame ── */}
      <div
        className="absolute bg-white overflow-hidden"
        style={{
          left: PHONE_L,
          top: PHONE_T,
          width: PHONE_W,
          height: PHONE_H,
          borderRadius: "2.4rem",
          border: "9px solid #111",
          boxShadow: "0 32px 80px -12px rgba(0,0,0,0.35), 0 0 0 1px rgba(255,255,255,0.15) inset",
          zIndex: 10,
        }}
      >
        {/* notch */}
        <div className="flex justify-center pt-2">
          <div className="w-14 h-[5px] rounded-full bg-gray-800/20" />
        </div>

        {/* screen */}
        <div
          className="flex flex-col overflow-hidden"
          style={{ height: PHONE_H - 9 * 2 - 12, padding: "6px 10px 8px" }}
        >
          {/* logo bar */}
          <div className="flex items-center justify-between mb-2 shrink-0">
            <div className="flex items-center gap-1">
              {/* S mark inline */}
              <svg width="18" height="18" viewBox="0 0 32 32" fill="none">
                <rect width="32" height="32" rx="8" fill={PINK} />
                <text x="8" y="23" fontSize="18" fontWeight="900" fill="white" fontFamily="system-ui">S</text>
              </svg>
              <span className="font-extrabold text-[13px] tracking-tight text-gray-900">STASHd</span>
            </div>
            <motion.div
              className="rounded-full w-5 h-5 flex items-center justify-center"
              style={{ background: "#f3f4f6" }}
              animate={{ scale: flyIdx >= 0 && dashCount === 0 ? [1, 1.2, 1] : 1 }}
              transition={{ duration: 0.6, repeat: flyIdx >= 0 && dashCount === 0 ? Infinity : 0 }}
            >
              <span className="text-[9px]">🔔</span>
            </motion.div>
          </div>

          {/* search bar */}
          <div
            className="flex items-center gap-1.5 rounded-xl mb-3 shrink-0"
            style={{ background: "#f8f8f8", border: "1.5px solid #f0f0f0", padding: "6px 10px" }}
          >
            <span className="text-[10px]">🔍</span>
            <span className="text-[9px] text-gray-400 font-medium">Search your saves…</span>
          </div>

          {/* section label */}
          <div className="flex items-center justify-between mb-1.5 shrink-0">
            <span className="text-[9px] font-bold text-gray-500 tracking-wider">YOUR LIBRARY</span>
            <span className="text-[8px] font-semibold" style={{ color: PINK }}>
              {dashCount} saved
            </span>
          </div>

          {/* saved items */}
          <div className="flex-1 overflow-hidden space-y-1.5">
            <AnimatePresence>
              {DASH_ITEMS.slice(0, dashCount).map((item, i) => {
                const isHighlighted = highlight === i;
                return (
                  <motion.div
                    key={item.title}
                    className="flex items-center gap-2 rounded-2xl overflow-hidden"
                    style={{
                      background: isHighlighted ? `${item.catColor}12` : "#fafafa",
                      border: isHighlighted ? `1.5px solid ${item.catColor}35` : "1.5px solid #f3f4f6",
                      padding: "5px 8px 5px 5px",
                      boxShadow: isHighlighted ? `0 4px 16px ${item.catColor}20` : "none",
                      transition: "all 0.4s ease",
                    }}
                    initial={{ opacity: 0, x: 20, scale: 0.95 }}
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    transition={{ ...SPRING, delay: 0.04 * i }}
                  >
                    {/* thumbnail */}
                    <div
                      className="shrink-0 rounded-xl flex items-center justify-center"
                      style={{ width: 36, height: 36, background: item.bg }}
                    >
                      <span style={{ fontSize: 18, lineHeight: 1 }}>{item.emoji}</span>
                    </div>

                    {/* details */}
                    <div className="flex-1 min-w-0">
                      <p className="text-[9px] font-bold text-gray-900 truncate leading-tight">
                        {item.title}
                      </p>
                      <span
                        className="inline-block rounded-full text-[7px] font-bold px-1.5 py-0.5 leading-tight mt-0.5"
                        style={{ background: item.catColor + "20", color: item.catColor }}
                      >
                        {item.category}
                      </span>
                    </div>

                    {/* CTA */}
                    <motion.button
                      className="shrink-0 rounded-full text-white text-[7px] font-bold whitespace-nowrap"
                      style={{
                        background: isHighlighted
                          ? `linear-gradient(90deg,${item.catColor},${item.catColor}cc)`
                          : "#e5e7eb",
                        color: isHighlighted ? "white" : "#9ca3af",
                        padding: "3px 7px",
                        transition: "all 0.4s ease",
                      }}
                      animate={isHighlighted ? { scale: [1, 1.06, 1] } : { scale: 1 }}
                      transition={{ duration: 1.8, repeat: isHighlighted ? Infinity : 0, ease: "easeInOut" }}
                    >
                      {item.cta}
                    </motion.button>
                  </motion.div>
                );
              })}
            </AnimatePresence>

            {/* skeleton placeholders while loading */}
            {dashCount < DASH_ITEMS.length && (
              <div className="space-y-1.5">
                {Array.from({ length: Math.min(3, DASH_ITEMS.length - dashCount) }).map((_, k) => (
                  <div
                    key={k}
                    className="h-[46px] rounded-2xl bg-gray-100"
                    style={{ opacity: 0.7 - k * 0.2 }}
                  />
                ))}
              </div>
            )}
          </div>

          {/* outcome banner */}
          <AnimatePresence>
            {showOutcome && (
              <motion.div
                className="mt-2 shrink-0 rounded-2xl overflow-hidden"
                style={{
                  background: `linear-gradient(135deg,${PINK}18,#f472b620)`,
                  border: `1.5px solid ${PINK}40`,
                  padding: "8px 10px",
                }}
                initial={{ opacity: 0, y: 10, scale: 0.94 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={SPRING}
              >
                <p className="text-[8px] font-extrabold tracking-widest mb-1" style={{ color: PINK }}>
                  ✨ FOUND FOR YOU
                </p>
                <div className="flex items-center gap-2">
                  <div
                    className="shrink-0 rounded-xl flex items-center justify-center"
                    style={{ width: 32, height: 32, background: "linear-gradient(135deg,#fce7f3,#fda4af)" }}
                  >
                    <span style={{ fontSize: 16, lineHeight: 1 }}>👗</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[9px] font-extrabold text-gray-900 leading-tight">Pink Linen Dress</p>
                    <p className="text-[7px] text-gray-400 leading-tight">From @style_inspo</p>
                  </div>
                  <motion.button
                    className="shrink-0 rounded-full text-white text-[7px] font-bold"
                    style={{ background: `linear-gradient(90deg,${PINK},#f472b6)`, padding: "4px 8px" }}
                    animate={{ scale: [1, 1.07, 1] }}
                    transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
                  >
                    Buy Now
                  </motion.button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* bottom save button */}
          <motion.button
            className="mt-2 w-full shrink-0 rounded-full py-2.5 text-[10px] font-bold text-white"
            style={{ background: `linear-gradient(90deg,${PINK},#f472b6)` }}
          >
            + Save an Item
          </motion.button>
        </div>
      </div>
    </div>
  );
}
