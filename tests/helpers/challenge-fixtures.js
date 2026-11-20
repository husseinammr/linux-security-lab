/**
 * tests/helpers/challenge-fixtures.js
 * Four single-objective "challenge" scenarios (tc01-tc04) that shipped in the original Linux Permission Lab
 * (v2.12) as the "Hands-on Scenarios". Linux Security Lab no longer ships them as a product feature (the
 * Security Challenges feature was removed), but they remain the best fixtures for the access-check
 * helpers and the challenge-session engine in engine/scenario.js, so the engine tests keep using them.
 * They are TEST FIXTURES ONLY: nothing in assets/ imports this file.
 */
import { FS_TREE, findNode } from "../../assets/js/filesystem.js";
import { checkTraverse, checkPathAccess, explainAccess, explainTraverse, classify, getUser, formatId, modeTriads } from "../../assets/js/engine/users.js";
import {
  file, dir, canAccess, cannotAccess, othersCannot, modeWithin, accessWithin, noWorldWriteUnder, custom,
} from "../../assets/js/engine/scenario.js";

const B = (id) => `/srv/lab/${id}`;

/* ------------------------------------------------------------------ tc01 */
const TC01 = B("tc01");
const tc01 = {
  id: "tc01", kind: "challenge", xp: 75,
  title: "Lock down a leaked deploy key",
  objectives: [
    "Read a file's mode and owner from ls -l and stat",
    "Explain why the group and others bits matter for a credential",
    "Apply the smallest change that protects the key without breaking its owner",
  ],
  task: "The private key deploy_key in /srv/lab/tc01 can be read by every account on the machine. Make it usable by its owner (user) only: no other account may read or modify it.",
  build: () => [
    file("deploy_key", "644", { sensitive: true, note: "Private deploy key." }),
    file("deploy_key.pub", "644", { note: "Matching public key." }),
  ],
  checks: [
    canAccess("owner-reads", "user", `${TC01}/deploy_key`, "r", { label: "The owner (user) can still read the key" }),
    othersCannot("others-read", `${TC01}/deploy_key`, "r", ["user"], { label: "No other account can read the key" }),
    othersCannot("others-write", `${TC01}/deploy_key`, "w", ["user"], { label: "No other account can modify the key" }),
    noWorldWriteUnder("no-world-write", TC01, { label: "Nothing in the lab directory is world-writable" }),
  ],
  hints: [
    "Run ls -l in the directory and compare the mode of deploy_key with the mode of deploy_key.pub.",
    "A private key only ever needs to be used by its owner. Which of the three octal digits (owner, group, others) should be zero?",
    "Owner read+write is 6; nothing for group and others is 00. Try chmod 600 deploy_key (400 also works if you never rewrite the key), then run ls -l again.",
  ],
  completion: "The group and others bits decide what every OTHER account can do. A private key is a credential, so only its owner needs access: removing every group/other bit is the least-privilege fix. 600 (or 400) does that without breaking the owner — 644 leaks the key and 777 would also let anyone replace it.",
};

/* ------------------------------------------------------------------ tc02 */
const TC02 = B("tc02");
const tc02 = {
  id: "tc02", kind: "challenge", xp: 75,
  title: "Listing works, reading doesn't",
  objectives: [
    "Tell read (r) from search/execute (x) on a directory",
    "Follow a 'Permission denied' to the exact directory that caused it",
    "Grant the missing bit without making anything writable",
  ],
  task: "Published reports live in /srv/lab/tc02/reports. As alice (su alice), ls /srv/lab/tc02/reports works but cat /srv/lab/tc02/reports/q3.txt is denied. Make q3.txt readable for alice while keeping the directory and file non-writable for everyone except the owner.",
  build: () => [
    dir("reports", "744", [
      file("q3.txt", "644", { note: "Quarterly report." }),
    ]),
  ],
  checks: [
    canAccess("alice-reads", "alice", `${TC02}/reports/q3.txt`, "r", { label: "alice can read q3.txt" }),
    othersCannot("dir-write", `${TC02}/reports`, "w", ["user"], { label: "Nobody except the owner can write to the reports directory" }),
    othersCannot("file-write", `${TC02}/reports/q3.txt`, "w", ["user"], { label: "Nobody except the owner can modify q3.txt" }),
    noWorldWriteUnder("no-world-write", TC02, { label: "Nothing in the lab directory is world-writable" }),
  ],
  hints: [
    "Switch to alice with su alice and run both commands. Read the hint line under the error: which directory does it name?",
    "On a directory, r lets you list the names inside; x (search) lets you pass through it to reach anything beneath. Compare the 'others' digit of reports with what alice needs.",
    "The others digit of reports is 4 (r--) — it needs the x bit too. As the owner, chmod 755 reports works; chmod 745 is the smallest change that adds only the missing bit.",
  ],
  completion: "Reaching a file needs x on every directory above it; r on a directory only lets you list names. Here the directory had r but no x, so ls worked while cat failed. Adding the missing x (not w) fixes it — chmod 777 would also 'work' but lets every account add, replace and delete reports.",
};

/* ------------------------------------------------------------------ tc03 */
const TC03 = B("tc03");
const tc03 = {
  id: "tc03", kind: "challenge", xp: 100,
  title: "The wrong group on a shared report",
  objectives: [
    "Compare an account's group memberships (id, groups) with a file's owning group",
    "Choose between changing the group and granting one named ACL entry",
    "Avoid widening access to accounts that don't need it",
  ],
  task: "alice needs read-only access to /srv/lab/tc03/report.txt. It is currently owned by user:user with mode 640. monitoring and www-data must stay locked out, and nobody but the owner may write to it.",
  build: () => [
    file("report.txt", "640", { sensitive: true, note: "Internal report." }),
  ],
  checks: [
    canAccess("alice-reads", "alice", `${TC03}/report.txt`, "r", { label: "alice can read report.txt" }),
    cannotAccess("alice-no-write", "alice", `${TC03}/report.txt`, "w", { label: "alice cannot modify report.txt (read-only is enough)" }),
    cannotAccess("monitoring-denied", "monitoring", `${TC03}/report.txt`, "r", { label: "monitoring still cannot read it" }),
    cannotAccess("www-denied", "www-data", `${TC03}/report.txt`, "r", { label: "www-data still cannot read it" }),
    othersCannot("others-write", `${TC03}/report.txt`, "w", ["user"], { label: "Nobody except the owner can write to it" }),
  ],
  hints: [
    "Run id alice and ls -l report.txt. Which group is the file in, and is alice a member of it?",
    "alice is not in the file's group, so the 'others' bits (---) apply to her. There are two least-privilege options: move the file to a group alice IS in, or give only alice an extra entry.",
    "Either sudo chgrp adm report.txt (alice is in adm; the mode 640 then gives the group read), or setfacl -m u:alice:r-- report.txt. Avoid chmod 644 — it also opens the file to monitoring and www-data.",
  ],
  completion: "Access is decided by the FIRST matching class: owner, named ACL user, group, then others. alice matched none of the first three. You can fix that by changing the file's group to one she belongs to (needs sudo, because 'user' isn't in adm) or by adding a single named ACL entry — both grant exactly one account read access. Widening 'others' would have fixed alice but exposed the report to everyone.",
};

/* ------------------------------------------------------------------ tc04 */
const TC04 = B("tc04");
const tc04 = {
  id: "tc04", kind: "challenge", xp: 125,
  title: "ACL on the file, but still denied",
  objectives: [
    "Read getfacl output on a file and on its directory",
    "Understand that a file ACL is not enough without search access on every parent directory",
    "Add a named ACL entry with only the bit that is missing",
  ],
  task: "The monitoring account was given read access to /srv/lab/tc04/conf/app.yml with an ACL entry, yet su monitoring then cat /srv/lab/tc04/conf/app.yml still fails. Fix it for monitoring only — nobody else may gain access, and monitoring must not be able to write or to list the directory.",
  build: () => [
    dir("conf", "750", [
      file("app.yml", "640", { sensitive: true, acl: [{ type: "user", id: "monitoring", perms: "r--" }], note: "App configuration." }),
      file("secrets.yml", "600", { sensitive: true, note: "Credentials." }),
    ]),
  ],
  checks: [
    canAccess("monitoring-reads", "monitoring", `${TC04}/conf/app.yml`, "r", { label: "monitoring can read app.yml" }),
    cannotAccess("monitoring-no-write", "monitoring", `${TC04}/conf/app.yml`, "w", { label: "monitoring cannot modify app.yml" }),
    cannotAccess("www-denied", "www-data", `${TC04}/conf/app.yml`, "r", { label: "www-data still cannot read app.yml" }),
    cannotAccess("secrets-denied", "monitoring", `${TC04}/conf/secrets.yml`, "r", { label: "monitoring still cannot read secrets.yml" }),
    noWorldWriteUnder("no-world-write", TC04, { label: "Nothing in the lab directory is world-writable" }),
    cannotAccess("no-dir-write", "monitoring", `${TC04}/conf`, "w", { label: "monitoring cannot create or delete files in the directory" }),
    cannotAccess("no-listing", "monitoring", `${TC04}/conf`, "r", { level: "advisory", label: "monitoring can reach the file but not list the directory" }),
    modeWithin("dir-not-widened", `${TC04}/conf`, "750", { level: "advisory", label: "The directory's own mode was not widened (still 750 or tighter)" }),
  ],
  hints: [
    "As monitoring, run cat /srv/lab/tc04/conf/app.yml and read the hint line: does it name the file or a directory?",
    "A file ACL only answers 'what may this account do to the file'. Reaching it needs x on every directory above. Run getfacl on both the file and /srv/lab/tc04/conf and compare.",
    "monitoring has an entry on the file but none on the directory. exit back to user, then grant only the missing bit to only that account: setfacl -m u:monitoring:--x /srv/lab/tc04/conf",
  ],
  completion: "Path access is the conjunction of search (x) on every directory above AND the right bit on the file itself. The file ACL was correct; the directory gave monitoring nothing, so traversal stopped there. A named ACL entry with --x on the directory fixes exactly that — chmod o+x on the directory would also work but lets every account traverse it, which is more permissive than necessary.",
};


export const CHALLENGE_SCENARIOS = [tc01, tc02, tc03, tc04];
