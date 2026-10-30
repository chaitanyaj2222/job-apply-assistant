import { describe, expect, it } from "vitest";
import type { Field } from "../../core/types";
import { companyFromUrl, detectStep, extractFields, jobTitle, workdayAdapter } from "./adapter";
import { PASSWORD_MASK } from "../../core/extract";
import applicationQuestionsHtml from "./fixtures/applicationQuestions.html?raw";
import createAccountHtml from "./fixtures/createAccount.html?raw";
import signInHtml from "./fixtures/signIn.html?raw";
import startHtml from "./fixtures/start.html?raw";
import myExperienceHtml from "./fixtures/myExperience.html?raw";
import myInformationHtml from "./fixtures/myInformation.html?raw";
import voluntaryDisclosuresHtml from "./fixtures/voluntaryDisclosures.html?raw";

const parse = (html: string) => new DOMParser().parseFromString(html, "text/html");
const byKey = (fields: Field[], key: string, entry?: number) =>
  fields.find((f) => f.key === key && (entry === undefined || f.entry === entry));

/** Compact view used for whole-step snapshots: label | type | required | value. */
const summary = (fields: Field[]) =>
  fields.map((f) => [f.section ?? "", f.entry ?? "", f.label, f.type, f.required, f.value]);

describe("workdayAdapter.matches", () => {
  it("matches Workday job hosts only", () => {
    expect(workdayAdapter.matches(new URL("https://cat.wd5.myworkdayjobs.com/en-US/CaterpillarCareers/job/x/apply"))).toBe(true);
    expect(workdayAdapter.matches(new URL("https://myworkdayjobs.com.evil.example/"))).toBe(false);
    expect(workdayAdapter.matches(new URL("https://boards.greenhouse.io/acme"))).toBe(false);
  });
});

describe("detectStep", () => {
  it.each([
    [startHtml, "start"],
    [createAccountHtml, "createAccount"],
    [signInHtml, "signIn"],
    [myInformationHtml, "myInformation"],
    [myExperienceHtml, "myExperience"],
    [applicationQuestionsHtml, "applicationQuestions"],
    [voluntaryDisclosuresHtml, "voluntaryDisclosures"],
  ] as const)("fixture → %#: %s", (html, step) => {
    expect(detectStep(parse(html))).toBe(step);
  });

  it("falls back to the active progress-bar step name", () => {
    const doc = parse(myInformationHtml);
    doc.querySelector('[data-automation-id="applyFlowMyInfoPage"]')!.removeAttribute("data-automation-id");
    expect(detectStep(doc)).toBe("myInformation");
  });

  it("does not guess between Create Account and Sign In from the progress bar alone", () => {
    const doc = parse(createAccountHtml);
    doc.querySelector('[data-automation-id="createAccountSubmitButton"]')!.remove();
    expect(detectStep(doc)).toBe("unknown");
  });

  it("returns unknown for an unrelated page", () => {
    expect(detectStep(parse("<html><body><h1>Careers</h1></body></html>"))).toBe("unknown");
  });

  it("reads the job title", () => {
    expect(jobTitle(parse(myInformationHtml))).toBe("Lead Software Engineer");
  });

  it.each([
    ["https://cat.wd5.myworkdayjobs.com/en-US/CaterpillarCareers/job/x/apply", "Caterpillar"],
    ["https://acme.wd1.myworkdayjobs.com/External_Careers/job/x", "acme"],
    ["https://nvidia.wd5.myworkdayjobs.com/en-US/NVIDIAExternalCareerSite/job/x", "NVIDIA"],
    ["https://foo.wd3.myworkdayjobs.com/en-US/GlobexJobs/job/x", "Globex"],
  ])("derives the company from %s", (url, company) => {
    expect(companyFromUrl(new URL(url))).toBe(company);
  });
});

describe("extractFields: My Information", () => {
  const fields = extractFields(parse(myInformationHtml), "myInformation");

  it("finds every form field and nothing else", () => {
    expect(summary(fields)).toEqual([
      ["", "", "Have you previously worked for Caterpillar Inc., Solar or any subsidiaries as an employee or contingent worker?", "radio", true, "No"],
      ["", "", "Country / Territory", "dropdown", true, "India"],
      ["Legal Name", "", "First Name", "text", true, "Alex"],
      ["Legal Name", "", "Family or Last Name", "text", true, "Doe"],
      ["Legal Name", "", "Local First Name", "text", false, "Alex"],
      ["Legal Name", "", "Local Family Name", "text", false, "Doe"],
      ["Legal Name", "", "I have a preferred name", "checkbox", false, false],
      ["Address", "", "Address Line 1", "text", false, "1 Example Street"],
      ["Address", "", "City", "text", false, "Bangalore"],
      ["Address", "", "Postal Code", "text", false, "560001"],
      ["Phone", "", "Phone Device Type", "dropdown", true, "Mobile"],
      ["Phone", "", "Country / Territory Phone Code", "prompt", true, ["India (+91)"]],
      ["Phone", "", "Phone Number", "text", true, "098765 43210"],
      ["Phone", "", "Phone Extension", "text", false, ""],
    ]);
  });

  it("gives radios their options and dropdowns lazy options", () => {
    expect(byKey(fields, "candidateIsPreviousWorker")?.options).toEqual(["Yes", "No"]);
    expect(byKey(fields, "country")?.options).toBe("lazy");
  });

  it("uses data-fkit-id as the field id and formField suffix as key", () => {
    const first = byKey(fields, "legalName--firstName")!;
    expect(first.id).toBe("name--legalName--firstName");
  });

  it("skips the SMS / WhatsApp marketing opt-ins", () => {
    expect(fields.some((f) => /opt-in|whatsapp/i.test(f.label))).toBe(false);
  });
});

describe("extractFields: My Experience", () => {
  const fields = extractFields(parse(myExperienceHtml), "myExperience");

  it("extracts each work-experience entry, with an end date only when not current", () => {
    const work = fields.filter((f) => f.section === "Work Experience");
    expect(work.filter((f) => f.entry === 1).map((f) => f.key)).toEqual([
      "jobTitle", "companyName", "location", "currentlyWorkHere", "startDate", "roleDescription",
    ]);
    expect(work.filter((f) => f.entry === 2).map((f) => f.key)).toEqual([
      "jobTitle", "companyName", "location", "currentlyWorkHere", "startDate", "endDate", "roleDescription",
    ]);
    expect(byKey(fields, "currentlyWorkHere", 1)?.value).toBe(true);
    expect(byKey(fields, "startDate", 1)).toMatchObject({ label: "From", type: "monthYear", required: true, value: "12/2024" });
    expect(byKey(fields, "startDate", 2)?.value).toBe("01/2022");
    expect(byKey(fields, "endDate", 2)).toMatchObject({ label: "To", value: "12/2024" });
    expect(byKey(fields, "roleDescription", 2)).toMatchObject({ type: "textarea", required: false });
  });

  it("reads education prompts and the degree dropdown", () => {
    expect(byKey(fields, "school")).toMatchObject({ section: "Education", entry: 1, label: "School or University", type: "prompt", required: true, value: ["Example University"] });
    expect(byKey(fields, "degree")).toMatchObject({ type: "dropdown", required: true, value: "Bachelor of Engineering" });
    expect(byKey(fields, "fieldOfStudy")).toMatchObject({ type: "prompt", required: false, value: ["Electrical Electronics Engineering"] });
  });

  it("treats a 'Select One' dropdown as empty", () => {
    const lang2 = fields.filter((f) => f.section === "Languages" && f.entry === 2);
    expect(lang2.map((f) => [f.label, f.value])).toEqual([
      ["Language", ""],
      ["I am fluent in this language.", false],
      ["Reading", ""],
      ["Speaking", ""],
      ["Writing", ""],
    ]);
    expect(byKey(fields, "language", 1)?.value).toBe("English");
  });

  it("reads skills, resume, websites and LinkedIn", () => {
    expect(byKey(fields, "skills")).toMatchObject({ label: "Type to Add Skills", type: "prompt", value: ["Front-End Development", "Agile Methodology", "TypeScript"] });
    expect(byKey(fields, "attachments")).toMatchObject({ section: "Resume/CV", label: "Upload a file (5MB max)", type: "file", value: ["Resume.pdf"] });
    expect(byKey(fields, "url")).toMatchObject({ section: "Websites", entry: 1, required: true, value: "https://github.com/example" });
    expect(byKey(fields, "linkedInAccount")).toMatchObject({ label: "LinkedIn", type: "text", value: "https://www.linkedin.com/in/example/" });
  });

  it("finds 30 fields in total", () => {
    expect(fields).toHaveLength(30);
  });
});

describe("extractFields: Application Questions", () => {
  const fields = extractFields(parse(applicationQuestionsHtml), "applicationQuestions");

  it("labels questionnaire dropdowns from their rich-text legend", () => {
    expect(fields).toHaveLength(2);
    expect(fields[0]).toMatchObject({
      label: "Please indicate if you now, or will you in the future, require sponsorship for an employment visa/ work permit to work in India.",
      type: "dropdown",
      required: true,
      value: "No",
      options: "lazy",
    });
    // <br><br> inside the question becomes whitespace, not glued words.
    expect(fields[1]!.label).toContain("employment decisions. Are you related by blood");
    expect(fields[1]!.label.endsWith("standard business relationship.)")).toBe(true);
  });
});

describe("extractFields: Voluntary Disclosures", () => {
  it("finds gender, citizenship and the required terms checkbox", () => {
    const fields = extractFields(parse(voluntaryDisclosuresHtml), "voluntaryDisclosures");
    expect(summary(fields)).toEqual([
      ["Personal Information", "", "Gender", "dropdown", false, "Male"],
      ["Personal Information", "", "Citizenship Status", "prompt", true, ["Citizen (India)"]],
      ["Terms and Conditions", "", "Yes, I have read and consent to the terms and conditions.", "checkbox", true, true],
    ]);
  });
});

describe("extractFields: Create Account", () => {
  const fields = extractFields(parse(createAccountHtml), "createAccount");

  it("finds email, both password fields and the consent checkbox", () => {
    expect(fields.map((f) => [f.key, f.label, f.type, f.required, f.value])).toEqual([
      ["email", "Email Address", "text", true, ""],
      ["password", "Password", "password", true, ""],
      ["verifyPassword", "Verify New Password", "password", true, ""],
      ["createAccountCheckbox", "I accept", "checkbox", false, false],
    ]);
  });

  it("identifies auth fields by automation id, since they have no data-fkit-id", () => {
    expect(fields.map((f) => f.id)).toEqual(["email", "password", "verifyPassword", "createAccountCheckbox"]);
  });

  it("never extracts the robots-only honeypot input", () => {
    expect(fields.some((f) => /website|robots/i.test(f.label) || f.key === "beecatcher")).toBe(false);
  });

  it("masks a filled password instead of reading it", () => {
    const doc = parse(createAccountHtml);
    (doc.querySelector('[data-automation-id="password"]') as HTMLInputElement).value = "S3cret!Value";
    const pw = extractFields(doc, "createAccount").find((f) => f.key === "password")!;
    expect(pw.value).toBe(PASSWORD_MASK);
    expect(JSON.stringify(extractFields(doc, "createAccount"))).not.toContain("S3cret");
  });
});

describe("extractFields: Sign In", () => {
  const fields = extractFields(parse(signInHtml), "signIn");

  it("finds email and password only (no consent box, no honeypot)", () => {
    expect(fields.map((f) => [f.id, f.label, f.type, f.required, f.value])).toEqual([
      ["email", "Email Address", "text", true, ""],
      ["password", "Password", "password", true, ""],
    ]);
  });

  it("reports a password-manager-filled password as filled, but masked", () => {
    const doc = parse(signInHtml);
    (doc.querySelector('[data-automation-id="password"]') as HTMLInputElement).value = "from-password-manager";
    expect(extractFields(doc, "signIn").find((f) => f.id === "password")!.value).toBe(PASSWORD_MASK);
  });
});

describe("Start page", () => {
  it("is detected with the Start Your Application popup open", () => {
    const doc = parse(startHtml);
    expect(doc.querySelector('[data-automation-id="applyManually"]')).not.toBeNull();
    expect(detectStep(doc)).toBe("start");
  });

  it("is detected before Apply is clicked (popup closed)", () => {
    const doc = parse(startHtml);
    doc.querySelector('[data-automation-id="wd-popup-glass"]')!.remove();
    expect(detectStep(doc)).toBe("start");
  });

  it("reads the title from the posting header and has no form fields", () => {
    const doc = parse(startHtml);
    expect(jobTitle(doc)).toBe("Lead Software Engineer");
    expect(extractFields(doc, "start")).toEqual([]);
  });
});
