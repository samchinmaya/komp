import demosJson from "./demos.json";

/** One example log: a preview of the raw input and komp's real output. */
export type Demo = {
  key: string;
  label: string;
  about: string;
  rawPreview: string;
  rawLines: number;
  rawTokens: number;
  output: string;
  outLines: number;
  outTokens: number;
};

export const demos: Demo[] = demosJson;

export const links = {
  github: "https://github.com/samchinmaya/komp",
  releases: "https://github.com/samchinmaya/komp/releases/latest",
  readme: "https://github.com/samchinmaya/komp/blob/master/README.md",
  issues: "https://github.com/samchinmaya/komp/issues",
  author: "https://github.com/samchinmaya",
};

export const version = "v0.1.0";

export const commands = {
  install: "curl -fsSL https://raw.githubusercontent.com/samchinmaya/komp/master/install.sh | sh",
  cargo: "cargo install --git https://github.com/samchinmaya/komp",
  connect: "claude mcp add --scope user komp -- komp serve",
  team: '{ "mcpServers": { "komp": { "command": "komp", "args": ["serve"] } } }',
  cli: "komp                       # compress the clipboard\nkomp app.log               # compress a file\nkubectl logs api | komp -  # compress stdin",
};

export const stats = [
  { value: "2,001 → 11", label: "lines, Go outage log" },
  { value: "99%+", label: "fewer tokens on every test log" },
  { value: "5", label: "platforms: macOS, Linux, Windows" },
  { value: "0 bytes", label: "sent over the network" },
];

export const statsNote =
  "Numbers come from the four test logs in the repo. Token counts are estimates (~4 characters per token).";

export const steps = [
  { title: "Copy the logs", body: "From kubectl, Docker, Grafana, CI output, anywhere. Just Cmd+C." },
  { title: "Ask Claude", body: "“What's wrong in the logs I copied?” No pasting, so no thousands of tokens up front." },
  {
    title: "Claude reads the summary",
    body: "Claude calls compress_clipboard. комп reads your clipboard locally and returns a few hundred tokens.",
  },
];

export const features = [
  {
    title: "Errors keep their details",
    body: "Warnings and errors list their actual values and keep their stack traces.",
    example: 'ERROR query failed err="dial tcp 10.0.3.17:5432: connection refused" ×200',
  },
  {
    title: "Bursts get their own line",
    body: "A value seen only during one stretch is split out with its own time range.",
    example: "10:04:06–10:06:49 GET /api/orders/… status=503 ×100",
  },
  {
    title: "Stack traces, folded",
    body: "Printed once per group. Runs of framework frames collapse into one line.",
    example: "at ShippingService.quote(ShippingService.java:57)\n… 12 framework frames",
  },
  {
    title: "Order survives",
    body: "Every entry carries its first and last timestamp, so cause and effect stay visible.",
    example: "10:00:01–10:00:07 INFO GET /health 200 1–3ms ×4",
  },
  {
    title: "Shared fields, said once",
    body: "A pod name or service=orders on every line moves into the header.",
    example: "[komp] 2001 lines → 9 entries · service=orders",
  },
  {
    title: "Nothing silently dropped",
    body: "If there are too many patterns, the rarest low-severity ones go, and the output says so.",
    example: "… 120 rarer low-severity patterns omitted (450 lines)",
  },
];

export const formats = [
  "plain text",
  "JSON · pino",
  "logfmt",
  "klog · kubelet",
  "syslog",
  "Spring Boot",
  "Java stack traces",
  "Python tracebacks",
  "kubectl --timestamps",
];

export const tools = [
  { name: "compress_clipboard", args: "max_entries?", source: "whatever you copied" },
  { name: "compress_file", args: "path, max_entries?", source: "a log file on your machine" },
  {
    name: "compress_kubectl_logs",
    args: "pod, namespace?, container?, since?, tail?, previous?",
    source: "kubectl logs --timestamps with your current kube context",
  },
];

export const faqs = [
  {
    q: "Does комп send my logs anywhere?",
    a: "No. It's a local program. It reads your clipboard, a file or kubectl on your machine and returns text to Claude Code over stdin/stdout. It makes no network requests.",
  },
  {
    q: "Why not just paste the logs into Claude?",
    a: "Everything you paste is read, and billed, in full before any tool runs. A 2,000-line log is tens of thousands of tokens. With комп the raw logs never enter the conversation; only the summary does.",
  },
  {
    q: "Doesn't compression lose information?",
    a: "It removes repetition, not meaning. Identical lines merge with a count, varying values become ranges or short lists, and errors keep their values and stack traces. When something is dropped for space, the output says how much.",
  },
  { q: "Does it work without Claude?", a: "Yes. komp is a normal command-line tool: run it on a file, on stdin or on your clipboard." },
  { q: "Is it free?", a: "Yes. MIT licensed and open source on GitHub." },
];

export const fmt = (n: number) => n.toLocaleString("en-US");
export const saving = (d: Demo) => (100 * (1 - d.outTokens / d.rawTokens)).toFixed(1);
