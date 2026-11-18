import { CopyButton } from "@/components/CopyButton";
import { DemoViewer, type DemoTheme } from "@/components/DemoViewer";
import type { Palette } from "@/components/LogOutput";
import { AnimatedWordmark } from "@/components/manual/AnimatedWordmark";
import { DitherPlate, GrainPlate } from "@/components/manual/Grainient";
import { Machine } from "@/components/manual/Machine";
import { RouteDiagram } from "@/components/manual/RouteDiagram";
import { commands, faqs, features, formats, links, tools, version } from "@/data/site";

/*
 * Design D — "The комп manual". A printed technical manual: warm paper, ink
 * hairlines, square corners, one accent (deep signal green), serif display
 * type over Geist. No glass, no glows; gradients only as printed plates.
 */

const INK = "text-[#1a1c1f]";
const MUTED = "text-[#5d594f]";
const RULE = "border-[#1a1c1f]/20";

const paperPalette: Palette = {
  text: "text-[#1a1c1f]",
  header: "text-[#0f7a47]",
  time: "text-[#8a8578]",
  error: "text-[#b3261e] font-semibold",
  warn: "text-[#9a6200] font-semibold",
  info: "text-[#6b6759]",
  slot: "text-[#2f5fa8]",
  count: "text-[#0f7a47] font-semibold",
  trace: "text-[#8a8578]",
};

const demoTheme: DemoTheme = {
  tab: "border-b border-transparent py-1 font-mono text-[12px] text-[#8a8578] hover:text-[#1a1c1f] mr-4",
  tabActive: "border-b border-[#1a1c1f] py-1 font-mono text-[12px] text-[#1a1c1f] mr-4",
  about: "mb-4 text-[15px] text-[#5d594f]",
  rawPane: "min-w-0 border border-[#1a1c1f]/80 bg-[#fbfaf6]",
  rawHead: "flex items-baseline justify-between gap-3 border-b border-[#1a1c1f]/20 px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.1em] text-[#1a1c1f] [&>span:last-child]:normal-case [&>span:last-child]:tracking-normal [&>span:last-child]:text-[#8a8578]",
  rawText: "m-0 whitespace-pre px-4 py-3.5 font-mono text-xs leading-relaxed text-[#8a8578]",
  outPane: "min-w-0 border border-[#1a1c1f] bg-[#fbfaf6] shadow-[6px_6px_0_#1a1c1f]",
  outHead: "flex items-baseline justify-between gap-3 border-b border-[#1a1c1f]/20 px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.1em] text-[#1a1c1f] [&>span:last-child]:normal-case [&>span:last-child]:tracking-normal [&>span:last-child]:text-[#0f7a47]",
  outText: "m-0 px-4 py-3.5 font-mono text-xs leading-relaxed text-[#1a1c1f]",
  meter: "relative h-1.5 flex-1 overflow-hidden bg-[#1a1c1f]/10",
  meterFill: "absolute inset-y-0 left-0 min-w-[3px] bg-[#0f7a47]",
  meterText: "font-mono text-sm tabular-nums text-[#5d594f] [&_b]:font-semibold [&_b]:text-[#0f7a47]",
  palette: paperPalette,
};

function SectionHead({ n, title, kicker }: { n: string; title: string; kicker: string }) {
  return (
    <div className={`mb-8 grid gap-2 border-t ${RULE} pt-4 md:grid-cols-12`}>
      <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#8a8578] md:col-span-2">§ {n}</span>
      <div className="md:col-span-10">
        <h2 className="font-serif text-[clamp(34px,4.6vw,56px)] leading-[1.02] tracking-[-0.01em]">{title}</h2>
        <p className={`mt-2 max-w-[58ch] text-[16px] leading-relaxed ${MUTED}`}>{kicker}</p>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <div className={`min-h-screen bg-[#f3f0e8] ${INK} selection:bg-[#6cf2ae]`}>
      <div className="mx-auto max-w-[1240px] px-4 sm:px-8">
        {/* masthead */}
        <header className={`flex items-center justify-between gap-4 border-b ${RULE} py-3 font-mono text-[11px] uppercase tracking-[0.14em]`}>
          <span>The комп manual · No. 01</span>
          <nav className="flex gap-5">
            <a href="#mechanism" className="hidden hover:underline sm:inline">Mechanism</a>
            <a href="#install" className="hidden hover:underline sm:inline">Install</a>
            <a href={links.github} className="hover:underline">GitHub ↗</a>
          </nav>
        </header>

        {/* cover */}
        <section className="grid gap-10 py-12 md:py-16 lg:grid-cols-12 lg:gap-12">
          <div className="min-w-0 lg:col-span-7">
            <AnimatedWordmark className="mb-10 h-14 text-[#1a1c1f] sm:h-16" />
            <h1 className="font-serif text-[clamp(56px,9vw,128px)] leading-[0.9] tracking-[-0.02em]">
              Logs in.
              <br />
              <em className="text-[#0f7a47]">Signal out.</em>
            </h1>
            <p className={`mt-8 max-w-[52ch] text-[18px] leading-relaxed ${MUTED}`}>
              комп compresses Kubernetes and app logs into a handful of meaningful lines, so Claude reads{" "}
              <span className="text-[#1a1c1f]">~312 tokens instead of ~75,958</span>. It runs on your machine. Your logs never leave it.
            </p>
            <div className="mt-8 flex max-w-[620px] items-center gap-3 border border-[#1a1c1f] bg-[#fbfaf6] py-2 pl-4 pr-2">
              <code className="no-scrollbar min-w-0 flex-1 overflow-x-auto whitespace-nowrap font-mono text-[13px]">
                <span className="select-none text-[#8a8578]">$ </span>
                {commands.install}
              </code>
              <CopyButton text={commands.install} className="shrink-0 bg-[#1a1c1f] px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.1em] text-[#f6f3ec] hover:bg-[#0f7a47]" />
            </div>
            <p className="mt-4 font-mono text-[12px] text-[#5d594f]">
              {version} · macOS, Linux, Windows · MIT ·{" "}
              <a href={links.releases} className="underline decoration-[#1a1c1f]/30 underline-offset-4 hover:decoration-[#1a1c1f]">
                downloads
              </a>
            </p>
          </div>

          {/* Plate I — a grainy gradient */}
          <figure className="min-w-0 lg:col-span-5">
            <GrainPlate
              className="aspect-[4/5] w-full sm:aspect-[16/10] lg:aspect-[4/5]"
              base="#0e1a14"
              fields={[
                "radial-gradient(55% 45% at 28% 78%, #3ee08f 0%, transparent 70%)",
                "radial-gradient(45% 40% at 78% 26%, #f5b83d 0%, transparent 72%)",
                "radial-gradient(50% 50% at 70% 70%, #0f7a47 0%, transparent 70%)",
                "radial-gradient(40% 35% at 18% 18%, #2f5fa8 0%, transparent 70%)",
              ]}
            >
              <div className="flex h-full flex-col justify-between p-6 text-[#f6f3ec] sm:p-8">
                <span className="font-mono text-[11px] uppercase tracking-[0.14em] opacity-80">Plate I · Signal from noise</span>
                <div>
                  <div className="font-serif text-[clamp(84px,12vw,168px)] leading-[0.85] tabular-nums">312</div>
                  <p className="mt-3 max-w-[30ch] font-mono text-[12px] leading-relaxed opacity-85">
                    tokens Claude reads for a 2,001-line outage log. Pasted raw, it would have been 75,958.
                  </p>
                </div>
              </div>
            </GrainPlate>
            <figcaption className={`mt-2 font-mono text-[11px] ${MUTED}`}>Plate I. Grainy gradient, blurred colour fields with film grain.</figcaption>
          </figure>
        </section>

        {/* spec strip */}
        <dl className="grid grid-cols-2 border-y border-[#1a1c1f] md:grid-cols-4">
          {[
            ["Lines in → out", "2,001 → 11"],
            ["Tokens saved", "99.6%"],
            ["Platforms", "5"],
            ["Network calls", "0"],
          ].map(([k, v], idx) => (
            <div key={k} className={`px-4 py-5 ${idx % 2 === 0 ? `border-r ${RULE}` : ""} ${idx === 1 ? `md:border-r ${RULE}` : ""} ${idx < 2 ? `border-b ${RULE} md:border-b-0` : ""}`}>
              <dt className="font-mono text-[11px] uppercase tracking-[0.12em] text-[#8a8578]">{k}</dt>
              <dd className="mt-1 font-serif text-[40px] leading-none tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-2 font-mono text-[11px] text-[#8a8578]">Measured on the four test logs in the repository; tokens estimated at ~4 characters each.</p>

        {/* mechanism */}
        <section id="mechanism" className="pt-20">
          <SectionHead
            n="1"
            title="The mechanism"
            kicker="A machine that does what комп does. Log sheets drop into the hopper, the press stamps out the repetition into the noise bin, and one card, the summary, slides out. Pick a log; the readout uses its real numbers."
          />
          <Machine />
        </section>

        {/* route */}
        <section className="pt-20">
          <SectionHead
            n="2"
            title="The round trip"
            kicker="Why it saves tokens: the raw logs never enter the conversation. Step through what happens between your clipboard and Claude."
          />
          <RouteDiagram />
        </section>

        {/* specimen */}
        <section className="pt-20">
          <SectionHead n="3" title="Specimens" kicker="Real output on the repository's test logs. Left, what you would paste. Right, what Claude reads." />
          <DemoViewer theme={demoTheme} rawHeight="h-[420px]" />
        </section>

        {/* rules */}
        <section className="pt-20">
          <SectionHead n="4" title="What it keeps" kicker="комп is lossy on purpose. It drops repetition, not meaning. Six rules decide what stays." />
          <ol className="grid border-t border-[#1a1c1f] md:grid-cols-2">
            {features.map((f, k) => (
              <li key={f.title} className={`grid grid-cols-[44px_1fr] gap-3 border-b ${RULE} py-6 md:px-4 ${k % 2 === 0 ? `md:border-r` : ""}`}>
                <span className="font-mono text-[12px] tabular-nums text-[#8a8578]">{String(k + 1).padStart(2, "0")}</span>
                <div className="min-w-0">
                  <h3 className="font-serif text-[26px] leading-tight">{f.title}</h3>
                  <p className={`mt-1 text-[15px] leading-relaxed ${MUTED}`}>{f.body}</p>
                  <pre className="mt-3 whitespace-pre-wrap break-words border-l-2 border-[#0f7a47] bg-[#fbfaf6] px-3 py-2 font-mono text-[12px]">{f.example}</pre>
                </div>
              </li>
            ))}
          </ol>
          <p className="mt-6 font-mono text-[12px] text-[#5d594f]">Reads: {formats.join(" · ")}</p>
        </section>

        {/* tools */}
        <section className="pt-20">
          <SectionHead n="5" title="Three tools" kicker="комп speaks the Model Context Protocol over stdio. Claude Code starts it in the background." />
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-y border-[#1a1c1f] font-mono text-[11px] uppercase tracking-[0.12em] text-[#8a8578]">
                <th className="py-2 pr-4 font-normal">Tool</th>
                <th className="hidden py-2 pr-4 font-normal md:table-cell">Arguments</th>
                <th className="py-2 font-normal">Reads from</th>
              </tr>
            </thead>
            <tbody>
              {tools.map((t) => (
                <tr key={t.name} className={`border-b ${RULE} align-top`}>
                  <td className="py-3 pr-4 font-mono text-[13px] text-[#0f7a47]">{t.name}</td>
                  <td className="hidden py-3 pr-4 font-mono text-[12px] text-[#5d594f] md:table-cell">{t.args}</td>
                  <td className="py-3 text-[15px]">{t.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>

      {/* install over Plate II — a dithered gradient */}
      <section id="install" className="relative mt-24 overflow-hidden border-y border-[#1a1c1f]">
        <DitherPlate className="absolute inset-0" />
        <div className="relative mx-auto max-w-[1240px] px-4 py-16 sm:px-8 sm:py-24">
          <div className="max-w-[720px] border border-[#1a1c1f] bg-[#f3f0e8] p-6 shadow-[8px_8px_0_#1a1c1f] sm:p-10">
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#8a8578]">§ 6 · Installation</p>
            <h2 className="mt-2 font-serif text-[clamp(36px,5vw,60px)] leading-none">Two commands.</h2>
            {[
              ["Install the binary", commands.install],
              ["Connect it to Claude Code", commands.connect],
            ].map(([label, cmd], k) => (
              <div key={label} className="mt-6">
                <p className="mb-2 text-[15px]">
                  <span className="mr-2 font-mono text-[12px] text-[#8a8578]">{k + 1}.</span>
                  {label}
                </p>
                <div className="relative">
                  <pre className="whitespace-pre-wrap break-all border border-[#1a1c1f] bg-[#fbfaf6] py-3 pl-3.5 pr-20 font-mono text-[13px]">{cmd}</pre>
                  <CopyButton text={cmd} className="absolute right-2 top-2 bg-[#1a1c1f] px-2.5 py-1 font-mono text-[11px] uppercase text-[#f6f3ec] hover:bg-[#0f7a47]" />
                </div>
              </div>
            ))}
            <p className={`mt-6 text-[14px] ${MUTED}`}>Then copy some logs and ask Claude what&apos;s wrong in the logs you copied.</p>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-[1240px] px-4 sm:px-8">
        {/* faq */}
        <section className="pt-20">
          <SectionHead n="7" title="Questions" kicker="Short answers." />
          <dl className="grid gap-x-12 md:grid-cols-2">
            {faqs.map((f) => (
              <div key={f.q} className={`border-t ${RULE} py-5`}>
                <dt className="font-serif text-[24px] leading-tight">{f.q}</dt>
                <dd className={`mt-2 text-[15px] leading-relaxed ${MUTED}`}>{f.a}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* colophon */}
        <footer className="mt-20 grid gap-6 border-t border-[#1a1c1f] py-8 font-mono text-[11px] leading-relaxed text-[#5d594f] md:grid-cols-3">
          <p>
            <span className="uppercase tracking-[0.14em] text-[#1a1c1f]">Colophon</span>
            <br />
            Set in Instrument Serif, Geist and Geist Mono. Figures are hand-coded SVG. Plate I is a grainy gradient; Plate II is a Bayer-dithered gradient.
          </p>
          <p>
            Fig. 1 follows the Anatomy rules: one isometric camera, four tones, one lit part. Fig. 2 is an Archify-style lane diagram.
          </p>
          <p className="md:text-right">
            комп {version} · MIT · <a href={links.author} className="underline underline-offset-4">samchinmaya</a>
            <br />
            <a href={links.github} className="underline underline-offset-4">github.com/samchinmaya/komp</a>
          </p>
        </footer>
      </div>
    </div>
  );
}
