import { z } from "zod";

// Every field has a default so `ProfileSchema.parse({})` yields a complete empty
// profile, and profiles saved by older versions gain new fields on load.

const optionalEmail = z.union([z.literal(""), z.email("Enter a valid email")]).default("");
const optionalUrl = z.union([z.literal(""), z.url("Enter a full URL, including https://")]).default("");
// "YYYY-MM", as produced by <input type="month">.
const yearMonth = z
  .union([z.literal(""), z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Use YYYY-MM")])
  .default("");
const optionalNumber = z.number().nonnegative("Must be 0 or more").nullable().default(null);

export const PREFER_NOT_TO_SAY = "prefer_not_to_say" as const;

export const WorkEntrySchema = z.object({
  id: z.string(),
  company: z.string().default(""),
  title: z.string().default(""),
  location: z.string().default(""),
  start: yearMonth,
  end: yearMonth,
  current: z.boolean().default(false),
  description: z.string().default(""),
});

export const EducationEntrySchema = z.object({
  id: z.string(),
  school: z.string().default(""),
  degree: z.string().default(""),
  fieldOfStudy: z.string().default(""),
  start: yearMonth,
  end: yearMonth,
  grade: z.string().default(""),
});

// Stored as plain levels and matched to each site's wording (Workday: "1 - Beginner" … "4 - Fluent").
export const LANGUAGE_LEVELS = ["", "beginner", "intermediate", "advanced", "fluent"] as const;

export const LanguageEntrySchema = z.object({
  id: z.string(),
  language: z.string().default(""),
  fluent: z.boolean().default(false),
  reading: z.enum(LANGUAGE_LEVELS).default(""),
  speaking: z.enum(LANGUAGE_LEVELS).default(""),
  writing: z.enum(LANGUAGE_LEVELS).default(""),
});

export const ShortAnswerSchema = z.object({
  id: z.string(),
  question: z.string().default(""),
  answer: z.string().default(""),
});

export const GENDER_OPTIONS = ["male", "female", "non_binary", PREFER_NOT_TO_SAY] as const;
export const YES_NO_PNTS = ["yes", "no", PREFER_NOT_TO_SAY] as const;
export const VETERAN_OPTIONS = ["not_a_veteran", "protected_veteran", "veteran_not_protected", PREFER_NOT_TO_SAY] as const;

export const ProfileSchema = z.object({
  personal: z
    .object({
      firstName: z.string().default(""),
      middleName: z.string().default(""),
      lastName: z.string().default(""),
      // A preferred name is optional; filling either part ticks "I have a preferred name" on forms.
      preferredFirstName: z.string().default(""),
      preferredLastName: z.string().default(""),
      email: optionalEmail,
      phoneCountryCode: z.string().default(""),
      phone: z.string().default(""),
    })
    .default(() => ({ firstName: "", middleName: "", lastName: "", preferredFirstName: "", preferredLastName: "", email: "", phoneCountryCode: "", phone: "" })),
  address: z
    .object({
      line1: z.string().default(""),
      line2: z.string().default(""),
      city: z.string().default(""),
      state: z.string().default(""),
      postalCode: z.string().default(""),
      country: z.string().default(""),
    })
    .default(() => ({ line1: "", line2: "", city: "", state: "", postalCode: "", country: "" })),
  links: z
    .object({
      linkedin: optionalUrl,
      github: optionalUrl,
      portfolio: optionalUrl,
      other: z.array(z.url("Enter a full URL, including https://")).default([]),
    })
    .default(() => ({ linkedin: "", github: "", portfolio: "", other: [] })),
  workHistory: z.array(WorkEntrySchema).default([]),
  education: z.array(EducationEntrySchema).default([]),
  languages: z.array(LanguageEntrySchema).default([]),
  skills: z.array(z.string()).default([]),
  totalYoe: optionalNumber,
  noticePeriodDays: optionalNumber,
  compensation: z
    .object({
      currency: z.string().default(""),
      /** Total current CTC (fixed + variable). */
      currentCtc: optionalNumber,
      currentFixedCtc: optionalNumber,
      currentVariableCtc: optionalNumber,
      expectedCtc: optionalNumber,
    })
    .default(() => ({ currency: "", currentCtc: null, currentFixedCtc: null, currentVariableCtc: null, expectedCtc: null })),
  workAuthorization: z
    .object({
      authorizedToWork: z.boolean().nullable().default(null),
      requiresSponsorship: z.boolean().nullable().default(null),
      notes: z.string().default(""),
    })
    .default(() => ({ authorizedToWork: null, requiresSponsorship: null, notes: "" })),
  willingToRelocate: z.boolean().nullable().default(null),
  preferredLocations: z.array(z.string()).default([]),
  disclosures: z
    .object({
      gender: z.enum(GENDER_OPTIONS).default(PREFER_NOT_TO_SAY),
      hispanicOrLatino: z.enum(YES_NO_PNTS).default(PREFER_NOT_TO_SAY),
      // Race/ethnicity categories differ by country and site; kept as free text.
      ethnicity: z.string().default(PREFER_NOT_TO_SAY),
      veteranStatus: z.enum(VETERAN_OPTIONS).default(PREFER_NOT_TO_SAY),
      disability: z.enum(YES_NO_PNTS).default(PREFER_NOT_TO_SAY),
    })
    .default(() => ({
      gender: PREFER_NOT_TO_SAY,
      hispanicOrLatino: PREFER_NOT_TO_SAY,
      ethnicity: PREFER_NOT_TO_SAY,
      veteranStatus: PREFER_NOT_TO_SAY,
      disability: PREFER_NOT_TO_SAY,
    })),
  shortAnswers: z.array(ShortAnswerSchema).default([]),
});

export type Profile = z.output<typeof ProfileSchema>;
export type WorkEntry = z.output<typeof WorkEntrySchema>;
export type EducationEntry = z.output<typeof EducationEntrySchema>;
export type ShortAnswer = z.output<typeof ShortAnswerSchema>;
export type LanguageEntry = z.output<typeof LanguageEntrySchema>;

export const emptyProfile = (): Profile => ProfileSchema.parse({});

export const newId = (): string => crypto.randomUUID();

export const ResumeSchema = z.object({
  name: z.string(),
  type: z.string(),
  size: z.number(),
  dataBase64: z.string(),
  uploadedAt: z.string(),
});
export type StoredResume = z.output<typeof ResumeSchema>;

// Key is the normalized question text; `question` keeps the original wording.
export const AnswerMemoryEntrySchema = z.object({
  key: z.string(),
  question: z.string(),
  answer: z.string(),
  updatedAt: z.string(),
});
export type AnswerMemoryEntry = z.output<typeof AnswerMemoryEntrySchema>;

// Deliberately has no password field.
export const AccountLogEntrySchema = z.object({
  company: z.string(),
  tenantUrl: z.url(),
  email: z.string(),
  date: z.string(),
  termsAccepted: z.literal(true),
});
export type AccountLogEntry = z.output<typeof AccountLogEntrySchema>;
