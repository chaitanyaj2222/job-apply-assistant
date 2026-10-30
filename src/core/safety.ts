// Every click the extension makes goes through safeClick. It refuses anything that looks like a final
// submit, so the extension can never send an application on its own. Do not call .click() elsewhere;
// safety.test.ts scans the source to enforce that.

export class SafetyError extends Error {
  override name = "SafetyError";
}

// Visible wording of a final-submit control ("Submit", "Submit Application", ...).
// Matches words only: internal ids such as "createAccountSubmitButton" are not checked.
const SUBMIT_TEXT = /\bsubmit\b/i;

/** The clickable element that `el` belongs to (a click on a button's inner <span> lands on the button). */
function clickable(el: Element): Element {
  return el.closest('button, a, [role="button"], input[type="submit"], input[type="button"]') ?? el;
}

function describes(el: Element): string[] {
  return [
    el.textContent ?? "",
    el.getAttribute("aria-label") ?? "",
    el.getAttribute("title") ?? "",
    el.getAttribute("value") ?? "",
  ];
}

/** Why a click on `el` would be refused, or null if it's allowed. */
export function clickRefusal(el: Element, denySelectors: readonly string[] = []): string | null {
  const target = clickable(el);
  for (const candidate of new Set([el, target])) {
    if (describes(candidate).some((t) => SUBMIT_TEXT.test(t))) {
      return `refused to click a submit control ("${(candidate.textContent ?? "").trim().slice(0, 40)}")`;
    }
    const denied = denySelectors.find((sel) => candidate.matches(sel) || candidate.closest(sel));
    if (denied) return `refused to click a deny-listed control (${denied})`;
  }
  return null;
}

/**
 * Clicks `el` unless it is a submit control. Throws SafetyError instead of clicking.
 * Sends the pointer/mouse down-up events a real click produces first, since some widgets
 * (e.g. dropdowns) open on mousedown rather than click.
 */
export function safeClick(el: Element, denySelectors: readonly string[] = []): void {
  const refusal = clickRefusal(el, denySelectors);
  if (refusal) throw new SafetyError(refusal);
  const win = el.ownerDocument.defaultView;
  const PointerEv = win?.PointerEvent ?? win?.MouseEvent ?? MouseEvent;
  const MouseEv = win?.MouseEvent ?? MouseEvent;
  const init = { bubbles: true, cancelable: true, composed: true, button: 0 };
  el.dispatchEvent(new PointerEv("pointerdown", init));
  el.dispatchEvent(new MouseEv("mousedown", init));
  el.dispatchEvent(new PointerEv("pointerup", init));
  el.dispatchEvent(new MouseEv("mouseup", init));
  (el as HTMLElement).click();
}
