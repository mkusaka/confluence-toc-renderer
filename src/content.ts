import "./content.css";
import {
  DEFAULT_RENDER_OPTIONS,
  RENDER_OPTIONS_STORAGE_KEY,
  normalizeRenderOptions,
  type RenderOptions,
} from "./settings";
import { readRenderOptions } from "./storage";

const ROOT_ATTR = "data-confluence-toc-renderer";
const SOURCE_ATTR = "data-confluence-toc-renderer-source";
const GENERATED_HEADING_ID_ATTR = "data-confluence-toc-renderer-heading-id";
const SCAN_DEBOUNCE_MS = 250;

const PAGE_ROOT_SELECTORS = [
  '[data-testid="renderer-document"]',
  ".ak-renderer-document",
];

const TITLE_SELECTOR = '[data-testid="title-text"]';

const NATIVE_TOC_SELECTORS = [
  '[data-testid="printable-wrapper"][title="Macro (toc)"]',
  '[data-testid="extension--wrapper"][data-node-type="extension"] [data-macro-name="toc"]',
  ".macro-core.toc-macro.conf-macro.output-block[data-macro-name='toc']",
];

const EXCLUDED_HEADING_ANCESTOR_SELECTORS = [
  `[${ROOT_ATTR}]`,
  '[data-testid="extension--wrapper"][data-node-type="extension"]',
  '[data-testid="printable-wrapper"]',
  ".ak-renderer-extension",
  '[contenteditable="true"]',
];

export type TocEntry = {
  depth: number;
  id: string;
  outline: string;
  text: string;
};

type HeadingCandidate = {
  heading: HTMLElement;
  level: number;
  text: string;
};

let scanTimer: number | undefined;
let currentOptions = DEFAULT_RENDER_OPTIONS;

export function findPageRoot(root: ParentNode = document): HTMLElement | null {
  for (const selector of PAGE_ROOT_SELECTORS) {
    const element = root.querySelector(selector);

    if (element instanceof HTMLElement) {
      return element;
    }
  }

  return null;
}

export function collectTocEntries(
  root: ParentNode = document,
  options: RenderOptions = currentOptions,
): TocEntry[] {
  const pageRoot = findPageRoot(root);

  if (!pageRoot) {
    return [];
  }

  const titleHeading = findTitleHeading();
  const candidates: HeadingCandidate[] = [];

  for (const heading of pageRoot.querySelectorAll("h1, h2, h3, h4, h5, h6")) {
    if (!(heading instanceof HTMLElement)) {
      continue;
    }

    if (!isContentHeading(heading, titleHeading)) {
      continue;
    }

    const text = normalizeText(heading.textContent ?? "");

    if (!text) {
      continue;
    }

    const level = Number.parseInt(heading.tagName.slice(1), 10);

    if (level < options.minLevel || level > options.maxLevel) {
      continue;
    }

    candidates.push({
      heading,
      level,
      text,
    });
  }

  return createTocEntries(candidates);
}

export function renderToc(
  root: ParentNode = document,
  options: RenderOptions = currentOptions,
): void {
  const pageRoot = findPageRoot(root);

  if (!pageRoot) {
    return;
  }

  const existingToc = getExistingToc();

  if (hasNativeToc(pageRoot)) {
    existingToc?.remove();
    return;
  }

  const entries = collectTocEntries(root, options);

  if (entries.length === 0) {
    existingToc?.remove();
    return;
  }

  const sourceKey = createSourceKey(entries, options);

  if (
    existingToc?.isConnected &&
    existingToc.getAttribute(SOURCE_ATTR) === sourceKey
  ) {
    return;
  }

  const toc = createToc(entries, options);
  toc.setAttribute(SOURCE_ATTR, sourceKey);
  existingToc?.remove();
  insertToc(toc, pageRoot);
}

export function observePageChanges(): MutationObserver | undefined {
  if (!document.body) {
    return undefined;
  }

  const observer = new MutationObserver((mutations) => {
    if (mutations.every(isExtensionMutation)) {
      return;
    }

    scheduleRender();
  });

  observer.observe(document.body, {
    characterData: true,
    childList: true,
    subtree: true,
  });

  return observer;
}

function start(): void {
  void startAsync();
}

async function startAsync(): Promise<void> {
  try {
    currentOptions = await readRenderOptions();
  } catch {
    currentOptions = DEFAULT_RENDER_OPTIONS;
  }

  observePageChanges();
  observeOptionChanges();
  scheduleRender();
}

function scheduleRender(): void {
  if (scanTimer !== undefined) {
    window.clearTimeout(scanTimer);
  }

  scanTimer = window.setTimeout(() => {
    scanTimer = undefined;
    renderToc();
  }, SCAN_DEBOUNCE_MS);
}

function findTitleHeading(): HTMLElement | null {
  const element = document.querySelector(TITLE_SELECTOR);
  const heading = element?.closest("h1, h2, h3, h4, h5, h6");

  if (heading instanceof HTMLElement) {
    return heading;
  }

  return null;
}

function hasNativeToc(root: ParentNode): boolean {
  for (const selector of NATIVE_TOC_SELECTORS) {
    for (const element of root.querySelectorAll(selector)) {
      if (
        element instanceof HTMLElement &&
        !element.closest(`[${ROOT_ATTR}]`)
      ) {
        return true;
      }
    }
  }

  return false;
}

function isContentHeading(
  heading: HTMLElement,
  titleHeading: HTMLElement | null,
): boolean {
  if (heading === titleHeading) {
    return false;
  }

  if (heading.hidden || heading.getAttribute("aria-hidden") === "true") {
    return false;
  }

  if (heading.closest(EXCLUDED_HEADING_ANCESTOR_SELECTORS.join(","))) {
    return false;
  }

  return true;
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function createTocEntries(candidates: HeadingCandidate[]): TocEntry[] {
  if (candidates.length === 0) {
    return [];
  }

  const minimumLevel = Math.min(
    ...candidates.map((candidate) => candidate.level),
  );
  const anchorCounts = new Map<string, number>();
  const outlineCounts: number[] = [];
  const usedIds = new Set<string>();

  return candidates.map((candidate) => {
    const depth = Math.max(0, candidate.level - minimumLevel);

    return {
      depth,
      id: ensureHeadingId(
        candidate.heading,
        candidate.text,
        usedIds,
        anchorCounts,
      ),
      outline: nextOutline(depth, outlineCounts),
      text: candidate.text,
    };
  });
}

function nextOutline(depth: number, outlineCounts: number[]): string {
  outlineCounts.length = depth + 1;
  outlineCounts[depth] = (outlineCounts[depth] ?? 0) + 1;

  for (let index = 0; index < depth; index += 1) {
    outlineCounts[index] ??= 1;
  }

  return outlineCounts.slice(0, depth + 1).join(".");
}

function ensureHeadingId(
  heading: HTMLElement,
  text: string,
  usedIds: Set<string>,
  anchorCounts: Map<string, number>,
): string {
  const existingGeneratedId = heading.getAttribute(GENERATED_HEADING_ID_ATTR);
  const candidateId = heading.id || existingGeneratedId;

  if (candidateId && !usedIds.has(candidateId)) {
    usedIds.add(candidateId);
    return candidateId;
  }

  const baseId = createAnchorBase(text);
  let suffix = anchorCounts.get(baseId) ?? 0;
  let id = createAnchorId(baseId, suffix);
  anchorCounts.set(baseId, suffix + 1);

  while (usedIds.has(id) || isConflictingId(id, heading)) {
    suffix = anchorCounts.get(baseId) ?? suffix + 1;
    id = createAnchorId(baseId, suffix);
    anchorCounts.set(baseId, suffix + 1);
  }

  heading.id = id;
  heading.setAttribute(GENERATED_HEADING_ID_ATTR, id);
  usedIds.add(id);

  return id;
}

function isConflictingId(id: string, heading: HTMLElement): boolean {
  const existingElement = document.getElementById(id);
  return Boolean(existingElement && existingElement !== heading);
}

function createAnchorBase(text: string): string {
  return normalizeText(text).replace(/\s+/g, "-") || "section";
}

function createAnchorId(baseId: string, suffix: number): string {
  return suffix === 0 ? baseId : `${baseId}.${suffix}`;
}

function createSourceKey(entries: TocEntry[], options: RenderOptions): string {
  const pageKey = `${window.location.origin}${window.location.pathname}${window.location.search}`;
  return `${pageKey}\n${JSON.stringify(options)}\n${entries
    .map((entry) => `${entry.outline}:${entry.id}:${entry.text}`)
    .join("\n")}`;
}

function createToc(entries: TocEntry[], options: RenderOptions): HTMLElement {
  const tocMacroId = createMacroId();
  const toc = document.createElement("div");
  toc.className = "confluence-toc-renderer ak-renderer-extension";
  toc.setAttribute(ROOT_ATTR, "true");
  toc.setAttribute("data-layout", "default");
  toc.setAttribute("data-local-id", createMacroId());
  toc.setAttribute("data-node-type", "extension");
  toc.setAttribute("data-testid", "extension--wrapper");

  const innerWrapper = document.createElement("div");
  innerWrapper.className =
    "ak-renderer-extension-inner-wrapper ak-renderer-extension-overflow-container";

  const printableWrapper = document.createElement("div");
  printableWrapper.title = "Macro (toc)";
  printableWrapper.setAttribute("data-fabric-macro", tocMacroId);
  printableWrapper.setAttribute("data-macro-body", "true");
  printableWrapper.setAttribute(
    "data-macro-parameters",
    getMacroParameters(options),
  );
  printableWrapper.setAttribute("data-testid", "printable-wrapper");
  printableWrapper.setAttribute("data-vc", "printable-toc-wrapper");
  printableWrapper.setAttribute("data-ssr-placeholder-replace", tocMacroId);

  const macro = document.createElement("div");
  macro.className = "macro-core toc-macro conf-macro output-block";
  macro.setAttribute("data-numberedoutline", String(options.outline));
  macro.setAttribute("data-cssliststyle", "none");
  macro.setAttribute("data-headerelements", "H1,H2,H3,H4,H5,H6");
  macro.setAttribute("data-hasbody", "false");
  macro.setAttribute("data-macro-name", "toc");
  macro.setAttribute("data-macro-id", tocMacroId);
  macro.setAttribute("data-structure", options.type);
  macro.setAttribute("data-vc", "toc");
  macro.setAttribute("data-ssr-placeholder-replace", `toc-${tocMacroId}`);

  if (options.type === "flat") {
    macro.setAttribute("data-preseparator", "[ ");
    macro.setAttribute("data-midseparator", " ] [ ");
    macro.setAttribute("data-postseparator", " ]");
    macro.append(createFlatToc(entries));
  } else {
    macro.append(createNestedList(entries));
  }

  printableWrapper.append(macro);
  innerWrapper.append(printableWrapper);
  toc.append(innerWrapper);

  return toc;
}

function createMacroId(): string {
  return crypto.randomUUID();
}

function getMacroParameters(options: RenderOptions): string {
  return JSON.stringify({
    minLevel: { value: String(options.minLevel) },
    maxLevel: { value: String(options.maxLevel) },
    outline: { value: String(options.outline) },
    style: { value: "none" },
    type: { value: options.type },
    printable: { value: "true" },
  });
}

function createNestedList(entries: TocEntry[]): HTMLUListElement {
  const rootList = createLevelList();
  const lists: HTMLUListElement[] = [rootList];
  const lastItems: Array<HTMLLIElement | undefined> = [];

  for (const entry of entries) {
    while (lists.length > entry.depth + 1) {
      lists.pop();
      lastItems.pop();
    }

    while (lists.length < entry.depth + 1) {
      const parentItem = lastItems[lists.length - 1];

      if (!parentItem) {
        break;
      }

      const nestedList = createLevelList();
      parentItem.append(nestedList);
      lists.push(nestedList);
    }

    const item = createListTocItem(entry);
    lists[lists.length - 1].append(item);
    lastItems[lists.length - 1] = item;
  }

  return rootList;
}

function createLevelList(): HTMLUListElement {
  const list = document.createElement("ul");
  list.setAttribute("data-testid", "list-style-toc-level-container");

  return list;
}

function createFlatToc(entries: TocEntry[]): HTMLSpanElement {
  const container = document.createElement("span");
  container.className = "toc-item-container";
  container.setAttribute("data-testid", "flat-style-toc-item-container");

  for (const [index, entry] of entries.entries()) {
    const separator = document.createElement("span");
    separator.className = "toc-separator";
    separator.textContent = index === 0 ? "[ " : " ] [ ";
    container.append(separator, createTocItemBody(entry));
  }

  const finalSeparator = document.createElement("span");
  finalSeparator.className = "toc-separator";
  finalSeparator.textContent = " ]";
  container.append(finalSeparator);

  return container;
}

function createListTocItem(entry: TocEntry): HTMLLIElement {
  const item = document.createElement("li");
  item.setAttribute("data-testid", "list-style-toc-item-container");
  item.style.setProperty("--_1vjxhb3", "none");
  item.append(createTocItemBody(entry));

  return item;
}

function createTocItemBody(entry: TocEntry): HTMLSpanElement {
  const body = document.createElement("span");
  body.className = "toc-item-body";
  body.setAttribute("data-outline", entry.outline);

  const outline = document.createElement("span");
  outline.className = "confluence-toc-renderer-outline";
  outline.textContent = `${entry.outline} `;

  const link = document.createElement("a");
  link.className = "toc-link";
  link.href = `#${encodeURIComponent(entry.id)}`;
  link.setAttribute("data-testid", "toc-item-body");
  link.textContent = entry.text;
  link.addEventListener("click", (event) => {
    scrollToHeading(event, entry.id);
  });

  body.append(outline, link);

  return body;
}

function insertToc(toc: HTMLElement, pageRoot: HTMLElement): void {
  pageRoot.prepend(toc);
}

function scrollToHeading(event: MouseEvent, id: string): void {
  const heading = document.getElementById(id);

  if (!heading) {
    return;
  }

  event.preventDefault();
  heading.scrollIntoView({
    block: "start",
    behavior: "smooth",
  });
  updateLocationHash(id);
}

function updateLocationHash(id: string): void {
  const nextUrl = new URL(window.location.href);
  nextUrl.hash = encodeURIComponent(id);
  window.history.replaceState(null, "", nextUrl);
}

function observeOptionChanges(): void {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "sync") {
      return;
    }

    const change = changes[RENDER_OPTIONS_STORAGE_KEY];

    if (!change) {
      return;
    }

    currentOptions = normalizeRenderOptions(
      (change.newValue ?? DEFAULT_RENDER_OPTIONS) as Partial<
        Record<keyof RenderOptions, unknown>
      >,
    );
    scheduleRender();
  });
}

function getExistingToc(): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[${ROOT_ATTR}]`);
}

function isExtensionMutation(mutation: MutationRecord): boolean {
  const changedNodes = [...mutation.addedNodes, ...mutation.removedNodes];

  if (changedNodes.length === 0) {
    return isExtensionNode(mutation.target);
  }

  return changedNodes.every(isExtensionNode);
}

function isExtensionNode(node: Node): boolean {
  if (!(node instanceof HTMLElement)) {
    return false;
  }

  return Boolean(node.closest(`[${ROOT_ATTR}]`));
}

function shouldAutoStart(): boolean {
  return import.meta.env.MODE !== "test";
}

if (shouldAutoStart() && document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start, { once: true });
} else if (shouldAutoStart()) {
  start();
}
