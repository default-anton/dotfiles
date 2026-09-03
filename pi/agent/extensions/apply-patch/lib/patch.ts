export type Patch = {
  operations: PatchOperation[];
};

export type PatchOperation =
  | { type: "add"; path: string; lines: string[] }
  | { type: "delete"; path: string }
  | { type: "update"; path: string; movePath?: string; chunks: UpdateChunk[] };

export type UpdateChunk = {
  anchor?: string;
  oldLines: string[];
  newLines: string[];
  endOfFile: boolean;
};

export const APPLY_PATCH_GRAMMAR = String.raw`start: begin_patch hunk+ end_patch
begin_patch: "*** Begin Patch" LF
end_patch: "*** End Patch" LF?

hunk: add_hunk | delete_hunk | update_hunk
add_hunk: "*** Add File: " filename LF add_line+
delete_hunk: "*** Delete File: " filename LF
update_hunk: "*** Update File: " filename LF change_move? change?

filename: /(.+)/
add_line: "+" /(.*)/ LF -> line

change_move: "*** Move to: " filename LF
change: (change_context | change_line)+ eof_line?
change_context: ("@@" | "@@ " /(.+)/) LF
change_line: ("+" | "-" | " ") /(.*)/ LF
eof_line: "*** End of File" LF

%import common.LF`;

const BEGIN_PATCH = "*** Begin Patch";
const END_PATCH = "*** End Patch";
const ADD_FILE = "*** Add File: ";
const DELETE_FILE = "*** Delete File: ";
const UPDATE_FILE = "*** Update File: ";
const MOVE_TO = "*** Move to: ";
const END_OF_FILE = "*** End of File";

function fail(message: string, lineIndex?: number): never {
  const suffix = lineIndex === undefined ? "" : ` at patch line ${lineIndex + 1}`;
  throw new Error(`${message}${suffix}.`);
}

function marker(line: string): string {
  return line.trim();
}

function patchLines(input: string): string[] {
  const normalized = input.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized.split("\n");
  const begin = lines.findIndex((line) => marker(line) === BEGIN_PATCH);
  let end = -1;
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (marker(lines[index]) === END_PATCH) {
      end = index;
      break;
    }
  }
  if (begin === -1) fail(`Patch must start with ${BEGIN_PATCH}`);
  if (end <= begin) fail(`Patch must end with ${END_PATCH}`);
  return lines.slice(begin, end + 1);
}

function parsePath(line: string, prefix: string, lineIndex: number): string {
  const path = line.slice(prefix.length).trim();
  if (!path) fail("File path cannot be empty", lineIndex);
  return path;
}

function isOperationHeader(line: string): boolean {
  return line.startsWith(ADD_FILE) || line.startsWith(DELETE_FILE) || line.startsWith(UPDATE_FILE);
}

export function parsePatch(input: string): Patch {
  const lines = patchLines(input);
  const operations: PatchOperation[] = [];
  let index = 1;

  while (index < lines.length - 1) {
    const line = lines[index];

    if (line.startsWith(ADD_FILE)) {
      const path = parsePath(line, ADD_FILE, index);
      index += 1;
      const addedLines: string[] = [];
      while (index < lines.length - 1 && !isOperationHeader(lines[index])) {
        if (!lines[index].startsWith("+")) fail("Added file lines must start with +", index);
        addedLines.push(lines[index].slice(1));
        index += 1;
      }
      if (addedLines.length === 0) fail(`Add operation for ${path} has no lines`);
      operations.push({ type: "add", path, lines: addedLines });
      continue;
    }

    if (line.startsWith(DELETE_FILE)) {
      operations.push({ type: "delete", path: parsePath(line, DELETE_FILE, index) });
      index += 1;
      continue;
    }

    if (line.startsWith(UPDATE_FILE)) {
      const path = parsePath(line, UPDATE_FILE, index);
      index += 1;
      let movePath: string | undefined;
      if (lines[index]?.startsWith(MOVE_TO)) {
        movePath = parsePath(lines[index], MOVE_TO, index);
        index += 1;
      }

      const chunks: UpdateChunk[] = [];
      let current: UpdateChunk | undefined;
      while (index < lines.length - 1 && !isOperationHeader(lines[index])) {
        const changeLine = lines[index];
        if (changeLine === "@@" || changeLine.startsWith("@@ ")) {
          if (current) {
            if (current.oldLines.length === 0 && current.newLines.length === 0) {
              fail("Update section has no changed or context lines", index);
            }
            chunks.push(current);
          }
          current = {
            anchor: changeLine === "@@" ? undefined : changeLine.slice(3),
            oldLines: [],
            newLines: [],
            endOfFile: false,
          };
          index += 1;
          continue;
        }
        if (changeLine === END_OF_FILE) {
          if (!current) fail(`${END_OF_FILE} must follow update lines`, index);
          current.endOfFile = true;
          index += 1;
          continue;
        }
        const prefix = changeLine[0];
        if (prefix !== "+" && prefix !== "-" && prefix !== " ") {
          fail("Update lines must start with +, -, or a space", index);
        }
        current ??= { oldLines: [], newLines: [], endOfFile: false };
        const content = changeLine.slice(1);
        if (prefix !== "+") current.oldLines.push(content);
        if (prefix !== "-") current.newLines.push(content);
        index += 1;
      }
      if (current) {
        if (current.oldLines.length === 0 && current.newLines.length === 0) {
          fail("Update section has no changed or context lines", index);
        }
        chunks.push(current);
      }
      if (chunks.length === 0 && !movePath) fail(`Update operation for ${path} has no changes`);
      operations.push({ type: "update", path, movePath, chunks });
      continue;
    }

    fail("Expected an Add File, Delete File, or Update File header", index);
  }

  if (operations.length === 0) fail("Patch has no file operations");
  return { operations };
}

function normalizeUnicode(line: string): string {
  return line
    .replace(/[\u2010\u2011\u2012\u2013\u2014\u2015\u2212]/g, "-")
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/[\u00A0\u2002-\u200A\u202F\u205F\u3000]/g, " ");
}

function findSequence(
  lines: string[],
  sequence: string[],
  start: number,
  endOfFile = false,
): number | undefined {
  const normalizers = [
    (line: string) => line,
    (line: string) => line.trimEnd(),
    (line: string) => line.trim(),
    (line: string) => normalizeUnicode(line.trim()),
  ];

  for (const normalize of normalizers) {
    const lastStart = lines.length - sequence.length;
    const first = endOfFile ? lastStart : start;
    const last = endOfFile ? lastStart : lastStart;
    for (let index = Math.max(start, first); index <= last; index += 1) {
      let matches = true;
      for (let offset = 0; offset < sequence.length; offset += 1) {
        if (normalize(lines[index + offset]) !== normalize(sequence[offset])) {
          matches = false;
          break;
        }
      }
      if (matches) return index;
    }
  }
  return undefined;
}

function splitLines(content: string): string[] {
  if (!content) return [];
  const normalized = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const withoutFinalNewline = normalized.endsWith("\n") ? normalized.slice(0, -1) : normalized;
  return withoutFinalNewline.split("\n");
}

export function applyUpdate(content: string, chunks: UpdateChunk[], path: string): string {
  const lines = splitLines(content);
  const replacements: Array<{ start: number; length: number; lines: string[] }> = [];
  let cursor = 0;

  for (const chunk of chunks) {
    if (chunk.anchor !== undefined) {
      const anchor = findSequence(lines, [chunk.anchor], cursor);
      if (anchor === undefined) throw new Error(`Could not find context '${chunk.anchor}' in ${path}.`);
      cursor = anchor + 1;
    }

    if (chunk.oldLines.length === 0) {
      replacements.push({ start: lines.length, length: 0, lines: chunk.newLines });
      continue;
    }

    const position = findSequence(lines, chunk.oldLines, cursor, chunk.endOfFile);
    if (position === undefined) {
      const expected = chunk.oldLines.slice(0, 3).join("\n");
      throw new Error(`Could not find expected lines in ${path}:\n${expected}`);
    }
    replacements.push({ start: position, length: chunk.oldLines.length, lines: chunk.newLines });
    cursor = position + chunk.oldLines.length;
  }

  for (let index = replacements.length - 1; index >= 0; index -= 1) {
    const replacement = replacements[index];
    lines.splice(replacement.start, replacement.length, ...replacement.lines);
  }
  return `${lines.join("\n")}\n`;
}

export function addedFileContent(lines: string[]): string {
  return `${lines.join("\n")}\n`;
}
