"use client";

import { useEffect, useRef, useState } from "react";
import { fmt } from "@/data/site";
import { run, runSummary } from "@/data/run";

/*
 * One voxel for every raw log line in the recorded run. Each voxel flies into
 * the summary line that absorbed it, using the real ×N counts, leaving one
 * bright block per line of komp's output.
 */

const SIDE = 13;
const LAYERS = Math.ceil(run.linesIn / (SIDE * SIDE));
const COS = Math.cos(Math.PI / 6);
const HOLD = 1500;
const COLLAPSE = 3000;
const REST = 2800;
const REBUILD = 1700;
const LOOP = HOLD + COLLAPSE + REST + REBUILD;
const FRAME_MS = 33;
const SLOW_PAINT_MS = 16;

const NIGHT = [3, 6, 11];
const STEEL = [88, 110, 130];
const PALETTE = [
  [255, 123, 114],
  [245, 184, 61],
  [159, 216, 255],
  [237, 242, 246],
];

type Rgb = number[];
const mix = (a: Rgb, b: Rgb, amount: number) => a.map((value, i) => Math.round(value + (b[i] - value) * amount));
const css = (rgb: Rgb) => `rgb(${rgb.join(" ")})`;
const clamp = (value: number) => Math.min(1, Math.max(0, value));
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

const paletteIndex = (line: string) => (/ERROR|FATAL/.test(line) ? 0 : /\bWARN\b/.test(line) ? 1 : /^\[komp\]|^levels:/.test(line) ? 3 : 2);
const rawCount = (line: string) => (/^\[komp\]|^levels:/.test(line) ? 0 : Number(line.match(/×(\d+)\s*$/)?.[1] ?? 1));

function makeCube(top: Rgb, edge: number) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(2 * COS * edge) + 2;
  canvas.height = Math.ceil(2 * edge) + 2;
  const context = canvas.getContext("2d")!;
  const x = canvas.width / 2;
  const half = COS * edge;
  const face = (points: number[][], fill: string) => {
    context.fillStyle = fill;
    context.beginPath();
    points.forEach(([px, py], i) => (i ? context.lineTo(px, py) : context.moveTo(px, py)));
    context.closePath();
    context.fill();
  };
  const topFace = [[x, 1], [x + half, 1 + edge / 2], [x, 1 + edge], [x - half, 1 + edge / 2]];
  face(topFace, css(top));
  face([[x - half, 1 + edge / 2], [x, 1 + edge], [x, 1 + 2 * edge], [x - half, 1 + 1.5 * edge]], css(mix(top, NIGHT, 0.42)));
  face([[x + half, 1 + edge / 2], [x, 1 + edge], [x, 1 + 2 * edge], [x + half, 1 + 1.5 * edge]], css(mix(top, NIGHT, 0.64)));
  return canvas;
}

export function HeroVoxels({ className = "" }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);

  // The blocks are decoration, so the page finishes loading before they start.
  useEffect(() => {
    let idle = 0;
    let timer = 0;
    const schedule = () => {
      if (typeof window.requestIdleCallback === "function") idle = window.requestIdleCallback(() => setReady(true), { timeout: 2500 });
      else timer = window.setTimeout(() => setReady(true), 800);
    };
    if (document.readyState === "complete") schedule();
    else window.addEventListener("load", schedule, { once: true });
    return () => {
      window.removeEventListener("load", schedule);
      if (idle) window.cancelIdleCallback(idle);
      window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    const canvas = ref.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const font = getComputedStyle(canvas).fontFamily;

    const rows = [4, 3, 4];
    const center = (SIDE - 1) / 2;
    let slot = 0;
    const groups = runSummary.map((line, index) => {
      let row = 0;
      let left = slot++;
      while (left >= rows[row]) left -= rows[row++];
      return {
        color: paletteIndex(line),
        count: rawCount(line),
        x: center + (left - (rows[row] - 1) / 2) * 3.2,
        y: center + (row - 1) * 3.2,
        index,
      };
    });

    // A small seeded shuffle, so every visit shows the same honest split.
    let seed = 2001;
    const random = () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };

    const total = run.linesIn;
    const owners: number[] = [];
    groups.forEach((group, index) => {
      for (let i = 0; i < group.count && owners.length < total; i++) owners.push(index);
    });
    while (owners.length < total) owners.push(groups.findIndex((group) => group.count > 0));
    for (let i = owners.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [owners[i], owners[j]] = [owners[j], owners[i]];
    }

    const voxels = owners.map((owner, i) => {
      const z = Math.floor(i / (SIDE * SIDE));
      const cell = i % (SIDE * SIDE);
      return { x: cell % SIDE, y: Math.floor(cell / SIDE), z, owner, delay: (1 - z / LAYERS) * 0.6 + random() * 0.4 };
    });

    const items = voxels.length + groups.length;
    const depth = new Float32Array(items);
    const drawX = new Float32Array(items);
    const drawY = new Float32Array(items);
    const size = new Float32Array(items);
    const tint = new Float32Array(items);
    const order = Uint16Array.from({ length: items }, (_, i) => i);

    let width = 0;
    let height = 0;
    let unit = 10;
    let originX = 0;
    let originY = 0;
    let labelGap = 8;
    let frame = 0;
    let dim: HTMLCanvasElement[] = [];
    let bright: HTMLCanvasElement[] = [];
    let large: HTMLCanvasElement[] = [];
    let smallEdge = 1;
    let largeEdge = 1;

    function place(item: number, x: number, y: number, z: number, scale: number, colorMix: number) {
      drawX[item] = originX + (x - y) * COS * unit;
      drawY[item] = originY + (x + y + 1) * 0.5 * unit - (z + 0.5) * unit;
      depth[item] = x + y + z;
      size[item] = scale;
      tint[item] = colorMix;
    }

    function paint(time: number) {
      if (!canvas || !context || !width) return;
      let phase = 0;
      if (time >= HOLD + COLLAPSE + REST) phase = 1 - (time - HOLD - COLLAPSE - REST) / REBUILD;
      else if (time >= HOLD + COLLAPSE) phase = 1;
      else if (time >= HOLD) phase = (time - HOLD) / COLLAPSE;

      const arrived = new Array<number>(groups.length).fill(0);
      let absorbed = 0;
      voxels.forEach((voxel, i) => {
        const target = groups[voxel.owner];
        const progress = ease(clamp((phase - voxel.delay * 0.55) / 0.45));
        if (progress >= 1) {
          arrived[voxel.owner]++;
          absorbed++;
          size[i] = 0;
          depth[i] = -1;
          return;
        }
        place(
          i,
          voxel.x + (target.x - voxel.x) * progress,
          voxel.y + (target.y - voxel.y) * progress,
          voxel.z * (1 - progress) + Math.sin(Math.PI * progress) * 2.5,
          0.94 - 0.6 * progress,
          Math.min(1, progress * 1.6),
        );
      });
      groups.forEach((group, g) => {
        const filled = group.count ? arrived[g] / group.count : clamp((phase - 0.8) / 0.2);
        place(voxels.length + g, group.x, group.y, 0.4, filled ? 0.7 + 1.3 * Math.sqrt(filled) : 0, 1);
      });

      order.sort((a, b) => depth[a] - depth[b]);
      context.clearRect(0, 0, width, height);
      for (const item of order) {
        const scale = size[item];
        if (!scale) continue;
        const isGroup = item >= voxels.length;
        const color = isGroup ? groups[item - voxels.length].color : groups[voxels[item].owner].color;
        const sprite = isGroup ? large[color] : dim[color];
        const edge = isGroup ? largeEdge : smallEdge;
        const drawWidth = (sprite.width / edge) * unit * scale;
        const drawHeight = (sprite.height / edge) * unit * scale;
        const left = drawX[item] - drawWidth / 2;
        const top = drawY[item] - drawHeight / 2;
        if (isGroup) {
          context.shadowColor = css(PALETTE[color]);
          context.shadowBlur = 16;
        }
        context.drawImage(sprite, left, top, drawWidth, drawHeight);
        context.shadowBlur = 0;
        if (!isGroup && tint[item] > 0) {
          context.globalAlpha = tint[item];
          context.drawImage(bright[color], left, top, drawWidth, drawHeight);
          context.globalAlpha = 1;
        }
      }

      const lines = phase >= 1 ? run.linesOut : Math.max(run.linesOut, total - absorbed);
      context.font = `12px ${font}`;
      context.textAlign = "center";
      context.fillStyle = "#b8c5d1";
      context.fillText(`${fmt(lines)} lines`, originX, height - labelGap);
    }

    function resize() {
      if (!canvas || !context) return;
      const box = canvas.getBoundingClientRect();
      if (!box.width || !box.height) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = box.width;
      height = box.height;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);

      const wide = width > 420 && height > 300;
      const top = wide ? 84 : 6;
      labelGap = wide ? 30 : 8;
      const room = height - top - labelGap - 22;
      unit = Math.min(room / (SIDE + LAYERS + 1), (width * (wide ? 0.62 : 0.86)) / (2 * SIDE * COS));
      originX = width * (wide ? 0.66 : 0.5);
      originY = top + (room - (SIDE + LAYERS) * unit) / 2 + LAYERS * unit;

      smallEdge = Math.max(4, Math.ceil(unit * dpr));
      largeEdge = Math.ceil(unit * dpr * 2.1);
      dim = PALETTE.map((color) => makeCube(mix(STEEL, color, 0.16), smallEdge));
      bright = PALETTE.map((color) => makeCube(color, smallEdge));
      large = PALETTE.map((color) => makeCube(color, largeEdge));
      paint(reduced || stopped ? HOLD + COLLAPSE : 0);
    }

    let started = 0;
    let lastFrame = 0;
    let slowFrames = 0;
    let stopped = false;
    const loop = (now: number) => {
      frame = requestAnimationFrame(loop);
      if (now - lastFrame < FRAME_MS) return;
      lastFrame = now;
      started ||= now;
      const before = performance.now();
      paint((now - started) % LOOP);
      slowFrames = performance.now() - before > SLOW_PAINT_MS ? slowFrames + 1 : 0;
      // On a device that cannot keep up, settle on the finished picture.
      if (slowFrames >= 3) {
        stopped = true;
        cancelAnimationFrame(frame);
        paint(HOLD + COLLAPSE);
      }
    };

    resize();
    const sized = new ResizeObserver(resize);
    sized.observe(canvas);
    const visible = new IntersectionObserver(([entry]) => {
      cancelAnimationFrame(frame);
      if (entry.isIntersecting && !reduced && !stopped) frame = requestAnimationFrame(loop);
    });
    visible.observe(canvas);
    return () => {
      sized.disconnect();
      visible.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [ready]);

  return (
    <canvas
      ref={ref}
      role="img"
      aria-label={`${fmt(run.linesIn)} log lines shown as blocks, collapsing into ${run.linesOut} summary lines`}
      className={`font-mono transition-opacity duration-500 ${ready ? "opacity-100" : "opacity-0"} ${className}`}
    />
  );
}
