import { lstat, mkdir, readFile, realpath, unlink, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { addedFileContent, applyUpdate, type Patch } from "./patch.ts";

export type PlannedChange = {
  path: string;
  oldContent: string;
  newContent: string;
};

export type VerifiedPatch = {
  root: string;
  mutations: Mutation[];
  expected: Map<string, Buffer | null>;
  changes: PlannedChange[];
  summary: string[];
};

type Mutation =
  | { type: "write"; path: string; content: Buffer }
  | { type: "delete"; path: string }
  | { type: "move"; source: string; destination: string; content: Buffer };

type TextFile = {
  raw: Buffer;
  text: string;
  bom: string;
  lineEnding: "\n" | "\r\n";
};

function decodeText(raw: Buffer, path: string): TextFile {
  if (raw.includes(0)) throw new Error(`Cannot patch binary file: ${path}.`);
  let decoded: string;
  try {
    decoded = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(raw);
  } catch {
    throw new Error(`Cannot patch non-UTF-8 file: ${path}.`);
  }
  const bom = decoded.startsWith("\uFEFF") ? "\uFEFF" : "";
  const text = bom ? decoded.slice(1) : decoded;
  const firstLf = text.indexOf("\n");
  const lineEnding = firstLf > 0 && text[firstLf - 1] === "\r" ? "\r\n" : "\n";
  return { raw, text: text.replace(/\r\n/g, "\n").replace(/\r/g, "\n"), bom, lineEnding };
}

function encodeText(text: string, source?: TextFile): Buffer {
  const lineEnding = source?.lineEnding ?? "\n";
  const restored = lineEnding === "\r\n" ? text.replace(/\n/g, "\r\n") : text;
  return Buffer.from(`${source?.bom ?? ""}${restored}`, "utf8");
}

function isWithin(root: string, path: string): boolean {
  const rel = relative(root, path);
  return rel !== "" && rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

function resolvePatchPath(root: string, path: string): string {
  if (isAbsolute(path)) throw new Error(`Patch paths must be relative to the working directory: ${path}.`);
  const absolutePath = resolve(root, path);
  if (!isWithin(root, absolutePath)) throw new Error(`Patch path escapes the working directory: ${path}.`);
  return absolutePath;
}

async function assertSafePath(root: string, path: string): Promise<void> {
  if (!isWithin(root, path)) throw new Error(`Patch path escapes the working directory: ${path}.`);
  const parts = relative(root, path).split(sep);
  let current = root;
  for (const part of parts) {
    current = resolve(current, part);
    try {
      const stat = await lstat(current);
      if (stat.isSymbolicLink()) throw new Error(`Patch paths cannot contain symbolic links: ${current}.`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw error;
    }
  }
}

async function readExistingText(root: string, path: string, displayPath: string): Promise<TextFile> {
  await assertSafePath(root, path);
  let stat;
  try {
    stat = await lstat(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`File not found: ${displayPath}.`);
    }
    throw error;
  }
  if (!stat.isFile()) throw new Error(`Patch target is not a file: ${displayPath}.`);
  return decodeText(await readFile(path), displayPath);
}

async function readOptionalText(root: string, path: string, displayPath: string): Promise<TextFile | undefined> {
  await assertSafePath(root, path);
  try {
    const stat = await lstat(path);
    if (!stat.isFile()) throw new Error(`Patch target is not a file: ${displayPath}.`);
    return decodeText(await readFile(path), displayPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

function addExpected(expected: Map<string, Buffer | null>, path: string, value: Buffer | null): void {
  if (expected.has(path)) throw new Error(`Patch changes the same path more than once: ${path}.`);
  expected.set(path, value);
}

export async function verifyPatch(patch: Patch, cwd: string): Promise<VerifiedPatch> {
  const root = await realpath(cwd);
  const mutations: Mutation[] = [];
  const expected = new Map<string, Buffer | null>();
  const changes: PlannedChange[] = [];
  const summary: string[] = [];

  for (const operation of patch.operations) {
    const sourcePath = resolvePatchPath(root, operation.path);

    if (operation.type === "add") {
      const existing = await readOptionalText(root, sourcePath, operation.path);
      addExpected(expected, sourcePath, existing?.raw ?? null);
      const newContent = addedFileContent(operation.lines);
      mutations.push({ type: "write", path: sourcePath, content: encodeText(newContent, existing) });
      changes.push({ path: operation.path, oldContent: existing?.text ?? "", newContent });
      summary.push(`A ${operation.path}`);
      continue;
    }

    const source = await readExistingText(root, sourcePath, operation.path);
    addExpected(expected, sourcePath, source.raw);

    if (operation.type === "delete") {
      mutations.push({ type: "delete", path: sourcePath });
      changes.push({ path: operation.path, oldContent: source.text, newContent: "" });
      summary.push(`D ${operation.path}`);
      continue;
    }

    const newContent = applyUpdate(source.text, operation.chunks, operation.path);
    if (!operation.movePath && newContent === source.text) {
      throw new Error(`Patch makes no changes to ${operation.path}.`);
    }
    if (operation.movePath) {
      const destinationPath = resolvePatchPath(root, operation.movePath);
      const destination = await readOptionalText(root, destinationPath, operation.movePath);
      addExpected(expected, destinationPath, destination?.raw ?? null);
      mutations.push({
        type: "move",
        source: sourcePath,
        destination: destinationPath,
        content: encodeText(newContent, source),
      });
      changes.push({ path: operation.path, oldContent: source.text, newContent: "" });
      changes.push({ path: operation.movePath, oldContent: destination?.text ?? "", newContent });
      summary.push(`M ${operation.path} -> ${operation.movePath}`);
    } else {
      mutations.push({ type: "write", path: sourcePath, content: encodeText(newContent, source) });
      changes.push({ path: operation.path, oldContent: source.text, newContent });
      summary.push(`M ${operation.path}`);
    }
  }

  return { root, mutations, expected, changes, summary };
}

async function currentRaw(path: string): Promise<Buffer | null> {
  try {
    return await readFile(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

function sameBuffer(left: Buffer | null, right: Buffer | null): boolean {
  if (left === null || right === null) return left === right;
  return left.equals(right);
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new Error("Operation aborted.");
}

export async function applyVerifiedPatch(verified: VerifiedPatch, signal?: AbortSignal): Promise<void> {
  throwIfAborted(signal);
  for (const [path, expected] of verified.expected) {
    await assertSafePath(verified.root, path);
    if (!sameBuffer(await currentRaw(path), expected)) {
      throw new Error(`File changed while the patch was being prepared: ${relative(verified.root, path)}.`);
    }
  }

  for (const mutation of verified.mutations) {
    throwIfAborted(signal);
    if (mutation.type === "delete") {
      await assertSafePath(verified.root, mutation.path);
      await unlink(mutation.path);
      continue;
    }
    if (mutation.type === "move") {
      await assertSafePath(verified.root, mutation.destination);
      await mkdir(dirname(mutation.destination), { recursive: true });
      await assertSafePath(verified.root, mutation.destination);
      await writeFile(mutation.destination, mutation.content);
      await assertSafePath(verified.root, mutation.source);
      await unlink(mutation.source);
      continue;
    }
    await assertSafePath(verified.root, mutation.path);
    await mkdir(dirname(mutation.path), { recursive: true });
    await assertSafePath(verified.root, mutation.path);
    await writeFile(mutation.path, mutation.content);
  }
  throwIfAborted(signal);
}
