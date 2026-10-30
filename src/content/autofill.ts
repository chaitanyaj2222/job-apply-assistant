// Fills the current step once: extract → map (rules) → fill → re-extract → highlight.
// Does not click Next; the step-by-step run loop arrives in Phase 5.

import { clearHighlights, highlight } from "../core/highlight";
import { desiredEntries, mapByRules } from "../core/mapper";
import { jitter } from "../core/fill";
import { FILLABLE_STEPS, isEmptyValue, type AtsAdapter, type FieldValueData, type FillOptions } from "../core/types";
import type { FillResult, TodoItem } from "../shared/messages";
import { emptyProfile, type Profile } from "../shared/profile";

const display = (v: FieldValueData) => (typeof v === "boolean" ? (v ? "tick it" : "leave unticked") : Array.isArray(v) ? v.join(", ") : v);

/** Upper bound on entries added per section, in case a page miscounts. */
const MAX_ENTRIES = 10;

/** What to show next to a field that needs the user: the wanted value and why it couldn't be entered. */
function hintFor(want: FieldValueData | undefined, reason: string | undefined): string | undefined {
  if (want === undefined) return reason;
  const value = display(want);
  if (!reason) return value;
  // Lists (skills) are long and the reason already names what's missing.
  if (Array.isArray(want) || reason.includes(value)) return reason;
  return `${value}: ${reason}`;
}

// Reasons that don't mean "you need to do this": the field vanished, or isn't ours to fill.
const IGNORABLE_SKIPS = /no longer on the page|passwords are only set/;

export async function autofillStep(doc: Document, adapter: AtsAdapter, profile: Profile, opts?: FillOptions): Promise<FillResult> {
  const step = adapter.detectStep(doc);
  if (!FILLABLE_STEPS.includes(step)) {
    return {
      ok: false,
      reason: step === "unknown" ? "This page isn't a step I recognise." : "Autofill works from My Information onwards. Sign-in and account steps come in a later phase.",
    };
  }

  clearHighlights(doc);

  // Make room first: one entry per job / school / website in the profile ("Add" until counts match).
  const addFailures: TodoItem[] = [];
  const notes: string[] = [];
  let added = 0;
  if (adapter.repeatableSections && adapter.addEntry) {
    for (const section of adapter.repeatableSections(doc, step)) {
      const desired = desiredEntries(section.name, profile);
      if (desired === null) continue;
      const want = Math.min(desired, MAX_ENTRIES);
      const addedBefore = added;
      for (let have = section.entries; have < want; have++) {
        if (!(await adapter.addEntry(doc, section.name, opts))) {
          addFailures.push({ label: `${section.name}: add entry ${have + 1}`, hint: "click Add yourself, then Autofill again" });
          break;
        }
        added++;
        await jitter(opts?.delayMs);
      }
      // One line per section so it's clear what happened (and why nothing was added, if so).
      const addedHere = added - addedBefore;
      notes.push(
        `${section.name}: ${section.entries} on page, ${desired} in your profile` +
          (addedHere ? `, added ${addedHere}` : desired === 0 ? ", so nothing to add" : ""),
      );
    }
  }

  const fields = adapter.extractFields(doc, step);
  const values = mapByRules(fields, profile);
  const report = await adapter.fillStep(doc, step, values, opts);

  // Filling can reveal new fields (e.g. preferred-name boxes after ticking "I have a preferred name").
  // Fill those once; no further rounds, so a page that keeps adding fields can't loop us.
  const seen = new Set(fields.map((f) => f.id));
  const revealed = mapByRules(adapter.extractFields(doc, step).filter((f) => !seen.has(f.id)), profile);
  if (revealed.length) {
    const more = await adapter.fillStep(doc, step, revealed, opts);
    values.push(...revealed);
    report.filled.push(...more.filled);
    report.unchanged.push(...more.unchanged);
    report.skipped.push(...more.skipped);
  }

  // Re-read the page: what's still empty is what the user has to do.
  const after = adapter.extractFields(doc, step);
  const wanted = new Map(values.map((v) => [v.fieldId, v.value]));
  const skipReasons = new Map(report.skipped.filter((s) => !IGNORABLE_SKIPS.test(s.reason)).map((s) => [s.fieldId, s.reason]));
  const todo: (TodoItem & { id: string })[] = [];
  for (const f of after) {
    const reason = skipReasons.get(f.id);
    if (reason !== undefined || (f.required && isEmptyValue(f.value))) {
      todo.push({ id: f.id, label: f.label || f.key || f.id, hint: hintFor(wanted.get(f.id), reason) });
    }
  }

  for (const id of report.filled) {
    const el = adapter.fieldElement(doc, id);
    if (el) highlight(el, "filled");
  }
  for (const { id } of todo) {
    const el = adapter.fieldElement(doc, id);
    if (el) highlight(el, "needsYou");
  }

  return {
    ok: true,
    step,
    filled: report.filled.length,
    unchanged: report.unchanged.length,
    added,
    notes,
    todo: [...addFailures, ...todo.map(({ label, hint }) => ({ label, hint }))],
    profileEmpty: JSON.stringify(profile) === JSON.stringify(emptyProfile()),
  };
}
