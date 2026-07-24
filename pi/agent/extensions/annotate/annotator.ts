import { readFile } from "node:fs/promises";
import { relative } from "node:path";
import { open } from "glimpseui";
import { buildAnnotatorHTML } from "./annotator-page.ts";
import {
  annotationDraftKey,
  AnnotationStateStore,
} from "./annotator-state.ts";

export type Annotation =
  | {
      id: string;
      kind: "selection";
      start: number;
      end: number;
      comment: string;
    }
  | {
      id: string;
      kind: "document";
      comment: string;
    };

export interface AnnotatorResult {
  action: "insert" | "send";
  annotations: Annotation[];
}

export interface CompletedAnnotation extends AnnotatorResult {
  path: string;
  displayPath: string;
  source: string;
}

export async function annotateMarkdown(
  path: string,
  cwd: string,
): Promise<CompletedAnnotation | null> {
  const source = await readFile(path, "utf8");
  const displayPath = relative(cwd, path) || path;

  const stateStore = await AnnotationStateStore.load();
  const draftKey = annotationDraftKey(path);
  const initialState = stateStore.initialValues(draftKey);
  const rawResult = await runAnnotator(
    buildAnnotatorHTML({ path, displayPath, source, ...initialState }),
    displayPath,
    draftKey,
    stateStore,
  );

  if (rawResult === null) {
    return null;
  }

  return {
    ...validateResult(rawResult, source.length),
    path,
    displayPath,
    source,
  };
}

async function runAnnotator(
  html: string,
  displayPath: string,
  draftKey: string,
  stateStore: AnnotationStateStore,
): Promise<unknown | null> {
  const window = open(html, {
    width: 1_280,
    height: 840,
    title: `Annotate — ${displayPath}`,
    noDock: true,
  });

  return new Promise((resolve, reject) => {
    let settled = false;
    let saveTimer: ReturnType<typeof setTimeout> | undefined;
    let saveChain = Promise.resolve();

    const save = () => {
      clearTimeout(saveTimer);
      saveChain = saveChain.then(() => stateStore.save()).catch(() => {});
      return saveChain;
    };

    const scheduleSave = () => {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(save, 200);
    };

    const applyPersistence = (message: Record<string, unknown>): boolean => {
      if (message.draftKey !== draftKey) {
        return false;
      }

      const { settings, draft } = message;
      if (
        (settings !== null && typeof settings !== "string") ||
        (draft !== null && typeof draft !== "string")
      ) {
        return false;
      }

      stateStore.apply({ settings, draftKey, draft });
      return true;
    };

    window.on("message", (value) => {
      if (settled || !isRecord(value) || !applyPersistence(value)) {
        return;
      }

      if (value.type === "persist") {
        scheduleSave();
        return;
      }

      if (value.type === "result") {
        settled = true;
        void save().finally(() => {
          window.close();
          resolve(value.result);
        });
        return;
      }

      if (value.type === "close") {
        settled = true;
        void save().finally(() => {
          window.close();
          resolve(null);
        });
      }
    });

    window.once("closed", () => {
      if (settled) {
        return;
      }
      settled = true;
      void save().finally(() => resolve(null));
    });

    window.once("error", (error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(saveTimer);
      window.close();
      reject(error);
    });
  });
}

function validateResult(value: unknown, sourceLength: number): AnnotatorResult {
  if (!isRecord(value)) {
    throw new Error("Annotator returned a non-object result");
  }

  if (value.action !== "insert" && value.action !== "send") {
    throw new Error("Annotator returned an invalid action");
  }

  if (!Array.isArray(value.annotations)) {
    throw new Error("Annotator returned invalid annotations");
  }

  const seenIds = new Set<string>();
  const annotations = value.annotations.map((item, index): Annotation => {
    if (!isRecord(item)) {
      throw new Error(`Annotation ${index + 1} is not an object`);
    }

    if (
      typeof item.id !== "string" ||
      item.id === "" ||
      typeof item.comment !== "string"
    ) {
      throw new Error(`Annotation ${index + 1} is invalid`);
    }

    const comment = item.comment.trim();
    if (comment === "") {
      throw new Error(`Annotation ${index + 1} is invalid`);
    }

    if (seenIds.has(item.id)) {
      throw new Error(`Annotation ${index + 1} has a duplicate id`);
    }
    seenIds.add(item.id);

    if (item.kind === "document") {
      return {
        id: item.id,
        kind: "document",
        comment,
      };
    }

    if (
      item.kind !== "selection" ||
      !Number.isInteger(item.start) ||
      !Number.isInteger(item.end) ||
      (item.start as number) < 0 ||
      (item.end as number) <= (item.start as number) ||
      (item.end as number) > sourceLength
    ) {
      throw new Error(`Annotation ${index + 1} has an invalid source range`);
    }

    return {
      id: item.id,
      kind: "selection",
      start: item.start as number,
      end: item.end as number,
      comment,
    };
  });

  return {
    action: value.action,
    annotations,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
