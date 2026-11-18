import { Fragment } from "react";

/** Tailwind classes for each kind of token in komp's output. */
export type Palette = {
  text: string;
  header: string;
  time: string;
  error: string;
  warn: string;
  info: string;
  slot: string;
  count: string;
  trace: string;
};

export const darkPalette: Palette = {
  text: "text-paper",
  header: "text-signal",
  time: "text-faint",
  error: "text-err font-semibold",
  warn: "text-warn font-semibold",
  info: "text-muted",
  slot: "text-slot",
  count: "text-signal font-semibold",
  trace: "text-faint",
};

const TIME = /^(\d{2}(?:-\d{2})?[: ]\d{2}:\d{2}(?::\d{2})?(?:–[\d:\- ]+)?)/;
const TOKEN = /(\b(?:ERROR|FATAL)\b|\bWARN\b|\b(?:INFO|DEBUG)\b|\{[^{}]*\}| ×\d+$)/;

function Line({ line, p }: { line: string; p: Palette }) {
  if (/^\[komp\]|^levels:/.test(line)) return <span className={p.header}>{line}</span>;
  if (/^ {4}/.test(line)) return <span className={p.trace}>{line}</span>;

  const time = line.match(TIME)?.[0] ?? "";
  const rest = line.slice(time.length);
  const parts = rest.split(TOKEN);
  return (
    <>
      {time && <span className={p.time}>{time}</span>}
      {parts.map((part, i) => {
        if (i % 2 === 0) return <Fragment key={i}>{part}</Fragment>;
        const cls = /ERROR|FATAL/.test(part)
          ? p.error
          : part === "WARN"
            ? p.warn
            : /INFO|DEBUG/.test(part)
              ? p.info
              : part.startsWith("{")
                ? p.slot
                : p.count;
        return (
          <span key={i} className={cls}>
            {part}
          </span>
        );
      })}
    </>
  );
}

/** komp's output with levels, counts, value slots and timestamps coloured. */
export function LogOutput({ text, palette = darkPalette }: { text: string; palette?: Palette }) {
  return (
    <>
      {text.split("\n").map((line, i) => (
        <Fragment key={i}>
          <Line line={line} p={palette} />
          {"\n"}
        </Fragment>
      ))}
    </>
  );
}
