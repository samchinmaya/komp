import { asset } from "@/lib/asset";

/**
 * The full-page background: near-black navy, a pale steel-blue sweep and one
 * red streak, under film grain. Built from CSS gradients (see globals.css),
 * fixed behind the page so it stays put while the content scrolls.
 */
export function SiteBackground() {
  return (
    <div aria-hidden className="site-bg">
      <div className="site-bg-sweep" />
      <div className="site-bg-streak" />
      <div className="site-bg-grain" />
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
