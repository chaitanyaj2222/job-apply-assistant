import {
  cleanText,
  isHidden,
  isRequired,
  labelElementFor,
  labelFor,
  nativeType,
  nativeValue,
  radioGroup,
  selectOptions,
} from "../../core/extract";
import { FillError, jitter, setChecked, setNativeValue, waitFor } from "../../core/fill";
import { normalize } from "../../core/mapper";
import { safeClick, SafetyError } from "../../core/safety";
import type { AtsAdapter, Field, FieldValue, FieldValueData, FillOptions, FillReport, StepId } from "../../core/types";
import { PROGRESS_STEP_NAMES, SEL, STEPS } from "./selectors";
import { fillDropdown, fillMonthYear, fillPrompt } from "./widgets";

export function detectStep(doc: Document): StepId {
  for (const { step, marker } of STEPS) {
    if (doc.querySelector(marker)) return step;
  }
  const active = doc.querySelector(SEL.progressActiveStep);
  const name = cleanText(active?.querySelector(SEL.progressStepName));
  return PROGRESS_STEP_NAMES[name] ?? "unknown";
}

/** Text of the element named by a group's aria-labelledby (section h4 / entry h5). */
function groupHeading(group: Element | null): string {
  const id = group?.getAttribute("aria-labelledby");
  return id ? cleanText(group!.ownerDocument.getElementById(id)) : "";
}

/** Fallback section name: the one heading in the smallest ancestor that contains exactly one. */
function nearestSectionHeading(el: Element): string {
  for (let a = el.parentElement; a; a = a.parentElement) {
    const headings = a.querySelectorAll(SEL.sectionHeading);
    if (headings.length === 1) return cleanText(headings[0]);
    if (headings.length > 1) return "";
  }
  return "";
}

function placement(container: Element): Pick<Field, "section" | "entry"> {
  const section = groupHeading(container.closest(SEL.sectionGroup)) || nearestSectionHeading(container) || undefined;
  const entryMatch = groupHeading(container.closest(SEL.entryPanel)).match(/(\d+)$/);
  return { section, entry: entryMatch ? Number(entryMatch[1]) : undefined };
}

const firstControl = (container: Element) => container.querySelector("input, textarea, select, button");

function fieldKey(container: Element): string | undefined {
  const fromAid = (container.getAttribute("data-automation-id") ?? "").slice(SEL.formFieldPrefix.length);
  const fkit = container.getAttribute("data-fkit-id") ?? "";
  return fromAid || fkit.split("--").pop() || firstControl(container)?.getAttribute("data-automation-id") || undefined;
}

/** Application-flow fields carry data-fkit-id; auth-page fields don't, so fall back to the control's ids. */
function fieldId(container: Element): string | null {
  const control = firstControl(container);
  return (
    container.getAttribute("data-fkit-id") ??
    control?.getAttribute("data-automation-id") ??
    control?.getAttribute("id") ??
    null
  );
}

/** Label for a formField: <label for> the control, else the field's legend, else its first label. */
function fieldLabel(container: Element, control: Element | null): { text: string; el: Element | null } {
  const el =
    (control && labelElementFor(control, container)) ??
    container.querySelector("legend") ??
    container.querySelector("label");
  return { text: cleanText(el), el };
}

/** Reads one Workday formField wrapper. Returns null for wrappers with no fillable control. */
function readFormField(container: Element): Field | null {
  const id = fieldId(container);
  if (!id) return null;
  const base = { id, key: fieldKey(container), ...placement(container) };

  const date = container.querySelector(SEL.dateWrapper);
  if (date) {
    const month = date.querySelector<HTMLInputElement>(SEL.dateMonthInput);
    const year = date.querySelector<HTMLInputElement>(SEL.dateYearInput);
    const label = fieldLabel(container, null);
    const mm = month?.value ?? "";
    const yyyy = year?.value ?? "";
    return {
      ...base,
      label: label.text,
      type: "monthYear",
      required: (month ? isRequired(month, label.el) : false) || isRequired(date, label.el),
      options: null,
      value: mm || yyyy ? `${mm.padStart(2, "0")}/${yyyy}` : "",
    };
  }

  const fileInput = container.querySelector(SEL.fileInput);
  if (fileInput) {
    const label = fieldLabel(container, null);
    return {
      ...base,
      label: label.text,
      type: "file",
      required: isRequired(fileInput, label.el),
      options: null,
      value: [...container.querySelectorAll(SEL.uploadedFileName)].map((n) => cleanText(n)),
    };
  }

  const prompt = container.querySelector(SEL.promptContainer);
  if (prompt) {
    const input = prompt.querySelector(SEL.promptInput);
    const label = fieldLabel(container, input);
    return {
      ...base,
      label: label.text,
      type: "prompt",
      required: input ? isRequired(input, label.el) : false,
      options: "lazy",
      value: [...prompt.querySelectorAll(SEL.promptSelectedLabel)].map(
        (p) => p.getAttribute("data-automation-label") ?? cleanText(p),
      ),
    };
  }

  const button = container.querySelector(SEL.dropdownButton);
  if (button) {
    const label = fieldLabel(container, button);
    // Empty selection shows placeholder text ("Select One") but leaves the id input blank.
    const selectedId = button.parentElement?.querySelector<HTMLInputElement>(SEL.dropdownValueInput)?.value ?? "";
    return {
      ...base,
      label: label.text,
      type: "dropdown",
      required: isRequired(button, label.el),
      options: "lazy",
      value: selectedId ? cleanText(button) : "",
    };
  }

  const radios = [...container.querySelectorAll('input[type="radio"]')];
  if (radios.length) {
    const label = fieldLabel(container, null);
    const group = container.querySelector("[aria-required]") ?? radios[0]!;
    const { options, value } = radioGroup(radios, container);
    return { ...base, label: label.text, type: "radio", required: isRequired(group, label.el), options, value };
  }

  const control = [...container.querySelectorAll("input, textarea, select")].find((el) => nativeType(el));
  if (!control) return null;
  const type = nativeType(control)!;
  const label = fieldLabel(container, control);
  return {
    ...base,
    label: label.text,
    type,
    required: isRequired(control, label.el),
    options: type === "select" ? selectOptions(control) : null,
    value: nativeValue(control),
  };
}

export function extractFields(doc: Document, step: StepId): Field[] {
  const def = STEPS.find((s) => s.step === step);
  const rootSel = def?.root ?? def?.marker;
  const root = (rootSel && doc.querySelector(rootSel)) || doc.querySelector(SEL.applyFlowPage) || doc.body;
  return [...root.querySelectorAll(SEL.formField)]
    .filter((el) => !isHidden(el) && !el.querySelector(SEL.honeypot))
    .map(readFormField)
    .filter((f): f is Field => f !== null);
}

export function jobTitle(doc: Document): string {
  return cleanText(doc.querySelector(SEL.jobTitle) ?? doc.querySelector(SEL.jobPostingTitle));
}

/**
 * Best-effort company name from the career-site id in the URL
 * (/en-US/CaterpillarCareers/job/... → "Caterpillar"). Workday pages don't print it reliably.
 */
export function companyFromUrl(url: URL): string {
  const segments = url.pathname.split("/").filter(Boolean);
  let site = (/^[a-z]{2}(-[A-Z]{2})?$/.test(segments[0] ?? "") ? segments[1] : segments[0]) ?? "";
  // Peel trailing generic words one at a time: NVIDIAExternalCareerSite → NVIDIA.
  for (let prev = ""; prev !== site; ) {
    prev = site;
    site = site.replace(/[_\- ]*(External|Careers?|Site|Jobs?)$/i, "");
  }
  const name = site
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim();
  return name || url.hostname.split(".")[0] || "";
}

/** The formField wrapper for a field id (data-fkit-id, or a control's automation id on auth pages). */
export function findContainer(doc: Document, fieldId: string): HTMLElement | null {
  const id = fieldId.replace(/["\\]/g, "\\$&");
  return (
    doc.querySelector<HTMLElement>(`[data-fkit-id="${id}"]`) ??
    doc.querySelector(`[data-automation-id="${id}"]`)?.closest<HTMLElement>(SEL.formField) ??
    null
  );
}

type FillOutcome = "filled" | "unchanged" | { skip: string };

const sameValue = (a: FieldValueData, b: FieldValueData): boolean => {
  if (Array.isArray(a) || Array.isArray(b)) {
    const norm = (v: FieldValueData) => (Array.isArray(v) ? v : [String(v)]).map(normalize).sort().join("|");
    return norm(a) === norm(b);
  }
  return typeof a === "boolean" || typeof b === "boolean" ? a === b : normalize(a) === normalize(b);
};

async function fillField(container: Element, field: Field, value: FieldValueData, opts: FillOptions): Promise<FillOutcome> {
  if (sameValue(field.value, value)) return "unchanged";
  const widget = { timeoutMs: opts.timeoutMs };
  switch (field.type) {
    case "text":
    case "textarea": {
      const control = [...container.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea")].find((el) => {
        const t = nativeType(el);
        return t === "text" || t === "textarea";
      });
      if (!control) return { skip: "input not found" };
      setNativeValue(control, Array.isArray(value) ? value.join(", ") : String(value));
      return "filled";
    }
    case "checkbox": {
      const box = container.querySelector<HTMLInputElement>('input[type="checkbox"]');
      if (!box) return { skip: "checkbox not found" };
      setChecked(box, value === true);
      return "filled";
    }
    case "radio": {
      const want = normalize(String(value));
      const radio = [...container.querySelectorAll<HTMLInputElement>('input[type="radio"]')].find(
        (r) => normalize(labelFor(r, container)) === want,
      );
      if (!radio) return { skip: `no option "${String(value)}"` };
      setChecked(radio, true);
      return "filled";
    }
    case "dropdown":
      return fillDropdown(container, Array.isArray(value) ? (value[0] ?? "") : String(value), widget);
    case "prompt":
      return fillPrompt(container, typeof value === "boolean" ? String(value) : value, widget);
    case "monthYear":
      return fillMonthYear(container, String(value), widget);
    case "password":
      return { skip: "passwords are only set by the account step" };
    default:
      return { skip: `${field.type} fields can't be filled yet` };
  }
}

export async function fillStep(doc: Document, _step: StepId, values: FieldValue[], opts: FillOptions = {}): Promise<FillReport> {
  const report: FillReport = { filled: [], unchanged: [], skipped: [] };
  for (const { fieldId, value } of values) {
    // Re-read each field just before filling: earlier fills can add or remove fields
    // (e.g. ticking "I currently work here" removes the "To" date).
    const container = findContainer(doc, fieldId);
    const field = container && readFormField(container);
    if (!container || !field) {
      report.skipped.push({ fieldId, reason: "field is no longer on the page" });
      continue;
    }
    try {
      const outcome = await fillField(container, field, value, opts);
      if (outcome === "filled") {
        report.filled.push(fieldId);
        await jitter(opts.delayMs);
      } else if (outcome === "unchanged") report.unchanged.push(fieldId);
      else report.skipped.push({ fieldId, reason: outcome.skip });
    } catch (e) {
      if (!(e instanceof FillError || e instanceof SafetyError)) throw e;
      report.skipped.push({ fieldId, reason: e.message });
    }
  }
  return report;
}

/** Section groups that have an Add / Add Another button, e.g. Work Experience, Education, Websites. */
/** A section's own Add button (not one inside an entry): automation id first, then visible text. */
function sectionAddButton(group: Element): HTMLElement | null {
  const buttons = [...group.querySelectorAll<HTMLElement>("button")].filter((b) => !b.closest(SEL.entryPanel));
  return buttons.find((b) => b.matches(SEL.addButton)) ?? buttons.find((b) => SEL.addButtonText.test(cleanText(b))) ?? null;
}

/**
 * Sections with an Add button, e.g. Work Experience, Education, Languages, Websites. Primary: the
 * labelled section groups seen in the fixtures. Fallback: walk up from each section heading to the
 * largest ancestor that holds only that heading, so an empty section is found even if its markup
 * differs; it never crosses into a neighbouring section.
 */
function addableSections(doc: Document): { group: Element; name: string }[] {
  const root = doc.querySelector(SEL.applyFlowPage) ?? doc.body;
  const found = new Map<Element, string>();
  for (const group of root.querySelectorAll(SEL.sectionGroup)) {
    const name = groupHeading(group) || cleanText(group.querySelector(SEL.sectionHeading));
    if (name && sectionAddButton(group)) found.set(group, name);
  }
  for (const heading of root.querySelectorAll(SEL.sectionHeading)) {
    if ([...found.keys()].some((g) => g.contains(heading))) continue;
    let best: Element | null = null;
    for (let el = heading.parentElement; el && el !== root && el.querySelectorAll(SEL.sectionHeading).length === 1; el = el.parentElement) {
      if (sectionAddButton(el)) best = el;
    }
    const name = cleanText(heading);
    if (best && name) found.set(best, name);
  }
  return [...found].map(([group, name]) => ({ group, name }));
}

const entryCount = (group: Element) => group.querySelectorAll(SEL.entryPanel).length;

export function repeatableSections(doc: Document, _step: StepId): { name: string; entries: number }[] {
  return addableSections(doc).map(({ group, name }) => ({ name, entries: entryCount(group) }));
}

export async function addEntry(doc: Document, section: string, opts: FillOptions = {}): Promise<boolean> {
  const found = addableSections(doc).find((s) => s.name === section);
  // The section's own Add button sits after its entry panels, not inside one.
  const button = found && sectionAddButton(found.group);
  if (!found || !button) return false;
  const before = entryCount(found.group);
  safeClick(button);
  return waitFor(() => entryCount(found.group) > before, opts.timeoutMs ?? 4000, doc)
    .then(() => true)
    .catch(() => false);
}

const notYet = (what: string, phase: number) => () => {
  throw new Error(`Workday ${what} arrives in Phase ${phase}`);
};

export const workdayAdapter: AtsAdapter = {
  id: "workday",
  matches: (url) => url.hostname === "myworkdayjobs.com" || url.hostname.endsWith(".myworkdayjobs.com"),
  detectStep,
  extractFields,
  fillStep,
  repeatableSections,
  addEntry,
  fieldElement: findContainer,
  advance: async () => notYet("navigation", 5)(),
  getBlockingReason: notYet("blocking checks", 5),
  jobContext: (doc, url) => ({ title: jobTitle(doc), company: companyFromUrl(url) }),
};
