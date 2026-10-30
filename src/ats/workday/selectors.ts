// Every Workday selector lives here, taken from the saved pages in ./fixtures.
// If Workday changes its markup, this should be the only file to edit.

import type { StepId } from "../../core/types";

const aid = (id: string) => `[data-automation-id="${id}"]`;

/**
 * How each step is recognised: `marker` must be present; fields are read from inside `root`
 * (defaults to the marker). Checked in order.
 */
export const STEPS: { step: StepId; marker: string; root?: string }[] = [
  // Job posting: either the "Start Your Application" popup is open, or only the Apply button shows.
  { step: "start", marker: aid("applyManually") },
  { step: "start", marker: aid("jobPostingPage") },
  // Create Account and Sign In share the signInContent container; each has its own submit button.
  { step: "createAccount", marker: aid("createAccountSubmitButton"), root: aid("signInContent") },
  { step: "signIn", marker: aid("signInSubmitButton"), root: aid("signInContent") },
  { step: "myInformation", marker: aid("applyFlowMyInfoPage") },
  { step: "myExperience", marker: aid("applyFlowMyExpPage") },
  { step: "applicationQuestions", marker: aid("applyFlowPrimaryQuestionsPage") },
  { step: "voluntaryDisclosures", marker: aid("applyFlowVoluntaryDisclosuresPage") },
];

/**
 * Fallback: the active progress-bar step's visible name.
 * "Create Account/Sign In" is deliberately absent: the name alone can't tell the two apart.
 */
export const PROGRESS_STEP_NAMES: Record<string, StepId> = {
  "My Information": "myInformation",
  "My Experience": "myExperience",
  "Application Questions": "applicationQuestions",
  "Voluntary Disclosures": "voluntaryDisclosures",
  Review: "review",
};

export const SEL = {
  applyFlowPage: aid("applyFlowPage"),
  progressActiveStep: aid("progressBarActiveStep"),
  // The active step <li> holds two labels: "current step 1 of 5" (aria-live) and the step name.
  progressStepName: "label:not([aria-live])",
  jobTitle: aid("jobTitleHeading"),
  jobPostingTitle: aid("jobPostingHeader"),

  /** Wrapper around every form field: data-automation-id="formField-<key>". */
  formField: '[data-automation-id^="formField-"]',
  formFieldPrefix: "formField-",

  /** Single-choice dropdown: a button that opens a listbox; the selected id sits in a sibling input. */
  dropdownButton: 'button[aria-haspopup="listbox"]',
  dropdownValueInput: 'input[type="text"]',

  /**
   * Open dropdown (fixtures/degreeDropdownOpen.html): the button gets aria-expanded="true" and
   * aria-controls="<id>"; a <ul role="listbox" id="<id>"> is rendered at the end of <body>.
   * Each option's data-value is the id that lands in the hidden input once chosen.
   */
  dropdownOption: 'li[role="option"]:not([aria-disabled="true"])',

  /** Searchable picker ("prompt"): typeahead input plus pills for selected items. */
  promptContainer: aid("multiSelectContainer"),
  promptInput: 'input[data-uxi-widget-type="selectinput"]',
  promptSelectedLabel: `${aid("selectedItem")} ${aid("promptOption")}`,
  /**
   * Open prompt (fixtures/skillsPromptOpen.html): a popup at the end of <body>, linked to the field's
   * multiSelectContainer by data-associated-widget="<container id>". Result rows are role="option"
   * menuItems holding a promptLeafNode; an empty search shows one row labelled "No Items.". Live
   * suggestion rows carry instanceid NO_METADATA_ID too, so that id doesn't mark the placeholder.
   */
  // Matched on the link to the field only: not every prompt's popup uses the responsiveMonikerPrompt id.
  promptPopup: (containerId: string) => `[data-associated-widget="${containerId}"]`,
  /** Any row in the open prompt's list (the captured rows are role="option" menuItems). */
  promptRow: '[role="option"]',
  promptResult: aid("promptLeafNode"),
  promptResultLabel: aid("promptOption"),
  dateMonthDisplay: aid("dateSectionMonth-display"),
  dateYearDisplay: aid("dateSectionYear-display"),
  /** Workday's message under a date it rejected, e.g. "Error: Invalid Date: 12/" (seen on the live page). */
  dateErrorText: /invalid date[^A-Za-z]*/i,

  /** Month/year date: two spinbutton inputs. */
  dateWrapper: aid("dateInputWrapper"),
  dateMonthInput: aid("dateSectionMonth-input"),
  dateYearInput: aid("dateSectionYear-input"),

  fileInput: aid("file-upload-input-ref"),
  uploadedFileName: aid("file-upload-item-name"),

  /** Section group ("Work Experience") and repeatable entry panel ("Work Experience 2"). */
  sectionGroup: '[role="group"][aria-labelledby$="-section"]',
  entryPanel: '[role="group"][aria-labelledby$="-panel"]',
  addButton: aid("add-button"),
  /** Fallbacks for a section's Add button and heading when the automation ids above are missing. */
  addButtonText: /^add( another)?$/i,
  sectionHeading: "h4",

  nextButton: aid("pageFooterNextButton"),
  backButton: aid("pageFooterBackButton"),

  /** Hidden "for robots only" input on the auth pages. Must never be filled. */
  honeypot: aid("beecatcher"),
} as const;

/** Job posting + "Start Your Application" popup (fixtures/start.html). All options are <a href> links. */
export const START = {
  /** "Apply" on the posting; opens the popup. */
  applyButton: aid("adventureButton"),
  popup: `${aid("wd-popup-frame")}[role="dialog"]`,
  applyManually: aid("applyManually"),
  /** Offered to the user as an option, never chosen by default. */
  useMyLastApplication: aid("useMyLastApplication"),
  /** Never used: Workday's resume parser garbles data. */
  autofillWithResume: aid("autofillWithResume"),
} as const;

/** Create Account form (fixtures/createAccount.html). */
export const CREATE_ACCOUNT = {
  email: aid("email"),
  password: aid("password"),
  verifyPassword: aid("verifyPassword"),
  consentCheckbox: aid("createAccountCheckbox"),
  // The visible "Create Account" control is a div overlay; the real <button type="submit"> beneath it
  // is aria-hidden with tabindex -2. Click the overlay.
  submitClickTarget: `${aid("noCaptchaWrapper")} ${aid("click_filter")}`,
  submitButton: aid("createAccountSubmitButton"),
  switchToSignIn: aid("signInLink"),
} as const;

/** Sign In form (fixtures/signIn.html). Same overlay pattern as Create Account. */
export const SIGN_IN = {
  email: aid("email"),
  password: aid("password"),
  submitClickTarget: `${aid("noCaptchaWrapper")} ${aid("click_filter")}`,
  submitButton: aid("signInSubmitButton"),
  switchToCreateAccount: aid("createAccountLink"),
} as const;

/** Header button shown only when signed out. */
export const SIGNED_OUT_MARKER = aid("utilityButtonSignIn");
