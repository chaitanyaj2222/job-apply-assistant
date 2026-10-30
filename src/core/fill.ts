// Generic fillers for React-driven forms. React tracks input values itself, so a plain
// `el.value = x` can be ignored; we call the native prototype setter and dispatch the events
// React listens for. Each filler verifies the result and throws FillError if it didn't stick.

import { safeClick } from "./safety";

export class FillError extends Error {
  override name = "FillError";
}

type ValueElement = HTMLInputElement | HTMLTextAreaElement;

const fire = (el: Element, type: string) =>
  el.dispatchEvent(new Event(type, { bubbles: true, cancelable: type !== "blur" }));

/** Native `value` setter from the element's own realm (iframes and content scripts have their own prototypes). */
function nativeValueSetter(el: ValueElement): (v: string) => void {
  const win = el.ownerDocument.defaultView as (Window & typeof globalThis) | null;
  const proto =
    el.tagName === "TEXTAREA"
      ? (win?.HTMLTextAreaElement ?? HTMLTextAreaElement).prototype
      : (win?.HTMLInputElement ?? HTMLInputElement).prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  if (!setter) throw new FillError("no native value setter");
  return (v) => setter.call(el, v);
}

/**
 * Moves focus into / out of `el` the way a click does. Forms like Workday commit and validate a value
 * when the field loses focus, and React only hears focusin/focusout. Real focus()/blur() is tried first;
 * if it fires nothing (the tab isn't focused while the popup is open), focus events are dispatched.
 */
function moveFocus(el: Element, direction: "in" | "out"): void {
  const bubbling = direction === "in" ? "focusin" : "focusout";
  let fired = false;
  const mark = () => (fired = true);
  el.addEventListener(bubbling, mark);
  if (direction === "in") (el as HTMLElement).focus?.();
  else (el as HTMLElement).blur?.();
  el.removeEventListener(bubbling, mark);
  if (fired) return;
  const FocusEv = el.ownerDocument.defaultView?.FocusEvent ?? FocusEvent;
  el.dispatchEvent(new FocusEv(direction === "in" ? "focus" : "blur", { composed: true }));
  el.dispatchEvent(new FocusEv(bubbling, { bubbles: true, composed: true }));
}

export const enterField = (el: Element) => moveFocus(el, "in");
/** Leaves a field so the page commits and validates its value, as clicking elsewhere would. */
export const leaveField = (el: Element) => moveFocus(el, "out");

export function setNativeValue(el: ValueElement, value: string): void {
  enterField(el);
  nativeValueSetter(el)(value);
  fire(el, "input");
  fire(el, "change");
  leaveField(el);
  if (el.value !== value) throw new FillError(`value did not stick (wanted "${value}", got "${el.value}")`);
}

/** Ticks or unticks a checkbox (or selects a radio) by clicking it, as a user would. */
export function setChecked(el: HTMLInputElement, checked: boolean): void {
  if (el.checked === checked) return;
  enterField(el);
  safeClick(el);
  leaveField(el);
  if (el.checked !== checked) throw new FillError(`checkbox did not ${checked ? "tick" : "untick"}`);
}

/**
 * Types `text` one character at a time (keydown, value change, input, keyup) and stays in the field:
 * no change/blur, which would close a type-ahead suggestion list. Replaces any existing text.
 */
export function typeText(el: ValueElement, text: string): void {
  const win = el.ownerDocument.defaultView;
  const KeyEv = win?.KeyboardEvent ?? KeyboardEvent;
  const InputEv = win?.InputEvent ?? InputEvent;
  const set = nativeValueSetter(el);
  enterField(el);
  if (el.value) {
    set("");
    el.dispatchEvent(new InputEv("input", { bubbles: true, inputType: "deleteContentBackward" }));
  }
  for (const ch of text) {
    const key = { key: ch, bubbles: true, cancelable: true, composed: true };
    el.dispatchEvent(new KeyEv("keydown", key));
    set(el.value + ch);
    el.dispatchEvent(new InputEv("input", { bubbles: true, data: ch, inputType: "insertText" }));
    el.dispatchEvent(new KeyEv("keyup", key));
  }
  if (el.value !== text) throw new FillError(`typing didn't stick (wanted "${text}", got "${el.value}")`);
}

/** Sends keydown/keyup for a named key ("Enter", "Escape", "ArrowDown") the way a keyboard would. */
export function pressKey(el: Element, key: string): void {
  const win = el.ownerDocument.defaultView;
  const KeyEv = win?.KeyboardEvent ?? KeyboardEvent;
  const keyCode = { Enter: 13, Escape: 27, ArrowDown: 40, Tab: 9 }[key] ?? 0;
  const init = { key, code: key, keyCode, which: keyCode, bubbles: true, cancelable: true, composed: true };
  el.dispatchEvent(new KeyEv("keydown", init));
  el.dispatchEvent(new KeyEv("keyup", init));
}

/** Random pause between fields so the site's own handlers keep up. */
export function jitter([min, max]: readonly [number, number] = [100, 300]): Promise<void> {
  const ms = min + Math.random() * (max - min);
  return ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve();
}

/**
 * Resolves with the predicate's first truthy result, re-checking on every DOM change.
 * Rejects after `timeoutMs`. Used for SPA steps that render after a click.
 */
export function waitFor<T>(predicate: () => T | null | undefined | false, timeoutMs = 10_000, root: Node = document): Promise<T> {
  return new Promise((resolve, reject) => {
    const first = predicate();
    if (first) return resolve(first);
    const observer = new MutationObserver(() => {
      const result = predicate();
      if (result) {
        cleanup();
        resolve(result);
      }
    });
    // Also re-check on a timer, for predicates that depend on elapsed time ("results stopped changing").
    const poll = setInterval(() => {
      const result = predicate();
      if (result) {
        cleanup();
        resolve(result);
      }
    }, 200);
    const timer = setTimeout(() => {
      cleanup();
      reject(new FillError(`timed out after ${timeoutMs} ms`));
    }, timeoutMs);
    const cleanup = () => {
      observer.disconnect();
      clearInterval(poll);
      clearTimeout(timer);
    };
    observer.observe(root, { childList: true, subtree: true, attributes: true, characterData: true });
  });
}
