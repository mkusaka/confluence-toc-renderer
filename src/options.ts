import "./options.css";
import {
  DEFAULT_RENDER_OPTIONS,
  HEADING_LEVELS,
  normalizeRenderOptions,
  type RenderOptions,
  type TocStructure,
} from "./settings";
import { readRenderOptions, writeRenderOptions } from "./storage";

const form = getRequiredElement<HTMLFormElement>("toc-options-form");
const minLevelSelect = getRequiredElement<HTMLSelectElement>("min-level");
const maxLevelSelect = getRequiredElement<HTMLSelectElement>("max-level");
const outlineInput = getRequiredElement<HTMLInputElement>("outline");
const resetButton = getRequiredElement<HTMLButtonElement>("reset");
const statusOutput = getRequiredElement<HTMLOutputElement>("status");

let statusTimer: number | undefined;

populateHeadingLevelSelect(minLevelSelect);
populateHeadingLevelSelect(maxLevelSelect);

readRenderOptions()
  .then((options) => {
    applyOptionsToForm(options);
  })
  .catch((error: unknown) => {
    applyOptionsToForm(DEFAULT_RENDER_OPTIONS);
    showStatus(error instanceof Error ? error.message : "Failed to load");
  });

form.addEventListener("change", () => {
  void saveCurrentFormOptions();
});

resetButton.addEventListener("click", () => {
  applyOptionsToForm(DEFAULT_RENDER_OPTIONS);
  void saveCurrentFormOptions("Defaults restored");
});

function populateHeadingLevelSelect(select: HTMLSelectElement): void {
  for (const level of HEADING_LEVELS) {
    const option = document.createElement("option");
    option.value = String(level);
    option.textContent = `H${level}`;
    select.append(option);
  }
}

async function saveCurrentFormOptions(message = "Saved"): Promise<void> {
  const options = getOptionsFromForm();
  applyOptionsToForm(options);

  try {
    await writeRenderOptions(options);
    showStatus(message);
  } catch (error: unknown) {
    showStatus(error instanceof Error ? error.message : "Failed to save");
  }
}

function applyOptionsToForm(options: RenderOptions): void {
  minLevelSelect.value = String(options.minLevel);
  maxLevelSelect.value = String(options.maxLevel);
  outlineInput.checked = options.outline;

  const typeInput = form.querySelector<HTMLInputElement>(
    `input[name="type"][value="${options.type}"]`,
  );

  if (typeInput) {
    typeInput.checked = true;
  }
}

function getOptionsFromForm(): RenderOptions {
  const formData = new FormData(form);

  return normalizeRenderOptions({
    maxLevel: formData.get("maxLevel"),
    minLevel: formData.get("minLevel"),
    outline: outlineInput.checked,
    type: formData.get("type") as TocStructure | null,
  });
}

function showStatus(message: string): void {
  window.clearTimeout(statusTimer);
  statusOutput.value = message;
  statusTimer = window.setTimeout(() => {
    statusOutput.value = "";
  }, 1500);
}

function getRequiredElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);

  if (!element) {
    throw new Error(`Missing element: ${id}`);
  }

  return element as T;
}
