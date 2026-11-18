"use client";

import { useState } from "react";
import { demos, fmt, saving } from "@/data/site";
import { LogOutput } from "./LogOutput";

const LOG = "m-0 h-[300px] overflow-auto whitespace-pre-wrap px-4 py-[13px] font-mono text-[12px] leading-[1.55] [overflow-wrap:anywhere] md:h-[390px]";

function Pane({ title, note, children }: { title: string; note: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 overflow-hidden rounded-2xl border border-rule bg-panel">
      <div className="flex h-[42px] items-center justify-between gap-3 border-b border-rule px-4 text-[13px]">
        <span>{title}</span>
        <span className="truncate font-mono text-[12px] text-dim">{note}</span>
      </div>
      {children}
    </div>
  );
}

/** Tabs for the four test logs, raw preview next to komp's real output. */
export function DemoViewer() {
  const [i, setI] = useState(0);
  const d = demos[i];
  const previewLines = d.rawPreview.split("\n").length;

  return (
    <div>
      <div role="tablist" aria-label="Example logs" className="no-scrollbar mt-9 flex gap-1.5 overflow-x-auto sm:flex-wrap">
        {demos.map((demo, j) => (
          <button
            key={demo.key}
            role="tab"
            type="button"
            aria-selected={j === i}
            onClick={() => setI(j)}
            className={`min-h-[38px] shrink-0 rounded-lg px-3 text-[14px] transition-colors ${j === i ? "bg-snow/10 text-snow" : "text-dim hover:text-snow"}`}
          >
            {demo.label}
          </button>
        ))}
      </div>
      <p className="mt-3.5 text-soft">{d.about}</p>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <Pane title="before" note={`${fmt(d.rawLines)} lines · ~${fmt(d.rawTokens)} tokens`}>
          <pre className={`${LOG} text-dim`} tabIndex={0}>
            {d.rawPreview}
            {"\n"}… {fmt(d.rawLines - previewLines)} more lines
          </pre>
        </Pane>
        <Pane title="after" note={`${d.outLines} lines · ~${fmt(d.outTokens)} tokens`}>
          <pre className={LOG} tabIndex={0}>
            <LogOutput text={d.output} />
          </pre>
        </Pane>
      </div>

      <div className="mt-[18px] flex items-center gap-4 text-[14px] text-soft">
        <span>
          <b className="font-medium text-snow">{saving(d)}%</b> fewer tokens
        </span>
        <div className="h-1 flex-1 overflow-hidden rounded-full bg-snow/10" aria-hidden="true">
          <div className="h-full min-w-1 rounded-full bg-snow" style={{ width: `${(100 * d.outTokens) / d.rawTokens}%` }} />
        </div>
      </div>
    </div>
  );
}
