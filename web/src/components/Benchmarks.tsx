"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import benchmarks from "@/data/benchmarks.json";
import { fmt } from "@/data/site";

/*
 * Results from scripts/benchmark.py: the release binary, run on the machine named
 * in the data. Nothing here is estimated or typed in by hand.
 */

const { logs, scale, system } = benchmarks;
const first = logs[0];
const largest = scale[scale.length - 1];
const SERIES = "#3a90ea";
const HEIGHT = 230;
const MARGIN = { top: 18, right: 18, bottom: 30, left: 46 };
const LINE_TICKS = [0, 25000, 50000, 75000, 100000];

const recorded = new Intl.DateTimeFormat("en-GB", { dateStyle: "long", timeZone: "UTC" }).format(new Date(benchmarks.recorded));
const ms = (value: number) => `${Math.round(value)} ms`;
const megabytes = (value: number) => `${value.toFixed(1)} MB`;
const share = (value: number) => `${value.toFixed(2)}%`;

const STATS = [
  [ms(first.ms), `to compress ${fmt(first.lines)} lines`],
  [megabytes(first.memoryMB), "peak memory on that log"],
  [share(first.memoryShare), `of ${system.memoryGB} GB system memory`],
  [`${benchmarks.binaryMB.toFixed(1)} MB`, "single binary"],
];

function LineChart({ title, unit, yTicks, value, label }: { title: string; unit: string; yTicks: number[]; value: (point: (typeof scale)[number]) => number; label: (n: number) => string }) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(520);
  const [active, setActive] = useState<number | null>(null);

  useEffect(() => {
    const node = box.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const plotWidth = Math.max(120, width - MARGIN.left - MARGIN.right);
  const plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom;
  const maxX = LINE_TICKS[LINE_TICKS.length - 1];
  const maxY = yTicks[yTicks.length - 1];
  const x = (lines: number) => MARGIN.left + (lines / maxX) * plotWidth;
  const y = (amount: number) => MARGIN.top + plotHeight - (amount / maxY) * plotHeight;
  const path = scale.map((point, i) => `${i ? "L" : "M"}${x(point.lines).toFixed(1)} ${y(value(point)).toFixed(1)}`).join(" ");
  const last = scale[scale.length - 1];
  const shown = active === null ? null : scale[active];

  const track = (event: PointerEvent<SVGSVGElement>) => {
    const left = event.currentTarget.getBoundingClientRect().left;
    const lines = ((event.clientX - left - MARGIN.left) / plotWidth) * maxX;
    let nearest = 0;
    scale.forEach((point, i) => {
      if (Math.abs(point.lines - lines) < Math.abs(scale[nearest].lines - lines)) nearest = i;
    });
    setActive(nearest);
  };

  return (
    <figure className="m-0 min-w-0 rounded-2xl border border-rule bg-panel p-4">
      <figcaption className="flex items-baseline justify-between gap-3">
        <span className="text-[15px]">{title}</span>
        <span className="font-mono text-[12px] text-dim">{unit}</span>
      </figcaption>
      <div ref={box} className="relative mt-3">
        <svg
          width={width}
          height={HEIGHT}
          viewBox={`0 0 ${width} ${HEIGHT}`}
          role="img"
          aria-label={`${title}: ${label(value(scale[0]))} at ${fmt(scale[0].lines)} lines, rising to ${label(value(last))} at ${fmt(last.lines)} lines`}
          className="block max-w-full touch-pan-y"
          onPointerMove={track}
          onPointerDown={track}
          onPointerLeave={() => setActive(null)}
        >
          {yTicks.map((tick) => (
            <g key={tick}>
              <line x1={MARGIN.left} x2={width - MARGIN.right} y1={y(tick)} y2={y(tick)} stroke="rgb(237 242 246 / 0.08)" />
              <text x={MARGIN.left - 8} y={y(tick) + 4} textAnchor="end" className="fill-dim font-mono text-[11px]">
                {tick}
              </text>
            </g>
          ))}
          {LINE_TICKS.map((tick) => (
            <text key={tick} x={x(tick)} y={HEIGHT - 8} textAnchor={tick === maxX ? "end" : tick ? "middle" : "start"} className="fill-dim font-mono text-[11px]">
              {tick ? `${tick / 1000}k` : "0"}
            </text>
          ))}
          {shown && <line x1={x(shown.lines)} x2={x(shown.lines)} y1={MARGIN.top} y2={MARGIN.top + plotHeight} stroke="rgb(237 242 246 / 0.28)" />}
          <path d={path} fill="none" stroke={SERIES} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          {scale.map((point, i) => (
            <circle key={point.lines} cx={x(point.lines)} cy={y(value(point))} r={active === i ? 5 : 4} fill={SERIES} stroke="#070c12" strokeWidth="2" />
          ))}
          <text x={x(last.lines)} y={y(value(last)) - 11} textAnchor="end" className="fill-snow font-mono text-[12px]">
            {label(value(last))}
          </text>
        </svg>
        {shown && (
          <div
            className="pointer-events-none absolute top-2 z-10 rounded-lg border border-rule bg-raise px-2.5 py-1.5 font-mono text-[11.5px] leading-[1.5] shadow-lg"
            style={{ left: Math.min(Math.max(0, x(shown.lines) - 62), width - 124), width: 124 }}
          >
            <div className="text-dim">{fmt(shown.lines)} lines</div>
            <div>{label(value(shown))}</div>
          </div>
        )}
      </div>
      <p className="mt-1 text-right text-[12px] text-dim">log lines</p>
    </figure>
  );
}

function Meter({ value, max }: { value: number; max: number }) {
  return (
    <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-snow/10" aria-hidden="true">
      <div className="h-full rounded-full" style={{ width: `${(100 * value) / max}%`, background: SERIES }} />
    </div>
  );
}

export function Benchmarks() {
  const slowest = Math.max(...logs.map((log) => log.ms));
  const heaviest = Math.max(...logs.map((log) => log.memoryMB));

  return (
    <div className="mt-8">
      <p className="max-w-[640px] text-[17px] leading-relaxed text-soft">
        The real release binary, measured on an {system.chip} with {system.cores} cores and {system.memoryGB} GB of memory. Even at {fmt(largest.lines)} lines it finished in {ms(largest.ms)} and used{" "}
        {share(largest.memoryShare)} of system memory.
      </p>

      <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-6 min-[901px]:grid-cols-4">
        {STATS.map(([amount, text]) => (
          <div key={text} className="flex flex-col-reverse">
            <dt className="mt-1 text-[14px] text-dim">{text}</dt>
            <dd className="font-display text-[27px] leading-[1.2] tracking-[-0.03em]">{amount}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-8 grid grid-cols-[minmax(0,1fr)] gap-4 min-[901px]:grid-cols-2">
        <LineChart title="Time as logs grow" unit="milliseconds" yTicks={[0, 200, 400, 600, 800]} value={(point) => point.ms} label={ms} />
        <LineChart title="Peak memory as logs grow" unit="MB" yTicks={[0, 40, 80, 120]} value={(point) => point.memoryMB} label={megabytes} />
      </div>

      <div className="mt-4 overflow-x-auto rounded-2xl border border-rule bg-panel">
        <table className="w-full min-w-[560px] border-collapse text-left text-[14px]">
          <caption className="px-4 pt-4 text-left text-[15px]">Each test log</caption>
          <thead>
            <tr className="border-b border-rule font-mono text-[12px] text-dim">
              <th scope="col" className="px-4 py-3 font-normal">log</th>
              <th scope="col" className="px-4 py-3 font-normal">lines</th>
              <th scope="col" className="px-4 py-3 font-normal">time</th>
              <th scope="col" className="px-4 py-3 font-normal">peak memory</th>
              <th scope="col" className="px-4 py-3 text-right font-normal">of system memory</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.key} className="border-b border-rule last:border-b-0">
                <th scope="row" className="px-4 py-3 font-normal">{log.label}</th>
                <td className="px-4 py-3 font-mono text-[13px] text-soft">{fmt(log.lines)}</td>
                <td className="w-[24%] px-4 py-3 font-mono text-[13px] text-soft">
                  {ms(log.ms)}
                  <Meter value={log.ms} max={slowest} />
                </td>
                <td className="w-[24%] px-4 py-3 font-mono text-[13px] text-soft">
                  {megabytes(log.memoryMB)}
                  <Meter value={log.memoryMB} max={heaviest} />
                </td>
                <td className="px-4 py-3 text-right font-mono text-[13px] text-soft">{share(log.memoryShare)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <details className="mt-3 text-[13.5px] text-dim">
        <summary className="cursor-pointer py-1">Growth numbers as a table</summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[420px] border-collapse text-left font-mono text-[12.5px]">
            <thead>
              <tr className="border-b border-rule">
                {["lines", "size", "time", "peak memory", "of system"].map((heading) => (
                  <th key={heading} scope="col" className="py-2 pr-4 font-normal">{heading}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {scale.map((point) => (
                <tr key={point.lines} className="border-b border-rule text-soft">
                  <td className="py-2 pr-4">{fmt(point.lines)}</td>
                  <td className="py-2 pr-4">{megabytes(point.sizeMB)}</td>
                  <td className="py-2 pr-4">{ms(point.ms)}</td>
                  <td className="py-2 pr-4">{megabytes(point.memoryMB)}</td>
                  <td className="py-2 pr-4">{share(point.memoryShare)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      <p className="mt-3 max-w-[760px] text-[13.5px] leading-relaxed text-dim">
        Measured {recorded} on {system.os} ({system.arch}) with other apps running. Each number is the median of {benchmarks.runs} runs, or {benchmarks.scaleRuns} for the growth charts, which repeat the Go test log. Memory is peak
        resident memory. Results will differ on other machines.
      </p>
    </div>
  );
}
