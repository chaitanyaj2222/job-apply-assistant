// Widget fillers against the real captured markup. A saved page has no Workday scripts, so each test
// adds a small stand-in for the behaviour Workday's JS provides (open on click, re-render on change).
import { beforeEach, describe, expect, it } from "vitest";
import { FillError } from "../../core/fill";
import { extractFields, findContainer } from "./adapter";
import degreeHtml from "./fixtures/degreeDropdownOpen.html?raw";
import myExperienceHtml from "./fixtures/myExperience.html?raw";
import skillsHtml from "./fixtures/skillsPromptOpen.html?raw";
import { fillDropdown, fillMonthYear, fillPrompt } from "./widgets";

const FAST = { timeoutMs: 200 };

function load(html: string) {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  document.replaceChild(document.importNode(parsed.documentElement, true), document.documentElement);
}

describe("fillDropdown (Degree)", () => {
  let button: HTMLButtonElement;
  let idInput: HTMLInputElement;
  let popup: Element;

  /** Stand-in for Workday: open on `trigger`, pick on option click, close on Escape. */
  function simulate(trigger: "click" | "keydown") {
    popup = document.querySelector("[data-behavior-click-outside-close]")!;
    popup.remove();
    button.setAttribute("aria-expanded", "false");
    button.removeAttribute("aria-controls");
    const open = () => {
      document.body.append(popup);
      button.setAttribute("aria-expanded", "true");
      button.setAttribute("aria-controls", "d9c0l");
    };
    const close = () => {
      popup.remove();
      button.setAttribute("aria-expanded", "false");
    };
    button.addEventListener(trigger, (e) => {
      if (trigger === "keydown" && (e as KeyboardEvent).key !== "ArrowDown") return;
      if (button.getAttribute("aria-expanded") === "true") close();
      else open();
    });
    popup.addEventListener("click", (e) => {
      const li = (e.target as Element).closest('li[role="option"]');
      if (!li || li.getAttribute("aria-disabled") === "true") return;
      button.textContent = li.textContent;
      idInput.value = li.getAttribute("data-value")!;
      close();
    });
    popup.addEventListener("keydown", (e) => (e as KeyboardEvent).key === "Escape" && close());
  }

  beforeEach(() => {
    load(degreeHtml);
    button = document.getElementById("education-10--degree") as HTMLButtonElement;
    idInput = button.parentElement!.querySelector("input")!;
  });

  it("opens the list, picks the matching option and verifies it stuck", async () => {
    simulate("click");
    await expect(fillDropdown(findContainer(document, "education-10--degree")!, "Master of Technology", FAST)).resolves.toBe("filled");
    expect(button.textContent).toBe("Master of Technology");
    expect(idInput.value).toBe("55ec000d5683010a0fe4144bd30123d7");
    expect(button.getAttribute("aria-expanded")).toBe("false");
  });

  it("accepts a unique partial match", async () => {
    simulate("click");
    await fillDropdown(findContainer(document, "education-10--degree")!, "Bachelor of Tech", FAST);
    expect(button.textContent).toBe("Bachelor of Technology");
  });

  it("refuses an ambiguous match and closes the list", async () => {
    simulate("click");
    await expect(fillDropdown(findContainer(document, "education-10--degree")!, "Bachelor", FAST)).rejects.toThrow(/no option matching "Bachelor"/);
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(button.textContent).toBe("Bachelor of Engineering");
  });

  it("never picks the disabled 'Select One' placeholder", async () => {
    simulate("click");
    await expect(fillDropdown(findContainer(document, "education-10--degree")!, "Select One", FAST)).rejects.toThrow(FillError);
  });

  it("falls back to the keyboard when a click doesn't open it", async () => {
    simulate("keydown");
    await fillDropdown(findContainer(document, "education-10--degree")!, "Diploma", FAST);
    expect(button.textContent).toBe("Diploma");
  });

  it("reports a list that never opens", async () => {
    popup = document.querySelector("[data-behavior-click-outside-close]")!;
    popup.remove();
    button.setAttribute("aria-expanded", "false");
    await expect(fillDropdown(findContainer(document, "education-10--degree")!, "Diploma", FAST)).rejects.toThrow("dropdown didn't open");
  });
});

describe("fillPrompt (Skills)", () => {
  const CATALOG = ["TypeScript", "TypeScript (Programming Language)", "React Native", "React.js", "Kubernetes"];

  /**
   * Stand-in for Workday's search. Matching rows (cloned from the captured "No Items." row, the only
   * result row we have markup for) appear as you type, or only on Enter in "enter" mode. Leaving the box
   * (blur) closes the list and clears the text, as a type-ahead does. Clicking a row adds a pill;
   * clicking an already-selected one removes it, as Workday's multi-select does.
   */
  function simulate({
    slowResults = false,
    rerenderOnPick = false,
    // "unfiltered": typing shows a fixed alphabetical list that ignores the text; only Enter searches.
    mode = "typeahead" as "typeahead" | "enter" | "unfiltered",
    // Keep the last results on screen after a pick, and delay new results (stale-list case).
    keepListAfterPick = false,
    resultsDelayMs = 5,
    // How the page accepts a pick: a click on the leaf node, a click on the row itself only, or keyboard only.
    pick = "leaf" as "leaf" | "row" | "keyboard",
  } = {}) {
    const prompt = document.querySelector('[data-automation-id="multiSelectContainer"]')!;
    const input = prompt.querySelector("input")!;
    let pills = prompt.querySelector('[data-automation-id="selectedItemList"]')!;
    const list = document.querySelector('[data-automation-id="activeListContainer"] > div')!;
    const template = list.firstElementChild!.cloneNode(true) as Element;
    const showRows = (labels: string[]) =>
      list.replaceChildren(
        ...(labels.length ? labels : ["No Items."]).map((label, i) => {
          const row = template.cloneNode(true) as Element;
          // Like the live page, real suggestions keep the placeholder's NO_METADATA_ID instance id.
          const text = row.querySelector('[data-automation-id="promptOption"]')!;
          text.setAttribute("data-automation-label", label);
          text.textContent = label;
          return row;
        }),
      );
    const search = () => {
      const q = input.value.toLowerCase();
      if (!q) return;
      const results = CATALOG.filter((c) => c.toLowerCase().includes(q));
      if (slowResults) {
        // Leftover rows from an earlier search stay up while the real results take 700 ms.
        showRows(["React Native", "Kubernetes"]);
        setTimeout(() => showRows(results), 700);
      } else setTimeout(() => showRows(results), resultsDelayMs); // results arrive async
    };
    if (mode === "typeahead") input.addEventListener("input", search);
    if (mode === "unfiltered") input.addEventListener("input", () => showRows(["Accounting", "Biology", "Chemistry"]));
    input.addEventListener("keydown", (e) => (e as KeyboardEvent).key === "Enter" && search());
    input.addEventListener("blur", () => {
      input.value = "";
      showRows([]);
    });
    const labelOf = (row: Element | null | undefined) =>
      row?.querySelector('[data-automation-id="promptOption"]')?.getAttribute("data-automation-label");
    let highlighted = -1;
    input.addEventListener("keydown", (e) => {
      const key = (e as KeyboardEvent).key;
      if (key === "ArrowDown") highlighted++;
      if (key === "Enter" && pick === "keyboard" && highlighted >= 0) addPill(labelOf(list.children[highlighted]));
    });
    list.addEventListener("click", (e) => {
      const target = e.target as Element;
      if (pick === "keyboard") return;
      if (pick === "row" && !target.matches('[role="option"]')) return;
      addPill(labelOf(target.closest('[role="option"]')));
    });
    function addPill(label: string | null | undefined) {
      highlighted = -1;
      if (!label || label === "No Items.") return;
      const existing = [...pills.querySelectorAll('[data-automation-id="promptOption"]')].find(
        (p) => p.getAttribute("data-automation-label") === label,
      );
      if (existing) {
        existing.closest("li")!.remove(); // toggles off
        return;
      }
      const pill = pills.firstElementChild!.cloneNode(true) as Element;
      const p = pill.querySelector('[data-automation-id="promptOption"]')!;
      p.setAttribute("data-automation-label", label);
      p.textContent = label;
      pills.append(pill);
      input.value = "";
      if (!keepListAfterPick) showRows([]);
      if (rerenderOnPick) {
        // Workday redraws the widget after a pick: the old element is detached, a copy takes its place.
        const fresh = prompt.cloneNode(true) as Element;
        prompt.replaceWith(fresh);
        pills = fresh.querySelector('[data-automation-id="selectedItemList"]')!;
      }
    }
  }

  beforeEach(() => load(skillsHtml));

  const skills = () => extractFields(document, "myExperience").find((f) => f.key === "skills")!.value;

  it("searches for each missing skill and picks the exact result", async () => {
    simulate();
    await expect(fillPrompt(findContainer(document, "skills--skills")!, ["React.js", "TypeScript", "Kubernetes"], FAST)).resolves.toBe("filled");
    expect(skills()).toEqual(["Agile Methodology", "React.js", "sql", "TypeScript", "Kubernetes"]);
  });

  it("reports unchanged when every skill is already there", async () => {
    simulate();
    await expect(fillPrompt(findContainer(document, "skills--skills")!, ["react.js", "SQL"], FAST)).resolves.toBe("unchanged");
  });

  it("says which skills it couldn't find, after adding the rest", async () => {
    simulate();
    await expect(fillPrompt(findContainer(document, "skills--skills")!, ["Kubernetes", "Cobol"], FAST)).rejects.toThrow(
      'added 1; couldn\'t add "Cobol". First problem: no search results for "Cobol"',
    );
    expect(skills()).toContain("Kubernetes");
  });

  it("never clicks the 'No Items.' row", async () => {
    simulate();
    await expect(fillPrompt(findContainer(document, "skills--skills")!, ["Fortran"], FAST)).rejects.toThrow('couldn\'t add "Fortran"');
    expect(skills()).toEqual(["Agile Methodology", "React.js", "sql"]);
  });

  it("waits for this search's results instead of judging leftover rows", async () => {
    simulate({ slowResults: true });
    await expect(fillPrompt(findContainer(document, "skills--skills")!, ["TypeScript"], { timeoutMs: 3000 })).resolves.toBe("filled");
    expect(skills()).toContain("TypeScript");
  });

  it("sees a pick that Workday redraws the widget for", async () => {
    simulate({ rerenderOnPick: true });
    await expect(fillPrompt(findContainer(document, "skills--skills")!, ["Kubernetes"], FAST)).resolves.toBe("filled");
    expect(skills()).toContain("Kubernetes");
  });

  it("finds a popup that lacks the responsiveMonikerPrompt id (linked to the field only)", async () => {
    simulate();
    document.querySelector('[data-associated-widget]')!.removeAttribute("data-automation-id");
    await expect(fillPrompt(findContainer(document, "skills--skills")!, ["Kubernetes"], FAST)).resolves.toBe("filled");
  });

  it("ignores the previous search's list and never un-selects a skill it just added", async () => {
    // Results take 2 s while the last search's rows (including the skill just picked) stay on screen.
    simulate({ keepListAfterPick: true, resultsDelayMs: 2000 });
    await expect(fillPrompt(findContainer(document, "skills--skills")!, ["React Native", "TypeScript", "Kubernetes"], { timeoutMs: 6000 })).resolves.toBe("filled");
    expect(skills()).toEqual(["Agile Methodology", "React.js", "sql", "React Native", "TypeScript", "Kubernetes"]);
  }, 30_000);

  it("presses Enter to search when typing shows an unrelated alphabetical list", async () => {
    simulate({ mode: "unfiltered" });
    await expect(fillPrompt(findContainer(document, "skills--skills")!, ["Kubernetes"], { timeoutMs: 4000 })).resolves.toBe("filled");
    expect(skills()).toContain("Kubernetes");
    expect(skills()).not.toContain("Accounting");
  }, 20_000);

  it("refuses to pick an unrelated suggestion", async () => {
    simulate({ mode: "unfiltered" });
    // Start empty, like a fresh Field of Study: typing shows Accounting/Biology/Chemistry, Enter finds nothing.
    document.querySelectorAll('[data-automation-id="selectedItemList"] > li').forEach((li) => li.remove());
    await expect(fillPrompt(findContainer(document, "skills--skills")!, "Electrical Electronics Engineering", { timeoutMs: 2000 })).rejects.toThrow(
      'no suggestion matching "Electrical Electronics Engineering" (saw: Accounting, Biology, Chemistry)',
    );
    expect(skills()).not.toContain("Accounting");
  }, 20_000);

  it("counts a skill as present only on an exact match (SQL is not PostgreSQL)", async () => {
    simulate();
    // The fixture has "sql" already; "React" is only a partial match for "React.js", so it gets searched.
    await expect(fillPrompt(findContainer(document, "skills--skills")!, ["SQL", "React Native"], FAST)).resolves.toBe("filled");
    expect(skills()).toContain("React Native");
  });

  it("takes the first suggestion when none matches exactly", async () => {
    simulate();
    // "Script" partly matches two catalog entries; the first suggestion wins.
    // No exact hit, so the filler waits for the suggestions to settle (1.5 s) before taking the first.
    await expect(fillPrompt(findContainer(document, "skills--skills")!, ["Script"], { timeoutMs: 4000 })).resolves.toBe("filled");
    expect(skills()).toContain("TypeScript");
  });

  it.each(["row", "keyboard"] as const)("still picks when the page only accepts a %s pick", async (pick) => {
    simulate({ pick });
    await expect(fillPrompt(findContainer(document, "skills--skills")!, ["Kubernetes"], { timeoutMs: 3000 })).resolves.toBe("filled");
    expect(skills()).toContain("Kubernetes");
  });

  it("falls back to Enter when nothing is suggested while typing", async () => {
    simulate({ mode: "enter" });
    await expect(fillPrompt(findContainer(document, "skills--skills")!, ["Kubernetes"], FAST)).resolves.toBe("filled");
    expect(skills()).toContain("Kubernetes");
  });

  it("stops searching after two empty searches and says what the list showed", async () => {
    simulate();
    let searches = 0;
    document.getElementById("skills--skills")!.addEventListener("keydown", (e) => (e as KeyboardEvent).key === "Enter" && searches++);
    const attempt = fillPrompt(findContainer(document, "skills--skills")!, ["Cobol", "Fortran", "Pascal", "Ada"], FAST);
    await expect(attempt).rejects.toThrow(/no search results for "Cobol" \(suggestion list had 1 row\(s\): No Items\.; search box had "Cobol"\)/);
    expect(searches).toBe(2);
  });

  it("leaves an existing different single choice for the user", async () => {
    simulate();
    await expect(fillPrompt(findContainer(document, "skills--skills")!, "Kubernetes", FAST)).rejects.toThrow(/already set to/);
  });
});

describe("fillMonthYear", () => {
  beforeEach(() => {
    load(myExperienceHtml);
    // Stand-in for Workday re-rendering the visible date sections from the inputs.
    for (const wrapper of document.querySelectorAll('[data-automation-id="dateInputWrapper"]')) {
      for (const part of ["Month", "Year"] as const) {
        const input = wrapper.querySelector<HTMLInputElement>(`[data-automation-id="dateSection${part}-input"]`)!;
        const display = wrapper.querySelector(`[data-automation-id="dateSection${part}-display"]`)!;
        input.addEventListener("input", () => (display.textContent = part === "Month" ? input.value.padStart(2, "0") : input.value));
      }
    }
  });

  it("sets month and year and checks the rendered display", async () => {
    const container = findContainer(document, "workExperience-791--startDate")!;
    await expect(fillMonthYear(container, "03/2020", FAST)).resolves.toBe("filled");
    const field = extractFields(document, "myExperience").find((f) => f.id === "workExperience-791--startDate")!;
    expect(field.value).toBe("03/2020");
  });

  it("rejects malformed dates", async () => {
    await expect(fillMonthYear(findContainer(document, "workExperience-791--startDate")!, "2020-03", FAST)).rejects.toThrow(/not a MM\/YYYY/);
  });
});
