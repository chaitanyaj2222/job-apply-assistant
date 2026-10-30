import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { getLocal } from "../shared/storage";
import { App } from "./App";

describe("options page", () => {
  it("saves edits to storage", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.type(await screen.findByLabelText("First name"), "Ada");
    await user.click(screen.getByRole("button", { name: "+ Add job" }));
    await user.type(screen.getByLabelText("Company"), "Acme");
    await user.click(screen.getByRole("button", { name: "Save profile" }));
    await screen.findByText("Saved");
    const p = await getLocal("profile");
    expect(p.personal.firstName).toBe("Ada");
    expect(p.workHistory).toHaveLength(1);
    expect(p.workHistory[0]!.company).toBe("Acme");
  });

  it("shows inline errors and does not save invalid data", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.type(await screen.findByLabelText(/^Email/), "not-an-email");
    await user.click(screen.getByRole("button", { name: "Save profile" }));
    expect(await screen.findByText("Enter a valid email")).toBeInTheDocument();
    expect(screen.getByText("1 field(s) need fixing")).toBeInTheDocument();
    await waitFor(async () => expect((await getLocal("profile")).personal.email).toBe(""));
  });
});

describe("options page import", () => {
  it("loads a profile file into the form without saving it", async () => {
    const user = userEvent.setup();
    render(<App />);
    const file = new File([JSON.stringify({ personal: { firstName: "Imported" }, skills: ["Go"] })], "p.json", { type: "application/json" });
    await user.upload(await screen.findByLabelText("Import profile file"), file);
    expect(await screen.findByDisplayValue("Imported")).toBeInTheDocument();
    expect(screen.getByText("Imported. Review, then save")).toBeInTheDocument();
    expect((await getLocal("profile")).personal.firstName).toBe("");
  });

  it("rejects an invalid file", async () => {
    const user = userEvent.setup();
    render(<App />);
    const file = new File([JSON.stringify({ personal: { email: "nope" } })], "p.json", { type: "application/json" });
    await user.upload(await screen.findByLabelText("Import profile file"), file);
    expect(await screen.findByText(/Import failed: personal\.email/)).toBeInTheDocument();
  });
});
