/**
 * scenarios-data-security.js  (Linux Security Lab — new investigations)
 * Three investigations beyond the two inherited ones, one each for Users & Groups, Network Security and Log
 * Analysis. Same framework: Incident -> Evidence -> Diagnosis -> Remediation -> Verification, with the fix judged
 * by the SIMULATED state (group membership, listening sockets, locked accounts) and never by which command ran.
 * All hosts, accounts, addresses and log lines are synthetic (documentation address ranges).
 */
import { getUser, canSudo, isInGroup, formatId } from "./engine/users.js";
import { SOCKETS, SERVICES, PROCESSES } from "./engine/sysinfo.js";
import { groupLines, contentFor } from "./engine/filecontent.js";
import { FS_TREE, findNode } from "./filesystem.js";
import { file, dir, custom } from "./engine/scenario.js";

const B = (id) => `/srv/lab/${id}`;
const sudoOf = (ev) => ev.cmd === "sudo" && ev.args[0] === "-l";
const report = (def, { evidence, verified, result }, remediation) => ({
  evidence: def.evidence.filter((e) => evidence && evidence[e.id]).map((e) => ({ id: e.id, command: evidence[e.id].command, finding: evidence[e.id].finding })),
  remediation,
  verification: {
    probes: def.verification.map((p) => ({ id: p.id, command: verified && verified[p.id] ? verified[p.id].command : "" })),
    checks: result ? result.results.map((r) => ({ id: r.id, level: r.level, ok: r.ok })) : [],
  },
});

/* ============================== inv02 — Users & Groups ============================== */
const I2 = B("inv02");
const inv02 = {
  id: "inv02", kind: "investigation", section: "users",
  title: "Incident: a service account can use sudo",
  objectives: [
    "Read account and group data (id, /etc/group) to see what an account can really do",
    "Tell a privilege problem from a permission or shell problem",
    "Remove the unneeded privilege without breaking other accounts, and verify both sides",
  ],
  incident: "An access review flagged the monitoring account: it is the service account of the metrics agent and should only run that agent. Someone reported that it can use sudo. Policy: monitoring must NOT be able to use sudo or become root; the administrator 'user' (sudo) and 'alice' (adm, log reader) must keep exactly the access they have. You are logged in as user, who can use sudo.",
  startDir: I2,
  users: { monitoring: { groups: ["monitoring", "sudo"] } },
  build: () => [file("REVIEW.txt", "644", { content: ["Quarterly access review — draft", "Item 7: service accounts must not hold interactive privileges.", "Account to check: monitoring (metrics agent)."] })],
  evidence: [
    { id: "groups", required: true, label: "Look up the monitoring account's groups (id monitoring or groups monitoring)",
      matches: (ev) => (ev.cmd === "id" || ev.cmd === "groups") && ev.args.includes("monitoring"),
      finding: () => formatId("monitoring") },
    { id: "group-file", required: true, label: "Read the group database (cat or grep on /etc/group) and find who is in the sudo group",
      matches: (ev) => ["cat", "grep", "head", "tail"].includes(ev.cmd) && ev.paths.includes("/etc/group"),
      finding: () => groupLines().find((l) => l.startsWith("sudo:")) || "sudo group not found" },
    { id: "sudo-power", required: true, label: "Check what monitoring may do with sudo (su monitoring, then sudo -l)",
      matches: (ev) => ev.user === "monitoring" && sudoOf(ev),
      finding: () => (canSudo("monitoring") ? "monitoring may run (ALL : ALL) ALL — full root through sudo." : "monitoring may not run sudo.") },
  ],
  diagnoses: [
    { id: "sudo-member", correct: true, label: "monitoring was added to the sudo group, which grants full root through sudo",
      why: "Membership in the sudo group is what /etc/sudoers' %sudo rule keys on. A service account in that group can run anything as root.",
      explain: () => (isInGroup("monitoring", "sudo") ? `Correct. ${formatId("monitoring")} — the sudo group is the privilege.` : "Correct: monitoring is no longer in the sudo group.") },
    { id: "shell", label: "monitoring has a login shell it should not have",
      why: "Its shell is /usr/sbin/nologin, which refuses interactive logins; sudo works through su/sudo from another account, so the shell is not the cause.",
      explain: () => "Not the cause: monitoring's shell in /etc/passwd is /usr/sbin/nologin (it cannot log in directly). The privilege comes from its group membership, not its shell." },
    { id: "sudoers-file", label: "/etc/sudoers is writable by monitoring",
      why: "A writable sudoers file would be a different, worse problem — but /etc/sudoers is 440 root-owned.",
      explain: () => { const n = findNode(FS_TREE, "/etc/sudoers"); return n ? `Not the cause: /etc/sudoers is mode ${n.octal}, ${n.owner}:${n.group}; monitoring cannot write it.` : "/etc/sudoers is missing."; } },
    { id: "agent-root", label: "The metrics agent runs as root",
      why: "ps shows the agent runs as monitoring; the privilege problem is in the account's group, not in how the process starts.",
      explain: () => `Not the cause: ${PROCESSES.find((p) => p.cmd.includes("metrics-agent"))?.user || "monitoring"} is the user of the metrics-agent process.` },
  ],
  hints: {
    evidence: ["Start with identity: what groups does monitoring have? id monitoring.", "/etc/group lists every group and its members. cat /etc/group and look at the sudo line.", "To see the effect, become the account: su monitoring, then sudo -l."],
    diagnosis: ["Which group name is special on this system? What does it grant?", "Compare monitoring's groups with the groups of the other service account, www-data."],
    remediation: ["You need to remove one membership, not delete the account or its files.", "gpasswd -d <user> <group> removes a user from a group (it needs root).", "exit back to user first, then: sudo gpasswd -d monitoring sudo."],
    verification: ["Test as the account that must now be refused: su monitoring, then sudo -l.", "Then confirm the administrator is unaffected: exit, and run sudo -l as user."],
  },
  checks: [
    custom("not-sudo", "monitoring can no longer use sudo", () => ({ ok: !canSudo("monitoring"), detail: canSudo("monitoring") ? "monitoring is still in the sudo group." : "monitoring is not in the sudo group." })),
    custom("account-kept", "The monitoring account still exists with its own primary group", () => { const u = getUser("monitoring"); return { ok: !!u && u.groups[0] === "monitoring", detail: u ? "present" : "monitoring was removed" }; }),
    custom("admin-kept", "user still has sudo, alice is still in adm", () => ({ ok: canSudo("user") && isInGroup("alice", "adm"), detail: `user sudo: ${canSudo("user")}, alice in adm: ${isInGroup("alice", "adm")}` })),
    custom("no-new-privilege", "monitoring was not given another privileged group", () => { const g = getUser("monitoring")?.groups || []; return { ok: g.every((x) => x === "monitoring"), detail: `monitoring's groups: ${g.join(", ")}` }; }, { level: "advisory" }),
  ],
  verification: [
    { id: "denied", label: "As monitoring, run sudo -l and see that it is refused", matches: (ev) => ev.user === "monitoring" && sudoOf(ev) },
    { id: "allowed", label: "As user, run sudo -l and see that the administrator still has sudo", matches: (ev) => ev.user === "user" && sudoOf(ev) },
  ],
  verify: () => false,
  rootCause: "monitoring had been added to the sudo group, so the %sudo rule in /etc/sudoers let a service account run any command as root. Its shell, the sudoers file and the agent process were all fine.",
  qualityText: { minimal: "Your fix is minimal: one group membership removed, the account and everyone else's access untouched.", broad: "It works, but the account ended up with another privileged group; a service account should hold only its own group." },
  summarize: ({ result, attempts, hintsUsed, evidence, verified }) => ({
    finalState: formatId("monitoring"),
    quality: result && result.advisories.length ? "broad" : "minimal",
    wrongDiagnoses: attempts.filter((a) => !a.correct).length, hintsUsed,
    report: report(inv02, { evidence, verified, result }, formatId("monitoring")),
  }),
};

/* ============================== inv03 — Network Security ============================== */
const I3 = B("inv03");
const listensOn = (port) => SOCKETS.filter((s) => s.local.endsWith(`:${port}`));
const redisSvc = () => SERVICES.find((s) => s.name === "redis-server.service");
const isLsocket = (ev) => (ev.cmd === "ss" || ev.cmd === "netstat") && ev.args.some((a) => /^-[a-zA-Z]*l/.test(a));
const redisState = () => `redis-server.service: ${redisSvc()?.active} (${redisSvc()?.sub}), ${redisSvc()?.enabled ? "enabled" : "disabled"}; listeners on 6379: ${listensOn(6379).map((s) => s.local).join(", ") || "none"}`;
const inv03 = {
  id: "inv03", kind: "investigation", section: "network",
  title: "Incident: a cache is reachable from every network",
  objectives: [
    "Read ss output for the bind address, not only the port number",
    "Connect a listening socket to its process and its service",
    "Remove the exposure and verify with ss that nothing else changed",
  ],
  incident: "A port review of this host found a listener on 6379. Policy: the host's Redis cache is used by nobody else, has no authentication, and nothing except the host itself may reach it. nginx (80), SSH (22), the metrics agent and MySQL on loopback must keep working. You are logged in as user, who can use sudo.",
  startDir: I3,
  build: () => [file("PORT-REVIEW.txt", "644", { content: ["Port review — security-lab", "Open question: what is listening on 6379 and who can reach it?"] })],
  evidence: [
    { id: "listener", required: true, label: "List the listening sockets (ss -tulpn) and find the one on port 6379",
      matches: (ev) => isLsocket(ev),
      finding: () => { const s = listensOn(6379)[0]; return s ? `${s.proto} ${s.state} ${s.local} (${s.program}, pid ${s.pid})` : "nothing is listening on 6379"; } },
    { id: "process", required: true, label: "Find the process behind it (ps aux)",
      matches: (ev) => ev.cmd === "ps" && ev.args.some((a) => ["aux", "-ef", "-aux", "-e", "-A"].includes(a)),
      finding: () => { const p = PROCESSES.find((x) => x.cmd.includes("redis-server")); return p ? `pid ${p.pid} ${p.user}: ${p.cmd}` : "no redis-server process is running"; } },
    { id: "service", required: true, label: "Check the service that starts it (systemctl status redis-server)",
      matches: (ev) => ev.cmd === "systemctl" && ev.args[0] === "status" && /^redis-server/.test(ev.args[1] || ""),
      finding: () => redisState() },
  ],
  diagnoses: [
    { id: "exposed", correct: true, label: "redis-server is bound to 0.0.0.0, so every network the host is on can reach it — with no authentication",
      why: "0.0.0.0 means all interfaces. The cache is meant to be local-only, so the bind address (and the missing authentication) is the problem.",
      explain: () => (listensOn(6379).some((s) => s.local.startsWith("0.0.0.0:")) ? `Correct. ${listensOn(6379).map((s) => s.local).join(", ")} — all interfaces.` : "Correct: the 0.0.0.0:6379 listener is gone.") },
    { id: "wrong-port", label: "6379 is the wrong port for Redis",
      why: "6379 is Redis's default port. The port is not the problem; who can reach it is.",
      explain: () => "Not the cause: 6379 is Redis's standard port. Changing the port would not change who can reach it." },
    { id: "rogue", label: "Redis is a rogue process planted by an attacker",
      why: "It is the packaged redis-server.service, enabled and started at boot, not an unexplained process.",
      explain: () => `Not the cause: ${redisState()}. It is the installed service, not an unknown binary.` },
    { id: "mysql", label: "MySQL on 3306 is the exposed listener",
      why: "MySQL is bound to 127.0.0.1, which only local processes can reach.",
      explain: () => `Not the cause: ${listensOn(3306).map((s) => s.local).join(", ") || "no listener"} is the loopback address.` },
  ],
  hints: {
    evidence: ["ss -tulpn lists listeners. Read the Local Address column carefully: which are 0.0.0.0 and which are 127.0.0.1?", "Use sudo ss -tulpn to see the process name, and ps aux for the command line.", "systemctl status redis-server tells you whether the service starts at boot."],
    diagnosis: ["Compare the redis listener with the MySQL one. What differs?", "What does 0.0.0.0 mean for who can connect?"],
    remediation: ["You need the exposure gone now AND not back after a reboot: two different actions.", "systemctl stop acts now, systemctl disable acts at boot. Both need root.", "sudo systemctl stop redis-server, then sudo systemctl disable redis-server. (On a real system you could instead bind it to 127.0.0.1 and add authentication.)"],
    verification: ["Re-run the evidence: ss -tulpn should no longer show 0.0.0.0:6379, and the other services should still be listed.", "systemctl status redis-server should show inactive and disabled."],
  },
  checks: [
    custom("not-exposed", "Nothing listens on 0.0.0.0:6379 any more", () => { const bad = listensOn(6379).filter((s) => s.local.startsWith("0.0.0.0:") || s.local.startsWith("*:")); return { ok: !bad.length, detail: bad.length ? `still listening: ${bad.map((s) => s.local).join(", ")}` : "no wildcard listener on 6379" }; }),
    custom("stays-off", "redis-server will not start again at boot (disabled)", () => ({ ok: redisSvc() && !redisSvc().enabled, detail: `redis-server.service is ${redisSvc()?.enabled ? "still enabled" : "disabled"}` })),
    custom("web-up", "nginx still listens on 0.0.0.0:80", () => ({ ok: SOCKETS.some((s) => s.local === "0.0.0.0:80"), detail: "port 80" })),
    custom("ssh-up", "SSH still listens on 0.0.0.0:22", () => ({ ok: SOCKETS.some((s) => s.local === "0.0.0.0:22"), detail: "port 22" })),
    custom("db-local", "MySQL still listens on 127.0.0.1:3306", () => ({ ok: SOCKETS.some((s) => s.local === "127.0.0.1:3306"), detail: "port 3306" })),
    custom("metrics-up", "The metrics agent (9100) was not touched", () => ({ ok: SOCKETS.some((s) => s.local === "0.0.0.0:9100"), detail: "port 9100" }), { level: "advisory" }),
  ],
  verification: [
    { id: "listeners", label: "Run ss -tulpn again and confirm 6379 is gone and the other listeners remain", matches: (ev) => isLsocket(ev) },
    { id: "status", label: "Run systemctl status redis-server and confirm it is inactive and disabled", matches: (ev) => ev.cmd === "systemctl" && ev.args[0] === "status" && /^redis-server/.test(ev.args[1] || "") },
  ],
  verify: () => false,
  rootCause: "redis-server was listening on 0.0.0.0:6379 with no authentication, so any network the host is attached to could reach the cache. The port was the standard one, the process was the packaged service, and MySQL was correctly bound to loopback.",
  qualityText: { minimal: "Your fix is minimal: the service is stopped and disabled, and the other listeners are untouched.", broad: "It works, but a metrics listener was disturbed; contain only what the policy names." },
  summarize: ({ result, attempts, hintsUsed, evidence, verified }) => ({
    finalState: redisState(),
    quality: result && result.advisories.length ? "broad" : "minimal",
    wrongDiagnoses: attempts.filter((a) => !a.correct).length, hintsUsed,
    report: report(inv03, { evidence, verified, result }, redisState()),
  }),
};

/* ============================== inv04 — Log Analysis ============================== */
const I4 = B("inv04");
const LOG4 = `${I4}/logs/auth.log`;
const LOG4_LINES = [
  "Oct 11 01:58:12 security-lab sshd[3050]: Accepted publickey for alice from 198.51.100.9 port 55302 ssh2: RSA SHA256:3f9a...",
  "Oct 11 02:14:03 security-lab sshd[3101]: Failed password for deployer from 203.0.113.77 port 40112 ssh2",
  "Oct 11 02:14:06 security-lab sshd[3101]: Failed password for deployer from 203.0.113.77 port 40118 ssh2",
  "Oct 11 02:14:09 security-lab sshd[3101]: Failed password for deployer from 203.0.113.77 port 40124 ssh2",
  "Oct 11 02:14:13 security-lab sshd[3103]: Failed password for invalid user test from 203.0.113.77 port 40131 ssh2",
  "Oct 11 02:14:17 security-lab sshd[3103]: Failed password for invalid user ubuntu from 203.0.113.77 port 40139 ssh2",
  "Oct 11 02:14:23 security-lab sshd[3107]: Failed password for deployer from 203.0.113.77 port 40150 ssh2",
  "Oct 11 02:14:28 security-lab sshd[3107]: Failed password for deployer from 203.0.113.77 port 40163 ssh2",
  "Oct 11 02:14:41 security-lab sshd[3112]: Accepted password for deployer from 203.0.113.77 port 40190 ssh2",
  "Oct 11 02:14:41 security-lab systemd-logind[412]: New session 57 of user deployer.",
  "Oct 11 02:16:09 security-lab sudo: deployer : user NOT in sudoers ; TTY=pts/4 ; PWD=/opt/app ; USER=root ; COMMAND=/usr/bin/cat /etc/shadow",
  "Oct 11 02:20:44 security-lab sshd[3201]: Accepted publickey for alice from 198.51.100.9 port 55410 ssh2: RSA SHA256:3f9a...",
];
const isLog4Read = (ev) => ["cat", "grep", "head", "tail", "wc"].includes(ev.cmd) && ev.paths.includes(LOG4);
const grepsFor = (ev, re) => ev.cmd === "grep" && ev.paths.includes(LOG4) && ev.args.some((a) => re.test(a));
const deployerStatus = () => (getUser("deployer")?.locked ? "deployer: password LOCKED" : "deployer: password usable");
const inv04 = {
  id: "inv04", kind: "investigation", section: "logs",
  title: "Incident: failed logins, then a success",
  objectives: [
    "Read an authentication log for bursts of failures, sources and accounts",
    "Decide whether an attempt succeeded and what the account did next",
    "Contain the account without destroying evidence, and verify the result",
  ],
  incident: "An alert fired overnight for many failed SSH logins. Policy: deployer logs in only from the internal 198.51.100.0/24 range; the 203.0.113.0/24 range is outside. A copy of the authentication log for the night is in /srv/lab/inv04/logs/auth.log (mode 640, group adm — read it with sudo). Do not delete or edit it: it is evidence. You are logged in as user, who can use sudo.",
  startDir: I4,
  build: () => [dir("logs", "755", [file("auth.log", "640", { owner: "root", group: "adm", sensitive: true, content: LOG4_LINES })], { owner: "root", group: "adm" })],
  evidence: [
    { id: "failures", required: true, label: "Read the log and find the burst of failures (for example grep \"Failed password\" on the log)",
      matches: (ev) => isLog4Read(ev),
      finding: () => `${LOG4_LINES.filter((l) => /Failed password/.test(l)).length} Failed password lines, 02:14:03–02:14:28, all from 203.0.113.77, against deployer and the non-existent users test and ubuntu.` },
    { id: "success", required: true, label: "Find out whether any attempt succeeded (grep Accepted, or search for the source address)",
      matches: (ev) => grepsFor(ev, /accepted/i) || grepsFor(ev, /203\.0\.113\.77/) || (ev.cmd === "cat" && ev.paths.includes(LOG4)),
      finding: () => "02:14:41 Accepted password for deployer from 203.0.113.77 — 13 seconds after the last failure, from the same external address." },
    { id: "account", required: true, label: "Check the state of the deployer account (sudo passwd -S deployer)",
      matches: (ev) => ev.cmd === "passwd" && ev.args.includes("-S") && ev.args.includes("deployer"),
      finding: () => deployerStatus() },
  ],
  diagnoses: [
    { id: "guessed", correct: true, label: "deployer's password was guessed: a burst of failures from one external address ended in an accepted password login for deployer",
      why: "Seven failures in 25 seconds from 203.0.113.77, then Accepted password for deployer from the same address, then a sudo attempt on /etc/shadow: guessing succeeded and the intruder started to explore.",
      explain: () => `Correct. ${deployerStatus()}; the same address that failed seven times then logged in as deployer and tried sudo cat /etc/shadow.` },
    { id: "typo", label: "deployer mistyped their password a few times and then logged in",
      why: "A person mistyping would not come from the external range, would not try the invalid names test and ubuntu, and would not try to read /etc/shadow with sudo.",
      explain: () => "Not the cause: the failures included the non-existent users test and ubuntu, they came from an external address deployer never uses, and the success was followed by an attempt to read /etc/shadow." },
    { id: "stolen-key", label: "deployer's SSH private key was stolen",
      why: "The successful login line says Accepted password, not Accepted publickey; the key was not used.",
      explain: () => "Not the cause: the log says 'Accepted password for deployer', which is password authentication. A stolen key would read 'Accepted publickey'." },
    { id: "root", label: "The root account was compromised",
      why: "No Failed or Accepted line for root from 203.0.113.77 exists; the sudo attempt was refused ('user NOT in sudoers').",
      explain: () => "Not the cause: nothing in the log shows a root login from 203.0.113.77, and deployer's sudo attempt was refused." },
  ],
  hints: {
    evidence: ["The log is group adm: read it with sudo. Start wide: sudo cat /srv/lab/inv04/logs/auth.log.", "Count and locate failures: sudo grep \"Failed password\" /srv/lab/inv04/logs/auth.log. Note the addresses and account names.", "Did anything succeed? sudo grep Accepted <log>. Then check the account: sudo passwd -S deployer."],
    diagnosis: ["Compare the source address of the failures with the source of the Accepted line.", "Which authentication method does the Accepted line show, and what did the account do afterwards?"],
    remediation: ["Contain the account without deleting it or the log. Which command blocks password logins for an account?", "sudo passwd -l deployer locks the password. It needs root.", "Do not touch alice or the log file: only deployer is in scope."],
    verification: ["Check the result with the same command you used as evidence: sudo passwd -S deployer should now show L.", "Check an unrelated account is unaffected: sudo passwd -S alice."],
  },
  checks: [
    custom("deployer-locked", "deployer's password is locked", () => ({ ok: !!getUser("deployer")?.locked, detail: deployerStatus() })),
    custom("others-ok", "alice, user and root were not locked", () => ({ ok: ["alice", "user", "root"].every((n) => !getUser(n)?.locked), detail: "alice, user and root must stay usable" })),
    custom("log-kept", "The log file is still there and unchanged", () => { const n = findNode(FS_TREE, LOG4); const c = n && contentFor(n); return { ok: !!c && c.length === LOG4_LINES.length && c.join("\n") === LOG4_LINES.join("\n"), detail: n ? "log content differs from the original" : "the log was removed" }; }),
    custom("account-kept", "The deployer account still exists", () => ({ ok: !!getUser("deployer"), detail: "deployer must be locked, not deleted, to keep its files for the investigation" })),
  ],
  verification: [
    { id: "status", label: "Run sudo passwd -S deployer again and confirm it now shows L", matches: (ev) => ev.cmd === "passwd" && ev.args.includes("-S") && ev.args.includes("deployer") },
    { id: "unrelated", label: "Run sudo passwd -S alice and confirm an unrelated account is unaffected", matches: (ev) => ev.cmd === "passwd" && ev.args.includes("-S") && ev.args.includes("alice") },
  ],
  verify: () => false,
  rootCause: "A password-guessing run from the external address 203.0.113.77 succeeded against deployer at 02:14:41; the intruder then tried sudo to read /etc/shadow. Locking the password stops further password logins; a complete response also rotates the password and reviews authorized_keys and the open session.",
  qualityText: { minimal: "Your fix is minimal: only the compromised account is locked, and the log and every other account are untouched.", broad: "It works, but more than the compromised account was affected." },
  summarize: ({ result, attempts, hintsUsed, evidence, verified }) => ({
    finalState: deployerStatus(),
    quality: result && result.advisories.length ? "broad" : "minimal",
    wrongDiagnoses: attempts.filter((a) => !a.correct).length, hintsUsed,
    report: report(inv04, { evidence, verified, result }, deployerStatus()),
  }),
};

export const SECURITY_INVESTIGATIONS = [inv02, inv03, inv04];
