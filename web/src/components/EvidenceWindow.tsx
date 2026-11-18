"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { evidence, run, runStatus, runSummary } from "@/data/run";
import { fmt, tools } from "@/data/site";
import { LogOutput } from "./LogOutput";

/*
 * Replays the Claude Code session stored in evidence.json. Every word and number
 * shown here comes from that recording; only the pacing of the replay is added.
 */

const summary = runSummary.join("\n");
const answerWords = evidence.answer.split(" ");

const TYPED = evidence.prompt.length * 22;
const CALL = TYPED + 500;
const RESULT = CALL + 1300;
const ANSWER = RESULT + 700;
const END = ANSWER + answerWords.length * 55;

const STAGES = ["log", "комп", "answer"];
const recorded = new Intl.DateTimeFormat("en-GB", { dateStyle: "long", timeZone: "UTC" }).format(new Date(evidence.recorded));

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3.5 border-t border-rule py-2 text-[12.5px]">
      <dt className="text-dim">{label}</dt>
      <dd className="min-w-0 text-right font-mono [overflow-wrap:anywhere]">{value}</dd>
    </div>
  );
}

export function EvidenceWindow() {
  const [time, setTime] = useState(END);
  const root = useRef<HTMLDivElement>(null);
  const terminal = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const play = useCallback(() => {
    clearTimeout(timer.current);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setTime(END);
      return;
    }
    const start = performance.now();
    const tick = () => {
      const next = Math.min(performance.now() - start, END);
      setTime(next);
      if (next < END) timer.current = setTimeout(tick, 33);
    };
    tick();
  }, []);

  useEffect(() => {
    const node = root.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        observer.disconnect();
        play();
      },
      { threshold: 0.18 },
    );
    observer.observe(node);
    return () => {
      observer.disconnect();
      clearTimeout(timer.current);
    };
  }, [play]);

  useEffect(() => {
    const node = terminal.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [time]);

  const hasResult = time >= RESULT;
  const stage = time < RESULT ? 0 : time < ANSWER ? 1 : 2;
  const prompt = evidence.prompt.slice(0, Math.floor(time / 22));
  const words = Math.max(0, Math.ceil((time - ANSWER) / 55));

  return (
    <figure className="m-0">
      <div
        ref={root}
        className="relative flex flex-col overflow-hidden rounded-2xl border border-rule bg-panel shadow-[0_40px_110px_rgb(0_0_0/0.55)] min-[1180px]:block min-[1180px]:h-[770px]"
      >
        <div className="flex h-[46px] items-center gap-2 border-b border-rule px-2.5 sm:gap-3.5 sm:px-3.5">
          <div className="hidden gap-[7px] sm:flex" aria-hidden="true">
            {[0, 1, 2].map((dot) => (
              <span key={dot} className="h-[11px] w-[11px] rounded-full bg-snow/20" />
            ))}
          </div>
          <div className="flex min-w-0 flex-1 gap-0.5 text-[13px]" aria-hidden="true">
            {STAGES.map((label, i) => (
              <span key={label} className={`rounded-lg px-2 py-1 transition-colors sm:px-2.5 ${i === stage ? "bg-snow/10 text-snow" : "text-dim"}`}>
                {label}
              </span>
            ))}
          </div>
          <button
            type="button"
            onClick={play}
            disabled={time < END}
            className="min-h-[30px] shrink-0 rounded-lg border border-snow/20 px-2.5 text-[12px] transition hover:bg-snow/10 active:scale-[.97] disabled:cursor-default disabled:opacity-35"
          >
            replay
          </button>
        </div>

        <div className="order-2 min-[1180px]:grid min-[1180px]:h-[calc(100%-46px)] min-[1180px]:grid-cols-[180px_minmax(0,1fr)_214px]">
          <aside className="hidden border-r border-rule p-4 min-[1180px]:block">
            <p className="text-[12.5px] text-dim">log</p>
            <p className="mt-2 rounded-lg bg-snow/10 px-2.5 py-1.5 font-mono text-[12px]">{evidence.input.path}</p>
            <p className="mt-[26px] text-[12.5px] text-dim">комп tools</p>
            <ul className="mt-2 grid gap-[3px] font-mono text-[11.5px] text-dim">
              {tools.map((tool) => (
                <li
                  key={tool.name}
                  className={`truncate rounded-lg px-2.5 py-1.5 transition-colors ${tool.name === evidence.tool && time >= CALL ? "bg-ice/15 text-ice" : ""}`}
                >
                  {tool.name}
                </li>
              ))}
            </ul>
          </aside>

          <div className="h-[270px] min-w-0 overflow-hidden border-b border-rule min-[1180px]:h-auto min-[1180px]:border-b-0">
            <div className="flex h-[42px] items-center justify-between gap-3 border-b border-rule px-4 text-[13px]">
              <span>{hasResult ? "what Claude received" : evidence.input.path}</span>
              <span className="truncate font-mono text-[12px] text-dim">
                {hasResult ? `${run.linesOut} lines` : `first ${evidence.rawPreview.length} of ${fmt(evidence.rawLines)} lines`}
              </span>
            </div>
            <pre className="m-0 whitespace-pre-wrap px-4 py-[13px] font-mono text-[11.5px] leading-[1.55] text-dim [overflow-wrap:anywhere]">
              {hasResult ? <LogOutput text={summary} /> : evidence.rawPreview.join("\n")}
            </pre>
          </div>

          <aside className="p-4 min-[1180px]:border-l min-[1180px]:border-rule">
            <p className="text-[12.5px] text-dim">result</p>
            <p className="mt-1 font-display text-[38px] leading-[1.1] tracking-[-0.04em]">{hasResult ? run.saved : "…"}</p>
            <p className="text-[12.5px] text-dim">fewer tokens</p>
            <dl className="mt-3.5">
              <Row label="lines" value={hasResult ? `${fmt(run.linesIn)} → ${run.linesOut}` : fmt(run.linesIn)} />
              <Row label="tokens" value={hasResult ? `~${fmt(run.tokensIn)} → ~${run.tokensOut}` : `~${fmt(run.tokensIn)}`} />
              <Row label="network" value="denied" />
            </dl>
            <p className="mt-[22px] text-[12.5px] text-dim">recorded on</p>
            <dl className="mt-3.5">
              <Row label="system" value={evidence.system.replace(" · ", " ")} />
              <Row label="Claude Code" value={evidence.claudeCode} />
              <Row label="model" value={evidence.model} />
            </dl>
          </aside>
        </div>

        <div
          ref={terminal}
          className="no-scrollbar order-1 h-[330px] overflow-y-auto border-b border-rule bg-panel-2 p-4 font-mono text-[12.5px] leading-[1.58] min-[1180px]:absolute min-[1180px]:bottom-6 min-[1180px]:left-6 min-[1180px]:h-[310px] min-[1180px]:w-[440px] min-[1180px]:rounded-2xl min-[1180px]:border min-[1180px]:border-snow/15 min-[1180px]:shadow-[0_26px_70px_rgb(0_0_0/0.65)]"
        >
          <p>
            <span className="text-ice">❯ </span>
            {prompt}
            {time < TYPED && <span className="text-ice">▍</span>}
          </p>
          {time >= CALL && (
            <div className="mt-[13px]">
              <p>
                <span className="text-ice">● </span>komp - {evidence.tool} (MCP)
              </p>
              <p className="pl-4 text-dim">path: &quot;{evidence.input.path}&quot;</p>
              {hasResult ? (
                runStatus.map((line, i) => (
                  <p key={line} className="pl-4 text-dim">
                    {i === 0 ? "⎿ " : "  "}
                    {line}
                  </p>
                ))
              ) : (
                <p className="pl-4 text-dim">⎿ running…</p>
              )}
            </div>
          )}
          {time >= ANSWER && (
            <p className="mt-[13px]">
              <span className="text-ice">● </span>
              {answerWords.slice(0, words).join(" ")}
            </p>
          )}
          {time >= END && <p className="mt-[13px] text-ice">❯ ▍</p>}
        </div>
      </div>
      <figcaption className="mt-4 max-w-[680px] text-[13.5px] leading-relaxed text-dim">
        Recorded on {recorded} with a test log from the repository. комп ran with networking blocked by the macOS sandbox. The prompt, tool call,
        result and answer are unedited; only the typing is replayed.
      </figcaption>
    </figure>
  );
}
