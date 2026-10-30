import { z } from "zod";
import { AccountLogEntrySchema, AnswerMemoryEntrySchema, ProfileSchema, ResumeSchema } from "./profile";

// One schema per chrome.storage.local key. Reads are validated; invalid or
// missing data falls back to the schema default (and is never overwritten on read).
const localSchemas = {
  profile: ProfileSchema.default(() => ProfileSchema.parse({})),
  resume: ResumeSchema.nullable().default(null),
  answerMemory: z.array(AnswerMemoryEntrySchema).default([]),
  accountLog: z.array(AccountLogEntrySchema).default([]),
} as const;

export type LocalKey = keyof typeof localSchemas;
export type LocalValue<K extends LocalKey> = z.output<(typeof localSchemas)[K]>;

export async function getLocal<K extends LocalKey>(key: K): Promise<LocalValue<K>> {
  const schema = localSchemas[key];
  const raw = (await chrome.storage.local.get(key))[key];
  const parsed = schema.safeParse(raw);
  if (parsed.success) return parsed.data as LocalValue<K>;
  console.warn(`[storage] "${key}" failed validation; using default`, parsed.error.issues);
  return schema.parse(undefined) as LocalValue<K>;
}

export async function setLocal<K extends LocalKey>(key: K, value: LocalValue<K>): Promise<void> {
  const data = localSchemas[key].parse(value);
  await chrome.storage.local.set({ [key]: data });
}

export function onLocalChanged<K extends LocalKey>(key: K, cb: (value: LocalValue<K>) => void): () => void {
  const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area !== "local" || !(key in changes)) return;
    const parsed = localSchemas[key].safeParse(changes[key]?.newValue);
    if (parsed.success) cb(parsed.data as LocalValue<K>);
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}
