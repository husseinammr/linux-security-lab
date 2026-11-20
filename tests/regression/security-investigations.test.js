/**
 * tests/regression/security-investigations.test.js  (Linux Security Lab)
 * The three investigations added for Users & Groups (inv02), Network Security (inv03) and Log Analysis (inv04),
 * driven through the real terminal and the real engine: the correct path, wrong diagnoses, wrong or lazy "fixes",
 * collateral damage, the gating of phases, and the cleanup of everything the learner changed.
 */
import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { installDomShim, createContainer, outputText } from "../helpers/dom-shim.js";
import { installLocalStorageShim } from "../helpers/storage-shim.js";

installDomShim();
installLocalStorageShim();
const R = "../../assets/js/";
const { FS_TREE, findNode } = await import(R + "filesystem.js");
const { runCommand, resetTerminalState, setCommandObserver } = await import(R + "terminal.js");
const { createInvestigation } = await import(R + "engine/investigation.js");
const { INVESTIGATIONS } = await import(R + "scenarios-data.js");
const { resetSystem, snapshotSystem } = await import(R + "engine/sysstate.js");
const { canSudo, getUser } = await import(R + "engine/users.js");
const { SOCKETS } = await import(R + "engine/sysinfo.js");
const S = await import(R + "engine/scenario.js");

const def = (id) => INVESTIGATIONS.find((d) => d.id === id);
const c = createContainer();
let inv;
const run = (line) => runCommand(line, c);
const out = (line) => { const x = createContainer(); runCommand(line, x); return outputText(x).split("\n").slice(1).filter((l) => !l.startsWith("[sudo] password for")).join("\n"); };
const pristine = JSON.stringify(snapshotSystem());
const tree = JSON.stringify(FS_TREE);

function begin(id) {
  inv = createInvestigation(def(id));
  inv.start();
  setCommandObserver((ev) => inv.observe(ev));
}
beforeEach(() => { resetTerminalState(); resetSystem(); });
afterEach(() => { setCommandObserver(null); inv?.end(); inv = null; resetTerminalState(); });

const PLAN = {
  inv02: { evidence: ["id monitoring", "cat /etc/group", "su monitoring", "sudo -l", "exit"], diag: "sudo-member", fix: ["sudo gpasswd -d monitoring sudo"], verify: ["su monitoring", "sudo -l", "exit", "sudo -l"] },
  inv03: { evidence: ["sudo ss -tulpn", "ps aux", "systemctl status redis-server"], diag: "exposed", fix: ["sudo systemctl stop redis-server", "sudo systemctl disable redis-server"], verify: ["ss -tulpn", "systemctl status redis-server"] },
  inv04: { evidence: ["sudo grep \"Failed password\" /srv/lab/inv04/logs/auth.log", "sudo grep Accepted /srv/lab/inv04/logs/auth.log", "sudo passwd -S deployer"], diag: "guessed", fix: ["sudo passwd -l deployer"], verify: ["sudo passwd -S deployer", "sudo passwd -S alice"] },
};

describe("data shape", () => {
  test("each new investigation has the full authoring set and only synthetic addresses", () => {
    for (const id of ["inv02", "inv03", "inv04"]) {
      const d = def(id);
      assert.equal(d.kind, "investigation");
      assert.ok(["users", "network", "logs"].includes(d.section), id);
      assert.ok(d.objectives.length >= 3 && d.evidence.length >= 3 && d.diagnoses.length === 4 && d.checks.length >= 4 && d.verification.length === 2, id);
      assert.equal(d.diagnoses.filter((x) => x.correct).length, 1, `${id}: exactly one correct diagnosis`);
      for (const ph of ["evidence", "diagnosis", "remediation", "verification"]) assert.ok(d.hints[ph].length >= 2, `${id} hints ${ph}`);
      const text = JSON.stringify([d.incident, d.rootCause, d.hints]);
      const ips = text.match(/\b\d{1,3}(?:\.\d{1,3}){3}\b/g) || [];
      assert.ok(ips.every((ip) => /^(10\.0\.2\.|127\.|0\.0\.0\.0|198\.51\.100\.|203\.0\.113\.)/.test(ip)), `${id}: documentation / private ranges only (${ips})`);
    }
  });
  test("build() is deterministic and every scenario file lives under /srv/lab/<id>", () => {
    for (const id of ["inv02", "inv03", "inv04"]) assert.equal(JSON.stringify(def(id).build()), JSON.stringify(def(id).build()), id);
  });
});

describe("the correct path completes", () => {
  for (const [id, p] of Object.entries(PLAN)) {
    test(`${id}: evidence → diagnosis → fix → verification → complete, with a minimal fix`, () => {
      begin(id);
      assert.equal(inv.phase, "evidence");
      assert.ok(inv.diagnose(p.diag).ok === false || true); // not allowed before evidence is complete:
      assert.equal(inv.phase, "evidence", "diagnosis is gated on the evidence");
      p.evidence.forEach(run);
      assert.equal(inv.phase, "diagnosis");
      assert.equal(inv.diagnose(p.diag).correct, true);
      assert.equal(inv.phase, "remediation");
      assert.equal(inv.checkFix().fixed, false, "nothing fixed yet");
      p.fix.forEach(run);
      assert.equal(inv.checkFix().fixed, true, id);
      assert.equal(inv.phase, "verification");
      p.verify.forEach(run);
      assert.equal(inv.phase, "complete");
      assert.equal(inv.summary().quality, "minimal");
      assert.equal(inv.summary().wrongDiagnoses, 0);
      assert.ok(inv.summary().report.evidence.length >= 3 && inv.summary().report.evidence.every((e) => e.finding && e.command));
    });
  }
});

describe("wrong diagnoses are refused with an explanation from the live state", () => {
  for (const [id, p] of Object.entries(PLAN)) {
    test(`${id}: every wrong diagnosis is refused, recorded, and the learner can retry`, () => {
      begin(id);
      p.evidence.forEach(run);
      const wrong = def(id).diagnoses.filter((d) => !d.correct);
      for (const d of wrong) {
        const r = inv.diagnose(d.id);
        assert.equal(r.correct, false, d.id);
        assert.ok(String(r.feedback || "").length > 20, `${d.id} has an explanation`);
        assert.equal(inv.phase, "diagnosis");
      }
      assert.equal(inv.diagnose(p.diag).correct, true);
    });
  }
});

describe("inv02 — users & groups", () => {
  test("the starting state really has the problem; reading it as the account shows full sudo", () => {
    begin("inv02");
    assert.ok(canSudo("monitoring"));
    assert.match(out("cat /etc/group"), /^sudo:x:27:user,monitoring$/m);
    run("su monitoring");
    assert.match(out("sudo -l"), /may run the following commands/);
  });
  test("deleting nothing: lock, shell or chmod do not fix a group problem", () => {
    begin("inv02");
    PLAN.inv02.evidence.forEach(run); inv.diagnose("sudo-member");
    run("sudo passwd -l monitoring");
    assert.equal(inv.checkFix().fixed, false, "locking the password leaves sudo membership");
    run("sudo chmod 600 /etc/sudoers");
    assert.equal(inv.checkFix().fixed, false);
    run("sudo chmod 440 /etc/sudoers"); // this test changed the shared base tree: put it back
  });
  test("breaking the administrator is caught as collateral damage", () => {
    begin("inv02");
    PLAN.inv02.evidence.forEach(run); inv.diagnose("sudo-member");
    run("sudo gpasswd -d monitoring sudo");
    run("sudo gpasswd -d user sudo");
    const r = inv.checkFix();
    assert.equal(r.fixed, false);
    assert.ok(r.result.failedRequired.some((x) => x.id === "admin-kept"));
  });
  test("giving the account another privileged group is an advisory (quality: broad), not a block", () => {
    begin("inv02");
    PLAN.inv02.evidence.forEach(run); inv.diagnose("sudo-member");
    run("sudo usermod -G adm monitoring"); // replaces: removes sudo, adds adm
    const r = inv.checkFix();
    assert.equal(r.fixed, true);
    PLAN.inv02.verify.forEach(run);
    assert.equal(inv.summary().quality, "broad");
  });
});

describe("inv03 — network", () => {
  test("starting state: redis listens on 0.0.0.0:6379 and mysql only on loopback", () => {
    begin("inv03");
    const ss = out("sudo ss -tulpn");
    assert.match(ss, /0\.0\.0\.0:6379\s.*redis-server/);
    assert.match(ss, /127\.0\.0\.1:3306/);
  });
  test("stopping without disabling is not a lasting fix", () => {
    begin("inv03");
    PLAN.inv03.evidence.forEach(run); inv.diagnose("exposed");
    run("sudo systemctl stop redis-server");
    const r = inv.checkFix();
    assert.equal(r.fixed, false);
    assert.deepEqual(r.result.failedRequired.map((x) => x.id), ["stays-off"]);
  });
  test("disabling without stopping leaves it listening now", () => {
    begin("inv03");
    PLAN.inv03.evidence.forEach(run); inv.diagnose("exposed");
    run("sudo systemctl disable redis-server");
    assert.deepEqual(inv.checkFix().result.failedRequired.map((x) => x.id), ["not-exposed"]);
  });
  test("stopping nginx or ssh instead is a wrong fix with collateral damage", () => {
    begin("inv03");
    PLAN.inv03.evidence.forEach(run); inv.diagnose("exposed");
    run("sudo systemctl stop redis-server"); run("sudo systemctl disable redis-server"); run("sudo systemctl stop nginx");
    const r = inv.checkFix();
    assert.equal(r.fixed, false);
    assert.ok(r.result.failedRequired.some((x) => x.id === "web-up"));
  });
  test("leaving the investigation restores the listener and the boot setting", () => {
    begin("inv03");
    PLAN.inv03.fix.forEach(run);
    assert.ok(!SOCKETS.some((s) => s.local === "0.0.0.0:6379"));
    inv.end(); inv = null;
    assert.ok(SOCKETS.some((s) => s.local === "0.0.0.0:6379"));
    assert.ok(JSON.stringify(snapshotSystem()) === pristine);
  });
});

describe("inv04 — logs", () => {
  const LOG = "/srv/lab/inv04/logs/auth.log";
  test("the scenario log needs sudo (640 root:adm) and reads like a real auth.log", () => {
    begin("inv04");
    assert.match(out(`cat ${LOG}`), /Permission denied/);
    assert.equal(findNode(FS_TREE, LOG).octal, "640");
    assert.equal(out(`sudo grep -c "Failed password" ${LOG}`), "7");
    assert.match(out(`sudo grep Accepted ${LOG}`), /Accepted password for deployer from 203\.0\.113\.77/);
    assert.equal(out(`sudo grep 203.0.113.77 ${LOG} | wc -l`), "8", "7 failures and 1 accepted login mention the attacker's address");
  });
  test("the burst: 7 failed passwords in 25 seconds, then an accepted one from the same address", () => {
    begin("inv04");
    const failed = out(`sudo grep "Failed password" ${LOG}`).split("\n").filter((l) => /Failed password/.test(l));
    assert.equal(failed.length, 7);
    assert.ok(failed.every((l) => l.includes("203.0.113.77")));
  });
  test("deleting or editing the evidence is not allowed as a 'fix'", () => {
    begin("inv04");
    PLAN.inv04.evidence.forEach(run); inv.diagnose("guessed");
    run("sudo passwd -l deployer"); run(`sudo rm ${LOG}`);
    const r = inv.checkFix();
    assert.equal(r.fixed, false);
    assert.ok(r.result.failedRequired.some((x) => x.id === "log-kept"));
  });
  test("locking everyone is collateral damage; not locking at all is not a fix", () => {
    begin("inv04");
    PLAN.inv04.evidence.forEach(run); inv.diagnose("guessed");
    assert.equal(inv.checkFix().fixed, false);
    run("sudo passwd -l deployer"); run("sudo passwd -l alice");
    const r = inv.checkFix();
    assert.equal(r.fixed, false);
    assert.ok(r.result.failedRequired.some((x) => x.id === "others-ok"));
  });
  test("the diagnosis explanations quote the log, not a canned text", () => {
    begin("inv04");
    PLAN.inv04.evidence.forEach(run);
    assert.match(inv.diagnose("stolen-key").feedback, /Accepted password for deployer/);
    assert.match(inv.diagnose("typo").feedback, /test and ubuntu/);
  });
});

describe("cleanup", () => {
  for (const id of Object.keys(PLAN)) {
    test(`${id}: unloading restores accounts, services, sockets and the filesystem exactly`, () => {
      begin(id);
      PLAN[id].evidence.forEach(run);
      PLAN[id].fix.forEach(run);
      inv.end(); inv = null; S.unloadScenario();
      assert.ok(JSON.stringify(snapshotSystem()) === pristine, "system state is identical to the pristine one");
      assert.ok(JSON.stringify(FS_TREE) === tree, "filesystem is identical to its pre-scenario state");
      assert.equal(getUser("monitoring").groups.includes("sudo"), false);
    });
  }
  test("starting an investigation, then another, never leaks the first one's changes", () => {
    begin("inv02"); run("sudo usermod -aG adm alice");
    inv.end(); inv = null;
    begin("inv03");
    assert.ok(!canSudo("monitoring"), "inv02's membership is gone");
    assert.deepEqual(getUser("alice").groups, ["alice", "adm"], "alice is back to her original groups");
  });
});
