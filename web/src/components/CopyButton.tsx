"use client";

import { useState } from "react";

/** A small "Copy" button that copies `text` and briefly says "Copied". */
export function CopyButton({ text, className = "" }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard can be blocked (e.g. insecure context); the command is still visible to copy by hand.
    }
  }

  return (
    <button type="button" onClick={copy} className={className} aria-live="polite">
      {copied ? "Copied" : "Copy"}
    </button>
  );
}
