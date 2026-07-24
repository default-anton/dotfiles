import assert from "node:assert/strict";
import { buildAnnotatorHTML } from "./annotator-page.ts";

const source = [
  "# Review fixture",
  "",
  "Unicode: 👋",
  "Fenced source: ```",
  "HTML boundary: </script>",
  "",
].join("\n");

const html = buildAnnotatorHTML({
  path: "/tmp/review fixture.md",
  displayPath: "review fixture.md",
  source,
  settings: null,
  draft: null,
});

const scriptStart = html.indexOf("<script>");
const scriptEnd = html.lastIndexOf("</script>");
assert.notEqual(scriptStart, -1, "page must contain a script");
assert.ok(scriptEnd > scriptStart, "page script must be closed");

const script = html.slice(scriptStart + "<script>".length, scriptEnd);
new Function(script);

const declaredIds = Array.from(html.matchAll(/\sid="([^"]+)"/g), (match) =>
  match[1],
);
const requestedIds = Array.from(
  html.matchAll(/getElementById\("([^"]+)"\)/g),
  (match) => match[1],
);

assert.equal(
  new Set(declaredIds).size,
  declaredIds.length,
  "page element ids must be unique",
);
for (const id of requestedIds) {
  assert.ok(declaredIds.includes(id), `script references missing element #${id}`);
}

assert.ok(html.includes('remove.textContent = "×"'), "comments must use an X control");
assert.ok(!html.includes("<kbd>Delete</kbd>"), "X must be the documented remove shortcut");
assert.ok(!html.includes(source), "source must not be embedded as executable HTML");

console.log("annotator page checks passed");
