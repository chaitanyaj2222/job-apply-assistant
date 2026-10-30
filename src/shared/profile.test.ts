import { describe, expect, it } from "vitest";
import { emptyProfile, newId, PREFER_NOT_TO_SAY, ProfileSchema } from "./profile";

describe("ProfileSchema", () => {
  it("fills every field with defaults from an empty object", () => {
    const p = emptyProfile();
    expect(p.personal.firstName).toBe("");
    expect(p.workHistory).toEqual([]);
    expect(p.totalYoe).toBeNull();
    expect(p.disclosures.gender).toBe(PREFER_NOT_TO_SAY);
  });

  it("round-trips a full profile unchanged", () => {
    const p = emptyProfile();
    p.personal.firstName = "Ada";
    p.personal.email = "ada@example.com";
    p.links.linkedin = "https://www.linkedin.com/in/ada";
    p.workHistory.push({
      id: newId(), company: "Acme", title: "Engineer", location: "Remote",
      start: "2020-01", end: "", current: true, description: "Built things",
    });
    p.totalYoe = 5;
    const roundTripped = ProfileSchema.parse(JSON.parse(JSON.stringify(p)));
    expect(roundTripped).toEqual(p);
  });

  it("adds fields missing from an older saved profile", () => {
    const p = ProfileSchema.parse({ personal: { firstName: "Ada" } });
    expect(p.personal.firstName).toBe("Ada");
    expect(p.personal.lastName).toBe("");
    expect(p.address.city).toBe("");
  });

  it("rejects invalid email, URL and month values", () => {
    const r = ProfileSchema.safeParse({
      personal: { email: "nope" },
      links: { linkedin: "linkedin.com/in/ada" },
      workHistory: [{ id: "1", start: "2020-13" }],
    });
    expect(r.success).toBe(false);
    const paths = r.error!.issues.map((i) => i.path.join("."));
    expect(paths).toEqual(expect.arrayContaining(["personal.email", "links.linkedin", "workHistory.0.start"]));
  });
});
