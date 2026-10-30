// Outlines fields to show what the extension did. Styles go inline on the site's own field
// containers (a Shadow DOM can't wrap them); the previous inline values are saved and restored.

export type HighlightKind = "filled" | "ai" | "lowConfidence" | "needsYou";

export const HIGHLIGHT_COLORS: Record<HighlightKind, string> = {
  filled: "#16a34a", // green: filled from your profile
  ai: "#eab308", // yellow: filled by the AI
  lowConfidence: "#f97316", // orange: AI answer with confidence < 0.7
  needsYou: "#dc2626", // red: required and still empty
};

export const HIGHLIGHT_LABELS: Record<HighlightKind, string> = {
  filled: "Filled from your profile",
  ai: "Filled by AI: check it",
  lowConfidence: "AI unsure: check carefully",
  needsYou: "Required: needs you",
};

const ATTR = "data-jaa-highlight";
const SAVED = "data-jaa-saved-style";

export function highlight(el: HTMLElement, kind: HighlightKind): void {
  if (!el.hasAttribute(SAVED)) {
    el.setAttribute(SAVED, JSON.stringify({ outline: el.style.outline, outlineOffset: el.style.outlineOffset, borderRadius: el.style.borderRadius }));
  }
  el.setAttribute(ATTR, kind);
  el.style.outline = `2px solid ${HIGHLIGHT_COLORS[kind]}`;
  el.style.outlineOffset = "4px";
  el.style.borderRadius = "4px";
}

export function clearHighlights(doc: Document): void {
  doc.querySelectorAll<HTMLElement>(`[${ATTR}]`).forEach((el) => {
    const saved = JSON.parse(el.getAttribute(SAVED) ?? "{}") as Partial<CSSStyleDeclaration>;
    el.style.outline = saved.outline ?? "";
    el.style.outlineOffset = saved.outlineOffset ?? "";
    el.style.borderRadius = saved.borderRadius ?? "";
    el.removeAttribute(ATTR);
    el.removeAttribute(SAVED);
  });
}
