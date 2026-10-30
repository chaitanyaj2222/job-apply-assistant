// ATS-agnostic types shared by core, adapters, content script and popup.

export type StepId =
  | "start"
  | "signIn"
  | "createAccount"
  | "myInformation"
  | "myExperience"
  | "applicationQuestions"
  | "voluntaryDisclosures"
  | "selfIdentify"
  | "review"
  | "unknown";

export type FieldType =
  | "text"
  | "password" // value is always masked; never mapped from profile or sent to an LLM
  | "textarea"
  | "select" // native <select>
  | "dropdown" // custom single-choice listbox (button + popup)
  | "prompt" // searchable picker that holds one or more selected items
  | "radio"
  | "checkbox"
  | "monthYear"
  | "file";

export type FieldValueData = string | string[] | boolean;

export interface Field {
  /** Stable within the current page; the adapter uses it to find the element again. */
  id: string;
  label: string;
  type: FieldType;
  required: boolean;
  /** Known choices. "lazy" = only rendered once the control is opened. null = not a choice field. */
  options: string[] | "lazy" | null;
  /** Current value: string for text/dropdown/radio/monthYear ("MM/YYYY"), string[] for prompt/file, boolean for checkbox. */
  value: FieldValueData;
  /** Adapter's machine name for the field (e.g. "legalName--firstName"), when the page exposes one. */
  key?: string;
  /** Heading of the section the field sits in (e.g. "Address", "Work Experience"). */
  section?: string;
  /** 1-based index for fields inside a repeatable entry (Work Experience 2 → 2). */
  entry?: number;
}

export type FillSource = "rule" | "memory" | "llm" | "profile";

export interface FieldValue {
  fieldId: string;
  value: FieldValueData;
  source: FillSource;
  confidence: number;
}

export interface AtsAdapter {
  id: string;
  matches(url: URL): boolean;
  detectStep(doc: Document): StepId;
  extractFields(doc: Document, step: StepId): Field[];
  fillStep(doc: Document, step: StepId, values: FieldValue[], opts?: FillOptions): Promise<FillReport>;
  /** Repeatable sections on the page ("Work Experience", ...) and how many entries each has now. */
  repeatableSections?(doc: Document, step: StepId): { name: string; entries: number }[];
  /** Clicks the section's Add button and waits for the new entry. False if it didn't appear. */
  addEntry?(doc: Document, section: string, opts?: FillOptions): Promise<boolean>;
  /** The element that visually represents a field (for highlighting). */
  fieldElement(doc: Document, fieldId: string): HTMLElement | null;
  /** Clicks Next / Save and Continue. Never Submit. */
  advance(doc: Document, step: StepId): Promise<void>;
  getBlockingReason(doc: Document): string | null;
  /** Job title and company for the LLM prompt and the account log. */
  jobContext(doc: Document, url: URL): JobContext;
}

export interface FillOptions {
  /** Random pause between fields, [min, max] ms. Default [100, 300]. */
  delayMs?: readonly [number, number];
  /** How long widgets wait for popups / re-renders. Default a few seconds. */
  timeoutMs?: number;
}

export interface FillReport {
  /** Field ids whose value was changed. */
  filled: string[];
  /** Field ids that already held the wanted value. */
  unchanged: string[];
  skipped: { fieldId: string; reason: string }[];
}

export interface JobContext {
  title: string;
  company: string;
}

// An unticked checkbox counts as empty, so a required consent box reads as "still to do".
export const isEmptyValue = (v: FieldValueData): boolean =>
  typeof v === "boolean" ? !v : Array.isArray(v) ? v.length === 0 : v.trim() === "";

/** Steps where Autofill fills fields. Start, sign-in and account steps are driven by the run loop (Phase 5). */
export const FILLABLE_STEPS: readonly StepId[] = [
  "myInformation",
  "myExperience",
  "applicationQuestions",
  "voluntaryDisclosures",
  "selfIdentify",
];
