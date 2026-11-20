/**
 * terminal-commands-sysinfo.js
 * System-investigation commands (split out of terminal.js in v2.9): ps,
 * who, w, last, lastlog, uname, df, du, ss/netstat, systemctl, journalctl,
 * dmesg, getcap, crontab -l.
 */
import { FS_TREE, findNode, flattenTree } from "./filesystem.js";
import { USERS, getUser, isInGroup, checkPathAccess } from "./engine/users.js";
import { escapeHTML } from "./engine/safe-html.js";
import {
  SYSTEM_INFO, PROCESSES, myProcesses, SERVICES, SOCKETS, CONNECTIONS, CAPABILITIES, DISK_USAGE,
  LOGIN_SESSIONS, LOGIN_HISTORY, buildLastlog, filterJournal, dmesgLines, formatLogLine, failedLoginRecords, MEMORY, CPU_INFO, BLOCK_DEVICES,
} from "./engine/sysinfo.js";
import { baselineSystem } from "./engine/sysstate.js";
import { HOST, cwd, me } from "./terminal-state.js";
import { printLine, resolveArg, deny, whyFailed } from "./terminal-helpers.js";

export function handlePs(args, container) {
  const all = ["aux", "-ef", "-e", "-A", "-aux"].some((f) => args.includes(f));
  if (!all) {
    const rows = myProcesses(me(), "ps" + (args.length ? " " + args.join(" ") : ""));
    const lines = rows.map((p) => `${String(p.pid).padStart(5)} ${p.tty.padEnd(10)} ${p.time.padStart(8)} ${escapeHTML(p.cmd)}`);
    printLine(["  PID TTY            TIME CMD", ...lines].join("\n"), container);
    return;
  }
  const lines = PROCESSES.map((p) =>
    `${p.user.padEnd(10)} ${String(p.pid).padStart(5)} ${p.cpu.padStart(4)} ${p.mem.padStart(4)} ${String(p.vsz).padStart(7)} ${String(p.rss).padStart(6)} ${p.tty.padEnd(8)} ${p.stat.padEnd(4)} ${p.start.padEnd(7)} ${p.time.padStart(7)} ${escapeHTML(p.cmd)}`
  );
  printLine(
    ["USER         PID %CPU %MEM    VSZ    RSS TTY      STAT START      TIME COMMAND", ...lines].join("\n") +
    '\n<span class="t-dim">Command-line arguments are visible here to every local user — see pid 2140 and 1402. Secrets belong in a 600 file or an environment variable the process reads itself, never a CLI flag.</span>',
    container,
  );
}

export function handleWho(container) {
  const rows = LOGIN_SESSIONS.map((s) => `${s.user.padEnd(10)} ${s.tty.padEnd(10)} (${s.from})`);
  printLine(rows.join("\n"), container);
}

export function handleW(container) {
  const header = `now up — ${SYSTEM_INFO.uptime},  ${LOGIN_SESSIONS.length} users,  load average: ${SYSTEM_INFO.loadAvg}`;
  const cols = "USER     TTY      FROM             LOGIN@   IDLE   WHAT";
  const rows = LOGIN_SESSIONS.map((s) => `${s.user.padEnd(8)} ${s.tty.padEnd(8)} ${s.from.padEnd(16)} ${s.loginAt.padEnd(8)} ${s.idle.padEnd(6)} ${s.what}`);
  const notes = LOGIN_SESSIONS.filter((s) => s.note).map((s) => `<span class="t-dim">${escapeHTML(s.note)}</span>`);
  printLine([header, cols, ...rows, ...notes].join("\n"), container);
}

export function handleLast(args, container) {
  const nIdx = args.indexOf("-n");
  const limit = nIdx !== -1 && args[nIdx + 1] ? Math.max(1, Number(args[nIdx + 1]) || LOGIN_HISTORY.length) : LOGIN_HISTORY.length;
  const rows = LOGIN_HISTORY.slice(0, limit).map((h) => {
    const status = h.still ? "still logged in" : `- ${h.duration || "?"}`;
    return `${h.user.padEnd(8)} ${h.tty.padEnd(13)} ${h.from.padEnd(18)} ${h.start}   ${status}`;
  });
  printLine(rows.join("\n"), container);
}

export function handleLastlog(container) {
  const rows = buildLastlog(Object.keys(USERS));
  const lines = rows.map((r) =>
    r.never ? `${r.user.padEnd(16)} **Never logged in**` : `${r.user.padEnd(16)} ${r.tty.padEnd(10)} ${r.from.padEnd(16)} ${r.when}`
  );
  printLine(["Username         Port       From             Latest", ...lines].join("\n"), container);
}

export function handleUname(args, container) {
  if (args.includes("-a")) {
    printLine(`${SYSTEM_INFO.kernel} ${SYSTEM_INFO.hostname} ${SYSTEM_INFO.release} ${SYSTEM_INFO.version} ${SYSTEM_INFO.machine} ${SYSTEM_INFO.os}`, container);
  } else if (args.includes("-r")) printLine(SYSTEM_INFO.release, container);
  else if (args.includes("-m")) printLine(SYSTEM_INFO.machine, container);
  else printLine(SYSTEM_INFO.kernel, container);
}

export function handleDf(container) {
  const header = "Filesystem      Size  Used Avail Use% Mounted on";
  const rows = DISK_USAGE.map((d) => `${d.fs.padEnd(15)} ${d.size.padStart(5)} ${d.used.padStart(5)} ${d.avail.padStart(6)} ${d.usePct.padStart(4)} ${d.on}`);
  const notes = DISK_USAGE.filter((d) => d.note).map((d) => `<span class="t-dim">${escapeHTML(d.on)}: ${escapeHTML(d.note)}</span>`);
  printLine([header, ...rows, ...notes].join("\n"), container);
}

export function handleDu(args, container) {
  const target = args.find((a) => !a.startsWith("-"));
  const path = target ? resolveArg(target) : cwd;
  const node = findNode(FS_TREE, path);
  if (!node) { printLine(`<span class="t-err">du: cannot access '${escapeHTML(target || ".")}': No such file or directory</span>`, container); return; }
  const duAccess = checkPathAccess(path, me(), "r");
  if (!duAccess.ok) { deny(`du: cannot read directory '${target || "."}': Permission denied`, whyFailed(duAccess, path, "r"), container); return; }
  const count = flattenTree(node).length;
  const kb = Math.max(4, count * 37);
  const human = kb > 1024 ? `${(kb / 1024).toFixed(1)}M` : `${kb}K`;
  printLine(`${human}\t${path}`, container);
}

/** `ss` / `netstat`. Flags (combined letters allowed): l = listening sockets, a = both, t/u/n are accepted;
 *  p adds the owning process (only for sockets you own, or as root). With no l/a, established connections are shown, as real ss does. */
export function handleSockets(args, container) {
  const letters = args.filter((a) => /^-[a-zA-Z]+$/.test(a)).join("").replace(/-/g, "");
  const listening = letters.includes("l"); const all = letters.includes("a");
  const showProc = letters.includes("p");
  const privileged = me() === "root";
  const procField = (s) => (showProc ? (privileged || s.owner === me() ? ` users:(("${s.program}",pid=${s.pid}))` : " -") : "");
  const lines = [];
  const notes = [];
  if (listening || all) {
    lines.push(`Netid  State    Local Address:Port      Peer Address:Port${showProc ? "  Process" : ""}`);
    SOCKETS.forEach((s) => lines.push(`${s.proto.padEnd(6)} ${s.state.padEnd(8)} ${s.local.padEnd(23)} ${"0.0.0.0:*".padEnd(16)}${procField(s)}`));
    SOCKETS.filter((s) => s.note).forEach((s) => notes.push(`<span class="t-dim">${escapeHTML(s.local)}: ${escapeHTML(s.note)}</span>`));
  }
  if (!listening || all) {
    if (lines.length) lines.push("");
    lines.push(`Netid  State    Local Address:Port      Peer Address:Port${showProc ? "  Process" : ""}`);
    CONNECTIONS.forEach((c) => lines.push(`${c.proto.padEnd(6)} ${c.state.padEnd(8)} ${c.local.padEnd(23)} ${c.remote.padEnd(21)}${procField(c)}`));
    CONNECTIONS.filter((c) => c.note).forEach((c) => notes.push(`<span class="t-dim">${escapeHTML(c.remote)}: ${escapeHTML(c.note)}</span>`));
  }
  const hint = showProc && !privileged ? '\n<span class="t-dim">Process/PID is only shown for sockets you own, or as root — exactly like real ss/netstat behave without sudo.</span>' : "";
  printLine([...lines.map(escapeHTML), ...notes].join("\n") + hint, container);
}

/** Unit lookup: "redis-server", "redis-server.service" and the "sshd" alias for ssh.service all work. */
function findUnit(name) {
  const base = name === "sshd" || name === "sshd.service" ? "ssh" : name.replace(/\.service$/, "");
  return SERVICES.find((s) => s.name === `${base}.service`);
}

function applyUnitAction(action, svc) {
  const base = baselineSystem();
  const strip = () => {
    for (let i = PROCESSES.length - 1; i >= 0; i--) if ((svc.procs || []).includes(PROCESSES[i].pid)) PROCESSES.splice(i, 1);
    for (let i = SOCKETS.length - 1; i >= 0; i--) if ((svc.programs || []).includes(SOCKETS[i].program)) SOCKETS.splice(i, 1);
  };
  const restore = () => {
    strip();
    base.processes.filter((p) => (svc.procs || []).includes(p.pid)).forEach((p) => PROCESSES.push(p));
    base.sockets.filter((x) => (svc.programs || []).includes(x.program)).forEach((x) => SOCKETS.push(x));
  };
  if (action === "stop") { strip(); svc.active = "inactive"; svc.sub = "dead"; }
  else if (action === "start" || action === "restart") { restore(); svc.active = "active"; svc.sub = "running"; }
  else if (action === "enable") svc.enabled = true;
  else if (action === "disable") svc.enabled = false;
}

const UNIT_ACTIONS = ["stop", "start", "restart", "enable", "disable"];

export function handleSystemctl(args, container) {
  if (args[0] === "status") {
    const name = args[1];
    if (!name) { printLine('<span class="t-err">usage: systemctl status &lt;service&gt;</span>', container); return; }
    const svc = findUnit(name);
    if (!svc) { printLine(`<span class="t-err">Unit ${escapeHTML(name.endsWith(".service") ? name : name + ".service")} could not be found.</span>`, container); return; }
    const cls = svc.active === "active" ? "t-amber" : svc.active === "failed" ? "t-err" : "t-dim";
    printLine(
      `<span class="${cls}">●</span> ${escapeHTML(svc.name)} - ${escapeHTML(svc.desc)}\n` +
      `     Loaded: ${svc.load} (/lib/systemd/system/${escapeHTML(svc.name)}; ${svc.enabled ? "enabled" : "disabled"})\n` +
      `     Active: <span class="${cls}">${svc.active} (${svc.sub})</span>`,
      container,
    );
    return;
  }
  if (args[0] === "list-units" || args[0] === "--type=service") {
    const header = "UNIT                          LOAD   ACTIVE   SUB     DESCRIPTION";
    const rows = SERVICES.map((s) => `${s.name.padEnd(29)} ${s.load.padEnd(6)} ${s.active.padEnd(8)} ${s.sub.padEnd(7)} ${escapeHTML(s.desc)}`);
    printLine([header, ...rows].join("\n"), container);
    return;
  }
  if (args[0] === "is-active" || args[0] === "is-enabled") {
    const svc = args[1] ? findUnit(args[1]) : null;
    if (!svc) { printLine(`<span class="t-err">${args[1] ? "Unit " + escapeHTML(args[1]) + " could not be found." : "usage: systemctl " + args[0] + " &lt;service&gt;"}</span>`, container); return; }
    printLine(args[0] === "is-active" ? svc.active : svc.enabled ? "enabled" : "disabled", container);
    return;
  }
  if (UNIT_ACTIONS.includes(args[0])) {
    const action = args[0];
    if (!args[1]) { printLine(`<span class="t-err">usage: systemctl ${action} &lt;service&gt;</span>`, container); return; }
    const svc = findUnit(args[1]);
    if (!svc) { printLine(`<span class="t-err">Failed to ${action} ${escapeHTML(args[1])}.service: Unit ${escapeHTML(args[1])}.service not found.</span>`, container); return; }
    if (me() !== "root") {
      deny(`Failed to ${action} ${svc.name}: Interactive authentication required.`, "Starting, stopping, enabling and disabling system services needs root — try sudo systemctl " + action + " " + svc.name.replace(/\.service$/, "") + ".", container);
      return;
    }
    applyUnitAction(action, svc);
    const verb = { stop: "stopped", start: "started", restart: "restarted", enable: "enabled (starts at boot)", disable: "disabled (will not start at boot)" }[action];
    printLine(`<span class="t-dim">${escapeHTML(svc.name)} ${verb} (simulated). Check it with: systemctl status ${escapeHTML(svc.name.replace(/\.service$/, ""))}${action === "stop" || action === "start" || action === "restart" ? " and ss -tulpn" : ""}</span>`, container);
    return;
  }
  printLine('<span class="t-err">usage: systemctl status|stop|start|restart|enable|disable &lt;service&gt;   or   systemctl list-units</span>', container);
}

export function handleJournalctl(args, container) {
  if (me() !== "root" && !isInGroup(me(), "adm")) {
    deny(
      "Failed to acquire journal access",
      "the journal is readable only by root and the 'adm' group — the same rule that gates /var/log/auth.log and /var/log/syslog. Try: su alice (she's in adm), or sudo journalctl.",
      container,
    );
    return;
  }
  const uIdx = args.indexOf("-u");
  const unit = uIdx !== -1 ? args[uIdx + 1] : null;
  const nIdx = args.indexOf("-n");
  const lines = nIdx !== -1 ? args[nIdx + 1] : null;
  const rows = filterJournal({ unit, lines });
  if (!rows.length) { printLine('<span class="t-dim">-- No entries --</span>', container); return; }
  const body = rows.map((e) => escapeHTML(formatLogLine(e))).join("\n");
  const notes = rows.filter((e) => e.note).map((e) => `<span class="t-dim">${escapeHTML(e.note)}</span>`);
  const ignoredFlags = args.filter((a) => a === "-f" || a === "--since" || a === "--until");
  const liveNote = ignoredFlags.length ? '\n<span class="t-dim">(-f / --since / --until aren\'t simulated — showing the full matching history instead.)</span>' : "";
  printLine(body + (notes.length ? "\n" + notes.join("\n") : "") + liveNote, container);
}

export function handleDmesg(container) {
  if (me() !== "root") {
    deny(
      "dmesg: read kernel buffer failed: Operation not permitted",
      "Ubuntu restricts the kernel ring buffer to root by default (sysctl kernel.dmesg_restrict=1) — even 'adm' members need sudo for this one.",
      container,
    );
    return;
  }
  const rows = dmesgLines();
  printLine(rows.length ? rows.map((e) => escapeHTML(e.msg)).join("\n") : "(empty)", container);
}

export function handleGetcap(args, container) {
  const rows = CAPABILITIES.map((c) => `${c.path} ${c.caps}`);
  const notes = CAPABILITIES.filter((c) => c.note).map((c) => `<span class="t-dim">${escapeHTML(c.path)}: ${escapeHTML(c.note)}</span>`);
  printLine([...rows, ...notes].join("\n"), container);
}

export function handleCrontab(args, container) {
  if (!args.includes("-l")) { printLine('<span class="t-err">usage: crontab -l [-u user]   (this simulation only supports listing)</span>', container); return; }
  let target = me();
  const uIdx = args.indexOf("-u");
  if (uIdx !== -1) {
    const named = args[uIdx + 1];
    if (!named) { printLine('<span class="t-err">usage: crontab -u &lt;user&gt; -l</span>', container); return; }
    if (!getUser(named)) { printLine(`<span class="t-err">crontab: user '${escapeHTML(named)}' unknown</span>`, container); return; }
    if (named !== me() && me() !== "root") { deny("crontab: must be root to specify a user with -l", `-u is root-only in real cron too; '${me()}' may only list their own crontab (plain 'crontab -l', no -u needed).`, container); return; }
    target = named;
  }
  const node = findNode(FS_TREE, `/var/spool/cron/crontabs/${target}`);
  if (!node) { printLine(`<span class="t-dim">no crontab for ${escapeHTML(target)}</span>`, container); return; }
  const scheduleLine = (node.note || "").split("\n\n")[0];
  printLine(`<span class="t-dim"># crontab for ${escapeHTML(target)} — edit with: crontab -e (not simulated)</span>\n${escapeHTML(scheduleLine)}`, container);
}

/** `lastb`: failed login attempts (the btmp database, root-only exactly like /var/log/btmp). */
export function handleLastb(args, container) {
  if (me() !== "root") {
    deny("lastb: cannot open /var/log/btmp: Permission denied", "/var/log/btmp is mode 600, owner root — failed-login records are readable only by root. Try sudo lastb.", container);
    return;
  }
  const nIdx = args.indexOf("-n");
  const limit = nIdx !== -1 && args[nIdx + 1] ? Math.max(1, Number(args[nIdx + 1]) || 10) : Infinity;
  const rows = failedLoginRecords().slice(0, limit).map((r) => `${r.user.padEnd(9)} ssh:notty    ${r.from.padEnd(16)} ${r.ts}`);
  printLine([...rows, "", `btmp begins Oct  9 08:58:11`].map(escapeHTML).join("\n"), container);
}

/* ---------------- hardware view (Linux Security Lab: architecture section) ---------------- */

const toHuman = (kib) => (kib === 0 ? "0B" : kib >= 1048576 ? `${(kib / 1048576).toFixed(1)}Gi` : kib >= 1024 ? `${Math.round(kib / 1024)}Mi` : `${kib}Ki`);

/** `uptime`: time, how long the machine has been up, logged-in users and the load averages. */
export function handleUptime(args, container) {
  const up = SYSTEM_INFO.uptime.replace(/^up /, "").replace(/ days?, (\d+) hours?, (\d+) minutes?$/, " days, $1:$2");
  printLine(escapeHTML(` 09:35:12 up ${up},  ${LOGIN_SESSIONS.length} users,  load average: ${SYSTEM_INFO.loadAvg}`), container);
}

/** `free` (KiB) and `free -h` (human readable). */
export function handleFree(args, container) {
  const h = args.includes("-h") || args.includes("--human");
  const f = (n) => (h ? toHuman(n) : String(n));
  const row = (label, ...cells) => `${label.padEnd(8)}${cells.map((c) => String(c).padStart(12)).join("")}`;
  const lines = [
    `${"".padEnd(8)}${["total", "used", "free", "shared", "buff/cache", "available"].map((c) => c.padStart(12)).join("")}`,
    row("Mem:", f(MEMORY.total), f(MEMORY.used), f(MEMORY.free), f(MEMORY.shared), f(MEMORY.cache), f(MEMORY.available)),
    row("Swap:", f(MEMORY.swapTotal), f(MEMORY.swapUsed), f(MEMORY.swapTotal - MEMORY.swapUsed)),
  ];
  printLine(lines.map(escapeHTML).join("\n"), container);
}

/** `lscpu`: the processor as the kernel sees it. */
export function handleLscpu(args, container) {
  printLine(CPU_INFO.map(([k, v]) => escapeHTML(`${k.padEnd(22)}${v}`)).join("\n"), container);
}

/** `lsblk`: block devices (disks and partitions) and where they are mounted. */
export function handleLsblk(args, container) {
  const head = "NAME     MAJ:MIN RM  SIZE RO TYPE MOUNTPOINTS";
  const rows = BLOCK_DEVICES.map((d) => `${d.name.padEnd(8)} ${d.majmin.padEnd(7)} ${String(d.rm).padStart(2)} ${d.size.padStart(5)}  0 ${d.type.padEnd(4)} ${d.mount}`.trimEnd());
  printLine([head, ...rows].map(escapeHTML).join("\n"), container);
}
