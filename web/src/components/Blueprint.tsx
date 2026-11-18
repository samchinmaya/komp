import type { CSSProperties, ReactNode } from "react";

/** A small "+" registration mark, centred on the point it marks. */
export function Plus({ className = "", style }: { className?: string; style?: CSSProperties }) {
  return (
    <svg
      viewBox="0 0 11 11"
      aria-hidden="true"
      className={`pointer-events-none absolute size-[11px] -translate-x-1/2 -translate-y-1/2 ${className}`}
      style={style}
    >
      <path d="M5.5 0V11M0 5.5H11" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}

/** Full-page blueprint grid layer. Put inside a `relative` parent. */
export function GridLayer({ className = "", fade = true }: { className?: string; fade?: boolean }) {
  return <div aria-hidden="true" className={`pointer-events-none absolute inset-0 bp-grid ${fade ? "bp-fade" : ""} ${className}`} />;
}

/**
 * A grainy gradient: soft blurred colour blobs with film grain on top.
 * `blobs` are CSS radial-gradients; position the component with `className`.
 */
export function GrainyGlow({
  blobs,
  className = "",
  grainOpacity = 0.35,
  blend = "overlay",
}: {
  blobs: string[];
  className?: string;
  grainOpacity?: number;
  blend?: "overlay" | "soft-light" | "multiply" | "screen";
}) {
  // The grain is masked by the same blobs (made opaque), so it only shows where the colour is.
  const mask = blobs.map((b) => b.replace(/rgba\(([^()]*?),\s*[\d.]+\)/g, "rgba(0,0,0,1)")).join(",");
  return (
    <div aria-hidden="true" className={`pointer-events-none absolute overflow-hidden ${className}`}>
      <div className="absolute inset-0 blur-3xl" style={{ backgroundImage: blobs.join(",") }} />
      <div
        className="absolute inset-0 grain"
        style={{ opacity: grainOpacity, mixBlendMode: blend, maskImage: mask, WebkitMaskImage: mask }}
      />
    </div>
  );
}

/**
 * The page "rail": a centred column with dashed side guides. Sections inside
 * get a dashed top rule with + marks where it meets the guides.
 */
export function Rail({ children, className = "", line }: { children: ReactNode; className?: string; line: string }) {
  return (
    <div className={`relative mx-auto w-full max-w-[1200px] border-x border-dashed ${line} ${className}`}>{children}</div>
  );
}

export function Section({
  children,
  id,
  label,
  line,
  mark,
  labelClass = "",
  className = "",
}: {
  children: ReactNode;
  id?: string;
  label?: string;
  line: string;
  mark: string;
  labelClass?: string;
  className?: string;
}) {
  return (
    <section id={id} className={`relative border-t border-dashed ${line} ${className}`}>
      <Plus className={mark} style={{ left: 0, top: 0 }} />
      <Plus className={mark} style={{ left: "100%", top: 0 }} />
      {label && (
        <span
          className={`absolute left-6 top-0 -translate-y-1/2 px-2 font-mono text-[11px] uppercase tracking-[0.12em] ${labelClass}`}
        >
          {label}
        </span>
      )}
      {children}
    </section>
  );
}
