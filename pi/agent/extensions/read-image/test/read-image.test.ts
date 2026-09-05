import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";
import { crc32, deflateSync } from "node:zlib";
import test from "node:test";
import {
  createReadToolDefinition,
  initTheme,
  ToolExecutionComponent,
  type ExtensionAPI,
  type ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { getCapabilities, setCapabilities, type TUI } from "@earendil-works/pi-tui";
import readImageExtension, { createReadImageToolDefinition } from "../index.ts";

const fixtures = {
  jpeg: "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/2wBDAQMDAwQDBAgEBAgQCwkLEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBD/wAARCAACAAIDAREAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACP/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAVAQEBAAAAAAAAAAAAAAAAAAAHCf/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/ADoDFU3/2Q==",
  gif: "R0lGODlhAgACAPAAAP8AAAAAACH5BAAAAAAALAAAAAACAAIAAAIChFEAOw==",
  webp: "UklGRjwAAABXRUJQVlA4IDAAAADQAQCdASoCAAIAAgA0JaACdLoB+AADsAD+8MQL/yC5YXXI1/8gP+QH/ID/+PIAAAA=",
  bmp: "Qk2aAAAAAAAAAIoAAAB8AAAAAgAAAAIAAAABABgAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/AAD/AAD/AAAAAAAA/0JHUnOPwvUoUbgeFR6F6wEzMzMTZmZmJmZmZgaZmZkJPQrXAyhcjzIAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAD/AAD/AAAAAP8AAP8AAA==",
};

function pngChunk(type: string, data: Buffer) {
  const body = Buffer.concat([Buffer.from(type), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, checksum]);
}

function png(width: number, height: number, noisy = false) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const stride = width * 4 + 1;
  const pixels = Buffer.alloc(stride * height, 255);
  let seed = 12345;
  for (let i = 0; i < pixels.length; i++) {
    if (i % stride === 0) {
      pixels[i] = 0;
    } else if (noisy) {
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      pixels[i] = seed & 255;
    }
  }
  return Buffer.concat([
    Buffer.from("89504e470d0a1a0a", "hex"),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(pixels)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function context(cwd: string, projectTrusted = false) {
  return { cwd, isProjectTrusted: () => projectTrusted } as ExtensionContext;
}

test("read_image matches pi's image execution and rendering", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "pi-read-image-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const ctx = context(root);
  const read = createReadToolDefinition(root);
  const image = createReadImageToolDefinition(root);
  const execute = (tool: typeof read, path: string, executionContext = ctx, signal?: AbortSignal) =>
    tool.execute("test", { path }, signal, undefined, executionContext);
  const parity = async (path: string, executionContext = ctx) => {
    const expected = await execute(read, path, executionContext);
    const actual = await execute(image, path, executionContext);
    assert.deepEqual(actual, expected);
    return actual;
  };
  await writeFile(join(root, "small.png"), png(2, 2));

  await t.test("exposes only path and image-specific prompt guidance", () => {
    assert.equal(image.name, "read_image");
    assert.deepEqual(Object.keys(image.parameters.properties), ["path"]);
    assert.deepEqual(image.parameters.required, ["path"]);
    assert.equal(image.renderCall, read.renderCall);
    assert.equal(image.renderResult, read.renderResult);
    assert.match(image.promptGuidelines.join("\n"), /bash to read text files/);
    assert.doesNotMatch(image.promptGuidelines.join("\n"), /Use read to/);
  });

  await t.test("keeps small images byte-for-byte and converts BMP", async () => {
    for (const [format, encoded] of Object.entries(fixtures)) {
      await writeFile(join(root, `${format}.data`), Buffer.from(encoded, "base64"));
      const result = await parity(`${format}.data`);
      const attachment = result.content.find((block) => block.type === "image");
      assert.ok(attachment);
      assert.equal(attachment.mimeType, format === "bmp" ? "image/png" : `image/${format}`);
      if (format !== "bmp") assert.equal(attachment.data, encoded);
      else assert.match(JSON.stringify(result.content[0]), /converted from image\/bmp/);
    }
    const result = await parity("small.png");
    assert.equal(result.content[1].type, "image");
    if (result.content[1].type === "image") {
      assert.equal(result.content[1].data, png(2, 2).toString("base64"));
    }
  });

  await t.test("resolves paths, symlinks, and macOS screenshot variants", async () => {
    const variants = [
      ["space name.png", "space\u00a0name.png"],
      ["Screenshot 1.00.00\u202fPM.png", "Screenshot 1.00.00 PM.png"],
      ["cafe\u0301.png", "café.png"],
      ["Capture d’écran.png", "Capture d'écran.png"],
      ["Capture d’e\u0301cran.png", "Capture d'écran.png"],
    ];
    for (const [stored, requested] of variants) {
      await writeFile(join(root, stored), png(2, 2));
      assert.ok((await parity(requested)).content.some((block) => block.type === "image"));
      await rm(join(root, stored));
    }
    await symlink(join(root, "small.png"), join(root, "linked"));
    const absolute = join(root, "small.png");
    for (const path of [
      "./small.png",
      absolute,
      "@small.png",
      pathToFileURL(absolute).href,
      `~/${relative(homedir(), absolute)}`,
      "linked",
    ]) {
      await parity(path);
    }
    await mkdir(join(root, "nested"));
    await parity("../small.png", context(join(root, "nested")));
  });

  await t.test("resizes dimensions and compresses oversized base64 payloads", async () => {
    await writeFile(join(root, "wide.png"), png(2400, 12));
    const resized = await parity("wide.png");
    assert.match(JSON.stringify(resized.content[0]), /original 2400x12, displayed at 2000x10/);
    assert.match(JSON.stringify(resized.content[0]), /Multiply coordinates by 1.20/);
    const noisy = png(1100, 1100, true);
    assert.ok(noisy.toString("base64").length > 4.5 * 1024 * 1024);
    await writeFile(join(root, "noisy.png"), noisy);
    const compressed = await parity("noisy.png");
    const attachment = compressed.content.find((block) => block.type === "image");
    assert.ok(attachment);
    assert.ok(attachment.data.length < 4.5 * 1024 * 1024);
    assert.equal(attachment.mimeType, "image/jpeg");
  });

  await t.test("preserves no-resize behavior and non-vision notes", async () => {
    const options = { autoResizeImages: false };
    const unresized = await execute(createReadImageToolDefinition(root, options), "wide.png");
    assert.deepEqual(unresized, await execute(createReadToolDefinition(root, options), "wide.png"));
    assert.doesNotMatch(JSON.stringify(unresized.content[0]), /displayed at/);
    const result = await parity("small.png", {
      ...ctx,
      model: { input: ["text"] } as ExtensionContext["model"],
    });
    assert.match(JSON.stringify(result.content[0]), /Current model does not support images/);
  });

  await t.test("rejects non-images and preserves native errors and omission notes", async () => {
    for (const [name, bytes] of [
      ["text.png", Buffer.from("not an image")],
      ["document.pdf", Buffer.from("%PDF-1.7")],
      ["vector.svg", Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')],
      ["empty", Buffer.alloc(0)],
    ] as const) {
      await writeFile(join(root, name), bytes);
      await assert.rejects(execute(image, name), /Unsupported image file/);
    }
    await assert.rejects(execute(image, "missing.png"), { code: "ENOENT" });
    await assert.rejects(execute(image, "small.png", ctx, AbortSignal.abort()), /Operation aborted/);
    await writeFile(join(root, "corrupt.gif"), Buffer.from("GIF89a"));
    const result = await parity("corrupt.gif");
    assert.equal(result.content.length, 1);
    assert.match(JSON.stringify(result.content[0]), /Image omitted/);
  });

  await t.test("uses global settings and only trusted project overrides", async () => {
    const agentDir = join(root, "agent");
    await mkdir(agentDir);
    await mkdir(join(root, ".pi"));
    await writeFile(join(agentDir, "settings.json"), JSON.stringify({ images: { autoResize: false } }));
    await writeFile(join(root, ".pi", "settings.json"), JSON.stringify({ images: { autoResize: true } }));
    const previous = process.env.PI_CODING_AGENT_DIR;
    process.env.PI_CODING_AGENT_DIR = agentDir;
    try {
      let registered: ReturnType<typeof createReadImageToolDefinition> | undefined;
      readImageExtension({
        registerTool(tool) { registered = tool; },
      } as ExtensionAPI);
      assert.ok(registered);
      for (const trusted of [false, true]) {
        assert.deepEqual(
          await execute(registered, "wide.png", context(root, trusted)),
          await execute(createReadToolDefinition(root, { autoResizeImages: trusted }), "wide.png"),
        );
      }
    } finally {
      if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR;
      else process.env.PI_CODING_AGENT_DIR = previous;
    }
  });

  await t.test("renders identical TUI rows with and without image previews", async () => {
    initTheme("dark", false);
    const capabilities = getCapabilities();
    const result = await execute(image, "small.png");
    const ui = { requestRender() {} } as TUI;
    try {
      for (const protocol of [null, "iterm2", "kitty"] as const) {
        setCapabilities({ ...capabilities, images: protocol });
        for (const showImages of [false, true]) {
          const rows = [read, image].map((tool) =>
            new ToolExecutionComponent(
              tool.name, "test", { path: "small.png" },
              { showImages, imageWidthCells: 30 }, tool, ui, root,
            )
          );
          for (const row of rows) {
            row.setArgsComplete();
            row.markExecutionStarted();
            row.updateResult({ ...result, isError: false });
          }
          for (const expanded of [false, true]) {
            for (const row of rows) row.setExpanded(expanded);
            const normalize = (lines: string[]) => lines.map((line) => line.replace(/i=\d+/g, "i=IMAGE"));
            assert.deepEqual(normalize(rows[1].render(80)), normalize(rows[0].render(80)));
          }
          for (const row of rows) {
            row.setExpanded(false);
            row.updateResult({
              content: [{ type: "text", text: "Unsupported image file" }],
              isError: true,
            });
          }
          assert.deepEqual(rows[1].render(80), rows[0].render(80));
        }
      }
    } finally {
      setCapabilities(capabilities);
    }
  });

  await t.test("disables read in the local settings", async () => {
    const settings = JSON.parse(await readFile(new URL("../../../settings.json", import.meta.url), "utf8"));
    assert.deepEqual(settings.defaultTools, ["bash"]);
  });
});
