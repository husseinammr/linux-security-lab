/**
 * tests/regression/scenarios-i18n.test.js
 * Keeps the Arabic overlay for the investigations honest, the same way
 * i18n-parity.test.js does for the older content: every scenario has an
 * entry, nothing is orphaned, and every array/keyed list lines up with
 * the English source (a hint index or check id must never drift).
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { installLocalStorageShim } from "../helpers/storage-shim.js";

installLocalStorageShim();
const R = "../../assets/js/";
const { INVESTIGATIONS } = await import(R + "scenarios-data.js");
const SCENARIOS = INVESTIGATIONS;
// New in Linux Security Lab and not yet translated (shown in English via the per-field fallback); remove an id here once it has an overlay.
const PENDING = new Set([]);
const TRANSLATED = INVESTIGATIONS.filter((s) => !PENDING.has(s.id));
const { SCENARIOS_AR } = await import(R + "scenarios-data.ar.js");
const { DICT } = await import(R + "i18n.js");

const AR = /[\u0600-\u06FF]/;
const keys = (o) => Object.keys(o || {}).sort();

describe("scenario Arabic overlay", () => {
  test("every scenario has an Arabic entry and there are no orphans", () => {
    assert.deepEqual(keys(SCENARIOS_AR), TRANSLATED.map((s) => s.id).sort());
    assert.deepEqual([...PENDING].filter((id) => id in SCENARIOS_AR), [], "translated now — remove from PENDING");
  });
  test("title, task/incident and objectives line up and are Arabic", () => {
    for (const s of TRANSLATED) {
      const a = SCENARIOS_AR[s.id];
      assert.ok(AR.test(a.title), `${s.id} title`);
      assert.equal(a.objectives.length, s.objectives.length, `${s.id} objectives`);
      assert.ok(a.objectives.every((o) => AR.test(o)), `${s.id} objectives are Arabic`);
      assert.ok(AR.test(s.kind === "investigation" ? a.incident : a.task), `${s.id} task/incident`);
    }
  });
  test("every check id is translated, with no extras", () => {
    for (const s of TRANSLATED) assert.deepEqual(keys(SCENARIOS_AR[s.id].checks), s.checks.map((c) => c.id).sort(), s.id);
  });
  test("investigations: evidence, diagnoses, per-phase hints and summary text line up", () => {
    for (const s of TRANSLATED) {
      const a = SCENARIOS_AR[s.id];
      assert.deepEqual(keys(a.evidence), s.evidence.map((e) => e.id).sort());
      assert.deepEqual(keys(a.diagnoses), s.diagnoses.map((d) => d.id).sort());
      for (const d of s.diagnoses) assert.ok(AR.test(a.diagnoses[d.id].label) && AR.test(a.diagnoses[d.id].why), d.id);
      assert.deepEqual(keys(a.hints), keys(s.hints));
      for (const p of Object.keys(s.hints)) assert.equal(a.hints[p].length, s.hints[p].length, p);
      assert.ok(AR.test(a.rootCause));
      assert.deepEqual(keys(a.qualityText), keys(s.qualityText));
    }
  });
  test("Arabic text keeps command names, paths and modes verbatim (so they can still be typed)", () => {
    const joined = SCENARIOS_AR.inv01.hints.remediation.join(" ");
    assert.ok(joined.includes("chmod 711"), "inv01 remediation hint keeps the chmod command");
    const must = {
      inv02: [["remediation", "sudo gpasswd -d monitoring sudo"], ["evidence", "id monitoring"]],
      inv03: [["remediation", "sudo systemctl stop redis-server"], ["remediation", "sudo systemctl disable redis-server"], ["evidence", "ss -tulpn"]],
      inv04: [["remediation", "sudo passwd -l deployer"], ["verification", "sudo passwd -S alice"], ["evidence", "sudo cat /srv/lab/inv04/logs/auth.log"]],
    };
    for (const [id, items] of Object.entries(must)) {
      for (const [phase, snippet] of items) assert.ok(SCENARIOS_AR[id].hints[phase].join(" ").includes(snippet), `${id} ${phase}: ${snippet}`);
    }
  });
});

describe("scenario UI strings", () => {
  test("all sc.* keys exist in both languages and none is empty", () => {
    const en = Object.keys(DICT.en).filter((k) => k.startsWith("sc."));
    assert.ok(en.length > 40);
    assert.deepEqual(en.filter((k) => !(k in DICT.ar)), []);
    assert.deepEqual(en.filter((k) => !String(DICT.ar[k]).trim()), []);
    assert.deepEqual(Object.keys(DICT.ar).filter((k) => k.startsWith("sc.") && !(k in DICT.en)), []);
  });
  test("every investigation phase has a label in both languages", () => {
    for (const p of ["briefing", "evidence", "diagnosis", "remediation", "verification", "complete"]) {
      assert.ok(DICT.en[`sc.phase.${p}`] && DICT.ar[`sc.phase.${p}`], p);
    }
  });
});
