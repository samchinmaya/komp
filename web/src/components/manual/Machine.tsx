"use client";

import { useEffect, useRef, useState } from "react";
import { demos, fmt } from "@/data/site";

/*
 * Fig. 1 — the компрессор. An isometric machine whose working is the idea:
 * log sheets drop into a hopper, a press stamps them, the repetition falls
 * into a noise bin and one lit card (the summary) slides out.
 *
 * Rules (from the Anatomy skill): one isometric camera, solid parts painted
 * back to front, four shade tones, exactly one lit part, no text on the
 * drawing, readouts driven by the same numbers that drive the motion,
 * calm idle motion that pauses on hover/focus/off-screen, still under
 * reduced motion.
 */

const S = 13; // px per world unit
const OX = 150;
const OY = 172;
const COS = Math.cos(Math.PI / 6);

type P3 = [number, number, number];
const iso = ([x, y, z]: P3): [number, number] => [OX + (x - y) * COS * S, OY + (x + y) * 0.5 * S - z * S];
const pts = (...p: P3[]) => p.map((q) => iso(q).map((n) => n.toFixed(1)).join(",")).join(" ");

const INK = "#1a1c1f";
type Tone = { top: string; left: string; right: string };
const T: Record<string, Tone> = {
  base: { top: "#e6e1d5", left: "#cbc4b4", right: "#ada593" },
  metal: { top: "#faf8f2", left: "#e1dccf", right: "#c4bdac" },
  dark: { top: "#4b4f55", left: "#33363b", right: "#232529" },
  paper: { top: "#ffffff", left: "#ece8de", right: "#d9d3c5" },
  lit: { top: "#6cf2ae", left: "#2fc47a", right: "#1c9a5b" },
};

function Box({ at, size, tone, open = false, sw = 0.9 }: { at: P3; size: P3; tone: Tone; open?: boolean; sw?: number }) {
  const [x, y, z] = at;
  const [w, d, h] = size;
  const x1 = x + w;
  const y1 = y + d;
  const z1 = z + h;
  return (
    <g stroke={INK} strokeWidth={sw} strokeLinejoin="round">
      <polygon points={pts([x1, y, z], [x1, y1, z], [x1, y1, z1], [x1, y, z1])} fill={tone.right} />
      <polygon points={pts([x, y1, z], [x1, y1, z], [x1, y1, z1], [x, y1, z1])} fill={tone.left} />
      <polygon points={pts([x, y, z1], [x1, y, z1], [x1, y1, z1], [x, y1, z1])} fill={open ? T.dark.right : tone.top} />
    </g>
  );
}

/** A circle standing in the x–z plane at depth y (a gear on a side face). */
function Gear({ c, r, spin, teeth }: { c: P3; r: number; spin: number; teeth: number }) {
  const ring = Array.from({ length: 28 }, (_, i) => {
    const a = (i / 28) * Math.PI * 2;
    return iso([c[0] + r * Math.cos(a), c[1], c[2] + r * Math.sin(a)]).map((n) => n.toFixed(1)).join(",");
  }).join(" ");
  const hub = Array.from({ length: 16 }, (_, i) => {
    const a = (i / 16) * Math.PI * 2;
    return iso([c[0] + r * 0.32 * Math.cos(a), c[1], c[2] + r * 0.32 * Math.sin(a)]).map((n) => n.toFixed(1)).join(",");
  }).join(" ");
  const spokes = Array.from({ length: teeth }, (_, i) => {
    const a = (i / teeth) * Math.PI * 2 + spin;
    const [ax, ay] = iso([c[0] + r * 0.4 * Math.cos(a), c[1], c[2] + r * 0.4 * Math.sin(a)]);
    const [bx, by] = iso([c[0] + r * 1.18 * Math.cos(a), c[1], c[2] + r * 1.18 * Math.sin(a)]);
    return `M${ax.toFixed(1)} ${ay.toFixed(1)}L${bx.toFixed(1)} ${by.toFixed(1)}`;
  }).join("");
  return (
    <g stroke={INK} strokeWidth={0.9}>
      <path d={spokes} strokeWidth={2.2} strokeLinecap="square" />
      <polygon points={ring} fill={T.metal.left} />
      <polygon points={hub} fill={T.dark.left} />
    </g>
  );
}

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const easeOut = (t: number) => 1 - Math.pow(1 - clamp(t), 3);
const easeInOut = (t: number) => {
  const u = clamp(t);
  return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
};
const PERIOD = 5.2; // seconds per stamp

export function Machine() {
  const [i, setI] = useState(0);
  const [t, setT] = useState(PERIOD * 0.62);
  const [hold, setHold] = useState(false);
  const [visible, setVisible] = useState(true);
  const [reduced, setReduced] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const d = demos[i];

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener("change", update);
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.1 });
    if (ref.current) io.observe(ref.current);
    return () => {
      mq.removeEventListener("change", update);
      io.disconnect();
    };
  }, []);

  useEffect(() => {
    if (hold || !visible || reduced) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      setT((v) => v + Math.min(0.05, (now - last) / 1000));
      last = now;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [hold, visible, reduced]);

  // ---- the model: one stamp per period ----
  const u = (t % PERIOD) / PERIOD;
  const stamp = u < 0.16 ? easeInOut(u / 0.16) : u < 0.34 ? 1 - easeInOut((u - 0.16) / 0.18) : 0;
  const pz = 6.2 - 3.3 * stamp; // piston head height
  const cardX = 14.6 + 3.4 * easeOut((u - 0.18) / 0.42);
  const cardOpacity = u < 0.18 ? 0 : u > 0.9 ? 1 - (u - 0.9) / 0.1 : 1;
  const read = Math.round(d.rawLines * clamp(u / 0.18)); // lines consumed this stamp
  const done = u >= 0.2;
  const slat = (t * 1.6) % 0.8;

  const sheets = Array.from({ length: 8 }, (_, k) => {
    const z = 8.05 + ((((k * 0.62 - t * 1.25) % 4.96) + 4.96) % 4.96);
    const op = clamp((z - 8.1) / 0.5) * clamp((12.95 - z) / 0.6);
    return { z, op };
  }).sort((a, b) => a.z - b.z);

  const crumbs = [
    [8.6, 8.1], [9.3, 9.4], [10.2, 8.4], [10.9, 9.7], [9.1, 7.9], [11.3, 8.6], [8.9, 9.9], [10.5, 9.1], [9.8, 8.8], [11.6, 9.9],
  ] as const;

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight") setI((v) => (v + 1) % demos.length);
    if (e.key === "ArrowLeft") setI((v) => (v - 1 + demos.length) % demos.length);
  };

  return (
    <div ref={ref}>
      <div role="tablist" aria-label="Log fed into the machine" className="mb-3 flex flex-wrap gap-x-5 gap-y-1 font-mono text-[12px]">
        {demos.map((demo, j) => (
          <button
            key={demo.key}
            role="tab"
            type="button"
            aria-selected={j === i}
            onClick={() => setI(j)}
            className={`border-b py-1 transition-colors duration-200 ${j === i ? "border-[#1a1c1f] text-[#1a1c1f]" : "border-transparent text-[#8a8578] hover:text-[#1a1c1f]"}`}
          >
            {demo.label}
          </button>
        ))}
      </div>

      <figure
        tabIndex={0}
        onKeyDown={onKey}
        onPointerEnter={() => setHold(true)}
        onPointerLeave={() => setHold(false)}
        onFocus={() => setHold(true)}
        onBlur={() => setHold(false)}
        aria-label={`The компрессор: ${fmt(d.rawLines)} log lines go in, ${d.outLines} lines come out.`}
        className="relative border border-[#1a1c1f]/80 bg-[#f6f3ec] outline-none focus-visible:ring-2 focus-visible:ring-[#12a35c]"
      >
        {/* the four corners: number, title, hint, live readout */}
        <span className="absolute left-3 top-2.5 font-mono text-[11px] uppercase tracking-[0.12em] text-[#1a1c1f]">Fig. 1</span>
        <span className="absolute right-3 top-2.5 font-serif text-[15px] italic text-[#1a1c1f]">The компрессор</span>
        <span className="absolute bottom-2.5 left-3 hidden font-mono text-[11px] text-[#8a8578] sm:block">
          {reduced ? "Still view · ← → switch log" : hold ? "Paused · ← → switch log" : "Hover to pause · ← → switch log"}
        </span>
        <output
          aria-live="polite"
          className="absolute bottom-2.5 right-3 text-right font-mono text-[11px] tabular-nums text-[#1a1c1f]"
        >
          in {fmt(done ? d.rawLines : read)} / {fmt(d.rawLines)} lines → out {done ? d.outLines : "–"}
          <br />
          <span className="text-[#8a8578]">~{fmt(d.rawTokens)} → </span>
          <span className="text-[#0f7a47]">~{fmt(d.outTokens)} tokens</span>
        </output>

        <svg viewBox="0 0 470 440" className="mx-auto block w-full max-w-[640px] px-4 pb-14 pt-10" role="img" aria-hidden>
          {/* feet */}
          {([[0.3, 0.3], [24.7, 0.3], [0.3, 9.7], [24.7, 9.7]] as const).map(([x, y]) => (
            <Box key={`${x}${y}`} at={[x, y, -0.8]} size={[1, 1, 0.8]} tone={T.dark} />
          ))}
          {/* base plate, rails, bolts */}
          <Box at={[0, 0, 0]} size={[26, 11, 1]} tone={T.base} />
          <Box at={[1, 0.5, 1]} size={[24, 0.4, 0.3]} tone={T.metal} />
          <Box at={[1, 10.1, 1]} size={[24, 0.4, 0.3]} tone={T.metal} />
          {([[0.55, 0.55], [25.45, 0.55], [0.55, 10.45], [25.45, 10.45]] as const).map(([x, y]) => {
            const [cx, cy] = iso([x, y, 1]);
            return <ellipse key={`b${x}${y}`} cx={cx} cy={cy} rx={2.4} ry={1.4} fill={T.dark.top} stroke={INK} strokeWidth={0.8} />;
          })}

          {/* hopper (open top) and the falling log sheets */}
          <Box at={[1, 2, 1]} size={[6, 5, 7]} tone={T.metal} open />
          <Box at={[0.7, 1.7, 8]} size={[6.6, 5.6, 0.35]} tone={T.metal} open />
          {sheets.map((s, k) => (
            <g key={k} opacity={s.op}>
              <Box at={[1.5, 2.5, s.z]} size={[5, 4, 0.12]} tone={T.paper} sw={0.7} />
              {[0, 1, 2].map((r) => (
                <polyline
                  key={r}
                  points={pts([2.1, 3 + r * 1.1, s.z + 0.12], [5.6 - r * 0.7, 3 + r * 1.1, s.z + 0.12])}
                  stroke="#b9b2a2"
                  strokeWidth={0.9}
                  fill="none"
                />
              ))}
            </g>
          ))}

          {/* back post of the press */}
          <Box at={[12.5, 1.2, 1]} size={[1, 1, 11]} tone={T.metal} />

          {/* conveyor with moving slats */}
          <Box at={[7, 2.8, 1]} size={[5.4, 3.4, 1.6]} tone={T.dark} />
          {Array.from({ length: 7 }, (_, k) => {
            const x = 7.2 + k * 0.8 + slat;
            if (x > 12.3) return null;
            return <polyline key={k} points={pts([x, 2.9, 2.6], [x, 6.1, 2.6])} stroke="#7d828a" strokeWidth={1} />;
          })}

          {/* roller under the press, its stripes turning */}
          <Box at={[12.5, 2.8, 1]} size={[2, 3.4, 1.6]} tone={T.dark} />
          {Array.from({ length: 4 }, (_, k) => {
            const z = 1.2 + ((k * 0.4 + t * 0.9) % 1.6);
            return <polyline key={k} points={pts([14.5, 2.9, z], [14.5, 6.1, z])} stroke="#6b7078" strokeWidth={1} />;
          })}

          {/* piston: rod and head */}
          <Box at={[13.2, 4.2, pz + 1.6]} size={[0.6, 0.6, 12 - pz - 1.6]} tone={T.metal} />
          <Box at={[12.6, 3, pz]} size={[1.8, 3, 1.6]} tone={T.metal} />

          {/* control box at the back, its screen showing one bar per output line */}
          <Box at={[21.6, 0.9, 1]} size={[3.4, 3.6, 5.5]} tone={T.metal} />
          <polygon points={pts([21.95, 4.5, 2], [24.65, 4.5, 2], [24.65, 4.5, 6], [21.95, 4.5, 6])} fill={T.dark.left} stroke={INK} strokeWidth={0.8} />
          {Array.from({ length: d.outLines }, (_, k) => {
            const z = 5.6 - k * (3.4 / Math.max(1, d.outLines));
            const len = 0.6 + ((k * 7) % 5) * 0.35;
            return <polyline key={k} points={pts([22.25, 4.5, z], [22.25 + len, 4.5, z])} stroke="#e8ecf1" strokeWidth={1} opacity={done ? 0.9 : 0.25} />;
          })}
          <Box at={[22.2, 1.3, 6.5]} size={[0.5, 0.5, 1.4]} tone={T.dark} />

          {/* output chute and the one lit part: the summary */}
          <Box at={[15, 2.8, 1]} size={[6, 3.4, 1.2]} tone={T.metal} />
          <g opacity={cardOpacity}>
            <Box at={[cardX, 3.4, 2.2]} size={[3, 2.2, 0.3]} tone={T.lit} />
          </g>

          {/* noise bin with the repetition that was thrown away */}
          <Box at={[8, 7.4, 1]} size={[4, 3, 1.4]} tone={T.metal} open />
          {crumbs.map(([x, y], k) => (
            <polygon key={k} points={pts([x, y, 2.4], [x + 0.35, y, 2.4], [x + 0.35, y + 0.35, 2.4], [x, y + 0.35, 2.4])} fill="#cfc8b8" stroke={INK} strokeWidth={0.5} />
          ))}

          {/* front post, gears on its side, crossbeam */}
          <Box at={[12.5, 7.8, 1]} size={[1, 1, 11]} tone={T.metal} />
          <Gear c={[13, 8.8, 8.6]} r={1.15} spin={t * 1.8} teeth={8} />
          <Gear c={[13, 8.8, 5.9]} r={1.5} spin={-t * 1.38} teeth={10} />
          <Box at={[12.2, 1.2, 12]} size={[2.6, 7.6, 1.2]} tone={T.metal} />

        </svg>
      </figure>
    </div>
  );
}
