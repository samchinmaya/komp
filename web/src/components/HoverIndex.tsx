"use client";

import { useEffect, useRef, useState } from "react";
import type { FocusEvent, KeyboardEvent, PointerEvent } from "react";
import { features } from "@/data/site";

const RANGE = 2;
// Far rows stay at 3:1 contrast, the minimum for large text.
const DIM = 0.42;
const CURVE = 1.6;
const FOLLOW = 9;
const SETTLE = 0.001;
const WIPE_MS = 700;
const WIPE_EASE = "cubic-bezier(0.3, 0.9, 0.1, 1)";

const opacityAt = (row: number, lens: number) => {
  const near = Math.max(0, 1 - Math.abs(row - lens) / RANGE);
  return (DIM + (1 - DIM) * Math.pow(near, CURVE)).toFixed(3);
};

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** The pointer acts as a lens over the feature names, and the card wipes to the nearest one. */
export function HoverIndex() {
  const [active, setActive] = useState(0);
  const names = useRef<(HTMLButtonElement | null)[]>([]);
  const panels = useRef<(HTMLDivElement | null)[]>([]);
  const lens = useRef({ now: 0, target: 0, last: 0, frame: 0 });
  const shown = useRef({ index: 0, layer: 1 });

  useEffect(() => {
    const state = lens.current;
    return () => cancelAnimationFrame(state.frame);
  }, []);

  useEffect(() => {
    const previous = shown.current.index;
    const panel = panels.current[active];
    if (active === previous || !panel) return;
    shown.current.index = active;
    panel.style.clipPath = "none";
    panel.style.zIndex = String(++shown.current.layer);
    if (reducedMotion()) return;
    const from = active > previous ? "inset(100% 0 0 0)" : "inset(0 0 100% 0)";
    panel.animate([{ clipPath: from }, { clipPath: "inset(0 0 0 0)" }], { duration: WIPE_MS, easing: WIPE_EASE });
  }, [active]);

  function paint() {
    const state = lens.current;
    names.current.forEach((name, row) => {
      if (name) name.style.opacity = opacityAt(row, state.now);
    });
    setActive(Math.round(state.now));
  }

  function step(time: number) {
    const state = lens.current;
    const seconds = state.last ? Math.max(1 / 240, (time - state.last) / 1000) : 1 / 60;
    state.last = time;
    state.now += (state.target - state.now) * (1 - Math.exp(-seconds * FOLLOW));
    const settled = Math.abs(state.target - state.now) < SETTLE;
    if (settled) state.now = state.target;
    paint();
    state.frame = settled ? 0 : requestAnimationFrame(step);
  }

  function moveLens(target: number) {
    const state = lens.current;
    state.target = target;
    if (reducedMotion()) {
      state.now = target;
      paint();
    } else if (!state.frame) {
      state.last = 0;
      state.frame = requestAnimationFrame(step);
    }
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType === "touch") return;
    const centers = names.current.map((name) => {
      const box = name?.getBoundingClientRect();
      return box ? box.top + box.height / 2 : 0;
    });
    const y = event.clientY;
    const next = centers.findIndex((center) => y <= center);
    if (next === 0) moveLens(0);
    else if (next < 0) moveLens(centers.length - 1);
    else moveLens(next - 1 + (y - centers[next - 1]) / (centers[next] - centers[next - 1]));
  }

  function onFocus(event: FocusEvent<HTMLButtonElement>, row: number) {
    if (event.target.matches(":focus-visible")) moveLens(row);
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, row: number) {
    const last = features.length - 1;
    const next = { ArrowDown: Math.min(last, row + 1), ArrowUp: Math.max(0, row - 1), Home: 0, End: last }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    names.current[next]?.focus();
    moveLens(next);
  }

  return (
    <div onPointerMove={onPointerMove} className="mt-[52px] grid grid-cols-[minmax(0,1fr)] gap-8 min-[901px]:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] min-[901px]:gap-12">
      <div role="tablist" aria-label="What комп keeps" aria-orientation="vertical" className="flex flex-col justify-center">
        {features.map((feature, row) => (
          <button
            key={feature.title}
            ref={(name) => {
              names.current[row] = name;
            }}
            id={`keeps-tab-${row}`}
            role="tab"
            type="button"
            aria-selected={row === active}
            aria-controls={`keeps-panel-${row}`}
            tabIndex={row === active ? 0 : -1}
            onClick={() => moveLens(row)}
            onFocus={(event) => onFocus(event, row)}
            onKeyDown={(event) => onKeyDown(event, row)}
            style={{ opacity: opacityAt(row, 0) }}
            className="rounded-lg py-1 text-left font-display text-[clamp(24px,3.05vw,40px)] leading-[1.18] tracking-[-0.045em] text-snow outline-offset-2 will-change-[opacity]"
          >
            {feature.title}
          </button>
        ))}
      </div>

      <div className="grid min-h-[300px] overflow-hidden rounded-[20px] border border-rule bg-panel min-[901px]:min-h-[350px]">
        {features.map((feature, row) => (
          <div
            key={feature.title}
            ref={(panel) => {
              panels.current[row] = panel;
            }}
            id={`keeps-panel-${row}`}
            role="tabpanel"
            aria-labelledby={`keeps-tab-${row}`}
            aria-hidden={row !== active}
            inert={row !== active}
            style={row === 0 ? { zIndex: 1 } : { clipPath: "inset(100% 0 0 0)" }}
            className="flex min-w-0 flex-col justify-between gap-8 bg-panel p-5 [grid-area:1/1] min-[561px]:p-6"
          >
            <div>
              <p className="font-mono text-[12px] text-dim">
                {String(row + 1).padStart(2, "0")} / {String(features.length).padStart(2, "0")}
              </p>
              <p className="mt-5 text-pretty text-[clamp(19px,1.9vw,24px)] leading-[1.32] tracking-[-0.015em] text-snow">{feature.body}</p>
            </div>
            <pre className="whitespace-pre-wrap border-t border-rule pt-3.5 font-mono text-[12px] leading-[1.55] text-soft [overflow-wrap:anywhere]">{feature.example}</pre>
          </div>
        ))}
      </div>
    </div>
  );
}
