# My Words

My Words helps adults with word-finding difficulties recognise, point to and show useful words, pictures and messages. It includes communication books, saved notebooks, Notes, People, shopping, offline working copies and compact booklet printing. Word-finding difficulty does not imply impaired understanding.

This software is in development. Gillian Kerr maintains the original hosted service as a small volunteer beta provided without charge. Expansion beyond beta is not planned. Others may inspect, reuse and maintain the code and operate their own versions under the applicable licences. Each operator is responsible for their hosting, credentials, data handling and user support. No uptime, support, security or legal-compliance guarantee is offered for forks.

## Run a fictional local demonstration

Install Node.js 24 and npm. In this directory:

```powershell
npm ci
npm start
```

Open http://127.0.0.1:3162. In Settings, sign in as `owner` with password `owner-fictional-only`. All demonstration content is invented. The server binds only to loopback, uses memory, and never reads a database URL or configures paid AI. Server memory resets when stopped; this browser can retain local copies. Use a separate browser profile for experimentation. Never expose this test harness on a network or use it for real communication records.

Create a note in Settings → Prepare or change content, save it, and reopen it from Home. Prepare offline files before disconnecting; retain the server process for online sync. Saved device content uses IndexedDB and drafts/outbox locally before network sync. Account/workspace checks protect ownership. Browser storage can be removed by the browser or someone controlling the device.

## Checks

```powershell
npm test
npm run test:frontend -- startup.spec.js local-copy-removal.spec.js shared-restore.spec.js settings.spec.js notebook-print.spec.js privacy.spec.js
```

Browser checks require the matching Playwright Chromium: `npx playwright install chromium` is a separate optional download. If Chrome is already installed, PowerShell users can set `$env:PLAYWRIGHT_CHANNEL = 'chrome'` before running browser checks. `npm run test:all` runs unit and all retained frontend tests, without a live database or paid AI.

See [DEVELOPMENT.md](DEVELOPMENT.md) for guarded optional PostgreSQL checks, server assembly and project layout.

## Offline copies, backup and printing

Finish initial offline preparation while online. Signing out retains device copies; it cannot remotely erase another device. Download a backup in Settings before clearing browser storage. Restore validates the whole envelope and requires confirmation; keep unsynced edits and recovery copies. Exported JSON and PDFs are not password-protected. Deleted or archived screen items can remain in revision history, exports, other devices or provider backups. There is no blanket erasure guarantee or self-service account-erasure workflow.

Settings prints the Communication book and saved situation notebooks as booklets. Print on landscape letter sheets, duplex, flipping on the short edge, at actual size. Logical pages are padded to a multiple of four and imposed in booklet order. The compact design uses Helvetica, 9 pt body/vocabulary, wrapped phrases and contents references. Check the preview and a sample sheet before printing a whole booklet. Keep an exported backup and another way to communicate.

## AI is optional

The local demo does not call AI. An operator can explicitly inject a configured OpenAI-compatible client into the generation services; the provided server assembly uses OpenRouter only if the operator supplies their own `OPENROUTER_API_KEY`. Requests can incur charges and disclose entered topics, clues and lookup details to outside providers. Review generated content; never put keys in source or issue reports.

## Licences and reporting problems

Original code: [MIT](LICENSE), Copyright (c) 2026 Gillian Kerr. User-created content is not licensed by this code licence. Included ARASAAC artwork is separately CC BY-NC-SA 4.0, including noncommercial and ShareAlike restrictions. MIT code permissions do not remove artwork restrictions. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

Report reproducible software problems in this repository using fictional examples. Do not attach personal communication, health information, real backups, passwords or recovery links. The public project contact is mywordssupport@gmail.com; an independently hosted copy’s accounts belong to its operator.
