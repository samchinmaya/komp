import type { ReactNode } from "react";
import { CopyButton } from "@/components/CopyButton";
import { DemoViewer } from "@/components/DemoViewer";
import { EvidenceWindow } from "@/components/EvidenceWindow";
import { HeroFunnel } from "@/components/HeroFunnel";
import { AnimatedWordmark } from "@/components/manual/AnimatedWordmark";
import { Wordmark } from "@/components/Wordmark";
import { run } from "@/data/run";
import { commands, features, fmt, links, tools, version } from "@/data/site";

/*
 * One statement above one large product window: the recorded Claude Code run.
 * Near-black ground, lowercase Comfortaa headlines over Geist, and the only
 * colour comes from the logs themselves.
 */

const BUTTON = "inline-flex min-h-11 items-center justify-center rounded-lg text-[15px] transition duration-150 hover:-translate-y-px active:scale-[.98]";
const SECTION = "scroll-mt-8 pt-[88px] min-[901px]:pt-32";
const SPLIT = `${SECTION} grid grid-cols-[minmax(0,1fr)] items-center gap-8 min-[901px]:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] min-[901px]:gap-16`;
const COPY = "mt-[18px] max-w-[520px] text-[17px] leading-relaxed text-soft";

const FACTS = [
  [run.saved, "fewer tokens in this run"],
  ["0", "network calls"],
  ["3 systems", "macOS, Linux, Windows"],
  ["MIT", "free and open source"],
];

const NAV = [
  ["connect", "#connect"],
  ["compare", "#compare"],
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

function TextLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} className="transition-colors hover:text-snow">
      {children}
    </a>
  );
}

export default function Home() {
  return (
    <div className="mx-auto w-full max-w-[1220px] px-5 selection:bg-white selection:text-[#081018]">
      <header className="relative z-10 flex h-[76px] items-center justify-between gap-5">
        <AnimatedWordmark disk="#a9b9c8" className="h-[27px] text-snow" />
        <nav aria-label="Main" className="hidden gap-[30px] text-[15px] text-soft min-[901px]:flex">
          {NAV.map(([label, href]) => (
            <TextLink key={href} href={href}>
              {label}
            </TextLink>
          ))}
        </nav>
        <a href={links.github} className="text-[15px]">
          GitHub
        </a>
      </header>

      <main>
        <section className="relative flex flex-col pt-[34px] min-[901px]:block min-[901px]:pt-[70px]">
          <HeroFunnel className="pointer-events-none relative order-2 block h-28 w-full min-[901px]:absolute min-[901px]:-top-[76px] min-[901px]:right-0 min-[901px]:h-[calc(100%+76px)] min-[901px]:w-[52%]" />
          <div className="relative max-w-[720px] pb-[18px] min-[901px]:pb-16">
            <h1 className="rise text-balance font-display text-[clamp(40px,4.7vw,62px)] font-normal leading-[1.1] tracking-[-0.045em]">
              logs in, signal out
              <span className="block text-dim">the log compressor for debugging with Claude</span>
            </h1>
            <p className="rise mt-[26px] max-w-[560px] text-[18px] leading-normal text-soft [animation-delay:80ms] min-[901px]:text-[19px]">
              комп turns {fmt(run.linesIn)} log lines into {run.linesOut} on your machine, so Claude reads about {run.tokensOut} tokens instead of {fmt(run.tokensIn)}.
            </p>
            <div className="rise mt-8 flex flex-wrap items-center gap-4 [animation-delay:160ms]">
              <a href="#install" className={`${BUTTON} w-full bg-snow px-[17px] font-medium text-[#081018] hover:bg-white sm:w-auto`}>
                install комп
              </a>
              <a href={links.github} className={`${BUTTON} w-full px-1.5 text-soft hover:text-snow sm:w-auto`}>
                view on GitHub →
              </a>
            </div>
          </div>
        </section>

        <section aria-label="A recorded Claude Code run using комп" className="stage relative">
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

        <section id="compare" className={SECTION}>
          <Heading first="thousands of lines in" second="a few lines out" />
          <DemoViewer />
        </section>

        <section id="keeps" className={SECTION}>
          <Heading first="less to read" second="the facts stay" />
          <div className="mt-[52px] grid grid-cols-[minmax(0,1fr)] gap-8 min-[561px]:grid-cols-2 min-[561px]:gap-x-10 min-[561px]:gap-y-11 min-[901px]:grid-cols-3">
            {features.map((feature) => (
              <article key={feature.title}>
                <h3 className="font-display text-[19px] font-normal leading-[1.3] tracking-[-0.025em]">{feature.title}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-soft">{feature.body}</p>
                <pre className="mt-3.5 whitespace-pre-wrap border-t border-rule pt-3 font-mono text-[11.5px] leading-[1.55] text-dim [overflow-wrap:anywhere]">{feature.example}</pre>
              </article>
            ))}
          </div>
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
              <Step name="комп" detail={`${fmt(run.linesIn)} lines → ${run.linesOut}`} lit />
            </div>
            <div className="mt-2.5 flex flex-col gap-0.5 rounded-2xl border border-rule px-[18px] py-3.5 text-[15px] sm:flex-row sm:justify-between sm:gap-4">
              Claude
              <span className="font-mono text-[12px] leading-[1.7] text-dim sm:text-right">receives only the summary</span>
            </div>
          </div>
        </section>

        <section id="install" className="install-panel mt-[92px] scroll-mt-8 rounded-2xl border border-rule p-[clamp(24px,6vw,76px)] min-[901px]:mt-[136px]">
          <Heading first="stop pasting logs" second="into Claude" large />
          <Command text={commands.install} className="mt-[34px] max-w-[760px] bg-night" />
          <Command text={commands.connect} className="mt-2.5 max-w-[760px] bg-night" />
        </section>
      </main>

      <footer className="flex flex-wrap items-center justify-between gap-x-7 gap-y-4 pb-[34px] pt-11 text-[14px] text-dim">
        <div className="flex items-center gap-[22px]">
          <Wordmark disk="#a9b9c8" className="h-[21px] w-auto text-snow" />
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
