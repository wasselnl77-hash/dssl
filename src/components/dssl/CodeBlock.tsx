"use client";

import { useState } from "react";
import { highlightDssl } from "./highlight";
import { CheckIcon, CopyIcon } from "./icons";

export default function CodeBlock({
  code,
  file,
  plain = false,
}: {
  code: string;
  file?: string;
  plain?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch { /* clipboard unavailable */ }
  };

  const body = (
    <pre className={`code${plain ? " code-plain" : ""}`}>
      <code dangerouslySetInnerHTML={{ __html: highlightDssl(code) }} />
    </pre>
  );

  if (!file) return body;

  return (
    <div>
      <div className="code-head">
        <span>{file}</span>
        <button type="button" className="copy-btn" onClick={copy} aria-label="Copy code">
          {copied ? <CheckIcon /> : <CopyIcon />}
          {copied ? "copied" : "copy"}
        </button>
      </div>
      {body}
    </div>
  );
}
