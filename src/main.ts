import "./style.css";
import yaml from "js-yaml";
import { detectLocale, t } from "./i18n";
import { registerServiceWorker } from "./register-sw";
import type { Locale } from "./site-config";
import {
  buildUnifiedView,
  diffFingerprint,
  type UnifiedLine,
} from "./unified-view";
import { compareYamlDocs, type DiffEntry } from "./yaml-diff";

const STORAGE_KEY = "yamaster:v1";

type ResultTab = "diffs" | "unified";

type SessionState = {
  left: string;
  right: string;
  ignored: string[];
  tab: ResultTab;
  compared: boolean;
};

type AppState = {
  locale: Locale;
  allDiffs: DiffEntry[];
  ignored: Set<string>;
  leftDoc: unknown;
  rightDoc: unknown;
  compared: boolean;
  tab: ResultTab;
};

const state: AppState = {
  locale: "ru",
  allDiffs: [],
  ignored: new Set(),
  leftDoc: undefined,
  rightDoc: undefined,
  compared: false,
  tab: "diffs",
};

function formatValue(value: unknown): string {
  if (value === undefined) return "";
  try {
    return yaml.dump(value, { lineWidth: -1, noRefs: true }).trimEnd();
  } catch {
    if (value === null) return "null";
    return String(value);
  }
}

function kindLabel(locale: Locale, kind: DiffEntry["kind"]): string {
  if (kind === "left_only") return t(locale, "kindLeftOnly");
  if (kind === "right_only") return t(locale, "kindRightOnly");
  return t(locale, "kindChanged");
}

function visibleDiffs(): DiffEntry[] {
  return state.allDiffs.filter((diff) => !state.ignored.has(diffFingerprint(diff)));
}

function saveSession(): void {
  const leftYaml = document.getElementById("left-yaml") as HTMLTextAreaElement | null;
  const rightYaml = document.getElementById("right-yaml") as HTMLTextAreaElement | null;
  const payload: SessionState = {
    left: leftYaml?.value ?? "",
    right: rightYaml?.value ?? "",
    ignored: [...state.ignored],
    tab: state.tab,
    compared: state.compared,
  };
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* quota / private mode */
  }
}

function loadSession(): SessionState | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as SessionState;
    if (typeof data.left !== "string" || typeof data.right !== "string") return null;
    return {
      left: data.left,
      right: data.right,
      ignored: Array.isArray(data.ignored)
        ? data.ignored.filter((v): v is string => typeof v === "string")
        : [],
      tab: data.tab === "unified" ? "unified" : "diffs",
      compared: Boolean(data.compared),
    };
  } catch {
    return null;
  }
}

function clearSession(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

function setTab(tab: ResultTab, scrollPath?: string): void {
  state.tab = tab;
  const tabDiffs = document.getElementById("tab-diffs");
  const tabUnified = document.getElementById("tab-unified");
  const panelDiffs = document.getElementById("panel-diffs");
  const panelUnified = document.getElementById("panel-unified");
  if (!tabDiffs || !tabUnified || !panelDiffs || !panelUnified) return;

  const diffsActive = tab === "diffs";
  tabDiffs.classList.toggle("active", diffsActive);
  tabUnified.classList.toggle("active", !diffsActive);
  tabDiffs.setAttribute("aria-selected", diffsActive ? "true" : "false");
  tabUnified.setAttribute("aria-selected", diffsActive ? "false" : "true");
  panelDiffs.hidden = !diffsActive;
  panelUnified.hidden = diffsActive;
  saveSession();

  if (!diffsActive && scrollPath !== undefined) {
    requestAnimationFrame(() => {
      const target = document.querySelector<HTMLElement>(
        `#unified [data-path="${CSS.escape(scrollPath)}"]`,
      );
      if (!target) return;
      target.classList.add("unified-flash");
      target.scrollIntoView({ block: "center", behavior: "smooth" });
      window.setTimeout(() => target.classList.remove("unified-flash"), 1600);
    });
  }
}

function renderUnified(locale: Locale): void {
  const root = document.getElementById("unified");
  if (!root) return;
  root.replaceChildren();

  if (!state.compared) return;

  const lines = buildUnifiedView(state.leftDoc, state.rightDoc);
  if (lines.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = t(locale, "noDiffs");
    root.append(empty);
    return;
  }

  const pre = document.createElement("div");
  pre.className = "unified-lines";

  for (const line of lines) {
    pre.append(renderUnifiedLine(locale, line));
  }
  root.append(pre);
}

function renderUnifiedLine(locale: Locale, line: UnifiedLine): HTMLElement {
  const row = document.createElement("div");
  row.className = `unified-line marker-${line.marker === " " ? "ctx" : line.marker === "-" ? "del" : "add"}`;
  if (line.kind) row.dataset.kind = line.kind;
  row.dataset.path = line.path;

  const mark = document.createElement("span");
  mark.className = "unified-mark";
  mark.textContent = line.marker;

  const text = document.createElement("code");
  text.className = "unified-text";
  text.textContent = line.text;

  row.append(mark, text);

  const matching = state.allDiffs.find((d) => d.path === line.path);
  if (matching && state.ignored.has(diffFingerprint(matching))) {
    row.classList.add("is-ignored");
    const badge = document.createElement("span");
    badge.className = "ignored-badge";
    badge.textContent = "✓";
    badge.title = t(locale, "ignoredHint");
    badge.setAttribute("aria-label", t(locale, "ignoredHint"));
    row.append(badge);
  }

  return row;
}

function renderDiffs(locale: Locale): void {
  const list = document.getElementById("diffs");
  const empty = document.getElementById("empty-state");
  if (!list || !empty) return;

  list.replaceChildren();

  if (!state.compared) {
    empty.hidden = true;
    empty.textContent = "";
    return;
  }

  const diffs = visibleDiffs();
  if (diffs.length === 0) {
    empty.hidden = false;
    empty.textContent =
      state.allDiffs.length > 0 ? t(locale, "allIgnored") : t(locale, "noDiffs");
    return;
  }

  empty.hidden = true;
  empty.textContent = "";

  for (const diff of diffs) {
    const li = document.createElement("li");
    li.className = `diff diff-${diff.kind}`;
    li.tabIndex = 0;
    li.dataset.path = diff.path;

    const main = document.createElement("button");
    main.type = "button";
    main.className = "diff-main";

    const kind = document.createElement("span");
    kind.className = "diff-kind";
    kind.textContent = kindLabel(locale, diff.kind);

    const path = document.createElement("code");
    path.className = "diff-path";
    path.textContent = diff.path || "(root)";

    main.append(kind, path);

    if (diff.kind === "changed") {
      const values = document.createElement("span");
      values.className = "diff-values";
      const left = document.createElement("code");
      left.className = "diff-left";
      left.textContent = formatValue(diff.left);
      const arrow = document.createElement("span");
      arrow.className = "diff-arrow";
      arrow.textContent = "→";
      const right = document.createElement("code");
      right.className = "diff-right";
      right.textContent = formatValue(diff.right);
      values.append(left, arrow, right);
      main.append(values);
    } else if (diff.kind === "left_only") {
      const val = document.createElement("code");
      val.className = "diff-value";
      val.textContent = formatValue(diff.left);
      main.append(val);
    } else {
      const val = document.createElement("code");
      val.className = "diff-value";
      val.textContent = formatValue(diff.right);
      main.append(val);
    }

    main.addEventListener("click", () => {
      renderUnified(locale);
      setTab("unified", diff.path || "");
    });

    const ignoreBtn = document.createElement("button");
    ignoreBtn.type = "button";
    ignoreBtn.className = "btn btn-ignore";
    ignoreBtn.textContent = t(locale, "ignore");
    ignoreBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      const fingerprint = diffFingerprint(diff);
      state.ignored.add(fingerprint);
      renderDiffs(locale);
      renderUnified(locale);
      saveSession();
    });

    li.append(main, ignoreBtn);
    list.append(li);
  }
}

function bindFileInput(
  input: HTMLInputElement | null,
  textarea: HTMLTextAreaElement | null,
  onError: () => void,
): void {
  if (!input || !textarea) return;
  input.addEventListener("change", () => {
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      textarea.value = typeof reader.result === "string" ? reader.result : "";
      saveSession();
    };
    reader.onerror = () => onError();
    reader.readAsText(file);
    input.value = "";
  });
}

function bindLangMenu(): void {
  const langRoot = document.querySelector<HTMLDetailsElement>(".lang");
  if (!langRoot) return;
  document.addEventListener("click", (event) => {
    if (!langRoot.open) return;
    const target = event.target;
    if (target instanceof Node && !langRoot.contains(target)) {
      langRoot.open = false;
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && langRoot.open) langRoot.open = false;
  });
}

function applyStaticI18n(locale: Locale): void {
  const leftLabel = document.getElementById("left-label");
  if (leftLabel) leftLabel.textContent = t(locale, "leftPanel");
  const rightLabel = document.getElementById("right-label");
  if (rightLabel) rightLabel.textContent = t(locale, "rightPanel");

  const uploadText = t(locale, "upload");
  const leftUpload = document.getElementById("left-upload-label");
  if (leftUpload) leftUpload.textContent = uploadText;
  const rightUpload = document.getElementById("right-upload-label");
  if (rightUpload) rightUpload.textContent = uploadText;

  const placeholder = t(locale, "pastePlaceholder");
  const leftYaml = document.getElementById("left-yaml") as HTMLTextAreaElement | null;
  if (leftYaml) leftYaml.placeholder = placeholder;
  const rightYaml = document.getElementById("right-yaml") as HTMLTextAreaElement | null;
  if (rightYaml) rightYaml.placeholder = placeholder;

  const compareBtn = document.getElementById("compare");
  if (compareBtn) compareBtn.textContent = t(locale, "compare");
  const clearBtn = document.getElementById("clear");
  if (clearBtn) clearBtn.textContent = t(locale, "clear");
  const resultsHeading = document.getElementById("results-heading");
  if (resultsHeading) resultsHeading.textContent = t(locale, "resultsHeading");
  const tabDiffs = document.getElementById("tab-diffs");
  if (tabDiffs) tabDiffs.textContent = t(locale, "tabDiffs");
  const tabUnified = document.getElementById("tab-unified");
  if (tabUnified) tabUnified.textContent = t(locale, "tabUnified");
  const tabs = document.querySelector(".tabs");
  if (tabs) tabs.setAttribute("aria-label", t(locale, "resultsHeading"));
}

function runCompare(locale: Locale, opts?: { keepIgnored?: boolean }): void {
  const errorEl = document.getElementById("error");
  const leftYaml = document.getElementById("left-yaml") as HTMLTextAreaElement | null;
  const rightYaml = document.getElementById("right-yaml") as HTMLTextAreaElement | null;
  if (!leftYaml || !rightYaml) return;

  const leftText = leftYaml.value;
  const rightText = rightYaml.value;
  if (!leftText.trim() || !rightText.trim()) {
    if (errorEl) errorEl.textContent = t(locale, "emptyBoth");
    state.allDiffs = [];
    state.leftDoc = undefined;
    state.rightDoc = undefined;
    state.compared = false;
    if (!opts?.keepIgnored) state.ignored.clear();
    renderDiffs(locale);
    renderUnified(locale);
    saveSession();
    return;
  }

  let leftDoc: unknown;
  try {
    leftDoc = yaml.load(leftText);
  } catch {
    if (errorEl) errorEl.textContent = t(locale, "parseErrorLeft");
    return;
  }

  let rightDoc: unknown;
  try {
    rightDoc = yaml.load(rightText);
  } catch {
    if (errorEl) errorEl.textContent = t(locale, "parseErrorRight");
    return;
  }

  if (errorEl) errorEl.textContent = "";
  const { diffs } = compareYamlDocs(leftDoc, rightDoc);
  state.leftDoc = leftDoc;
  state.rightDoc = rightDoc;
  state.allDiffs = diffs;
  state.compared = true;
  if (!opts?.keepIgnored) state.ignored.clear();
  renderDiffs(locale);
  renderUnified(locale);
  saveSession();
}

function boot(): void {
  const locale = detectLocale();
  state.locale = locale;
  applyStaticI18n(locale);
  bindLangMenu();
  registerServiceWorker();

  const leftYaml = document.getElementById("left-yaml") as HTMLTextAreaElement | null;
  const rightYaml = document.getElementById("right-yaml") as HTMLTextAreaElement | null;
  const leftFile = document.getElementById("left-file") as HTMLInputElement | null;
  const rightFile = document.getElementById("right-file") as HTMLInputElement | null;
  const errorEl = document.getElementById("error");

  bindFileInput(leftFile, leftYaml, () => {
    if (errorEl) errorEl.textContent = t(locale, "parseErrorLeft");
  });
  bindFileInput(rightFile, rightYaml, () => {
    if (errorEl) errorEl.textContent = t(locale, "parseErrorRight");
  });

  leftYaml?.addEventListener("input", () => saveSession());
  rightYaml?.addEventListener("input", () => saveSession());

  document.getElementById("tab-diffs")?.addEventListener("click", () => {
    setTab("diffs");
  });
  document.getElementById("tab-unified")?.addEventListener("click", () => {
    setTab("unified");
  });

  document.getElementById("compare")?.addEventListener("click", () => {
    runCompare(locale);
  });

  document.getElementById("clear")?.addEventListener("click", () => {
    if (leftYaml) leftYaml.value = "";
    if (rightYaml) rightYaml.value = "";
    if (errorEl) errorEl.textContent = "";
    state.allDiffs = [];
    state.ignored.clear();
    state.leftDoc = undefined;
    state.rightDoc = undefined;
    state.compared = false;
    renderDiffs(locale);
    renderUnified(locale);
    setTab("diffs");
    clearSession();
  });

  const saved = loadSession();
  if (saved) {
    if (leftYaml) leftYaml.value = saved.left;
    if (rightYaml) rightYaml.value = saved.right;
    state.ignored = new Set(saved.ignored);
    state.tab = saved.tab;
    if (saved.compared && saved.left.trim() && saved.right.trim()) {
      runCompare(locale, { keepIgnored: true });
    }
    setTab(saved.tab);
  }
}

boot();
