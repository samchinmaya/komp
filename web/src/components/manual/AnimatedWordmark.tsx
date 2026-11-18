"use client";

import { useState } from "react";

/**
 * Pixel2Motion-style logo animation: the letters draw themselves on, then the
 * accretion disk swings into the о. One finite pass; click to replay.
 * Under reduced motion it renders finished and still.
 */
const LETTERS = [
  "M88 18V46M90 32L104 18M90 32L105 46",
  "M132 18A13 14 0 1 1 131.99 18",
  "M158 46V18L169 38L180 18V46",
  "M194 46V18H214V46",
];
const DISK_BACK = "M112.5 32A19.5 4.6 0 0 1 151.5 32";
const DISK_FRONT = "M112.5 32A19.5 4.6 0 0 0 151.5 32";

export function AnimatedWordmark({ className = "", disk = "#12a35c" }: { className?: string; disk?: string }) {
  const [run, setRun] = useState(0);
  return (
    <button
      type="button"
      onClick={() => setRun((n) => n + 1)}
      className={`group block cursor-pointer ${className}`}
      aria-label="комп — replay logo animation"
      title="Replay"
    >
      <svg key={run} viewBox="82 12 138 40" className="block h-full w-auto overflow-visible" aria-hidden>
        <defs>
          <mask id={`am-behind-${run}`} maskUnits="userSpaceOnUse" x="82" y="12" width="138" height="40">
            <rect x="82" y="12" width="138" height="40" fill="white" />
            <ellipse cx="132" cy="32" rx="13.2" ry="14.2" fill="black" />
          </mask>
          <mask id={`am-front-${run}`} maskUnits="userSpaceOnUse" x="82" y="12" width="138" height="40">
            <rect x="82" y="12" width="138" height="40" fill="white" />
            <path d={DISK_FRONT} transform="rotate(-9 132 32)" fill="none" stroke="black" strokeWidth="6" strokeLinecap="round" />
          </mask>
        </defs>
        <g fill="none" stroke="currentColor" strokeWidth={5.5} strokeLinecap="round" strokeLinejoin="round">
          {LETTERS.map((d, i) => (
            <path
              key={d}
              d={d}
              pathLength={1}
              mask={i === 1 ? `url(#am-front-${run})` : undefined}
              className="komp-draw"
              style={{ animationDelay: `${i * 110}ms` }}
            />
          ))}
        </g>
        <g className="komp-disk" style={{ transformOrigin: "132px 32px" }} fill="none" stroke={disk} strokeLinecap="round">
          <g transform="rotate(-9 132 32)">
            <path d={DISK_BACK} strokeWidth={1.6} opacity={0.55} mask={`url(#am-behind-${run})`} />
            <path d={DISK_FRONT} strokeWidth={2.6} />
          </g>
        </g>
      </svg>
    </button>
  );
}
