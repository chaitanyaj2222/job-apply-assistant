import type { Message } from "../shared/messages";

// Phase 1 stub. Later: LLM calls and run state live here.
chrome.runtime.onMessage.addListener((msg: Message, _sender, sendResponse) => {
  switch (msg.type) {
    case "PING":
      sendResponse({ ok: true, from: "background" });
      return false;
  }
});
