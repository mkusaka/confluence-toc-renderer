# confluence-toc-renderer

Chrome extension that renders a Confluence Cloud page table of contents below
the page title using markup that follows Confluence's TOC macro output.

## Requirements

- Node.js
- pnpm 11
- Chrome

## Install

```sh
pnpm install
```

## Build

```sh
pnpm build
```

Build output is written to `dist/`. The extension manifest is generated from
`src/manifest.ts`, and content styles are imported from `src/content.ts` so Vite
emits the CSS used by the content script.

The JavaScript bundle is emitted as ASCII-only output so Chrome can load it
reliably.

## Load the extension in Chrome

1. Open `chrome://extensions/`.
2. Enable Developer mode.
3. Click Load unpacked.
4. Select this repository's `dist/` directory.
5. Open or reload a Confluence Cloud page under
   `https://*.atlassian.net/wiki/*`.

## Test on Confluence

Open a Confluence Cloud page that has body headings. The extension collects
visible `h1` through `h6` headings from the rendered page body, ignores the page
title, navigation regions, and native TOC macros, and inserts a Confluence-style
TOC below the page title.

If the page already contains Confluence's native Table of Contents macro, the
extension does not render its own table of contents.

Use an internal Confluence sample page with:

- `h2`, `h3`, and `h4` headings
- Japanese headings
- English headings
- duplicate headings
- a long heading for overflow checks

The generated DOM follows the list-style TOC macro shape, including
`ak-renderer-extension`, `printable-wrapper`,
`macro-core toc-macro conf-macro output-block`, nested `ul` containers,
`toc-item-body`, `toc-link`, and `data-outline` attributes. Selectors are kept
to the observed Confluence renderer DOM instead of broad page-wide fallbacks.
Heading anchors use the same practical shape as the rendered macro output:
heading text with spaces replaced by `-`, and duplicate headings suffixed with
`.1`, `.2`, and so on.

## Options

Open Chrome's extension details for Confluence TOC Renderer and choose
Extension options. The options page stores rendering preferences in
`chrome.storage.sync`.

Available options:

- Minimum heading level
- Maximum heading level
- Structure: list or flat
- Numbered outline

`style=none` and `printable=true` are fixed because the generated DOM follows
the observed Confluence TOC macro output.

## Development

```sh
pnpm format
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm icons:generate
pnpm build
pnpm package
pnpm check
```

`pnpm test` runs the Vitest/jsdom tests for TOC collection, list/flat rendering,
and option normalization.

`pnpm check` runs formatting check, lint, TypeScript type checking, tests, and
then builds the extension.

`pnpm package` builds the extension and writes a Chrome extension package to
`package.zip`.

Icon PNGs are generated from `assets/icon.svg` into `public/icons/`.
Regenerating them requires ImageMagick's `magick` command.

GitHub Actions workflow checks:

```sh
go run github.com/rhysd/actionlint/cmd/actionlint@v1.7.12
go run github.com/suzuki-shunsuke/ghalint/cmd/ghalint@v1.5.6 run
go run github.com/suzuki-shunsuke/pinact/v3/cmd/pinact@v3.10.0 run --check
uvx zizmor==1.25.0 --format=plain --collect=workflows .
```

## Security

- The extension does not inject CDN scripts.
- The manifest only requests the `storage` permission for rendering options.
- The only content script match target is `https://*.atlassian.net/wiki/*`.
- The extension only mutates the local browser DOM and does not update
  Confluence content.

## Limitations

- The rendered table of contents is visible only to users who have this
  extension installed.
- The table of contents does not change Confluence page content.
- The table of contents does not affect Confluence PDF export or what other
  users see.
- Confluence Cloud DOM structure may change; selectors may need updates if
  Atlassian changes rendered page markup.
