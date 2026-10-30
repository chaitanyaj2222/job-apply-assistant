import { describe, expect, it } from "vitest";
import { extractFields } from "../ats/workday/adapter";
import createAccountHtml from "../ats/workday/fixtures/createAccount.html?raw";
import myExperienceHtml from "../ats/workday/fixtures/myExperience.html?raw";
import myInformationHtml from "../ats/workday/fixtures/myInformation.html?raw";
import { emptyProfile, type Profile } from "../shared/profile";
import { desiredEntries, mapByRules, normalize } from "./mapper";
import { bestMatch } from "./text";
import type { Field } from "./types";

const parse = (html: string) => new DOMParser().parseFromString(html, "text/html");

function sampleProfile(): Profile {
  const p = emptyProfile();
  p.personal = { firstName: "Sam", middleName: "", lastName: "Rivera", preferredFirstName: "", preferredLastName: "", email: "sam@example.com", phoneCountryCode: "+91", phone: "91234 56789" };
  p.address = { line1: "42 Lake Road", line2: "", city: "Pune", state: "Maharashtra", postalCode: "411001", country: "India" };
  p.links = { linkedin: "https://www.linkedin.com/in/sam", github: "https://github.com/sam", portfolio: "", other: [] };
  p.workHistory = [
    { id: "w1", company: "Initech", title: "Staff Engineer", location: "Pune", start: "2023-03", end: "", current: true, description: "Platform work" },
    { id: "w2", company: "Hooli", title: "Engineer", location: "Mumbai", start: "2020-01", end: "2023-02", current: false, description: "Apps" },
  ];
  p.education = [{ id: "e1", school: "Pune University", degree: "Bachelor of Engineering", fieldOfStudy: "Computer Science", start: "", end: "", grade: "" }];
  p.skills = ["TypeScript", "React"];
  return p;
}

/** label → mapped value, for readable assertions. */
const byLabel = (fields: Field[], profile: Profile) => {
  const values = new Map(mapByRules(fields, profile).map((v) => [v.fieldId, v.value]));
  return fields.filter((f) => values.has(f.id)).map((f) => [f.section ?? "", f.entry ?? "", f.label, values.get(f.id)]);
};

describe("normalize", () => {
  it("lowercases and strips punctuation", () => {
    expect(normalize("  Country / Territory Phone Code* ")).toBe("country territory phone code");
  });
});

describe("mapByRules on My Information", () => {
  const fields = extractFields(parse(myInformationHtml), "myInformation");

  it("maps every field the profile can answer", () => {
    expect(byLabel(fields, sampleProfile())).toEqual([
      ["", "", "Country / Territory", "India"],
      ["Legal Name", "", "First Name", "Sam"],
      ["Legal Name", "", "Family or Last Name", "Rivera"],
      ["Legal Name", "", "I have a preferred name", false],
      ["Address", "", "Address Line 1", "42 Lake Road"],
      ["Address", "", "City", "Pune"],
      ["Address", "", "Postal Code", "411001"],
      ["Phone", "", "Phone Device Type", "Mobile"],
      ["Phone", "", "Country / Territory Phone Code", "India"],
      ["Phone", "", "Phone Number", "91234 56789"],
    ]);
  });

  it("leaves questions it can't answer from the profile (previous employee, local names) to later stages", () => {
    const mapped = new Set(mapByRules(fields, sampleProfile()).map((v) => v.fieldId));
    const unmapped = fields.filter((f) => !mapped.has(f.id)).map((f) => f.label);
    expect(unmapped).toEqual([
      "Have you previously worked for Caterpillar Inc., Solar or any subsidiaries as an employee or contingent worker?",
      "Local First Name",
      "Local Family Name",
      "Phone Extension",
    ]);
  });

  it("maps nothing from an empty profile except fixed answers", () => {
    expect(byLabel(fields, emptyProfile()).map((r) => r[2])).toEqual(["I have a preferred name", "Phone Device Type"]);
  });

  it("marks every value as a confident rule match", () => {
    for (const v of mapByRules(fields, sampleProfile())) expect(v).toMatchObject({ source: "rule", confidence: 1 });
  });
});

describe("mapByRules on My Experience", () => {
  const fields = extractFields(parse(myExperienceHtml), "myExperience");
  const mapped = byLabel(fields, sampleProfile());

  it("maps Work Experience N to the Nth job in the profile", () => {
    expect(mapped.filter((r) => r[0] === "Work Experience")).toEqual([
      ["Work Experience", 1, "Job Title", "Staff Engineer"],
      ["Work Experience", 1, "Company", "Initech"],
      ["Work Experience", 1, "Location", "Pune"],
      ["Work Experience", 1, "I currently work here", true],
      ["Work Experience", 1, "From", "03/2023"],
      ["Work Experience", 1, "Role Description", "Platform work"],
      ["Work Experience", 2, "Job Title", "Engineer"],
      ["Work Experience", 2, "Company", "Hooli"],
      ["Work Experience", 2, "Location", "Mumbai"],
      ["Work Experience", 2, "I currently work here", false],
      ["Work Experience", 2, "From", "01/2020"],
      ["Work Experience", 2, "To", "02/2023"],
      ["Work Experience", 2, "Role Description", "Apps"],
    ]);
  });

  it("maps education, skills, websites and LinkedIn", () => {
    expect(mapped.filter((r) => r[0] !== "Work Experience")).toEqual([
      ["Education", 1, "School or University", "Pune University"],
      ["Education", 1, "Degree", "Bachelor of Engineering"],
      ["Education", 1, "Field of Study", "Computer Science"],
      ["Skills", "", "Type to Add Skills", ["TypeScript", "React"]],
      ["Websites", 1, "URL", "https://github.com/sam"],
      ["Social Network URLs", "", "LinkedIn", "https://www.linkedin.com/in/sam"],
    ]);
  });

  it("does not map entries the profile doesn't have", () => {
    const p = sampleProfile();
    p.workHistory = p.workHistory.slice(0, 1);
    expect(byLabel(fields, p).filter((r) => r[0] === "Work Experience" && r[1] === 2)).toEqual([]);
  });
});

describe("mapByRules never maps passwords", () => {
  it("skips password fields even with a matching label", () => {
    const fields = extractFields(parse(createAccountHtml), "createAccount");
    const mapped = mapByRules(fields, sampleProfile()).map((v) => v.fieldId);
    expect(mapped).toEqual(["email"]);
  });
});

describe("languages", () => {
  const fields = extractFields(parse(myExperienceHtml), "myExperience");
  const withLanguages = () => {
    const p = sampleProfile();
    p.languages = [
      { id: "l1", language: "English", fluent: true, reading: "fluent", speaking: "fluent", writing: "fluent" },
      { id: "l2", language: "Hindi", fluent: false, reading: "beginner", speaking: "intermediate", writing: "beginner" },
    ];
    return p;
  };

  it("maps Languages N to the Nth language, levels as plain words", () => {
    expect(byLabel(fields, withLanguages()).filter((r) => r[0] === "Languages")).toEqual([
      ["Languages", 1, "Language", "English"],
      ["Languages", 1, "I am fluent in this language.", true],
      ["Languages", 1, "Reading", "Fluent"],
      ["Languages", 1, "Speaking", "Fluent"],
      ["Languages", 1, "Writing", "Fluent"],
      ["Languages", 2, "Language", "Hindi"],
      ["Languages", 2, "I am fluent in this language.", false],
      ["Languages", 2, "Reading", "Beginner"],
      ["Languages", 2, "Speaking", "Intermediate"],
      ["Languages", 2, "Writing", "Beginner"],
    ]);
  });

  it("wants one Languages entry per profile language", () => {
    expect(desiredEntries("Languages", withLanguages())).toBe(2);
    expect(desiredEntries("Skills", withLanguages())).toBeNull();
  });

  it("level words pick the right Workday option", () => {
    // Labels seen in the captured pages ("3 - Advanced" not captured, assumed).
    const options = ["1 - Beginner", "2 - Intermediate", "3 - Advanced", "4 - Fluent"];
    expect(options[bestMatch(options, "Fluent")]).toBe("4 - Fluent");
    expect(options[bestMatch(options, "Beginner")]).toBe("1 - Beginner");
  });
});
