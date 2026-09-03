import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  createApplyPatchAvailability,
  supportsApplyPatch,
} from "../lib/availability.ts";

import { applyUpdate, parsePatch } from "../lib/patch.ts";
import { applyVerifiedPatch, verifyPatch } from "../lib/workspace.ts";

test("parses and applies an anchored update", () => {
  const patch = parsePatch(`*** Begin Patch
*** Update File: src/main.ts
@@ function main() {
-  console.log("old");
+  console.log("new");
 }
*** End Patch`);
  const operation = patch.operations[0];
  assert.equal(operation.type, "update");
  if (operation.type !== "update") return;
  assert.equal(
    applyUpdate('function main() {\n  console.log("old");\n}\n', operation.chunks, operation.path),
    'function main() {\n  console.log("new");\n}\n',
  );
});

test("applies add, update, move, and delete operations", async () => {
  const root = await mkdtemp(join(tmpdir(), "pi-apply-patch-"));
  await mkdir(join(root, "src"));
  await writeFile(join(root, "src", "old.txt"), "one\r\ntwo\r\n");
  await writeFile(join(root, "delete.txt"), "gone\n");
  const patch = parsePatch(`*** Begin Patch
*** Add File: added.txt
+new
*** Update File: src/old.txt
*** Move to: src/new.txt
 one
-two
+three
*** Delete File: delete.txt
*** End Patch`);
  const verified = await verifyPatch(patch, root);
  await applyVerifiedPatch(verified);
  assert.equal(await readFile(join(root, "added.txt"), "utf8"), "new\n");
  assert.equal(await readFile(join(root, "src", "new.txt"), "utf8"), "one\r\nthree\r\n");
  await assert.rejects(readFile(join(root, "src", "old.txt")), { code: "ENOENT" });
  await assert.rejects(readFile(join(root, "delete.txt")), { code: "ENOENT" });
});

test("rejects paths outside the working directory", async () => {
  const root = await mkdtemp(join(tmpdir(), "pi-apply-patch-"));
  const patch = parsePatch(`*** Begin Patch
*** Add File: ../outside.txt
+no
*** End Patch`);
  await assert.rejects(verifyPatch(patch, root), /escapes the working directory/);
});

test("rejects symbolic links", async () => {
  const root = await mkdtemp(join(tmpdir(), "pi-apply-patch-"));
  const outside = await mkdtemp(join(tmpdir(), "pi-apply-patch-outside-"));
  await symlink(outside, join(root, "linked"));
  const patch = parsePatch(`*** Begin Patch
*** Add File: linked/file.txt
+no
*** End Patch`);
  await assert.rejects(verifyPatch(patch, root), /symbolic links/);
});

test("does not mutate when a file changes after verification", async () => {
  const root = await mkdtemp(join(tmpdir(), "pi-apply-patch-"));
  const path = join(root, "file.txt");
  await writeFile(path, "old\n");
  const patch = parsePatch(`*** Begin Patch
*** Update File: file.txt
-old
+new
*** End Patch`);
  const verified = await verifyPatch(patch, root);
  await writeFile(path, "other\n");
  await assert.rejects(applyVerifiedPatch(verified), /changed while the patch was being prepared/);
  assert.equal(await readFile(path, "utf8"), "other\n");
});


test("matches trailing whitespace and Unicode punctuation", () => {
  const patch = parsePatch(`*** Begin Patch
*** Update File: text.txt
-old text—here
+new text
*** End Patch`);
  const operation = patch.operations[0];
  assert.equal(operation.type, "update");
  if (operation.type !== "update") return;
  assert.equal(applyUpdate("old text-here   \n", operation.chunks, operation.path), "new text\n");
});

test("verifies every operation before mutating files", async () => {
  const root = await mkdtemp(join(tmpdir(), "pi-apply-patch-"));
  const patch = parsePatch(`*** Begin Patch
*** Add File: added.txt
+new
*** Update File: missing.txt
-old
+new
*** End Patch`);
  await assert.rejects(verifyPatch(patch, root), /File not found/);
  await assert.rejects(readFile(join(root, "added.txt")), { code: "ENOENT" });
});

test("rejects duplicate resolved paths", async () => {
  const root = await mkdtemp(join(tmpdir(), "pi-apply-patch-"));
  await writeFile(join(root, "file.txt"), "old\n");
  const patch = parsePatch(`*** Begin Patch
*** Update File: file.txt
-old
+one
*** Update File: ./file.txt
-old
+two
*** End Patch`);
  await assert.rejects(verifyPatch(patch, root), /same path more than once/);
});

test("rejects updates that make no change", async () => {
  const root = await mkdtemp(join(tmpdir(), "pi-apply-patch-"));
  await writeFile(join(root, "file.txt"), "same\n");
  const patch = parsePatch(`*** Begin Patch
*** Update File: file.txt
 same
*** End Patch`);
  await assert.rejects(verifyPatch(patch, root), /makes no changes/);
});

const openAIModel = {
  provider: "openai",
  api: "openai-responses",
  compat: { supportsOpenAIGrammarTools: true },
};

const anthropicModel = {
  provider: "anthropic",
  api: "anthropic-messages",
};

test("exposes apply_patch only to supported OpenAI models", () => {
  assert.equal(supportsApplyPatch(openAIModel), true);
  assert.equal(supportsApplyPatch({ ...openAIModel, provider: "openrouter" }), false);
  assert.equal(supportsApplyPatch({ ...openAIModel, compat: {} }), false);
  assert.equal(supportsApplyPatch(anthropicModel), false);
});

test("removes and restores apply_patch when the model changes", () => {
  let activeTools = ["read", "bash", "apply_patch"];
  const availability = createApplyPatchAvailability(
    () => activeTools,
    (names) => {
      activeTools = names;
    },
  );

  availability.initialize(anthropicModel);
  assert.deepEqual(activeTools, ["read", "bash"]);
  availability.sync(openAIModel);
  assert.deepEqual(activeTools, ["read", "bash", "apply_patch"]);
  activeTools = ["read", "bash"];
  availability.sync(anthropicModel);
  availability.sync(openAIModel);
  assert.deepEqual(activeTools, ["read", "bash"]);
});
