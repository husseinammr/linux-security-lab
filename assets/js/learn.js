/**
 * learn.js
 * Lessons, organised by section (Linux Security Lab). The original Linux Permission Lab rendered one flat list
 * of 21 permission topics; here every lesson carries a `section` and each section page renders its own list
 * with search and expand/collapse. The card layout (diagram, example, commands, tips, warnings) is unchanged.
 * Read-tracking ("topic read" dots feeding a progress dashboard) was removed together with the dashboard.
 */
import { el, qs, qsa } from "./utils.js";
import { t, localize, onLocaleChanged } from "./i18n.js";
import { LEARN_TOPICS_AR } from "./learn.ar.js";
import { SECURITY_TOPICS_AR } from "./learn-data-security.ar.js";
import { ARCHITECTURE_TOPICS_AR } from "./learn-data-architecture.ar.js";
import { PERMISSION_TOPICS } from "./learn-data.js";
import { SECURITY_TOPICS } from "./learn-data-security.js";
import { ARCHITECTURE_TOPICS } from "./learn-data-architecture.js";

export const LEARN_SECTIONS = ["fundamentals", "permissions", "users", "network", "logs", "investigation", "architecture"];

const ORDER = { fundamentals: 0, permissions: 1, users: 2, network: 3, logs: 4, investigation: 5, architecture: 6 };
/** Every lesson, grouped by section order (stable inside a section). */
export const LEARN_TOPICS = [...PERMISSION_TOPICS, ...SECURITY_TOPICS, ...ARCHITECTURE_TOPICS]
  .map((topic, i) => ({ topic, i }))
  .sort((a, b) => ORDER[a.topic.section] - ORDER[b.topic.section] || a.i - b.i)
  .map((x) => x.topic);

export const topicsForSection = (section) => LEARN_TOPICS.filter((x) => x.section === section);

function localizedTopics(section) {
  const merged = { ...LEARN_TOPICS_AR, ...SECURITY_TOPICS_AR, ...ARCHITECTURE_TOPICS_AR };
  return localize(topicsForSection(section), merged);
}

function renderTopicCard(topic) {
  const details = el("details", { class: "learn-card", id: `learn-${topic.id}` });
  const summary = el("summary", {}, [
    el("span", { class: "learn-card-title" }, [topic.title]),
    el("span", { class: "chev" }, "›"),
  ]);
  const body = el("div", { class: "learn-body" }, [
    el("p", {}, topic.description),
    el("div", { class: "learn-diagram", html: topic.diagram() }),
    el("div", { class: "learn-block" }, [
      el("span", { class: "learn-block-label" }, t("learn.example")),
      el("p", { class: "learn-example" }, topic.example),
    ]),
    el("div", { class: "learn-block" }, [
      el("span", { class: "learn-block-label" }, t("learn.commands")),
      el("div", { class: "learn-commands" }, topic.commands.map((cmd) => el("code", {}, cmd))),
    ]),
    el("div", { class: "learn-tips-warnings" }, [
      el("div", { class: "learn-tips" }, [
        el("span", { class: "learn-block-label" }, t("learn.tips")),
        el("ul", {}, topic.tips.map((tip) => el("li", {}, tip))),
      ]),
      el("div", { class: "learn-warnings" }, [
        el("span", { class: "learn-block-label" }, t("learn.warnings")),
        el("ul", {}, topic.warnings.map((warn) => el("li", {}, warn))),
      ]),
    ]),
  ]);
  details.append(summary, body);
  return details;
}

const searchTerms = {};

function renderSection(section) {
  const mount = qs(`#learn-list-${section}`);
  if (!mount) return;
  mount.innerHTML = "";
  const term = (searchTerms[section] || "").trim().toLowerCase();
  const filtered = localizedTopics(section).filter((x) => !term || x.title.toLowerCase().includes(term) || x.description.toLowerCase().includes(term));
  if (!filtered.length) {
    mount.append(el("p", { class: "text-tertiary" }, `${t("learn.noMatch")} "${searchTerms[section]}"`));
    return;
  }
  filtered.forEach((topic) => mount.append(renderTopicCard(topic)));
}

/** Called once per section page the first time it is shown. */
export function initLearnSection(section) {
  renderSection(section);
  qs(`#learn-search-${section}`)?.addEventListener("input", (e) => { searchTerms[section] = e.target.value; renderSection(section); });
  qs(`#learn-expand-${section}`)?.addEventListener("click", () => qsa(`#learn-list-${section} details`).forEach((d) => { d.open = true; }));
  qs(`#learn-collapse-${section}`)?.addEventListener("click", () => qsa(`#learn-list-${section} details`).forEach((d) => { d.open = false; }));
  onLocaleChanged(() => renderSection(section));
}
