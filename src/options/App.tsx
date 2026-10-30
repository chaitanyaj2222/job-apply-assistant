import { useEffect, useMemo, useState } from "react";
import { ProfileSchema, type Profile } from "../shared/profile";
import { getLocal, setLocal } from "../shared/storage";
import { PROFILE_SECTIONS, ProfileForm } from "./ProfileForm";
import { AccountLogSection, AnswerMemorySection, ResumeSection } from "./StoredDataSections";
import { Button, ErrorsContext } from "./ui";

const NAV = [
  ...PROFILE_SECTIONS,
  ["resume", "Resume"],
  ["answer-memory", "Answer memory"],
  ["accounts", "Accounts created"],
] as const;

type SaveState =
  | { kind: "idle" }
  | { kind: "saved" }
  | { kind: "imported" }
  | { kind: "invalid"; count: number }
  | { kind: "error"; message: string };

function downloadJson(name: string, data: unknown) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
  a.download = name;
  a.dispatchEvent(new MouseEvent("click"));
  URL.revokeObjectURL(a.href);
}

export function App() {
  const [profile, setProfile] = useState<Profile>();
  const [savedJson, setSavedJson] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saveState, setSaveState] = useState<SaveState>({ kind: "idle" });

  // Loads a profile file into the form without saving, so it can be reviewed first.
  const importFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const result = ProfileSchema.safeParse(JSON.parse(await file.text()));
      if (!result.success) {
        const first = result.error.issues[0];
        setSaveState({ kind: "error", message: `Import failed: ${first?.path.join(".") || "file"}: ${first?.message}` });
        return;
      }
      setProfile(result.data);
      setErrors({});
      setSaveState({ kind: "imported" });
    } catch {
      setSaveState({ kind: "error", message: "Import failed: not a valid JSON file" });
    }
  };

  useEffect(() => {
    void getLocal("profile").then((p) => {
      setProfile(p);
      setSavedJson(JSON.stringify(p));
    });
  }, []);

  const dirty = useMemo(() => profile !== undefined && JSON.stringify(profile) !== savedJson, [profile, savedJson]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const save = async () => {
    if (!profile) return;
    const result = ProfileSchema.safeParse(profile);
    if (!result.success) {
      const map: Record<string, string> = {};
      for (const issue of result.error.issues) map[issue.path.join(".")] ??= issue.message;
      setErrors(map);
      setSaveState({ kind: "invalid", count: Object.keys(map).length });
      return;
    }
    try {
      await setLocal("profile", result.data);
      setErrors({});
      setSavedJson(JSON.stringify(result.data));
      setSaveState({ kind: "saved" });
    } catch (e) {
      setSaveState({ kind: "error", message: `Save failed: ${String(e)}` });
    }
  };

  if (!profile) return <div className="p-8 text-sm text-slate-500">Loading…</div>;

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3">
          <h1 className="text-base font-semibold">Job Apply Assistant: Profile</h1>
          <div className="flex items-center gap-3 text-sm">
            {saveState.kind === "invalid" && <span className="text-red-600">{saveState.count} field(s) need fixing</span>}
            {saveState.kind === "error" && <span className="text-red-600">{saveState.message}</span>}
            {saveState.kind === "imported" && dirty && <span className="text-indigo-700">Imported. Review, then save</span>}
            {saveState.kind === "saved" && !dirty && <span className="text-green-700">Saved</span>}
            {dirty && <span className="text-amber-700">Unsaved changes</span>}
            <label className="cursor-pointer rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50">
              Import…
              <input
                type="file"
                accept="application/json,.json"
                aria-label="Import profile file"
                className="sr-only"
                onChange={(e) => {
                  void importFile(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </label>
            <Button onClick={() => profile && downloadJson("job-apply-profile.json", profile)}>Export</Button>
            <Button variant="primary" disabled={!dirty} onClick={() => void save()}>Save profile</Button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-6xl gap-8 px-6 py-6">
        <nav className="sticky top-20 hidden h-fit w-48 shrink-0 space-y-1 md:block">
          {NAV.map(([id, label]) => (
            <a key={id} href={`#${id}`} className="block rounded px-2 py-1 text-sm text-slate-600 hover:bg-white hover:text-slate-900">
              {label}
            </a>
          ))}
        </nav>
        <main className="min-w-0 flex-1 space-y-6">
          <ErrorsContext.Provider value={errors}>
            <ProfileForm profile={profile} setProfile={(fn) => setProfile((p) => (p ? fn(p) : p))} />
          </ErrorsContext.Provider>
          <ResumeSection />
          <AnswerMemorySection />
          <AccountLogSection />
        </main>
      </div>
    </div>
  );
}
