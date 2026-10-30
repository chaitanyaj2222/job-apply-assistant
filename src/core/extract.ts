// Generic, ATS-agnostic extraction helpers.
// Uses tagName / attribute checks instead of `instanceof` so it works on documents
// from other realms (iframes in the dev harness, DOMParser documents in tests).

import type { FieldType, FieldValueData } from "./types";

const tag = (el: Element) => el.tagName.toLowerCase();

/** Visible text of an element: <br> becomes a space, "*" required markers are dropped, whitespace collapsed. */
export function cleanText(el: Element | null | undefined): string {
  if (!el) return "";
  const clone = el.cloneNode(true) as Element;
  clone.querySelectorAll("br").forEach((br) => br.replaceWith(" "));
  clone.querySelectorAll("abbr").forEach((a) => {
    if (a.textContent?.trim() === "*") a.remove();
  });
  return (clone.textContent ?? "").replace(/\s+/g, " ").trim().replace(/\s*\*$/, "");
}

function byId(root: ParentNode, id: string): Element | null {
  const doc = (root as Node).ownerDocument ?? (root as Document);
  return doc.getElementById(id);
}

/** The element that labels `control`, searching `scope` first for <label for>. */
export function labelElementFor(control: Element, scope: ParentNode = control.ownerDocument): Element | null {
  const id = control.getAttribute("id");
  if (id) {
    const match = [...scope.querySelectorAll("label[for]")].find((l) => l.getAttribute("for") === id);
    if (match) return match;
  }
  const wrapping = control.closest("label");
  if (wrapping) return wrapping;
  const legend = control.closest("fieldset")?.querySelector(":scope > legend");
  if (legend) return legend;
  const labelledBy = control.getAttribute("aria-labelledby");
  if (labelledBy) {
    const el = byId(control.ownerDocument, labelledBy.split(/\s+/)[0]!);
    if (el) return el;
  }
  return null;
}

export function labelFor(control: Element, scope?: ParentNode): string {
  const text = cleanText(labelElementFor(control, scope));
  return text || (control.getAttribute("aria-label") ?? "").trim();
}

/** Required if the control says so, or its label carries a "*" marker. */
export function isRequired(control: Element, labelEl: Element | null): boolean {
  if (control.getAttribute("aria-required") === "true" || control.hasAttribute("required")) return true;
  return [...(labelEl?.querySelectorAll("abbr") ?? [])].some((a) => a.textContent?.trim() === "*");
}

export function isHidden(el: Element): boolean {
  return Boolean(el.closest("[hidden], [aria-hidden='true']"));
}

const TEXT_INPUT_TYPES = new Set(["text", "email", "tel", "url", "number", "search", ""]);

/** Stands in for a filled password so the real one never leaves the input. */
export const PASSWORD_MASK = "********";

/** Classifies a native control; null for things we don't fill (buttons, hidden, password, ...). */
export function nativeType(el: Element): FieldType | null {
  switch (tag(el)) {
    case "textarea":
      return "textarea";
    case "select":
      return "select";
    case "input": {
      const type = (el.getAttribute("type") ?? "").toLowerCase();
      if (type === "checkbox") return "checkbox";
      if (type === "radio") return "radio";
      if (type === "file") return "file";
      if (type === "password") return "password";
      return TEXT_INPUT_TYPES.has(type) ? "text" : null;
    }
    default:
      return null;
  }
}

/** Current value of a native control (radios: pass the group's inputs to radioValue instead). */
export function nativeValue(el: Element): FieldValueData {
  const input = el as HTMLInputElement;
  switch (nativeType(el)) {
    case "checkbox":
      return input.checked;
    case "file":
      return [...(input.files ?? [])].map((f) => f.name);
    case "password":
      return input.value ? PASSWORD_MASK : "";
    case "select": {
      const select = el as HTMLSelectElement;
      return select.selectedIndex >= 0 ? cleanText(select.options[select.selectedIndex]) : "";
    }
    default:
      return input.value ?? "";
  }
}

export function selectOptions(el: Element): string[] {
  return [...(el as HTMLSelectElement).options].map((o) => cleanText(o)).filter(Boolean);
}

/** Options and checked value of a radio group, using each radio's own label. */
export function radioGroup(radios: Element[], scope: ParentNode): { options: string[]; value: string } {
  const labelled = radios.map((r) => ({ label: labelFor(r, scope), checked: (r as HTMLInputElement).checked }));
  return { options: labelled.map((r) => r.label), value: labelled.find((r) => r.checked)?.label ?? "" };
}
