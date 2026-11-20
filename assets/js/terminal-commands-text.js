/**
 * terminal-commands-text.js  (Linux Security Lab)
 * Text-processing commands for log analysis: grep (on files), head, tail, wc, sort, uniq. Each works on a
 * list of lines, which comes from a file operand (permissions are enforced exactly as for cat) or, as a later
 * stage of a pipeline, from the previous command's output. Pure line logic is in applyFilter().
 */
import { FS_TREE, findNode, resolveSymlink } from "./filesystem.js";
import { checkPathAccess } from "./engine/users.js";
import { contentFor } from "./engine/filecontent.js";
import { escapeHTML, htmlToText } from "./engine/safe-html.js";
import { me } from "./terminal-state.js";
import { printLine, resolveArg, deny, whyFailed } from "./terminal-helpers.js";
import { handleGrep as handleGrepDescriptions } from "./terminal-commands-nav.js";

export const FILTER_COMMANDS = ["grep", "head", "tail", "wc", "sort", "uniq"];

/** Lines of a readable file (its content, or its description when it has no content). Prints the error and returns null on failure. */
export function readFileLines(arg, cmdName, container) {
  const path = resolveArg(arg);
  let node = findNode(FS_TREE, path);
  if (!node) { printLine(`<span class="t-err">${cmdName}: ${escapeHTML(arg)}: No such file or directory</span>`, container); return null; }
  if (node.isSymlink) {
    const target = resolveSymlink(node);
    if (!target) { printLine(`<span class="t-err">${cmdName}: ${escapeHTML(arg)}: broken symbolic link to '${escapeHTML(node.target)}'</span>`, container); return null; }
    const via = checkPathAccess(target.path, me(), "r");
    if (!via.ok) { deny(`${cmdName}: ${arg}: Permission denied`, `a symlink never grants access of its own — the kernel checks the TARGET. ${whyFailed(via, target.path, "r")}`, container); return null; }
    node = target;
  } else {
    const acc = checkPathAccess(node.path, me(), "r");
    if (!acc.ok) { deny(`${cmdName}: ${arg}: Permission denied`, whyFailed(acc, node.path, "r"), container); return null; }
  }
  if (node.isDir) { printLine(`<span class="t-err">${cmdName}: ${escapeHTML(arg)}: Is a directory</span>`, container); return null; }
  const lines = contentFor(node);
  return lines ? lines.map(String) : htmlToText(node.note || "(no description available for this simulated file)").split("\n");
}

/* ------------------------------- pure filters ------------------------------- */

function parseCount(args, fallback = 10) {
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "-n") { const v = args[i + 1]; if (!/^\d+$/.test(v || "")) return { error: `invalid number of lines: '${v ?? ""}'` }; return { n: Number(v) }; }
    if (/^-n\d+$/.test(a)) return { n: Number(a.slice(2)) };
    if (/^-\d+$/.test(a)) return { n: Number(a.slice(1)) };
  }
  return { n: fallback };
}

/** Flags (leading "-" words) and operands (everything else) of a filter command. */
function splitFlags(cmd, args) {
  const flags = []; const operands = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (/^-\d+$/.test(a)) flags.push(a);
    else if (a.length > 1 && a.startsWith("-")) {
      flags.push(a);
      if ((cmd === "head" || cmd === "tail") && a === "-n") { flags.push(args[i + 1] ?? ""); i += 1; }
    } else operands.push(a);
  }
  return { flags, operands };
}

/**
 * Apply one filter to lines. `args` are the command's own arguments WITHOUT any file operands
 * (grep keeps its pattern as the first operand). Returns { lines } or { error }.
 */
export function applyFilter(cmd, args, lines) {
  const { flags, operands } = splitFlags(cmd, args);
  const has = (ch) => flags.some((f) => /^-[a-zA-Z]+$/.test(f) && f.includes(ch));
  if (cmd === "grep") {
    const pattern = operands[0];
    if (pattern === undefined) return { error: "usage: grep [-i] [-v] [-c] [-n] <pattern> [file...]" };
    let re;
    try { re = new RegExp(pattern, has("i") ? "i" : ""); } catch { return { error: `grep: invalid regular expression '${pattern}'` }; }
    const inverted = has("v");
    const hits = [];
    lines.forEach((line, i) => { if (re.test(line) !== inverted) hits.push(has("n") ? `${i + 1}:${line}` : line); });
    return { lines: has("c") ? [String(hits.length)] : hits };
  }
  if (cmd === "head" || cmd === "tail") {
    const { n, error } = parseCount(args);
    if (error) return { error: `${cmd}: ${error}` };
    return { lines: cmd === "head" ? lines.slice(0, n) : (n === 0 ? [] : lines.slice(-n)) };
  }
  if (cmd === "wc") {
    if (has("l")) return { lines: [String(lines.length)] };
    const words = lines.reduce((a, l) => a + (l.trim() ? l.trim().split(/\s+/).length : 0), 0);
    const chars = lines.reduce((a, l) => a + l.length + 1, 0);
    return { lines: [`${lines.length} ${words} ${chars}`] };
  }
  if (cmd === "sort") {
    const out = [...lines].sort(has("n") ? (a, b) => (parseFloat(a) || 0) - (parseFloat(b) || 0) : (a, b) => (a < b ? -1 : a > b ? 1 : 0));
    return { lines: has("r") ? out.reverse() : out };
  }
  if (cmd === "uniq") {
    const out = [];
    for (const line of lines) {
      const last = out[out.length - 1];
      if (last && last.line === line) last.n += 1; else out.push({ line, n: 1 });
    }
    return { lines: out.map((x) => (has("c") ? `${String(x.n).padStart(7)} ${x.line}` : x.line)) };
  }
  return { error: `${cmd}: not a filter` };
}

export function printLines(lines, container) {
  if (lines.length) printLine(lines.map(escapeHTML).join("\n"), container);
}

/* ------------------------------ file-operand commands ------------------------------ */

function runOnFiles(cmd, args, container) {
  const { flags, operands } = splitFlags(cmd, args);
  const isGrep = cmd === "grep";
  const files = isGrep ? operands.slice(1) : operands;
  if (isGrep && !operands.length) { printLine('<span class="t-err">usage: grep [-i] [-v] [-c] [-n] &lt;pattern&gt; [file...]</span>', container); return; }
  if (!files.length) {
    printLine(`<span class="t-err">${cmd}: missing file operand</span>\n<span class="t-hint">this simulator reads files named on the command line, or the output of a previous command in a pipeline (try: cat file | ${cmd} …)</span>`, container);
    return;
  }
  const own = isGrep ? [...flags, operands[0]] : flags;
  files.forEach((file, idx) => {
    const lines = readFileLines(file, cmd, container);
    if (!lines) return;
    const res = applyFilter(cmd, own, lines);
    if (res.error) { printLine(`<span class="t-err">${escapeHTML(res.error)}</span>`, container); return; }
    const multi = files.length > 1;
    if (multi && (cmd === "head" || cmd === "tail")) printLine(`<span class="t-dim">${idx ? "\n" : ""}==&gt; ${escapeHTML(file)} &lt;==</span>`, container);
    if (multi && (isGrep || cmd === "wc")) printLines(res.lines.map((l) => `${file}:${l}`), container);
    else if (cmd === "wc") printLines(res.lines.map((l) => `${l} ${file}`), container);
    else printLines(res.lines, container);
  });
}

export function handleGrepCmd(args, container) {
  const { operands } = splitFlags("grep", args);
  // No file operand: the original behaviour (search the descriptions of the files you can see).
  if (operands.length <= 1 && !args.some((a) => a.startsWith("-"))) { handleGrepDescriptions(args, container); return; }
  if (operands.length <= 1) { printLine('<span class="t-err">grep: no file given — name a file to search, or pipe a command into grep</span>', container); return; }
  runOnFiles("grep", args, container);
}
export const handleHead = (args, container) => runOnFiles("head", args, container);
export const handleTail = (args, container) => runOnFiles("tail", args, container);
export const handleWc = (args, container) => runOnFiles("wc", args, container);
export const handleSort = (args, container) => runOnFiles("sort", args, container);
export const handleUniq = (args, container) => runOnFiles("uniq", args, container);
