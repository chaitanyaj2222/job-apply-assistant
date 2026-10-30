import {
  GENDER_OPTIONS,
  LANGUAGE_LEVELS,
  newId,
  PREFER_NOT_TO_SAY,
  VETERAN_OPTIONS,
  YES_NO_PNTS,
  type EducationEntry,
  type LanguageEntry,
  type Profile,
  type ShortAnswer,
  type WorkEntry,
} from "../shared/profile";
import { Checkbox, Grid, ListEditor, ListText, NumberInput, Section, Select, TextArea, TextInput, TriState } from "./ui";

type NestedKey = "personal" | "address" | "links" | "compensation" | "workAuthorization" | "disclosures";

const PNTS_LABEL = "Prefer not to say";
const LEVEL_OPTIONS = LANGUAGE_LEVELS.map((l) => [l, l ? l[0]!.toUpperCase() + l.slice(1) : "Not set"] as const);
const optionLabels = <T extends string>(values: readonly T[], labels: Record<T, string>) => values.map((v) => [v, labels[v]] as const);

export const PROFILE_SECTIONS = [
  ["personal", "Personal"],
  ["address", "Address"],
  ["links", "Links"],
  ["work", "Work history"],
  ["education", "Education"],
  ["languages", "Languages"],
  ["skills", "Skills & numbers"],
  ["authorization", "Work authorization"],
  ["disclosures", "Voluntary disclosures"],
  ["short-answers", "Short answers"],
] as const;

export function ProfileForm({ profile, setProfile }: { profile: Profile; setProfile: (fn: (p: Profile) => Profile) => void }) {
  const set = <K extends keyof Profile>(key: K, value: Profile[K]) => setProfile((p) => ({ ...p, [key]: value }));
  const nested =
    <K extends NestedKey>(key: K) =>
    <F extends keyof Profile[K]>(field: F, value: Profile[K][F]) =>
      setProfile((p) => ({ ...p, [key]: { ...p[key], [field]: value } }));

  const personal = nested("personal");
  const address = nested("address");
  const links = nested("links");
  const comp = nested("compensation");
  const auth = nested("workAuthorization");
  const disc = nested("disclosures");
  const { personal: pe, address: ad, links: li, compensation: co, workAuthorization: wa, disclosures: di } = profile;

  return (
    <>
      <Section id="personal" title="Personal">
        <Grid>
          <TextInput label="First name" name="personal.firstName" value={pe.firstName} onChange={(v) => personal("firstName", v)} />
          <TextInput label="Last name" name="personal.lastName" value={pe.lastName} onChange={(v) => personal("lastName", v)} />
          <TextInput label="Middle name" name="personal.middleName" value={pe.middleName} onChange={(v) => personal("middleName", v)} />
          <TextInput label="Preferred first name" name="personal.preferredFirstName" value={pe.preferredFirstName} hint="Leave both preferred names empty if you only use your legal name." onChange={(v) => personal("preferredFirstName", v)} />
          <TextInput label="Preferred last name" name="personal.preferredLastName" value={pe.preferredLastName} onChange={(v) => personal("preferredLastName", v)} />
          <TextInput label="Email" type="email" name="personal.email" value={pe.email} onChange={(v) => personal("email", v)} hint="Also used to create ATS accounts." />
          <div className="grid grid-cols-[6rem_1fr] gap-2">
            <TextInput label="Code" name="personal.phoneCountryCode" value={pe.phoneCountryCode} placeholder="+91" onChange={(v) => personal("phoneCountryCode", v)} />
            <TextInput label="Phone" type="tel" name="personal.phone" value={pe.phone} onChange={(v) => personal("phone", v)} />
          </div>
        </Grid>
      </Section>

      <Section id="address" title="Address">
        <Grid>
          <TextInput label="Address line 1" name="address.line1" value={ad.line1} onChange={(v) => address("line1", v)} />
          <TextInput label="Address line 2" name="address.line2" value={ad.line2} onChange={(v) => address("line2", v)} />
          <TextInput label="City" name="address.city" value={ad.city} onChange={(v) => address("city", v)} />
          <TextInput label="State / province" name="address.state" value={ad.state} onChange={(v) => address("state", v)} />
          <TextInput label="Postal code" name="address.postalCode" value={ad.postalCode} onChange={(v) => address("postalCode", v)} />
          <TextInput label="Country" name="address.country" value={ad.country} onChange={(v) => address("country", v)} hint="Full name, as it appears in dropdowns (e.g. India)." />
        </Grid>
      </Section>

      <Section id="links" title="Links">
        <Grid>
          <TextInput label="LinkedIn" type="url" name="links.linkedin" value={li.linkedin} placeholder="https://www.linkedin.com/in/…" onChange={(v) => links("linkedin", v)} />
          <TextInput label="GitHub" type="url" name="links.github" value={li.github} onChange={(v) => links("github", v)} />
          <TextInput label="Portfolio / website" type="url" name="links.portfolio" value={li.portfolio} onChange={(v) => links("portfolio", v)} />
        </Grid>
        <ListText label="Other links" name="links.other" separator="newline" value={li.other} onChange={(v) => links("other", v)} hint="One URL per line." />
      </Section>

      <Section id="work" title="Work history" description="Most recent first. Each entry becomes one “Add” on the application's experience step.">
        <ListEditor<WorkEntry>
          items={profile.workHistory}
          onChange={(v) => set("workHistory", v)}
          addLabel="Add job"
          newItem={() => ({ id: newId(), company: "", title: "", location: "", start: "", end: "", current: false, description: "" })}
          title={(w, i) => [w.title, w.company].filter(Boolean).join(" at ") || `Job ${i + 1}`}
          render={(w, update, i) => (
            <div className="space-y-4">
              <Grid>
                <TextInput label="Job title" name={`workHistory.${i}.title`} value={w.title} onChange={(v) => update({ title: v })} />
                <TextInput label="Company" name={`workHistory.${i}.company`} value={w.company} onChange={(v) => update({ company: v })} />
                <TextInput label="Location" name={`workHistory.${i}.location`} value={w.location} onChange={(v) => update({ location: v })} />
                <div />
                <TextInput label="Start" type="month" name={`workHistory.${i}.start`} value={w.start} onChange={(v) => update({ start: v })} />
                <TextInput label="End" type="month" name={`workHistory.${i}.end`} value={w.current ? "" : w.end} disabled={w.current} onChange={(v) => update({ end: v })} />
              </Grid>
              <Checkbox label="I currently work here" checked={w.current} onChange={(v) => update({ current: v, end: v ? "" : w.end })} />
              <TextArea label="Role description" name={`workHistory.${i}.description`} rows={4} value={w.description} onChange={(v) => update({ description: v })} />
            </div>
          )}
        />
      </Section>

      <Section id="education" title="Education">
        <ListEditor<EducationEntry>
          items={profile.education}
          onChange={(v) => set("education", v)}
          addLabel="Add education"
          newItem={() => ({ id: newId(), school: "", degree: "", fieldOfStudy: "", start: "", end: "", grade: "" })}
          title={(e, i) => [e.degree, e.school].filter(Boolean).join(", ") || `Education ${i + 1}`}
          render={(e, update, i) => (
            <Grid>
              <TextInput label="School / university" name={`education.${i}.school`} value={e.school} onChange={(v) => update({ school: v })} />
              <TextInput label="Degree" name={`education.${i}.degree`} value={e.degree} placeholder="Bachelor of Technology" onChange={(v) => update({ degree: v })} />
              <TextInput label="Field of study" name={`education.${i}.fieldOfStudy`} value={e.fieldOfStudy} onChange={(v) => update({ fieldOfStudy: v })} />
              <TextInput label="Grade / GPA" name={`education.${i}.grade`} value={e.grade} onChange={(v) => update({ grade: v })} />
              <TextInput label="Start" type="month" name={`education.${i}.start`} value={e.start} onChange={(v) => update({ start: v })} />
              <TextInput label="End (or expected)" type="month" name={`education.${i}.end`} value={e.end} onChange={(v) => update({ end: v })} />
            </Grid>
          )}
        />
      </Section>

      <Section id="languages" title="Languages" description="Each one becomes a Languages entry on the application.">
        <ListEditor<LanguageEntry>
          items={profile.languages}
          onChange={(v) => set("languages", v)}
          addLabel="Add language"
          newItem={() => ({ id: newId(), language: "", fluent: false, reading: "", speaking: "", writing: "" })}
          title={(l, i) => l.language || `Language ${i + 1}`}
          render={(l, update, i) => (
            <div className="space-y-4">
              <Grid>
                <TextInput label="Language" name={`languages.${i}.language`} value={l.language} placeholder="English" onChange={(v) => update({ language: v })} />
                <div className="flex items-end pb-2">
                  <Checkbox label="I am fluent in this language" checked={l.fluent} onChange={(v) => update({ fluent: v })} />
                </div>
              </Grid>
              <div className="grid gap-4 sm:grid-cols-3">
                {(["reading", "speaking", "writing"] as const).map((skill) => (
                  <Select
                    key={skill}
                    label={skill[0]!.toUpperCase() + skill.slice(1)}
                    value={l[skill]}
                    options={LEVEL_OPTIONS}
                    onChange={(v) => update({ [skill]: v })}
                  />
                ))}
              </div>
            </div>
          )}
        />
      </Section>

      <Section id="skills" title="Skills & numbers">
        <ListText label="Skills" name="skills" separator="comma" value={profile.skills} onChange={(v) => set("skills", v)} hint="Comma-separated." />
        <Grid>
          <NumberInput label="Total years of experience" name="totalYoe" value={profile.totalYoe} step={0.5} onChange={(v) => set("totalYoe", v)} />
          <NumberInput label="Notice period (days)" name="noticePeriodDays" value={profile.noticePeriodDays} step={1} onChange={(v) => set("noticePeriodDays", v)} />
          <TextInput label="Currency" name="compensation.currency" value={co.currency} placeholder="INR" onChange={(v) => comp("currency", v)} />
          <div />
          <NumberInput label="Current fixed CTC (annual)" name="compensation.currentFixedCtc" value={co.currentFixedCtc} onChange={(v) => comp("currentFixedCtc", v)} />
          <NumberInput label="Current variable CTC (annual)" name="compensation.currentVariableCtc" value={co.currentVariableCtc} onChange={(v) => comp("currentVariableCtc", v)} />
          <NumberInput label="Current total CTC (annual)" name="compensation.currentCtc" value={co.currentCtc} hint="Fixed + variable." onChange={(v) => comp("currentCtc", v)} />
          <NumberInput label="Expected CTC (annual)" name="compensation.expectedCtc" value={co.expectedCtc} onChange={(v) => comp("expectedCtc", v)} />
        </Grid>
      </Section>

      <Section id="authorization" title="Work authorization">
        <Grid>
          <TriState label="Legally authorized to work in the job's country" value={wa.authorizedToWork} onChange={(v) => auth("authorizedToWork", v)} />
          <TriState label="Requires visa sponsorship" value={wa.requiresSponsorship} onChange={(v) => auth("requiresSponsorship", v)} />
          <TriState label="Willing to relocate" value={profile.willingToRelocate} onChange={(v) => set("willingToRelocate", v)} />
        </Grid>
        <ListText label="Preferred work locations" name="preferredLocations" separator="comma" value={profile.preferredLocations} onChange={(v) => set("preferredLocations", v)} hint="Comma-separated, e.g. Bangalore." />
        <TextArea label="Notes" name="workAuthorization.notes" value={wa.notes} onChange={(v) => auth("notes", v)} hint="e.g. which countries you're authorized in, visa type." />
      </Section>

      <Section id="disclosures" title="Voluntary disclosures" description="Used only on optional self-identification steps. Default is “Prefer not to say”.">
        <Grid>
          <Select
            label="Gender"
            value={di.gender}
            options={optionLabels(GENDER_OPTIONS, { male: "Male", female: "Female", non_binary: "Non-binary", [PREFER_NOT_TO_SAY]: PNTS_LABEL })}
            onChange={(v) => disc("gender", v)}
          />
          <Select
            label="Hispanic or Latino"
            value={di.hispanicOrLatino}
            options={optionLabels(YES_NO_PNTS, { yes: "Yes", no: "No", [PREFER_NOT_TO_SAY]: PNTS_LABEL })}
            onChange={(v) => disc("hispanicOrLatino", v)}
          />
          <TextInput
            label="Race / ethnicity"
            value={di.ethnicity === PREFER_NOT_TO_SAY ? "" : di.ethnicity}
            placeholder={PNTS_LABEL}
            hint="Leave empty for “Prefer not to say”."
            onChange={(v) => disc("ethnicity", v.trim() === "" ? PREFER_NOT_TO_SAY : v)}
          />
          <Select
            label="Veteran status"
            value={di.veteranStatus}
            options={optionLabels(VETERAN_OPTIONS, {
              not_a_veteran: "Not a veteran",
              protected_veteran: "Protected veteran",
              veteran_not_protected: "Veteran, not protected",
              [PREFER_NOT_TO_SAY]: PNTS_LABEL,
            })}
            onChange={(v) => disc("veteranStatus", v)}
          />
          <Select
            label="Disability"
            value={di.disability}
            options={optionLabels(YES_NO_PNTS, { yes: "Yes", no: "No", [PREFER_NOT_TO_SAY]: PNTS_LABEL })}
            onChange={(v) => disc("disability", v)}
          />
        </Grid>
      </Section>

      <Section id="short-answers" title="Short answers" description="Reusable answers for common questions (e.g. “Why do you want to work here?”). Given to the AI as context.">
        <ListEditor<ShortAnswer>
          items={profile.shortAnswers}
          onChange={(v) => set("shortAnswers", v)}
          addLabel="Add answer"
          newItem={() => ({ id: newId(), question: "", answer: "" })}
          title={(a, i) => a.question || `Answer ${i + 1}`}
          render={(a, update, i) => (
            <div className="space-y-3">
              <TextInput label="Question" name={`shortAnswers.${i}.question`} value={a.question} onChange={(v) => update({ question: v })} />
              <TextArea label="Answer" name={`shortAnswers.${i}.answer`} value={a.answer} onChange={(v) => update({ answer: v })} />
            </div>
          )}
        />
      </Section>
    </>
  );
}
