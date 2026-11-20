/**
 * engine/shell-parse.js  (v2.4.2)
 * Pure command-line parsing for the simulated shell.
 *
 * Before v2.4.2 the terminal did `line.split(/\s+/)`, so quoting did nothing:
 *   touch "my file"   ->  two arguments: `"my` and `file"`
 * This tokenizer follows the POSIX shell rules that matter for a permissions
 * lab (no variables, globbing or substitution — those are future work; a single
 * pipe between commands is handled by splitPipeline() below):
 *   - whitespace separates words
 *   - 'single quotes'  : everything literal until the closing quote
 *   - "double quotes"  : literal, except \" and \\ (backslash escapes)
 *   - backslash outside quotes escapes the next character (\ + space = a space)
 *   - adjacent quoted/unquoted pieces join into one word:  a"b c"d -> `ab cd`
 *   - an empty quoted string ("" or '') is a real, empty argument
 *   - an unterminated quote is an error, like a real shell's prompt for more input
 */

/** @returns {{ ok: true, tokens: string[] } | { ok: false, error: string }} */
export function tokenize(line) {
  const tokens = [];
  let cur = "";
  let inWord = false;
  let quote = null; // "'" | '"' | null
  const s = String(line);

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];

    if (quote === "'") {
      if (ch === "'") quote = null;
      else cur += ch;
      continue;
    }
    if (quote === '"') {
      if (ch === '"') quote = null;
      else if (ch === "\\" && (s[i + 1] === '"' || s[i + 1] === "\\")) { cur += s[i + 1]; i++; }
      else cur += ch;
      continue;
    }

    if (ch === "'" || ch === '"') { quote = ch; inWord = true; continue; }
    if (ch === "\\") {
      if (i + 1 < s.length) { cur += s[i + 1]; i++; inWord = true; }
      else return { ok: false, error: "unexpected end of input after a backslash" };
      continue;
    }
    if (/\s/.test(ch)) {
      if (inWord) { tokens.push(cur); cur = ""; inWord = false; }
      continue;
    }
    cur += ch;
    inWord = true;
  }

  if (quote) return { ok: false, error: `unmatched ${quote} — close the quote and try again` };
  if (inWord) tokens.push(cur);
  return { ok: true, tokens };
}

const UNSAFE_NAME_CHARS = /[<>&"\u0000-\u001f\u007f]/;

/**
 * Names the simulator will create. Real Linux allows nearly anything except "/"
 * and NUL; this lab additionally rejects HTML-significant and control characters
 * because names are rendered in the page (defence in depth — output is escaped too).
 * @returns {null | string} null if fine, otherwise a human-readable reason
 */
export function nameProblem(name) {
  if (!name) return "empty name";
  if (name === "." || name === "..") return `'${name}' is reserved`;
  if (name.length > 255) return "name too long (max 255 characters, same as ext4)";
  if (UNSAFE_NAME_CHARS.test(name)) return "names in this simulator can't contain < > & \" or control characters";
  return null;
}

/**
 * Split a command line at its unquoted pipes:  grep x file | wc -l  ->  ["grep x file", "wc -l"].
 * Quotes and backslashes protect a "|". "||" is refused. Redirection and chaining are not implemented either:
 * see unsupportedOperator() for the friendly refusal of a stand-alone ">" , "<", ";", "&&" or "&" word.
 * @returns {{ ok: true, segments: string[] } | { ok: false, error: string }}
 */
export function splitPipeline(line) {
  const s = String(line);
  const segments = [];
  let cur = "";
  let quote = null;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quote) { cur += ch; if (ch === quote) quote = null; else if (quote === '"' && ch === "\\" && i + 1 < s.length) { cur += s[++i]; } continue; }
    if (ch === "'" || ch === '"') { quote = ch; cur += ch; continue; }
    if (ch === "\\") { cur += ch; if (i + 1 < s.length) cur += s[++i]; continue; }
    if (ch === "|") {
      if (s[i + 1] === "|") return { ok: false, error: "'||' is not supported in this simulator — a single | pipe is" };
      segments.push(cur); cur = ""; continue;
    }
    cur += ch;
  }
  segments.push(cur);
  if (segments.some((x) => !x.trim())) return { ok: false, error: "syntax error near unexpected token `|' (a pipe needs a command on both sides)" };
  return { ok: true, segments };
}

const OPERATOR_WORDS = new Set([">", ">>", "<", "<<", ";", "&&", "&", "2>", "&>"]);

/** A stand-alone operator word (e.g. the ">" in `cat a > b`) means the learner expects redirection or chaining,
 *  which this simulator does not implement. Anything else — including names such as `<img>` — stays literal text. */
export function unsupportedOperator(tokens) {
  const op = tokens.find((x) => OPERATOR_WORDS.has(x));
  return op ? `'${op}' is not supported in this simulator — redirection (>, <) and chaining (;, &&) are not implemented; use a single | pipe` : null;
}
