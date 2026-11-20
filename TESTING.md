# Testing

## Running the tests

```bash
npm test
```

That's the whole setup — there is nothing to install (zero dependencies; `package.json` only defines the `test` script). Without npm:

```bash
node --test
```

Node's runner discovers every `*.test.js` file by itself, so no path or glob is passed (an explicit `"tests/**/*.test.js"` argument behaves differently across Node versions). `npm run test:watch` re-runs on changes. **Requires Node 18+** (built-in `node:test` and `node:assert/strict`; nothing here ships to the browser).

Current result: **845 tests, 0 failures** (Node 22; Node 18 and 20 are what CI runs but were not run during development).

## What the suite is

The tests import the app's real modules and drive the **real terminal** (`runCommand`) and the **real engines** through a tiny DOM shim (`tests/helpers/dom-shim.js`, `ui-harness.js`). So they prove logic, permission/state rules, wiring and structure. They do **not** render pixels, so layout/colour problems cannot be caught here — see *Real-browser check* below.

## What's covered

| File | Covers | Tests |
|---|---|---|
| `engine/permissions.test.js` | octal / symbolic / triad conversion, special bits, validation | 66 |
| `engine/acl.test.js` | ACL mask / effective-permission maths | 16 |
| `engine/fs-model.test.js` | tree lookup and resolution against the real `FS_TREE` | 14 |
| `engine/symlinks.test.js` | chmod/chown/chgrp follow-the-target semantics, dangling links | 9 |
| `engine/users.test.js` | access classes, traversal, sticky bit, chown/chgrp rules, umask | 25 |
| `engine/sysinfo.test.js` | process/service/socket/disk data integrity, journal filters, lastlog | 15 |
| `engine/shell-parse.test.js` | quoting, escapes, tokenizer edge cases | 14 |
| `engine/safe-html.test.js` | HTML escaping and sanitising of terminal output | 7 |
| `engine/complete.test.js` | tab completion | 10 |
| `engine/scenario.test.js` | scenario engine: loading, checks, hints, cleanup (uses the four challenge fixtures) | 31 |
| `engine/scenario-validators.test.js` | the access-check helpers on the fixtures and on every shipped investigation | 42 |
| `engine/investigation.test.js` | phases, evidence gating, diagnosis, state-based remediation, verification (inv01) | 43 |
| **`engine/text-filters.test.js`** *(new)* | pipe splitting, operator refusal, `htmlToText`, grep/head/tail/wc/sort/uniq logic | 14 |
| **`engine/quiz-select.test.js`** *(new)* | balanced mixed rounds (1–2 per section), single-section rounds, no mutation | 7 |
| `regression/terminal.test.js` | prompt, su/sudo, enforcement, history, hostile input | 46 |
| `regression/terminal-safety.test.js`, `terminal-help-flag`, `terminal-completion`, `terminal-commands-data` | safety of output, `--help`, completion, command reference | 32 |
| `regression/sysinvestigation.test.js` | ps / who / last / ss / systemctl / journalctl / dmesg / getcap / crontab gating | 45 |
| `regression/audit-2.13.test.js` | permission-engine audit against real Linux kernel behaviour (inherited) | 75 |
| `regression/scenarios.test.js` | invariants, known solutions and shortcuts on the fixtures, observer hook, cleanup | 53 |
| `regression/scenarios-ui.test.js`, `sc01.test.js`, `sc01-ui.test.js` | investigation panel DOM safety, structure, controller flows; the `sc01` scenario | 100 |
| **`regression/security-lab-terminal.test.js`** *(new)* | file contents + permissions, grep/head/tail/wc, pipelines, `ip`/`hostname`/`ping`, `ss` flags, `systemctl` state changes, `usermod`/`gpasswd`/`passwd`, `lastb`, reset | 35 |
| **`regression/security-investigations.test.js`** *(new)* | `inv02`/`inv03`/`inv04`: correct path, wrong diagnoses, lazy or harmful fixes, collateral damage, exact cleanup | 26 |
| **`regression/architecture-section.test.js`** *(new)* | `lscpu`/`free`/`lsblk`/`uptime` and their agreement with `df`/`who`/`ps`; `-h` as human-readable; diagram builders; guards on the historical facts; architecture quiz answers | 12 |
| **`regression/site-structure.test.js`** *(new)* | seven sections, removed features really gone, identity/metadata/footer, licence notices, no invented links, lessons' commands exist, quiz shape, no network APIs | 20 |
| `regression/i18n-parity.test.js`, `i18n-localize.test.js`, `scenarios-i18n.test.js` | EN/AR dictionary parity; every lesson, quiz question, investigation and command has an Arabic overlay that lines up with its source; structural checks on the new overlays | 27 |
| `regression/static-site.test.js`, `boot-fallback.test.js`, `dom-safety.test.js` | CSP, local references resolve, no eval/inline handlers, version consistency, the "needs a server" banner logic | 61 |

`tests/helpers/challenge-fixtures.js` holds the four single-objective challenge scenarios of the original project. They are **test fixtures only** (the feature was removed) and keep covering the scenario engine's access checks.

## Changes to inherited tests, and why

- Tests tied to **removed features** (Labs, the 88 Challenges, Progress/XP, achievements, the `release-2.13` consistency test, scenario progress persistence) were **deleted** together with those features. Their engine-level coverage survives through the fixtures.
- Assertions that depended on **names or formats** were updated: host name `permission-lab` → `security-lab`; `journalctl` now prints `sshd[598]:`-style lines like `auth.log`; `ss` prints a `Peer Address` column; `cat /etc/shadow` shows content (placeholder hashes) instead of a description; the first investigation step is *Incident*, not *Briefing*; the list shows section badges, not XP.
- `i18n-parity` / `scenarios-i18n` keep an (now empty) checked-in list of content that is still untranslated; it is verified in both directions, so a future untranslated addition has to be listed explicitly.
- Nothing was weakened to make a test pass; where a test changed, the new assertion checks the new, documented behaviour.

## Real-browser check (not part of `npm test`)

`tests/browser/smoke.playwright.cjs` is an optional end-to-end script (needs Playwright and a Chromium; the project does not depend on them). Usage is in the file header. It checks 16 things in a real browser: every view opens (the simulator and calculator from the File Permissions page, with that sidebar entry staying highlighted), the terminal is mounted in the File Permissions page, the home counters, terminal pipes / `ip route` / `ss -tn`, the single terminal moving into the Investigation view with its history, a complete `inv03` play-through (wrong diagnosis refused → correct diagnosis → stop + disable → verification → "Your fix is minimal"), state restored after leaving, the section-quiz button, the Arabic/RTL switch, no horizontal overflow at 390 px, and no uncaught page errors. It last ran green against Chromium during the development of v1.0.0; it is not run by CI.

## Not covered

- Pixel-level layout, colour contrast and font rendering (spot-checked by eye at 1280 px and 390 px only).
- Screen-reader behaviour beyond the structural/ARIA assertions inherited from the original suite.
- Safari and Firefox (only Chromium was used).
- The *quality* of the Arabic text: tests check structure (counts, order, script), not wording; a native-speaker review of the new Arabic is still advisable.
