import { readFile } from "node:fs/promises";
import { relative } from "node:path";
import { prompt } from "glimpseui";

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

  const rawResult = await prompt<unknown>(buildAnnotatorHTML(path, source), {
    width: 1_100,
    height: 760,
    title: `Annotate — ${displayPath}`,
    noDock: true,
  });

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

    if (typeof item.id !== "string" || item.id === "" || typeof item.comment !== "string") {
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

function buildAnnotatorHTML(path: string, source: string): string {
  const sourceBase64 = Buffer.from(source, "utf8").toString("base64");
  const pathBase64 = Buffer.from(path, "utf8").toString("base64");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Annotate Markdown</title>
  <style>
    :root {
      color-scheme: light dark;
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      --background: Canvas;
      --foreground: CanvasText;
      --muted: color-mix(in srgb, CanvasText 58%, transparent);
      --border: color-mix(in srgb, CanvasText 18%, transparent);
      --panel: color-mix(in srgb, Canvas 94%, CanvasText);
      --accent: AccentColor;
      --highlight: color-mix(in srgb, #ffd84d 45%, transparent);
      --danger: #d73a49;
    }

    * { box-sizing: border-box; }

    html,
    body {
      width: 100%;
      height: 100%;
      margin: 0;
      overflow: hidden;
      background: var(--background);
      color: var(--foreground);
    }

    body {
      display: grid;
      grid-template-rows: auto minmax(0, 1fr) auto;
    }

    header {
      padding: 12px 16px;
      border-bottom: 1px solid var(--border);
    }

    header strong,
    header span { display: block; }

    header span {
      margin-top: 3px;
      overflow: hidden;
      color: var(--muted);
      font-size: 12px;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    main {
      display: grid;
      min-height: 0;
      grid-template-columns: minmax(0, 2fr) minmax(300px, 1fr);
    }

    .document-pane {
      min-width: 0;
      overflow: auto;
      border-right: 1px solid var(--border);
    }

    #source {
      min-height: 100%;
      margin: 0;
      padding: 20px 24px 50vh;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 13px;
      line-height: 1.6;
      overflow-wrap: anywhere;
      tab-size: 2;
      white-space: pre-wrap;
      user-select: text;
    }

    #source .annotated {
      border-radius: 2px;
      background: var(--highlight);
      box-shadow: inset 0 -2px color-mix(in srgb, #c79400 65%, transparent);
    }

    aside {
      display: grid;
      min-height: 0;
      grid-template-rows: auto minmax(0, 1fr);
      background: var(--panel);
    }

    .composer {
      padding: 16px;
      border-bottom: 1px solid var(--border);
    }

    #selection-status {
      min-height: 38px;
      margin-bottom: 10px;
      color: var(--muted);
      font-size: 12px;
      line-height: 1.45;
    }

    textarea {
      width: 100%;
      min-height: 110px;
      resize: vertical;
      padding: 10px;
      border: 1px solid var(--border);
      border-radius: 6px;
      background: var(--background);
      color: var(--foreground);
      font: inherit;
    }

    textarea:focus {
      border-color: var(--accent);
      outline: 2px solid color-mix(in srgb, var(--accent) 30%, transparent);
    }

    .composer-actions,
    footer {
      display: flex;
      gap: 8px;
    }

    .composer-actions { margin-top: 10px; }

    button {
      padding: 8px 12px;
      border: 1px solid var(--border);
      border-radius: 6px;
      background: var(--background);
      color: var(--foreground);
      cursor: pointer;
      font: inherit;
    }

    button:hover:not(:disabled) { border-color: var(--accent); }

    button:disabled {
      cursor: default;
      opacity: 0.45;
    }

    button.primary {
      border-color: var(--accent);
      background: var(--accent);
      color: white;
    }

    button.danger { color: var(--danger); }

    .annotations {
      min-height: 0;
      overflow: auto;
      padding: 16px;
    }

    .annotations h2 {
      margin: 0 0 12px;
      font-size: 14px;
    }

    #empty-state {
      color: var(--muted);
      font-size: 13px;
    }

    .annotation {
      margin-bottom: 10px;
      padding: 10px;
      border: 1px solid var(--border);
      border-radius: 7px;
      background: var(--background);
      cursor: pointer;
    }

    .annotation-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      color: var(--muted);
      font-size: 11px;
    }

    .annotation-comment {
      margin-top: 7px;
      font-size: 13px;
      line-height: 1.45;
      white-space: pre-wrap;
    }

    .annotation-preview {
      margin-top: 7px;
      overflow: hidden;
      color: var(--muted);
      font-family: ui-monospace, monospace;
      font-size: 11px;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    footer {
      align-items: center;
      justify-content: flex-end;
      padding: 12px 16px;
      border-top: 1px solid var(--border);
    }

    footer .spacer {
      flex: 1;
      color: var(--muted);
      font-size: 12px;
    }
  </style>
</head>
<body>
  <header>
    <strong>Annotate raw Markdown</strong>
    <span id="path"></span>
  </header>

  <main>
    <section class="document-pane">
      <pre id="source" aria-label="Raw Markdown source"></pre>
    </section>

    <aside>
      <section class="composer">
        <div id="selection-status">
          Select text in the document, or add a document-level comment.
        </div>

        <textarea id="comment" placeholder="Write a comment…" autofocus></textarea>

        <div class="composer-actions">
          <button id="add-selection" disabled>Comment selection</button>
          <button id="add-document">Comment document</button>
        </div>
      </section>

      <section class="annotations">
        <h2 id="annotation-heading">Comments (0)</h2>
        <div id="empty-state">No comments yet.</div>
        <div id="annotation-list"></div>
      </section>
    </aside>
  </main>

  <footer>
    <span class="spacer">Select text, write a comment, then choose Comment selection.</span>
    <button id="cancel">Cancel</button>
    <button id="insert" class="primary" disabled>Insert</button>
    <button id="send" class="primary" disabled>Send</button>
  </footer>

  <script>
    const decodeUtf8 = (base64) => {
      const bytes = Uint8Array.from(atob(base64), (character) =>
        character.charCodeAt(0)
      );
      return new TextDecoder().decode(bytes);
    };

    const sourceText = decodeUtf8("${sourceBase64}");
    const sourcePath = decodeUtf8("${pathBase64}");

    const sourceElement = document.getElementById("source");
    const pathElement = document.getElementById("path");
    const commentElement = document.getElementById("comment");
    const statusElement = document.getElementById("selection-status");
    const selectionButton = document.getElementById("add-selection");
    const listElement = document.getElementById("annotation-list");
    const emptyElement = document.getElementById("empty-state");
    const headingElement = document.getElementById("annotation-heading");
    const insertButton = document.getElementById("insert");
    const sendButton = document.getElementById("send");

    let nextId = 1;
    let annotations = [];
    let pendingSelection = null;

    pathElement.textContent = sourcePath;

    function offsetFromRoot(node, offset) {
      const range = document.createRange();
      range.selectNodeContents(sourceElement);
      range.setEnd(node, offset);
      return range.toString().length;
    }

    function captureSelection() {
      const selection = window.getSelection();

      if (
        !selection ||
        selection.rangeCount === 0 ||
        selection.isCollapsed ||
        !sourceElement.contains(selection.anchorNode) ||
        !sourceElement.contains(selection.focusNode)
      ) {
        return;
      }

      const range = selection.getRangeAt(0);
      const start = offsetFromRoot(range.startContainer, range.startOffset);
      const end = offsetFromRoot(range.endContainer, range.endOffset);

      if (end <= start) {
        return;
      }

      pendingSelection = { start, end };
      selectionButton.disabled = false;

      const selected = sourceText.slice(start, end);
      statusElement.textContent =
        lineLabel(start, end) + ": " + compactPreview(selected, 140);
    }

    function lineNumber(offset) {
      let line = 1;

      for (let index = 0; index < offset; index += 1) {
        if (sourceText.charCodeAt(index) === 10) {
          line += 1;
        }
      }

      return line;
    }

    function lineLabel(start, end) {
      const first = lineNumber(start);
      const last = lineNumber(Math.max(start, end - 1));
      return first === last ? "Line " + first : "Lines " + first + "–" + last;
    }

    function compactPreview(text, limit) {
      const compact = text.replace(/\\s+/g, " ").trim();

      if (compact.length <= limit) {
        return compact;
      }

      return compact.slice(0, limit - 1) + "…";
    }

    function addSelectionComment() {
      const comment = commentElement.value.trim();

      if (!pendingSelection || !comment) {
        commentElement.focus();
        return;
      }

      annotations.push({
        id: "a" + nextId++,
        kind: "selection",
        start: pendingSelection.start,
        end: pendingSelection.end,
        comment,
      });

      finishAddition();
    }

    function addDocumentComment() {
      const comment = commentElement.value.trim();

      if (!comment) {
        commentElement.focus();
        return;
      }

      annotations.push({
        id: "a" + nextId++,
        kind: "document",
        comment,
      });

      finishAddition();
    }

    function finishAddition() {
      pendingSelection = null;
      selectionButton.disabled = true;
      commentElement.value = "";
      statusElement.textContent =
        "Select text in the document, or add a document-level comment.";

      window.getSelection()?.removeAllRanges();
      render();
      commentElement.focus();
    }

    function removeAnnotation(id) {
      annotations = annotations.filter((annotation) => annotation.id !== id);
      render();
    }

    function render() {
      renderSource();
      renderIndex();

      const empty = annotations.length === 0;
      insertButton.disabled = empty;
      sendButton.disabled = empty;
    }

    function renderSource() {
      const selections = annotations.filter(
        (annotation) => annotation.kind === "selection"
      );
      const boundaries = new Set([0, sourceText.length]);

      for (const annotation of selections) {
        boundaries.add(annotation.start);
        boundaries.add(annotation.end);
      }

      const points = Array.from(boundaries).sort((left, right) => left - right);
      const fragment = document.createDocumentFragment();

      for (let index = 0; index < points.length - 1; index += 1) {
        const start = points[index];
        const end = points[index + 1];
        const text = sourceText.slice(start, end);
        const activeIds = selections
          .filter((annotation) => annotation.start < end && annotation.end > start)
          .map((annotation) => annotation.id);

        if (activeIds.length === 0) {
          fragment.append(document.createTextNode(text));
          continue;
        }

        const span = document.createElement("span");
        span.className = "annotated";
        span.dataset.annotationIds = activeIds.join(" ");
        span.textContent = text;
        fragment.append(span);
      }

      sourceElement.replaceChildren(fragment);
    }

    function renderIndex() {
      headingElement.textContent = "Comments (" + annotations.length + ")";
      emptyElement.hidden = annotations.length > 0;
      listElement.replaceChildren();

      for (const annotation of annotations) {
        const item = document.createElement("article");
        item.className = "annotation";

        const header = document.createElement("div");
        header.className = "annotation-header";

        const location = document.createElement("span");
        location.textContent =
          annotation.kind === "selection"
            ? lineLabel(annotation.start, annotation.end)
            : "Whole document";

        const remove = document.createElement("button");
        remove.className = "danger";
        remove.type = "button";
        remove.textContent = "Remove";
        remove.addEventListener("click", (event) => {
          event.stopPropagation();
          removeAnnotation(annotation.id);
        });

        header.append(location, remove);

        const comment = document.createElement("div");
        comment.className = "annotation-comment";
        comment.textContent = annotation.comment;

        item.append(header, comment);

        if (annotation.kind === "selection") {
          const preview = document.createElement("div");
          preview.className = "annotation-preview";
          preview.textContent = compactPreview(
            sourceText.slice(annotation.start, annotation.end),
            100
          );
          item.append(preview);

          item.addEventListener("click", () => {
            const selector = '[data-annotation-ids~="' + annotation.id + '"]';
            sourceElement.querySelector(selector)?.scrollIntoView({
              block: "center",
              behavior: "smooth",
            });
          });
        }

        listElement.append(item);
      }
    }

    function finish(action) {
      window.glimpse.send({ action, annotations });
    }

    document.addEventListener("selectionchange", captureSelection);
    sourceElement.addEventListener("mouseup", captureSelection);
    sourceElement.addEventListener("keyup", captureSelection);
    selectionButton.addEventListener("click", addSelectionComment);
    document.getElementById("add-document").addEventListener("click", addDocumentComment);
    document.getElementById("cancel").addEventListener("click", () => {
      window.glimpse.close();
    });
    insertButton.addEventListener("click", () => finish("insert"));
    sendButton.addEventListener("click", () => finish("send"));

    commentElement.addEventListener("keydown", (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();

        if (pendingSelection) {
          addSelectionComment();
        } else {
          addDocumentComment();
        }
      }
    });

    render();
  </script>
</body>
</html>`;
}
