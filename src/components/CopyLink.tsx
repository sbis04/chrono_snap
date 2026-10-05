import { useState } from "react";

export function inviteUrl(code: string) {
  return `${window.location.origin}/${code}`;
}

function legacyCopy(text: string) {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  const ok = document.execCommand("copy");
  ta.remove();
  return ok;
}

/**
 * Copy with the async clipboard API, falling back to execCommand if it is
 * unavailable, rejects, or hangs (some browsers stall on a permission prompt).
 */
async function copyText(text: string) {
  if (!navigator.clipboard?.writeText) return legacyCopy(text);
  const timeout = new Promise<"timeout">((r) => setTimeout(() => r("timeout"), 800));
  try {
    const result = await Promise.race([navigator.clipboard.writeText(text).then(() => "ok" as const), timeout]);
    return result === "ok" ? true : legacyCopy(text);
  } catch {
    return legacyCopy(text);
  }
}

/** The room's invite link as a single click-to-copy pill. */
export function CopyLink({ code, size = "md" }: { code: string; size?: "sm" | "md" | "lg" }) {
  const [copied, setCopied] = useState(false);
  const url = inviteUrl(code);
  const onCopy = async () => {
    if (await copyText(url)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }
  };
  return (
    <button className={`copy-link copy-link-${size} ${copied ? "is-copied" : ""}`} onClick={onCopy} title="Copy invite link">
      <span className="copy-link-url">
        {window.location.host}/<b>{code}</b>
      </span>
      <span className="copy-link-action" aria-live="polite">
        {copied ? "✓ Copied!" : "Copy link"}
      </span>
    </button>
  );
}
