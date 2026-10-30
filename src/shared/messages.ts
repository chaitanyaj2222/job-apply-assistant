import type { StepId } from "../core/types";

// Every message exchanged between popup, background and content script.
// Extended phase by phase; handlers switch on `type`.

export type DetectResult =
  | {
      ok: true;
      ats: string;
      step: StepId;
      canFill: boolean;
      fieldCount: number;
      requiredEmpty: number;
      jobTitle: string;
      company: string;
    }
  | { ok: false; reason: string };

export interface TodoItem {
  label: string;
  /** What to enter, when the profile knows but the extension couldn't fill it. */
  hint?: string;
}

export type FillResult =
  | {
      ok: true;
      step: StepId;
      filled: number;
      unchanged: number;
      /** Entries added with the section's Add button (work experience, education, ...). */
      added: number;
      /** Informational lines, e.g. a section left empty because the profile has nothing for it. */
      notes: string[];
      /** Fields that still need the user: required-and-empty, or known values the extension couldn't enter. */
      todo: TodoItem[];
      profileEmpty: boolean;
    }
  | { ok: false; reason: string };

export type Message = { type: "PING" } | { type: "DETECT" } | { type: "FILL" };

export type MessageResponse<M extends Message> = M extends { type: "PING" }
  ? { ok: true; from: string }
  : M extends { type: "DETECT" }
    ? DetectResult
    : M extends { type: "FILL" }
      ? FillResult
      : never;

export function sendMessage<M extends Message>(msg: M): Promise<MessageResponse<M>> {
  return chrome.runtime.sendMessage(msg);
}

export function sendToTab<M extends Message>(tabId: number, msg: M): Promise<MessageResponse<M>> {
  return chrome.tabs.sendMessage(tabId, msg);
}
