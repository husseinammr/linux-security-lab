/**
 * quiz.js
 * New in v2.1 — Quiz module. Presents the question bank (quiz-data.js,
 * expanded to 113 in v2.3) as configurable rounds (10 random questions per
 * round by default, or filtered by topic), tracks score, and keeps simple local
 * round statistics (rounds played, best round, lifetime accuracy). v2.2 adds
 * Arabic localization via quiz-data.ar.js, merged in per question id.
 */

import { qs, el, loadState, saveState } from "./utils.js";
import { QUIZ_QUESTIONS } from "./quiz-data.js";
import { QUIZ_QUESTIONS_AR } from "./quiz-data.ar.js";
import { t, localize, onLocaleChanged } from "./i18n.js";
import { pickRound } from "./quiz-select.js";

const ROUND_SIZE = 10;
const SECTIONS = ["All", "fundamentals", "permissions", "users", "network", "logs", "investigation", "architecture"];
const sectionLabel = (s) => (s === "All" ? t("topic.All") : t("nav." + s));

function localizedQuestions() {
  return localize(QUIZ_QUESTIONS, QUIZ_QUESTIONS_AR);
}

let activeSection = "All";
let round = [];
let currentIndex = 0;
let roundScore = 0;
let answered = false;

export function getQuizStats() {
  const s = loadState();
  return s.quizStats || { roundsPlayed: 0, bestScore: 0, totalCorrect: 0, totalAnswered: 0 };
}

function saveQuizStats(update) {
  const stats = getQuizStats();
  const merged = {
    roundsPlayed: stats.roundsPlayed + 1,
    bestScore: Math.max(stats.bestScore, update.score),
    totalCorrect: stats.totalCorrect + update.score,
    totalAnswered: stats.totalAnswered + update.total,
  };
  saveState({ quizStats: merged });
  return merged;
}

function startRound() {
  const all = localizedQuestions();
  round = pickRound(all, activeSection, ROUND_SIZE);
  currentIndex = 0;
  roundScore = 0;
  renderQuestion();
}

function renderTopicTabs() {
  const mount = qs("#quiz-topic-tabs");
  if (!mount) return;
  mount.innerHTML = "";
  SECTIONS.forEach((section) => {
    const btn = el("button", {
      class: `btn btn-sm ${activeSection === section ? "btn-primary" : "btn-ghost"}`,
      type: "button",
      onClick: () => { activeSection = section; renderTopicTabs(); startRound(); },
    }, sectionLabel(section));
    mount.append(btn);
  });
}

/** Used by the "Take this section's quiz" buttons on the section pages. */
export function setQuizSection(section) {
  if (!SECTIONS.includes(section)) return;
  activeSection = section;
  renderTopicTabs();
  startRound();
}

function renderProgressHeader() {
  const mount = qs("#quiz-progress-header");
  if (!mount) return;
  mount.innerHTML = "";
  mount.append(
    el("span", { class: "badge badge-info" }, `${t("quiz.question")} ${Math.min(currentIndex + 1, round.length)} / ${round.length}`),
    el("span", { class: "badge badge-neutral" }, `${t("quiz.score")}: ${roundScore}`)
  );
}

function renderQuestion() {
  const mount = qs("#quiz-question-mount");
  if (!mount) return;
  renderProgressHeader();

  if (currentIndex >= round.length) {
    renderRoundComplete(mount);
    return;
  }

  answered = false;
  const item = round[currentIndex];
  mount.innerHTML = "";

  const optionButtons = item.options.map((opt, i) => el("button", {
    class: "quiz-option",
    type: "button",
    onClick: () => selectAnswer(i, item, optionButtons),
  }, [
    el("span", { class: "quiz-option-letter" }, String.fromCharCode(65 + i)),
    el("span", {}, opt),
  ]));

  mount.append(
    el("span", { class: "badge badge-info", style: "margin-bottom:10px;display:inline-block" }, sectionLabel(item.section)),
    el("h3", { style: "margin-bottom:18px" }, item.q),
    el("div", { class: "quiz-options" }, optionButtons),
    el("div", { id: "quiz-explanation", style: "margin-top:16px" }),
    el("div", { class: "row", style: "margin-top:16px" }, [
      el("button", { id: "quiz-next-btn", class: "btn btn-primary btn-sm", type: "button", disabled: "true", onClick: nextQuestion }, currentIndex === round.length - 1 ? t("quiz.seeResults") : t("quiz.nextQuestion")),
    ])
  );
}

function selectAnswer(index, item, optionButtons) {
  if (answered) return;
  answered = true;
  const correct = index === item.answer;
  if (correct) roundScore += 1;

  optionButtons.forEach((btn, i) => {
    btn.classList.add("answered");
    if (i === item.answer) btn.classList.add("correct");
    else if (i === index) btn.classList.add("incorrect");
  });

  qs("#quiz-explanation").append(
    el("div", { class: "readout" }, [
      el("div", { class: "readout-label" }, correct ? t("quiz.correct") : t("quiz.notQuite")),
      el("div", { style: "color:var(--text-secondary);font-size:0.85rem" }, item.explanation),
    ])
  );

  const nextBtn = qs("#quiz-next-btn");
  if (nextBtn) nextBtn.removeAttribute("disabled");
  renderProgressHeader();
}

function nextQuestion() {
  currentIndex += 1;
  renderQuestion();
}

function renderRoundComplete(mount) {
  const total = round.length;
  const pct = total ? Math.round((roundScore / total) * 100) : 0;
  const stats = saveQuizStats({ score: roundScore, total });
  mount.innerHTML = "";
  mount.append(
    el("div", { class: "stack", style: "align-items:flex-start" }, [
      el("h3", {}, `${t("quiz.roundComplete")}: ${roundScore} / ${total} (${pct}%)`),
      el("p", {}, pct === 100 ? t("quiz.perfect") : pct >= 70 ? t("quiz.solid") : t("quiz.revisit")),
      el("div", { class: "output-grid", style: "width:100%" }, [
        el("div", { class: "readout" }, [el("div", { class: "readout-label" }, t("quiz.roundsPlayed")), el("div", { class: "readout-value" }, String(stats.roundsPlayed))]),
        el("div", { class: "readout" }, [el("div", { class: "readout-label" }, t("quiz.bestRound")), el("div", { class: "readout-value" }, String(stats.bestScore))]),
        el("div", { class: "readout" }, [el("div", { class: "readout-label" }, t("quiz.lifetimeAccuracy")), el("div", { class: "readout-value" }, `${stats.totalAnswered ? Math.round((stats.totalCorrect / stats.totalAnswered) * 100) : 0}%`)]),
      ]),
      el("button", { class: "btn btn-primary btn-sm", type: "button", onClick: startRound }, t("quiz.startAnother")),
    ])
  );
}

export function initQuiz() {
  renderTopicTabs();
  startRound();
  onLocaleChanged(() => { renderTopicTabs(); startRound(); });
}
