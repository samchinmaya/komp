"use client";

import { useState } from "react";
import { demos, fmt, saving } from "@/data/site";
import { LogOutput, darkPalette, type Palette } from "./LogOutput";

/** Class names that let each design direction restyle the same demo. */
export type DemoTheme = {
  tab: string;
  tabActive: string;
  about: string;
  rawPane: string;
  rawHead: string;
  rawText: string;
  outPane: string;
  outHead: string;
  outText: string;
  meter: string;
  meterFill: string;
  meterText: string;
  palette?: Palette;
};

/** Tabs for the four test logs, raw preview next to komp's real output. */
export function DemoViewer({ theme, rawHeight = "h-[440px]" }: { theme: DemoTheme; rawHeight?: string }) {
  const [i, setI] = useState(0);
  const d = demos[i];
  const previewLines = d.rawPreview.split("\n").length;

  return (
    <div>
      <div role="tablist" aria-label="Example logs" className="mb-4 flex flex-wrap gap-2">
        {demos.map((demo, j) => (
          <button
            key={demo.key}
            role="tab"
            type="button"
            aria-selected={j === i}
            onClick={() => setI(j)}
            className={j === i ? theme.tabActive : theme.tab}
          >
            {demo.label}
          </button>
        ))}
      </div>
      <p className={theme.about}>{d.about}</p>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className={theme.rawPane}>
          <div className={theme.rawHead}>
            <span>Raw logs</span>
            <span className="font-mono">
              {fmt(d.rawLines)} lines · ~{fmt(d.rawTokens)} tokens
            </span>
          </div>
          <pre className={`${theme.rawText} ${rawHeight} overflow-auto`} tabIndex={0}>
            {d.rawPreview}
            {"\n"}
            <span className="italic opacity-70">… {fmt(d.rawLines - previewLines)} more lines</span>
          </pre>
        </div>
        <div className={theme.outPane}>
          <div className={theme.outHead}>
            <span>After комп</span>
            <span className="font-mono">
              {d.outLines} lines · ~{fmt(d.outTokens)} tokens
            </span>
          </div>
          <pre className={`${theme.outText} ${rawHeight} overflow-auto whitespace-pre-wrap break-words`} tabIndex={0}>
            <LogOutput text={d.output} palette={theme.palette ?? darkPalette} />
          </pre>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-4">
        <span className={theme.meterText}>
          <b>{saving(d)}%</b> fewer tokens
        </span>
        <div className={theme.meter} aria-hidden="true">
          <div
            className={theme.meterFill}
            style={{ width: `${Math.max(0.6, (100 * d.outTokens) / d.rawTokens)}%` }}
          />
        </div>
      </div>
    </div>
  );
}
