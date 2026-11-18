"use client";

import { useEffect, useRef } from "react";
import { runSummary } from "@/data/run";

/*
 * 2,001 thin lines fall and narrow into the 11 lines of the recorded summary,
 * each coloured by what that summary line is.
 */

const RAW_LINES = 2001;

const lineColor = (line: string) =>
  /ERROR|FATAL/.test(line) ? "#ff7b72" : /\bWARN\b/.test(line) ? "#f5b83d" : /^\[komp\]|^levels:/.test(line) ? "#edf2f6" : "#9fd8ff";

export function HeroFunnel({ className = "" }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const colors = runSummary.map(lineColor);
    let base: HTMLCanvasElement | null = null;
    let width = 0;
    let height = 0;
    let dpr = 1;
    let ends: { color: string; x: number }[] = [];
    let frame = 0;

    function trace(target: CanvasRenderingContext2D, from: number, to: number) {
      const bend = height * 0.62;
      for (let i = 0; i <= 24; i++) {
        const t = i / 24;
        const u = 1 - t;
        const x = u * u * u * from + 3 * u * u * t * from + 3 * u * t * t * to + t * t * t * to;
        const y = 3 * u * u * t * bend * 0.45 + 3 * u * t * t * bend + t * t * t * height;
        if (i) target.lineTo(x, y);
        else target.moveTo(x, y);
      }
    }

    function paint(now: number | null) {
      if (!canvas || !context || !base) return;
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(base, 0, 0);
      const fade = context.createLinearGradient(0, 0, canvas.width, 0);
      fade.addColorStop(0, "rgba(0,0,0,0)");
      fade.addColorStop(0.3, "#000");
      context.globalCompositeOperation = "destination-in";
      context.fillStyle = fade;
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.globalCompositeOperation = "source-over";
      if (now === null) return;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.lineWidth = 1.6;
      ends.forEach((end, i) => {
        const t = (now / 2600 + i * 0.137) % 1;
        const y = height * (0.7 + 0.3 * t);
        context.strokeStyle = end.color;
        context.globalAlpha = Math.sin(Math.PI * t);
        context.beginPath();
        context.moveTo(end.x, y - 16);
        context.lineTo(end.x, y);
        context.stroke();
      });
      context.globalAlpha = 1;
    }

    function resize() {
      if (!canvas) return;
      const box = canvas.getBoundingClientRect();
      if (!box.width || !box.height) return;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = box.width;
      height = box.height;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      base = document.createElement("canvas");
      base.width = canvas.width;
      base.height = canvas.height;
      const layer = base.getContext("2d");
      if (!layer) return;
      layer.scale(dpr, dpr);
      const span = Math.min(width * 0.46, 250);
      const middle = width * 0.68;
      ends = colors.map((color, i) => ({ color, x: middle - span / 2 + (span * i) / (colors.length - 1) }));
      layer.globalCompositeOperation = "lighter";
      layer.lineWidth = 0.45;
      layer.strokeStyle = "rgba(159,216,255,.045)";
      for (let i = 0; i < RAW_LINES; i++) {
        const share = i / (RAW_LINES - 1);
        layer.beginPath();
        trace(layer, width * share, ends[Math.round(share * (ends.length - 1))].x);
        layer.stroke();
      }
      layer.lineWidth = 1.2;
      ends.forEach((end) => {
        layer.strokeStyle = `${end.color}99`;
        layer.beginPath();
        layer.moveTo(end.x, height * 0.7);
        layer.lineTo(end.x, height);
        layer.stroke();
      });
      paint(null);
    }

    const loop = (now: number) => {
      paint(now);
      frame = requestAnimationFrame(loop);
    };

    resize();
    const sized = new ResizeObserver(resize);
    sized.observe(canvas);
    const visible = new IntersectionObserver(([entry]) => {
      cancelAnimationFrame(frame);
      if (entry.isIntersecting && !reduced) frame = requestAnimationFrame(loop);
    });
    visible.observe(canvas);
    return () => {
      sized.disconnect();
      visible.disconnect();
      cancelAnimationFrame(frame);
    };
  }, []);

  return <canvas ref={ref} aria-hidden="true" className={className} />;
}
