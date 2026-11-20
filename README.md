# Linux Security Lab

**v1.0.0** — A hands-on, browser-only Linux security education platform: **Linux fundamentals, file permissions, users and groups, network security, log analysis, and guided security investigations**, built around a simulated terminal, a real permission engine and a quiz — all running locally in your browser.

No backend. No database. No login. No build step. Serve the folder with any static server and it runs (see [Installation](#installation) — browsers block ES modules on `file://`).

**Developed by Hussein Ammar** · GitHub: <https://github.com/husseinammr>

> Linux Security Lab is a modified derivative of **[Linux Permission Lab](https://github.com/0xfuz/linux-permission-lab)** (MIT). See [What is original and what was changed](#what-is-original-and-what-was-changed).

---

## The seven sections

| # | Section | What you learn | What you practise with |
|---|---|---|---|
| 01 | **Linux Fundamentals** | Filesystem hierarchy, navigation, file management, reading and modifying files, pipes, essential commands | Terminal: `ls`, `cd`, `cat`, `head`, `tail`, `grep`, `find`, `stat`, pipes … |
| 02 | **File Permissions** | rwx, `chmod`, `chown`, `chgrp`, `umask`, SUID, SGID, sticky bit, ACLs, visualisation and calculation | Permission Simulator, Calculator, Terminal (all original features) |
| 03 | **Users & Groups** | Accounts (`/etc/passwd`, `/etc/shadow`), groups and membership, ownership and access decisions, `su` vs `sudo`, privilege escalation, auditing and locking access | `id`, `groups`, `usermod -aG`, `gpasswd -d`, `passwd -S/-l/-u`, `sudo -l` |
| 04 | **Network Security** | Interfaces and IP addressing, routing basics and DNS, open ports and listening services, connections, essential commands, reducing exposure | `ip addr/link/route`, `hostname`, `ping`, `ss -tulpn`, `ss -tn`, `systemctl stop/disable` |
| 05 | **Log Analysis** | Where Linux keeps logs, authentication logs, failed logins, recognising suspicious activity, log inspection commands, protecting logs as evidence | `/var/log/auth.log`, `grep`/`head`/`tail`/`wc`/`sort`/`uniq`, `journalctl`, `last`, `lastb`, `dmesg` |
| 06 | **Security Investigation** | The workflow **Incident → Evidence → Diagnosis → Remediation → Verification** on realistic simulated data | 5 state-checked investigations across permissions, users, network and logs |
| 07 | **Linux Architecture & History** | The story of Linux (Unix, GNU, Linus Torvalds, distributions), kernel vs distribution, the layers from a command down to the hardware, what the kernel does, kernel space vs user space, boot, processes, "everything is a file", packages and updates — and how it explains the other sections | `lscpu`, `free -h`, `lsblk`, `df -h`, `uptime`, `ps aux`, `dmesg`, `systemctl list-units` |

Supporting features: lessons (59, each with a diagram, an example, practical commands, tips and warnings), the **simulated terminal**, a **quiz** (175 questions, filterable by section) and a cheat sheet.

## Features

- **Lessons per section** — searchable, expandable cards with an SVG diagram, an example, commands to try, tips and warnings.
- **Permission Simulator and Calculator** — toggle owner/group/others like LED switches; symbolic, octal, binary and the `chmod` command update live; convert octal ↔ symbolic including SUID/SGID/sticky.
- **Terminal Simulator** — a simulated shell with **63 commands** over a fake filesystem, with real permission enforcement (traversal, ACLs, special bits, symlinks, root vs. others). It **never executes anything on your machine**: every command is handled by JavaScript in this repository.
  - Files: `pwd`, `cd`, `ls`, `tree`, `stat`, `find`, `cat`, `touch`, `mkdir`, `cp`, `mv`, `rm`, `ln -s`, `nano`/`vim` (notice only)
  - Text and logs: `grep` (on files, `-i -v -c -n`), `head`, `tail`, `wc`, `sort`, `uniq`, and **single pipes** (`cmd1 | cmd2`)
  - Permissions: `chmod`, `chown`, `chgrp`, `umask`, `getfacl`, `setfacl`
  - Identity: `whoami`, `id`, `groups`, `su`, `sudo` (`-l`, `-u`, `-i`, `-s`), `usermod`, `gpasswd`, `passwd`
  - System and hardware: `ps`, `who`, `w`, `last`, `lastb`, `lastlog`, `uname`, `df`, `du`, `lscpu`, `free`, `lsblk`, `uptime`, `systemctl` (status / list-units; stop, start, restart, enable, disable as root), `journalctl`, `dmesg`, `getcap`, `crontab`
  - Network (simulated; no packet is ever sent): `ip addr/link/route`, `hostname`, `ping`, `ss` / `netstat`
  - Real log and account content: `/etc/passwd`, `/etc/group`, `/etc/shadow` (placeholder hashes), `/var/log/auth.log`, `/var/log/syslog`
  - Not simulated (the terminal says so): output redirection (`>`, `>>`), command chaining (`;`, `&&`, `||`), `tail -f`, editing file contents, firewall tools, real name resolution.
- **Security Investigations** — five scenarios judged by the **simulated state**, not by which command you typed:

  | Id | Section | Incident | Fix is verified by |
  |---|---|---|---|
  | `inv01` | Permissions | The site returns 403 after a deploy | `www-data` can read the page, secrets stay private |
  | `sc01` | Permissions | An application config is readable by the wrong accounts | authorised accounts read it, others are refused |
  | `inv02` | Users & Groups | A service account can use `sudo` | `monitoring` has no sudo; `user` and `alice` keep theirs |
  | `inv03` | Network Security | A cache listens on `0.0.0.0:6379` | no wildcard listener on 6379, service disabled, other listeners intact |
  | `inv04` | Log Analysis | Failed SSH logins, then a success | `deployer` is locked, the log is untouched, others unaffected |

  Each one gates the diagnosis behind collected evidence, explains every wrong diagnosis from the live state, detects collateral damage, and ends with a verification step and an incident report. Anything the learner changes (groups, locked accounts, services, sockets, files) is restored when the investigation is left or reset.
- **Quiz** — 175 multiple-choice questions with explanations, grouped by the seven sections; the mixed round takes 1–2 questions from each section.
- **English / Arabic** UI with RTL layout, light/dark themes, keyboard shortcuts (`1`–`7` the sections, `8` terminal, `9` quiz, `0` cheat sheet), responsive layout for phone and desktop. The Permission Simulator and Calculator are tools of the File Permissions section (reached from its page; the terminal is also mounted there), and a mixed quiz round draws evenly from all seven sections.
- **Privacy** — a strict Content-Security-Policy (`script-src 'self'`, `connect-src 'none'`), no cookies, no analytics, no network requests from the app. The only things stored locally (browser `localStorage`, key `lsl_state_v1`) are your theme, language and quiz statistics.

---

## What is original and what was changed

Linux Security Lab is built on **Linux Permission Lab** (MIT, © Linux Permission Lab Contributors, <https://github.com/0xfuz/linux-permission-lab>, v2.13.0). It is **not** entirely original work, and this section keeps that clear.

**Inherited from Linux Permission Lab (kept, with small adaptations):**
- The visual design, layout, CSS and the home / simulator / calculator / terminal / quiz / cheat-sheet interface.
- The permission engine (`converter.js`, `engine/users.js`, `engine/acl.js`, `engine/fs-model.js`, `engine/links.js`), the fake filesystem and the access checks.
- The simulated terminal and its command set (navigation, permissions, ACLs, identity/sudo, process/service/socket/journal commands), tab completion, `--help`.
- The scenario and investigation engines (`engine/scenario.js`, `engine/investigation.js`), the two investigations `inv01` and `sc01`, the 113 original quiz questions, the 19 permission lessons, the 2 privilege lessons (su vs sudo, escalation) and the English/Arabic infrastructure with the existing Arabic translations.
- Most of the original automated tests (adapted where the structure changed).

**Added or changed by Hussein Ammar for Linux Security Lab:**
- The **seven-section structure**, navigation, home page, per-section pages and the Investigation page (the terminal is mounted into whichever view is showing).
- **38 new lessons** (fundamentals, users, network, logs, investigation method, and the 12 of Linux Architecture & History) and **62 new quiz questions**, each question tagged with a section. The architecture history was checked against several published histories; where they differ on an exact date the lesson says so.
- **New terminal capabilities**: file contents for logs and account files, `grep` on files, `head`, `tail`, `wc`, `sort`, `uniq`, single pipes (with stderr-style routing of errors), `ip`, `hostname`, `ping`, `ss` flags and connections, `usermod`, `gpasswd`, `passwd`, `lastb`, `lscpu`, `free`, `lsblk`, `uptime`, and state-changing `systemctl stop/start/restart/enable/disable`; a snapshot/restore layer for that state.
- **Three new investigations** (`inv02`, `inv03`, `inv04`) and a section tag on every investigation.
- Rebranding: name, title, metadata, footer, About, README, package metadata, storage key.
- **Tests**: 4 new test files (terminal features, pipes/filters, the three investigations, site structure/identity) plus the adaptation of the existing ones (see [TESTING.md](TESTING.md)).

**Removed from Linux Permission Lab:** the Interactive Labs, the 88 octal Security Challenges (and the four single-objective "hands-on" challenge scenarios, kept only as test fixtures in `tests/helpers/challenge-fixtures.js`), the Progress dashboard, XP and levels, achievements/badges and the completion certificate, the "topic read" tracking, and the separate *Process* and *Service* sections (their commands remain in the terminal).

The MIT licence and **both** copyright notices are in [LICENSE](LICENSE).

---

## Installation

Linux Security Lab is plain static files: `index.html`, `assets/`. Browsers block ES modules loaded from `file://`, so serve the folder:

```bash
git clone https://github.com/husseinammr/linux-security-lab.git
cd linux-security-lab
python3 -m http.server 8000        # or:  npx serve .   /   any static server
# open http://localhost:8000
```

Fonts (Space Grotesk, Inter, JetBrains Mono, Cairo) load from Google Fonts when online; the app falls back to system fonts offline.

Requirements: a current Chromium, Firefox or Safari. Node.js **18+** is needed only to run the tests.

## Tests

```bash
npm test          # = node --test ; no dependencies to install
```

Details, what each file covers and what is *not* covered: [TESTING.md](TESTING.md). The suite runs the real terminal and engines through a small DOM shim; it proves logic, wiring and structure. It does not prove pixel-level layout — that was checked separately in a real browser (see TESTING.md).

## Deploying to GitHub Pages

The app is static and needs no backend, so GitHub Pages works as is.

**Option A — from a branch (simplest).** Repository → *Settings → Pages → Build and deployment → Deploy from a branch*, branch `main`, folder `/ (root)`. The site is served at `https://<user>.github.io/<repository>/`. All paths in the app are relative, so a sub-path is fine.

**Option B — GitHub Actions (test-gated).** `.github/workflows/deploy.yml` runs `npm test`, then publishes only `index.html`, `LICENSE` and `assets/` (not `tests/`). Set *Settings → Pages → Source* to **GitHub Actions**. `.github/workflows/ci.yml` runs the tests on Node 18, 20 and 22 for pull requests.

## Project structure

```
index.html                 one page: sidebar, seven section views + tools, CSP, metadata
assets/css/                design tokens, layout, components, cards, terminal, scenarios, responsive, RTL
assets/js/
  app.js                   routing, lazy view initialisation, terminal mounting, home counters
  learn.js  learn-data.js  learn-data-security.js  learn-diagrams.js   lessons by section
  quiz.js   quiz-data.js                                               quiz (section tabs)
  scenarios.js scenarios-data.js scenarios-data-security.js            investigation UI and data
  terminal*.js             the simulated shell (nav, perm, identity, sysinfo, text, net handlers)
  i18n.js, *.ar.js         English/Arabic dictionary and content overlays
  engine/                  pure logic: users/ACL/fs-model, shell-parse, sysinfo, filecontent,
                           sysstate (snapshot/restore), scenario + investigation engines
tests/engine, tests/regression, tests/helpers
```

## Known limitations

- **Arabic**: the whole UI and all content are translated, including the new lessons, quiz questions and investigations. Terminal output, commands, paths and the live evidence/finding lines of the investigations stay in English on purpose (they quote real command output and must be typed as written). In right-to-left text a long path such as `/srv/lab/inv04/logs/auth.log` can look visually reordered; the text itself is correct.
- The terminal is a teaching simulator, not a shell: a fixed set of commands, a fixed fake machine, no redirection or chaining, `ping` answers only for the lab's own addresses, and `nano`/`vim` do not edit contents.
- Three real-Linux tools appear in the original permission lessons but are not simulated: `chattr`, `lsattr`, `visudo`.

## Contributing

Issues and pull requests are welcome. Run `npm test` first. Keep the project dependency-free and the terminal simulated (it must never execute real commands).

## License

MIT — see [LICENSE](LICENSE). Copyright (c) 2026 Linux Permission Lab Contributors; modifications Copyright (c) 2026 Hussein Ammar.
