# Job Apply Assistant

Personal Chrome/Brave extension (Manifest V3) that autofills job applications from your profile and stops at the Review page so you can submit yourself. Workday first; other ATSs are added as adapters under `src/ats/`.

## Setup

Requires Node 20+ (developed on Node 24).

```sh
npm install
```

## Load the extension (Chrome or Brave)

1. Build it: `npm run build`. This writes `dist/`.
2. Open `chrome://extensions` (Brave: `brave://extensions`).
3. Turn on **Developer mode** (toggle, top right).
4. Click **Load unpacked** and select the project's `dist` folder.
5. Pin the extension from the puzzle-piece menu so the popup is one click away.
6. Right-click the icon → **Options** (or click **Edit profile** in the popup) to fill in your profile.

After a new `npm run build`, click the reload icon on the extension's card in `chrome://extensions`.

### Development with hot reload

```sh
npm run dev
```

Load `dist/` as above while the dev server is running. Popup/options changes hot-reload. Content-script and service-worker changes reload the extension automatically. Use either `npm run dev` or `npm run build` output, not both at once. Rebuild before going back to the production build.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite + CRXJS dev server with HMR |
| `npm run build` | Type-check, then production build into `dist/` |
| `npm run typecheck` | `tsc --noEmit` (strict) |
| `npm test` | Vitest (jsdom) once |
| `npm run test:watch` | Vitest in watch mode |

## Privacy

Everything is stored in `chrome.storage.local` on your machine. No analytics. The only network calls go to the LLM provider you configure. Passwords for ATS accounts are never stored; your browser's password manager keeps them.

## Fixture harness

`npm run dev`, then open http://localhost:5173/dev/. Pick any saved page from `src/ats/*/fixtures/` to see the detected step and every extracted field (label, type, required, current value). Add `?f=workday/myExperience.html` to link straight to one.

### Capturing a new fixture

On the live page, once it has fully rendered, run this in the DevTools console. It saves the rendered DOM (minus scripts and styles) to Downloads:

```js
(() => {
  const doc = document.documentElement.cloneNode(true);
  doc.querySelectorAll('script, style, link[rel="stylesheet"], noscript').forEach(e => e.remove());
  doc.querySelectorAll('svg').forEach(s => s.replaceChildren());
  const html = '<!doctype html>\n<!-- captured from ' + location.href + ' -->\n' + doc.outerHTML;
  const name = (prompt('Fixture name', 'start') || 'page') + '.html';
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
  a.download = name;
  a.click();
})();
```

Replace personal data with placeholders before committing it.
