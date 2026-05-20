export const MIN_HEADING_LEVEL = 1;
export const MAX_HEADING_LEVEL = 6;
export const HEADING_LEVELS = [1, 2, 3, 4, 5, 6] as const;
export const RENDER_OPTIONS_STORAGE_KEY = "renderOptions";
export const TOC_STRUCTURES = ["list", "flat"] as const;

export type TocStructure = (typeof TOC_STRUCTURES)[number];

export type RenderOptions = {
  maxLevel: number;
  minLevel: number;
  outline: boolean;
  type: TocStructure;
};

export const DEFAULT_RENDER_OPTIONS: RenderOptions = {
  maxLevel: MAX_HEADING_LEVEL,
  minLevel: MIN_HEADING_LEVEL,
  outline: false,
  type: "list",
};

export function normalizeRenderOptions(
  rawOptions: Partial<Record<keyof RenderOptions, unknown>> = {},
): RenderOptions {
  const rawMinLevel = normalizeHeadingLevel(
    rawOptions.minLevel,
    DEFAULT_RENDER_OPTIONS.minLevel,
  );
  const rawMaxLevel = normalizeHeadingLevel(
    rawOptions.maxLevel,
    DEFAULT_RENDER_OPTIONS.maxLevel,
  );

  return {
    maxLevel: Math.max(rawMinLevel, rawMaxLevel),
    minLevel: Math.min(rawMinLevel, rawMaxLevel),
    outline: rawOptions.outline === true,
    type: normalizeTocStructure(rawOptions.type),
  };
}

function normalizeHeadingLevel(value: unknown, fallback: number): number {
  const numberValue =
    typeof value === "number" ? value : Number.parseInt(String(value), 10);

  if (!Number.isFinite(numberValue)) {
    return fallback;
  }

  return Math.min(
    MAX_HEADING_LEVEL,
    Math.max(MIN_HEADING_LEVEL, Math.trunc(numberValue)),
  );
}

function normalizeTocStructure(value: unknown): TocStructure {
  return TOC_STRUCTURES.includes(value as TocStructure)
    ? (value as TocStructure)
    : DEFAULT_RENDER_OPTIONS.type;
}
