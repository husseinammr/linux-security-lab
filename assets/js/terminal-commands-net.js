/**
 * terminal-commands-net.js  (Linux Security Lab)
 * Network inspection commands for the Network Security section: ip (addr / link / route), hostname and a
 * simulated ping. Nothing here touches a real network: the data is fixed fixtures in engine/sysinfo.js and
 * ping only "reaches" the hosts listed there.
 */
import { escapeHTML } from "./engine/safe-html.js";
import { SYSTEM_INFO, NET_INTERFACES, NET_ROUTES, PING_HOSTS } from "./engine/sysinfo.js";
import { printLine } from "./terminal-helpers.js";

const FLAG_WORDS = { a: "addr", addr: "addr", address: "addr", l: "link", link: "link", r: "route", route: "route" };

function ipAddrLines(brief) {
  if (brief) return NET_INTERFACES.map((i) => `${i.name.padEnd(8)} ${i.state.padEnd(8)} ${i.addrs.join(" ")}`);
  const out = [];
  for (const i of NET_INTERFACES) {
    out.push(`${i.index}: ${i.name}: <${i.flags}> mtu ${i.mtu} qdisc ${i.name === "lo" ? "noqueue" : "fq_codel"} state ${i.state} group default qlen 1000`);
    out.push(`    link/${i.name === "lo" ? "loopback" : "ether"} ${i.mac} brd ${i.name === "lo" ? "00:00:00:00:00:00" : "ff:ff:ff:ff:ff:ff"}`);
    for (const a of i.addrs) {
      const v6 = a.includes(":");
      const scope = a.startsWith("127.") || a === "::1/128" ? "host" : v6 ? "link" : "global dynamic";
      out.push(`    ${v6 ? "inet6" : "inet"} ${a}${!v6 && !a.startsWith("127.") ? " brd 10.0.2.255" : ""} scope ${scope}${v6 ? "" : ` ${i.name}`}`);
      out.push("       valid_lft forever preferred_lft forever");
    }
  }
  return out;
}

export function handleIp(args, container) {
  const brief = args.includes("-br") || args.includes("-brief");
  const rest = args.filter((a) => !a.startsWith("-"));
  const obj = FLAG_WORDS[rest[0] || "addr"];
  if (!obj) {
    printLine(`<span class="t-err">Object "${escapeHTML(rest[0])}" is unknown, try "ip addr", "ip link" or "ip route" (the others are not simulated).</span>`, container);
    return;
  }
  if (obj === "route") { printLine(NET_ROUTES.map(escapeHTML).join("\n"), container); return; }
  if (obj === "link") {
    const lines = NET_INTERFACES.flatMap((i) => [
      `${i.index}: ${i.name}: <${i.flags}> mtu ${i.mtu} qdisc ${i.name === "lo" ? "noqueue" : "fq_codel"} state ${i.state} mode DEFAULT group default qlen 1000`,
      `    link/${i.name === "lo" ? "loopback" : "ether"} ${i.mac} brd ${i.name === "lo" ? "00:00:00:00:00:00" : "ff:ff:ff:ff:ff:ff"}`,
    ]);
    printLine(lines.map(escapeHTML).join("\n"), container);
    return;
  }
  printLine(ipAddrLines(brief).map(escapeHTML).join("\n"), container);
}

export function handleHostname(args, container) {
  if (args.includes("-I")) { printLine("10.0.2.15", container); return; }
  if (args.includes("-i")) { printLine("127.0.1.1", container); return; }
  if (args.some((a) => !a.startsWith("-"))) { printLine('<span class="t-err">hostname: you must be root to change the host name (and this simulation never does)</span>', container); return; }
  printLine(SYSTEM_INFO.hostname, container);
}

export function handlePing(args, container) {
  let count = 4;
  const rest = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "-c") { count = Number(args[i + 1]); i += 1; } else if (!args[i].startsWith("-")) rest.push(args[i]);
  }
  if (!Number.isInteger(count) || count < 1 || count > 10) { printLine('<span class="t-err">ping: -c needs a whole number from 1 to 10 in this simulation</span>', container); return; }
  const target = rest[0];
  if (!target) { printLine('<span class="t-err">ping: usage error: Destination address required</span>', container); return; }
  const host = PING_HOSTS.find((h) => h.names.includes(target));
  const isIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(target);
  if (!host && !isIp) { printLine(`<span class="t-err">ping: ${escapeHTML(target)}: Name or service not known</span>`, container); return; }
  const addr = host ? host.addr : target;
  const lines = [`PING ${target} (${addr}) 56(84) bytes of data.`];
  for (let i = 1; i <= count; i++) {
    lines.push(host ? `64 bytes from ${addr}: icmp_seq=${i} ttl=64 time=${host.ms.toFixed(2)} ms` : `From 10.0.2.15 icmp_seq=${i} Destination Host Unreachable`);
  }
  lines.push("", `--- ${target} ping statistics ---`);
  lines.push(host ? `${count} packets transmitted, ${count} received, 0% packet loss, time ${(count - 1) * 1001}ms` : `${count} packets transmitted, 0 received, +${count} errors, 100% packet loss, time ${(count - 1) * 1001}ms`);
  if (host) lines.push(`rtt min/avg/max/mdev = ${host.ms.toFixed(3)}/${host.ms.toFixed(3)}/${host.ms.toFixed(3)}/0.000 ms`);
  printLine(lines.map(escapeHTML).join("\n") + '\n<span class="t-dim">(simulated: no packet is ever sent — only the lab\'s own addresses answer)</span>', container);
}
