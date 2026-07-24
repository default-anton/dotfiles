import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const statePath = join(homedir(), ".pi", "agent", "annotate-state.json");
const maxDraftAge = 30 * 24 * 60 * 60 * 1_000;
const maxDrafts = 100;

interface StoredState {
  version: 1;
  settings: string | null;
  drafts: Record<string, string>;
}

export interface AnnotationPersistence {
  settings: string | null;
  draftKey: string;
  draft: string | null;
}

export function annotationDraftKey(path: string): string {
  let hash = 2_166_136_261;
  for (let index = 0; index < path.length; index += 1) {
    hash ^= path.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return `pi-annotate:draft:${(hash >>> 0).toString(36)}`;
}

export class AnnotationStateStore {
  private state: StoredState;

  private constructor(state: StoredState) {
    this.state = state;
  }

  static async load(): Promise<AnnotationStateStore> {
    let state: StoredState = { version: 1, settings: null, drafts: {} };

    try {
      const value: unknown = JSON.parse(await readFile(statePath, "utf8"));
      if (isRecord(value) && value.version === 1) {
        state = {
          version: 1,
          settings: typeof value.settings === "string" ? value.settings : null,
          drafts: readDrafts(value.drafts),
        };
      }
    } catch (error) {
      if (!isMissingFile(error)) {
        state = { version: 1, settings: null, drafts: {} };
      }
    }

    pruneDrafts(state.drafts);
    return new AnnotationStateStore(state);
  }

  initialValues(draftKey: string): {
    settings: string | null;
    draft: string | null;
  } {
    return {
      settings: this.state.settings,
      draft: this.state.drafts[draftKey] ?? null,
    };
  }

  apply(update: AnnotationPersistence): void {
    this.state.settings = update.settings;
    if (update.draft === null) {
      delete this.state.drafts[update.draftKey];
    } else {
      this.state.drafts[update.draftKey] = update.draft;
    }
    pruneDrafts(this.state.drafts);
  }

  async save(): Promise<void> {
    await mkdir(dirname(statePath), { recursive: true });
    const temporaryPath = `${statePath}.${process.pid}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(this.state, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
    await rename(temporaryPath, statePath);
  }
}

function readDrafts(value: unknown): Record<string, string> {
  if (!isRecord(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

function pruneDrafts(drafts: Record<string, string>): void {
  const now = Date.now();
  const entries = Object.entries(drafts)
    .map(([key, value]) => ({ key, value, savedAt: readSavedAt(value) }))
    .filter((entry) => now - entry.savedAt <= maxDraftAge)
    .sort((left, right) => right.savedAt - left.savedAt)
    .slice(0, maxDrafts);

  for (const key of Object.keys(drafts)) {
    delete drafts[key];
  }
  for (const entry of entries) {
    drafts[entry.key] = entry.value;
  }
}

function readSavedAt(value: string): number {
  try {
    const draft: unknown = JSON.parse(value);
    if (isRecord(draft) && typeof draft.savedAt === "number") {
      return draft.savedAt;
    }
  } catch {}
  return 0;
}

function isMissingFile(error: unknown): boolean {
  return isRecord(error) && error.code === "ENOENT";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
