/**
 * tests/regression/site-structure.test.js  (Linux Security Lab)
 * What ships: the six sections exist, the removed features are really gone, the identity (title, metadata, footer,
 * README, package.json) is Linux Security Lab / Hussein Ammar, the original MIT notice is preserved, every lesson's
 * commands are real simulator commands, and the home-page counters are computed rather than typed.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { installLocalStorageShim } from "../helpers/storage-shim.js";
import { installDomShim } from "../helpers/dom-shim.js";

installDomShim();
installLocalStorageShim();
const root = new URL("../../", import.meta.url);
const read = (p) => readFileSync(new URL(p, root), "utf8");
const html = read("index.html");
const SECTIONS = ["fundamentals", "permissions", "users", "network", "logs", "investigation", "architecture"];

describe("the seven sections", () => {
  test("each has a view, a sidebar entry and a home card, in order", () => {
    const nav = [...html.matchAll(/<button class="nav-item" data-view="([a-z]+)"/g)].map((m) => m[1]);
    assert.deepEqual(nav.filter((v) => SECTIONS.includes(v)), SECTIONS);
    for (const s of SECTIONS) {
      assert.ok(html.includes(`id="view-${s}"`), `view-${s}`);
      assert.ok(html.includes(`data-goto="${s}"`), `home card for ${s}`);
    }
    assert.deepEqual(nav, ["home", ...SECTIONS, "terminal", "quiz", "cheatsheet", "about"], "the simulator and calculator are tools of File Permissions, not sidebar entries");
    const permView = html.slice(html.indexOf('id="view-permissions"'), html.indexOf('id="view-users"'));
    for (const goto of ["simulator", "calculator", "terminal"]) assert.ok(permView.includes(`data-goto="${goto}"`), `File Permissions page links to the ${goto}`);
    assert.ok(permView.includes('id="terminal-slot-permissions"'), "File Permissions page hosts the terminal");
    assert.ok(html.includes('id="view-simulator"') && html.includes('id="view-calculator"'), "the tool views still exist");
  });
  test("the lesson sections have search, expand/collapse and a lesson list; investigation has the terminal slot and scenario panel", () => {
    for (const s of [...SECTIONS.slice(0, 5), "architecture"]) for (const id of [`learn-list-${s}`, `learn-search-${s}`, `learn-expand-${s}`, `learn-collapse-${s}`]) assert.ok(html.includes(`id="${id}"`), id);
    assert.ok(html.includes('id="terminal-slot-investigation"') && html.includes('id="terminal-slot-terminal"') && html.includes('id="scenario-mount"'));
    assert.equal((html.match(/id="terminal-window"/g) || []).length, 1, "exactly one real terminal");
  });
  test("every lesson belongs to a section and every section has lessons (>= 3 outside the permission section)", async () => {
    const { LEARN_TOPICS, topicsForSection } = await import("../../assets/js/learn.js");
    assert.ok(LEARN_TOPICS.every((t) => SECTIONS.includes(t.section)));
    assert.equal(new Set(LEARN_TOPICS.map((t) => t.id)).size, LEARN_TOPICS.length, "unique ids");
    for (const s of SECTIONS) assert.ok(topicsForSection(s).length >= 3, s);
    assert.equal(topicsForSection("permissions").length, 19, "the original permission lessons are all kept");
    assert.equal(topicsForSection("architecture").length, 12, "the architecture section has its 12 lessons");
  });
  test("every lesson has the full card content and an SVG diagram built only from static data", async () => {
    const { LEARN_TOPICS } = await import("../../assets/js/learn.js");
    for (const t of LEARN_TOPICS) {
      assert.ok(t.title && t.description.length > 60 && t.example && t.commands.length >= 1 && t.tips.length >= 1 && t.warnings.length >= 1, t.id);
      const svg = t.diagram();
      assert.match(svg, /^<svg[\s\S]*<\/svg>$/, t.id);
      assert.doesNotMatch(svg, /<script|onerror|javascript:/i, t.id);
    }
  });
  test("every command in the NEW lessons is a command the simulator really has; the original permission lessons may also show real-only tools", async () => {
    const { SECURITY_TOPICS } = await import("../../assets/js/learn-data-security.js");
    const { ARCHITECTURE_TOPICS } = await import("../../assets/js/learn-data-architecture.js");
    const { PERMISSION_TOPICS } = await import("../../assets/js/learn-data.js");
    const { COMMAND_NAMES } = await import("../../assets/js/terminal.js");
    const known = new Set(COMMAND_NAMES);
    const firstWord = (cmd) => { const w = cmd.replace(/^sudo\s+(-\w+\s+\w+\s+)?/, "").split(/\s+/)[0]; return w.startsWith("-") ? "sudo" : w; };
    const bad = [];
    for (const t of [...SECURITY_TOPICS, ...ARCHITECTURE_TOPICS]) for (const cmd of t.commands) if (!known.has(firstWord(cmd))) bad.push(`${t.id}: ${cmd}`);
    assert.deepEqual(bad, [], "new lessons must only list simulated commands");
    // Real-Linux tools the original lessons teach that this simulator does not implement (documented, not hidden):
    const REAL_ONLY = new Set(["chattr", "lsattr", "visudo"]);
    const orig = PERMISSION_TOPICS.flatMap((t) => t.commands.map((c) => firstWord(c))).filter((w) => !known.has(w));
    assert.deepEqual([...new Set(orig)].filter((w) => !REAL_ONLY.has(w)), []);
  });
  test("every quiz question belongs to a section and each section has questions", async () => {
    const { QUIZ_QUESTIONS } = await import("../../assets/js/quiz-data.js");
    for (const q of QUIZ_QUESTIONS) {
      assert.ok(SECTIONS.includes(q.section), `q${q.id}`);
      assert.ok(q.options.length === 4 && q.answer >= 0 && q.answer < 4 && q.explanation, `q${q.id} shape`);
      assert.equal(new Set(q.options).size, 4, `q${q.id} options are distinct`);
    }
    for (const s of SECTIONS) assert.ok(QUIZ_QUESTIONS.filter((q) => q.section === s).length >= 8, s);
    assert.equal(new Set(QUIZ_QUESTIONS.map((q) => q.id)).size, QUIZ_QUESTIONS.length);
  });
  test("the home counters are filled from data, not typed into the HTML", () => {
    assert.match(html, /data-stat="lessons"><\/strong>/);
    assert.match(html, /data-stat="quiz"><\/strong>/);
    assert.match(html, /data-stat="investigations"><\/strong>/);
  });
});

describe("removed features are gone", () => {
  test("no Labs, Challenges, Progress, XP, achievements or certificate in the page or the app code", () => {
    for (const view of ["labs", "challenges", "progress"]) {
      assert.ok(!html.includes(`id="view-${view}"`) && !html.includes(`data-view="${view}"`), view);
    }
    assert.doesNotMatch(html, /xp-widget|achievement|certificate|id="modal/i);
    const files = readdirSync(new URL("assets/js/", root)).filter((n) => n.endsWith(".js"));
    for (const gone of ["labs.js", "challenges.js", "progress.js", "achievements.js", "scenario-progress.js", "labs-data.js", "challenges-data.js"]) assert.ok(!files.includes(gone), gone);
    for (const f of files) {
      const src = read(`assets/js/${f}`);
      assert.doesNotMatch(src, /from "\.\/(labs|challenges|progress|achievements|scenario-progress)/, `${f} imports a removed module`);
    }
  });
  test("process and service security are not separate sections, but their commands stay in the terminal", async () => {
    assert.ok(!/data-view="(process|service)/.test(html));
    const { COMMAND_NAMES } = await import("../../assets/js/terminal.js");
    for (const c of ["ps", "systemctl", "journalctl", "ss"]) assert.ok(COMMAND_NAMES.includes(c), c);
  });
  test("the original features that must survive are all still present", async () => {
    for (const id of ["view-simulator", "view-calculator", "view-terminal", "view-quiz", "view-cheatsheet"]) assert.ok(html.includes(`id="${id}"`), id);
    const { COMMAND_NAMES } = await import("../../assets/js/terminal.js");
    for (const c of ["chmod", "chown", "chgrp", "umask", "getfacl", "setfacl", "su", "sudo", "find", "stat", "getcap"]) assert.ok(COMMAND_NAMES.includes(c), c);
  });
  test("nothing in storage is keyed to the old project, and no progress/XP is persisted", () => {
    for (const f of readdirSync(new URL("assets/js/", root)).filter((n) => n.endsWith(".js"))) {
      const src = read(`assets/js/${f}`);
      assert.doesNotMatch(src, /lpl_state|lpl:|lpl-progress/, f);
      assert.doesNotMatch(src, /challengeProgress|labProgress|scenarioProgress|achievements/, f);
    }
  });
});

describe("identity and licence", () => {
  test("title, metadata and footer say Linux Security Lab by Hussein Ammar", () => {
    assert.match(html, /<title>Linux Security Lab/);
    assert.match(html, /<meta name="author" content="Hussein Ammar"/);
    assert.match(html, /<meta property="og:title" content="Linux Security Lab"/);
    assert.match(html, /<meta name="description" content="Linux Security Lab/);
    assert.match(html, /<p><span data-i18n="credit\.developedBy">Developed by<\/span> <strong>Hussein Ammar<\/strong><\/p>\s*<p>GitHub: /);
    assert.match(html, /GitHub: <a href="https:\/\/github\.com\/husseinammr"[^>]*>https:\/\/github\.com\/husseinammr<\/a>/);
  });
  test("no invented social accounts or contact details; the only external identities are the developer's GitHub, the (assumed) repository, and the upstream credit", () => {
    const hrefs = [...html.matchAll(/href="(https?:\/\/[^"]+)"/g)].map((m) => m[1]).filter((u) => !/fonts\.(googleapis|gstatic)/.test(u));
    const allowed = ["https://github.com/husseinammr", "https://github.com/husseinammr/linux-security-lab", "https://github.com/0xfuz/linux-permission-lab"];
    assert.deepEqual([...new Set(hrefs)].sort(), allowed.sort());
    assert.doesNotMatch(html, /mailto:|twitter\.com|x\.com|instagram|linkedin|t\.me|telegram/i);
  });
  test("the old project's name does not appear except as attribution", () => {
    const withoutAttribution = html.replace(/0xfuz\/linux-permission-lab/g, "").replace(/Linux Permission Lab/g, "");
    assert.doesNotMatch(withoutAttribution, /permission-lab/i);
    for (const f of ["package.json", "README.md"]) assert.doesNotMatch(read(f).replace(/Linux Permission Lab|linux-permission-lab/g, ""), /permission.lab/i, f);
  });
  test("package.json is the new project", () => {
    const pkg = JSON.parse(read("package.json"));
    assert.equal(pkg.name, "linux-security-lab");
    assert.equal(pkg.author, "Hussein Ammar");
    assert.equal(pkg.license, "MIT");
    assert.deepEqual(pkg.dependencies, {});
  });
  test("LICENSE is MIT and keeps the original copyright notice next to the new one", () => {
    const lic = read("LICENSE");
    assert.match(lic, /^MIT License/);
    assert.match(lic, /Copyright \(c\) 2026 Linux Permission Lab Contributors/);
    assert.match(lic, /Copyright \(c\) 2026 Hussein Ammar/);
    assert.match(lic, /Permission is hereby granted, free of charge/);
  });
  test("README states what is original and what was modified, and names the licence", () => {
    const r = read("README.md");
    assert.match(r, /Linux Permission Lab/);
    assert.match(r, /derived|derivative/i);
    assert.match(r, /MIT/);
    assert.match(r, /What is original/i);
    assert.match(r, /Hussein Ammar/);
  });
  test("the deploy workflow publishes only the site files and runs the tests first", () => {
    const wf = read(".github/workflows/deploy.yml");
    assert.match(wf, /npm test/);
    assert.match(wf, /cp index\.html LICENSE _site\//);
    assert.doesNotMatch(wf, /0xfuz|permission-lab/i);
  });
});

describe("no external requests and no real command execution", () => {
  test("app code never uses fetch, XHR, WebSocket, eval, child_process or storage of anything but theme/locale/quiz stats", () => {
    for (const f of readdirSync(new URL("assets/js/", root)).filter((n) => n.endsWith(".js"))) {
      const src = read(`assets/js/${f}`);
      assert.doesNotMatch(src, /\bfetch\s*\(|XMLHttpRequest|WebSocket|child_process|\beval\s*\(|new Function\s*\(|navigator\.sendBeacon/, f);
    }
  });
  test("every localStorage key is the single lsl_state_v1 object", () => {
    const keys = new Set();
    for (const f of readdirSync(new URL("assets/js/", root)).filter((n) => n.endsWith(".js"))) {
      for (const m of read(`assets/js/${f}`).matchAll(/(?:getItem|setItem|removeItem)\(\s*["'`]([^"'`]+)["'`]/g)) keys.add(m[1]);
    }
    assert.ok([...keys].every((k) => k === "lsl_state_v1" || /lsl_/.test(k)), [...keys].join(","));
  });
});
