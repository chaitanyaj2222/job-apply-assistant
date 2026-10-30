// Dev-only harness: loads saved ATS pages and runs an adapter against them.
// Served by `npm run dev` at http://localhost:5173/dev/ — not part of the extension build.
import { StrictMode, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "../src/shared/tailwind.css";
import { ADAPTERS } from "../src/ats/registry";
import type { Field, StepId } from "../src/core/types";
import { autofillStep } from "../src/content/autofill";
import { emptyProfile } from "../src/shared/profile";

// Placeholder profile for watching fills in the harness (not your real profile).
const SAMPLE_PROFILE = (() => {
  const p = emptyProfile();
  p.personal = { ...p.personal, firstName: "Sam", lastName: "Rivera", email: "sam@example.com", phone: "91234 56789" };
  p.address = { line1: "42 Lake Road", line2: "", city: "Pune", state: "", postalCode: "411001", country: "India" };
  p.links = { linkedin: "https://www.linkedin.com/in/sam", github: "https://github.com/sam", portfolio: "", other: [] };
  p.workHistory = [
    { id: "w1", company: "Initech", title: "Staff Engineer", location: "Pune", start: "2023-03", end: "", current: true, description: "Platform work" },
    { id: "w2", company: "Hooli", title: "Engineer", location: "Mumbai", start: "2020-01", end: "2023-02", current: false, description: "Apps" },
  ];
  return p;
})();

// Keyed by "<adapterId>/<fixture>.html", e.g. "workday/myInformation.html".
const FIXTURES = Object.fromEntries(
  Object.entries(
    import.meta.glob<string>("../src/ats/*/fixtures/*.html", { query: "?raw", import: "default", eager: true }),
  ).map(([path, html]) => [path.replace(/^.*\/ats\/([^/]+)\/fixtures\/(.*)$/, "$1/$2"), html]),
);

const show = (v: Field["value"]) => (Array.isArray(v) ? v.join(", ") : String(v));

function Harness() {
  const names = Object.keys(FIXTURES).sort();
  const [name, setName] = useState(() => new URLSearchParams(location.search).get("f") ?? names[0] ?? "");
  const [step, setStep] = useState<StepId>("unknown");
  const [fields, setFields] = useState<Field[]>([]);
  const frame = useRef<HTMLIFrameElement>(null);
  const [fillNote, setFillNote] = useState("");
  const adapter = ADAPTERS.find((a) => a.id === name.split("/")[0]);

  useEffect(() => history.replaceState(null, "", `?f=${encodeURIComponent(name)}`), [name]);

  const analyse = () => {
    const doc = frame.current?.contentDocument;
    if (!doc || !adapter) return;
    const s = adapter.detectStep(doc);
    setStep(s);
    setFields(adapter.extractFields(doc, s));
  };

  const fill = async () => {
    const doc = frame.current?.contentDocument;
    if (!doc || !adapter) return;
    const r = await autofillStep(doc, adapter, SAMPLE_PROFILE, { delayMs: [50, 150] });
    setFillNote(r.ok ? `filled ${r.filled}, unchanged ${r.unchanged}, needs you ${r.todo.length}` : r.reason);
    analyse();
  };

  return (
    <div className="flex h-screen flex-col bg-slate-100 text-slate-900">
      <header className="flex flex-wrap items-center gap-3 border-b bg-white px-4 py-2 text-sm">
        <strong>Fixture harness</strong>
        <select className="rounded border px-2 py-1" value={name} onChange={(e) => setName(e.target.value)}>
          {names.map((n) => (
            <option key={n}>{n}</option>
          ))}
        </select>
        <span>
          Step: <code>{step}</code>
        </span>
        <span>Fields: {fields.length}</span>
        <button type="button" className="rounded border px-2 py-1 hover:bg-slate-50" onClick={analyse}>
          Re-extract
        </button>
        <button type="button" className="rounded border px-2 py-1 hover:bg-slate-50" onClick={() => void fill()}>
          Fill with sample profile
        </button>
        {fillNote && <span className="text-slate-500">{fillNote}</span>}
      </header>
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-2">
        <iframe ref={frame} title="fixture" className="h-full w-full border-r bg-white" srcDoc={FIXTURES[name]} onLoad={analyse} />
        <div className="overflow-auto p-3">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-slate-100 text-slate-500">
              <tr>
                <th className="p-1">Section</th>
                <th className="p-1">#</th>
                <th className="p-1">Label</th>
                <th className="p-1">Type</th>
                <th className="p-1">Req</th>
                <th className="p-1">Value</th>
                <th className="p-1">Key / id</th>
              </tr>
            </thead>
            <tbody>
              {fields.map((f) => (
                <tr key={f.id} className="border-t align-top">
                  <td className="p-1">{f.section}</td>
                  <td className="p-1">{f.entry}</td>
                  <td className="max-w-xs p-1">{f.label}</td>
                  <td className="p-1">{f.type}</td>
                  <td className="p-1">{f.required ? "✓" : ""}</td>
                  <td className="max-w-xs truncate p-1" title={show(f.value)}>{show(f.value)}</td>
                  <td className="p-1 font-mono text-[10px] text-slate-500">{f.key}<br />{f.id}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Harness />
  </StrictMode>,
);
