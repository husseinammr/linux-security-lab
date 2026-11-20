/**
 * tests/engine/quiz-select.test.js  (Linux Security Lab) — how a quiz round is chosen.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { installLocalStorageShim } from "../helpers/storage-shim.js";

installLocalStorageShim();
const { pickRound, shuffle } = await import("../../assets/js/quiz-select.js");
const { QUIZ_QUESTIONS } = await import("../../assets/js/quiz-data.js");

// A small deterministic generator so the tests are repeatable (mulberry32).
const seeded = (seed) => () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const SECTIONS = ["fundamentals", "permissions", "users", "network", "logs", "investigation", "architecture"];

describe("pickRound", () => {
  test("a single section returns only that section's questions, without repeats", () => {
    for (const s of SECTIONS) {
      const r = pickRound(QUIZ_QUESTIONS, s, 10, seeded(1));
      assert.equal(r.length, Math.min(10, QUIZ_QUESTIONS.filter((q) => q.section === s).length), s);
      assert.ok(r.every((q) => q.section === s), s);
      assert.equal(new Set(r.map((q) => q.id)).size, r.length, s);
    }
  });
  test("a small section returns what it has (investigation has 8)", () => {
    assert.equal(pickRound(QUIZ_QUESTIONS, "investigation", 10, seeded(2)).length, 8);
  });
  test("'All' draws evenly from the seven sections: 1–2 questions each in a round of 10", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const r = pickRound(QUIZ_QUESTIONS, "All", 10, seeded(seed));
      assert.equal(r.length, 10);
      assert.equal(new Set(r.map((q) => q.id)).size, 10, "no repeats");
      const counts = Object.fromEntries(SECTIONS.map((s) => [s, r.filter((q) => q.section === s).length]));
      assert.ok(SECTIONS.every((s) => counts[s] >= 1 && counts[s] <= 2), JSON.stringify(counts));
    }
  });
  test("over many rounds, File Permissions no longer dominates the mixed round", () => {
    let permissions = 0; const rounds = 300;
    for (let seed = 1; seed <= rounds; seed++) permissions += pickRound(QUIZ_QUESTIONS, "All", 10, seeded(seed)).filter((q) => q.section === "permissions").length;
    const share = permissions / (rounds * 10);
    assert.ok(share > 0.1 && share < 0.25, `permissions share ${share.toFixed(2)} (it was ~0.69 before)`);
  });
  test("a round bigger than the whole bank is just the bank; an empty bank gives an empty round", () => {
    assert.equal(pickRound(QUIZ_QUESTIONS, "All", 9999, seeded(3)).length, QUIZ_QUESTIONS.length);
    assert.deepEqual(pickRound([], "All", 10), []);
  });
  test("it never mutates the question bank", () => {
    const before = QUIZ_QUESTIONS.map((q) => q.id).join(",");
    pickRound(QUIZ_QUESTIONS, "All", 10, seeded(4)); pickRound(QUIZ_QUESTIONS, "logs", 10, seeded(4));
    assert.equal(QUIZ_QUESTIONS.map((q) => q.id).join(","), before);
  });
  test("shuffle returns a permutation", () => {
    const a = [1, 2, 3, 4, 5, 6, 7, 8];
    assert.deepEqual([...shuffle(a, seeded(5))].sort(), a);
  });
});
