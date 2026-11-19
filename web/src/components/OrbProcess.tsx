"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { demos, fmt, pipeline } from "@/data/site";

const LOG = demos[0];
const POINTS = LOG.rawLines;
const GROUPS = LOG.outLines;
const RING_RADIUS = 36;
const LABEL_RADIUS = 44;
const RING_SHARE = 0.8;
const FRAME_MS = 33;
const SLOW_PAINT_MS = 16;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const REDUCED_QUERY = "(prefers-reduced-motion: reduce)";

const subscribeToMotion = (change: () => void) => {
  const query = window.matchMedia(REDUCED_QUERY);
  query.addEventListener("change", change);
  return () => query.removeEventListener("change", change);
};

function spherePoints(count: number) {
  const points = new Float32Array(count * 3);
  for (let index = 0; index < count; index++) {
    const y = 1 - (2 * (index + 0.5)) / count;
    const radius = Math.sqrt(1 - y * y);
    const angle = index * GOLDEN_ANGLE;
    points.set([Math.cos(angle) * radius, y, Math.sin(angle) * radius], index * 3);
  }
  return points;
}

function nearestGroups(points: Float32Array, groups: Float32Array) {
  const nearest = new Uint8Array(POINTS);
  for (let point = 0; point < POINTS; point++) {
    let best = -2;
    for (let group = 0; group < GROUPS; group++) {
      const match = points[point * 3] * groups[group * 3] + points[point * 3 + 1] * groups[group * 3 + 1] + points[point * 3 + 2] * groups[group * 3 + 2];
      if (match > best) {
        best = match;
        nearest[point] = group;
      }
    }
  }
  return nearest;
}

const labelPosition = (step: number) => {
  const angle = (step / pipeline.length) * Math.PI * 2;
  return {
    left: `${(50 + LABEL_RADIUS * Math.sin(angle)).toFixed(2)}%`,
    top: `${(50 - LABEL_RADIUS * Math.cos(angle)).toFixed(2)}%`,
  };
};

/** комп's pipeline around a ring. Scrolling collapses one point per log line into the final summary lines. */
export function OrbProcess({ heading }: { heading: ReactNode }) {
  const [active, setActive] = useState(0);
  const reduced = useSyncExternalStore(subscribeToMotion, () => window.matchMedia(REDUCED_QUERY).matches, () => false);
  const track = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const arc = useRef<SVGCircleElement>(null);
  const marker = useRef<SVGGElement>(null);
  const panels = useRef<(HTMLLIElement | null)[]>([]);

  useEffect(() => {
    const section = track.current;
    const surface = canvas.current;
    const context = surface?.getContext("2d");
    if (!section || !surface || !context) return;
    const area = section;
    const orb = surface;
    const paintBrush = context;
    const still = window.matchMedia(REDUCED_QUERY).matches;

    let points: Float32Array | null = null;
    let groups: Float32Array | null = null;
    let nearest: Uint8Array | null = null;
    let frame = 0;
    let lastDraw = 0;
    let visible = false;
    let spinning = !still;
    let progress = still ? 0.72 : 0;
    let size = 0;

    function resize() {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      size = orb.clientWidth;
      orb.width = Math.round(size * ratio);
      orb.height = Math.round(size * ratio);
      paintBrush.setTransform(ratio, 0, 0, ratio, 0, 0);
    }

    function readProgress() {
      if (still) return;
      const box = area.getBoundingClientRect();
      progress = Math.min(1, Math.max(0, -box.top / Math.max(1, box.height - window.innerHeight)));
      setActive(Math.round(progress * (pipeline.length - 1)));
      arc.current?.style.setProperty("stroke-dashoffset", String(1 - progress * RING_SHARE));
      marker.current?.setAttribute("transform", `rotate(${(progress * RING_SHARE * 360).toFixed(2)} 50 50)`);
    }

    function draw(time: number) {
      if (!size) resize();
      points ??= spherePoints(POINTS);
      groups ??= spherePoints(GROUPS);
      nearest ??= nearestGroups(points, groups);

      const raw = Math.min(1, Math.max(0, (progress - 0.12) / 0.88));
      const merge = raw * raw * (3 - 2 * raw);
      const turn = time * 0.00012 + progress * 2.6;
      const cos = Math.cos(turn);
      const sin = Math.sin(turn);
      const center = size / 2;
      const radius = center * 0.92;
      const dot = Math.max(1.1, size / 300) * (1 + merge * 2.6);

      paintBrush.clearRect(0, 0, size, size);
      paintBrush.fillStyle = "#edf2f6";
      for (let index = 0; index < POINTS; index++) {
        const group = nearest[index] * 3;
        let x = points[index * 3] + (groups[group] - points[index * 3]) * merge;
        let y = points[index * 3 + 1] + (groups[group + 1] - points[index * 3 + 1]) * merge;
        let z = points[index * 3 + 2] + (groups[group + 2] - points[index * 3 + 2]) * merge;
        const length = Math.hypot(x, y, z) || 1;
        x /= length;
        y /= length;
        z /= length;
        const screenX = x * cos + z * sin;
        const depth = z * cos - x * sin;
        paintBrush.globalAlpha = 0.1 + 0.75 * ((depth + 1) / 2) ** 2;
        paintBrush.fillRect(center + screenX * radius - dot / 2, center + y * radius - dot / 2, dot, dot);
      }
      paintBrush.globalAlpha = 1;
    }

    function loop(time: number) {
      frame = 0;
      if (!visible) return;
      if (time - lastDraw >= FRAME_MS) {
        lastDraw = time;
        const started = performance.now();
        draw(time);
        if (performance.now() - started > SLOW_PAINT_MS) spinning = false;
      }
      if (spinning) frame = requestAnimationFrame(loop);
    }

    function request() {
      readProgress();
      if (!frame && visible) frame = requestAnimationFrame(spinning ? loop : (time) => {
        frame = 0;
        draw(time);
      });
    }

    function onResize() {
      resize();
      request();
    }

    const watcher = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
        window.removeEventListener("scroll", request);
        if (visible) {
          window.addEventListener("scroll", request, { passive: true });
          request();
        }
      },
      { rootMargin: "20% 0px" },
    );

    watcher.observe(area);
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(frame);
      watcher.disconnect();
      window.removeEventListener("scroll", request);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  function goTo(step: number) {
    const section = track.current;
    if (!section) return;
    if (reduced) {
      panels.current[step]?.scrollIntoView({ block: "center" });
      return;
    }
    const top = section.getBoundingClientRect().top + window.scrollY;
    const travel = section.offsetHeight - window.innerHeight;
    window.scrollTo({ top: top + (travel * step) / (pipeline.length - 1) });
  }

  return (
    <div ref={track} className="motion-safe:h-[400svh]">
      <div className="grid grid-cols-[minmax(0,1fr)] content-center gap-x-14 gap-y-5 motion-safe:sticky motion-safe:top-0 motion-safe:h-svh min-[901px]:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] min-[901px]:grid-rows-[auto_auto] min-[901px]:gap-y-9">
        <div className="min-[901px]:self-end">{heading}</div>

        <div className="relative mx-auto aspect-square w-[min(78vw,34svh)] min-[901px]:col-start-2 min-[901px]:row-span-2 min-[901px]:row-start-1 min-[901px]:w-[min(100%,78svh)]">
          <div aria-hidden="true" className="absolute inset-[17%] rounded-full bg-[radial-gradient(circle_at_36%_30%,rgb(159_216_255/0.2),rgb(18_28_38/0.72)_48%,rgb(7_12_18/0.9)_72%)]" />
          <canvas ref={canvas} aria-hidden="true" className="absolute inset-[17%] size-[66%]" />
          <svg viewBox="0 0 100 100" aria-hidden="true" className="absolute inset-0 size-full overflow-visible">
            <circle cx="50" cy="50" r={RING_RADIUS} fill="none" stroke="rgb(237 242 246 / 0.16)" strokeWidth="0.22" />
            <circle
              ref={arc}
              cx="50"
              cy="50"
              r={RING_RADIUS}
              fill="none"
              stroke="#edf2f6"
              strokeWidth="0.3"
              pathLength={1}
              strokeDasharray="1"
              strokeDashoffset={reduced ? 1 - RING_SHARE : 1}
              transform="rotate(-90 50 50)"
            />
            {pipeline.map((step, index) => (
              <circle
                key={step.name}
                cx="50"
                cy={50 - RING_RADIUS}
                r="0.8"
                transform={`rotate(${(index / pipeline.length) * 360} 50 50)`}
                className={`transition-[fill] duration-300 ${reduced || index <= active ? "fill-snow" : "fill-raise"}`}
              />
            ))}
            <g ref={marker} className={reduced ? "hidden" : undefined}>
              <circle cx="50" cy={50 - RING_RADIUS} r="1.5" className="fill-night stroke-snow" strokeWidth="0.35" />
            </g>
          </svg>
          {pipeline.map((step, index) => (
            <button
              key={step.name}
              type="button"
              aria-label={`Step ${index + 1}: ${step.name}`}
              aria-current={index === active ? "step" : undefined}
              onClick={() => goTo(index)}
              style={labelPosition(index)}
              className={`absolute inline-flex min-h-7 min-w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center gap-1.5 rounded-lg font-mono text-[11px] transition-colors hover:text-snow min-[901px]:text-[12px] ${index === active ? "text-snow" : "text-dim"}`}
            >
              {String(index + 1).padStart(2, "0")}
              <span className="hidden min-[901px]:inline">{step.name}</span>
            </button>
          ))}
        </div>

        <div className="min-w-0 min-[901px]:self-start">
          <ol className="motion-safe:grid">
            {pipeline.map((step, index) => {
              const shown = reduced || index === active;
              return (
                <li
                  key={step.name}
                  ref={(panel) => {
                    panels.current[index] = panel;
                  }}
                  aria-hidden={!shown}
                  inert={!shown}
                  className={`min-w-0 transition-[opacity,translate] duration-300 motion-safe:[grid-area:1/1] motion-reduce:mb-8 ${shown ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"}`}
                >
                  <div className="flex items-baseline gap-3 min-[901px]:block">
                    <p className="font-display text-[34px] leading-none tracking-[-0.04em] min-[901px]:text-[clamp(56px,6vw,84px)]">{String(index + 1).padStart(2, "0")}</p>
                    <h3 className="text-[20px] font-medium tracking-[-0.02em] min-[901px]:mt-4 min-[901px]:text-[23px]">{step.title}</h3>
                  </div>
                  <p className="mt-2 max-w-[470px] text-[15px] leading-relaxed text-soft min-[901px]:text-[16px]">{step.body}</p>
                  <div className="mt-3.5 max-w-[500px] rounded-2xl border border-rule bg-panel px-4 py-3 font-mono text-[11.5px] leading-[1.55] [overflow-wrap:anywhere] min-[901px]:mt-5 min-[901px]:text-[12px]">
                    <pre className="whitespace-pre-wrap text-dim">{step.input}</pre>
                    <pre className="mt-2 whitespace-pre-wrap border-t border-rule pt-2 text-snow">{step.output}</pre>
                  </div>
                </li>
              );
            })}
          </ol>
          <p className="mt-3 font-mono text-[12px] text-dim min-[901px]:mt-4">
            {fmt(POINTS)} log lines in, {GROUPS} lines out
          </p>
        </div>
      </div>
    </div>
  );
}
