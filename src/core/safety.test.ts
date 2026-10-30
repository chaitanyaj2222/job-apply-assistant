import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { clickRefusal, safeClick, SafetyError } from "./safety";

const el = (html: string) => {
  document.body.innerHTML = html;
  return document.body.firstElementChild!;
};

describe("safeClick", () => {
  it.each([
    ["button text", '<button>Submit</button>'],
    ["longer button text", '<button>Submit Application</button>'],
    ["aria-label", '<div role="button" aria-label="Submit application"></div>'],
    ["title", '<button title="Submit"><svg></svg></button>'],
    ["input value", '<input type="submit" value="Submit">'],
    ["case-insensitive", '<a role="button" href="#">SUBMIT</a>'],
  ])("refuses a submit control (%s)", (_name, html) => {
    const target = el(html);
    const onClick = vi.fn();
    target.addEventListener("click", onClick);
    expect(() => safeClick(target)).toThrow(SafetyError);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("refuses a click on an element inside a submit button", () => {
    el('<button><span id="inner">Submit</span></button>');
    expect(() => safeClick(document.getElementById("inner")!)).toThrow(SafetyError);
  });

  it("refuses deny-listed controls whatever their text", () => {
    const target = el('<button data-automation-id="finalButton">Send</button>');
    expect(clickRefusal(target, ['[data-automation-id="finalButton"]'])).toMatch(/deny-listed/);
    expect(() => safeClick(target, ['[data-automation-id="finalButton"]'])).toThrow(SafetyError);
  });

  it.each([
    '<button data-automation-id="pageFooterNextButton">Save and Continue</button>',
    // Workday's Create Account / Sign In buttons carry "Submit" only in their internal id.
    '<button type="submit" data-automation-id="createAccountSubmitButton">Create Account</button>',
    '<div role="button" aria-label="Sign In" data-automation-id="click_filter"></div>',
    '<input type="checkbox" id="c">',
  ])("allows ordinary controls: %s", (html) => {
    const target = el(html);
    const onClick = vi.fn();
    target.addEventListener("click", onClick);
    safeClick(target);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("does not match 'submit' inside other words", () => {
    expect(clickRefusal(el("<button>Resubmitted? No</button>"))).toBeNull();
  });
});

describe("click discipline", () => {
  it("has no .click() calls outside safety.ts", () => {
    const root = join(__dirname, "..");
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) && !path.endsWith(join("core", "safety.ts"))) {
          if (/\.click\(\s*\)/.test(readFileSync(path, "utf8"))) offenders.push(relative(root, path));
        }
      }
    };
    walk(root);
    expect(offenders).toEqual([]);
  });
});
