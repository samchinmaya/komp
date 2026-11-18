import evidence from "./evidence.json";

/*
 * The real Claude Code run captured by scripts/record_claude_demo.py.
 * The numbers are read from komp's own status line, so the page cannot drift
 * away from what was recorded.
 */

const output = evidence.result.trim().split("\n");

/** komp's two status lines, as Claude received them. */
export const runStatus = output.slice(-2);

/** The summary lines Claude received. */
export const runSummary = output.slice(0, -2);

const [linesIn, linesOut, tokensIn, tokensOut] = runStatus[0]
  .match(/(\d+) → (\d+) lines, ~(\d+) → ~(\d+) tokens/)!
  .slice(1)
  .map(Number);

export const run = {
  linesIn,
  linesOut,
  tokensIn,
  tokensOut,
  saved: `${(100 * (1 - tokensOut / tokensIn)).toFixed(1)}%`,
};

export { evidence };
