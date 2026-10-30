// Fillers for Workday's custom widgets. Markup comes from fixtures/degreeDropdownOpen.html,
// fixtures/skillsPromptOpen.html and fixtures/myExperience.html (dates). Every click goes through
// safeClick, and each filler verifies the page actually shows the new value before returning.

import { cleanText } from "../../core/extract";
import { FillError, leaveField, pressKey, setNativeValue, typeText, waitFor } from "../../core/fill";
import { safeClick } from "../../core/safety";
import { bestMatch, normalize } from "../../core/text";
import { SEL } from "./selectors";

export interface WidgetOptions {
  /** How long to wait for a popup, results or a re-render. */
  timeoutMs?: number;
}

export type WidgetOutcome = "filled" | "unchanged";

const settle = <T>(doc: Document, predicate: () => T | null | undefined | false, timeoutMs: number) =>
  waitFor(predicate, timeoutMs, doc).catch(() => null);

// ---- Dropdown (button + listbox) -------------------------------------------------------------

function openListbox(button: Element): Element | null {
  if (button.getAttribute("aria-expanded") !== "true") return null;
  const id = button.getAttribute("aria-controls");
  const list = id ? button.ownerDocument.getElementById(id) : null;
  return list?.getAttribute("role") === "listbox" ? list : null;
}

function closeListbox(button: Element): void {
  const list = openListbox(button);
  if (!list) return;
  pressKey(list, "Escape");
  if (openListbox(button)) safeClick(button);
}

export async function fillDropdown(container: Element, wanted: string, opts: WidgetOptions = {}): Promise<WidgetOutcome> {
  const timeout = opts.timeoutMs ?? 4000;
  const doc = container.ownerDocument;
  const button = container.querySelector(SEL.dropdownButton);
  const idInput = button?.parentElement?.querySelector<HTMLInputElement>(SEL.dropdownValueInput);
  if (!button) throw new FillError("dropdown button not found");

  if (!openListbox(button)) safeClick(button);
  let list = await settle(doc, () => openListbox(button), timeout);
  if (!list) {
    // Some listbox buttons open from the keyboard only.
    pressKey(button, "ArrowDown");
    list = await settle(doc, () => openListbox(button), timeout);
  }
  if (!list) throw new FillError("dropdown didn't open");

  const options = [...list.querySelectorAll<HTMLElement>(SEL.dropdownOption)];
  const labels = options.map((o) => cleanText(o));
  const i = bestMatch(labels, wanted);
  if (i < 0) {
    closeListbox(button);
    throw new FillError(`no option matching "${wanted}"`);
  }
  const option = options[i]!;
  const optionId = option.getAttribute("data-value") ?? "";
  safeClick(option);

  const stuck = await settle(
    doc,
    () => (optionId && idInput?.value === optionId) || normalize(cleanText(button)) === normalize(labels[i]!),
    timeout,
  );
  if (!stuck) {
    closeListbox(button);
    throw new FillError(`picked "${labels[i]}" but the page didn't keep it`);
  }
  leaveField(button);
  return "filled";
}

// ---- Prompt (searchable picker with pills) ----------------------------------------------------

const selectedLabels = (prompt: Element) =>
  [...prompt.querySelectorAll(SEL.promptSelectedLabel)].map((p) => p.getAttribute("data-automation-label") ?? cleanText(p));

const rowLabel = (row: Element) => {
  const label = row.matches(SEL.promptResultLabel) ? row : row.querySelector(SEL.promptResultLabel);
  return label?.getAttribute("data-automation-label") ?? cleanText(label ?? row);
};

// Only the text identifies the placeholder: live suggestion rows carry the same NO_METADATA_ID
// instance id as the "No Items." row, so the id can't tell them apart.
const isPlaceholderRow = (row: Element) => /^no items\.?$/i.test(rowLabel(row));

/** Result rows in an open prompt list, minus the "No Items." placeholder. */
const resultRows = (popup: Element) =>
  [...popup.querySelectorAll<HTMLElement>(SEL.promptRow)].filter((r) => !isPlaceholderRow(r));

/** The most specific clickable part of a row (the leaf node in the captured markup). */
const clickTarget = (row: Element) => row.querySelector(SEL.promptResult) ?? row.querySelector(SEL.promptResultLabel) ?? row;

/** What the prompt looked like when a search found nothing, to tell "never opened" from "empty list". */
function describePrompt(h: ReturnType<typeof promptHandles>): string {
  const popup = h.popup();
  const typed = h.input()?.value ?? "";
  if (!popup) return `suggestion list never opened; search box had "${typed}"`;
  const rows = [...popup.querySelectorAll(SEL.promptRow)].map(rowLabel);
  return `suggestion list had ${rows.length} row(s)${rows.length ? `: ${rows.slice(0, 3).join(", ")}` : ""}; search box had "${typed}"`;
}

/**
 * Live handles for a prompt, re-found through the input's id on every call: Workday re-renders the
 * widget after a pick, so elements captured earlier can be detached copies that never update.
 */
function promptHandles(doc: Document, inputId: string) {
  const input = () => doc.getElementById(inputId) as HTMLInputElement | null;
  const prompt = () => input()?.closest(SEL.promptContainer) ?? null;
  const popup = () => {
    const p = prompt();
    return p?.id ? doc.querySelector(SEL.promptPopup(p.id)) : null;
  };
  return { input, prompt, popup };
}

/** How long to wait for as-you-type suggestions before pressing Enter to search. */
const TYPEAHEAD_WAIT_MS = 3000;

/** How long to wait after each way of picking a suggestion before trying the next. */
const PICK_RETRY_MS = 1500;

/** How long a result list must stay unchanged before we accept it without an exact hit. */
const RESULTS_STABLE_MS = 1500;

const same = (a: string, b: string) => normalize(a) === normalize(b);

/**
 * Which suggestion to pick for `value`, or -1. Exact first, then a unique partial match, then the first
 * suggestion that contains a word of the search ("TypeScript" for "Script"). Unrelated suggestions
 * (an alphabetical list that ignored the search) are never picked.
 */
function chooseSuggestion(labels: readonly string[], value: string): number {
  const exact = labels.findIndex((l) => same(l, value));
  if (exact >= 0) return exact;
  const partial = bestMatch(labels, value);
  if (partial >= 0) return partial;
  const words = normalize(value).split(" ").filter((w) => w.length >= 3);
  return labels.findIndex((l) => words.some((w) => normalize(l).includes(w)));
}

async function addPromptValue(doc: Document, inputId: string, value: string, timeout: number): Promise<void> {
  const h = promptHandles(doc, inputId);
  const input = h.input();
  if (!input) throw new FillError("search box disappeared");

  const selectedNow = () => {
    const p = h.prompt();
    return p ? selectedLabels(p) : [];
  };
  // Clicking an already-selected suggestion un-selects it in a multi-select, so those are never candidates.
  const listNow = () => {
    const popup = h.popup();
    const selected = selectedNow();
    return (popup ? resultRows(popup) : []).filter((r) => !selected.some((s) => same(s, rowLabel(r))));
  };
  const keyOf = (rows: Element[]) => rows.map(rowLabel).join("|");

  /**
   * Resolves with a list that answers this search: one containing an exact match, or one that has
   * changed from `staleKey` (what was showing before) and then stayed unchanged for a moment.
   */
  const waitForAnswer = (staleKey: string, ms: number) => {
    let lastKey = staleKey;
    let changedAt = Date.now();
    return settle(
      doc,
      () => {
        const rows = listNow();
        if (rows.some((r) => same(rowLabel(r), value))) return rows;
        const key = keyOf(rows);
        if (key === staleKey) return null;
        if (key !== lastKey) {
          lastKey = key;
          changedAt = Date.now();
          return null;
        }
        return rows.length && Date.now() - changedAt >= RESULTS_STABLE_MS ? rows : null;
      },
      ms,
    );
  };

  // Clicking an already-open prompt can close it; only click to open.
  if (!h.popup()) safeClick(input);
  else input.focus();
  const beforeTyping = keyOf(listNow());
  // Workday suggests as you type, so type like a user and stay in the box (leaving it closes the list).
  typeText(input, value);
  let rows = await waitForAnswer(beforeTyping, Math.min(timeout, TYPEAHEAD_WAIT_MS));
  let i = rows ? chooseSuggestion(rows.map(rowLabel), value) : -1;

  // Nothing useful from typing (no list, or one that ignored the search): run a full search with Enter.
  if (i < 0) {
    const typedRows = rows;
    const box = h.input();
    if (box) pressKey(box, "Enter");
    rows = (await waitForAnswer(keyOf(listNow()), timeout)) ?? typedRows;
    i = rows ? chooseSuggestion(rows.map(rowLabel), value) : -1;
  }
  if (!rows) throw new FillError(`no search results for "${value}" (${describePrompt(h)})`);
  if (i < 0) {
    throw new FillError(`no suggestion matching "${value}" (saw: ${rows.slice(0, 4).map(rowLabel).join(", ")})`);
  }

  const picked = rowLabel(rows[i]!);
  const isAdded = () => selectedNow().some((s) => same(s, picked));
  const quick = Math.min(timeout, PICK_RETRY_MS);

  // 1) Click the suggestion's leaf node, as in the captured markup.
  safeClick(clickTarget(rows[i]!));
  if (await settle(doc, isAdded, quick)) return;

  // 2) Click the whole row, in case the page listens there instead.
  const row = listNow().find((r) => same(rowLabel(r), picked));
  if (row && row !== clickTarget(row)) {
    safeClick(row);
    if (await settle(doc, isAdded, quick)) return;
  }

  // 3) Keyboard: arrow down to the suggestion and press Enter.
  const box = h.input();
  const position = listNow().findIndex((r) => same(rowLabel(r), picked));
  if (box && position >= 0) {
    box.focus();
    for (let n = 0; n <= position; n++) pressKey(box, "ArrowDown");
    pressKey(box, "Enter");
    if (await settle(doc, isAdded, timeout)) return;
  }
  throw new FillError(`picked "${picked}" but it wasn't added (tried clicking it and the keyboard)`);
}

/**
 * Selects `wanted` in a prompt. A list (e.g. skills) adds each missing item and keeps existing ones.
 * A single value is only added when the field is empty: an existing different choice is left for the
 * user rather than deleted.
 */
export async function fillPrompt(container: Element, wanted: string | string[], opts: WidgetOptions = {}): Promise<WidgetOutcome> {
  const timeout = opts.timeoutMs ?? 8000;
  const doc = container.ownerDocument;
  const firstInput = container.querySelector(SEL.promptContainer)?.querySelector<HTMLInputElement>(SEL.promptInput);
  if (!firstInput?.id) throw new FillError("search field not found");
  const h = promptHandles(doc, firstInput.id);

  const current = selectedLabels(h.prompt()!);
  const values = Array.isArray(wanted) ? wanted : [wanted];
  // Lists (skills) need an exact match to count as present: "SQL" isn't covered by "PostgreSQL".
  // A single value accepts a close match ("India" is already "India (+91)").
  const present = (v: string) => (Array.isArray(wanted) ? current.some((c) => same(c, v)) : bestMatch(current, v) >= 0);
  const missing = values.filter((v) => !present(v));
  if (!missing.length) return "unchanged";
  if (!Array.isArray(wanted) && current.length) {
    throw new FillError(`already set to "${current.join(", ")}"; change it yourself if needed`);
  }

  const failures: { value: string; reason: string }[] = [];
  let emptySearchesInARow = 0;
  try {
    for (const value of missing) {
      // Two searches in a row with no results means searching isn't working here; stop rather than
      // spend several seconds on every remaining value.
      if (emptySearchesInARow >= 2) {
        failures.push({ value, reason: "skipped: earlier searches returned nothing" });
        continue;
      }
      try {
        await addPromptValue(doc, firstInput.id, value, timeout);
        emptySearchesInARow = 0;
      } catch (e) {
        if (!(e instanceof FillError)) throw e;
        failures.push({ value, reason: e.message });
        emptySearchesInARow = e.message.startsWith("no search results") ? emptySearchesInARow + 1 : 0;
      }
    }
  } finally {
    const input = h.input();
    if (input) {
      pressKey(input, "Escape");
      leaveField(input); // let the page commit and validate the selection
    }
  }
  if (!failures.length) return "filled";
  // Single value: report exactly why. Lists: say what was added and the first reason, to aid diagnosis.
  if (!Array.isArray(wanted)) throw new FillError(failures[0]!.reason);
  const names = failures.map((f) => `"${f.value}"`).join(", ");
  const addedCount = missing.length - failures.length;
  throw new FillError(`${addedCount ? `added ${addedCount}; ` : ""}couldn't add ${names}. First problem: ${failures[0]!.reason}`);
}

// ---- Month/year date ---------------------------------------------------------------------------

/** Fills a "MM/YYYY" date. Verified against the rendered display, not just the input we set. */
export async function fillMonthYear(container: Element, wanted: string, opts: WidgetOptions = {}): Promise<WidgetOutcome> {
  const timeout = opts.timeoutMs ?? 2000;
  const m = /^(\d{1,2})\/(\d{4})$/.exec(wanted.trim());
  if (!m) throw new FillError(`not a MM/YYYY date: "${wanted}"`);
  const [month, year] = [String(Number(m[1])), m[2]!];

  const monthInput = container.querySelector<HTMLInputElement>(SEL.dateMonthInput);
  const yearInput = container.querySelector<HTMLInputElement>(SEL.dateYearInput);
  if (!monthInput || !yearInput) throw new FillError("date inputs not found");

  setNativeValue(monthInput, month);
  setNativeValue(yearInput, year);

  const display = (sel: string) => cleanText(container.querySelector(sel));
  const shown = await settle(
    container.ownerDocument,
    () => Number(display(SEL.dateMonthDisplay)) === Number(month) && display(SEL.dateYearDisplay) === year,
    timeout,
  );
  if (!shown) throw new FillError("the date didn't take; enter it yourself");
  return "filled";
}
