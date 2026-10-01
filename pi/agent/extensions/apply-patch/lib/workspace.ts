import { lstat, mkdir, readFile, readlink, realpath, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, relative, resolve } from "node:path";
import { addedFileContent, applyUpdate, type Patch } from "./patch.ts";

export type PlannedChange = {
  path: string;
  oldContent: string;
  newContent: string;
};

export type VerifiedPatch = {
  root: string;
  mutations: Mutation[];
  expected: Map<string, ExpectedEntry>;
  resolutions: PathResolution[];
  changes: PlannedChange[];
  summary: string[];
};

type Mutation =
  | { type: "write"; path: string; content: Buffer }
  | { type: "delete"; path: string }
  | { type: "move"; source: string; destination: string; content: Buffer };

type ExpectedEntry = Buffer | { linkTarget: string } | null;

type PathResolution = {
  path: string;
  resolvedPath: string;
  followFinalSymlink: boolean;
};

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

async function resolvePath(path: string, followFinalSymlink = true, depth = 0): Promise<string> {
  if (depth > 40) throw new Error(`Too many symbolic links in patch path: ${path}.`);
  const parent = dirname(path);
  if (!followFinalSymlink && parent !== path) {
    return resolve(await resolvePath(parent, true, depth), basename(path));
  }
  try {
    return await realpath(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT" || parent === path) throw error;
  }

  const resolvedParent = await resolvePath(parent, true, depth);
  const resolvedPath = resolve(resolvedParent, basename(path));
  try {
    const stat = await lstat(resolvedPath);
    if (stat.isSymbolicLink()) {
      const target = resolve(resolvedParent, await readlink(resolvedPath));
      return resolvePath(target, true, depth + 1);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  return resolvedPath;
}

async function assertResolutionUnchanged(resolution: PathResolution): Promise<void> {
  if (await resolvePath(resolution.path, resolution.followFinalSymlink) !== resolution.resolvedPath) {
    throw new Error(`Path changed while the patch was being prepared: ${resolution.path}.`);
  }
}

async function assertCanonicalPath(path: string, followFinalSymlink = true): Promise<void> {
  await assertResolutionUnchanged({ path, resolvedPath: path, followFinalSymlink });
}

async function readExistingText(path: string, displayPath: string): Promise<TextFile> {
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

async function readOptionalText(path: string, displayPath: string): Promise<TextFile | undefined> {
  try {
    const stat = await lstat(path);
    if (!stat.isFile()) throw new Error(`Patch target is not a file: ${displayPath}.`);
    return decodeText(await readFile(path), displayPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

function addExpected(expected: Map<string, ExpectedEntry>, path: string, value: ExpectedEntry): void {
  if (expected.has(path)) throw new Error(`Patch changes the same path more than once: ${path}.`);
  expected.set(path, value);
}

export async function verifyPatch(patch: Patch, cwd: string): Promise<VerifiedPatch> {
  const root = await realpath(cwd);
  const mutations: Mutation[] = [];
  const expected = new Map<string, ExpectedEntry>();
  const resolutions: PathResolution[] = [];
  const changes: PlannedChange[] = [];
  const summary: string[] = [];

  async function planPath(path: string, followFinalSymlink = true): Promise<string> {
    const absolutePath = resolve(root, path);
    const resolvedPath = await resolvePath(absolutePath, followFinalSymlink);
    resolutions.push({ path: absolutePath, resolvedPath, followFinalSymlink });
    return resolvedPath;
  }

  for (const operation of patch.operations) {
    if (operation.type === "delete") {
      const entryPath = await planPath(operation.path, false);
      const entry = await currentEntry(entryPath);
      if (entry === null) throw new Error(`File not found: ${operation.path}.`);
      const oldContent = Buffer.isBuffer(entry)
        ? decodeText(entry, operation.path).text
        : `${entry.linkTarget}\n`;
      addExpected(expected, entryPath, entry);
      mutations.push({ type: "delete", path: entryPath });
      changes.push({ path: operation.path, oldContent, newContent: "" });
      summary.push(`D ${operation.path}`);
      continue;
    }

    const sourcePath = await planPath(operation.path);

    if (operation.type === "add") {
      const existing = await readOptionalText(sourcePath, operation.path);
      addExpected(expected, sourcePath, existing?.raw ?? null);
      const newContent = addedFileContent(operation.lines);
      mutations.push({ type: "write", path: sourcePath, content: encodeText(newContent, existing) });
      changes.push({ path: operation.path, oldContent: existing?.text ?? "", newContent });
      summary.push(`A ${operation.path}`);
      continue;
    }

    const source = await readExistingText(sourcePath, operation.path);
    addExpected(expected, sourcePath, source.raw);

    const newContent = applyUpdate(source.text, operation.chunks, operation.path);
    if (!operation.movePath && newContent === source.text) {
      throw new Error(`Patch makes no changes to ${operation.path}.`);
    }
    if (operation.movePath) {
      const entryPath = await planPath(operation.path, false);
      if (entryPath !== sourcePath) {
        addExpected(expected, entryPath, await currentEntry(entryPath));
      }
      const destinationPath = await planPath(operation.movePath);
      const destination = await readOptionalText(destinationPath, operation.movePath);
      addExpected(expected, destinationPath, destination?.raw ?? null);
      mutations.push({
        type: "move",
        source: entryPath,
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

  return { root, mutations, expected, resolutions, changes, summary };
}

async function currentEntry(path: string): Promise<ExpectedEntry> {
  try {
    const stat = await lstat(path);
    if (stat.isSymbolicLink()) return { linkTarget: await readlink(path) };
    if (!stat.isFile()) throw new Error(`Patch target is not a file: ${path}.`);
    return await readFile(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

function sameEntry(left: ExpectedEntry, right: ExpectedEntry): boolean {
  if (left === null || right === null) return left === right;
  if (Buffer.isBuffer(left) && Buffer.isBuffer(right)) return left.equals(right);
  if (!Buffer.isBuffer(left) && !Buffer.isBuffer(right)) return left.linkTarget === right.linkTarget;
  return false;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new Error("Operation aborted.");
}

export async function applyVerifiedPatch(verified: VerifiedPatch, signal?: AbortSignal): Promise<void> {
  throwIfAborted(signal);
  for (const resolution of verified.resolutions) {
    await assertResolutionUnchanged(resolution);
  }
  for (const [path, expected] of verified.expected) {
    await assertCanonicalPath(path, false);
    if (!sameEntry(await currentEntry(path), expected)) {
      throw new Error(`File changed while the patch was being prepared: ${relative(verified.root, path)}.`);
    }
  }

  for (const mutation of verified.mutations) {
    throwIfAborted(signal);
    if (mutation.type === "delete") {
      await assertCanonicalPath(mutation.path, false);
      await unlink(mutation.path);
      continue;
    }
    if (mutation.type === "move") {
      await assertCanonicalPath(mutation.destination);
      await mkdir(dirname(mutation.destination), { recursive: true });
      await assertCanonicalPath(mutation.destination);
      await writeFile(mutation.destination, mutation.content);
      await assertCanonicalPath(mutation.source, false);
      await unlink(mutation.source);
      continue;
    }
    await assertCanonicalPath(mutation.path);
    await mkdir(dirname(mutation.path), { recursive: true });
    await assertCanonicalPath(mutation.path);
    await writeFile(mutation.path, mutation.content);
  }
  throwIfAborted(signal);
}
