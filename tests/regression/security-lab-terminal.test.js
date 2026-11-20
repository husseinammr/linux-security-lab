/**
 * tests/regression/security-lab-terminal.test.js  (Linux Security Lab)
 * The terminal features added for the new sections, driven through the real runCommand():
 * log/account file contents with permissions enforced, grep/head/tail/wc on files and in pipelines, ip / hostname /
 * ping, ss flags, systemctl state changes, usermod / gpasswd / passwd, lastb, and that all of it is undone by a reset.
 */
import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { installDomShim, createContainer, outputText } from "../helpers/dom-shim.js";
import { installLocalStorageShim } from "../helpers/storage-shim.js";

installDomShim();
installLocalStorageShim();
const R = "../../assets/js/";
const { runCommand, resetTerminalState, COMMAND_NAMES } = await import(R + "terminal.js");
const { resetSystem } = await import(R + "engine/sysstate.js");
const { USERS, getUser, canSudo } = await import(R + "engine/users.js");
const { SOCKETS, SERVICES } = await import(R + "engine/sysinfo.js");
const { TERMINAL_COMMANDS } = await import(R + "terminal-commands-data.js");

// The first sudo of a session prints a one-line password notice; it is not part of the command's output.
const run = (line) => {
  const c = createContainer(); runCommand(line, c);
  return outputText(c).split("\n").slice(1).filter((l) => !l.startsWith("[sudo] password for")).join("\n");
};
beforeEach(() => { resetTerminalState(); resetSystem(); });

describe("file contents (permissions still decide who may read them)", () => {
  test("/etc/passwd lists every account with uid, home and shell", () => {
    const out = run("cat /etc/passwd");
    assert.match(out, /^root:x:0:0:root:\/root:\/bin\/bash$/m);
    assert.match(out, /^monitoring:x:1003:1003:.*:\/usr\/sbin\/nologin$/m);
    assert.equal(out.split("\n").length, Object.keys(USERS).length);
  });
  test("/etc/group shows supplementary members and follows membership changes", () => {
    assert.match(run("cat /etc/group"), /^sudo:x:27:user$/m);
    run("sudo usermod -aG adm monitoring");
    assert.match(run("cat /etc/group"), /^adm:x:4:alice,monitoring$/m);
  });
  test("/etc/shadow is root-only and holds placeholder hashes, with ! for a locked account", () => {
    assert.match(run("cat /etc/shadow"), /Permission denied/);
    const out = run("sudo cat /etc/shadow");
    assert.match(out, /^root:\$6\$SIMULATED\$placeholder/m);
    assert.doesNotMatch(out, /^deployer:!/m);
    run("sudo passwd -l deployer");
    assert.match(run("sudo cat /etc/shadow"), /^deployer:!\$6\$SIMULATED/m);
  });
  test("auth.log is readable by adm members and root, not by user", () => {
    assert.match(run("cat /var/log/auth.log"), /Permission denied/);
    assert.match(run("tail -n 1 /var/log/auth.log"), /Permission denied/);
    assert.match(run("sudo tail -n 1 /var/log/auth.log"), /Accepted password for root from 198\.51\.100\.20/);
    run("su alice");
    assert.match(run("head -n 1 /var/log/auth.log"), /sshd\[598\]: Failed password for invalid user admin/);
  });
  test("log lines look like syslog: timestamp, host, process[pid]", () => {
    assert.match(run("sudo head -n 1 /var/log/auth.log"), /^Oct 09 08:58:11 security-lab sshd\[598\]: /m);
  });
  test("a file with no real content still prints its description (original behaviour)", () => {
    assert.match(run("cat /etc/hosts"), /127\.0\.0\.1 localhost/);
    assert.match(run("cat /etc/sudoers"), /Permission denied/);
  });
});

describe("grep / head / tail / wc / sort / uniq on files", () => {
  test("grep a file: counts and numbers", () => {
    assert.equal(run('sudo grep -c "Failed password" /var/log/auth.log'), "5");
    assert.match(run("sudo grep -n Accepted /var/log/auth.log"), /^\d+:Oct 09 .*Accepted/m);
    assert.equal(run("sudo grep -ci ACCEPTED /var/log/auth.log"), "3");
  });
  test("grep -v and several files prefix the file name", () => {
    const out = run("sudo grep root /etc/passwd /etc/group");
    assert.match(out, /^\/etc\/passwd:root:x:0:0/m);
    assert.match(out, /^\/etc\/group:root:x:0:/m);
  });
  test("grep <term> with no file is still the old description search", () => {
    assert.match(run("grep shadow"), /shadow/);
  });
  test("missing file, directory, permission and missing operand are explained", () => {
    assert.match(run("tail -n 2 nope.log"), /No such file or directory/);
    assert.match(run("head /var/log"), /Is a directory/);
    assert.match(run("wc -l"), /missing file operand/);
    assert.match(run("cat /etc/shadow | head -n 1"), /Permission denied/);
  });
  test("wc / sort / uniq on a file", () => {
    assert.match(run("wc -l /etc/passwd"), /^6 \/etc\/passwd$/);
    assert.match(run("sort -r /etc/hostname"), /security-lab/);
  });
  test("the original file-description search is unaffected by new flags-less usage", () => {
    assert.match(run("grep sudoers"), /sudoers/);
  });
});

describe("pipelines", () => {
  test("a count through a pipe, with sudo applying to the first command only", () => {
    assert.equal(run('sudo grep "Failed password" /var/log/auth.log | wc -l'), "5");
    assert.match(run('grep "Failed password" /var/log/auth.log | wc -l'), /Permission denied|^0$/m);
  });
  test("several stages", () => {
    assert.equal(run("sudo cat /var/log/auth.log | grep Failed | grep root | wc -l"), "3");
    assert.match(run("sudo cat /var/log/auth.log | grep Accepted | head -n 1 | tail -n 1"), /Accepted password for user from 198\.51\.100\.7/);
  });
  test("a non-command stage is refused with the supported list", () => {
    assert.match(run("cat /etc/passwd | ls"), /cannot read from a pipe.*grep, head, tail, wc, sort, uniq/);
  });
  test("redirection and chaining words are refused, not silently treated as text", () => {
    assert.match(run("cat /etc/hostname > out"), /not supported/);
    assert.match(run("ls ; pwd"), /not supported/);
    assert.match(run("ls || pwd"), /not supported/);
    assert.match(run("ls |"), /syntax error/);
  });
  test("a quoted pipe is a pattern, not an operator", () => {
    assert.match(run('sudo grep "a|b" /etc/passwd'), /^root:x:0/m);
  });
  test("hostile text from one command is escaped again when the pipeline prints it", () => {
    const c = createContainer();
    runCommand("touch '<img src=x onerror=alert(1)>'", c); // refused by the name rules
    runCommand("ls | grep img", c);
    assert.doesNotMatch(c.children.map((n) => n.innerHTML).join("\n"), /<img/);
  });
});

describe("network commands", () => {
  test("ip addr / ip link / ip route / -br", () => {
    assert.match(run("ip addr"), /inet 10\.0\.2\.15\/24 brd 10\.0\.2\.255 scope global dynamic ens3/);
    assert.match(run("ip a"), /inet 127\.0\.0\.1\/8 scope host lo/);
    assert.match(run("ip link"), /ens3: <BROADCAST,MULTICAST,UP,LOWER_UP>/);
    assert.match(run("ip route"), /^default via 10\.0\.2\.2 dev ens3/m);
    assert.match(run("ip -br addr"), /^ens3\s+UP\s+10\.0\.2\.15\/24/m);
    assert.match(run("ip neigh"), /unknown/);
  });
  test("hostname", () => {
    assert.equal(run("hostname"), "security-lab");
    assert.equal(run("hostname -I"), "10.0.2.15");
    assert.match(run("hostname evil"), /must be root/);
  });
  test("ping answers only for the lab's own addresses and never contacts anything", () => {
    assert.match(run("ping -c 2 10.0.2.2"), /2 packets transmitted, 2 received, 0% packet loss/);
    assert.match(run("ping -c 1 localhost"), /64 bytes from 127\.0\.0\.1/);
    assert.match(run("ping -c 1 203.0.113.9"), /Destination Host Unreachable[\s\S]*100% packet loss/);
    assert.match(run("ping example.invalid"), /Name or service not known/);
    assert.match(run("ping"), /Destination address required/);
    assert.match(run("ping -c 99 localhost"), /1 to 10/);
    assert.match(run("ping -c 1 localhost"), /simulated: no packet is ever sent/);
  });
  test("ss: -l lists listeners, no l shows connections, -p adds processes only when allowed", () => {
    assert.match(run("ss -tulpn"), /0\.0\.0\.0:6379/);
    assert.match(run("ss -tulpn"), /only shown for sockets you own/);
    assert.doesNotMatch(run("ss -tln"), /users:/);
    assert.match(run("sudo ss -tulpn"), /users:\(\("redis-server",pid=1620\)\)/);
    const conns = run("ss -tn");
    assert.match(conns, /ESTAB\s+10\.0\.2\.15:22\s+198\.51\.100\.7:55210/);
    assert.doesNotMatch(conns, /LISTEN/);
    assert.match(run("ss -a"), /LISTEN[\s\S]*ESTAB/);
    assert.match(run("netstat -tulpn"), /LISTEN/);
  });
});

describe("services (systemctl) change the simulated state, and need root", () => {
  test("a normal user cannot stop a service", () => {
    assert.match(run("systemctl stop redis-server"), /Interactive authentication required/);
    assert.ok(SOCKETS.some((s) => s.program === "redis-server"));
  });
  test("stop removes the process and the listening socket; start brings them back", () => {
    run("sudo systemctl stop redis-server");
    assert.ok(!SOCKETS.some((s) => s.program === "redis-server"));
    assert.doesNotMatch(run("ss -tulpn"), /6379/);
    assert.doesNotMatch(run("ps aux"), /redis-server/);
    assert.match(run("systemctl status redis-server"), /Active: inactive \(dead\)/);
    run("sudo systemctl start redis-server");
    assert.match(run("ss -tulpn"), /0\.0\.0\.0:6379/);
    assert.match(run("systemctl status redis-server"), /Active: active \(running\)/);
  });
  test("enable / disable only change the boot setting; is-active / is-enabled report it", () => {
    run("sudo systemctl disable redis-server");
    assert.match(run("systemctl status redis-server"), /disabled/);
    assert.equal(run("systemctl is-enabled redis-server"), "disabled");
    assert.equal(run("systemctl is-active redis-server"), "active");
    assert.ok(SOCKETS.some((s) => s.program === "redis-server"), "disable alone does not stop it");
  });
  test("sshd is an alias of ssh.service; unknown units are reported", () => {
    assert.match(run("systemctl status sshd"), /ssh\.service/);
    assert.match(run("sudo systemctl stop nope"), /not found/);
  });
});

describe("accounts and groups", () => {
  test("usermod / gpasswd / passwd need root", () => {
    assert.match(run("usermod -aG adm user"), /Permission denied/);
    assert.match(run("gpasswd -d user sudo"), /Permission denied/);
    assert.match(run("passwd -l alice"), /Permission denied/);
    assert.ok(canSudo("user"));
  });
  test("usermod -aG appends, -G replaces, and validates names", () => {
    run("sudo usermod -aG adm monitoring");
    assert.deepEqual(getUser("monitoring").groups, ["monitoring", "adm"]);
    run("sudo usermod -G sudo monitoring");
    assert.deepEqual(getUser("monitoring").groups, ["monitoring", "sudo"]);
    assert.match(run("sudo usermod -aG nogroup alice"), /group 'nogroup' does not exist/);
    assert.match(run("sudo usermod -aG adm nobody"), /user 'nobody' does not exist/);
    assert.match(run("sudo usermod -x alice"), /usage/);
  });
  test("gpasswd -d removes a membership but never a primary group", () => {
    run("sudo usermod -aG sudo monitoring");
    assert.ok(canSudo("monitoring"));
    run("sudo gpasswd -d monitoring sudo");
    assert.ok(!canSudo("monitoring"));
    assert.match(run("sudo gpasswd -d monitoring monitoring"), /primary group/);
    assert.match(run("sudo gpasswd -d alice sudo"), /not a member/);
    assert.deepEqual(getUser("monitoring").groups, ["monitoring"]);
  });
  test("sudo -l reflects membership immediately for a fresh su session", () => {
    run("sudo usermod -aG sudo alice");
    run("su alice");
    assert.match(run("sudo -l"), /may run the following commands/);
    run("exit");
    run("sudo gpasswd -d alice sudo");
    run("su alice");
    assert.match(run("sudo -l"), /may not run sudo/);
  });
  test("passwd -S / -l / -u", () => {
    assert.match(run("passwd -S user"), /^user P /);
    assert.match(run("passwd -S alice"), /Permission denied/);
    assert.match(run("sudo passwd -S alice"), /^alice P /);
    assert.match(run("sudo passwd -l alice"), /locked for alice/);
    assert.match(run("sudo passwd -S alice"), /^alice L /);
    assert.match(run("sudo passwd -l alice"), /SSH keys and open sessions are unaffected/);
    run("sudo passwd -u alice");
    assert.match(run("sudo passwd -S alice"), /^alice P /);
    assert.match(run("sudo passwd -S nobody"), /does not exist/);
    assert.match(run("sudo passwd"), /not simulated/);
  });
  test("lastb is root-only and lists the failed attempts newest first", () => {
    assert.match(run("lastb"), /Permission denied/);
    const out = run("sudo lastb");
    assert.equal(out.split("\n").filter((l) => /ssh:notty/.test(l)).length, 5);
    assert.match(out, /203\.0\.113\.44/);
  });
});

describe("state is restorable", () => {
  test("resetSystem undoes group, lock, service and socket changes", () => {
    run("sudo usermod -aG sudo monitoring"); run("sudo passwd -l deployer"); run("sudo systemctl stop redis-server"); run("sudo systemctl disable nginx");
    resetSystem();
    assert.ok(!canSudo("monitoring"));
    assert.ok(!getUser("deployer").locked);
    assert.ok(SOCKETS.some((s) => s.program === "redis-server"));
    assert.ok(SERVICES.find((s) => s.name === "nginx.service").enabled);
  });
});

describe("command registry stays consistent", () => {
  test("every command the terminal accepts is documented in the reference table, and vice versa", () => {
    const documented = new Set(TERMINAL_COMMANDS.map((r) => r.id));
    const mentioned = (name) => TERMINAL_COMMANDS.some((r) => r.cmd.split(/[\s/,]+/).includes(name) || r.id === name || r.id.startsWith(name));
    const missing = COMMAND_NAMES.filter((n) => !mentioned(n) && !["exit", "sudo", "man", "vi", "vim", "nano", "editor", "history", "clear", "netstat", "find", "setfacl", "getfacl", "logout"].includes(n));
    assert.deepEqual(missing, []);
    assert.ok(documented.has("head") && documented.has("ip") && documented.has("usermod"));
  });
  test("every new command answers --help instead of failing", () => {
    for (const cmd of ["head", "tail", "wc", "sort", "uniq", "ip", "hostname", "ping", "usermod", "gpasswd", "passwd", "lastb"]) {
      assert.doesNotMatch(run(`${cmd} --help`), /command not found/, cmd);
    }
  });
});
