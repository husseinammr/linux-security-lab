/**
 * app.js
 * Application shell: view routing between sidebar sections, theme toggle,
 * mobile sidebar, cheat sheet rendering + search, keyboard shortcuts, and
 * bootstrapping every feature module. This is the only file that touches
 * the top-level DOM structure of index.html directly.
 *
 * Linux Security Lab: the six sections (Fundamentals, Permissions, Users & Groups, Network, Logs, Investigation)
 * each have their own view; the Labs, Challenges and Progress views of the original were removed.
 * English/Arabic bilingual support (i18n.js) with RTL layout switching is unchanged.
 */

import { qs, qsa, el, debounce, attachRippleToAll, loadState, saveState } from "./utils.js";
import { CHEATSHEET_ROWS } from "./converter.js";
import { CHEATSHEET_ROWS_AR } from "./cheatsheet-data.ar.js";
import { TERMINAL_COMMANDS, TERMINAL_COMMAND_CATEGORIES } from "./terminal-commands-data.js";
import { TERMINAL_COMMANDS_AR, TERMINAL_COMMAND_CATEGORIES_AR } from "./terminal-commands-data.ar.js";
import { initSimulator } from "./simulator.js";
import { initCalculator } from "./calculator.js";
import { initTerminal } from "./terminal.js";
import { initScenarios } from "./scenarios.js";
import { initLearnSection, LEARN_TOPICS } from "./learn.js";
import { initQuiz, setQuizSection } from "./quiz.js";
import { QUIZ_QUESTIONS } from "./quiz-data.js";
import { INVESTIGATIONS } from "./scenarios-data.js";
import { getLocale, setLocale, t, localize, onLocaleChanged, applyStaticTranslations } from "./i18n.js";

const SECTION_VIEWS = ["fundamentals", "permissions", "users", "network", "logs", "investigation", "architecture"];
const VIEW_IDS = ["home", ...SECTION_VIEWS, "simulator", "calculator", "terminal", "quiz", "cheatsheet", "about"];
const SHORTCUT_MAP = { "1": "fundamentals", "2": "permissions", "3": "users", "4": "network", "5": "logs", "6": "investigation", "7": "architecture", "8": "terminal", "9": "quiz", "0": "cheatsheet" };

const NAV_PARENT = { simulator: "permissions", calculator: "permissions" };

let initializedViews = new Set();
let terminalReady = false;

/** The one simulated terminal lives in a slot of the Terminal, File Permissions or Investigation view and is moved
 *  (the same DOM node, so the session, history and scenario state are kept) to whichever view is showing. */
function placeTerminal(viewId) {
  const slot = qs(`#terminal-slot-${viewId}`);
  const win = qs("#terminal-window");
  if (!slot || !win) return;
  if (!terminalReady) { initTerminal(); terminalReady = true; }
  if (win.parentNode !== slot) slot.append(win);
}

function setActiveView(viewId, { updateHash = true } = {}) {
  VIEW_IDS.forEach((id) => {
    const view = qs(`#view-${id}`);
    if (view) view.classList.toggle("active", id === viewId);
  });
  // The simulator and the calculator are tools of the File Permissions section, so that entry stays highlighted for them.
  const navId = NAV_PARENT[viewId] || viewId;
  qsa(".nav-item").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.view === navId);
    btn.setAttribute("aria-current", btn.dataset.view === navId ? "page" : "false");
  });
  if (updateHash) history.replaceState(null, "", `#${viewId}`);
  lazyInitView(viewId);
  if (viewId === "terminal" || viewId === "investigation" || viewId === "permissions") placeTerminal(viewId);
  closeMobileSidebar();
  qs(".main-region")?.scrollTo?.({ top: 0, behavior: "instant" in document.documentElement.style ? "instant" : "auto" });
  window.scrollTo(0, 0);
}

function lazyInitView(viewId) {
  if (initializedViews.has(viewId)) return;
  initializedViews.add(viewId);
  if (viewId === "simulator") initSimulator();
  if (viewId === "calculator") initCalculator();
  if (viewId === "terminal") placeTerminal("terminal");
  if (SECTION_VIEWS.includes(viewId)) initLearnSection(viewId);
  if (viewId === "permissions") placeTerminal("permissions");
  if (viewId === "investigation") { placeTerminal("investigation"); initScenarios(); }
  if (viewId === "quiz") initQuiz();
  if (viewId === "cheatsheet") initCheatSheet();
}

function initRouting() {
  qsa(".nav-item").forEach((btn) => {
    btn.addEventListener("click", () => setActiveView(btn.dataset.view));
  });
  qsa("[data-goto]").forEach((btn) => {
    btn.addEventListener("click", () => setActiveView(btn.dataset.goto));
  });
  // "Take this section's quiz": open the Quiz with that section's questions
  qsa("[data-quiz-section]").forEach((btn) => {
    btn.addEventListener("click", () => { setActiveView("quiz"); setQuizSection(btn.dataset.quizSection); });
  });
  window.addEventListener("lsl:navigate", (e) => {
    const { view } = e.detail || {};
    if (view && VIEW_IDS.includes(view)) setActiveView(view);
  });

  const initial = (location.hash || "").replace("#", "");
  setActiveView(VIEW_IDS.includes(initial) ? initial : "home", { updateHash: false });
}

/* ---------------------------- Mobile sidebar ---------------------------- */

function openMobileSidebar() {
  qs(".sidebar")?.classList.add("open");
  qs(".sidebar-backdrop")?.classList.add("active");
}
function closeMobileSidebar() {
  qs(".sidebar")?.classList.remove("open");
  qs(".sidebar-backdrop")?.classList.remove("active");
}

function initMobileSidebar() {
  qs("#mobile-menu-btn")?.addEventListener("click", openMobileSidebar);
  qs(".sidebar-backdrop")?.addEventListener("click", closeMobileSidebar);
}

/* ---------------------------- Theme toggle ---------------------------- */

function initTheme() {
  const stored = loadState().theme;
  const theme = stored || "dark";
  document.documentElement.setAttribute("data-theme", theme);
  updateThemeLabel(theme);

  qs("#theme-toggle-btn")?.addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
    const next = current === "light" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", next);
    saveState({ theme: next });
    updateThemeLabel(next);
  });
}

function updateThemeLabel(theme) {
  const label = qs("#theme-toggle-label");
  if (label) label.textContent = theme === "light" ? t("theme.light") : t("theme.dark");
}

/* ---------------------------- Language toggle (i18n) ---------------------------- */

function initLanguage() {
  document.documentElement.setAttribute("lang", getLocale() === "ar" ? "ar" : "en");
  document.documentElement.setAttribute("dir", getLocale() === "ar" ? "rtl" : "ltr");
  applyStaticTranslations();

  qs("#lang-toggle-btn")?.addEventListener("click", () => {
    setLocale(getLocale() === "ar" ? "en" : "ar");
  });

  onLocaleChanged(() => {
    updateThemeLabel(document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark");
  });
}

/* ---------------------------- Cheat sheet ---------------------------- */

function initCheatSheet() {
  renderCheatSheetRows();
  renderCommandRows();
  const search = qs("#cheat-search-input");
  if (search) {
    search.addEventListener("input", debounce(() => {
      const term = search.value.trim().toLowerCase();
      // One search box filters every table on the page.
      qsa("#cheat-table-body tr, #cmd-table-body tr[data-search]").forEach((tr) => {
        const matches = !term || tr.dataset.search.includes(term);
        tr.hidden = !matches;
      });
      // A category separator row has no data-search of its own — hide it
      // too once every row until the next separator is hidden, so a search
      // doesn't leave a stack of empty category headers behind.
      qsa("#cmd-table-body tr.cheat-cat-row").forEach((cat) => {
        let sib = cat.nextElementSibling;
        let anyVisible = false;
        while (sib && !sib.classList.contains("cheat-cat-row")) {
          if (!sib.hidden) anyVisible = true;
          sib = sib.nextElementSibling;
        }
        cat.hidden = !anyVisible;
      });
    }, 120));
  }
  onLocaleChanged(() => { renderCheatSheetRows(); renderCommandRows(); });
}

function renderCommandRows() {
  const tbody = qs("#cmd-table-body");
  if (!tbody) return;
  tbody.innerHTML = "";
  const rows = localize(TERMINAL_COMMANDS, TERMINAL_COMMANDS_AR);
  const ar = getLocale() === "ar";
  TERMINAL_COMMAND_CATEGORIES.forEach((cat) => {
    const label = ar ? (TERMINAL_COMMAND_CATEGORIES_AR[cat.id] || cat.label) : cat.label;
    tbody.append(el("tr", { class: "cheat-cat-row" }, [el("td", { colspan: "3" }, label)]));
    rows.filter((r) => r.category === cat.id).forEach((row) => {
      tbody.append(el("tr", { "data-search": `${row.cmd} ${row.desc} ${row.requires || ""}`.toLowerCase() }, [
        el("td", { class: "cmd" }, row.cmd),
        el("td", { class: "desc" }, row.desc),
        el("td", { class: "desc requires" }, row.requires || "—"),
      ]));
    });
  });
}

function renderCheatSheetRows() {
  const tbody = qs("#cheat-table-body");
  if (!tbody) return;
  tbody.innerHTML = "";
  const rows = localize(CHEATSHEET_ROWS, CHEATSHEET_ROWS_AR);
  rows.forEach((row) => {
    tbody.append(el("tr", { "data-search": `${row.octal} ${row.symbolic} ${row.desc}`.toLowerCase() }, [
      el("td", {}, row.octal),
      el("td", {}, row.symbolic),
      el("td", { class: "desc" }, row.desc),
    ]));
  });
}

/* ---------------------------- Toolbar: copy year, XP widget, etc ---------------------------- */

function initMisc() {
  const year = qs("#current-year");
  if (year) year.textContent = new Date().getFullYear();
  attachRippleToAll(".btn");
}

/** Fill the home page's counters from the data, so they can never drift from what ships. */
function initHomeStats() {
  const values = { lessons: LEARN_TOPICS.length, investigations: INVESTIGATIONS.length, quiz: QUIZ_QUESTIONS.length, sections: SECTION_VIEWS.length };
  qsa("[data-stat]").forEach((node) => { const v = values[node.dataset.stat]; if (v !== undefined) node.textContent = String(v); });
}

/* ---------------------------- Keyboard shortcuts ---------------------------- */

function initKeyboardShortcuts() {
  document.addEventListener("keydown", (e) => {
    if (e.target.matches("input, textarea")) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const target = SHORTCUT_MAP[e.key];
    if (target) setActiveView(target);
  });
}

/* ---------------------------- Boot ---------------------------- */

document.addEventListener("DOMContentLoaded", () => {
  initLanguage();
  initTheme();
  initMobileSidebar();
  initRouting();
  initKeyboardShortcuts();
  initMisc();
  initHomeStats();
  document.documentElement.dataset.appReady = "true";
});
