# Verification and limits

Preparation evidence dated 29 October 2026. These checks use fictional records; they do not establish physical-device acceptance or certify security, legal compliance or licences.

- Clean `npm ci --no-audit --no-fund` installation succeeded with the pinned lockfile. An earlier offline-only install failed because the local package cache was incomplete; offline installation requires a complete cache.
- Clean-install `npm run test:all`: passed; 285 unit tests across 41 suites and 188 browser tests across 36 specification files.
- Focused Chrome startup, save/removal, offline return, restore, Settings/navigation/search, privacy and printing checks: 23 passed.
- Guarded disposable PostgreSQL 17.11: 35 checks passed across all six retained integration files, including secure account/browser journeys. No live database or AI was used.
- All 1,413 active pictograms match their recorded SHA-256; retained pictures and app icons were visually reviewed and PNG metadata checked. Required notices remain. This does not amount to a legal certification.
- Three representative booklets generated and inspected: landscape letter sheet geometry, no out-of-bounds extracted text, wrapped complete phrases and representative imposed/dense pages visually checked. Helvetica 9 pt body confirmed. Physical printing was not tested.
- README fictional demo startup/sign-in and visible preparation/printing actions were checked in Chrome at phone width.

The checks use installed Chrome through PLAYWRIGHT_CHANNEL=chrome. Matching Playwright Chromium is another supported option but was not installed for this review. Physical iPhone/Safari edge-swipe behaviour, real-device cold/offline recovery, physical printing, arbitrary fork hosting, provider retention and paid AI output quality are not established by these tests. No uptime, data-recovery or security guarantee follows from passing tests.

Local signature/pattern scanning, complete file inventory review and independent manual privacy/dependency reviews supplement the tests. Scanning cannot prove absence of every possible secret. No source was sent to an external scanning service.