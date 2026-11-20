/**
 * terminal.js
 * Module 3 — Terminal Simulator. Orchestrator only, as of v2.9: session
 * state lives in terminal-state.js, shared plumbing in terminal-helpers.js,
 * and every command's own behavior lives in one of the four
 * terminal-commands-*.js files (nav/files, permissions, identity/privilege,
 * system investigation) — split out of what had grown into a single
 * 1000+ line file. This file keeps only what's genuinely cross-cutting:
 * the prompt, the help text, the dispatch table, tab completion, and the
 * DOM wiring in initTerminal().
 *
 * A fully fake terminal: a fixed set of recognized commands operate against
 * the same in-memory filesystem tree used by the Filesystem module. Nothing
 * here executes real shell commands or touches a real disk.
 */

import { qs } from "./utils.js";
import { FS_TREE, findNode } from "./filesystem.js";
import { checkPathAccess } from "./engine/users.js";
import { escapeHTML } from "./engine/safe-html.js";
import { tokenize, splitPipeline, unsupportedOperator } from "./engine/shell-parse.js";
import { htmlToText } from "./engine/safe-html.js";
import { el } from "./utils.js";
import { completeLine } from "./engine/complete.js";

import {
  HOST, cwd, session, me,
  resetTerminalState, getTerminalState,
} from "./terminal-state.js";
import { printLine, resolveArg, printCommandHelp } from "./terminal-helpers.js";

import {
  handleLs, handleCd, handleCat, handleTree, handleStat, handleFind,
  handleTouch, handleMkdir, handleRm, handleMove, handleCopy, handleEditor, handleLn,
} from "./terminal-commands-nav.js";
import {
  handleGrepCmd, handleHead, handleTail, handleWc, handleSort, handleUniq, applyFilter, printLines, FILTER_COMMANDS,
} from "./terminal-commands-text.js";
import { handleIp, handleHostname, handlePing } from "./terminal-commands-net.js";
import {
  handleChmod, handleChown, handleChgrp, handleGetfacl, handleSetfacl, handleUmask,
} from "./terminal-commands-perm.js";
import {
  handleId, handleGroups, handleSu, handleExit, handleSudo, handleUsermod, handleGpasswd, handlePasswd,
} from "./terminal-commands-identity.js";
import {
  handlePs, handleWho, handleW, handleLast, handleLastlog, handleUname, handleDf, handleDu,
  handleSockets, handleSystemctl, handleJournalctl, handleDmesg, handleGetcap, handleCrontab, handleLastb, handleUptime, handleFree, handleLscpu, handleLsblk,
} from "./terminal-commands-sysinfo.js";

export { resetTerminalState, getTerminalState };

/** Command history for the ↑/↓ arrow keys — local to this file; nothing
 *  outside it needs to read or change it. */
let history = [];
let historyIndex = -1;

/** v2.12 — Investigation Mode listens to what the learner runs. The hook
 *  receives { cmd, args, user, cwd, paths } AFTER the command ran, where
 *  user/cwd/paths describe the shell as it was when the line was typed. */
let commandObserver = null;
export function setCommandObserver(fn) { commandObserver = typeof fn === "function" ? fn : null; }

/** Set by initTerminal(); lets scenarios re-sync the prompt after they move the shell. */
let promptRefresher = () => {};
let terminalBodyNode = null;
export function refreshTerminalPrompt() { promptRefresher(); }
/** Print an escaped plain-text notice line in the live terminal (no-op before init). */
export function terminalNotice(text) {
  if (terminalBodyNode) { printLine(`<span class="t-amber">${escapeHTML(text)}</span>`, terminalBodyNode); terminalBodyNode.scrollTop = terminalBodyNode.scrollHeight; }
}

function promptContextHTML() {
  return `<span class="t-prompt">${me()}</span><span class="t-dim">@${HOST}</span> <span class="t-path">${escapeHTML(cwd)}</span>`;
}

function promptGlyphHTML() {
  return `<span class="${me() === "root" ? "t-glyph-root" : "t-glyph-user"}">❯</span>`;
}

const HELP_TEXT = `Available commands (add --help or -h to any of them for just its own options):
  help                     show this message
  clear                    clear the terminal
  pwd                      print working directory
  whoami / id / groups     print current user identity (id/groups accept a username)
  su [-] [user]            switch user (default root); "exit" returns
  sudo [-u user] &lt;cmd&gt;     run one command as root/another user (needs the sudo group)
  exit                     leave the su shell and go back
  umask [-S] [mode]        show/set the mask applied to newly created files
  ls, ls -l, ls -la        list directory contents
  cd &lt;dir&gt;                 change directory
  cat &lt;file&gt;               show a file's description
  tree                     show the directory tree from here down
  stat &lt;file&gt;              show detailed permission info for a file
  find &lt;name&gt; / find [path] -name &lt;pattern&gt;   search by name, path-scoped with -name
  grep [-i -v -c -n] &lt;pattern&gt; &lt;file&gt;   search a file's lines (grep &lt;term&gt; alone searches file descriptions)
  head / tail [-n N] &lt;file&gt;   first / last lines of a file
  wc [-l] / sort / uniq [-c] &lt;file&gt;   count, sort and de-duplicate lines
  cmd1 | cmd2              pipe the output of one command into grep, head, tail, wc, sort or uniq
  touch &lt;file&gt;             create an empty file (simulated)
  mkdir &lt;dir&gt;              create a directory (simulated)
  rm &lt;file&gt;                remove a file (simulated)
  mv &lt;src&gt; &lt;dest&gt;          rename/move a file (simulated)
  cp &lt;src&gt; &lt;dest&gt;          copy a file (simulated)
  ln -s &lt;target&gt; [link]   create a symbolic link
  nano / vim &lt;file&gt;        open the simulated editor notice
  chmod &lt;mode&gt; &lt;file&gt;      change a file's permissions
  chown &lt;user&gt; &lt;file&gt;      change a file's owner
  chgrp &lt;group&gt; &lt;file&gt;     change a file's group
  getfacl &lt;file&gt;           show extended ACL entries, mask and effective bits
  setfacl -m u:name:rwx &lt;file&gt;   add/update a named user or group ACL entry
  setfacl -x u:name &lt;file&gt;       remove a named ACL entry (g: for a group)
  history                 show command history
  Tab                     complete a command or path (Tab twice lists the options)
Users and groups (root only — use sudo):
  usermod -aG &lt;group&gt; &lt;user&gt;   add a user to a group (without -a the list is replaced)
  gpasswd -d &lt;user&gt; &lt;group&gt;    remove a user from a group
  passwd -S &lt;user&gt;             password status (L = locked); sudo passwd -l / -u locks / unlocks
Hardware view (simulated machine):
  lscpu / free [-h] / lsblk / uptime   processor, memory, disks and mounts, uptime and load
Network (simulated — no packet is ever sent):
  ip addr / ip link / ip route   interfaces, addresses and the routing table
  hostname [-I]            the host name / its IP address
  ping [-c N] &lt;host&gt;       reachability of the lab's own addresses
System investigation (read-only unless noted; nothing here executes real commands):
  ps / ps aux              running processes (plain ps: just your own session)
  who / w                  who is logged in, and what they're doing
  last [-n N] / lastlog    login history / each account's most recent login
  uname -a                 kernel, hostname and OS info
  df -h / du -sh &lt;dir&gt;     disk usage
  ss -tulpn / netstat -tulpn   listening sockets (process shown only if it's yours, or as root); ss -tn lists connections
  systemctl status &lt;svc&gt; / list-units   service state; as root also stop / start / restart / enable / disable
  lastb                    failed login attempts — root only
  journalctl [-u unit] [-n N]   system journal — needs root or the 'adm' group
  dmesg                    kernel ring buffer — root only (kernel.dmesg_restrict)
  getcap -r /              binaries granted Linux capabilities (SUID's modern alternative)
  crontab -l [-u user]     a user's scheduled jobs (-u is root-only)
  sudo -l                  what you're allowed to run as root, and why
  find [path] -perm -4000  SUID audit (-2000 SGID, -1000 sticky, /6000 either)
Symlinks (shown as "name -&gt; target" in ls -l/stat) always report mode 0777 —
that's cosmetic. cat, chmod, chown and chgrp all follow a symlink to act on
its target, exactly like the real commands do without a -h/-P flag.
Users you can switch to: root, user, alice, deployer, monitoring, www-data.
Permissions are enforced: as a non-root user, commands fail with "Permission
denied" and a hint explaining which permission class applied. Try: su alice,
then cat /etc/shadow.
This is a simulation — no real shell commands are executed and nothing here touches a real filesystem.`;

export function runCommand(raw, container) {
  const trimmed = raw.trim();
  if (trimmed) { history.push(trimmed); historyIndex = history.length; }
  printLine(`${promptContextHTML()} ${promptGlyphHTML()} ${escapeHTML(trimmed)}`, container);
  if (!trimmed) return;

  const piped = splitPipeline(trimmed);
  if (!piped.ok) { printLine(`<span class="t-err">${escapeHTML(piped.error)}</span>`, container); return; }
  const parsedStages = [];
  for (const seg of piped.segments) {
    const parsed = tokenize(seg);
    if (!parsed.ok) { printLine(`<span class="t-err">${escapeHTML(parsed.error)}</span>`, container); return; }
    const op = unsupportedOperator(parsed.tokens);
    if (op) { printLine(`<span class="t-err">${escapeHTML(op)}</span>`, container); return; }
    parsedStages.push(parsed.tokens);
  }
  const [cmd, ...args] = parsedStages[0];
  if (cmd === undefined) return;
  const before = { user: me(), cwd, paths: args.filter((a) => !a.startsWith("-")).map((a) => resolveArg(a)) };
  if (parsedStages.length === 1) dispatch(cmd, args, container);
  else runPipeline(parsedStages, container);
  if (commandObserver) {
    try { commandObserver({ cmd, args, ...before }); } catch { /* an observer must never break the shell */ }
  }
}

/** First stage: any command, its output captured as plain text. Later stages: grep, head, tail, wc, sort, uniq. */
function runPipeline(stages, container) {
  const later = stages.slice(1);
  const bad = later.find(([c]) => !FILTER_COMMANDS.includes(c));
  if (bad) {
    printLine(`<span class="t-err">pipe: '${escapeHTML(bad[0] ?? "")}' cannot read from a pipe in this simulator — supported after a | are: ${FILTER_COMMANDS.join(", ")}</span>`, container);
    return;
  }
  const capture = el("div");
  dispatch(stages[0][0], stages[0].slice(1), capture);
  // Like a real shell, error messages and the sudo password notice are "stderr": they go straight to the screen
  // and never enter the pipe, so `cat secret | wc -l` shows the refusal and counts nothing.
  const isStderr = (html) => /class="t-(err|hint)"/.test(html) || /^<span class="t-dim">\[sudo\] password for/.test(html);
  const outLines = [];
  for (const child of Array.from(capture.children)) {
    const html = child.innerHTML ?? "";
    if (isStderr(html)) printLine(html, container); else outLines.push(htmlToText(html));
  }
  let lines = outLines.join("\n").split("\n");
  if (lines.length === 1 && lines[0] === "") lines = [];
  for (const [c, ...a] of later) {
    const res = applyFilter(c, a, lines);
    if (res.error) { printLine(`<span class="t-err">${escapeHTML(res.error)}</span>`, container); return; }
    lines = res.lines;
  }
  printLines(lines, container);
}

export function dispatch(cmd, args, container) {
  const handlers = {
    help: () => printLine(`<span class="t-dim">${HELP_TEXT}</span>`, container),
    clear: () => { container.innerHTML = ""; },
    pwd: () => printLine(cwd, container),
    whoami: () => printLine(me(), container),
    id: () => handleId(args, container),
    groups: () => handleGroups(args, container),
    su: () => handleSu(args, container),
    sudo: () => handleSudo(args, container),
    exit: () => handleExit(container),
    logout: () => handleExit(container),
    umask: () => handleUmask(args, container),
    ln: () => handleLn(args, container),
    history: () => printLine(history.map((h, i) => `${i + 1}  ${escapeHTML(h)}`).join("\n") || "(empty)", container),
    ls: () => handleLs(args, container),
    cd: () => handleCd(args, container),
    cat: () => handleCat(args, container),
    tree: () => handleTree(args, container),
    stat: () => handleStat(args, container),
    find: () => handleFind(args, container),
    grep: () => handleGrepCmd(args, container),
    head: () => handleHead(args, container),
    tail: () => handleTail(args, container),
    wc: () => handleWc(args, container),
    sort: () => handleSort(args, container),
    uniq: () => handleUniq(args, container),
    touch: () => handleTouch(args, container),
    mkdir: () => handleMkdir(args, container),
    rm: () => handleRm(args, container),
    mv: () => handleMove(args, container),
    cp: () => handleCopy(args, container),
    nano: () => handleEditor("nano", args, container),
    vim: () => handleEditor("vim", args, container),
    chmod: () => handleChmod(args, container),
    chown: () => handleChown(args, container),
    chgrp: () => handleChgrp(args, container),
    getfacl: () => handleGetfacl(args, container),
    setfacl: () => handleSetfacl(args, container),
    ps: () => handlePs(args, container),
    who: () => handleWho(container),
    w: () => handleW(container),
    last: () => handleLast(args, container),
    lastlog: () => handleLastlog(container),
    uname: () => handleUname(args, container),
    df: () => handleDf(container),
    du: () => handleDu(args, container),
    ss: () => handleSockets(args, container),
    netstat: () => handleSockets(args, container),
    systemctl: () => handleSystemctl(args, container),
    journalctl: () => handleJournalctl(args, container),
    dmesg: () => handleDmesg(container),
    getcap: () => handleGetcap(args, container),
    crontab: () => handleCrontab(args, container),
    lastb: () => handleLastb(args, container),
    uptime: () => handleUptime(args, container),
    free: () => handleFree(args, container),
    lscpu: () => handleLscpu(args, container),
    lsblk: () => handleLsblk(args, container),
    ip: () => handleIp(args, container),
    hostname: () => handleHostname(args, container),
    ping: () => handlePing(args, container),
    usermod: () => handleUsermod(args, container),
    gpasswd: () => handleGpasswd(args, container),
    passwd: () => handlePasswd(args, container),
  };

  const handler = Object.prototype.hasOwnProperty.call(handlers, cmd) ? handlers[cmd] : null;
  // -h is "human-readable" for these (df -h, du -sh, free -h, ls -lh), not a request for help; only --help is.
  const humanH = ["df", "du", "free", "ls"].includes(cmd);
  if (handler && (args.includes("--help") || (!humanH && args.includes("-h")))) { printCommandHelp(cmd, container); return; }
  if (handler) handler();
  else printLine(`<span class="t-err">command not found: ${escapeHTML(cmd)}</span> — type <span class="t-amber">help</span> for available commands`, container);
}

export const COMMAND_NAMES = [
  "help", "clear", "pwd", "whoami", "id", "groups", "su", "sudo", "exit", "logout", "umask", "ln", "history",
  "ls", "cd", "cat", "tree", "stat", "find", "grep", "touch", "mkdir", "rm", "mv", "cp", "nano", "vim",
  "chmod", "chown", "chgrp", "getfacl", "setfacl", "ps", "who", "w", "last", "lastlog", "uname", "df", "du",
  "ss", "netstat", "systemctl", "journalctl", "dmesg", "getcap", "crontab",
  "head", "tail", "wc", "sort", "uniq", "lastb", "uptime", "free", "lscpu", "lsblk", "ip", "hostname", "ping", "usermod", "gpasswd", "passwd",
];

/** Directory listing for Tab completion — only what the current user could actually `ls`. */
function listDirForCompletion(dirPart) {
  const path = dirPart ? resolveArg(dirPart) : cwd;
  const node = findNode(FS_TREE, path);
  if (!node || !node.isDir) return [];
  if (!checkPathAccess(path, me(), "r").ok) return [];
  return (node.children || []).map((c) => ({ name: c.name, isDir: !!c.isDir }));
}

/** Tab completion for the current shell state (exported for tests). */
export function completeInput(line) {
  return completeLine(line, { commands: COMMAND_NAMES, listDir: listDirForCompletion });
}

export function initTerminal() {
  const body = qs("#terminal-body");
  const input = qs("#terminal-input");
  const promptInfo = qs("#terminal-prompt-info");
  const promptGlyph = qs("#terminal-prompt-glyph");
  const tlTitle = qs("#terminal-tl-title");
  const tlStatus = qs("#terminal-tl-status");
  if (!body || !input) return;

  body.innerHTML = "";
printLine("<span class=\"t-arch\">      /\\       </span><span class=\"t-prompt\">user@permission-lab</span>\n<span class=\"t-arch\">     /  \\      </span><span class=\"t-dim\">-------------------</span>\n<span class=\"t-arch\">    /    \\     </span><span class=\"t-dim\">OS: Arch Linux</span>\n<span class=\"t-arch\">   /  __  \\    </span><span class=\"t-dim\">Kernel: 6.8.0-45</span>\n<span class=\"t-arch\">  / |    | \\   </span><span class=\"t-dim\">Shell: bash</span>\n<span class=\"t-arch\"> /__|    |__\\  </span><span class=\"t-dim\">Packages: 47</span>\n\n<span class=\"t-dim\">Type \"help\" to see all 47 commands. Nothing here touches a real system.</span>", body);

  /** Titlebar mirrors who you actually are right now — the same signal real
   *  terminal tabs give you, but here it doubles as a privilege tell: green
   *  at rest, red the moment you ARE root — the exact boundary this lab is
   *  about. (Capability to sudo isn't shown here; plenty of accounts have
   *  it and sit calmly at rest — only actually BEING root changes the dot.) */
  const updateTitlebar = () => {
    if (tlTitle) tlTitle.textContent = `${me()}@${HOST}`;
    if (tlStatus) tlStatus.className = `tl-status-dot ${me() === "root" ? "is-root" : "is-user"}`;
  };

  const updatePromptPrefix = () => {
    if (promptInfo) promptInfo.innerHTML = promptContextHTML();
    if (promptGlyph) promptGlyph.innerHTML = promptGlyphHTML();
    updateTitlebar();
  };
  updatePromptPrefix();
  promptRefresher = updatePromptPrefix;
  terminalBodyNode = body;

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      runCommand(input.value, body);
      input.value = "";
      updatePromptPrefix();
      body.scrollTop = body.scrollHeight;
    } else if (e.key === "Tab") {
      e.preventDefault();
      const { line, candidates } = completeInput(input.value);
      if (line === input.value && candidates.length > 1) {
        printLine(`${promptContextHTML()} ${promptGlyphHTML()} ${escapeHTML(input.value)}`, body);
        printLine(`<span class="t-dim">${candidates.map(escapeHTML).join("   ")}</span>`, body);
        body.scrollTop = body.scrollHeight;
      }
      input.value = line;
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (historyIndex > 0) { historyIndex -= 1; input.value = history[historyIndex] || ""; }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (historyIndex < history.length - 1) { historyIndex += 1; input.value = history[historyIndex] || ""; }
      else { historyIndex = history.length; input.value = ""; }
    }
  });

  qs("#terminal-window")?.addEventListener("click", () => input.focus());

  qs(".terminal-hint-row")?.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-cmd]");
    if (!btn) return;
    input.value = btn.dataset.cmd;
    input.focus();
  });
}
