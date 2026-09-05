import { constants } from "node:fs";
import { access, readFile } from "node:fs/promises";
import {
  createReadToolDefinition,
  detectSupportedImageMimeTypeFromFile,
  SettingsManager,
  type ExtensionAPI,
  type ReadToolOptions,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

export function createReadImageToolDefinition(
  cwd: string,
  options: Pick<ReadToolOptions, "autoResizeImages"> = {},
) {
  const read = createReadToolDefinition(cwd, {
    ...options,
    operations: {
      readFile,
      access: (path) => access(path, constants.R_OK),
      async detectImageMimeType(path) {
        const mimeType = await detectSupportedImageMimeTypeFromFile(path);
        if (!mimeType) {
          throw new Error(
            "Unsupported image file. Supported formats: JPEG, PNG, GIF, WebP, BMP. Use bash to read text files.",
          );
        }
        return mimeType;
      },
    },
  });

  return {
    ...read,
    name: "read_image",
    label: "read_image",
    description: "Read an image file (jpg, png, gif, webp, bmp).",
    promptSnippet: "Read image files",
    promptGuidelines: [
      "Use read_image to examine images and bash to read text files.",
    ],
    parameters: Type.Pick(read.parameters, ["path"]),
  };
}

export default function readImageExtension(pi: ExtensionAPI) {
  pi.registerTool({
    ...createReadImageToolDefinition(process.cwd()),
    execute(toolCallId, args, signal, onUpdate, ctx) {
      const settings = SettingsManager.create(ctx.cwd, undefined, {
        projectTrusted: ctx.isProjectTrusted(),
      });
      const tool = createReadImageToolDefinition(ctx.cwd, {
        autoResizeImages: settings.getImageAutoResize(),
      });
      return tool.execute(toolCallId, args, signal, onUpdate, ctx);
    },
  });
}
