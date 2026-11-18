import { asset } from "@/lib/asset";

/** A strip of Bayer-dithered signal green, solid on one edge and fading out. */
export function DitherBand({ flip = false, className = "" }: { flip?: boolean; className?: string }) {
  return (
    <div
      aria-hidden
      className={`h-24 bg-[length:1600px_100%] bg-repeat-x [image-rendering:pixelated] ${flip ? "-scale-y-100" : ""} ${className}`}
      style={{ backgroundImage: `url(${asset("/dither-band-signal.png")})` }}
    />
  );
}
