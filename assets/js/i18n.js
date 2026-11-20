/**
 * i18n.js
 * Bilingual support (English / Arabic). Owns the active locale,
 * the UI-string dictionary, RTL layout switching, and the static-DOM
 * translation pass (elements marked `data-i18n="key"`). Feature modules
 * that render their own DOM call `t(key)` directly instead of relying on
 * the static pass; modules with large parallel datasets (lessons, scenarios,
 * quiz, filesystem notes) import a matching
 * `*.ar.js` overlay keyed by id and merge it in when the locale is 'ar'.
 */

import { loadState, saveState } from "./utils.js";

let locale = loadState().locale || "en";
const listeners = new Set();

export function getLocale() {
  return locale;
}

export function isRTL() {
  return locale === "ar";
}

export function onLocaleChanged(cb) {
  listeners.add(cb);
}

export function setLocale(next) {
  if (next !== "en" && next !== "ar") return;
  locale = next;
  saveState({ locale });
  document.documentElement.setAttribute("lang", locale === "ar" ? "ar" : "en");
  document.documentElement.setAttribute("dir", locale === "ar" ? "rtl" : "ltr");
  applyStaticTranslations();
  listeners.forEach((cb) => { try { cb(locale); } catch { /* ignore a broken listener */ } });
}

/** Translate a UI-string key. Falls back to English, then to the key itself. */
export function t(key) {
  const dict = DICT[locale] || DICT.en;
  return dict[key] ?? DICT.en[key] ?? key;
}

/**
 * Merge an Arabic overlay (keyed by id) onto an English array when locale is 'ar'.
 * Every content type in this project (lessons, scenarios, quiz) is flat and this plain
 * shallow merge is all it needs. Pass `nestedArrayKey` (e.g. "steps") for
 * nested content (the original project had interactive Labs shaped like that), where the overlay itself needs to merge a
 * nested array element-by-element rather than being spread wholesale —
 * without it, an overlay's partial `steps` overrides would clobber the
 * rest of each step instead of merging into it.
 */
export function localize(items, overlay, { nestedArrayKey } = {}) {
  if (locale !== "ar" || !overlay) return items;
  return items.map((item) => {
    const ov = overlay[item.id];
    if (!ov) return item;
    if (nestedArrayKey && Array.isArray(item[nestedArrayKey]) && Array.isArray(ov[nestedArrayKey])) {
      const merged = item[nestedArrayKey].map((entry, i) => ({ ...entry, ...(ov[nestedArrayKey][i] || {}) }));
      return { ...item, ...ov, [nestedArrayKey]: merged };
    }
    return { ...item, ...ov };
  });
}

export function applyStaticTranslations() {
  document.querySelectorAll("[data-i18n]").forEach((node) => {
    const key = node.getAttribute("data-i18n");
    node.textContent = t(key);
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((node) => {
    node.setAttribute("placeholder", t(node.getAttribute("data-i18n-placeholder")));
  });
  document.querySelectorAll("[data-i18n-aria]").forEach((node) => {
    node.setAttribute("aria-label", t(node.getAttribute("data-i18n-aria")));
  });
}

export const DICT = {
  en: {
    "nav.home": "Home",
    "nav.simulator": "Permission Simulator",
    "nav.calculator": "Calculator",
    "nav.terminal": "Terminal",
    "nav.quiz": "Quiz",
    "nav.cheatsheet": "Cheat Sheet",
    "nav.about": "About",

    "brand.tagline": "Linux security, hands-on",

    "lang.toggle": "العربية",

    "theme.dark": "Dark mode",
    "theme.light": "Light mode",

    "hero.badge": "Runs entirely in your browser — no login, no backend",
    "hero.title1": "Linux",
    "hero.title2": "Security",
    "hero.title3": "Lab",
    "hero.sub": "A hands-on cybersecurity education platform: learn Linux fundamentals, permissions, users and groups, network security and log analysis — then work a simulated incident from evidence to verification.",
    "hero.startLab": "Start learning",
    "hero.scroll": "Scroll",

    "home.whatsInside": "What's inside",
    "home.heading": "Seven sections, from the shell to the kernel and a full investigation",
    "home.footerNote": "Linux Security Lab v1.0.0 · Educational simulation, no real shell execution",

    "hero.stats.topics": "Lessons",
    "hero.stats.quiz": "Quiz questions",

    "home.how.eyebrow": "How it works",
    "home.how.heading": "Three steps, in order",

    "footer.tagline": "A browser-only Linux security lab. No backend, no login, no build step.",
    "footer.sourceLink": "Source on GitHub",
    "footer.licenseLink": "MIT License",

    "sim.eyebrow": "Tool · File Permissions",
    "sim.title": "Permission Simulator",
    "sim.desc": "Pick a file from the fake filesystem, or build permissions from scratch. Every toggle updates the live output and the security analysis below.",
    "sim.fsPanel": "Fake filesystem",
    "sim.editor": "Permission editor",
    "sim.reset": "Reset",
    "sim.owner": "Owner",
    "sim.group": "Group",
    "sim.others": "Others",
    "sim.special": "Special Bits",
    "sim.advanced": "advanced",
    "sim.read": "Read",
    "sim.write": "Write",
    "sim.execute": "Execute",
    "sim.liveOutput": "Live output",
    "sim.symbolic": "Symbolic",
    "sim.octal": "Octal",
    "sim.binary": "Binary",
    "sim.copy": "Copy",
    "sim.securityAnalysis": "Security analysis",
    "sim.bitsExplained": "Special bits explained",
    "sim.suidLabel": "SUID",
    "sim.sgidLabel": "SGID",
    "sim.stickyLabel": "Sticky",

    "sec.safe": "Safe",
    "sec.warning": "Warning",
    "sec.critical": "Critical",

    "calc.eyebrow": "Tool · File Permissions",
    "calc.title": "Permission Calculator",
    "calc.desc": "Type an octal mode or a symbolic string — both directions convert automatically.",
    "calc.octalInput": "Octal input",
    "calc.symbolicInput": "Symbolic input",
    "calc.presets": "Quick presets",
    "calc.result": "Result",
    "calc.copyChmod": "Copy as chmod command",

    "term.eyebrow": "Tool",
    "term.title": "Terminal Simulator",
    "term.desc": "A simulated shell over a fake filesystem. Permissions are enforced and nothing real is ever executed. Try cat /etc/passwd, su alice, sudo tail -n 5 /var/log/auth.log, ip addr or ss -tulpn. Type help for the full command list.",

    "sc.title": "Security investigations",
    "sc.desc": "Guided incidents: read the incident, collect evidence in the terminal above, diagnose, remediate and verify. Your fix is judged by the simulated state — what each account, service or listener can actually do afterwards — not by which command you typed. Opening an investigation loads its files under /srv/lab and moves your shell there.",
    "sc.kind.investigation": "Investigation",
    "sc.list": "Choose a scenario",
    "sc.open": "Open",
    "sc.back": "Back to list",
    "sc.objectives": "Learning objectives",
    "sc.incident": "Incident",
    "sc.reset": "Reset scenario",
    "sc.start": "Start investigation",
    "sc.close": "Close scenario",
    "sc.hint": "Show next hint",
    "sc.hints": "Hints",
    "sc.hintCount": "hints shown",
    "sc.noMoreHints": "No more hints for this step.",
    "sc.required": "required",
    "sc.advisory": "advisory",
    "sc.pass": "Pass",
    "sc.fail": "Not yet",
    "sc.reset.done": "Scenario reset to its original state.",
    "sc.loaded": "Scenario loaded. Your shell is now in",
    "sc.phase.briefing": "Incident",
    "sc.phase.evidence": "Evidence",
    "sc.phase.diagnosis": "Diagnosis",
    "sc.phase.remediation": "Fix",
    "sc.phase.verification": "Verify",
    "sc.phase.complete": "Done",
    "sc.phases": "Investigation steps",
    "sc.phase.current": "current step",
    "sc.evidence": "Evidence log",
    "sc.evidence.pending": "Not collected yet",
    "sc.evidence.finding": "Finding",
    "sc.evidence.hint": "Run commands in the terminal. Each item ticks off when you inspect the right thing.",
    "sc.diagnosis": "Diagnosis",
    "sc.diagnosis.locked": "Collect all the evidence first. Still missing:",
    "sc.diagnosis.pick": "What is the root cause?",
    "sc.diagnosis.submit": "Submit diagnosis",
    "sc.diagnosis.none": "Select a diagnosis first.",
    "sc.diagnosis.correct": "Correct diagnosis.",
    "sc.diagnosis.wrong": "Not the root cause.",
    "sc.diagnosis.live": "From the simulation:",
    "sc.fix": "Apply and check the fix",
    "sc.fix.desc": "Fix it in the terminal, then check. The check evaluates the simulated state, not the command you used.",
    "sc.fix.check": "Check my fix",
    "sc.fix.ok": "The state is fixed. One step left: verify it.",
    "sc.fix.notyet": "The state is still broken:",
    "sc.verify": "Verify",
    "sc.verify.desc": "Re-run a check as the account that was failing (su www-data, then read the page) to confirm the fix from its point of view.",
    "sc.verify.reopened": "The state no longer passes — the fix was undone. Fix it again.",
    "sc.summary": "What happened",
    "sc.summary.final": "Final state",
    "sc.summary.wrong": "Wrong diagnoses",
    "sc.summary.hints": "Hints used",
    "sc.resolved": "Investigation resolved.",
    "sc.policy": "Scope and access policy",
    "sc.verify.pending": "Not done yet",
    "sc.verify.desc2": "Prove the fix from both sides: run a read as an account that must be denied, and as an account that must still succeed. Each item ticks off when you run it.",
    "sc.report.title": "Incident report",
    "sc.progress.evidence": "Evidence collected:",
    "sc.progress.verify": "Verification step done:",
    "sc.report.cause": "Root cause",
    "sc.report.evidence": "Supporting evidence",
    "sc.report.remediation": "Remediation (final state)",
    "sc.report.verification": "Verification result",

    "learn.searchPlaceholder": "Search lessons, e.g. SUID or auth.log",
    "learn.expandAll": "Expand all",
    "learn.collapseAll": "Collapse all",
    "learn.example": "Example",
    "learn.commands": "Command examples",
    "learn.tips": "Tips",
    "learn.warnings": "Warnings",

    "quiz.eyebrow": "Practice",
    "quiz.title": "Quiz",
    "quiz.desc": "Multiple-choice questions across all seven sections. Rounds are 10 questions — filter by section or mix them all.",
    "quiz.question": "Question",
    "quiz.score": "Score",
    "quiz.correct": "Correct",
    "quiz.notQuite": "Not quite",
    "quiz.nextQuestion": "Next question",
    "quiz.seeResults": "See results",
    "quiz.roundComplete": "Round complete",
    "quiz.perfect": "Perfect score — nice work.",
    "quiz.solid": "Solid round. Review the lessons for the topics you missed.",
    "quiz.revisit": "Worth a revisit — reread the lessons for the topics that tripped you up.",
    "quiz.roundsPlayed": "Rounds played",
    "quiz.bestRound": "Best round score",
    "quiz.lifetimeAccuracy": "Lifetime accuracy",
    "quiz.startAnother": "Start another round",

    "cheat.eyebrow": "Reference",
    "cheat.title": "Cheat Sheet",
    "cheat.desc": "The permission modes you'll actually use, in one reference table.",
    "cheat.searchPlaceholder": "Search modes, e.g. 600 or ssh key",
    "cheat.colOctal": "Octal",
    "cheat.colSymbolic": "Symbolic",
    "cheat.colWhen": "When to use it",
    "cheat.readingDigits": "Reading the digits",
    "cheat.binaryRef": "Binary reference",
    "cheat.specialBits": "Special bits",
    "cheat.allCommands": "All terminal commands",
    "cheat.allCommandsDesc": "Every command the Terminal Simulator understands, with every flag it actually supports — the same list \"help\" prints inside the terminal. The search box above filters this table too.",
    "cheat.colCommand": "Command",
    "cheat.colDoes": "What it does",
    "cheat.colRequires": "Requires",
    "cheat.troubleshooting": "Permission troubleshooting",
    "cheat.bestPractices": "Best practices",

    "toast.copied": "Copied to clipboard",
    "toast.copyFailed": "Couldn't copy — select and copy manually",
    "toast.noMoreHints": "No more hints for this one — you've got this.",

    "nav.fundamentals": "Linux Fundamentals",

    "sec.fundamentals.eyebrow": "Section 01",
    "sec.fundamentals.title": "Linux Fundamentals",
    "sec.fundamentals.short": "Filesystem, navigation, files, reading and the essential commands.",
    "sec.fundamentals.desc": "The essential Linux concepts and commands: the filesystem structure, navigating and managing files, reading and modifying files, pipes and the terminal commands you will use everywhere else.",

    "nav.permissions": "File Permissions",

    "sec.permissions.eyebrow": "Section 02",
    "sec.permissions.title": "File Permissions",
    "sec.permissions.short": "rwx, chmod, chown, chgrp, umask, SUID, SGID, sticky bit and ACLs.",
    "sec.permissions.desc": "The heart of the lab: the full permission model with the simulator and calculator — rwx, chmod, chown, chgrp, umask, SUID, SGID, the sticky bit and ACLs, with permission visualisation and calculation.",

    "nav.users": "Users & Groups",

    "sec.users.eyebrow": "Section 03",
    "sec.users.title": "Users & Groups",
    "sec.users.short": "Accounts, groups, ownership and access control.",
    "sec.users.desc": "How Linux identifies and groups people and services: user accounts, groups and membership, ownership, how user and group permissions decide access, and how to audit and restrict privileged access.",

    "nav.network": "Network Security",

    "sec.network.eyebrow": "Section 04",
    "sec.network.title": "Network Security",
    "sec.network.short": "Interfaces, IP addresses, routes, open ports and connections.",
    "sec.network.desc": "Network interfaces and IP addressing, routing basics, open ports, listening services and connections, and the essential commands to inspect and reduce a host's network exposure.",

    "nav.logs": "Log Analysis",

    "sec.logs.eyebrow": "Section 05",
    "sec.logs.title": "Log Analysis",
    "sec.logs.short": "Log files, authentication events, failed logins and suspicious activity.",
    "sec.logs.desc": "Where Linux keeps its logs, how to read authentication logs, how to spot failed logins and suspicious activity, and the commands to inspect logs and analyse basic security events.",

    "nav.investigation": "Security Investigation",

    "sec.investigation.eyebrow": "Section 06",
    "sec.investigation.title": "Security Investigation",
    "sec.investigation.short": "Incident → evidence → diagnosis → remediation → verification.",
    "sec.investigation.desc": "Work simulated incidents the way an analyst does: read the incident, collect evidence from permissions, users, logs and network data, diagnose the cause, remediate, then verify the result. All data is simulated.",
    "sec.openTerminal": "Open the terminal",
    "sec.openSimulator": "Open the permission simulator",
    "sec.openCalculator": "Open the calculator",
    "sec.takeQuiz": "Take this section's quiz",

    "inv.workflow": "Investigation workflow",

    "nav.group.sections": "Sections",
    "nav.group.tools": "Tools",
    "nav.group.practice": "Practice & reference",

    "credit.developedBy": "Developed by",

    "hero.investigate": "Try an investigation",
    "hero.stats.sections": "Sections",
    "hero.stats.investigations": "Investigations",

    "home.tools.eyebrow": "Tools",
    "home.tools.heading": "Practice with simulated, safe tools",
    "home.tool.sim.title": "Permission Simulator",
    "home.tool.sim.desc": "Toggle owner, group and others like LED switches and watch symbolic, octal, binary and the chmod command update instantly.",
    "home.tool.term.title": "Terminal Simulator",
    "home.tool.term.desc": "A simulated shell over a fake filesystem with real permission enforcement, log files, network data and system commands. It never runs real commands.",
    "home.tool.calc.title": "Permission Calculator",
    "home.tool.calc.desc": "Convert octal and symbolic notation in both directions, with one-click presets.",
    "home.tool.quiz.title": "Quiz",
    "home.tool.quiz.desc": "Multiple-choice rounds for every section, with instant explanations and lifetime accuracy.",

    "learn.noMatch": "No lessons match",

    "sec.practiceTerminal": "Practice in the terminal",

    "nav.architecture": "Linux Architecture & History",

    "sec.architecture.eyebrow": "Section 07",
    "sec.architecture.title": "Linux Architecture & History",
    "sec.architecture.short": "The story of Linux, the kernel, the layers, hardware, boot and processes.",
    "sec.architecture.desc": "How Linux came to be (Unix, GNU, Linus Torvalds, distributions) and how it works underneath: kernel and distribution, the layers from your command down to the hardware, what the kernel does, kernel space vs user space, the boot process, processes, \"everything is a file\", and how all of it explains the other sections.",

    "topic.All": "All",

    "home.how.step1.title": "Learn",
    "home.how.step1.desc": "Work through the lessons for each section — every one comes with practical commands you can try.",
    "home.how.step2.title": "Practice",
    "home.how.step2.desc": "Run the commands in the simulated terminal and experiment with the permission engine.",
    "home.how.step3.title": "Investigate",
    "home.how.step3.desc": "Take a simulated incident from evidence to diagnosis, remediation and verification, then test yourself with the quiz.",

    "footer.col.sections": "Sections",
    "footer.col.tools": "Tools",
    "footer.col.project": "Project",

    "about.eyebrow": "About",
    "about.title": "What this is, and isn't",
    "about.p1": "Linux Security Lab is a browser-based teaching platform for Linux security: fundamentals, file permissions, users and groups, network security, log analysis, a guided security-investigation workflow, and how Linux is built and where it came from.",
    "about.p2": "It includes a permission simulator and calculator, a fake filesystem, a simulated terminal with realistic log, network and account data, lessons for every section, simulated security investigations and a quiz. Everything is simulated — nothing here touches a real file, shell, network or system.",
    "about.p4": "This project focuses on defensive understanding and does not include or endorse any offensive or exploitation tooling.",
    "about.missionTitle": "Educational mission",
    "about.mission": "Security skills are learned by looking at evidence and making careful changes, not by memorising commands. This project lets you see permissions, accounts, logs and network exposure change in a safe simulation, break things on purpose, and prove a fix from both sides.",
    "about.ossTitle": "Open-source philosophy",
    "about.oss": "The whole project is MIT-licensed and dependency-free by design — no build step, no bundler, no framework lock-in. Anyone can read every line of source, fork it, and deploy their own copy to GitHub Pages.",
    "about.roadmapTitle": "Roadmap",
    "about.roadmap1": "More security investigations across logs, accounts and network exposure",
    "about.roadmap2": "Output redirection (>, >>) and richer log analysis commands",
    "about.roadmap3": "Click-to-run commands inside the lessons",
    "about.originTitle": "Origins and license",
    "about.origin": "Linux Security Lab is a modified derivative of Linux Permission Lab by 0x0MAr (MIT License). The simulated terminal, permission engine, filesystem model, quiz system, scenario engine and the permission lessons originate there; the seven-section structure, the new lessons and quiz questions, the log, network and account simulation and the new investigations are additions by Hussein Ammar. The original copyright notice is kept in the LICENSE file.",
    "about.originLink": "Original project (Linux Permission Lab)",
    "about.authorTitle": "About the developer",
    "about.authorLine": "Linux Security Lab is developed by",
  },
  ar: {
    "nav.home": "الرئيسية",
    "nav.simulator": "محاكي الصلاحيات",
    "nav.calculator": "الحاسبة",
    "nav.terminal": "الطرفية",
    "nav.quiz": "الاختبار",
    "nav.cheatsheet": "ورقة مرجعية",
    "nav.about": "حول",

    "brand.tagline": "أمن لينكس بالتطبيق العملي",

    "lang.toggle": "English",

    "theme.dark": "الوضع الداكن",
    "theme.light": "الوضع الفاتح",

    "hero.badge": "يعمل بالكامل داخل متصفحك — بدون تسجيل دخول وبدون خادم",
    "hero.title1": "مختبر",
    "hero.title2": "أمن",
    "hero.title3": "لينكس",
    "hero.sub": "منصة تعليمية عملية للأمن السيبراني: تعلّم أساسيات لينكس والصلاحيات والمستخدمين والمجموعات وأمن الشبكات وتحليل السجلات — ثم اعمل على حادثة محاكاة من جمع الأدلة حتى التحقق من الإصلاح.",
    "hero.startLab": "ابدأ التعلّم",
    "hero.scroll": "مرّر للأسفل",

    "home.whatsInside": "ما الذي يحتويه المشروع",
    "home.heading": "سبعة أقسام، من سطر الأوامر إلى النواة وتحقيق كامل",
    "home.footerNote": "مختبر أمن لينكس v1.0.0 · محاكاة تعليمية، بلا تنفيذ لأوامر حقيقية",

    "hero.stats.topics": "درس",
    "hero.stats.quiz": "سؤال اختبار",

    "home.how.eyebrow": "كيف يعمل المشروع",
    "home.how.heading": "ثلاث خطوات، بالترتيب",

    "footer.tagline": "مختبر أمن لينكس يعمل في المتصفح فقط. بلا خادم، بلا تسجيل دخول، بلا خطوة بناء.",
    "footer.sourceLink": "الكود المصدري على GitHub",
    "footer.licenseLink": "رخصة MIT",

    "sim.eyebrow": "أداة · صلاحيات الملفات",
    "sim.title": "محاكي الصلاحيات",
    "sim.desc": "اختر ملفًا من نظام الملفات الوهمي، أو ابنِ الصلاحيات من الصفر. كل تبديل يحدّث المخرجات الحية وتحليل الأمان أدناه فورًا.",
    "sim.fsPanel": "نظام الملفات الوهمي",
    "sim.editor": "محرر الصلاحيات",
    "sim.reset": "إعادة تعيين",
    "sim.owner": "المالك",
    "sim.group": "المجموعة",
    "sim.others": "الآخرون",
    "sim.special": "البتات الخاصة",
    "sim.advanced": "متقدّم",
    "sim.read": "قراءة",
    "sim.write": "كتابة",
    "sim.execute": "تنفيذ",
    "sim.liveOutput": "المخرجات الحية",
    "sim.symbolic": "رمزي",
    "sim.octal": "ثُماني",
    "sim.binary": "ثنائي",
    "sim.copy": "نسخ",
    "sim.securityAnalysis": "تحليل الأمان",
    "sim.bitsExplained": "شرح البتات الخاصة",
    "sim.suidLabel": "SUID",
    "sim.sgidLabel": "SGID",
    "sim.stickyLabel": "اللزوجة",

    "sec.safe": "آمن",
    "sec.warning": "تحذير",
    "sec.critical": "حرج",

    "calc.eyebrow": "أداة · صلاحيات الملفات",
    "calc.title": "حاسبة الصلاحيات",
    "calc.desc": "اكتب صيغة ثُمانية أو سلسلة رمزية — يتم التحويل تلقائيًا في كلا الاتجاهين.",
    "calc.octalInput": "إدخال ثُماني",
    "calc.symbolicInput": "إدخال رمزي",
    "calc.presets": "قيم جاهزة",
    "calc.result": "النتيجة",
    "calc.copyChmod": "نسخ كأمر chmod",

    "term.eyebrow": "أداة",
    "term.title": "محاكي الطرفية",
    "term.desc": "طرفية محاكاة فوق نظام ملفات وهمي. الصلاحيات تُطبَّق فعليًا ولا يُنفَّذ أي شيء حقيقي. جرّب cat /etc/passwd ثم su alice ثم sudo tail -n 5 /var/log/auth.log أو ip addr أو ss -tulpn. اكتب help لعرض كل الأوامر.",

    "sc.title": "التحقيقات الأمنية",
    "sc.desc": "حوادث موجَّهة: اقرأ الحادثة، اجمع الأدلة في الطرفية أعلاه، شخّص، عالج ثم تحقق. يُحكَم على إصلاحك بالحالة المحاكاة — ما يستطيع كل حساب أو خدمة أو منفذ فعله بعد ذلك — لا بالأمر الذي كتبته. فتح تحقيق يحمّل ملفاته تحت /srv/lab وينقل الطرفية إليه.",
    "sc.kind.investigation": "تحقيق",
    "sc.list": "اختر سيناريو",
    "sc.open": "افتح",
    "sc.back": "العودة إلى القائمة",
    "sc.objectives": "أهداف التعلّم",
    "sc.incident": "الحادثة",
    "sc.reset": "إعادة ضبط السيناريو",
    "sc.start": "ابدأ التحقيق",
    "sc.close": "إغلاق السيناريو",
    "sc.hint": "أظهر التلميح التالي",
    "sc.hints": "التلميحات",
    "sc.hintCount": "تلميحات ظاهرة",
    "sc.noMoreHints": "لا مزيد من التلميحات لهذه الخطوة.",
    "sc.required": "إلزامي",
    "sc.advisory": "إرشادي",
    "sc.pass": "نجاح",
    "sc.fail": "لم يتحقق بعد",
    "sc.reset.done": "أُعيد السيناريو إلى حالته الأصلية.",
    "sc.loaded": "تم تحميل السيناريو. الطرفية الآن في",
    "sc.phase.briefing": "الحادثة",
    "sc.phase.evidence": "الأدلة",
    "sc.phase.diagnosis": "التشخيص",
    "sc.phase.remediation": "الإصلاح",
    "sc.phase.verification": "التحقق",
    "sc.phase.complete": "تم",
    "sc.phases": "خطوات التحقيق",
    "sc.phase.current": "الخطوة الحالية",
    "sc.evidence": "سجل الأدلة",
    "sc.evidence.pending": "لم يُجمع بعد",
    "sc.evidence.finding": "النتيجة",
    "sc.evidence.hint": "نفّذ أوامر في الطرفية. يُعلَّم كل بند عندما تفحص الشيء الصحيح.",
    "sc.diagnosis": "التشخيص",
    "sc.diagnosis.locked": "اجمع كل الأدلة أولًا. ما زال ينقص:",
    "sc.diagnosis.pick": "ما السبب الجذري؟",
    "sc.diagnosis.submit": "أرسل التشخيص",
    "sc.diagnosis.none": "اختر تشخيصًا أولًا.",
    "sc.diagnosis.correct": "تشخيص صحيح.",
    "sc.diagnosis.wrong": "ليس هذا هو السبب الجذري.",
    "sc.diagnosis.live": "من المحاكاة:",
    "sc.fix": "طبّق الإصلاح وافحصه",
    "sc.fix.desc": "أصلح المشكلة في الطرفية ثم افحص. يقيّم الفحص حالة النظام المحاكى لا الأمر الذي استخدمته.",
    "sc.fix.check": "افحص إصلاحي",
    "sc.fix.ok": "الحالة سليمة الآن. بقيت خطوة: التحقق.",
    "sc.fix.notyet": "الحالة ما زالت معطوبة:",
    "sc.verify": "التحقق",
    "sc.verify.desc": "أعد فحصًا بصفة الحساب الذي كان يفشل (su www-data ثم اقرأ الصفحة) لتتأكد من الإصلاح من وجهة نظره.",
    "sc.verify.reopened": "لم تعد الحالة سليمة — تم التراجع عن الإصلاح. أصلحها مجددًا.",
    "sc.summary": "ما الذي حدث",
    "sc.summary.final": "الحالة النهائية",
    "sc.summary.wrong": "تشخيصات خاطئة",
    "sc.summary.hints": "التلميحات المستخدمة",
    "sc.resolved": "تم حل التحقيق.",
    "sc.policy": "النطاق وسياسة الوصول",
    "sc.verify.pending": "لم يُنفَّذ بعد",
    "sc.verify.desc2": "أثبت الإصلاح من الجهتين: نفّذ قراءة بصفة حساب يجب أن يُمنع، وأخرى بصفة حساب يجب أن ينجح. يُعلَّم كل بند عند تنفيذه.",
    "sc.report.title": "تقرير الحادثة",
    "sc.progress.evidence": "تم جمع الأدلة:",
    "sc.progress.verify": "اكتملت خطوة تحقق:",
    "sc.report.cause": "السبب الجذري",
    "sc.report.evidence": "الأدلة الداعمة",
    "sc.report.remediation": "المعالجة (الحالة النهائية)",
    "sc.report.verification": "نتيجة التحقق",

    "learn.searchPlaceholder": "ابحث في الدروس، مثل SUID أو auth.log",
    "learn.expandAll": "توسيع الكل",
    "learn.collapseAll": "طيّ الكل",
    "learn.example": "مثال",
    "learn.commands": "أمثلة الأوامر",
    "learn.tips": "نصائح",
    "learn.warnings": "تحذيرات",

    "quiz.eyebrow": "تدريب",
    "quiz.title": "الاختبار",
    "quiz.desc": "أسئلة اختيار من متعدد في الأقسام السبعة. كل جولة 10 أسئلة — صفِّ حسب القسم أو اخلطها كلها.",
    "quiz.question": "سؤال",
    "quiz.score": "النتيجة",
    "quiz.correct": "إجابة صحيحة",
    "quiz.notQuite": "ليست صحيحة تمامًا",
    "quiz.nextQuestion": "السؤال التالي",
    "quiz.seeResults": "عرض النتائج",
    "quiz.roundComplete": "انتهت الجولة",
    "quiz.perfect": "نتيجة كاملة — عمل رائع.",
    "quiz.solid": "جولة جيدة. راجع دروس المواضيع التي أخطأت فيها.",
    "quiz.revisit": "تستحق المراجعة — أعد قراءة دروس المواضيع التي أخطأت فيها.",
    "quiz.roundsPlayed": "الجولات الملعوبة",
    "quiz.bestRound": "أفضل نتيجة جولة",
    "quiz.lifetimeAccuracy": "الدقة الكلية",
    "quiz.startAnother": "ابدأ جولة أخرى",

    "cheat.eyebrow": "مرجع",
    "cheat.title": "المرجع السريع",
    "cheat.desc": "الصيغ التي ستستخدمها فعليًا، في جدول مرجعي واحد.",
    "cheat.searchPlaceholder": "ابحث عن صيغة، مثل 600 أو مفتاح ssh",
    "cheat.colOctal": "ثُماني",
    "cheat.colSymbolic": "رمزي",
    "cheat.colWhen": "متى تستخدمها",
    "cheat.readingDigits": "قراءة الأرقام",
    "cheat.binaryRef": "المرجع الثنائي",
    "cheat.specialBits": "البتات الخاصة",
    "cheat.allCommands": "كل أوامر الطرفية",
    "cheat.allCommandsDesc": "كل أمر تفهمه محاكاة الطرفية، مع كل خيار يدعمه فعليًا — نفس القائمة اللي يطبعها \"help\" داخل الطرفية. مربع البحث أعلاه يفلتر هذا الجدول أيضًا.",
    "cheat.colCommand": "الأمر",
    "cheat.colDoes": "ماذا يفعل",
    "cheat.colRequires": "يتطلب",
    "cheat.troubleshooting": "استكشاف أخطاء الصلاحيات",
    "cheat.bestPractices": "أفضل الممارسات",

    "toast.copied": "تم النسخ إلى الحافظة",
    "toast.copyFailed": "تعذّر النسخ — حدّد النص وانسخه يدويًا",
    "toast.noMoreHints": "لا مزيد من التلميحات لهذا التحدي — يمكنك حله بنفسك.",

    "nav.fundamentals": "أساسيات لينكس",

    "sec.fundamentals.eyebrow": "القسم 01",
    "sec.fundamentals.title": "أساسيات لينكس",
    "sec.fundamentals.short": "نظام الملفات، التنقل، الملفات، القراءة والأوامر الأساسية.",
    "sec.fundamentals.desc": "مفاهيم وأوامر لينكس الأساسية: بنية نظام الملفات، التنقل وإدارة الملفات، قراءة الملفات وتعديلها، الأنابيب (pipes) وأوامر الطرفية التي ستستخدمها في كل مكان آخر.",

    "nav.permissions": "صلاحيات الملفات",

    "sec.permissions.eyebrow": "القسم 02",
    "sec.permissions.title": "صلاحيات الملفات",
    "sec.permissions.short": "rwx و chmod و chown و chgrp و umask و SUID و SGID وبت اللزوجة وقوائم ACL.",
    "sec.permissions.desc": "قلب المختبر: نموذج الصلاحيات الكامل مع المحاكي والحاسبة — rwx و chmod و chown و chgrp و umask و SUID و SGID وبت اللزوجة وقوائم ACL، مع التمثيل المرئي وحساب الصلاحيات.",

    "nav.users": "المستخدمون والمجموعات",

    "sec.users.eyebrow": "القسم 03",
    "sec.users.title": "المستخدمون والمجموعات",
    "sec.users.short": "الحسابات والمجموعات والملكية والتحكم بالوصول.",
    "sec.users.desc": "كيف يعرّف لينكس الأشخاص والخدمات ويجمعهم: حسابات المستخدمين، المجموعات والعضوية، الملكية، وكيف تحدد صلاحيات المستخدم والمجموعة الوصول، وكيف تُراجَع الصلاحيات المرتفعة وتُقيَّد.",

    "nav.network": "أمن الشبكات",

    "sec.network.eyebrow": "القسم 04",
    "sec.network.title": "أمن الشبكات",
    "sec.network.short": "الواجهات وعناوين IP والمسارات والمنافذ المفتوحة والاتصالات.",
    "sec.network.desc": "واجهات الشبكة وعناوين IP، أساسيات التوجيه، المنافذ المفتوحة، الخدمات المستمعة والاتصالات، والأوامر الأساسية لفحص تعرّض الجهاز للشبكة وتقليله.",

    "nav.logs": "تحليل السجلات",

    "sec.logs.eyebrow": "القسم 05",
    "sec.logs.title": "تحليل السجلات",
    "sec.logs.short": "ملفات السجلات وأحداث المصادقة ومحاولات الدخول الفاشلة والنشاط المشبوه.",
    "sec.logs.desc": "أين يحتفظ لينكس بسجلاته، وكيف تقرأ سجلات المصادقة، وكيف تكتشف محاولات الدخول الفاشلة والنشاط المشبوه، وأوامر فحص السجلات وتحليل الأحداث الأمنية الأساسية.",

    "nav.investigation": "التحقيق الأمني",

    "sec.investigation.eyebrow": "القسم 06",
    "sec.investigation.title": "التحقيق الأمني",
    "sec.investigation.short": "حادثة ← أدلة ← تشخيص ← معالجة ← تحقق.",
    "sec.investigation.desc": "اعمل على حوادث محاكاة كما يفعل المحلل: اقرأ الحادثة، اجمع الأدلة من الصلاحيات والمستخدمين والسجلات وبيانات الشبكة، شخّص السبب، عالجه، ثم تحقق من النتيجة. كل البيانات محاكاة.",
    "sec.openTerminal": "افتح الطرفية",
    "sec.openSimulator": "افتح محاكي الصلاحيات",
    "sec.openCalculator": "افتح الحاسبة",
    "sec.takeQuiz": "اختبر نفسك في هذا القسم",

    "inv.workflow": "مسار التحقيق",

    "nav.group.sections": "الأقسام",
    "nav.group.tools": "الأدوات",
    "nav.group.practice": "التدريب والمراجع",

    "credit.developedBy": "تطوير",

    "hero.investigate": "جرّب تحقيقًا",
    "hero.stats.sections": "أقسام",
    "hero.stats.investigations": "تحقيقات",

    "home.tools.eyebrow": "الأدوات",
    "home.tools.heading": "تدرّب بأدوات محاكاة آمنة",
    "home.tool.sim.title": "محاكي الصلاحيات",
    "home.tool.sim.desc": "بدّل صلاحيات المالك والمجموعة والآخرين كمفاتيح LED وشاهد الصيغة الرمزية والثُمانية والثنائية وأمر chmod تتحدّث فورًا.",
    "home.tool.term.title": "محاكي الطرفية",
    "home.tool.term.desc": "طرفية محاكاة فوق نظام ملفات وهمي مع تطبيق فعلي للصلاحيات وملفات سجلات وبيانات شبكة وأوامر نظام. لا تنفّذ أي أمر حقيقي أبدًا.",
    "home.tool.calc.title": "حاسبة الصلاحيات",
    "home.tool.calc.desc": "حوّل بين الصيغة الثُمانية والرمزية في الاتجاهين مع إعدادات جاهزة بنقرة واحدة.",
    "home.tool.quiz.title": "الاختبار",
    "home.tool.quiz.desc": "جولات أسئلة اختيار من متعدد لكل قسم مع شرح فوري ودقة تراكمية.",

    "learn.noMatch": "لا توجد دروس مطابقة",

    "sec.practiceTerminal": "تدرّب في الطرفية",

    "nav.architecture": "بنية لينكس وتاريخه",

    "sec.architecture.eyebrow": "القسم 07",
    "sec.architecture.title": "بنية لينكس وتاريخه",
    "sec.architecture.short": "قصة لينكس والنواة والطبقات والعتاد والإقلاع والعمليات.",
    "sec.architecture.desc": "كيف نشأ لينكس (يونكس و GNU ولينوس تورفالدز والتوزيعات) وكيف يعمل من الداخل: النواة والتوزيعة، والطبقات من أمرك نزولًا إلى العتاد، وماذا تفعل النواة، وفضاء النواة مقابل فضاء المستخدم، وعملية الإقلاع، والعمليات، و«كل شيء ملف»، وكيف يفسّر ذلك كله بقية الأقسام.",

    "topic.All": "الكل",

    "home.how.step1.title": "تعلّم",
    "home.how.step1.desc": "اقرأ دروس كل قسم — ولكل درس أوامر عملية يمكنك تجربتها.",
    "home.how.step2.title": "تدرّب",
    "home.how.step2.desc": "نفّذ الأوامر في الطرفية المحاكاة وجرّب محرّك الصلاحيات.",
    "home.how.step3.title": "حقّق",
    "home.how.step3.desc": "خذ حادثة محاكاة من الأدلة إلى التشخيص ثم المعالجة والتحقق، ثم اختبر نفسك بالاختبار.",

    "footer.col.sections": "الأقسام",
    "footer.col.tools": "الأدوات",
    "footer.col.project": "المشروع",

    "about.eyebrow": "حول",
    "about.title": "ما هذا المشروع وما ليس هو",
    "about.p1": "مختبر أمن لينكس منصة تعليمية تعمل في المتصفح لأمن لينكس: الأساسيات وصلاحيات الملفات والمستخدمون والمجموعات وأمن الشبكات وتحليل السجلات ومسار تحقيق أمني موجَّه، وكيف بُني لينكس ومن أين جاء.",
    "about.p2": "يتضمن محاكي صلاحيات وحاسبة ونظام ملفات وهميًا وطرفية محاكاة ببيانات سجلات وشبكة وحسابات واقعية ودروسًا لكل قسم وتحقيقات أمنية محاكاة واختبارًا. كل شيء محاكاة — لا شيء هنا يلمس ملفًا أو طرفية أو شبكة أو نظامًا حقيقيًا.",
    "about.p4": "يركّز هذا المشروع على الفهم الدفاعي ولا يتضمن أو يؤيد أي أدوات هجومية أو استغلال.",
    "about.missionTitle": "الرسالة التعليمية",
    "about.mission": "تُكتسب مهارات الأمن بفحص الأدلة وإجراء تغييرات مدروسة لا بحفظ الأوامر. يتيح لك هذا المشروع أن ترى الصلاحيات والحسابات والسجلات وتعرّض الشبكة تتغيّر في محاكاة آمنة، وأن تكسر الأشياء عمدًا، وتثبت الإصلاح من الجهتين.",
    "about.ossTitle": "فلسفة المصدر المفتوح",
    "about.oss": "المشروع كله بترخيص MIT وبلا اعتماديات بالتصميم — بلا خطوة بناء ولا مجمّع ولا إطار عمل. يمكن لأي شخص قراءة كل سطر وتفريعه ونشر نسخته على GitHub Pages.",
    "about.roadmapTitle": "خارطة الطريق",
    "about.roadmap1": "المزيد من التحقيقات الأمنية في السجلات والحسابات وتعرّض الشبكة",
    "about.roadmap2": "إعادة توجيه المخرجات (>، >>) وأوامر أغنى لتحليل السجلات",
    "about.roadmap3": "أوامر قابلة للتشغيل بنقرة داخل الدروس",
    "about.originTitle": "الأصل والترخيص",
    "about.origin": "مختبر أمن لينكس مشتق معدَّل من «Linux Permission Lab» لصاحبه 0x0MAr (رخصة MIT). الطرفية المحاكاة ومحرّك الصلاحيات ونموذج نظام الملفات ونظام الاختبار ومحرّك السيناريوهات ودروس الصلاحيات مصدرها ذلك المشروع؛ أما بنية الأقسام السبعة والدروس وأسئلة الاختبار الجديدة ومحاكاة السجلات والشبكة والحسابات والتحقيقات الجديدة فهي إضافات من حسين عمار. إشعار حقوق النشر الأصلي محفوظ في ملف LICENSE.",
    "about.originLink": "المشروع الأصلي (Linux Permission Lab)",
    "about.authorTitle": "عن المطوّر",
    "about.authorLine": "يطوّر مختبر أمن لينكس",
  },
};
