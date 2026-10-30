import { act, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { FillError, setChecked, setNativeValue, waitFor } from "./fill";

// Commits on blur, like Workday: the "committed" value only updates when the field is left.
function CommitOnBlur() {
  const [value, setValue] = useState("");
  const [committed, setCommitted] = useState("");
  const [ticked, setTicked] = useState(false);
  const [tickCommitted, setTickCommitted] = useState(false);
  return (
    <form>
      <input aria-label="field" value={value} onChange={(e) => setValue(e.target.value)} onBlur={() => setCommitted(value)} />
      <input aria-label="tick" type="checkbox" checked={ticked} onChange={(e) => setTicked(e.target.checked)} onBlur={() => setTickCommitted(ticked)} />
      <output data-testid="committed">{JSON.stringify({ committed, tickCommitted })}</output>
    </form>
  );
}

// A small controlled form: if React's state doesn't update, the echoed <output> won't either.
function Form() {
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [agree, setAgree] = useState(false);
  const [color, setColor] = useState("");
  return (
    <form>
      <input aria-label="name" value={name} onChange={(e) => setName(e.target.value)} />
      <textarea aria-label="bio" value={bio} onChange={(e) => setBio(e.target.value)} />
      <input aria-label="agree" type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
      <input aria-label="red" type="radio" name="c" value="red" checked={color === "red"} onChange={() => setColor("red")} />
      <input aria-label="blue" type="radio" name="c" value="blue" checked={color === "blue"} onChange={() => setColor("blue")} />
      <output data-testid="state">{JSON.stringify({ name, bio, agree, color })}</output>
    </form>
  );
}

const state = () => JSON.parse(screen.getByTestId("state").textContent!);

describe("fill against a React form", () => {
  it("setNativeValue updates React state for inputs and textareas", () => {
    render(<Form />);
    act(() => setNativeValue(screen.getByLabelText("name") as HTMLInputElement, "Ada Lovelace"));
    act(() => setNativeValue(screen.getByLabelText("bio") as HTMLTextAreaElement, "Line one\nLine two"));
    expect(state()).toMatchObject({ name: "Ada Lovelace", bio: "Line one\nLine two" });
  });

  it("a plain .value assignment would NOT update React state (why the native setter is needed)", () => {
    render(<Form />);
    const input = screen.getByLabelText("name") as HTMLInputElement;
    act(() => {
      input.value = "ignored";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(state().name).toBe("");
  });

  it("setChecked ticks and unticks a controlled checkbox", () => {
    render(<Form />);
    const box = screen.getByLabelText("agree") as HTMLInputElement;
    act(() => setChecked(box, true));
    expect(state().agree).toBe(true);
    act(() => setChecked(box, false));
    expect(state().agree).toBe(false);
  });

  it("setChecked selects a radio", () => {
    render(<Form />);
    act(() => setChecked(screen.getByLabelText("blue") as HTMLInputElement, true));
    expect(state().color).toBe("blue");
  });

  it("setChecked does nothing when already in the wanted state", () => {
    render(<Form />);
    act(() => setChecked(screen.getByLabelText("agree") as HTMLInputElement, false));
    expect(state().agree).toBe(false);
  });

  it("throws when React reverts the value", () => {
    function Locked() {
      return <input aria-label="locked" value="fixed" onChange={() => {}} />;
    }
    render(<Locked />);
    // React restores the controlled value synchronously after the input event.
    expect(() => act(() => setNativeValue(screen.getByLabelText("locked") as HTMLInputElement, "new"))).toThrow(FillError);
  });
});

describe("leaving the field so the page commits the value (React onBlur)", () => {
  const committed = () => JSON.parse(screen.getByTestId("committed").textContent!);

  it("fires React's onBlur after setting a value and after ticking a box", () => {
    render(<CommitOnBlur />);
    act(() => setNativeValue(screen.getByLabelText("field") as HTMLInputElement, "Pune"));
    act(() => setChecked(screen.getByLabelText("tick") as HTMLInputElement, true));
    expect(committed()).toEqual({ committed: "Pune", tickCommitted: true });
  });

  it("still fires it when real focus()/blur() do nothing (tab not focused while the popup is open)", () => {
    render(<CommitOnBlur />);
    const field = screen.getByLabelText("field") as HTMLInputElement;
    field.focus = () => {};
    field.blur = () => {};
    act(() => setNativeValue(field, "Pune"));
    expect(committed().committed).toBe("Pune");
  });
});

describe("waitFor", () => {
  it("resolves once the DOM changes to satisfy the predicate", async () => {
    document.body.innerHTML = "<div id='host'></div>";
    const pending = waitFor(() => document.querySelector("#late"), 1000);
    setTimeout(() => document.getElementById("host")!.append(Object.assign(document.createElement("p"), { id: "late" })), 10);
    await expect(pending).resolves.toHaveProperty("id", "late");
  });

  it("rejects after the timeout", async () => {
    await expect(waitFor(() => null, 20)).rejects.toThrow(/timed out/);
  });
});
