/**
 * tests/regression/architecture-section.test.js  (Linux Security Lab)
 * Section 07, "Linux Architecture & History": the hardware-view commands (lscpu, free, lsblk, uptime) and their
 * consistency with the rest of the simulated machine; the new diagram builders; guards on the historical facts that
 * were checked against published histories; and the quiz questions' answers.
 */
import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { installDomShim, createContainer, outputText } from "../helpers/dom-shim.js";
import { installLocalStorageShim } from "../helpers/storage-shim.js";

installDomShim();
installLocalStorageShim();
const R = "../../assets/js/";
const { runCommand, resetTerminalState } = await import(R + "terminal.js");
const { MEMORY, BLOCK_DEVICES, DISK_USAGE, CPU_INFO, LOGIN_SESSIONS, PROCESSES, SERVICES, SYSTEM_INFO } = await import(R + "engine/sysinfo.js");
const { ARCHITECTURE_TOPICS } = await import(R + "learn-data-architecture.js");
const { ARCHITECTURE_TOPICS_AR } = await import(R + "learn-data-architecture.ar.js");
const { timelineDiagram, layersDiagram, flowDiagram } = await import(R + "learn-diagrams.js");
const { QUIZ_QUESTIONS } = await import(R + "quiz-data.js");

const run = (line) => { const c = createContainer(); runCommand(line, c); return outputText(c).split("\n").slice(1).join("\n"); };
beforeEach(() => resetTerminalState());

describe("hardware-view commands", () => {
  test("free: the columns add up (used + free + buff/cache = total), in KiB and with -h", () => {
    assert.equal(MEMORY.used + MEMORY.free + MEMORY.cache, MEMORY.total);
    const kib = run("free");
    assert.match(kib, /^\s+total\s+used\s+free\s+shared\s+buff\/cache\s+available$/m);
    assert.match(kib, new RegExp(`^Mem:\\s+${MEMORY.total}\\s+${MEMORY.used}\\s+${MEMORY.free}`, "m"));
    assert.match(run("free -h"), /^Mem:\s+7\.8Gi\s+2\.3Gi\s+3\.1Gi\s+14Mi\s+2\.4Gi\s+5\.1Gi$/m);
    assert.match(run("free -h"), /^Swap:\s+2\.0Gi\s+0B\s+2\.0Gi$/m);
  });
  test("-h means human-readable for df, du, free and ls (not 'help'); --help still shows help", () => {
    assert.match(run("df -h"), /^Filesystem\s+Size\s+Used/m);
    assert.match(run("du -sh /var/log"), /\/var\/log$/);
    assert.match(run("free --help"), /Memory and swap usage/);
    assert.doesNotMatch(run("free -h"), /Memory and swap usage/);
  });
  test("lsblk agrees with df -h: same disks, sizes and mount points", () => {
    const lsblk = run("lsblk");
    for (const d of DISK_USAGE.filter((x) => x.fs.startsWith("/dev/"))) {
      const dev = d.fs.replace("/dev/", "");
      const row = lsblk.split("\n").find((l) => l.includes(dev));
      assert.ok(row, dev);
      assert.ok(row.trim().endsWith(d.on), `${dev} mounted on ${d.on}`);
      assert.ok(row.includes(d.size.replace(/\.\d+/, "")) || row.includes(d.size), `${dev} size ${d.size}`);
    }
    assert.ok(BLOCK_DEVICES.every((d) => /^(disk|part)$/.test(d.type)));
  });
  test("lscpu describes a 2-CPU virtual machine, consistent with the rest of the machine", () => {
    const out = run("lscpu");
    assert.match(out, /^Architecture:\s+x86_64$/m);
    assert.match(out, /^CPU\(s\):\s+2$/m);
    assert.equal(CPU_INFO.find(([k]) => k === "Architecture:")[1], SYSTEM_INFO.machine);
  });
  test("uptime agrees with SYSTEM_INFO and with who", () => {
    const out = run("uptime");
    assert.match(out, /up 14 days, 3:52,\s+3 users,\s+load average: 0\.08, 0\.12, 0\.09/);
    assert.equal(LOGIN_SESSIONS.length, 3);
    assert.equal(run("who").split("\n").filter((l) => /pts\//.test(l)).length, LOGIN_SESSIONS.length);
  });
  test("the lessons' claims about the simulated machine are true", () => {
    const joined = ARCHITECTURE_TOPICS.map((t) => t.example + t.description).join(" ");
    assert.match(joined, /PID 1 is \/sbin\/init/);
    assert.equal(PROCESSES.find((p) => p.pid === 1).cmd, "/sbin/init");
    assert.equal(PROCESSES.find((p) => /nginx: master/.test(p.cmd)).user, "root");
    assert.ok(PROCESSES.filter((p) => /nginx: worker/.test(p.cmd)).every((p) => p.user === "www-data"));
    assert.equal(SERVICES.find((s) => s.name === "unattended-upgrades.service").active, "failed");
    assert.equal(DISK_USAGE.find((d) => d.on === "/var/log").usePct, "99%");
  });
});

describe("diagram builders", () => {
  test("timeline, layers and flow return safe inline SVG with all labels", () => {
    for (const svg of [timelineDiagram([["1969", "Unix"], ["1991", "Linux"]]), layersDiagram(["A", "B", "C"], 1), flowDiagram(["x", "y"])]) {
      assert.match(svg, /^<svg[\s\S]*<\/svg>$/);
      assert.doesNotMatch(svg, /<script|on\w+=|javascript:/i);
    }
    const t = timelineDiagram([["1969", "Unix"], ["1991", "Linux"]]);
    for (const w of ["1969", "Unix", "1991", "Linux"]) assert.ok(t.includes(w), w);
    assert.match(layersDiagram(["A", "B"], 1), /var\(--amber-500\)/);
  });
});

describe("the history is stated carefully", () => {
  const byId = Object.fromEntries(ARCHITECTURE_TOPICS.map((t) => [t.id, t]));
  const story = byId["arch-story"].description;
  test("key facts, checked against several published histories, are present and not contradicted", () => {
    for (const fact of ["1969", "Ken Thompson", "Dennis Ritchie", "Bell Labs", "Multics", "1983", "Richard Stallman", "GNU", "MINIX", "25 August 1991", "Linus Torvalds", "Helsinki", "comp.os.minix", "just a hobby", "September 1991", "1992", "March 1994"]) {
      assert.ok(story.includes(fact), `arch-story mentions ${fact}`);
    }
    assert.match(byId["arch-today"].description, /Ian Murdock in 1993/);
    assert.match(byId["arch-today"].description, /October 2004/);
    assert.match(byId["arch-today"].description, /announced in 2007 and shipped on phones in 2008/);
  });
  test("it says that sources differ on exact dates instead of faking certainty", () => {
    assert.match(byId["arch-story"].warnings.join(" "), /differ/);
  });
  test("it does not make unverifiable numeric claims (market shares, line counts, percentages)", () => {
    for (const t of ARCHITECTURE_TOPICS) assert.doesNotMatch(`${t.description} ${t.example}`, /\b\d+\s?%\s+of (the )?(servers|web|market|phones)|lines of code|million lines/i, t.id);
  });
  test("the Arabic keeps the same years and names", () => {
    const ar = ARCHITECTURE_TOPICS_AR["arch-story"].description;
    for (const f of ["1969", "1983", "1987", "1991", "1994", "25 أغسطس 1991", "MINIX", "GNU", "comp.os.minix"]) assert.ok(ar.includes(f), f);
  });
});

describe("quiz: architecture questions", () => {
  const qs = QUIZ_QUESTIONS.filter((q) => q.section === "architecture");
  test("16 questions with distinct options and the expected correct answers", () => {
    assert.equal(qs.length, 16);
    const correct = Object.fromEntries(qs.map((q) => [q.id, q.options[q.answer]]));
    assert.equal(correct[160], "Ken Thompson and Dennis Ritchie");
    assert.equal(correct[162], "comp.os.minix");
    assert.equal(correct[163], "The kernel");
    assert.equal(correct[168], "Firmware, bootloader, kernel, init, services");
    assert.equal(correct[175], "The Linux kernel");
    for (const q of qs) assert.equal(new Set(q.options).size, 4, `q${q.id}`);
  });
});
