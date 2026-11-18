import comparison from "@/data/comparison.json";
import { fmt } from "@/data/site";

/*
 * The measured half comes from scripts/compare.py. The table of other tools is
 * written by hand from each project's public page, so it carries the date it
 * was checked and says those tools were not run.
 */

const { factCount, facts, methods } = comparison;
const KOMP_COLOR = "#3a90ea";
const CHECKED = "18 November 2026";
const FACT_COLUMNS = [
  ["uniq", "sort | uniq -c"],
  ["grep", "grep"],
  ["tail", "tail"],
  ["komp", "комп"],
] as const;

const largest = Math.max(...methods.map((method) => method.tokens));
const raw = methods.find((method) => method.key === "raw")!;
const komp = methods.find((method) => method.key === "komp")!;
const kompSaving = (100 * (1 - komp.tokens / raw.tokens)).toFixed(1);

const TOOLS = [
  { name: "комп", href: "", handles: "Logs", input: "Clipboard, files, piped input, kubectl", needs: "One binary", secrets: "Removed on your machine", stated: `${kompSaving}% on its test logs` },
  { name: "RTK", href: "https://github.com/rtk-ai/rtk", handles: "Output of many shell commands", input: "Commands the agent runs", needs: "One binary", secrets: "Listed for RTK Pro", stated: "60–90%" },
  { name: "Log Reducer", href: "https://github.com/imankha/log-reducer", handles: "Logs", input: "Files, piped input, clipboard through /logdump", needs: "Node.js", secrets: "Not stated, but shortens IDs and tokens", stated: "70–90%" },
  { name: "log-essence", href: "https://pypi.org/project/log-essence/", handles: "Logs", input: "Files, piped input, Docker, journald", needs: "Python 3.11+", secrets: "Redacted before analysis", stated: "50%+" },
];

const HEAD = "px-4 py-3 font-normal";
const CELL = "px-4 py-3 text-soft";

export function Comparison() {
  return (
    <div className="mt-8">
      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-8 min-[901px]:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] min-[901px]:gap-16">
        <div>
          <p className="max-w-[520px] text-[17px] leading-relaxed text-soft">
            Shell shortcuts use fewer tokens than the whole log, but they drop facts or barely shrink it. In the Go outage log, the 503 responses are logged as INFO, so grep misses all 100 of them. tail keeps only the final fatal error from the outage. комп keeps
            both, with the time range.
          </p>
          <p className="mt-4 max-w-[520px] text-[13.5px] leading-relaxed text-dim">
            Measured on the four test logs in the repository. The {factCount} facts come from комп&apos;s own tests and комп was built against these logs, so expect smaller gaps on other logs. Tokens are estimated at about 4 characters each.
          </p>
        </div>

        <ul className="border-b border-rule">
          {methods.map((method) => {
            const isKomp = method.key === "komp";
            return (
              <li key={method.key} className="border-t border-rule py-3.5">
                <div className="flex items-baseline justify-between gap-4 text-[14.5px]">
                  <span className={`min-w-0 ${isKomp ? "font-medium" : "text-soft"}`}>{method.label}</span>
                  <span className={`shrink-0 font-mono text-[13px] ${method.kept === factCount ? "text-soft" : "text-snow"}`}>
                    {method.kept} of {factCount} facts
                  </span>
                </div>
                <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-snow/10" aria-hidden="true">
                  <div className={`h-full min-w-1 rounded-full ${isKomp ? "" : "bg-snow/40"}`} style={{ width: `${(100 * method.tokens) / largest}%`, background: isKomp ? KOMP_COLOR : undefined }} />
                </div>
                <p className="mt-2 font-mono text-[12px] text-dim">~{fmt(method.tokens)} tokens</p>
              </li>
            );
          })}
        </ul>
      </div>

      <details className="mt-4 text-[13.5px] text-dim">
        <summary className="cursor-pointer py-1">The {factCount} facts, one by one</summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-left text-[13px]">
            <thead>
              <tr className="border-b border-rule font-mono text-[12px]">
                <th scope="col" className="py-2 pr-4 font-normal">log</th>
                <th scope="col" className="py-2 pr-4 font-normal">fact</th>
                {FACT_COLUMNS.map(([key, label]) => (
                  <th key={key} scope="col" className="py-2 pr-4 font-normal">{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {facts.map((item) => (
                <tr key={`${item.log}-${item.fact}`} className="border-b border-rule text-soft">
                  <td className="py-2 pr-4">{item.log}</td>
                  <th scope="row" className="py-2 pr-4 font-normal">{item.fact}</th>
                  {FACT_COLUMNS.map(([key]) => (
                    <td key={key} className={`py-2 pr-4 font-mono text-[12px] ${item.kept[key] ? "text-dim" : "text-snow"}`}>
                      {item.kept[key] ? "kept" : "lost"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      <div className="mt-10 overflow-x-auto rounded-2xl border border-rule bg-panel">
        <table className="w-full min-w-[820px] border-collapse text-left text-[14px]">
          <caption className="px-4 pt-4 text-left text-[15px]">Similar tools</caption>
          <thead>
            <tr className="border-b border-rule font-mono text-[12px] text-dim">
              <th scope="col" className={HEAD}>tool</th>
              <th scope="col" className={HEAD}>made for</th>
              <th scope="col" className={HEAD}>takes</th>
              <th scope="col" className={HEAD}>needs</th>
              <th scope="col" className={HEAD}>secrets</th>
              <th scope="col" className={HEAD}>stated reduction</th>
            </tr>
          </thead>
          <tbody>
            {TOOLS.map((tool) => (
              <tr key={tool.name} className="border-b border-rule align-top last:border-b-0">
                <th scope="row" className="whitespace-nowrap px-4 py-3 font-medium">
                  {tool.href ? (
                    <a href={tool.href} className="font-normal underline decoration-snow/30 underline-offset-4 transition-colors hover:decoration-snow">
                      {tool.name}
                    </a>
                  ) : (
                    tool.name
                  )}
                </th>
                <td className={CELL}>{tool.handles}</td>
                <td className={CELL}>{tool.input}</td>
                <td className={`${CELL} whitespace-nowrap`}>{tool.needs}</td>
                <td className={CELL}>{tool.secrets}</td>
                <td className={`${CELL} font-mono text-[13px]`}>{tool.stated}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-3 max-w-[760px] text-[13.5px] leading-relaxed text-dim">
        Other tools&apos; details come from their public project pages, checked on {CHECKED}. They were not run here. Each figure comes from different logs, so the percentages cannot be compared directly.
      </p>
    </div>
  );
}
