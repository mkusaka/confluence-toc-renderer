import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { collectTocEntries, observePageChanges, renderToc } from "./content";
import { DEFAULT_RENDER_OPTIONS, type RenderOptions } from "./settings";

const SAMPLE_PAGE_HTML = `
  <main>
    <h1><span data-testid="title-text">Verification page</span></h1>
    <div data-testid="renderer-document" class="ak-renderer-document">
      <h2>前提</h2>
      <h3>対象ページ</h3>
      <h3>対象外</h3>
      <h2>基本セクション</h2>
      <h3>日本語見出し</h3>
      <h3>English heading</h3>
      <h4>Nested level 4</h4>
      <h2>重複見出し</h2>
      <h3>同じ名前</h3>
      <h3>同じ名前</h3>
      <div class="ak-renderer-extension" data-node-type="extension" data-testid="extension--wrapper">
        <h2>Ignored extension heading</h2>
      </div>
      <h2>末尾セクション</h2>
    </div>
  </main>
`;

const COMMENT_THEN_PAGE_HTML = `
  <div class="ak-renderer-wrapper is-comment">
    <div class="ak-renderer-document">
      <p>Inline comment body</p>
    </div>
  </div>
  <main>
    <h1><span data-testid="title-text">Verification page</span></h1>
    <div class="ak-renderer-document">
      <h2>Page section</h2>
    </div>
  </main>
`;

const OPTIONS: RenderOptions = {
  ...DEFAULT_RENDER_OPTIONS,
  maxLevel: 4,
  minLevel: 2,
};

beforeEach(() => {
  document.body.innerHTML = SAMPLE_PAGE_HTML;

  let index = 0;
  vi.stubGlobal("crypto", {
    randomUUID: () =>
      `00000000-0000-4000-8000-${String(++index).padStart(12, "0")}`,
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("collectTocEntries", () => {
  it("collects Confluence body headings with macro-compatible anchors", () => {
    expect(collectTocEntries(document, OPTIONS)).toEqual([
      { depth: 0, id: "前提", outline: "1", text: "前提" },
      { depth: 1, id: "対象ページ", outline: "1.1", text: "対象ページ" },
      { depth: 1, id: "対象外", outline: "1.2", text: "対象外" },
      {
        depth: 0,
        id: "基本セクション",
        outline: "2",
        text: "基本セクション",
      },
      {
        depth: 1,
        id: "日本語見出し",
        outline: "2.1",
        text: "日本語見出し",
      },
      {
        depth: 1,
        id: "English-heading",
        outline: "2.2",
        text: "English heading",
      },
      {
        depth: 2,
        id: "Nested-level-4",
        outline: "2.2.1",
        text: "Nested level 4",
      },
      { depth: 0, id: "重複見出し", outline: "3", text: "重複見出し" },
      { depth: 1, id: "同じ名前", outline: "3.1", text: "同じ名前" },
      { depth: 1, id: "同じ名前.1", outline: "3.2", text: "同じ名前" },
      { depth: 0, id: "末尾セクション", outline: "4", text: "末尾セクション" },
    ]);
  });

  it("respects heading level options", () => {
    const entries = collectTocEntries(document, {
      ...OPTIONS,
      maxLevel: 3,
      minLevel: 3,
    });

    expect(entries.map((entry) => entry.text)).toEqual([
      "対象ページ",
      "対象外",
      "日本語見出し",
      "English heading",
      "同じ名前",
      "同じ名前",
    ]);
    expect(entries.map((entry) => entry.outline)).toEqual([
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
    ]);
  });
});

describe("renderToc", () => {
  it("renders list markup shaped like the Confluence TOC macro", () => {
    renderToc(document, {
      ...OPTIONS,
      outline: true,
      type: "list",
    });

    const toc = document.querySelector<HTMLElement>(
      "[data-confluence-toc-renderer]",
    );
    const macro = document.querySelector<HTMLElement>(
      ".macro-core.toc-macro.conf-macro.output-block",
    );
    const printableWrapper = document.querySelector<HTMLElement>(
      '[data-testid="printable-wrapper"]',
    );
    const pageRoot = document.querySelector<HTMLElement>(
      '[data-testid="renderer-document"]',
    );

    expect(pageRoot?.firstElementChild).toBe(toc);
    expect(printableWrapper?.title).toBe("Macro (toc)");
    expect(printableWrapper?.dataset.macroBody).toBe("true");
    expect(macro?.dataset.macroName).toBe("toc");
    expect(macro?.dataset.numberedoutline).toBe("true");
    expect(macro?.dataset.structure).toBe("list");
    expect(
      macro?.querySelectorAll('[data-testid="list-style-toc-item-container"]'),
    ).toHaveLength(11);
    expect(
      macro?.querySelector('[data-testid="flat-style-toc-item-container"]'),
    ).toBeNull();

    const macroParameters = JSON.parse(
      printableWrapper?.dataset.macroParameters ?? "{}",
    ) as Record<string, { value: string }>;

    expect(macroParameters).toMatchObject({
      maxLevel: { value: "4" },
      minLevel: { value: "2" },
      outline: { value: "true" },
      style: { value: "none" },
      type: { value: "list" },
    });
  });

  it("renders skipped heading levels as siblings under the nearest heading parent", () => {
    document.body.innerHTML = `
      <main>
        <h1><span data-testid="title-text">Verification page</span></h1>
        <div data-testid="renderer-document" class="ak-renderer-document">
          <section class="confluence-autolinks" data-confluence-autolinks="true">
            <div class="confluence-autolinks__header">
              <h1>Related links</h1>
            </div>
            <section class="confluence-autolinks__section">
              <h3>Backlinks (5)</h3>
            </section>
            <section class="confluence-autolinks__section">
              <h3>Child items depth 2 (0)</h3>
            </section>
          </section>
        </div>
      </main>
    `;

    expect(collectTocEntries(document, DEFAULT_RENDER_OPTIONS)).toEqual([
      { depth: 0, id: "Related-links", outline: "1", text: "Related links" },
      {
        depth: 2,
        id: "Backlinks-(5)",
        outline: "1.1.1",
        text: "Backlinks (5)",
      },
      {
        depth: 2,
        id: "Child-items-depth-2-(0)",
        outline: "1.1.2",
        text: "Child items depth 2 (0)",
      },
    ]);

    renderToc(document, {
      ...DEFAULT_RENDER_OPTIONS,
      outline: true,
      type: "list",
    });

    const relatedItem = document
      .querySelector<HTMLElement>('.toc-item-body[data-outline="1"]')
      ?.closest('[data-testid="list-style-toc-item-container"]');
    const relatedChildOutlines = Array.from(
      relatedItem?.querySelector(":scope > ul")?.children ?? [],
    ).map(
      (item) =>
        item.querySelector<HTMLElement>(":scope > .toc-item-body")?.dataset
          .outline,
    );

    expect(relatedChildOutlines).toEqual(["1.1.1", "1.1.2"]);
    expect(
      document
        .querySelector<HTMLElement>('.toc-item-body[data-outline="1.1.1"]')
        ?.closest('[data-testid="list-style-toc-item-container"]')
        ?.querySelector('.toc-item-body[data-outline="1.1.2"]'),
    ).toBeNull();
  });

  it("renders flat markup with observed Confluence separators", () => {
    renderToc(document, {
      ...OPTIONS,
      outline: false,
      type: "flat",
    });

    const macro = document.querySelector<HTMLElement>(
      ".macro-core.toc-macro.conf-macro.output-block",
    );
    const flatContainer = macro?.querySelector(
      '[data-testid="flat-style-toc-item-container"]',
    );

    expect(macro?.dataset.structure).toBe("flat");
    expect(macro?.dataset.preseparator).toBe("[ ");
    expect(macro?.dataset.midseparator).toBe(" ] [ ");
    expect(macro?.dataset.postseparator).toBe(" ]");
    expect(flatContainer).not.toBeNull();
    expect(macro?.querySelectorAll(".toc-item-body")).toHaveLength(11);
    expect(macro?.textContent?.startsWith("[ 1 前提 ] [ 1.1 対象ページ")).toBe(
      true,
    );
  });

  it("does not render when a native TOC macro is already present", () => {
    document
      .querySelector('[data-testid="renderer-document"]')
      ?.insertAdjacentHTML(
        "afterbegin",
        `
        <div data-testid="extension--wrapper" data-node-type="extension">
          <div class="macro-core toc-macro conf-macro output-block" data-macro-name="toc"></div>
        </div>
      `,
      );

    renderToc(document, OPTIONS);

    expect(document.querySelector("[data-confluence-toc-renderer]")).toBeNull();
  });

  it("renders in the page body when an inline comment renderer appears first", () => {
    document.body.innerHTML = COMMENT_THEN_PAGE_HTML;

    renderToc(document, OPTIONS);

    const commentRoot = document.querySelector<HTMLElement>(
      ".ak-renderer-wrapper.is-comment .ak-renderer-document",
    );
    const pageRoot = document.querySelector<HTMLElement>(
      "main > .ak-renderer-document",
    );
    const toc = document.querySelector<HTMLElement>(
      "[data-confluence-toc-renderer]",
    );

    expect(
      commentRoot?.querySelector("[data-confluence-toc-renderer]"),
    ).toBeNull();
    expect(pageRoot?.firstElementChild).toBe(toc);
    expect(toc?.textContent).toContain("Page section");
  });
});

describe("observePageChanges", () => {
  it("debounces page changes before rendering", async () => {
    vi.useFakeTimers();

    const observer = observePageChanges();
    document
      .querySelector('[data-testid="renderer-document"]')
      ?.append(document.createElement("p"));
    await Promise.resolve();

    expect(document.querySelector("[data-confluence-toc-renderer]")).toBeNull();

    await vi.advanceTimersByTimeAsync(249);
    expect(document.querySelector("[data-confluence-toc-renderer]")).toBeNull();

    await vi.advanceTimersByTimeAsync(1);
    expect(
      document.querySelector("[data-confluence-toc-renderer]"),
    ).not.toBeNull();

    observer?.disconnect();
  });
});
