"use client";

import { useEffect, useRef } from "react";

const SOFT_WORDS = 5;
const MAX_BLUR = 6;
const MIN_OPACITY = 0.46;

/** Scrolling pulls a sentence into focus one word at a time. */
export function FocusText({ text }: { text: string }) {
  const track = useRef<HTMLDivElement>(null);
  const line = useRef<HTMLParagraphElement>(null);
  const words = text.split(" ");

  useEffect(() => {
    const section = track.current;
    const spans = Array.from(line.current?.querySelectorAll("span") ?? []);
    if (!section || !spans.length || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let frame = 0;
    const painted = spans.map(() => -1);

    function paint() {
      frame = 0;
      const box = section!.getBoundingClientRect();
      const travel = Math.max(1, box.height - window.innerHeight);
      const progress = Math.min(1, Math.max(0, -box.top / travel));
      const head = progress * (spans.length + SOFT_WORDS);
      spans.forEach((span, index) => {
        const softness = Math.min(1, Math.max(0, (index - head) / SOFT_WORDS));
        const rounded = Math.round(softness * 100) / 100;
        if (rounded === painted[index]) return;
        painted[index] = rounded;
        span.style.filter = rounded ? `blur(${(rounded * MAX_BLUR).toFixed(2)}px)` : "none";
        span.style.opacity = (1 - (1 - MIN_OPACITY) * rounded).toFixed(2);
      });
    }

    const request = () => {
      if (!frame) frame = requestAnimationFrame(paint);
    };
    const watcher = new IntersectionObserver(
      ([entry]) => {
        window.removeEventListener("scroll", request);
        if (entry.isIntersecting) window.addEventListener("scroll", request, { passive: true });
        request();
      },
      { rootMargin: "20% 0px" },
    );

    paint();
    watcher.observe(section);
    window.addEventListener("resize", request);
    return () => {
      cancelAnimationFrame(frame);
      watcher.disconnect();
      window.removeEventListener("scroll", request);
      window.removeEventListener("resize", request);
      spans.forEach((span) => span.removeAttribute("style"));
    };
  }, [text]);

  return (
    <div ref={track} className="mt-[88px] min-[901px]:mt-24 motion-safe:h-[230svh]">
      <div className="flex items-center justify-center py-16 motion-safe:sticky motion-safe:top-0 motion-safe:h-svh motion-safe:py-0">
        <p ref={line} className="max-w-[1040px] text-balance text-center text-[clamp(29px,4.5vw,58px)] font-medium leading-[1.14] tracking-[-0.035em] text-snow">
          {words.map((word, index) => (
            <span key={`${word}-${index}`}>
              {word}
              {index < words.length - 1 ? " " : ""}
            </span>
          ))}
        </p>
      </div>
    </div>
  );
}
