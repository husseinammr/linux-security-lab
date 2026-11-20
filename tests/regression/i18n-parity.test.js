/**
 * tests/regression/i18n-parity.test.js
 * The README promises a full Arabic translation. This keeps that promise
 * honest: a new English string or content item without an Arabic counterpart
 * (or an Arabic overlay whose shape no longer matches its source) fails CI
 * instead of silently falling back to English in the UI.
 *
 * Linux Security Lab: all content, including the new lessons, quiz questions and investigations, is translated.
 * PENDING_ARABIC below is the (empty) explicit list of anything that is allowed to lack an Arabic overlay; it is
 * checked in both directions, so a future untranslated addition must be listed here on purpose.
 *
 * Runs in the default (English) locale — it only reads data, never renders.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { installLocalStorageShim } from "../helpers/storage-shim.js";

installLocalStorageShim();
const R = "../../assets/js/";
const { DICT } = await import(R + "i18n.js");
const { INVESTIGATIONS } = await import(R + "scenarios-data.js");
const { SCENARIOS_AR } = await import(R + "scenarios-data.ar.js");
const { SECURITY_TOPICS } = await import(R + "learn-data-security.js");
const { SECURITY_TOPICS_AR } = await import(R + "learn-data-security.ar.js");
const { ARCHITECTURE_TOPICS } = await import(R + "learn-data-architecture.js");
const { ARCHITECTURE_TOPICS_AR } = await import(R + "learn-data-architecture.ar.js");
const { QUIZ_QUESTIONS } = await import(R + "quiz-data.js");
const { QUIZ_QUESTIONS_AR } = await import(R + "quiz-data.ar.js");
const { LEARN_TOPICS } = await import(R + "learn.js");
const { LEARN_TOPICS_AR: PERMISSION_TOPICS_AR } = await import(R + "learn.ar.js");
const LEARN_TOPICS_AR = { ...PERMISSION_TOPICS_AR, ...SECURITY_TOPICS_AR, ...ARCHITECTURE_TOPICS_AR };
const { CHEATSHEET_ROWS } = await import(R + "converter.js");
const { CHEATSHEET_ROWS_AR } = await import(R + "cheatsheet-data.ar.js");
const { TERMINAL_COMMANDS } = await import(R + "terminal-commands-data.js");
const { TERMINAL_COMMANDS_AR } = await import(R + "terminal-commands-data.ar.js");

const ids = (items) => items.map((x) => String(x.id));

/** Content authored for Linux Security Lab whose Arabic overlay is still to do. */
const PENDING_ARABIC = {
};

describe("UI dictionary (DICT)", () => {
  test("en and ar define exactly the same keys", () => {
    const en = Object.keys(DICT.en);
    const ar = Object.keys(DICT.ar);
    assert.deepEqual(en.filter((k) => !(k in DICT.ar)), [], "keys missing from ar");
    assert.deepEqual(ar.filter((k) => !(k in DICT.en)), [], "keys only in ar");
  });
  test("no translation is empty", () => {
    for (const lang of ["en", "ar"]) {
      const empty = Object.entries(DICT[lang]).filter(([, v]) => !String(v).trim()).map(([k]) => k);
      assert.deepEqual(empty, [], `${lang} has empty strings`);
    }
  });
  test("every key referenced by t(...) or data-i18n* exists", () => {
    const dir = new URL(R, import.meta.url);
    const used = new Set();
    for (const f of readdirSync(dir).filter((n) => n.endsWith(".js"))) {
      const src = readFileSync(new URL(f, dir), "utf8");
      for (const m of src.matchAll(/\bt\(\s*["']([A-Za-z0-9_.]+)["']\s*\)/g)) used.add(m[1]);
    }
    const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
    for (const m of html.matchAll(/data-i18n[a-z-]*="([^"]+)"/g)) used.add(m[1]);
    assert.ok(used.size > 100, "scan found suspiciously few keys — has the call pattern changed?");
    assert.deepEqual([...used].filter((k) => !(k in DICT.en)), []);
  });
});

describe("content overlays (Arabic) match their English source", () => {
  const cases = [
    ["Learn topics", LEARN_TOPICS, LEARN_TOPICS_AR],
    ["Investigations", INVESTIGATIONS, SCENARIOS_AR],
    ["Quiz questions", QUIZ_QUESTIONS, QUIZ_QUESTIONS_AR],
    ["Cheat sheet octal rows", CHEATSHEET_ROWS, CHEATSHEET_ROWS_AR],
    ["Terminal commands reference", TERMINAL_COMMANDS, TERMINAL_COMMANDS_AR],
  ];
  for (const [label, base, overlay] of cases) {
    const pending = PENDING_ARABIC[label] || new Set();
    test(`${label}: every item has an Arabic entry (except the listed pending ones) and there are no orphans`, () => {
      const baseIds = ids(base);
      const overlayIds = Object.keys(overlay);
      assert.deepEqual(baseIds.filter((i) => !(i in overlay) && !pending.has(i)), [], "untranslated and not listed as pending");
      assert.deepEqual(overlayIds.filter((i) => !baseIds.includes(i)), [], "orphan overlay entries");
      assert.deepEqual([...pending].filter((i) => i in overlay), [], "translated now — remove it from PENDING_ARABIC");
      assert.deepEqual([...pending].filter((i) => !baseIds.includes(i)), [], "pending id no longer exists");
    });
  }

  test("Quiz: an Arabic question never changes the number of options (the answer index would break)", () => {
    const bad = QUIZ_QUESTIONS.filter((q) => {
      const a = QUIZ_QUESTIONS_AR[String(q.id)];
      return a?.options && a.options.length !== q.options.length;
    }).map((q) => q.id);
    assert.deepEqual(bad, []);
  });
});

describe("Linux Security Lab: the Arabic overlays of the new content are structurally sound", () => {
  const AR = /[\u0600-\u06FF]/;
  test("new lessons: same number of tips and warnings, real Arabic text, no invisible bidi control characters", () => {
    for (const t of [...SECURITY_TOPICS, ...ARCHITECTURE_TOPICS]) {
      const a = { ...SECURITY_TOPICS_AR, ...ARCHITECTURE_TOPICS_AR }[t.id];
      assert.equal(a.tips.length, t.tips.length, `${t.id} tips`);
      assert.equal(a.warnings.length, t.warnings.length, `${t.id} warnings`);
      for (const text of [a.title, a.description, ...a.tips, ...a.warnings]) assert.ok(AR.test(text), `${t.id}: ${text.slice(0, 30)}`);
      assert.doesNotMatch(JSON.stringify(a), /[\u200e\u200f\u202a-\u202e\u2066-\u2069]/, `${t.id} has a bidi control character`);
    }
  });
  test("new lessons: commands quoted in the English example survive in the Arabic text", () => {
    const missing = [];
    for (const t of SECURITY_TOPICS) {
      const cmds = (t.example.match(/\b(?:sudo |su |ls |cat |grep |tail |head |id |ip |ss |ps |systemctl |passwd |gpasswd |usermod |chgrp |chmod )[^;—,.]*/g) || []).map((c) => c.trim().split(" ").slice(0, 2).join(" "));
      for (const c of cmds) if (!SECURITY_TOPICS_AR[t.id].example.includes(c.split(" ")[0])) missing.push(`${t.id}: ${c}`);
    }
    assert.deepEqual(missing, []);
  });
  test("new quiz questions: every Arabic option list is 4 distinct non-empty strings", () => {
    for (const q of QUIZ_QUESTIONS.filter((x) => x.id >= 114)) {
      const a = QUIZ_QUESTIONS_AR[q.id];
      assert.equal(new Set(a.options).size, 4, `q${q.id}`);
      assert.ok(AR.test(a.q) || /^[\x20-\x7e]+$/.test(a.q), `q${q.id}`);
      assert.ok(a.explanation.length > 10, `q${q.id}`);
    }
  });
});
