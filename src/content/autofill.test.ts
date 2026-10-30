import { beforeEach, describe, expect, it } from "vitest";
import { workdayAdapter } from "../ats/workday/adapter";
import myInformationHtml from "../ats/workday/fixtures/myInformation.html?raw";
import signInHtml from "../ats/workday/fixtures/signIn.html?raw";
import { clearHighlights } from "../core/highlight";
import { emptyProfile } from "../shared/profile";
import { autofillStep } from "./autofill";

function load(html: string) {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  document.replaceChild(document.importNode(parsed.documentElement, true), document.documentElement);
}

const NO_DELAY = { delayMs: [0, 0] as const, timeoutMs: 50 };

function profile() {
  const p = emptyProfile();
  p.personal.firstName = "Sam";
  p.personal.lastName = "Doe";
  p.personal.phone = "91234 56789";
  p.address = { line1: "42 Lake Road", line2: "", city: "Pune", state: "", postalCode: "411001", country: "India" };
  return p;
}

const outline = (id: string) => workdayAdapter.fieldElement(document, id)?.getAttribute("data-jaa-highlight");

describe("autofillStep on My Information", () => {
  beforeEach(() => load(myInformationHtml));

  it("fills from the profile, then reports and outlines what's left", async () => {
    // Make two required fields empty so there's something left for the user.
    document.querySelector<HTMLInputElement>("#name--legalName--firstName")!.value = "";
    document.querySelector<HTMLInputElement>("#phoneNumber--phoneNumber")!.value = "";
    const p = profile();
    p.address.country = "Germany"; // country dropdown shows India → can't change yet → needs you

    const result = await autofillStep(document, workdayAdapter, p, NO_DELAY);
    expect(result).toMatchObject({ ok: true, step: "myInformation", profileEmpty: false });
    if (!result.ok) return;

    expect(document.querySelector<HTMLInputElement>("#name--legalName--firstName")!.value).toBe("Sam");
    expect(document.querySelector<HTMLInputElement>("#address--city")!.value).toBe("Pune");
    expect(document.querySelector<HTMLInputElement>("#phoneNumber--phoneNumber")!.value).toBe("91234 56789");
    expect(result.filled).toBe(5); // first name, address line 1, city, postal code, phone number

    expect(result.todo).toEqual([
      { label: "Country / Territory", hint: "Germany: dropdown didn't open" },
      { label: "Country / Territory Phone Code", hint: 'Germany: already set to "India (+91)"; change it yourself if needed' },
    ]);
    expect(outline("name--legalName--firstName")).toBe("filled");
    expect(outline("country--country")).toBe("needsYou");
    expect(outline("name--legalName--lastName")).toBeNull(); // unchanged: no outline
  });

  it("highlights clear cleanly, restoring the site's own styles", async () => {
    const container = workdayAdapter.fieldElement(document, "address--city")!;
    container.style.outline = "1px dotted blue";
    await autofillStep(document, workdayAdapter, profile(), NO_DELAY);
    expect(container.style.outline).toContain("solid");
    clearHighlights(document);
    expect(container.style.outline).toBe("1px dotted blue");
    expect(container.hasAttribute("data-jaa-highlight")).toBe(false);
  });

  it("fills fields that appear while filling (preferred name revealed by its checkbox)", async () => {
    // Stand-in for Workday: ticking "I have a preferred name" reveals a Preferred First Name box.
    const box = document.getElementById("name--preferredCheck") as HTMLInputElement;
    box.addEventListener("click", () => {
      const field = document.createElement("div");
      field.setAttribute("data-automation-id", "formField-preferredName--firstName");
      field.setAttribute("data-fkit-id", "name--preferredName--firstName");
      field.innerHTML = '<label for="pref-first">Preferred First Name</label><input type="text" id="pref-first" value="">';
      box.closest('[data-automation-id="formField-preferredCheck"]')!.after(field);
    });
    const p = profile();
    p.personal.preferredFirstName = "Sammy";
    const result = await autofillStep(document, workdayAdapter, p, NO_DELAY);
    expect(box.checked).toBe(true);
    expect(document.querySelector<HTMLInputElement>("#pref-first")!.value).toBe("Sammy");
    expect(result.ok && outline("name--preferredName--firstName")).toBe("filled");
  });

  it("flags an empty profile", async () => {
    const result = await autofillStep(document, workdayAdapter, emptyProfile(), NO_DELAY);
    expect(result).toMatchObject({ ok: true, profileEmpty: true });
  });
});

describe("autofillStep outside application steps", () => {
  it("refuses to fill sign-in pages", async () => {
    load(signInHtml);
    const result = await autofillStep(document, workdayAdapter, profile(), NO_DELAY);
    expect(result.ok).toBe(false);
    expect(document.querySelector<HTMLInputElement>('[data-automation-id="email"]')!.value).toBe("");
  });
});
