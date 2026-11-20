/**
 * tests/engine/text-filters.test.js  (Linux Security Lab)
 * The pure parts of the pipe feature: splitting a command line at its unquoted pipes, refusing stand-alone
 * operator words, turning terminal HTML back into text, and the line filters (grep, head, tail, wc, sort, uniq).
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { installDomShim } from "../helpers/dom-shim.js";
import { installLocalStorageShim } from "../helpers/storage-shim.js";

installDomShim();
installLocalStorageShim();
const { splitPipeline, unsupportedOperator, tokenize } = await import("../../assets/js/engine/shell-parse.js");
const { htmlToText, escapeHTML } = await import("../../assets/js/engine/safe-html.js");
const { applyFilter } = await import("../../assets/js/terminal-commands-text.js");

describe("splitPipeline", () => {
  test("splits at unquoted pipes, with or without spaces", () => {
    assert.deepEqual(splitPipeline("grep x f | wc -l").segments.map((s) => s.trim()), ["grep x f", "wc -l"]);
    assert.deepEqual(splitPipeline("cat f|head -n 2|wc").segments, ["cat f", "head -n 2", "wc"]);
  });
  test("a pipe inside quotes is text", () => {
    assert.equal(splitPipeline('grep "a|b" f').segments.length, 1);
    assert.equal(splitPipeline("grep 'a|b' f").segments.length, 1);
  });
  test("|| and empty stages are refused", () => {
    assert.equal(splitPipeline("a || b").ok, false);
    assert.equal(splitPipeline("a |").ok, false);
    assert.equal(splitPipeline("| a").ok, false);
  });
  test("a line without a pipe is one segment, unchanged", () => {
    assert.deepEqual(splitPipeline("ls -la /var/log"), { ok: true, segments: ["ls -la /var/log"] });
  });
});

describe("unsupportedOperator", () => {
  test("stand-alone redirection and chaining words are refused with a message", () => {
    for (const op of [">", ">>", "<", ";", "&&", "&"]) assert.match(unsupportedOperator(["cat", "a", op, "b"]), /not supported/, op);
  });
  test("names that merely contain those characters stay literal (hostile file names keep working)", () => {
    assert.equal(unsupportedOperator(["touch", "<img/src=x/onerror=alert(1)>"]), null);
    assert.equal(unsupportedOperator(tokenize("touch 'a;b'").tokens), null);
  });
});

describe("htmlToText", () => {
  test("drops tags and decodes the five escapes", () => {
    assert.equal(htmlToText('<span class="t-dim">a &lt;b&gt; &amp; &quot;c&quot; &#39;d&#39;</span>'), `a <b> & "c" 'd'`);
  });
  test("round-trips escapeHTML", () => {
    const evil = `<img src=x onerror="a()"> & 'x'`;
    assert.equal(htmlToText(escapeHTML(evil)), evil);
  });
});

describe("applyFilter", () => {
  const lines = ["alpha 1", "Beta 2", "alpha 1", "gamma 3"];
  test("grep: literal, -i, -v, -c, -n", () => {
    assert.deepEqual(applyFilter("grep", ["alpha"], lines).lines, ["alpha 1", "alpha 1"]);
    assert.deepEqual(applyFilter("grep", ["-i", "beta"], lines).lines, ["Beta 2"]);
    assert.deepEqual(applyFilter("grep", ["-v", "alpha"], lines).lines, ["Beta 2", "gamma 3"]);
    assert.deepEqual(applyFilter("grep", ["-c", "alpha"], lines).lines, ["2"]);
    assert.deepEqual(applyFilter("grep", ["-n", "gamma"], lines).lines, ["4:gamma 3"]);
    assert.deepEqual(applyFilter("grep", ["-in", "BETA"], lines).lines, ["2:Beta 2"]);
  });
  test("grep: a regular expression, and a bad one is an error not a crash", () => {
    assert.deepEqual(applyFilter("grep", ["^g"], lines).lines, ["gamma 3"]);
    assert.match(applyFilter("grep", ["("], lines).error, /invalid regular expression/);
    assert.match(applyFilter("grep", [], lines).error, /usage/);
  });
  test("head and tail: -n N, -nN and -N forms, default 10, 0", () => {
    assert.deepEqual(applyFilter("head", ["-n", "2"], lines).lines, ["alpha 1", "Beta 2"]);
    assert.deepEqual(applyFilter("head", ["-n2"], lines).lines, ["alpha 1", "Beta 2"]);
    assert.deepEqual(applyFilter("tail", ["-2"], lines).lines, ["alpha 1", "gamma 3"]);
    assert.deepEqual(applyFilter("tail", [], lines).lines, lines);
    assert.deepEqual(applyFilter("tail", ["-n", "0"], lines).lines, []);
    assert.match(applyFilter("head", ["-n", "x"], lines).error, /invalid number/);
  });
  test("wc -l counts lines; plain wc gives lines, words, chars", () => {
    assert.deepEqual(applyFilter("wc", ["-l"], lines).lines, ["4"]);
    assert.match(applyFilter("wc", [], lines).lines[0], /^4 8 \d+$/);
  });
  test("sort (lexical, -r, -n) and uniq (-c)", () => {
    assert.deepEqual(applyFilter("sort", [], lines).lines, ["Beta 2", "alpha 1", "alpha 1", "gamma 3"]);
    assert.deepEqual(applyFilter("sort", ["-r"], ["a", "c", "b"]).lines, ["c", "b", "a"]);
    assert.deepEqual(applyFilter("sort", ["-n"], ["10", "9", "100"]).lines, ["9", "10", "100"]);
    assert.deepEqual(applyFilter("uniq", [], ["a", "a", "b", "a"]).lines, ["a", "b", "a"]);
    assert.deepEqual(applyFilter("uniq", ["-c"], ["a", "a", "b"]).lines, ["      2 a", "      1 b"]);
  });
  test("filtering never mutates its input", () => {
    const copy = [...lines];
    applyFilter("sort", ["-r"], lines); applyFilter("uniq", [], lines); applyFilter("head", ["-1"], lines);
    assert.deepEqual(lines, copy);
  });
});
