"use client";

import { useEffect, useState } from "react";

/*
 * Fig. 2 — the round trip, as an Archify-style lane diagram: three lanes,
 * orthogonal arrows and a reader-controlled step-through.
 * Motion only highlights; it never moves the layout.
 */

type Kind = "data" | "local" | "client" | "model";
const DARK = { fill: "#121c26", stroke: "#6b7d8e", text: "#edf2f6" };
const KIND: Record<Kind, { fill: string; stroke: string; text: string }> = {
  data: DARK,
  local: { fill: "#edf2f6", stroke: "#edf2f6", text: "#081018" },
  client: DARK,
  model: DARK,
};

const W = 150;
const H = 46;
const NODES = {
  clip: { x: 170, y: 64, kind: "data" as Kind, title: "Clipboard", sub: "2,001 raw lines" },
  comp: { x: 380, y: 64, kind: "local" as Kind, title: "compress()", sub: "parse → group" },
  serve: { x: 590, y: 64, kind: "local" as Kind, title: "komp serve", sub: "stdin / stdout" },
  client: { x: 590, y: 184, kind: "client" as Kind, title: "Claude Code", sub: "tools/call" },
  claude: { x: 590, y: 304, kind: "model" as Kind, title: "Claude", sub: "reads ~312 tokens" },
  answer: { x: 800, y: 304, kind: "model" as Kind, title: "Diagnosis", sub: "db down 10:04–10:06" },
};
type NodeId = keyof typeof NODES;

const EDGES: Record<string, { d: string; label?: string; lx?: number; ly?: number }> = {
  ask: { d: "M650 304V230", label: "tools/call", lx: 600, ly: 272 },
  call: { d: "M650 184V110", label: "JSON-RPC", lx: 600, ly: 152 },
  read: { d: "M630 64V40H245V64", label: "read clipboard", lx: 380, ly: 34 },
  feed: { d: "M320 87H380" },
  out: { d: "M530 87H590" },
  back: { d: "M700 110V184", label: "result", lx: 708, ly: 152 },
  back2: { d: "M700 230V304", label: "~312 tokens", lx: 708, ly: 272 },
  say: { d: "M740 327H800" },
};

const STEPS: { title: string; body: string; nodes: NodeId[]; edges: string[] }[] = [
  { title: "Copy", body: "You copy 2,001 lines (~75,958 tokens). They stay on your clipboard; nothing is pasted into the chat.", nodes: ["clip"], edges: [] },
  { title: "Ask", body: "You ask Claude what's wrong. Claude calls the compress_clipboard tool through Claude Code.", nodes: ["claude", "client", "serve"], edges: ["ask", "call"] },
  { title: "Read & compress", body: "komp reads the clipboard itself and runs the compressor: parse, hoist, templatize, group, render.", nodes: ["serve", "clip", "comp"], edges: ["read", "feed", "out"] },
  { title: "Return", body: "Only the summary travels back over stdout: 11 lines, ~312 tokens.", nodes: ["serve", "client", "claude"], edges: ["back", "back2"] },
  { title: "Answer", body: "Claude reads the summary and finds the outage: Postgres refused connections from 10:04 to 10:06.", nodes: ["claude", "answer"], edges: ["say"] },
];

export function RouteDiagram() {
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const s = STEPS[step];

  useEffect(() => {
    if (!playing) return;
    const id = setTimeout(() => {
      if (step === STEPS.length - 1) setPlaying(false);
      else setStep(step + 1);
    }, 2200);
    return () => clearTimeout(id);
  }, [playing, step]);

  const on = (n: NodeId) => s.nodes.includes(n);

  return (
    <figure className="relative">
      <div className="overflow-x-auto pb-4">
        <svg viewBox="0 0 980 380" className="block w-full min-w-[720px]" role="img" aria-label="Diagram of the MCP round trip between your machine, Claude Code and Claude">
          <defs>
            <marker id="rd-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="8" markerHeight="8" orient="auto">
              <path d="M0 0L8 4L0 8Z" fill="#edf2f6" />
            </marker>
            <marker id="rd-arrow-on" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="8" markerHeight="8" orient="auto">
              <path d="M0 0L8 4L0 8Z" fill="#edf2f6" />
            </marker>
          </defs>

          {/* lanes */}
          {[
            ["Your laptop · local", 20],
            ["Claude Code · client", 140],
            ["Claude · model", 260],
          ].map(([label, y]) => (
            <g key={label as string}>
              <rect x="10" y={y as number} width="960" height="110" fill="none" stroke="#edf2f6" strokeOpacity="0.2" strokeDasharray="3 4" />
              <text x="24" y={(y as number) + 64} className="font-mono" fontSize="11" fill="#a9b9c8" letterSpacing="0.06em">
                {(label as string).toUpperCase()}
              </text>
            </g>
          ))}

          {/* edges */}
          {Object.entries(EDGES).map(([id, e]) => {
            const active = s.edges.includes(id);
            return (
              <g key={id}>
                <path
                  d={e.d}
                  fill="none"
                  stroke={active ? "#edf2f6" : "#edf2f6"}
                  strokeOpacity={active ? 1 : 0.35}
                  strokeWidth={active ? 2 : 1.2}
                  markerEnd={`url(#${active ? "rd-arrow-on" : "rd-arrow"})`}
                  className={active ? "rd-flow" : undefined}
                />
                {e.label && (
                  <text x={e.lx} y={e.ly} fontSize="11" className="font-mono" fill={active ? "#edf2f6" : "#a9b9c8"} textAnchor={e.lx! > 650 ? "start" : "middle"}>
                    {e.label}
                  </text>
                )}
              </g>
            );
          })}

          {/* nodes */}
          {(Object.keys(NODES) as NodeId[]).map((id) => {
            const n = NODES[id];
            const k = KIND[n.kind];
            const active = on(id);
            return (
              <g key={id} opacity={active ? 1 : 0.42} style={{ transition: "opacity 240ms cubic-bezier(0.22,1,0.36,1)" }}>
                <rect x={n.x} y={n.y} width={W} height={H} fill={k.fill} stroke={active ? "#edf2f6" : k.stroke} strokeWidth={active ? 2 : 1} />
                <text x={n.x + 12} y={n.y + 20} fontSize="13" fontWeight="600" fill={k.text}>
                  {n.title}
                </text>
                <text x={n.x + 12} y={n.y + 36} fontSize="10.5" className="font-mono" fill={k.text} opacity="0.75">
                  {n.sub}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* step-through, outside the drawing */}
      <div className="grid gap-4 border-t border-white/10 py-4 md:grid-cols-[1fr_auto] md:items-end">
        <div aria-live="polite">
          <p className="mb-1 text-[13px] text-[#a9b9c8]">
            Step {step + 1} / {STEPS.length} — {s.title}
          </p>
          <p className="max-w-[62ch] text-[15px] leading-relaxed">{s.body}</p>
        </div>
        <div className="flex items-center gap-2 text-[13px]">
          <button type="button" onClick={() => { setPlaying(false); setStep(Math.max(0, step - 1)); }} disabled={step === 0} className="border border-white/30 px-3 py-1.5 disabled:opacity-30">
            ← Prev
          </button>
          <button type="button" onClick={() => { if (step === STEPS.length - 1) setStep(0); setPlaying(!playing); }} className="border border-white/30 bg-[#edf2f6] px-3 py-1.5 text-[#081018]">
            {playing ? "Pause" : "Play"}
          </button>
          <button type="button" onClick={() => { setPlaying(false); setStep(Math.min(STEPS.length - 1, step + 1)); }} disabled={step === STEPS.length - 1} className="border border-white/30 px-3 py-1.5 disabled:opacity-30">
            Next →
          </button>
        </div>
      </div>
    </figure>
  );
}
