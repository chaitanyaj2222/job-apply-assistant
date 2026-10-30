import { beforeEach, describe, expect, it } from "vitest";
import { extractFields, workdayAdapter } from "../ats/workday/adapter";
import myExperienceHtml from "../ats/workday/fixtures/myExperience.html?raw";
import { emptyProfile, type Profile } from "../shared/profile";
import { autofillStep } from "./autofill";

const OPTS = { delayMs: [0, 0] as const, timeoutMs: 100 };

function load(html: string) {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  document.replaceChild(document.importNode(parsed.documentElement, true), document.documentElement);
}

/**
 * Stand-in for Workday's "Add" in the Work Experience section: appends a blank copy of the captured
 * "Work Experience 1" panel (new ids, empty values) before the Add button.
 */
function simulateWorkExperienceAdd({ startEmpty }: { startEmpty: boolean }) {
  const group = document.querySelector('[aria-labelledby="Work-Experience-section"]')!;
  const panels = [...group.querySelectorAll('[aria-labelledby$="-panel"]')];
  const template = panels[0]!.cloneNode(true) as Element;
  if (startEmpty) panels.forEach((p) => p.remove());
  const addButton = group.querySelector('[data-automation-id="add-button"]')!;
  if (startEmpty) addButton.textContent = "Add";
  let nextId = 900;
  addButton.addEventListener("click", () => {
    const n = group.querySelectorAll('[aria-labelledby$="-panel"]').length + 1;
    const id = nextId++;
    const panel = document.createElement("div");
    panel.innerHTML = template.outerHTML
      .replaceAll("workExperience-790", `workExperience-${id}`)
      .replaceAll("Work-Experience-1-panel", `Work-Experience-${n}-panel`)
      .replace(">Work Experience 1<", `>Work Experience ${n}<`);
    const entry = panel.firstElementChild!;
    entry.querySelectorAll<HTMLInputElement>('input[type="text"]').forEach((i) => (i.value = ""));
    entry.querySelectorAll("textarea").forEach((t) => (t.textContent = ""));
    const box = entry.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    box.checked = false;
    box.removeAttribute("checked");
    addButton.closest(".css-1ebprri")!.before(entry);
  });
}

function profile(): Profile {
  const p = emptyProfile();
  p.workHistory = [
    { id: "a", company: "Initech", title: "Staff Engineer", location: "Pune", start: "2023-03", end: "", current: true, description: "Platform work" },
    { id: "b", company: "Hooli", title: "Senior Software Engineer", location: "Hyderabad", start: "2022-01", end: "2024-12", current: false, description: "Apps" },
    { id: "c", company: "Globex", title: "Software Engineer", location: "Hyderabad", start: "2019-05", end: "2022-01", current: false, description: "Dashboards" },
  ];
  return p;
}

const work = () =>
  extractFields(document, "myExperience")
    .filter((f) => f.section === "Work Experience" && ["jobTitle", "companyName", "location"].includes(f.key ?? ""))
    .map((f) => [f.entry, f.key, f.value]);

describe("autofill adds missing entries before filling", () => {
  beforeEach(() => load(myExperienceHtml));

  it("tops up existing entries to match the profile (2 on page, 3 in profile)", async () => {
    simulateWorkExperienceAdd({ startEmpty: false });
    const result = await autofillStep(document, workdayAdapter, profile(), OPTS);
    expect(result).toMatchObject({ ok: true, added: 1 });
    expect(work()).toEqual([
      [1, "jobTitle", "Staff Engineer"], [1, "companyName", "Initech"], [1, "location", "Pune"],
      [2, "jobTitle", "Senior Software Engineer"], [2, "companyName", "Hooli"], [2, "location", "Hyderabad"],
      [3, "jobTitle", "Software Engineer"], [3, "companyName", "Globex"], [3, "location", "Hyderabad"],
    ]);
  });

  it("adds every entry on a fresh page with none yet", async () => {
    simulateWorkExperienceAdd({ startEmpty: true });
    const result = await autofillStep(document, workdayAdapter, profile(), OPTS);
    expect(result).toMatchObject({ ok: true, added: 3 });
    expect(work().filter((r) => r[1] === "companyName").map((r) => r[2])).toEqual(["Initech", "Hooli", "Globex"]);
  });

  it("never removes entries the page has beyond the profile", async () => {
    simulateWorkExperienceAdd({ startEmpty: false });
    const p = profile();
    p.workHistory = p.workHistory.slice(0, 1);
    const result = await autofillStep(document, workdayAdapter, p, OPTS);
    expect(result).toMatchObject({ ok: true, added: 0 });
    expect(work().filter((r) => r[1] === "companyName")).toHaveLength(2);
  });

  it("asks for help when Add doesn't produce an entry", async () => {
    // No simulation: on a saved page the Add button does nothing.
    const result = await autofillStep(document, workdayAdapter, profile(), OPTS);
    expect(result.ok && result.todo[0]).toEqual({ label: "Work Experience: add entry 3", hint: "click Add yourself, then Autofill again" });
  });

  it("says when a section on the page has nothing in the profile", async () => {
    // The captured page has Languages entries, so empty that section first (fresh-application state).
    document.querySelectorAll('[aria-labelledby="Languages-section"] [aria-labelledby$="-panel"]').forEach((p) => p.remove());
    simulateWorkExperienceAdd({ startEmpty: false });
    const result = await autofillStep(document, workdayAdapter, profile(), OPTS);
    expect(result.ok && result.notes).toContain("Languages: 0 on page, 0 in your profile, so nothing to add");
  });

  describe("empty Languages section (fresh application)", () => {
    /**
     * Empties the captured Languages section and makes its button a plain "Add" with no automation id.
     * `bareMarkup` also strips the role/aria-labelledby that the fixtures' section groups carry.
     * Clicking Add appends a blank copy of the captured "Languages 1" panel.
     */
    function emptyLanguages({ bareMarkup }: { bareMarkup: boolean }) {
      const group = document.querySelector('[aria-labelledby="Languages-section"]')!;
      const panels = [...group.querySelectorAll('[aria-labelledby$="-panel"]')];
      const template = panels[0]!.outerHTML;
      panels.forEach((p) => p.remove());
      const add = group.querySelector('[data-automation-id="add-button"]')!;
      add.removeAttribute("data-automation-id");
      add.textContent = "Add";
      if (bareMarkup) {
        group.removeAttribute("role");
        group.removeAttribute("aria-labelledby");
      }
      let n = 0;
      add.addEventListener("click", () => {
        n++;
        const holder = document.createElement("div");
        holder.innerHTML = template
          .replaceAll("language-794", `language-95${n}`)
          .replaceAll("Languages-1-panel", `Languages-${n}-panel`)
          .replace(">Languages 1<", `>Languages ${n}<`);
        add.closest(".css-1ebprri")!.before(holder.firstElementChild!);
      });
    }

    const withLanguages = () => {
      const p = profile();
      p.languages = [
        { id: "en", language: "English", fluent: true, reading: "fluent", speaking: "fluent", writing: "fluent" },
        { id: "hi", language: "Hindi", fluent: false, reading: "beginner", speaking: "intermediate", writing: "beginner" },
      ];
      return p;
    };
    const languageEntries = () =>
      new Set(extractFields(document, "myExperience").filter((f) => f.key === "language").map((f) => f.entry)).size;

    it.each([false, true])("adds one entry per language (bare markup: %s)", async (bareMarkup) => {
      emptyLanguages({ bareMarkup });
      const result = await autofillStep(document, workdayAdapter, withLanguages(), OPTS);
      expect(result.ok && result.notes).toContain("Languages: 0 on page, 2 in your profile, added 2");
      expect(languageEntries()).toBe(2);
      // The new entries' fields must still be recognised as Languages, so the language rules apply.
      const sections = extractFields(document, "myExperience").filter((f) => f.key === "language").map((f) => f.section);
      expect(sections).toEqual(["Languages", "Languages"]);
    });
  });
});
