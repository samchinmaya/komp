import { BlackHole } from "@/components/BlackHole";
import { TokenCard } from "@/components/TokenCard";
import { DitherBand } from "@/components/Texture";
import { GrainyGlow, GridLayer, Plus, Rail, Section } from "@/components/Blueprint";
import { CopyButton } from "@/components/CopyButton";
import { DemoViewer, type DemoTheme } from "@/components/DemoViewer";
import { Wordmark } from "@/components/Wordmark";
import { commands, faqs, features, formats, links, stats, statsNote, steps, tools, version } from "@/data/site";

const LINE = "border-white/[0.09]";
const MARK = "text-white/30";
const LABEL = "bg-ink text-faint";

const demoTheme: DemoTheme = {
  tab: "rounded-full border border-line px-3.5 py-1.5 text-sm text-muted hover:text-paper",
  tabActive: "rounded-full border border-paper bg-paper px-3.5 py-1.5 text-sm text-ink",
  about: "mb-4 text-[15px] text-muted",
  rawPane: "min-w-0 overflow-hidden rounded-xl border border-line bg-surface/80 backdrop-blur",
  rawHead: "flex items-baseline justify-between gap-3 border-b border-line px-4 py-3 text-[13px] font-semibold text-paper [&>span:last-child]:font-normal [&>span:last-child]:text-muted",
  rawText: "m-0 whitespace-pre px-4 py-3.5 font-mono text-xs leading-relaxed text-faint",
  outPane: "min-w-0 overflow-hidden rounded-xl border border-signal/40 bg-surface/80 shadow-[0_0_80px_-20px_rgba(62,224,143,0.35)] backdrop-blur",
  outHead: "flex items-baseline justify-between gap-3 border-b border-line px-4 py-3 text-[13px] font-semibold text-paper [&>span:last-child]:font-normal [&>span:last-child]:text-signal",
  outText: "m-0 px-4 py-3.5 font-mono text-xs leading-relaxed text-paper",
  meter: "relative h-2 flex-1 overflow-hidden rounded-full bg-surface-2",
  meterFill: "absolute inset-y-0 left-0 min-w-[3px] rounded-full bg-signal",
  meterText: "font-mono text-sm text-muted [&_b]:font-semibold [&_b]:text-signal",
};

function Kicker({ children }: { children: string }) {
  return <p className="mb-3 font-mono text-[13px] text-signal">{children}</p>;
}

export default function Home() {
  return (
    <div className="relative min-h-screen bg-ink text-paper selection:bg-signal/30">
      <GridLayer className="h-[1100px]" />
      <GrainyGlow
        className="inset-x-0 top-0 h-[900px]"
        blobs={[
          "radial-gradient(40% 35% at 50% 38%, rgba(62,224,143,0.22), transparent 70%)",
          "radial-gradient(30% 30% at 22% 20%, rgba(80,140,255,0.14), transparent 70%)",
          "radial-gradient(28% 28% at 80% 26%, rgba(62,224,143,0.10), transparent 70%)",
        ]}
        grainOpacity={0.4}
      />

      <Rail line={LINE}>
        {/* nav */}
        <header className={`sticky top-0 z-40 flex h-16 items-center justify-between border-b border-dashed ${LINE} bg-ink/70 px-4 backdrop-blur-md sm:px-6`}>
          <a href="#top" className="text-paper" aria-label="комп home">
            <Wordmark className="h-[22px] w-auto" disk="#3ee08f" />
          </a>
          <nav className="flex items-center gap-6 text-sm text-muted">
            <a href="#how" className="hidden hover:text-paper sm:inline">How it works</a>
            <a href="#demo" className="hidden hover:text-paper sm:inline">Demo</a>
            <a href="#install" className="hidden hover:text-paper sm:inline">Install</a>
            <a href={links.github} className="rounded-lg border border-line px-3 py-1.5 text-paper hover:border-muted">GitHub</a>
          </nav>
        </header>

        {/* hero */}
        <div id="top" className="relative grid items-center gap-14 px-4 pb-14 pt-16 sm:px-6 sm:pt-24 lg:grid-cols-[1.05fr_1fr]">
          <span className="absolute left-3 top-3 font-mono text-[10px] text-faint">[0,0]</span>
          <span className="absolute right-3 top-3 hidden font-mono text-[10px] text-faint sm:block">signal / noise</span>

          <div className="relative min-w-0 text-center lg:text-left">
            <span className="mb-7 inline-flex items-center gap-2 rounded-full border border-line bg-surface/70 px-3.5 py-1 font-mono text-xs text-muted backdrop-blur">
              <span className="size-2 rounded-full bg-signal shadow-[0_0_10px_2px_rgba(62,224,143,0.6)]" />
              <span><b className="font-medium text-signal">{version}</b> · open source<span className="hidden sm:inline"> · MCP server for Claude Code</span></span>
            </span>
            <h1 className="mx-auto mb-6 text-[clamp(44px,7vw,88px)] lg:mx-0 font-bold leading-[0.95] tracking-[-0.045em]">
              Logs in.
              <br />
              <span className="text-faint">Signal out.</span>
            </h1>
            <p className="mx-auto mb-9 max-w-[560px] lg:mx-0 text-[clamp(17px,2.2vw,20px)] leading-relaxed text-muted">
              комп turns thousands of Kubernetes and app log lines into a handful of meaningful ones. Claude reads{" "}
              <strong className="font-semibold text-paper">~300 tokens instead of ~76,000</strong>, and your logs{" "}
              <strong className="font-semibold text-paper">never leave your machine</strong>.
            </p>
            <div className="mx-auto mb-5 flex max-w-[600px] lg:mx-0 items-center gap-3 rounded-xl border border-line bg-surface/80 py-2.5 pl-5 pr-2.5 text-left backdrop-blur">
              <code className="no-scrollbar min-w-0 flex-1 overflow-x-auto whitespace-nowrap font-mono text-sm">
                <span className="select-none text-faint">$ </span>
                {commands.install}
              </code>
              <CopyButton text={commands.install} className="shrink-0 rounded-lg border border-line bg-surface-2 px-3 py-1.5 font-mono text-xs hover:border-muted" />
            </div>
            <div className="flex flex-wrap justify-center gap-3 lg:justify-start">
              <a href={links.github} className="rounded-xl bg-paper px-5 py-3 text-[15px] font-semibold text-ink hover:bg-white">View on GitHub</a>
              <a href={links.releases} className="rounded-xl border border-line bg-ink/40 px-5 py-3 text-[15px] font-semibold hover:border-muted">Download {version}</a>
            </div>
          </div>
          <div className="relative min-w-0 pt-6 lg:pt-0">
            <TokenCard theme="dark" />
          </div>
        </div>

        {/* stats */}
        <Section line={LINE} mark={MARK}>
          <dl className="grid grid-cols-2 lg:grid-cols-4">
            {stats.map((s, i) => (
              <div key={s.label} className={`border-dashed ${LINE} px-5 py-6 sm:px-6 ${i % 2 === 0 ? "border-r" : ""} ${i < 2 ? "border-b lg:border-b-0" : ""} ${i === 1 ? "lg:border-r" : ""}`}>
                <dt className="sr-only">{s.label}</dt>
                <dd className={`font-mono text-[clamp(22px,3vw,30px)] font-semibold tracking-tight ${i === 1 ? "text-signal" : ""}`}>{s.value}</dd>
                <dd className="mt-1 text-[13px] text-muted">{s.label}</dd>
              </div>
            ))}
          </dl>
          <p className={`border-t border-dashed ${LINE} px-5 py-3 font-mono text-[11px] text-faint sm:px-6`}>{statsNote}</p>
        </Section>

        {/* demo */}
        <Section id="demo" label="§ 01 — demo" line={LINE} mark={MARK} labelClass={LABEL} className="px-4 py-16 sm:px-6">
          <Kicker>{"// real output"}</Kicker>
          <h2 className="mb-3 text-[clamp(28px,4vw,40px)] font-semibold leading-tight tracking-[-0.025em]">Same logs. A fraction of the tokens.</h2>
          <p className="mb-8 max-w-[620px] text-[17px] text-muted">Real комп output on the test logs in the repo. Left: what you&apos;d paste into the chat. Right: what Claude reads instead.</p>
          <DemoViewer theme={demoTheme} />
        </Section>

        {/* how */}
        <Section id="how" label="§ 02 — how it works" line={LINE} mark={MARK} labelClass={LABEL} className="px-4 py-16 sm:px-6">
          <Kicker>{"// how it works"}</Kicker>
          <h2 className="mb-3 text-[clamp(28px,4vw,40px)] font-semibold leading-tight tracking-[-0.025em]">Pasting logs costs you before any tool can help.</h2>
          <p className="mb-10 max-w-[640px] text-[17px] text-muted">Claude reads everything you send it. So комп never takes logs through the chat: it reads them itself, on your laptop, and hands Claude only the summary.</p>
          <ol className={`grid border border-dashed ${LINE} md:grid-cols-3`}>
            {steps.map((s, i) => (
              <li key={s.title} className={`relative border-dashed ${LINE} p-6 ${i < 2 ? "border-b md:border-b-0 md:border-r" : ""}`}>
                <span className="mb-4 block font-mono text-sm text-signal">{String(i + 1).padStart(2, "0")}</span>
                <h3 className="mb-2 text-lg font-semibold">{s.title}</h3>
                <p className="text-[15px] leading-relaxed text-muted">{s.body}</p>
              </li>
            ))}
          </ol>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="flex items-center gap-5 rounded-xl border border-line bg-surface p-6">
              <span className="font-mono text-[clamp(26px,3.5vw,36px)] font-bold tracking-tight text-err">~76,000</span>
              <p className="text-[15px] text-muted">tokens to paste the 2,001-line Go outage log. Your context fills up fast.</p>
            </div>
            <div className="flex items-center gap-5 rounded-xl border border-signal/30 bg-surface p-6">
              <span className="font-mono text-[clamp(26px,3.5vw,36px)] font-bold tracking-tight text-signal">~312</span>
              <p className="text-[15px] text-muted">tokens for the комп summary. Claude still finds the outage, the retries and the 503s.</p>
            </div>
          </div>
        </Section>

        {/* features */}
        <Section label="§ 03 — what it keeps" line={LINE} mark={MARK} labelClass={LABEL} className="px-4 py-16 sm:px-6">
          <h2 className="mb-3 text-[clamp(28px,4vw,40px)] font-semibold leading-tight tracking-[-0.025em]">Shorter, without losing the plot.</h2>
          <p className="mb-10 max-w-[620px] text-[17px] text-muted">комп is lossy on purpose: it drops repetition, not meaning.</p>
          <div className={`grid border-l border-t border-dashed ${LINE} sm:grid-cols-2 lg:grid-cols-3`}>
            {features.map((f) => (
              <div key={f.title} className={`relative border-b border-r border-dashed ${LINE} p-6`}>
                <h3 className="mb-2 text-lg font-semibold">{f.title}</h3>
                <p className="mb-4 text-[15px] text-muted">{f.body}</p>
                <pre className="whitespace-pre-wrap break-words rounded-lg border border-line bg-ink p-3 font-mono text-xs text-muted">{f.example}</pre>
              </div>
            ))}
          </div>
          <div className="mt-8 flex flex-wrap gap-2">
            {formats.map((f) => (
              <span key={f} className="rounded-full border border-line bg-surface px-3 py-1 font-mono text-xs">{f}</span>
            ))}
          </div>
        </Section>

        {/* tools */}
        <Section label="§ 04 — mcp tools" line={LINE} mark={MARK} labelClass={LABEL} className="px-4 py-16 sm:px-6">
          <h2 className="mb-8 text-[clamp(28px,4vw,40px)] font-semibold leading-tight tracking-[-0.025em]">Three tools Claude can call.</h2>
          <div className={`divide-y divide-dashed divide-white/[0.09] border border-dashed ${LINE}`}>
            {tools.map((t) => (
              <div key={t.name} className="grid gap-1 p-5 md:grid-cols-[240px_1fr_1.2fr] md:gap-4">
                <code className="font-mono text-sm text-signal">{t.name}</code>
                <span className="font-mono text-[13px] text-muted">{t.args}</span>
                <span className="text-[15px] text-muted">{t.source}</span>
              </div>
            ))}
          </div>
        </Section>

        {/* install */}
        <Section id="install" label="§ 05 — install" line={LINE} mark={MARK} labelClass={LABEL} className="px-4 py-16 sm:px-6">
          <h2 className="mb-8 text-[clamp(28px,4vw,40px)] font-semibold leading-tight tracking-[-0.025em]">Two commands.</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {[
              { n: "1", title: "Install комп", cmd: commands.install, note: "Checks the SHA-256 and installs to ~/.local/bin. Windows: download the .zip from Releases." },
              { n: "2", title: "Connect to Claude Code", cmd: commands.connect, note: "Teams can commit a .mcp.json instead." },
            ].map((c) => (
              <div key={c.n} className="rounded-xl border border-line bg-surface p-6">
                <h3 className="mb-4 flex items-center gap-3 text-lg font-semibold">
                  <span className="rounded-md bg-signal/10 px-2 py-0.5 font-mono text-xs text-signal">{c.n}</span>
                  {c.title}
                </h3>
                <div className="relative">
                  <pre className="whitespace-pre-wrap break-all rounded-lg border border-line bg-ink py-3 pl-3.5 pr-20 font-mono text-[13px]">{c.cmd}</pre>
                  <CopyButton text={c.cmd} className="absolute right-2 top-2 rounded-md border border-line bg-surface-2 px-2.5 py-1 font-mono text-xs hover:border-muted" />
                </div>
                <p className="mt-3 text-sm text-muted">{c.note}</p>
              </div>
            ))}
          </div>
        </Section>

        {/* faq */}
        <Section label="§ 06 — faq" line={LINE} mark={MARK} labelClass={LABEL} className="px-4 py-16 sm:px-6">
          <div className="max-w-[780px]">
            {faqs.map((f) => (
              <details key={f.q} className={`group border-b border-dashed ${LINE} py-5`}>
                <summary className="flex cursor-pointer list-none justify-between gap-4 text-[17px] font-semibold [&::-webkit-details-marker]:hidden">
                  {f.q}
                  <span className="font-mono text-faint group-open:rotate-45 transition-transform">+</span>
                </summary>
                <p className="mt-2 text-muted">{f.a}</p>
              </details>
            ))}
          </div>
        </Section>

        {/* closing */}
        <Section line={LINE} mark={MARK} className="relative overflow-hidden px-4 py-24 text-center sm:px-6">
          <BlackHole color="signal" className="mx-auto mb-10 w-full max-w-[560px] opacity-80" />
          <h2 className="mb-4 text-[clamp(28px,4vw,44px)] font-semibold tracking-[-0.03em]">Stop paying to read the same line 400 times.</h2>
          <p className="mb-8 text-muted">Install комп, copy your logs, and ask Claude what&apos;s wrong.</p>
          <a href={links.github} className="inline-block rounded-xl bg-paper px-5 py-3 font-semibold text-ink hover:bg-white">Get комп</a>
        </Section>

        <DitherBand flip />
        <footer className={`relative flex flex-wrap justify-between gap-4 border-t border-dashed ${LINE} px-4 py-8 pb-24 text-sm text-faint sm:px-6`}>
          <Plus className={MARK} style={{ left: 0, top: 0 }} />
          <Plus className={MARK} style={{ left: "100%", top: 0 }} />
          <span>комп · MIT · by <a href={links.author} className="text-muted hover:text-paper">samchinmaya</a></span>
          <nav className="flex gap-5">
            <a href={links.github} className="hover:text-paper">GitHub</a>
            <a href={links.releases} className="hover:text-paper">Releases</a>
            <a href={links.readme} className="hover:text-paper">Docs</a>
          </nav>
        </footer>
      </Rail>

    </div>
  );
}
