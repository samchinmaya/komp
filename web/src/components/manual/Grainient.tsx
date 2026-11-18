import type { ReactNode } from "react";
import { asset } from "@/lib/asset";

/**
 * A grainy gradient plate in the Grainient style: soft colour fields with a
 * natural blur and a visible film-grain overlay. Pure CSS, no image files.
 */
export function GrainPlate({
  fields,
  base,
  grain = 0.55,
  className = "",
  children,
}: {
  /** CSS radial-gradient layers, painted over `base` */
  fields: string[];
  base: string;
  grain?: number;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div className={`relative isolate overflow-hidden ${className}`} style={{ background: base }}>
      <div aria-hidden className="absolute -inset-[15%] blur-[48px]" style={{ backgroundImage: fields.join(",") }} />
      <div
        aria-hidden
        className="absolute inset-0 grain mix-blend-overlay"
        style={{ opacity: grain, backgroundSize: "180px 180px" }}
      />
      <div aria-hidden className="absolute inset-0 grain mix-blend-multiply" style={{ opacity: grain * 0.35 }} />
      <div className="relative h-full">{children}</div>
    </div>
  );
}

/** A "dither art gradient": the same idea as a gradient, made of 1-bit Bayer dots. */
export function DitherPlate({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`bg-cover bg-center [image-rendering:pixelated] ${className}`}
      style={{ backgroundImage: `url(${asset("/dither-plate.png")})` }}
    />
  );
}
