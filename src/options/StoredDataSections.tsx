import { useEffect, useState } from "react";
import type { AccountLogEntry, AnswerMemoryEntry, StoredResume } from "../shared/profile";
import { getLocal, onLocalChanged, setLocal, type LocalKey, type LocalValue } from "../shared/storage";
import { Button, Section } from "./ui";

// These sections save straight to storage (no Save button): they're edited one item at a time.
function useStored<K extends LocalKey>(key: K): LocalValue<K> | undefined {
  const [value, setValue] = useState<LocalValue<K>>();
  useEffect(() => {
    void getLocal(key).then(setValue);
    return onLocalChanged(key, setValue);
  }, [key]);
  return value;
}

const MAX_RESUME_BYTES = 10 * 1024 * 1024;

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function ResumeSection() {
  const resume = useStored("resume");
  const [error, setError] = useState<string>();

  const upload = async (file: File | undefined) => {
    setError(undefined);
    if (!file) return;
    if (file.type !== "application/pdf") return setError("Please choose a PDF file.");
    if (file.size > MAX_RESUME_BYTES) return setError("PDF is larger than 10 MB.");
    const stored: StoredResume = {
      name: file.name,
      type: file.type,
      size: file.size,
      dataBase64: await readAsBase64(file),
      uploadedAt: new Date().toISOString(),
    };
    await setLocal("resume", stored);
  };

  return (
    <Section id="resume" title="Resume" description="Uploaded to application file fields. Never sent to the AI. Saved immediately.">
      {resume ? (
        <div className="flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
          <div>
            <div className="font-medium text-slate-800">{resume.name}</div>
            <div className="text-slate-500">
              {(resume.size / 1024).toFixed(0)} KB · uploaded {new Date(resume.uploadedAt).toLocaleDateString()}
            </div>
          </div>
          <Button variant="danger" onClick={() => void setLocal("resume", null)}>Remove</Button>
        </div>
      ) : (
        <p className="text-sm text-slate-500">No resume uploaded.</p>
      )}
      <input
        type="file"
        accept="application/pdf"
        className="block text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-indigo-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-indigo-700"
        onChange={(e) => {
          void upload(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
    </Section>
  );
}

export function AnswerMemorySection() {
  const memory = useStored("answerMemory");
  const save = (next: AnswerMemoryEntry[]) => void setLocal("answerMemory", next);

  return (
    <Section id="answer-memory" title="Saved answer memory" description="Answers you corrected on past applications. Reused when the same question appears again. Edits save when you leave the field.">
      {!memory?.length ? (
        <p className="text-sm text-slate-500">Nothing saved yet. When you edit a field the extension filled, your version is remembered here.</p>
      ) : (
        <ul className="divide-y divide-slate-200">
          {memory.map((m) => (
            <li key={m.key} className="space-y-2 py-3">
              <div className="flex items-start justify-between gap-3">
                <span className="text-sm font-medium text-slate-800">{m.question}</span>
                <Button variant="danger" onClick={() => save(memory.filter((x) => x.key !== m.key))}>Delete</Button>
              </div>
              <textarea
                className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
                rows={2}
                defaultValue={m.answer}
                onBlur={(e) => {
                  if (e.target.value === m.answer) return;
                  save(memory.map((x) => (x.key === m.key ? { ...x, answer: e.target.value, updatedAt: new Date().toISOString() } : x)));
                }}
              />
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

export function AccountLogSection() {
  const log = useStored("accountLog");
  return (
    <Section id="accounts" title="Accounts created" description="ATS accounts the extension created for you, and the terms accepted. Passwords are never stored. Your browser's password manager keeps them.">
      {!log?.length ? (
        <p className="text-sm text-slate-500">No accounts created yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-slate-500">
              <tr>
                <th className="py-2 pr-4 font-medium">Company</th>
                <th className="py-2 pr-4 font-medium">Site</th>
                <th className="py-2 pr-4 font-medium">Email</th>
                <th className="py-2 pr-4 font-medium">Date</th>
                <th className="py-2 font-medium">Terms</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {log.map((a: AccountLogEntry) => (
                <tr key={a.tenantUrl + a.date}>
                  <td className="py-2 pr-4">{a.company}</td>
                  <td className="py-2 pr-4">
                    <a className="text-indigo-600 hover:underline" href={a.tenantUrl} target="_blank" rel="noreferrer">{new URL(a.tenantUrl).host}</a>
                  </td>
                  <td className="py-2 pr-4">{a.email}</td>
                  <td className="py-2 pr-4">{new Date(a.date).toLocaleDateString()}</td>
                  <td className="py-2">{a.termsAccepted ? "Accepted" : "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}
