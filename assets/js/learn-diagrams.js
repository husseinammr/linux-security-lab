/**
 * learn-diagrams.js
 * Small, reusable SVG diagram generators for the lessons (split out of learn.js in Linux Security Lab so
 * the permission lessons and the newer lesson files can share them). Every colour is a CSS variable, so
 * they theme correctly in dark and light mode. All text is static or comes from the lesson data in this
 * repository — never from user input.
 */

/* Small, reusable SVG generators. Every color uses CSS variables so they
   theme correctly in both dark and light mode. */

export function triadDiagram(labels = ["Owner", "Group", "Others"], bits = [true, true, true]) {
  const boxes = labels.map((label, i) => {
    const x = 10 + i * 140;
    return `
      <g>
        <rect x="${x}" y="10" width="120" height="90" rx="10" fill="none" style="stroke:var(--border-strong)" stroke-width="1.5"/>
        <text x="${x + 60}" y="30" text-anchor="middle" style="fill:var(--text-secondary);font:600 11px var(--font-mono)">${label}</text>
        ${["R", "W", "X"].map((b, j) => `<rect x="${x + 10 + j * 35}" y="42" width="28" height="28" rx="6" style="fill:${bits[i] !== false ? "var(--amber-500)" : "var(--bg-inset)"};stroke:var(--border-strong)"/>
        <text x="${x + 24 + j * 35}" y="61" text-anchor="middle" style="fill:${bits[i] !== false ? "var(--text-on-amber)" : "var(--text-tertiary)"};font:700 13px var(--font-mono)">${b}</text>`).join("")}
      </g>`;
  }).join("");
  return `<svg viewBox="0 0 410 110" xmlns="http://www.w3.org/2000/svg">${boxes}</svg>`;
}

export function octalDiagram() {
  const cols = [["4", "read (r)"], ["2", "write (w)"], ["1", "execute (x)"]];
  const items = cols.map((c, i) => `
    <g transform="translate(${10 + i * 130},0)">
      <rect width="110" height="70" rx="10" style="fill:var(--bg-inset);stroke:var(--border-strong)"/>
      <text x="55" y="34" text-anchor="middle" style="fill:var(--amber-300);font:700 22px var(--font-mono)">${c[0]}</text>
      <text x="55" y="54" text-anchor="middle" style="fill:var(--text-tertiary);font:500 11px var(--font-body)">${c[1]}</text>
    </g>`).join("");
  return `<svg viewBox="0 0 400 80" xmlns="http://www.w3.org/2000/svg">${items}
    <text x="200" y="-8" />
  </svg>`;
}

export function bitPositionDiagram(bitLabel, position) {
  // position: 0 = owner slot, 1 = group slot, 2 = others slot
  const slots = ["r", "w", "x"];
  const groups = ["Owner", "Group", "Others"].map((label, i) => {
    const highlight = i === position;
    const x = 10 + i * 130;
    return `
      <g>
        <text x="${x + 50}" y="14" text-anchor="middle" style="fill:var(--text-tertiary);font:600 10px var(--font-mono)">${label}</text>
        ${slots.map((s, j) => {
          const isSpecialSlot = highlight && j === 2;
          return `<rect x="${x + j * 34}" y="22" width="28" height="28" rx="6" style="fill:${isSpecialSlot ? "var(--cyan-500)" : "var(--bg-inset)"};stroke:var(--border-strong)"/>
          <text x="${x + 14 + j * 34}" y="41" text-anchor="middle" style="fill:${isSpecialSlot ? "#06181a" : "var(--text-secondary)"};font:700 13px var(--font-mono)">${isSpecialSlot ? bitLabel : s}</text>`;
        }).join("")}
      </g>`;
  }).join("");
  return `<svg viewBox="0 0 400 60" xmlns="http://www.w3.org/2000/svg">${groups}</svg>`;
}

export function beforeAfterDiagram(beforeLabel, afterLabel, cmdLabel) {
  return `<svg viewBox="0 0 400 70" xmlns="http://www.w3.org/2000/svg">
    <rect x="5" y="15" width="130" height="40" rx="8" style="fill:var(--bg-inset);stroke:var(--border-strong)"/>
    <text x="70" y="40" text-anchor="middle" style="fill:var(--text-secondary);font:600 13px var(--font-mono)">${beforeLabel}</text>
    <text x="200" y="30" text-anchor="middle" style="fill:var(--amber-300);font:600 11px var(--font-mono)">${cmdLabel}</text>
    <path d="M145 35 H255" style="stroke:var(--amber-500)" stroke-width="2" marker-end="url(#arrow)"/>
    <defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z" style="fill:var(--amber-500)"/></marker></defs>
    <rect x="265" y="15" width="130" height="40" rx="8" style="fill:var(--bg-inset);stroke:var(--safe-500)"/>
    <text x="330" y="40" text-anchor="middle" style="fill:var(--safe-500);font:600 13px var(--font-mono)">${afterLabel}</text>
  </svg>`;
}

export function gaugeDiagram(activeLevel) {
  const levels = [["Safe", "var(--safe-500)"], ["Warning", "var(--warn-500)"], ["Critical", "var(--crit-500)"]];
  const items = levels.map((l, i) => `
    <g transform="translate(${10 + i * 130},0)">
      <rect width="110" height="46" rx="8" style="fill:${activeLevel === i ? l[1] : "var(--bg-inset)"};stroke:var(--border-strong)"/>
      <text x="55" y="28" text-anchor="middle" style="fill:${activeLevel === i ? "#0a0c0d" : "var(--text-tertiary)"};font:700 12px var(--font-mono)">${l[0]}</text>
    </g>`).join("");
  return `<svg viewBox="0 0 400 56" xmlns="http://www.w3.org/2000/svg">${items}</svg>`;
}


/** A left-to-right chain of labelled boxes joined by arrows, e.g. Incident -> Evidence -> Diagnosis. */
export function flowDiagram(steps, activeIndex = -1) {
  const w = 96, gap = 22, h = 44;
  const total = steps.length * w + (steps.length - 1) * gap + 20;
  const boxes = steps.map((label, i) => {
    const x = 10 + i * (w + gap);
    const active = i === activeIndex;
    const arrow = i < steps.length - 1
      ? `<path d="M${x + w + 3} ${10 + h / 2} H${x + w + gap - 3}" style="stroke:var(--amber-500)" stroke-width="1.6" marker-end="url(#flow-arrow)"/>` : "";
    return `<g>
      <rect x="${x}" y="10" width="${w}" height="${h}" rx="8" style="fill:${active ? "var(--amber-500)" : "var(--bg-inset)"};stroke:var(--border-strong)"/>
      <text x="${x + w / 2}" y="${10 + h / 2 + 4}" text-anchor="middle" style="fill:${active ? "var(--text-on-amber)" : "var(--text-secondary)"};font:600 10.5px var(--font-mono)">${label}</text>
      ${arrow}
    </g>`;
  }).join("");
  return `<svg viewBox="0 0 ${total} 64" xmlns="http://www.w3.org/2000/svg">
    <defs><marker id="flow-arrow" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z" style="fill:var(--amber-500)"/></marker></defs>${boxes}</svg>`;
}

/** An indented tree of path labels. rows: [depth, "label"] pairs. */
export function treeDiagram(rows) {
  const h = rows.length * 18 + 16;
  const lines = rows.map(([depth, label], i) =>
    `<text x="${14 + depth * 18}" y="${22 + i * 18}" style="fill:${depth === 0 ? "var(--amber-300)" : "var(--text-secondary)"};font:500 11.5px var(--font-mono)">${depth ? "└ " : ""}${label}</text>`).join("");
  return `<svg viewBox="0 0 400 ${h}" xmlns="http://www.w3.org/2000/svg">${lines}</svg>`;
}

/** Labelled rows of key / value cells (a field layout such as one /etc/passwd line). */
export function fieldsDiagram(fields) {
  const w = Math.floor(380 / fields.length);
  const cells = fields.map(([name, sample], i) => `<g transform="translate(${10 + i * w},8)">
      <rect width="${w - 4}" height="46" rx="6" style="fill:var(--bg-inset);stroke:var(--border-strong)"/>
      <text x="${(w - 4) / 2}" y="19" text-anchor="middle" style="fill:var(--amber-300);font:600 10px var(--font-mono)">${name}</text>
      <text x="${(w - 4) / 2}" y="37" text-anchor="middle" style="fill:var(--text-secondary);font:500 10px var(--font-mono)">${sample}</text>
    </g>`).join("");
  return `<svg viewBox="0 0 400 64" xmlns="http://www.w3.org/2000/svg">${cells}</svg>`;
}

/** A host behind a gateway reaching the internet, with the segments labelled. */
export function networkDiagram(labels = ["Host", "Gateway", "Internet"], notes = []) {
  const xs = [20, 150, 280];
  const boxes = labels.map((l, i) => `<g>
      <rect x="${xs[i]}" y="16" width="100" height="40" rx="8" style="fill:var(--bg-inset);stroke:var(--border-strong)"/>
      <text x="${xs[i] + 50}" y="40" text-anchor="middle" style="fill:var(--text-secondary);font:600 11px var(--font-mono)">${l}</text>
      ${notes[i] ? `<text x="${xs[i] + 50}" y="72" text-anchor="middle" style="fill:var(--text-tertiary);font:500 9.5px var(--font-mono)">${notes[i]}</text>` : ""}
    </g>`).join("");
  const links = [120, 250].map((x) => `<path d="M${x} 36 H${x + 30}" style="stroke:var(--amber-500)" stroke-width="2"/>`).join("");
  return `<svg viewBox="0 0 400 84" xmlns="http://www.w3.org/2000/svg">${links}${boxes}</svg>`;
}

/** A horizontal timeline: events is [["1969","Unix"], ...]. */
export function timelineDiagram(events) {
  const step = Math.floor(380 / events.length);
  const dots = events.map(([year, label], i) => {
    const x = 20 + i * step + step / 2 - 10;
    return `<g>
      <circle cx="${x}" cy="30" r="5" style="fill:var(--amber-500)"/>
      <text x="${x}" y="18" text-anchor="middle" style="fill:var(--amber-300);font:700 10.5px var(--font-mono)">${year}</text>
      <text x="${x}" y="52" text-anchor="middle" style="fill:var(--text-secondary);font:500 9.5px var(--font-mono)">${label}</text>
    </g>`;
  }).join("");
  return `<svg viewBox="0 0 400 66" xmlns="http://www.w3.org/2000/svg"><path d="M20 30 H${20 + step * events.length - 20}" style="stroke:var(--border-strong)" stroke-width="2"/>${dots}</svg>`;
}

/** A stack of labelled layers, top to bottom; the layer at `highlight` is drawn in amber. */
export function layersDiagram(layers, highlight = -1) {
  const h = 30, gap = 6;
  const rows = layers.map((label, i) => {
    const y = 8 + i * (h + gap);
    const on = i === highlight;
    return `<g>
      <rect x="40" y="${y}" width="320" height="${h}" rx="7" style="fill:${on ? "var(--amber-500)" : "var(--bg-inset)"};stroke:var(--border-strong)"/>
      <text x="200" y="${y + h / 2 + 4}" text-anchor="middle" style="fill:${on ? "var(--text-on-amber)" : "var(--text-secondary)"};font:600 11px var(--font-mono)">${label}</text>
    </g>`;
  }).join("");
  return `<svg viewBox="0 0 400 ${8 + layers.length * (h + gap)}" xmlns="http://www.w3.org/2000/svg">${rows}</svg>`;
}
