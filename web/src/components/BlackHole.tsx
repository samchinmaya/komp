import { asset } from "@/lib/asset";

/* eslint-disable @next/next/no-img-element -- pixel art: plain <img> with pixelated scaling, no resampling */

/** The dithered black hole (1-bit, transparent). Scaled up with crisp pixels. */
export function BlackHole({
  color,
  className = "",
  alt = "",
}: {
  color: "paper" | "signal" | "ink";
  className?: string;
  alt?: string;
}) {
  return (
    <img
      src={asset(`/blackhole-${color}.png`)}
      alt={alt}
      width={560}
      height={340}
      aria-hidden={alt ? undefined : true}
      className={`pointer-events-none select-none [image-rendering:pixelated] ${className}`}
      draggable={false}
    />
  );
}
