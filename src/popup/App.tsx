import { useCallback, useEffect, useState } from "react";
import type { StepId } from "../core/types";
import { sendToTab, type DetectResult, type FillResult } from "../shared/messages";
import type { Profile } from "../shared/profile";
import { getLocal } from "../shared/storage";

/** "3 jobs · 1 education · 5 languages": what Autofill will work from. */
function profileSummary(p: Profile): string {
  const n = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
  return [
    p.personal.firstName ? `${p.personal.firstName} ${p.personal.lastName}`.trim() : "no name",
    n(p.workHistory.length, "job", "jobs"),
    `${p.education.length} education`,
    n(p.languages.length, "language", "languages"),
    n(p.skills.length, "skill", "skills"),
  ].join(" · ");
}

const STEP_NAMES: Record<StepId, string> = {
  start: "Start page",
  signIn: "Sign in",
  createAccount: "Create account",
  myInformation: "My Information",
  myExperience: "My Experience",
  applicationQuestions: "Application Questions",
  voluntaryDisclosures: "Voluntary Disclosures",
  selfIdentify: "Self Identify",
  review: "Review",
  unknown: "Not recognised",
};

const ATS_NAMES: Record<string, string> = { workday: "Workday" };

type State = { kind: "loading" } | { kind: "done"; result: DetectResult };

const activeTabId = async () => (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.id;

async function detectActiveTab(): Promise<DetectResult> {
  const tabId = await activeTabId();
  if (tabId === undefined) return { ok: false, reason: "No active tab." };
  try {
    return await sendToTab(tabId, { type: "DETECT" });
  } catch {
    // No content script: either an unsupported site, or a tab opened before the extension was (re)loaded.
    return { ok: false, reason: "Not a supported job site. If it is one, reload the page and try again." };
  }
}

export function App() {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [filling, setFilling] = useState(false);
  const [fillResult, setFillResult] = useState<FillResult | null>(null);
  const [savedProfile, setSavedProfile] = useState<string>("");
  useEffect(() => void getLocal("profile").then((p) => setSavedProfile(profileSummary(p))), []);
  const refresh = useCallback(() => {
    setState({ kind: "loading" });
    void detectActiveTab().then((result) => setState({ kind: "done", result }));
  }, []);
  useEffect(refresh, [refresh]);

  const result = state.kind === "done" ? state.result : null;
  const canFill = Boolean(result?.ok && result.canFill);

  const autofill = async () => {
    const tabId = await activeTabId();
    if (tabId === undefined) return;
    setFilling(true);
    setFillResult(null);
    try {
      setFillResult(await sendToTab(tabId, { type: "FILL" }));
    } catch (e) {
      setFillResult({ ok: false, reason: `Couldn't reach the page: ${String(e)}` });
    } finally {
      setFilling(false);
      refresh();
    }
  };

  return (
    <div className="w-80 space-y-4 bg-white p-4 text-slate-900">
      <div className="flex items-center justify-between">
        <h1 className="text-base font-semibold">Job Apply Assistant</h1>
        <button type="button" className="text-xs text-slate-500 hover:text-slate-800" onClick={refresh}>
          Refresh
        </button>
      </div>

      {state.kind === "loading" && <p className="text-sm text-slate-500">Checking this page…</p>}

      {result && !result.ok && <p className="rounded-md bg-slate-50 p-3 text-sm text-slate-600">{result.reason}</p>}

      {result?.ok && (
        <dl className="grid grid-cols-[5rem_1fr] gap-y-1 text-sm">
          <dt className="text-slate-500">ATS</dt>
          <dd>{ATS_NAMES[result.ats] ?? result.ats}</dd>
          {result.jobTitle && (
            <>
              <dt className="text-slate-500">Job</dt>
              <dd className="truncate" title={`${result.jobTitle} · ${result.company}`}>
                {result.jobTitle}
                {result.company && <span className="text-slate-500"> · {result.company}</span>}
              </dd>
            </>
          )}
          <dt className="text-slate-500">Step</dt>
          <dd>{STEP_NAMES[result.step]}</dd>
          {result.step !== "unknown" && (
            <>
              <dt className="text-slate-500">Fields</dt>
              <dd>
                {result.fieldCount}
                {result.requiredEmpty > 0 && <span className="text-amber-700"> · {result.requiredEmpty} required empty</span>}
              </dd>
            </>
          )}
        </dl>
      )}

      <button
        type="button"
        disabled={!canFill || filling}
        title={canFill ? "Fill this step from your profile" : "Open an application step (My Information onwards)"}
        onClick={() => void autofill()}
        className="w-full rounded-md bg-indigo-600 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-indigo-300"
      >
        {filling ? "Filling…" : "Autofill this step"}
      </button>

      {fillResult && !fillResult.ok && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{fillResult.reason}</p>}
      {fillResult?.ok && (
        <div className="space-y-1 rounded-md bg-slate-50 p-3 text-sm">
          {fillResult.profileEmpty && <p className="text-amber-700">Your profile is empty. Add your details first.</p>}
          {fillResult.notes.map((n) => (
            <p key={n} className="text-amber-700">{n}</p>
          ))}
          <p>
            Filled <strong>{fillResult.filled}</strong>
            {fillResult.added > 0 && <span className="text-slate-500"> · added {fillResult.added} entries</span>}
            {fillResult.unchanged > 0 && <span className="text-slate-500"> · {fillResult.unchanged} already correct</span>}
          </p>
          {fillResult.todo.length > 0 ? (
            <>
              <p className="text-red-700">{fillResult.todo.length} need you (outlined red on the page):</p>
              <ul className="max-h-40 list-disc overflow-auto pl-5 text-slate-700">
                {fillResult.todo.map((t, i) => (
                  <li key={i}>
                    {t.label}
                    {t.hint && <span className="text-slate-500"> ({t.hint})</span>}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="text-green-700">Nothing left for you on this step. Check it, then click Save and Continue.</p>
          )}
        </div>
      )}
      {savedProfile && <p className="text-xs text-slate-500">Saved profile: {savedProfile}</p>}
      <button type="button" className="w-full text-sm text-indigo-600 hover:underline" onClick={() => void chrome.runtime.openOptionsPage()}>
        Edit profile
      </button>
    </div>
  );
}
