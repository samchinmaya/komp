import { CopyButton } from "@/components/CopyButton";
import { DemoViewer, type DemoTheme } from "@/components/DemoViewer";
import type { Palette } from "@/components/LogOutput";
import { AnimatedWordmark } from "@/components/manual/AnimatedWordmark";
import { DitherPlate } from "@/components/manual/Grainient";
import { RouteDiagram } from "@/components/manual/RouteDiagram";
import { commands, faqs, features, links, version } from "@/data/site";

/*
 * A minimal page on a full-page dark gradient (see SiteBackground): Comfortaa
 * headlines over Geist, white and grey text only, few words. Long text sits
 * on dark sheets so it stays readable where the gradient is bright.
 */

const INK = "text-[#edf2f6]";
const MUTED = "text-[#b8c5d1]";
const SECTION = "sheet mt-20 p-6 sm:p-10";

const darkPalette: Palette = {
  text: "text-[#edf2f6]",
  header: "text-[#edf2f6]",
  time: "text-[#a9b9c8]",
  error: "text-[#ff7b72] font-semibold",
  warn: "text-[#f5b83d] font-semibold",
  info: "text-[#a9b8c6]",
  slot: "text-[#9fd8ff]",
  count: "text-[#edf2f6] font-semibold",
  trace: "text-[#a9b9c8]",
};

const paneHead =
  "flex items-baseline justify-between gap-3 border-b border-white/10 px-4 py-2.5 text-[13px] text-[#edf2f6] [&>span:last-child]:text-[12px] [&>span:last-child]:text-[#a9b9c8]";

const demoTheme: DemoTheme = {
  tab: "border-b border-transparent py-1 text-[13px] text-[#a9b9c8] hover:text-[#edf2f6] mr-4",
  tabActive: "border-b border-white/60 py-1 text-[13px] text-[#edf2f6] mr-4",
  about: "mb-4 text-[15px] text-[#b8c5d1]",
  rawPane: "min-w-0 bg-[#0a1118]",
  rawHead: paneHead,
  rawText: "m-0 whitespace-pre-wrap break-words px-4 py-3.5 font-mono text-xs leading-relaxed text-[#a9b9c8]",
  outPane: "min-w-0 bg-[#0a1118]",
  outHead: paneHead,
  outText: "m-0 px-4 py-3.5 font-mono text-xs leading-relaxed text-[#edf2f6]",
  meter: "relative h-1 flex-1 overflow-hidden bg-white/10",
  meterFill: "absolute inset-y-0 left-0 min-w-[3px] bg-[#edf2f6]",
  meterText: "text-sm tabular-nums text-[#b8c5d1] [&_b]:font-semibold [&_b]:text-[#edf2f6]",
  palette: darkPalette,
};

function SectionHead({ title, kicker }: { title: string; kicker: string }) {
  return (
    <div className="mb-8">
      <h2 className="font-display text-[clamp(27px,3.2vw,40px)] font-normal leading-[1.15] tracking-[-0.03em]">{title}</h2>
      <p className={`mt-2 text-[16px] leading-relaxed ${MUTED}`}>{kicker}</p>
    </div>
  );
}

export default function Home() {
  return (
    <div className={`min-h-screen ${INK} selection:bg-white selection:text-[#081018]`}>
      <div className="mx-auto max-w-[1120px] px-4 sm:px-8">
        <header className="flex items-center justify-between gap-4 py-5 text-[14px]">
          <AnimatedWordmark disk="#a9b9c8" className="h-7 text-[#edf2f6]" />
          <nav className="flex gap-6">
            <a href="#install" className="hover:underline">Install</a>
            <a href={links.github} className="hover:underline">GitHub</a>
          </nav>
        </header>

        <section className="py-20 md:py-28">
          <div className="hero-copy min-w-0 max-w-[720px]">
            <h1 className="font-display text-[clamp(44px,7vw,96px)] font-normal leading-[1.08] tracking-[-0.05em]">
              <span className="text-[#a9b9c8]">Logs in.</span>
              <br />
              Signal out.
            </h1>
            <p className={`mt-8 max-w-[46ch] text-[18px] leading-relaxed ${MUTED}`}>
              комп turns Kubernetes and app logs into a few lines, so Claude reads ~312 tokens instead of ~75,958. Nothing leaves your machine.
            </p>
            <div className="mt-8 flex max-w-[620px] items-center gap-3 bg-[#0a1118] py-2 pl-4 pr-2">
              <code className="no-scrollbar min-w-0 flex-1 overflow-x-auto whitespace-nowrap font-mono text-[13px]">{commands.install}</code>
              <CopyButton text={commands.install} className="shrink-0 bg-[#edf2f6] px-3 py-1.5 text-[12px] text-[#081018] hover:bg-white" />
            </div>
            <p className="mt-4 text-[13px] text-[#b8c5d1]">{version} · macOS, Linux, Windows · MIT</p>
          </div>
        </section>

        <div className="sheet p-6 sm:p-10">
          <dl className="grid gap-8 sm:grid-cols-3">
            {[
              ["2,001 → 11", "log lines"],
              ["99.6%", "fewer tokens"],
              ["0", "network calls"],
            ].map(([value, label]) => (
              <div key={label}>
                <dd className="whitespace-nowrap font-display text-[clamp(26px,3vw,36px)] leading-tight tracking-[-0.03em] tabular-nums">{value}</dd>
                <dt className={`mt-1 text-[14px] ${MUTED}`}>{label}</dt>
              </div>
            ))}
          </dl>
          <p className="mt-8 text-[12px] text-[#a9b9c8]">From the Go outage test log in the repository. Tokens are estimated.</p>
        </div>

        <section className={SECTION}>
          <SectionHead title="How it works" kicker="Logs go in. Repetition falls away. One summary comes out." />
          <DemoViewer theme={demoTheme} rawHeight="h-[420px]" />
        </section>

        <section className={SECTION}>
          <SectionHead title="Your logs stay local" kicker="Only the summary reaches Claude." />
          <RouteDiagram />
        </section>

        <section className={SECTION}>
          <SectionHead title="What it keeps" kicker="It drops repetition, not meaning." />
          <ul className="grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <li key={f.title}>
                <h3 className="font-display text-[17px] font-semibold leading-snug tracking-[-0.02em]">{f.title}</h3>
                <p className={`mt-2 text-[15px] leading-relaxed ${MUTED}`}>{f.body}</p>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section id="install" className="relative mt-20 scroll-mt-6 overflow-hidden">
        <DitherPlate className="absolute inset-0 opacity-20 brightness-200 grayscale" />
        <div className="relative mx-auto max-w-[1120px] px-4 py-16 sm:px-8 sm:py-20">
          <div className="max-w-[680px] bg-[#070c12]/90 p-6 sm:p-10">
            <h2 className="font-display text-[clamp(27px,3.2vw,40px)] font-normal leading-[1.15] tracking-[-0.03em]">Install</h2>
            {[
              ["Get комп", commands.install],
              ["Connect it to Claude Code", commands.connect],
            ].map(([label, cmd]) => (
              <div key={label} className="mt-6">
                <p className="mb-2 text-[15px]">{label}</p>
                <div className="relative">
                  <pre className="whitespace-pre-wrap break-all bg-[#0a1118] py-3 pl-3.5 pr-20 font-mono text-[13px]">{cmd}</pre>
                  <CopyButton text={cmd} className="absolute right-2 top-2 bg-[#edf2f6] px-2.5 py-1 text-[12px] text-[#081018] hover:bg-white" />
                </div>
              </div>
            ))}
            <p className={`mt-6 text-[15px] ${MUTED}`}>Then copy some logs and ask Claude what&apos;s wrong.</p>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-[1120px] px-4 sm:px-8">
        <section className={SECTION}>
          <h2 className="mb-8 font-display text-[clamp(27px,3.2vw,40px)] font-normal leading-[1.15] tracking-[-0.03em]">Questions</h2>
          <dl className="grid gap-x-10 gap-y-8 md:grid-cols-2">
            {faqs.map((f) => (
              <div key={f.q}>
                <dt className="font-display text-[17px] font-semibold leading-snug tracking-[-0.015em]">{f.q}</dt>
                <dd className={`mt-2 text-[15px] leading-relaxed ${MUTED}`}>{f.a}</dd>
              </div>
            ))}
          </dl>
        </section>

        <footer className="sheet mb-8 mt-20 flex flex-wrap justify-between gap-3 px-6 py-5 text-[13px] text-[#b8c5d1] sm:px-10">
          <span>комп {version} · MIT</span>
          <span className="flex gap-6">
            <a href={links.author} className="hover:underline">samchinmaya</a>
            <a href={links.github} className="hover:underline">GitHub</a>
          </span>
        </footer>
      </div>
    </div>
  );
}
