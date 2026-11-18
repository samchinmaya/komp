import { BlackHole } from "./BlackHole";
import { Plus } from "./Blueprint";

/** A blueprint-style dimension line: |←── label ──→| */
function Dimension({ label, className = "" }: { label: string; className?: string }) {
  return (
    <div className={`flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider ${className}`}>
      <span className="h-3 w-px bg-current" />
      <span className="h-px flex-1 bg-current" />
      <span>{label}</span>
      <span className="h-px flex-1 bg-current" />
      <span className="h-3 w-px bg-current" />
    </div>
  );
}

const themes = {
  light: {
    caption: "text-[#5b7cb8]",
    card: "border-light-line bg-white/85 shadow-[0_30px_80px_-30px_rgba(15,20,25,0.35)]",
    hole: "ink" as const,
    label: "text-light-muted",
    value: "text-ink",
    rawBar: "bg-[repeating-linear-gradient(90deg,#c9cfd7_0_6px,#dde1e7_6px_12px)]",
    track: "bg-light-line",
    fill: "bg-signal-deep",
    good: "text-signal-deep",
    rule: "border-light-line",
  },
  dark: {
    caption: "text-signal/70",
    card: "border-line bg-surface/85 shadow-[0_30px_100px_-30px_rgba(62,224,143,0.35)]",
    hole: "paper" as const,
    label: "text-muted",
    value: "text-paper",
    rawBar: "bg-[repeating-linear-gradient(90deg,#3a4552_0_6px,#26303b_6px_12px)]",
    track: "bg-surface-2",
    fill: "bg-signal shadow-[0_0_12px_2px_rgba(62,224,143,0.6)]",
    good: "text-signal",
    rule: "border-line",
  },
};

/** "fig. 01": the dithered black hole above a raw-vs-комп token comparison. */
export function TokenCard({ theme }: { theme: "light" | "dark" }) {
  const t = themes[theme];
  return (
    <div className="relative">
      <span className={`absolute -top-6 left-0 font-mono text-[10px] uppercase tracking-wider ${t.caption}`}>
        fig. 01 — token budget, Go outage log
      </span>
      <div className={`relative overflow-hidden rounded-3xl border p-6 backdrop-blur sm:p-8 ${t.card}`}>
        <Plus className={t.caption} style={{ left: 16, top: 16 }} />
        <Plus className={t.caption} style={{ left: "calc(100% - 16px)", top: 16 }} />
        <BlackHole color={t.hole} className="mx-auto mb-6 w-full max-w-[420px]" />
        <Dimension label="raw paste · 2,001 lines" className={`mb-2 ${t.caption}`} />
        <div className="mb-1 flex items-baseline justify-between text-sm">
          <span className={t.label}>Paste into the chat</span>
          <span className={`font-mono font-semibold ${t.value}`}>~75,958 tokens</span>
        </div>
        <div className={`mb-6 h-3 rounded-full ${t.rawBar}`} />
        <div className="mb-1 flex items-baseline justify-between text-sm">
          <span className={t.label}>With комп</span>
          <span className={`font-mono font-semibold ${t.good}`}>~312 tokens</span>
        </div>
        <div className={`h-3 rounded-full ${t.track}`}>
          <div className={`h-3 w-[2%] min-w-2 rounded-full ${t.fill}`} />
        </div>
        <p className={`mt-6 border-t border-dashed pt-4 font-mono text-xs ${t.rule} ${t.label}`}>99.6% fewer tokens · same diagnosis</p>
      </div>
    </div>
  );
}
