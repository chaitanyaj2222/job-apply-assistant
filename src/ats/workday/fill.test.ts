import { beforeEach, describe, expect, it } from "vitest";
import type { FieldValue } from "../../core/types";
import { extractFields, fillStep, findContainer } from "./adapter";
import myExperienceHtml from "./fixtures/myExperience.html?raw";
import myInformationHtml from "./fixtures/myInformation.html?raw";

/** Loads a fixture into the live jsdom document (so focus, events and clicks behave as on a page). */
function load(html: string) {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  document.replaceChild(document.importNode(parsed.documentElement, true), document.documentElement);
}

const v = (fieldId: string, value: FieldValue["value"]): FieldValue => ({ fieldId, value, source: "rule", confidence: 1 });
const NO_DELAY = { delayMs: [0, 0] as const, timeoutMs: 50 };
const valueOf = (key: string, entry?: number) =>
  extractFields(document, "myExperience").concat(extractFields(document, "myInformation"))
    .find((f) => f.key === key && (entry === undefined || f.entry === entry))?.value;

describe("Workday fillStep: My Information", () => {
  beforeEach(() => load(myInformationHtml));

  it("fills text fields, picks a radio and reports what it did", async () => {
    const report = await fillStep(
      document,
      "myInformation",
      [
        v("name--legalName--firstName", "Sam"),
        v("name--legalName--lastName", "Doe"), // already "Doe"
        v("address--city", "Pune"),
        v("previousWorker--candidateIsPreviousWorker", "Yes"),
        v("country--country", "India"), // dropdown already showing India
        v("phoneNumber--phoneType", "Landline"), // dropdown, different value
      ],
      NO_DELAY,
    );
    expect(report.filled).toEqual(["name--legalName--firstName", "address--city", "previousWorker--candidateIsPreviousWorker"]);
    expect(report.unchanged).toEqual(["name--legalName--lastName", "country--country"]);
    // A saved page has no Workday scripts, so the dropdown can't open: reported, not guessed.
    expect(report.skipped).toEqual([{ fieldId: "phoneNumber--phoneType", reason: "dropdown didn't open" }]);

    const fields = extractFields(document, "myInformation");
    const byId = (id: string) => fields.find((f) => f.id === id)!.value;
    expect(byId("name--legalName--firstName")).toBe("Sam");
    expect(byId("address--city")).toBe("Pune");
    expect(byId("previousWorker--candidateIsPreviousWorker")).toBe("Yes");
  });

  it("dispatches input, change and blur on the input it fills", async () => {
    const input = document.getElementById("name--legalName--firstName")!;
    const seen: string[] = [];
    for (const t of ["input", "change", "blur"]) input.addEventListener(t, () => seen.push(t));
    await fillStep(document, "myInformation", [v("name--legalName--firstName", "Sam")], NO_DELAY);
    expect(seen).toEqual(["input", "change", "blur"]);
  });

  it("reports a radio option that doesn't exist instead of guessing", async () => {
    const report = await fillStep(document, "myInformation", [v("previousWorker--candidateIsPreviousWorker", "Maybe")], NO_DELAY);
    expect(report.skipped).toEqual([{ fieldId: "previousWorker--candidateIsPreviousWorker", reason: 'no option "Maybe"' }]);
  });

  it("skips fields that aren't on the page", async () => {
    const report = await fillStep(document, "myInformation", [v("nope--missing", "x")], NO_DELAY);
    expect(report.skipped[0]!.reason).toBe("field is no longer on the page");
  });

  it("finds the container for highlighting", () => {
    expect(findContainer(document, "address--city")?.getAttribute("data-automation-id")).toBe("formField-city");
  });
});

describe("Workday fillStep: My Experience checkboxes and textareas", () => {
  beforeEach(() => load(myExperienceHtml));

  it("unticks a checkbox and fills a textarea", async () => {
    const report = await fillStep(
      document,
      "myExperience",
      [v("workExperience-790--currentlyWorkHere", false), v("workExperience-790--roleDescription", "New text")],
      NO_DELAY,
    );
    expect(report.filled).toEqual(["workExperience-790--currentlyWorkHere", "workExperience-790--roleDescription"]);
    expect(valueOf("currentlyWorkHere", 1)).toBe(false);
    expect(valueOf("roleDescription", 1)).toBe("New text");
  });

  it("reports a date the page didn't re-render instead of claiming success", async () => {
    // Static fixture: setting the inputs doesn't update Workday's rendered display.
    const report = await fillStep(document, "myExperience", [v("workExperience-791--startDate", "03/2020")], NO_DELAY);
    expect(report.skipped[0]!.reason).toBe("the date didn't take; enter it yourself");
  });
});
