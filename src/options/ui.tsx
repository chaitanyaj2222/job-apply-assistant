import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

// Validation errors keyed by dotted zod path, e.g. "workHistory.0.start".
export const ErrorsContext = createContext<Record<string, string>>({});

const inputCls =
  "w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 aria-[invalid=true]:border-red-500";

function Labelled({ label, name, hint, children }: { label: string; name?: string; hint?: string; children: ReactNode }) {
  const error = useContext(ErrorsContext)[name ?? ""];
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      {children}
      {hint && !error && <span className="block text-xs text-slate-500">{hint}</span>}
      {error && <span className="block text-xs text-red-600">{error}</span>}
    </label>
  );
}

const useInvalid = (name?: string) => Boolean(useContext(ErrorsContext)[name ?? ""]);

export function TextInput(props: {
  label: string;
  name?: string;
  value: string;
  onChange: (v: string) => void;
  type?: "text" | "email" | "tel" | "url" | "month";
  placeholder?: string;
  hint?: string;
  disabled?: boolean;
}) {
  const invalid = useInvalid(props.name);
  return (
    <Labelled label={props.label} name={props.name} hint={props.hint}>
      <input
        className={inputCls}
        type={props.type ?? "text"}
        value={props.value}
        placeholder={props.placeholder}
        disabled={props.disabled}
        aria-invalid={invalid}
        onChange={(e) => props.onChange(e.target.value)}
      />
    </Labelled>
  );
}

export function TextArea(props: { label: string; name?: string; value: string; onChange: (v: string) => void; rows?: number; hint?: string }) {
  const invalid = useInvalid(props.name);
  return (
    <Labelled label={props.label} name={props.name} hint={props.hint}>
      <textarea
        className={inputCls}
        rows={props.rows ?? 3}
        value={props.value}
        aria-invalid={invalid}
        onChange={(e) => props.onChange(e.target.value)}
      />
    </Labelled>
  );
}

export function NumberInput(props: { label: string; name?: string; value: number | null; onChange: (v: number | null) => void; hint?: string; step?: number }) {
  const invalid = useInvalid(props.name);
  return (
    <Labelled label={props.label} name={props.name} hint={props.hint}>
      <input
        className={inputCls}
        type="number"
        min={0}
        step={props.step ?? "any"}
        value={props.value ?? ""}
        aria-invalid={invalid}
        onChange={(e) => props.onChange(e.target.value === "" ? null : Number(e.target.value))}
      />
    </Labelled>
  );
}

export function Select<T extends string>(props: { label: string; name?: string; value: T; options: readonly (readonly [T, string])[]; onChange: (v: T) => void }) {
  return (
    <Labelled label={props.label} name={props.name}>
      <select className={inputCls} value={props.value} onChange={(e) => props.onChange(e.target.value as T)}>
        {props.options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </Labelled>
  );
}

// Yes / No / Not set, for booleans the user may not have answered yet.
export function TriState(props: { label: string; value: boolean | null; onChange: (v: boolean | null) => void }) {
  const toStr = (v: boolean | null) => (v === null ? "" : v ? "yes" : "no");
  return (
    <Select
      label={props.label}
      value={toStr(props.value)}
      options={[["", "Not set"], ["yes", "Yes"], ["no", "No"]] as const}
      onChange={(s) => props.onChange(s === "" ? null : s === "yes")}
    />
  );
}

export function Checkbox(props: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm text-slate-700">
      <input type="checkbox" className="h-4 w-4 rounded border-slate-300" checked={props.checked} onChange={(e) => props.onChange(e.target.checked)} />
      {props.label}
    </label>
  );
}

// Edits a string[] as one comma- or newline-separated text box; parses on blur.
export function ListText(props: { label: string; name?: string; value: string[]; onChange: (v: string[]) => void; separator: "comma" | "newline"; hint?: string }) {
  const join = (v: string[]) => v.join(props.separator === "comma" ? ", " : "\n");
  const [text, setText] = useState(join(props.value));
  // Re-sync only when the list contents change, not on every parent render.
  const contentKey = props.value.join("\u0000");
  useEffect(() => setText(join(props.value)), [contentKey]);
  const commit = () =>
    props.onChange(
      text
        .split(props.separator === "comma" ? /[,\n]/ : /\n/)
        .map((s) => s.trim())
        .filter(Boolean),
    );
  const invalid = useContext(ErrorsContext);
  const errorKey = Object.keys(invalid).find((k) => props.name && k.startsWith(props.name + "."));
  return (
    <Labelled label={props.label} name={errorKey ?? props.name} hint={props.hint}>
      {props.separator === "comma" ? (
        <input className={inputCls} value={text} onChange={(e) => setText(e.target.value)} onBlur={commit} />
      ) : (
        <textarea className={inputCls} rows={3} value={text} onChange={(e) => setText(e.target.value)} onBlur={commit} />
      )}
    </Labelled>
  );
}

export function Section({ id, title, description, children }: { id: string; title: string; description?: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-6 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

export const Grid = ({ children }: { children: ReactNode }) => <div className="grid gap-4 sm:grid-cols-2">{children}</div>;

export function Button({ children, variant = "secondary", ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "danger" }) {
  const styles = {
    primary: "bg-indigo-600 text-white hover:bg-indigo-700 disabled:bg-indigo-300",
    secondary: "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50",
    danger: "border border-red-200 bg-white text-red-600 hover:bg-red-50",
  }[variant];
  return (
    <button type="button" className={`rounded-md px-3 py-1.5 text-sm font-medium shadow-sm ${styles}`} {...rest}>
      {children}
    </button>
  );
}

// Repeatable entries (work history, education, short answers) with reorder/remove.
export function ListEditor<T extends { id: string }>(props: {
  items: T[];
  onChange: (items: T[]) => void;
  newItem: () => T;
  addLabel: string;
  title: (item: T, index: number) => string;
  render: (item: T, update: (patch: Partial<T>) => void, index: number) => ReactNode;
}) {
  const { items, onChange } = props;
  const move = (i: number, d: -1 | 1) => {
    const next = [...items];
    const [it] = next.splice(i, 1);
    next.splice(i + d, 0, it!);
    onChange(next);
  };
  return (
    <div className="space-y-3">
      {items.map((item, i) => (
        <div key={item.id} className="rounded-md border border-slate-200 bg-slate-50 p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <span className="truncate text-sm font-semibold text-slate-700">{props.title(item, i)}</span>
            <div className="flex shrink-0 gap-1">
              <Button aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>↑</Button>
              <Button aria-label="Move down" disabled={i === items.length - 1} onClick={() => move(i, 1)}>↓</Button>
              <Button variant="danger" onClick={() => onChange(items.filter((x) => x.id !== item.id))}>Remove</Button>
            </div>
          </div>
          {props.render(item, (patch) => onChange(items.map((x) => (x.id === item.id ? { ...x, ...patch } : x))), i)}
        </div>
      ))}
      <Button onClick={() => onChange([...items, props.newItem()])}>+ {props.addLabel}</Button>
    </div>
  );
}
