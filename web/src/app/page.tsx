import type { ReactNode } from "react";
import { CopyButton } from "@/components/CopyButton";
import { Benchmarks } from "@/components/Benchmarks";
import { Comparison } from "@/components/Comparison";
import { DemoViewer } from "@/components/DemoViewer";
import { EvidenceWindow } from "@/components/EvidenceWindow";
import { FocusText } from "@/components/FocusText";
import { HeroVoxels } from "@/components/HeroVoxels";
import { HoverIndex } from "@/components/HoverIndex";
import { OrbProcess } from "@/components/OrbProcess";
import { run } from "@/data/run";
import { commands, demos, fmt, links, saving, tools, version } from "@/data/site";

/*
 * One statement above one large product window: the recorded Claude Code run.
 * Near-black ground, lowercase Comfortaa headlines over Geist, and the only
 * colour comes from the logs themselves.
 */

const BUTTON = "inline-flex min-h-11 items-center justify-center rounded-lg text-[15px] transition duration-150 hover:-translate-y-px active:scale-[.98]";
const SECTION = "measure mt-[88px] scroll-mt-8 pt-[88px] min-[901px]:mt-24 min-[901px]:pt-24";
const SPLIT = `${SECTION} grid grid-cols-[minmax(0,1fr)] items-center gap-8 min-[901px]:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] min-[901px]:gap-16`;
const COPY = "mt-[18px] max-w-[520px] text-[17px] leading-relaxed text-soft";

const FACTS = [
  [run.saved, "fewer tokens in this run"],
  ["0", "network calls"],
  ["3 systems", "macOS, Linux, Windows"],
  ["MIT", "free and open source"],
];

const GO_LOG = demos[0];

const TOKENS_STORY =
  "Every log line you paste uses Claude’s tokens and context, and most lines repeat. комп merges them first, so Claude gets the patterns, counts, time ranges and error values without reading the same line hundreds of times.";

const TOTAL_RAW = demos.reduce((sum, demo) => sum + demo.rawTokens, 0);
const TOTAL_OUT = demos.reduce((sum, demo) => sum + demo.outTokens, 0);

const NAV = [
  ["tokens", "#tokens"],
  ["benchmarks", "#benchmarks"],
  ["connect", "#connect"],
  ["compare", "#compare"],
  ["vs others", "#alternatives"],
  ["what it keeps", "#keeps"],
  ["privacy", "#local"],
];

function Heading({ first, second, large = false }: { first: string; second: string; large?: boolean }) {
  return (
    <h2 className={`text-balance font-display font-normal leading-[1.12] tracking-[-0.045em] ${large ? "text-[clamp(36px,5.2vw,68px)]" : "text-[clamp(32px,4vw,52px)]"}`}>
      {first}
      <span className="block text-dim">{second}</span>
    </h2>
  );
}

function Command({ text, className = "" }: { text: string; className?: string }) {
  return (
    <div className={`flex min-h-[58px] items-center gap-3 rounded-2xl border border-rule py-2 pl-4 pr-2 ${className}`}>
      <code className="no-scrollbar min-w-0 flex-1 overflow-x-auto whitespace-nowrap font-mono text-[13px]">{text}</code>
      <CopyButton text={text} className="min-h-[38px] min-w-[58px] shrink-0 rounded-lg bg-snow px-3 text-[13px] lowercase text-[#081018] transition hover:bg-white active:scale-[.97]" />
    </div>
  );
}

function Step({ name, detail, lit = false }: { name: string; detail: string; lit?: boolean }) {
  return (
    <div className={`flex flex-col gap-0.5 rounded-xl px-4 py-3.5 text-[15px] sm:flex-row sm:justify-between sm:gap-4 ${lit ? "bg-snow text-[#081018]" : "bg-raise"}`}>
      {name}
      <span className={`font-mono text-[12px] leading-[1.7] sm:text-right ${lit ? "text-[#31475a]" : "text-dim"}`}>{detail}</span>
    </div>
  );
}

function GitHubMark() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="size-[22px] fill-current">
      <path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z" />
    </svg>
  );
}

function TextLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} className="transition-colors hover:text-snow">
      {children}
    </a>
  );
}

export default function Home() {
  return (
    <div className="page-frame mx-auto w-full max-w-[1220px] px-5 selection:bg-white selection:text-[#081018]">
      <header className="relative z-10 flex h-[76px] items-center justify-between gap-5">
        <span className="text-[28px] font-bold leading-none text-snow">комп</span>
        <nav aria-label="Main" className="hidden gap-[30px] text-[15px] text-soft min-[901px]:flex">
          {NAV.map(([label, href]) => (
            <TextLink key={href} href={href}>
              {label}
            </TextLink>
          ))}
        </nav>
        <a href={links.github} aria-label="комп on GitHub" className="-mr-2.5 inline-flex size-11 items-center justify-center text-soft transition-colors hover:text-snow">
          <GitHubMark />
        </a>
      </header>

      <main>
        <section className="measure relative flex flex-col pt-[34px] min-[901px]:block min-[901px]:pt-[70px]">
          <HeroVoxels className="pointer-events-none relative order-2 block h-64 w-full min-[901px]:absolute min-[901px]:-top-[76px] min-[901px]:right-0 min-[901px]:h-[calc(100%+76px)] min-[901px]:w-[52%]" />
          <div className="relative max-w-[720px] pb-[18px] min-[901px]:max-w-[60%] min-[901px]:pb-16">
            <h1 className="rise text-balance font-display text-[clamp(40px,4.7vw,62px)] font-normal leading-[1.1] tracking-[-0.045em]">
              logs in, signal out
              <span className="block text-dim">cut Claude&rsquo;s log tokens by {saving(GO_LOG)}%</span>
            </h1>
            <p className="rise mt-[26px] max-w-[560px] text-[18px] leading-normal text-soft [animation-delay:80ms] min-[901px]:text-[19px]">
              комп turns {fmt(GO_LOG.rawLines)} log lines into about {GO_LOG.outTokens} tokens, on your machine.
            </p>
            <div className="rise mt-8 flex flex-wrap items-center gap-4 [animation-delay:160ms]">
              <a href="#install" className={`${BUTTON} w-full bg-snow px-[17px] font-medium text-[#081018] hover:bg-white sm:w-auto`}>
                install
              </a>
              <a href={links.github} className={`${BUTTON} w-full px-1.5 text-soft hover:text-snow sm:w-auto`}>
                view on GitHub →
              </a>
            </div>
          </div>
        </section>

        <section aria-label="A recorded Claude Code run using комп" className="relative">
          <EvidenceWindow />
        </section>

        <dl className="mt-16 grid grid-cols-2 gap-6 border-y border-rule py-7 min-[901px]:grid-cols-4">
          {FACTS.map(([value, label]) => (
            <div key={label} className="flex flex-col-reverse">
              <dt className="mt-1 text-[14px] text-dim">{label}</dt>
              <dd className="font-display text-[25px] leading-[1.2] tracking-[-0.03em]">{value}</dd>
            </div>
          ))}
        </dl>

        <FocusText text={TOKENS_STORY} />

        <section id="tokens" className={SPLIT}>
          <div>
            <Heading first="spend tokens on the fix" second="not on repeated logs" />
            <p className="mt-[18px] max-w-[520px] text-[13.5px] leading-relaxed text-dim">Measured on the four test logs in the repository. Tokens are estimated at about 4 characters each.</p>
          </div>
          <div>
            <ul className="border-b border-rule">
              {demos.map((demo) => (
                <li key={demo.key} className="border-t border-rule py-3.5">
                  <div className="flex items-baseline justify-between gap-4 text-[14.5px]">
                    <span className="min-w-0">{demo.label}</span>
                    <span className="shrink-0 font-mono text-[13px] text-ice">{saving(demo)}% fewer</span>
                  </div>
                  <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-snow/10" aria-hidden="true">
                    <div className="h-full min-w-1 rounded-full bg-snow" style={{ width: `${(100 * demo.outTokens) / demo.rawTokens}%` }} />
                  </div>
                  <p className="mt-2 font-mono text-[12px] text-dim">
                    ~{fmt(demo.rawTokens)} → ~{fmt(demo.outTokens)} tokens
                  </p>
                </li>
              ))}
            </ul>
            <p className="mt-4 flex flex-wrap justify-between gap-x-4 gap-y-1 text-[14.5px]">
              <span>all four logs</span>
              <span className="font-mono text-[13px] text-soft">
                ~{fmt(TOTAL_RAW)} → ~{fmt(TOTAL_OUT)} tokens
              </span>
            </p>
          </div>
        </section>

        <section id="benchmarks" className={SECTION}>
          <Heading first="fast on your machine" second="light on memory" />
          <Benchmarks />
        </section>

        <section id="connect" className={SPLIT}>
          <div>
            <Heading first="one command" second="then just ask" />
            <p className={COPY}>Add комп to Claude Code once. Copy some logs and ask what went wrong. Claude reads the summary, so the raw logs never enter the chat.</p>
          </div>
          <div>
            <Command text={commands.connect} className="bg-panel" />
            <ul className="mt-[18px] border-b border-rule">
              {tools.map((tool) => (
                <li key={tool.name} className="flex flex-col gap-0.5 border-t border-rule px-0.5 py-[13px] text-[14px] sm:flex-row sm:justify-between sm:gap-5">
                  <code className="font-mono text-[13px]">{tool.name}</code>
                  <span className="text-dim sm:text-right">{tool.source}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="how" className={SECTION}>
          <OrbProcess heading={<Heading first="five steps" second="all on your machine" />} />
        </section>

        <section id="compare" className={SECTION}>
          <Heading first="thousands of lines in" second="a few lines out" />
          <DemoViewer />
        </section>

        <section id="alternatives" className={SECTION}>
          <Heading first="cheaper than tail" second="without losing the facts" />
          <Comparison />
        </section>

        <section id="keeps" className={`${SECTION} px-3 min-[561px]:px-8 min-[901px]:px-14`}>
          <Heading first="less to read" second="the facts stay" />
          <HoverIndex />
        </section>

        <section id="local" className={SPLIT}>
          <div>
            <Heading first="your logs stay" second="on your machine" />
            <p className={COPY}>комп makes no network requests. It checks your logs locally and removes secrets and personal data before Claude gets the summary.</p>
          </div>
          <div>
            <div className="grid gap-2.5 rounded-2xl border border-dashed border-snow/20 p-[18px]">
              <p className="font-mono text-[12px] text-dim">your machine</p>
              <Step name="Your logs" detail="clipboard, file or kubectl" />
              <Step name="Privacy check" detail="secrets and personal data removed" />
              <Step name="комп" detail={`${fmt(GO_LOG.rawLines)} lines → ${GO_LOG.outLines}`} lit />
            </div>
            <div className="mt-2.5 flex flex-col gap-0.5 rounded-2xl border border-rule px-[18px] py-3.5 text-[15px] sm:flex-row sm:justify-between sm:gap-4">
              Claude
              <span className="font-mono text-[12px] leading-[1.7] text-dim sm:text-right">receives only the summary</span>
            </div>
          </div>
        </section>

        <section id="install" className={SECTION}>
          <Heading first="stop pasting logs" second="into harness" large />
          <Command text={commands.install} className="mt-[34px] max-w-[760px] bg-black" />
          <Command text={commands.connect} className="mt-2.5 max-w-[760px] bg-black" />
        </section>
      </main>

      <footer className="measure mt-20 flex flex-wrap items-center justify-between gap-x-7 gap-y-4 pb-[34px] pt-11 text-[14px] text-dim">
        <div className="flex items-center gap-[22px]">
          <span className="text-[21px] font-bold leading-none text-snow">комп</span>
          <span>{version} · MIT</span>
        </div>
        <div className="flex gap-[22px]">
          <TextLink href={links.github}>GitHub</TextLink>
          <TextLink href={links.releases}>Releases</TextLink>
          <TextLink href={links.issues}>Issues</TextLink>
        </div>
      </footer>
    </div>
  );
}
