/**
 * The комп wordmark, drawn as strokes so it takes the current text colour.
 *
 * variant="blackhole" (default) turns the о into a black hole: the letter is the
 * photon ring and a thin tilted accretion disk passes behind it at the top and in
 * front of it at the bottom, with a small gap where it crosses the ring.
 */

// Disk: an ellipse centred on the о, kept inside the gaps next to к and м.
const DISK_BACK = "M112.5 32A19.5 4.6 0 0 1 151.5 32"; // upper half, behind the hole
const DISK_FRONT = "M112.5 32A19.5 4.6 0 0 0 151.5 32"; // lower half, in front
const TILT = "rotate(-9 132 32)";

let counter = 0;

export function Wordmark({
  className = "",
  title = "комп",
  variant = "blackhole",
  disk = "currentColor",
}: {
  className?: string;
  title?: string;
  variant?: "blackhole" | "plain";
  /** colour of the accretion disk (blackhole variant) */
  disk?: string;
}) {
  const id = `wm${++counter}`;
  const hole = variant === "blackhole";
  return (
    <svg viewBox="82 12 138 40" className={className} role="img" aria-label={title}>
      {hole && (
        <defs>
          {/* hides the far side of the disk inside the ring */}
          <mask id={`${id}-behind`} maskUnits="userSpaceOnUse" x="82" y="12" width="138" height="40">
            <rect x="82" y="12" width="138" height="40" fill="white" />
            <ellipse cx="132" cy="32" rx="13.2" ry="14.2" fill="black" />
          </mask>
          {/* Doppler beaming: the side spinning towards us (left) is brighter */}
          <linearGradient id={`${id}-beam`} gradientUnits="userSpaceOnUse" x1="112" y1="0" x2="152" y2="0">
            <stop offset="0" stopColor={disk} stopOpacity="1" />
            <stop offset="1" stopColor={disk} stopOpacity="0.45" />
          </linearGradient>
          {/* cuts a gap in the ring where the near side of the disk crosses it */}
          <mask id={`${id}-front`} maskUnits="userSpaceOnUse" x="82" y="12" width="138" height="40">
            <rect x="82" y="12" width="138" height="40" fill="white" />
            <path d={DISK_FRONT} transform={TILT} fill="none" stroke="black" strokeWidth="6" strokeLinecap="round" />
          </mask>
        </defs>
      )}
      <g fill="none" stroke="currentColor" strokeWidth={5.5} strokeLinecap="round" strokeLinejoin="round">
        <path d="M88 18V46M90 32L104 18M90 32L105 46" />
        <ellipse cx="132" cy="32" rx="13" ry="14" mask={hole ? `url(#${id}-front)` : undefined} />
        <path d="M158 46V18L169 38L180 18V46" />
        <path d="M194 46V18H214V46" />
      </g>
      {hole && (
        <g transform={TILT} fill="none" stroke={`url(#${id}-beam)`} strokeLinecap="round">
          <path d={DISK_BACK} strokeWidth={1.6} opacity={0.6} mask={`url(#${id}-behind)`} />
          <path d={DISK_FRONT} strokeWidth={2.6} />
        </g>
      )}
    </svg>
  );
}
