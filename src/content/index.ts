import { findAdapter } from "../ats/registry";
import { FILLABLE_STEPS, isEmptyValue } from "../core/types";
import type { DetectResult, FillResult, Message } from "../shared/messages";
import { getLocal } from "../shared/storage";
import { autofillStep } from "./autofill";
import { showOverlay } from "./overlay";

// Stays idle until the popup sends a command; never acts on page load.

function detect(): DetectResult {
  const adapter = findAdapter(new URL(location.href));
  if (!adapter) return { ok: false, reason: "This site isn't supported yet." };
  const step = adapter.detectStep(document);
  const fields = step === "unknown" ? [] : adapter.extractFields(document, step);
  const job = adapter.jobContext(document, new URL(location.href));
  return {
    ok: true,
    ats: adapter.id,
    step,
    canFill: FILLABLE_STEPS.includes(step),
    fieldCount: fields.length,
    requiredEmpty: fields.filter((f) => f.required && isEmptyValue(f.value)).length,
    jobTitle: job.title,
    company: job.company,
  };
}

let running = false;

async function fill(): Promise<FillResult> {
  const adapter = findAdapter(new URL(location.href));
  if (!adapter) return { ok: false, reason: "This site isn't supported yet." };
  if (running) return { ok: false, reason: "Already filling this page." };
  running = true;
  try {
    const result = await autofillStep(document, adapter, await getLocal("profile"));
    if (result.ok) {
      showOverlay({
        title: result.todo.length ? `Filled ${result.filled}, ${result.todo.length} need you` : `Filled ${result.filled}. Check, then continue`,
        lines: [
          ...(result.profileEmpty ? ["Your profile is empty. Add your details in the extension's Options."] : []),
          ...(result.added ? [`Added ${result.added} entr${result.added === 1 ? "y" : "ies"}`] : []),
          ...(result.unchanged ? [`${result.unchanged} already correct`] : []),
          ...result.notes,
          ...(result.todo.length ? ["Needs you:"] : []),
        ],
        todo: result.todo,
        legend: ["filled", "needsYou"],
      });
    }
    return result;
  } catch (e) {
    return { ok: false, reason: `Something went wrong: ${e instanceof Error ? e.message : String(e)}` };
  } finally {
    running = false;
  }
}

chrome.runtime.onMessage.addListener((msg: Message, _sender, sendResponse) => {
  switch (msg.type) {
    case "PING":
      sendResponse({ ok: true, from: "content" });
      return false;
    case "DETECT":
      sendResponse(detect());
      return false;
    case "FILL":
      void fill().then(sendResponse);
      return true; // async response
  }
});
