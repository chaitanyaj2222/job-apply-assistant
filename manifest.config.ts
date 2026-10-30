import { defineManifest } from "@crxjs/vite-plugin";
import pkg from "./package.json" with { type: "json" };

// Hosts the content script may run on. Adding an ATS means adding its host here.
export const ATS_HOSTS = ["*://*.myworkdayjobs.com/*"];

export default defineManifest({
  manifest_version: 3,
  name: "Job Apply Assistant",
  version: pkg.version,
  description: "Autofills job applications from your profile and stops at the review page.",
  icons: { 16: "icons/icon16.png", 48: "icons/icon48.png", 128: "icons/icon128.png" },
  action: { default_popup: "src/popup/index.html" },
  options_page: "src/options/index.html",
  background: { service_worker: "src/background/index.ts", type: "module" },
  content_scripts: [{ matches: ATS_HOSTS, js: ["src/content/index.ts"], run_at: "document_idle" }],
  permissions: ["storage", "unlimitedStorage", "activeTab", "scripting"],
  host_permissions: [...ATS_HOSTS, "https://api.groq.com/*", "http://localhost:11434/*"],
});
