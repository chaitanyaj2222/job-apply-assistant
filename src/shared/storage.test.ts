import { describe, expect, it, vi } from "vitest";
import { emptyProfile } from "./profile";
import { getLocal, onLocalChanged, setLocal } from "./storage";

describe("storage", () => {
  it("returns defaults when nothing is stored", async () => {
    expect(await getLocal("profile")).toEqual(emptyProfile());
    expect(await getLocal("resume")).toBeNull();
    expect(await getLocal("answerMemory")).toEqual([]);
  });

  it("persists and reads back a profile", async () => {
    const p = emptyProfile();
    p.personal.lastName = "Lovelace";
    await setLocal("profile", p);
    expect((await getLocal("profile")).personal.lastName).toBe("Lovelace");
  });

  it("refuses to write invalid data", async () => {
    const p = emptyProfile();
    p.personal.email = "not-an-email";
    await expect(setLocal("profile", p)).rejects.toThrow();
  });

  it("falls back to the default when stored data is corrupt", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await chrome.storage.local.set({ accountLog: [{ company: 1 }] });
    expect(await getLocal("accountLog")).toEqual([]);
  });

  it("notifies onLocalChanged subscribers", async () => {
    const cb = vi.fn();
    const off = onLocalChanged("answerMemory", cb);
    const entry = { key: "why us", question: "Why us?", answer: "Mission", updatedAt: "2026-01-01" };
    await setLocal("answerMemory", [entry]);
    expect(cb).toHaveBeenCalledWith([entry]);
    off();
  });
});
