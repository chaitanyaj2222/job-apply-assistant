// Field mapping, stage 1: deterministic rules from normalized label text to profile values.
// (Answer memory and the LLM are added in Phase 4.) ATS-agnostic: matches on what the page
// shows (labels, section headings, entry numbers), never on a site's internal ids.

import type { Profile } from "../shared/profile";
import type { Field, FieldType, FieldValue, FieldValueData } from "./types";

import { normalize } from "./text";

export { normalize };

type Ctx = { field: Field; label: string; section: string; profile: Profile };
type Rule = {
  name: string;
  types: readonly FieldType[];
  when: (c: Ctx) => boolean;
  value: (c: Ctx) => FieldValueData | undefined;
};

const TEXT: FieldType[] = ["text", "textarea"];
const CHOICE: FieldType[] = ["dropdown", "prompt", "select", "radio", "text"];

const is = (...patterns: RegExp[]) => (label: string) => patterns.some((p) => p.test(label));

/** "2020-01" → "01/2020" (the shape monthYear fields report). */
const toMonthYear = (ym: string) => (ym ? `${ym.slice(5, 7)}/${ym.slice(0, 4)}` : undefined);

const entryOf = <T>(list: T[], field: Field): T | undefined => (field.entry ? list[field.entry - 1] : undefined);

const languageEntry = (c: Ctx) => (/language/.test(c.section) ? entryOf(c.profile.languages, c.field) : undefined);
/** "fluent" → "Fluent"; matched against the site's own wording ("4 - Fluent") by the filler. */
const level = (l: string | undefined) => (l ? l[0]!.toUpperCase() + l.slice(1) : undefined);

const workEntry = (c: Ctx) => (/work experience|employment/.test(c.section) ? entryOf(c.profile.workHistory, c.field) : undefined);
const eduEntry = (c: Ctx) => (/education/.test(c.section) ? entryOf(c.profile.education, c.field) : undefined);
const inRepeatable = (c: Ctx) => c.field.entry !== undefined;

/** Websites the profile knows about, in the order they fill "Websites 1", "Websites 2", ... */
const websites = (p: Profile) => [p.links.github, p.links.portfolio, ...p.links.other].filter(Boolean);

const hasPreferredName = (p: Profile) => (p.personal.preferredFirstName + p.personal.preferredLastName).trim() !== "";

const RULES: Rule[] = [
  // Name. "Local" names (native-script spellings) are left alone: the profile doesn't hold them.
  { name: "firstName", types: TEXT, when: (c) => !/local|preferred|middle/.test(c.label) && is(/^(legal )?first name$/, /^given name$/)(c.label), value: (c) => c.profile.personal.firstName },
  { name: "middleName", types: TEXT, when: (c) => is(/^middle name$/)(c.label), value: (c) => c.profile.personal.middleName },
  { name: "lastName", types: TEXT, when: (c) => !/local/.test(c.label) && is(/^(legal )?last name$/, /^family (or last )?name$/, /^surname$/)(c.label), value: (c) => c.profile.personal.lastName },
  { name: "preferredFirstName", types: TEXT, when: (c) => is(/^preferred (first |given )?name$/)(c.label), value: (c) => c.profile.personal.preferredFirstName },
  { name: "preferredLastName", types: TEXT, when: (c) => is(/^preferred (last|family)( or last)? name$/, /^preferred surname$/)(c.label), value: (c) => c.profile.personal.preferredLastName },
  { name: "hasPreferredName", types: ["checkbox"], when: (c) => is(/^i have a preferred name$/)(c.label), value: (c) => hasPreferredName(c.profile) },

  // Contact.
  { name: "email", types: TEXT, when: (c) => is(/^e ?mail( address)?$/)(c.label), value: (c) => c.profile.personal.email },
  { name: "phone", types: TEXT, when: (c) => is(/^(mobile |cell )?phone( number)?$/, /^mobile( number)?$/)(c.label), value: (c) => c.profile.personal.phone },
  { name: "phoneType", types: CHOICE, when: (c) => is(/^phone (device )?type$/)(c.label), value: () => "Mobile" },
  { name: "phoneCountryCode", types: CHOICE, when: (c) => is(/phone code$/, /^country (dialing |calling )?code$/)(c.label), value: (c) => c.profile.address.country || undefined },

  // Address. Skipped inside repeatable entries (a job's "Location" / "City" is not your home address).
  { name: "addressLine1", types: TEXT, when: (c) => is(/^address( line)? 1$/, /^street( address)?$/)(c.label), value: (c) => c.profile.address.line1 },
  { name: "addressLine2", types: TEXT, when: (c) => is(/^address( line)? 2$/)(c.label), value: (c) => c.profile.address.line2 },
  { name: "city", types: TEXT, when: (c) => !inRepeatable(c) && is(/^(city|town)$/)(c.label), value: (c) => c.profile.address.city },
  { name: "state", types: CHOICE, when: (c) => !inRepeatable(c) && is(/^(state|province|state province|region)$/)(c.label), value: (c) => c.profile.address.state },
  { name: "postalCode", types: TEXT, when: (c) => is(/^(postal|zip|pin)( code)?$/, /^postcode$/)(c.label), value: (c) => c.profile.address.postalCode },
  { name: "country", types: CHOICE, when: (c) => !inRepeatable(c) && is(/^country( territory)?$/, /^country of residence$/)(c.label), value: (c) => c.profile.address.country },

  // Links.
  { name: "linkedin", types: TEXT, when: (c) => is(/linkedin/)(c.label), value: (c) => c.profile.links.linkedin },
  { name: "github", types: TEXT, when: (c) => is(/^github/)(c.label), value: (c) => c.profile.links.github },
  { name: "portfolio", types: TEXT, when: (c) => !inRepeatable(c) && is(/^(personal )?(website|portfolio)( url)?$/)(c.label), value: (c) => c.profile.links.portfolio },
  { name: "websiteEntry", types: TEXT, when: (c) => /website/.test(c.section) && inRepeatable(c) && is(/^(url|website)$/)(c.label), value: (c) => entryOf(websites(c.profile), c.field) },

  // "How did you hear about us?"
  { name: "source", types: CHOICE, when: (c) => is(/how did you (hear|learn|find out) about/)(c.label), value: () => "LinkedIn" },

  // Work experience entries (Work Experience N ↔ workHistory[N-1]).
  { name: "jobTitle", types: TEXT, when: (c) => is(/^(job )?title$/)(c.label), value: (c) => workEntry(c)?.title },
  { name: "company", types: TEXT, when: (c) => is(/^company( name)?$/, /^employer$/)(c.label), value: (c) => workEntry(c)?.company },
  { name: "jobLocation", types: TEXT, when: (c) => is(/^location$/)(c.label), value: (c) => workEntry(c)?.location },
  { name: "currentJob", types: ["checkbox"], when: (c) => is(/^i currently work here$/)(c.label), value: (c) => workEntry(c)?.current },
  { name: "roleDescription", types: TEXT, when: (c) => is(/^(role )?description$/, /^responsibilities$/)(c.label), value: (c) => workEntry(c)?.description },
  { name: "jobFrom", types: ["monthYear"], when: (c) => is(/^(from|start date)$/)(c.label), value: (c) => toMonthYear(workEntry(c)?.start ?? eduEntry(c)?.start ?? "") },
  { name: "jobTo", types: ["monthYear"], when: (c) => is(/^(to|end date)$/)(c.label), value: (c) => toMonthYear(workEntry(c)?.end ?? eduEntry(c)?.end ?? "") },

  // Education entries.
  { name: "school", types: CHOICE, when: (c) => is(/^(school|university|school or university|institution)$/)(c.label), value: (c) => eduEntry(c)?.school },
  { name: "degree", types: CHOICE, when: (c) => is(/^degree$/)(c.label), value: (c) => eduEntry(c)?.degree },
  { name: "fieldOfStudy", types: CHOICE, when: (c) => is(/^(field of study|major|discipline)$/)(c.label), value: (c) => eduEntry(c)?.fieldOfStudy },

  // Language entries (Languages N ↔ languages[N-1]).
  { name: "language", types: CHOICE, when: (c) => /language/.test(c.section) && is(/^language$/)(c.label), value: (c) => languageEntry(c)?.language },
  { name: "languageFluent", types: ["checkbox"], when: (c) => /language/.test(c.section) && is(/fluent/)(c.label), value: (c) => languageEntry(c)?.fluent },
  { name: "languageReading", types: CHOICE, when: (c) => /language/.test(c.section) && is(/^reading$/)(c.label), value: (c) => level(languageEntry(c)?.reading) },
  { name: "languageSpeaking", types: CHOICE, when: (c) => /language/.test(c.section) && is(/^speaking$/)(c.label), value: (c) => level(languageEntry(c)?.speaking) },
  { name: "languageWriting", types: CHOICE, when: (c) => /language/.test(c.section) && is(/^writing$/)(c.label), value: (c) => level(languageEntry(c)?.writing) },

  // Skills.
  { name: "skills", types: ["prompt"], when: (c) => is(/skills/)(c.label), value: (c) => c.profile.skills },
];

const hasValue = (v: FieldValueData | undefined): v is FieldValueData =>
  v !== undefined && (typeof v === "boolean" || (Array.isArray(v) ? v.length > 0 : v.trim() !== ""));

/**
 * How many entries a repeatable section should have to hold the profile, or null if the profile has
 * no list for it (e.g. Languages). Used to click "Add" before filling; existing entries are never removed.
 */
export function desiredEntries(section: string, profile: Profile): number | null {
  const s = normalize(section);
  if (/work experience|employment/.test(s)) return profile.workHistory.length;
  if (/education/.test(s)) return profile.education.length;
  if (/website/.test(s)) return websites(profile).length;
  if (/language/.test(s)) return profile.languages.length;
  return null;
}

export interface RuleMatch extends FieldValue {
  rule: string;
}

/**
 * Values for every field a rule recognises and the profile can answer. Passwords and files are
 * never mapped here: passwords come from the account flow, files from the stored resume.
 */
export function mapByRules(fields: Field[], profile: Profile): RuleMatch[] {
  const out: RuleMatch[] = [];
  for (const field of fields) {
    if (field.type === "password" || field.type === "file") continue;
    const ctx: Ctx = { field, label: normalize(field.label), section: normalize(field.section ?? ""), profile };
    const rule = RULES.find((r) => r.types.includes(field.type) && r.when(ctx));
    const value = rule?.value(ctx);
    if (rule && hasValue(value)) out.push({ fieldId: field.id, value, source: "rule", confidence: 1, rule: rule.name });
  }
  return out;
}
