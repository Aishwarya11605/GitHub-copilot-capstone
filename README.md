# Task list

A client-side task manager built with TypeScript, React, and Vite. Task data stays in the browser's local storage; the app does not use an account or server-side task store.

## Using the app

Run `npm ci`, then `npm run dev` and open the local URL printed by Vite. The app keeps task records under one browser storage key (`todo.tasks.v1`) and validates that data before using it.

You can create, edit, search, filter, complete, and delete tasks. Search matches case-insensitive substrings in titles and descriptions. Imports accept only the strict versioned JSON format exported by this app. Files larger than **5,000,000 bytes (decimal)** and files containing more than 10,000 tasks are rejected; an import must contain at least one task. A preview is read-only. Choosing **Replace** explicitly replaces the entire current list; Cancel or Escape does not write.

Browser local storage is not a backup or confidentiality guarantee. Data may become unavailable if the same browser storage is cleared or cannot be accessed. Export is a manual user-managed plaintext JSON download: it is not automatically stored, synced, or encrypted. The user must download and retain the file; starting a download does not prove that a copy was retained. Do not put secrets or sensitive information in task content or exported files.

If a task-data change in another tab is detected, this tab blocks writes and offers an explicit reload. Storage events are notifications, not locks: this behavior is not compare-and-swap and cannot protect against changes that have not yet been detected or changes in the non-atomic check/write interval. Invalid or inaccessible saved data is not silently treated as an empty saved list. A confirmed import is the explicit replacement path when the existing value is invalid. Failed operations are not retried automatically; a retry occurs only after the user explicitly requests it.

## Development

Requirements: Node.js 24.15 or later in the 24.x line and npm 11. Exact top-level package versions and transitive resolutions are recorded in `package-lock.json`.

```text
npm ci
npm run dev
npm run typecheck
npm test
npm run build
```

Tests currently use Vitest, jsdom, and Testing Library. Automated accessibility checks use axe-core. Unit/component tests do not establish real-browser compatibility, WCAG 2.2 AA conformance, or the required manual NVDA/Windows and VoiceOver/macOS results. The supported browser target remains the latest and immediately previous major release of Chrome, Edge, Firefox, and Safari; verify and record those actual releases at test time.

### Dependency review notes

Direct dependencies are pinned in `package.json`; package names, versions, licenses, peer requirements, and registry update metadata were reviewed against the configured npm registry on 2026-10-23. The direct-package metadata was:

| Package | Version | Reported license | Registry `time.modified` |
|---|---:|---|---|
| react | 19.3.1 | MIT | 2026-10-22 |
| react-dom | 19.3.1 | MIT | 2026-10-22 |
| vite | 8.3.5 | MIT | 2026-10-21 |
| @vitejs/plugin-react | 6.1.2 | MIT | 2026-10-05 |
| typescript | 7.0.2 | Apache-2.0 | 2026-10-23 |
| vitest | 5.0.5 | MIT | 2026-10-19 |
| @testing-library/react | 16.3.3 | MIT | 2026-08-27 |
| @testing-library/user-event | 14.6.8 | MIT | 2026-10-13 |
| @testing-library/jest-dom | 7.0.1 | MIT | 2026-08-09 |
| @types/react | 19.3.0 | MIT | 2026-10-04 |
| @types/react-dom | 19.3.0 | MIT | 2026-10-04 |
| @types/node | 24.10.0 | MIT | 2026-10-09 |
| jsdom | 30.1.3 | MIT | 2026-10-15 |
| axe-core | 4.14.0 | MPL-2.0 | 2026-10-21 |

The lockfile records resolved package URLs and integrity hashes, and the package tree was inspected for transitive footprint and peer compatibility. The 150 resolved package entries report 102 MIT, 2 MIT-0, 25 Apache-2.0, 13 MPL-2.0, 2 BSD-2-Clause, 1 BlueOak-1.0.0, 1 CC0-1.0, 2 ISC, and 2 BSD-3-Clause licenses; no installed entry lacked license metadata. `npm audit` reported zero known vulnerabilities at the time it was run; that is a point-in-time registry audit, not a guarantee of future safety or an independent maintainer/signature review. Re-run `npm audit` and review updates as part of future dependency changes.

## Limitations and deployment

This repository does not yet select a hosting provider or configure a hosted HTTPS/CSP/security-header policy. No hosted security result is claimed. Do not state that browser storage is durable or confidential, that export is automatically backed up, that multi-tab updates are race-free, or that performance/accessibility targets have been met without the specified evidence.
