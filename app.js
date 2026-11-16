(() => {
  const TREE = FEELINGS.map((core) => ({
    name: core.name,
    colors: core.colors,
    children: core.children.map(([name, leaves]) => ({
      name,
      children: leaves.map((leaf) => ({ name: leaf, children: [] })),
    })),
  }));

  // Storage

  const store = {
    get(key, fallback) {
      try {
        const v = localStorage.getItem("fw:" + key);
        return v === null ? fallback : JSON.parse(v);
      } catch {
        return fallback;
      }
    },
    set(key, value) {
      try { localStorage.setItem("fw:" + key, JSON.stringify(value)); } catch {}
    },
  };

  const validPath = (p) =>
    Array.isArray(p) && p.length === 3 &&
    TREE[p[0]]?.children[p[1]]?.children[p[2]] !== undefined;

  function initialLang() {
    const saved = store.get("lang", null);
    if (STRINGS[saved]) return saved;
    const nav = (navigator.language || "en").slice(0, 2).toLowerCase();
    return STRINGS[nav] ? nav : "en";
  }

  const savedList = store.get("list", []);

  const state = {
    sel: [],
    hover: null,
    mode: store.get("mode", window.innerWidth < 600 ? "boxes" : "wheel"),
    reveal: store.get("reveal", false) === true,
    lang: initialLang(),
    theme: store.get("theme", "auto"),
    askReflect: store.get("askReflect", true) !== false,
    format: store.get("format", "sentence") === "detailed" ? "detailed" : "sentence",
    list: Array.isArray(savedList) ? savedList.filter((e) => e && validPath(e.path)) : [],
    justAdded: null,
    reflecting: null,
  };
  if (state.mode !== "wheel" && state.mode !== "boxes") state.mode = "wheel";

  const $ = (id) => document.getElementById(id);
  const els = {
    svg: $("wheel"),
    boxes: $("boxes"),
    crumbs: $("crumbs"),
    prompt: $("prompt"),
    add: $("add"),
    reset: $("reset"),
    wheelView: $("wheel-view"),
    boxesView: $("boxes-view"),
    modeButtons: document.querySelectorAll("[data-mode]"),
    reveal: $("reveal"),
    announce: $("announce"),
    toast: $("toast"),
    openList: $("open-list"),
    listCount: $("list-count"),
    listDialog: $("list-dialog"),
    listEmpty: $("list-empty"),
    entries: $("entries"),
    exportBox: $("export"),
    preview: $("preview"),
    formatButtons: document.querySelectorAll("[data-format]"),
    copy: $("copy"),
    share: $("share"),
    clear: $("clear"),
    reflectDialog: $("reflect-dialog"),
    reflectForm: $("reflect-form"),
    reflectTitle: $("reflect-title"),
    intensity: $("r-intensity"),
    openAbout: $("open-about"),
    aboutDialog: $("about-dialog"),
    themeButtons: document.querySelectorAll("[data-theme-opt]"),
    langSelect: $("lang"),
    askReflect: $("ask-reflect"),
  };

  const NOTE_KEYS = [
    ["trigger", "qTrigger"],
    ["body", "qBody"],
    ["thought", "qThought"],
    ["need", "qNeed"],
  ];

  // Helpers

  const nodeAt = (path) => path.reduce((n, i) => n.children[i], { children: TREE });
  const colorOf = (path) => TREE[path[0]].colors[path.length - 1];
  const samePath = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
  const isPrefix = (a, b) => a.length <= b.length && a.every((v, i) => v === b[i]);

  const t = (key, vars = {}) =>
    (STRINGS[state.lang][key] ?? STRINGS.en[key] ?? key).replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");
  const fname = (en) => FEELING_NAMES[state.lang]?.[en] ?? en;
  const lower = (s) => s.toLocaleLowerCase(state.lang);
  const labelOf = (path) => fname(nodeAt(path).name);
  const labelsOf = (path) => path.map((_, k) => labelOf(path.slice(0, k + 1)));

  const locale = () => {
    const nav = navigator.language || "";
    return nav.toLowerCase().startsWith(state.lang) ? nav : state.lang;
  };

  function listFormat(words) {
    try {
      return new Intl.ListFormat(locale(), { type: "conjunction" }).format(words);
    } catch {
      return words.join(", ");
    }
  }

  function fmtDate(d, withTime) {
    const opts = withTime ? { dateStyle: "medium", timeStyle: "short" } : { dateStyle: "long" };
    try {
      return new Intl.DateTimeFormat(locale(), opts).format(d);
    } catch {
      return d.toLocaleString();
    }
  }

  function luminance(hex) {
    const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  const DARK_INK = "#22152b";
  function inkFor(hex) {
    const l = luminance(hex);
    const vsWhite = 1.05 / (l + 0.05);
    const vsDark = (l + 0.05) / (luminance(DARK_INK) + 0.05);
    return vsWhite >= vsDark ? "#ffffff" : DARK_INK;
  }

  function button(label, className, onClick) {
    const b = document.createElement("button");
    b.type = "button";
    if (className) b.className = className;
    b.textContent = label;
    b.addEventListener("click", onClick);
    return b;
  }

  let toastTimer = null;
  function toast(msg) {
    const host = [...document.querySelectorAll("dialog[open]")].pop() || document.body;
    if (els.toast.parentNode !== host) host.appendChild(els.toast);
    els.toast.textContent = msg;
    els.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { els.toast.hidden = true; }, 2600);
  }

  // Selection

  function select(path) {
    state.sel = path;
    if (state.justAdded && !samePath(state.justAdded, path)) state.justAdded = null;
    els.announce.textContent = path.length ? labelsOf(path).join(" › ") : "";
    render();
  }

  // Wheel

  const NS = "http://www.w3.org/2000/svg";
  const RADII = [72, 182, 332, 496];
  const FONT = [21, 15, 13];
  const segments = [];
  let outlineLayer;
  let rotor;
  let hubEl;
  let hubText;
  let rotation = 0;
  let labelsFitted = false;

  function svgEl(tag, attrs = {}) {
    const el = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    return el;
  }

  function sectorPath(a0, a1, r0, r1) {
    const p = (r, a) => `${(r * Math.cos(a)).toFixed(2)} ${(r * Math.sin(a)).toFixed(2)}`;
    const large = a1 - a0 > Math.PI ? 1 : 0;
    return `M ${p(r0, a0)} L ${p(r1, a0)} A ${r1} ${r1} 0 ${large} 1 ${p(r1, a1)} ` +
      `L ${p(r0, a1)} A ${r0} ${r0} 0 ${large} 0 ${p(r0, a0)} Z`;
  }

  function onActivate(el, fn) {
    el.addEventListener("click", fn);
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        fn();
      }
    });
  }

  function addSegment(path, a0, a1) {
    const depth = path.length - 1;
    const r0 = RADII[depth];
    const r1 = RADII[depth + 1];
    const fill = colorOf(path);
    const d = sectorPath(a0, a1, r0, r1);

    const g = svgEl("g", { class: "seg", tabindex: "0", role: "button" });
    g.appendChild(svgEl("path", { d, fill }));

    const text = svgEl("text", {
      "text-anchor": "middle",
      "dominant-baseline": "central",
      "font-size": FONT[depth],
      "font-weight": depth === 0 ? 650 : 500,
      fill: inkFor(fill),
    });
    g.appendChild(text);

    onActivate(g, () => select(samePath(state.sel, path) ? path.slice(0, -1) : path));
    g.addEventListener("pointerenter", (e) => {
      if (e.pointerType === "mouse") {
        state.hover = path;
        renderStatus();
      }
    });
    g.addEventListener("pointerleave", () => {
      if (state.hover) {
        state.hover = null;
        renderStatus();
      }
    });

    rotor.appendChild(g);
    const seg = { path, depth, g, d, text, mid: (a0 + a1) / 2, r: (r0 + r1) / 2 };
    segments.push(seg);
    placeLabel(seg);
  }

  function updateWheelText() {
    for (const s of segments) {
      s.text.textContent = labelOf(s.path);
      s.g.setAttribute("aria-label", labelsOf(s.path).join(", "));
    }
    hubText.textContent = t("hub");
    hubEl.setAttribute("aria-label", t("clearSelection"));
    labelsFitted = false;
  }

  function fitLabels() {
    if (labelsFitted) return;
    for (const s of segments) {
      s.text.setAttribute("font-size", FONT[s.depth]);
      const len = s.text.getComputedTextLength();
      if (!len) return;
      const max = RADII[s.depth + 1] - RADII[s.depth] - 16;
      if (len > max) s.text.setAttribute("font-size", ((FONT[s.depth] * max) / len).toFixed(2));
    }
    labelsFitted = true;
  }

  const REVEAL_MS = 400;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let flipTimer = null;
  let pendingFlips = [];

  const wantsFlip = (seg) => Math.cos(seg.mid + (rotation * Math.PI) / 180) < -1e-6;

  function placeLabel(seg) {
    seg.flip = wantsFlip(seg);
    const midDeg = (seg.mid * 180) / Math.PI;
    const x = (seg.r * Math.cos(seg.mid)).toFixed(2);
    const y = (seg.r * Math.sin(seg.mid)).toFixed(2);
    seg.text.style.transform = `translate(${x}px, ${y}px) rotate(${(midDeg + (seg.flip ? 180 : 0)).toFixed(2)}deg)`;
  }

  function finishFlips() {
    clearTimeout(flipTimer);
    flipTimer = null;
    pendingFlips.forEach((seg) => {
      placeLabel(seg);
      seg.text.classList.remove("flipping");
    });
    pendingFlips = [];
  }

  function rotateTo(targetDeg) {
    let delta = (targetDeg - rotation) % 360;
    if (delta > 180) delta -= 360;
    if (delta <= -180) delta += 360;
    if (Math.abs(delta) < 1e-6) return;
    finishFlips();
    rotation += delta;
    rotor.style.transform = `rotate(${rotation.toFixed(3)}deg)`;
    pendingFlips = segments.filter((seg) => wantsFlip(seg) !== seg.flip);
    if (reduceMotion.matches) {
      finishFlips();
      return;
    }
    pendingFlips.forEach((seg) => seg.text.classList.add("flipping"));
    flipTimer = setTimeout(finishFlips, REVEAL_MS);
  }

  function buildWheel() {
    const leaves = TREE.reduce((n, c) => n + c.children.reduce((m, mid) => m + mid.children.length, 0), 0);
    const step = (Math.PI * 2) / leaves;
    let a = -Math.PI / 2;
    rotor = svgEl("g", { class: "rotor" });
    els.svg.appendChild(rotor);

    TREE.forEach((core, ci) => {
      const coreStart = a;
      core.children.forEach((mid, mi) => {
        const midStart = a;
        mid.children.forEach((_, oi) => {
          addSegment([ci, mi, oi], a, a + step);
          a += step;
        });
        addSegment([ci, mi], midStart, a);
      });
      addSegment([ci], coreStart, a);
    });

    hubEl = svgEl("circle", { class: "hub", r: RADII[0] - 2, role: "button", tabindex: "0" });
    onActivate(hubEl, () => select([]));
    els.svg.appendChild(hubEl);
    hubText = svgEl("text", { class: "hub-text", "text-anchor": "middle", "dominant-baseline": "central" });
    els.svg.appendChild(hubText);

    outlineLayer = svgEl("g");
    rotor.appendChild(outlineLayer);
    updateWheelText();
  }

  function renderWheel() {
    fitLabels();
    const sel = state.sel;
    outlineLayer.replaceChildren();
    let focus = null;
    for (const s of segments) {
      if (sel.length && samePath(s.path, sel)) focus = s;
      const related = sel.length === 0 || isPrefix(s.path, sel) || isPrefix(sel, s.path);
      const shown = !state.reveal || isPrefix(s.path.slice(0, -1), sel);
      s.g.classList.toggle("dim", !related);
      s.g.classList.toggle("concealed", !shown);
      s.g.setAttribute("tabindex", shown ? "0" : "-1");
      s.g.setAttribute("aria-hidden", shown ? "false" : "true");
      s.g.setAttribute("aria-pressed", isPrefix(s.path, sel) && sel.length > 0 ? "true" : "false");
      if (sel.length && isPrefix(s.path, sel)) {
        outlineLayer.appendChild(svgEl("path", { class: "outline", d: s.d }));
      }
    }
    rotateTo(focus ? -(focus.mid * 180) / Math.PI : 0);
  }

  // Boxes

  function box(label, fill, onClick, extraClass = "") {
    const b = button(label, `box ${extraClass}`.trim(), onClick);
    if (fill) {
      b.style.background = fill;
      b.style.color = inkFor(fill);
    }
    return b;
  }

  function addButton(className) {
    const added = state.justAdded && samePath(state.justAdded, state.sel);
    const b = button(added ? t("added") : t("add"), className, addCurrent);
    b.disabled = Boolean(added);
    return b;
  }

  function renderBoxes() {
    const sel = state.sel;
    const frag = document.createDocumentFragment();
    els.boxes.className = "boxes";

    if (sel.length === 3) {
      els.boxes.className = "";
      const fill = colorOf(sel);
      const [core, mid, leaf] = labelsOf(sel);
      const card = document.createElement("div");
      card.className = "result";
      card.style.background = fill;
      card.style.color = inkFor(fill);
      const small = document.createElement("small");
      small.textContent = t("iFeel");
      const strong = document.createElement("strong");
      strong.textContent = lower(leaf);
      const p = document.createElement("p");
      p.textContent = t("kindOf", { mid: lower(mid), core: lower(core) });
      const actions = document.createElement("div");
      actions.className = "result-actions";
      actions.append(
        addButton("primary"),
        button(t("notQuite"), "", () => select(sel.slice(0, -1))),
      );
      card.append(small, strong, p, actions);
      frag.appendChild(card);
    } else {
      nodeAt(sel).children.forEach((_, i) => {
        const path = [...sel, i];
        frag.appendChild(box(labelOf(path), colorOf(path), () => select(path)));
      });
      if (sel.length) {
        frag.appendChild(box(t("noneOfThese"), null, () => select(sel.slice(0, -1)), "box-back"));
      }
    }

    els.boxes.replaceChildren(frag);
    layoutBoxes();
  }

  function layoutBoxes() {
    const count = els.boxes.querySelectorAll(".box").length;
    if (!count) return;
    const gap = parseFloat(getComputedStyle(els.boxes).columnGap) || 12;
    const maxCols = Math.max(1, Math.floor((els.boxes.clientWidth + gap) / (150 + gap)));
    const rows = Math.ceil(count / maxCols);
    els.boxes.style.setProperty("--cols", Math.ceil(count / rows));
  }

  // Status bar

  function promptText(path, hovering) {
    if (hovering) return "";
    const names = labelsOf(path);
    const wheel = state.mode === "wheel";
    switch (path.length) {
      case 0:
        return wheel ? t("promptWheel0") : t("promptBoxes0");
      case 1:
        return t("prompt1", { x: lower(names[0]) });
      case 2:
        return t("prompt2", { x: names[1] });
      default:
        return wheel ? t("promptDone", { x: lower(names[2]) }) : "";
    }
  }

  function renderStatus() {
    const hovering = state.mode === "wheel" && state.hover;
    const path = hovering ? state.hover : state.sel;

    const frag = document.createDocumentFragment();
    labelsOf(path).forEach((name, k) => {
      if (k) {
        const sep = document.createElement("span");
        sep.className = "crumb-sep";
        sep.textContent = "›";
        sep.setAttribute("aria-hidden", "true");
        frag.appendChild(sep);
      }
      const sub = path.slice(0, k + 1);
      const fill = colorOf(sub);
      const b = button(name, "crumb", () => select(sub));
      b.style.background = fill;
      b.style.color = inkFor(fill);
      frag.appendChild(b);
    });
    els.crumbs.replaceChildren(frag);
    els.prompt.textContent = promptText(path, hovering);
    els.reset.hidden = state.sel.length === 0;

    const showAdd = state.mode === "wheel" && state.sel.length === 3;
    els.add.hidden = !showAdd;
    if (showAdd) {
      const added = state.justAdded && samePath(state.justAdded, state.sel);
      els.add.textContent = added ? t("added") : t("add");
      els.add.disabled = Boolean(added);
    }
  }

  // My list

  function saveList() {
    store.set("list", state.list);
    renderList();
  }

  function addCurrent() {
    if (state.sel.length !== 3) return;
    const entry = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      path: state.sel.slice(),
      names: state.sel.map((_, k) => nodeAt(state.sel.slice(0, k + 1)).name),
      at: new Date().toISOString(),
      notes: {},
    };
    state.list.push(entry);
    state.justAdded = state.sel.slice();
    saveList();
    render();
    if (state.askReflect) openReflect(entry.id);
    toast(t("toastAdded", { x: lower(labelOf(entry.path)) }));
  }

  function exportText(format) {
    const entries = state.list;
    if (!entries.length) return "";
    if (format === "sentence") {
      const words = [...new Set(entries.map((e) => lower(labelOf(e.path))))];
      return t("sentence", { list: listFormat(words) });
    }
    const lines = [t("exportHeader", { date: fmtDate(new Date(), false) }), ""];
    for (const e of entries) {
      const names = labelsOf(e.path);
      lines.push(`• ${names[2]} (${names.join(" › ")})`);
      lines.push(`  ${fmtDate(new Date(e.at), true)}`);
      const n = e.notes || {};
      if (n.intensity) lines.push(`  ${t("qIntensity")} ${n.intensity}/10`);
      for (const [k, q] of NOTE_KEYS) {
        if (n[k]) lines.push(`  ${t(q)} ${n[k].replace(/\n/g, "\n    ")}`);
      }
      lines.push("");
    }
    return lines.join("\n").trim();
  }

  function renderList() {
    const count = state.list.length;
    els.listCount.textContent = count;
    els.listCount.hidden = count === 0;
    if (!els.listDialog.open) return;

    els.listEmpty.hidden = count > 0;
    els.exportBox.hidden = count === 0;
    els.formatButtons.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.format === state.format)));
    els.preview.textContent = exportText(state.format);
    els.share.hidden = typeof navigator.share !== "function";

    const frag = document.createDocumentFragment();
    [...state.list].reverse().forEach((entry) => {
      const names = labelsOf(entry.path);
      const li = document.createElement("li");
      li.className = "entry";

      const dot = document.createElement("span");
      dot.className = "dot";
      dot.style.background = colorOf(entry.path);
      dot.setAttribute("aria-hidden", "true");

      const main = document.createElement("div");
      main.className = "entry-main";
      const word = document.createElement("div");
      word.className = "entry-word";
      word.textContent = names[2];
      const meta = document.createElement("div");
      meta.className = "entry-meta";
      meta.textContent = `${names[0]} › ${names[1]} · ${fmtDate(new Date(entry.at), true)}`;
      main.append(word, meta);

      const n = entry.notes || {};
      const filled = NOTE_KEYS.filter(([k]) => n[k]);
      if (n.intensity || filled.length) {
        const dl = document.createElement("dl");
        dl.className = "entry-notes";
        const row = (q, a) => {
          const dt = document.createElement("dt");
          dt.textContent = q;
          const dd = document.createElement("dd");
          dd.textContent = a;
          dl.append(dt, dd);
        };
        if (n.intensity) row(t("qIntensity"), `${n.intensity}/10`);
        filled.forEach(([k, q]) => row(t(q), n[k]));
        main.appendChild(dl);
      }

      const actions = document.createElement("div");
      actions.className = "entry-actions";
      const hasNotes = n.intensity || filled.length;
      actions.append(
        button(hasNotes ? t("notes") : t("addNotes"), "link-btn", () => openReflect(entry.id)),
      );
      const rm = button("✕", "icon-btn small", () => {
        state.list = state.list.filter((e) => e.id !== entry.id);
        saveList();
      });
      rm.setAttribute("aria-label", t("remove", { x: names[2] }));
      actions.appendChild(rm);

      li.append(dot, main, actions);
      frag.appendChild(li);
    });
    els.entries.replaceChildren(frag);
    els.entries.hidden = count === 0;
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand("copy"); } catch {}
      ta.remove();
      return ok;
    }
  }

  // Reflection

  function buildIntensityOptions() {
    const current = els.intensity.value;
    const opts = [new Option(t("intensityNone"), "")];
    for (let i = 1; i <= 10; i++) opts.push(new Option(String(i), String(i)));
    els.intensity.replaceChildren(...opts);
    els.intensity.value = current;
  }

  function openReflect(id) {
    const entry = state.list.find((e) => e.id === id);
    if (!entry) return;
    state.reflecting = id;
    const n = entry.notes || {};
    els.reflectTitle.textContent = t("reflectTitle", { x: lower(labelOf(entry.path)) });
    els.intensity.value = n.intensity ? String(n.intensity) : "";
    for (const [k] of NOTE_KEYS) $("r-" + k).value = n[k] || "";
    els.reflectDialog.showModal();
  }

  els.reflectForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const entry = state.list.find((x) => x.id === state.reflecting);
    if (entry) {
      const notes = {};
      const intensity = parseInt(els.intensity.value, 10);
      if (intensity >= 1 && intensity <= 10) notes.intensity = intensity;
      for (const [k] of NOTE_KEYS) {
        const v = $("r-" + k).value.trim();
        if (v) notes[k] = v;
      }
      entry.notes = notes;
      saveList();
    }
    els.reflectDialog.close();
  });

  // Settings

  function applyTheme() {
    if (state.theme === "light" || state.theme === "dark") document.documentElement.dataset.theme = state.theme;
    else delete document.documentElement.dataset.theme;
    els.themeButtons.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.themeOpt === state.theme)));
  }

  function applyStaticText() {
    document.documentElement.lang = state.lang;
    document.title = t("title");
    document.querySelectorAll("[data-i18n]").forEach((el) => { el.textContent = t(el.dataset.i18n); });
    document.querySelectorAll("[data-i18n-aria]").forEach((el) => el.setAttribute("aria-label", t(el.dataset.i18nAria)));
    buildIntensityOptions();
  }

  function setLang(lang) {
    state.lang = STRINGS[lang] ? lang : "en";
    store.set("lang", state.lang);
    applyStaticText();
    updateWheelText();
    render();
    renderList();
  }

  // Mode

  function setMode(mode) {
    state.mode = mode;
    state.hover = null;
    store.set("mode", mode);
    els.modeButtons.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mode === mode)));
    els.wheelView.hidden = mode !== "wheel";
    els.boxesView.hidden = mode !== "boxes";
    render();
  }

  function render() {
    renderStatus();
    if (state.mode === "wheel") renderWheel();
    else renderBoxes();
  }

  // Init

  buildWheel();

  els.modeButtons.forEach((b) => b.addEventListener("click", () => setMode(b.dataset.mode)));
  els.reset.addEventListener("click", () => select([]));
  els.add.addEventListener("click", addCurrent);
  window.addEventListener("resize", () => {
    if (state.mode === "boxes") layoutBoxes();
  });

  els.reveal.checked = state.reveal;
  els.reveal.addEventListener("change", () => {
    state.reveal = els.reveal.checked;
    store.set("reveal", state.reveal);
    render();
  });

  document.querySelectorAll("dialog").forEach((dlg) => {
    dlg.addEventListener("click", (e) => {
      if (e.target === dlg) dlg.close();
    });
    dlg.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", () => dlg.close()));
  });

  els.openList.addEventListener("click", () => {
    els.listDialog.showModal();
    renderList();
  });
  els.formatButtons.forEach((b) => b.addEventListener("click", () => {
    state.format = b.dataset.format;
    store.set("format", state.format);
    renderList();
  }));
  els.copy.addEventListener("click", async () => {
    toast((await copyText(exportText(state.format))) ? t("copied") : t("copyFailed"));
  });
  els.share.addEventListener("click", () => {
    navigator.share({ title: t("listTitle"), text: exportText(state.format) }).catch(() => {});
  });
  els.clear.addEventListener("click", () => {
    if (window.confirm(t("confirmClear"))) {
      state.list = [];
      saveList();
    }
  });

  els.openAbout.addEventListener("click", () => els.aboutDialog.showModal());
  els.aboutDialog.addEventListener("close", () => store.set("introSeen", true));
  els.themeButtons.forEach((b) => b.addEventListener("click", () => {
    state.theme = b.dataset.themeOpt;
    store.set("theme", state.theme);
    applyTheme();
  }));
  els.langSelect.replaceChildren(...Object.keys(STRINGS).map((k) => new Option(STRINGS[k].langName, k)));
  els.langSelect.value = state.lang;
  $("lang-setting").hidden = Object.keys(STRINGS).length < 2;
  els.langSelect.addEventListener("change", () => setLang(els.langSelect.value));
  els.askReflect.checked = state.askReflect;
  els.askReflect.addEventListener("change", () => {
    state.askReflect = els.askReflect.checked;
    store.set("askReflect", state.askReflect);
  });

  applyTheme();
  applyStaticText();
  renderList();
  setMode(state.mode);

  if (!store.get("introSeen", false)) els.aboutDialog.showModal();

  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
})();
