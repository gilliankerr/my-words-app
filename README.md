# My Words

My Words helps adults with word-finding difficulties recognise, point to and show useful words, pictures and messages. It includes communication books, saved notebooks, Notes, People, shopping, offline working copies and compact booklet printing. Word-finding difficulty does not imply impaired understanding.

## Make it your own

Would you like something like this for a family member, or for someone your small nonprofit supports? You can use this app as a starting point and ask an AI tool such as ChatGPT or Claude to help you customise it. You do not need to understand all the code to begin. Starting with an existing app can make the work much quicker than building from scratch.

Tell your AI tool what the person would find useful: familiar words, important people, everyday situations and pictures. Ask it to read this repository and take you through making your own version, one step at a time. You can keep the first version simple and change it together as you learn what works.

### Start with this message

Copy this into your AI tool:

> I would like to adapt My Words for a family member or someone our small nonprofit supports. Please read https://github.com/gilliankerr/my-words-app and its DEVELOPMENT.md. Help me customise it and put a private, working version online using a service such as Railway. Explain things in plain language and guide me one step at a time. Start by asking what the person needs and showing me the simplest useful version. Help me set up sign-in, safe storage, backups and a monthly spending limit. Tell me which steps I need to do myself, and check that saving, offline use and restoring a backup work before we rely on it.

If your AI tool cannot open the link, give it a downloaded copy of the repository or use its GitHub connection. Start with invented names and examples while trying things out.

### Put your version online

A hosting service keeps your app running so you can open it on a phone, tablet or computer. [Railway](https://railway.com) is one option. Your AI helper can guide you through creating your own hosting account, setting up the app and its database, and getting a web address. You will own and look after this separate copy.

**For a small, lightly used family version, an initial hosting budget estimate is under US$10 per month.** This is an estimate, not a fixed price or a measured bill for your version. Railway currently has a US$5 monthly minimum on its Hobby plan, with charges based on usage. Ask your AI helper to check the [current pricing](https://railway.com/pricing), estimate the app and database together, and help you set spending controls. Canadian-dollar costs vary with the exchange rate and taxes. AI-tool subscriptions and optional in-app AI generation are separate costs.

The repository includes a demonstration you can try on your computer. Putting a private version online takes additional setup; your AI helper should read the [technical setup notes](DEVELOPMENT.md) rather than publish the demonstration server. Allow time to try it with the person who will use it, check it on their phone and arrange backups. Someone will also need to look after updates and account recovery.

### Make it useful day to day

- Choose words, pictures and messages with the person who will use them.
- Try recognising, pointing to and showing a message on their own phone.
- Prepare offline access while connected to the internet, then try it disconnected.
- Download a backup before making big changes, and practise restoring it with fictional content first.
- Print a communication booklet if a paper copy would help, and keep another way to communicate available.

Optional AI features can help prepare words and notebooks. Review what they produce, and remember that information submitted to these features goes to outside AI providers. Keep passwords and private health or contact information out of public questions and bug reports.

## About this project

Gillian Kerr maintains My Words as a small volunteer beta, provided free of charge. You are welcome to reuse and adapt the original code under the licences below. Your independently hosted version has its own costs and needs someone to manage access, updates, backups and support. The software is still in development; hosted copies do not come with a guarantee of uptime, security, support or legal compliance.

<details>
<summary>For your AI helper or a technical supporter: demo, checks and setup</summary>

### Run a fictional local demonstration

Install Node.js 24 and npm. In this directory:

```powershell
npm ci
npm start
```

Open http://127.0.0.1:3162. In Settings, sign in as `owner` with password `owner-fictional-only`. All demonstration content is invented. The server binds only to loopback, uses memory, and never reads a database URL or configures paid AI. Server memory resets when stopped; this browser can retain local copies. Use a separate browser profile for experimentation. Never expose this test harness on a network or use it for real communication records.

Create a note in Settings → Prepare or change content, save it, and reopen it from Home. Prepare offline files before disconnecting; retain the server process for online sync. Saved device content uses IndexedDB and drafts/outbox locally before network sync. Account/workspace checks protect ownership. Browser storage can be removed by the browser or someone controlling the device.

### Checks

```powershell
npm test
npm run test:frontend -- startup.spec.js local-copy-removal.spec.js shared-restore.spec.js settings.spec.js notebook-print.spec.js privacy.spec.js
```

Browser checks require the matching Playwright Chromium: `npx playwright install chromium` is a separate optional download. If Chrome is already installed, PowerShell users can set `$env:PLAYWRIGHT_CHANNEL = 'chrome'` before running browser checks. `npm run test:all` runs unit and all retained frontend tests, without a live database or paid AI.

See [DEVELOPMENT.md](DEVELOPMENT.md) for guarded optional PostgreSQL checks, server assembly and project layout.

</details>

## Offline copies, backup and printing

Finish initial offline preparation while online. Signing out retains device copies; it cannot remotely erase another device. Download a backup in Settings before clearing browser storage. Restore validates the whole envelope and requires confirmation; keep unsynced edits and recovery copies. Exported JSON and PDFs are not password-protected. Deleted or archived screen items can remain in revision history, exports, other devices or provider backups. There is no blanket erasure guarantee or self-service account-erasure workflow.

Settings prints the Communication book and saved situation notebooks as booklets. Print on landscape letter sheets, duplex, flipping on the short edge, at actual size. Logical pages are padded to a multiple of four and imposed in booklet order. The compact design uses Helvetica, 9 pt body/vocabulary, wrapped phrases and contents references. Check the preview and a sample sheet before printing a whole booklet. Keep an exported backup and another way to communicate.

## AI is optional

The local demo does not call AI. An operator can explicitly inject a configured OpenAI-compatible client into the generation services; the provided server assembly uses OpenRouter only if the operator supplies their own `OPENROUTER_API_KEY`. Requests can incur charges and disclose entered topics, clues and lookup details to outside providers. Review generated content; never put keys in source or issue reports.

## Licences and reporting problems

Original code: [MIT](LICENSE), Copyright (c) 2026 Gillian Kerr. User-created content is not licensed by this code licence. Included ARASAAC artwork is separately CC BY-NC-SA 4.0, including noncommercial and ShareAlike restrictions. MIT code permissions do not remove artwork restrictions. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

Report reproducible software problems in this repository using fictional examples. Do not attach personal communication, health information, real backups, passwords or recovery links. The public project contact is mywordssupport@gmail.com; an independently hosted copy’s accounts belong to its operator.
