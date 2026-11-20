/**
 * engine/sysstate.js  (Linux Security Lab)
 * Snapshot / restore of the small pieces of system state that the new account, service and network commands can
 * change: group memberships and locked accounts (USERS), systemd units (SERVICES), running processes (PROCESSES)
 * and listening sockets (SOCKETS). The investigation engine takes a snapshot when a scenario starts and restores it
 * when the scenario is reset or left, so every investigation begins from the same state. Pure and DOM-free.
 */
import { USERS } from "./users.js";
import { SERVICES, PROCESSES, SOCKETS } from "./sysinfo.js";

const clone = (x) => JSON.parse(JSON.stringify(x));

export function snapshotSystem() {
  return {
    users: Object.fromEntries(Object.entries(USERS).map(([n, u]) => [n, { groups: [...u.groups], locked: !!u.locked }])),
    services: clone(SERVICES), processes: clone(PROCESSES), sockets: clone(SOCKETS),
  };
}

function replaceContents(target, source) { target.splice(0, target.length, ...clone(source)); }

export function restoreSystem(snap) {
  for (const [n, u] of Object.entries(snap.users)) { if (USERS[n]) { USERS[n].groups = [...u.groups]; USERS[n].locked = u.locked; } }
  replaceContents(SERVICES, snap.services); replaceContents(PROCESSES, snap.processes); replaceContents(SOCKETS, snap.sockets);
}

/** The state as it was when this module first loaded (the pristine machine). */
const BASELINE = snapshotSystem();
export const resetSystem = () => restoreSystem(BASELINE);
export const baselineSystem = () => clone(BASELINE);
