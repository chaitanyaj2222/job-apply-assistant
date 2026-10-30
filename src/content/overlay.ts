// On-page status pill + highlight legend, rendered in a closed Shadow DOM so the site's CSS
// can't restyle it and its styles can't leak into the site.

import { HIGHLIGHT_COLORS, HIGHLIGHT_LABELS, type HighlightKind } from "../core/highlight";

const HOST_ID = "job-apply-assistant-overlay";

const STYLE = `
  :host { all: initial; }
  .pill { position: fixed; right: 16px; bottom: 16px; z-index: 2147483647; max-width: 340px;
    font: 13px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif; color: #0f172a;
    background: #fff; border: 1px solid #cbd5e1; border-radius: 10px; box-shadow: 0 6px 24px rgba(15,23,42,.18);
    padding: 12px 14px; }
  .head { display: flex; justify-content: space-between; align-items: center; gap: 12px; font-weight: 600; }
  .close { all: unset; cursor: pointer; color: #64748b; font-size: 16px; line-height: 1; padding: 2px 4px; }
  .close:hover { color: #0f172a; }
  .lines { margin: 6px 0 0; }
  .todo { margin: 6px 0 0; padding-left: 18px; max-height: 160px; overflow: auto; }
  .todo li { margin: 2px 0; }
  .muted { color: #64748b; }
  .legend { display: flex; flex-wrap: wrap; gap: 4px 12px; margin-top: 8px; padding-top: 8px; border-top: 1px solid #e2e8f0; font-size: 12px; }
  .swatch { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 4px; vertical-align: -1px; }
`;

export interface OverlayContent {
  title: string;
  lines: string[];
  todo?: { label: string; hint?: string }[];
  legend?: HighlightKind[];
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

let root: ShadowRoot | null = null;

function ensureRoot(): ShadowRoot {
  if (root && document.getElementById(HOST_ID)) return root;
  const host = document.createElement("div");
  host.id = HOST_ID;
  document.documentElement.append(host);
  root = host.attachShadow({ mode: "closed" });
  return root;
}

export function showOverlay(content: OverlayContent): void {
  const shadow = ensureRoot();
  shadow.replaceChildren();
  shadow.append(Object.assign(document.createElement("style"), { textContent: STYLE }));

  const pill = el("div", "pill");
  const head = el("div", "head");
  head.append(el("span", undefined, content.title));
  const close = el("button", "close", "×");
  close.setAttribute("aria-label", "Close");
  close.addEventListener("click", hideOverlay);
  head.append(close);
  pill.append(head);

  const lines = el("div", "lines");
  for (const line of content.lines) lines.append(el("div", undefined, line));
  pill.append(lines);

  if (content.todo?.length) {
    const list = el("ul", "todo");
    for (const item of content.todo) {
      const li = el("li", undefined, item.label);
      if (item.hint) li.append(el("span", "muted", ` (${item.hint})`));
      list.append(li);
    }
    pill.append(list);
  }

  if (content.legend?.length) {
    const legend = el("div", "legend");
    for (const kind of content.legend) {
      const item = el("span");
      const swatch = el("span", "swatch");
      swatch.style.background = HIGHLIGHT_COLORS[kind];
      item.append(swatch, HIGHLIGHT_LABELS[kind]);
      legend.append(item);
    }
    pill.append(legend);
  }

  shadow.append(pill);
}

export function hideOverlay(): void {
  document.getElementById(HOST_ID)?.remove();
  root = null;
}
