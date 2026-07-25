import { highlightMarkdown } from "./markdown-highlighter.ts";

interface AnnotatorPageOptions {
  path: string;
  displayPath: string;
  source: string;
  settings: string | null;
  draft: string | null;
}

export async function buildAnnotatorHTML(
  options: AnnotatorPageOptions,
): Promise<string> {
  const highlighted = await highlightMarkdown(options.source);
  const sourceBase64 = Buffer.from(options.source, "utf8").toString("base64");
  const syntaxBase64 = Buffer.from(
    JSON.stringify(highlighted.tokens),
    "utf8",
  ).toString("base64");
  const pathBase64 = Buffer.from(options.path, "utf8").toString("base64");
  const displayPathBase64 = Buffer.from(options.displayPath, "utf8").toString(
    "base64",
  );
  const settingsBase64 = Buffer.from(options.settings ?? "", "utf8").toString(
    "base64",
  );
  const draftBase64 = Buffer.from(options.draft ?? "", "utf8").toString(
    "base64",
  );

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
      --background: ${highlighted.lightBackground};
      --foreground: ${highlighted.lightForeground};
      --muted: color-mix(in srgb, CanvasText 58%, transparent);
      --subtle: color-mix(in srgb, CanvasText 7%, Canvas);
      --panel: color-mix(in srgb, CanvasText 3%, Canvas);
      --border: color-mix(in srgb, CanvasText 16%, transparent);
      --strong-border: color-mix(in srgb, CanvasText 28%, transparent);
      --accent: AccentColor;
      --accent-foreground: white;
      --accent-foreground: AccentColorText;
      --highlight: color-mix(in srgb, #f4c430 34%, transparent);
      --active-highlight: color-mix(in srgb, #f4c430 56%, transparent);
      --draft-highlight: color-mix(in srgb, var(--accent) 28%, transparent);
      --danger: #c93444;
      --rail-width: 360px;
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
      grid-template-rows: 45px minmax(0, 1fr) 45px;
      font-size: 15px;
    }

    button,
    textarea { font: inherit; }

    button {
      border: 1px solid var(--border);
      border-radius: 6px;
      background: var(--background);
      color: var(--foreground);
      cursor: pointer;
    }

    button:hover:not(:disabled) { border-color: var(--strong-border); }

    button:focus-visible,
    textarea:focus-visible,
    [tabindex]:focus-visible {
      outline: 2px solid color-mix(in srgb, var(--accent) 48%, transparent);
      outline-offset: 1px;
    }

    button:disabled {
      cursor: default;
      opacity: 0.42;
    }

    .topbar,
    .bottombar {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 0 10px;
      border-color: var(--border);
      background: var(--panel);
    }

    .topbar { border-bottom: 1px solid var(--border); }
    .bottombar { border-top: 1px solid var(--border); }

    .path {
      min-width: 0;
      overflow: hidden;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 14px;
      font-weight: 600;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .topbar-spacer,
    .bottombar-spacer { flex: 1; }

    .count {
      color: var(--muted);
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }

    .icon-button {
      display: inline-grid;
      width: 28px;
      height: 28px;
      padding: 0;
      place-items: center;
      border-color: transparent;
      background: transparent;
      font-size: 18px;
      line-height: 1;
    }

    .text-button {
      min-height: 29px;
      padding: 4px 9px;
      white-space: nowrap;
    }

    .workspace {
      display: grid;
      min-height: 0;
      grid-template-columns: minmax(420px, 1fr) 6px minmax(280px, var(--rail-width));
    }

    .document-pane {
      min-width: 0;
      overflow: auto;
      background: var(--background);
    }

    .source {
      width: 100%;
      min-width: 100%;
      min-height: 100%;
      padding: 12px 0 45vh;
      outline: none;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 15px;
      line-height: 1.62;
      tab-size: 2;
      user-select: text;
    }

    .source-line {
      display: grid;
      min-height: 1.62em;
      grid-template-columns: 46px 26px minmax(0, 1fr);
      align-items: start;
    }

    .source-line:hover { background: color-mix(in srgb, CanvasText 3%, transparent); }

    .line-number {
      padding-right: 8px;
      color: color-mix(in srgb, CanvasText 38%, transparent);
      text-align: right;
      user-select: none;
    }

    .line-markers {
      display: flex;
      min-height: 1.62em;
      align-items: center;
      gap: 1px;
      user-select: none;
    }

    .marker {
      display: grid;
      width: 18px;
      height: 18px;
      padding: 0;
      place-items: center;
      border: 0;
      border-radius: 50%;
      background: color-mix(in srgb, #b58700 85%, CanvasText);
      color: white;
      font-size: 12px;
      font-weight: 700;
      line-height: 1;
    }

    .marker + .marker { margin-left: -10px; }
    .line-markers:hover .marker { margin-left: 0; }
    .marker.active { background: var(--accent); color: var(--accent-foreground); z-index: 1; }

    .line-content {
      min-width: 0;
      min-height: 1.62em;
      padding-right: 24px;
      white-space: pre-wrap;
      overflow-wrap: normal;
      word-break: normal;
    }

    .line-content:empty::before {
      content: " ";
      user-select: none;
    }

    .source.nowrap .line-content { white-space: pre; }

    .source ::selection {
      background: color-mix(in srgb, var(--accent) 34%, transparent);
      color: inherit;
    }

    .syntax-token {
      color: var(--syntax-light);
      font-style: var(--syntax-font-style, normal);
      font-weight: var(--syntax-font-weight, inherit);
      text-decoration: var(--syntax-text-decoration, none);
    }

    .annotated {
      border-radius: 2px;
      background: var(--highlight);
      box-shadow: inset 0 -1px color-mix(in srgb, #a87900 65%, transparent);
    }

    .annotated.active { background: var(--active-highlight); }

    .draft-range {
      border-radius: 2px;
      background: var(--draft-highlight);
      box-shadow: inset 0 -2px color-mix(in srgb, var(--accent) 65%, transparent);
    }

    .divider {
      position: relative;
      cursor: col-resize;
      background: var(--panel);
      border-right: 1px solid var(--border);
      border-left: 1px solid var(--border);
    }

    .divider:hover,
    .divider.dragging { background: color-mix(in srgb, var(--accent) 20%, var(--panel)); }

    .review-pane {
      display: grid;
      min-width: 0;
      min-height: 0;
      grid-template-rows: auto minmax(0, 1fr);
      overflow: hidden;
      background: var(--panel);
    }

    .review-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      min-height: 42px;
      padding: 7px 12px;
      border-bottom: 1px solid var(--border);
    }

    .review-header strong { font-size: 15px; }

    .review-scroll {
      min-width: 0;
      min-height: 0;
      overflow-x: hidden;
      overflow-y: auto;
      padding: 10px;
    }

    .banner,
    .empty-state {
      margin: 2px 2px 10px;
      padding: 10px;
      border: 1px solid var(--border);
      border-radius: 7px;
      color: var(--muted);
      font-size: 14px;
      line-height: 1.45;
    }

    .banner {
      border-color: color-mix(in srgb, #b58700 45%, var(--border));
      background: color-mix(in srgb, #f4c430 10%, var(--background));
      color: var(--foreground);
    }

    .banner[hidden],
    .empty-state[hidden],
    .composer[hidden],
    .toast[hidden],
    .modal-backdrop[hidden] { display: none; }

    .composer {
      position: fixed;
      z-index: 20;
      width: min(420px, calc(100vw - 24px));
      max-height: calc(100vh - 24px);
      overflow: auto;
      padding: 10px;
      border: 1px solid color-mix(in srgb, var(--accent) 50%, var(--border));
      border-radius: 8px;
      background: var(--background);
      box-shadow: 0 9px 28px color-mix(in srgb, #000 22%, transparent);
    }

    .composer-target {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 7px;
      font-size: 14px;
      font-weight: 650;
    }

    .target-number {
      display: inline-grid;
      width: 18px;
      height: 18px;
      place-items: center;
      border-radius: 50%;
      background: var(--accent);
      color: var(--accent-foreground);
      font-size: 12px;
    }

    .composer-preview {
      margin-bottom: 8px;
      overflow: hidden;
      color: var(--muted);
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 13px;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    textarea {
      width: 100%;
      min-height: 92px;
      resize: vertical;
      padding: 8px 9px;
      border: 1px solid var(--border);
      border-radius: 6px;
      background: var(--background);
      color: var(--foreground);
      line-height: 1.45;
    }

    .composer-actions {
      display: flex;
      align-items: center;
      gap: 7px;
      margin-top: 8px;
    }

    .shortcut-hint {
      flex: 1;
      color: var(--muted);
      font-size: 13px;
    }

    .save-button {
      border-color: var(--accent);
      background: var(--accent);
      color: var(--accent-foreground);
    }

    .annotation-list {
      display: grid;
      min-width: 0;
      grid-template-columns: minmax(0, 1fr);
      gap: 8px;
    }

    .annotation-card {
      position: relative;
      min-width: 0;
      max-width: 100%;
      padding: 9px 34px 9px 10px;
      border: 1px solid var(--border);
      border-radius: 7px;
      background: var(--background);
      cursor: pointer;
    }

    .annotation-card:hover { border-color: var(--strong-border); }

    .annotation-card.active {
      border-color: color-mix(in srgb, var(--accent) 70%, var(--border));
      box-shadow: inset 3px 0 var(--accent);
    }

    .annotation-card.unresolved {
      border-color: color-mix(in srgb, #b58700 55%, var(--border));
    }

    .annotation-location {
      display: flex;
      align-items: center;
      gap: 6px;
      color: var(--muted);
      font-size: 13px;
    }

    .annotation-number {
      display: inline-grid;
      width: 18px;
      height: 18px;
      place-items: center;
      border-radius: 50%;
      background: color-mix(in srgb, #b58700 85%, CanvasText);
      color: white;
      font-size: 12px;
      font-weight: 700;
    }

    .annotation-card.active .annotation-number {
      background: var(--accent);
      color: var(--accent-foreground);
    }

    .annotation-comment {
      min-width: 0;
      margin-top: 7px;
      line-height: 1.45;
      overflow-wrap: anywhere;
      white-space: pre-wrap;
    }

    .annotation-preview {
      min-width: 0;
      max-width: 100%;
      margin-top: 7px;
      overflow: hidden;
      color: var(--muted);
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 13px;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .remove-comment {
      position: absolute;
      top: 6px;
      right: 6px;
      display: grid;
      width: 24px;
      height: 24px;
      padding: 0;
      place-items: center;
      border-color: transparent;
      background: transparent;
      color: var(--muted);
      font-size: 19px;
      line-height: 1;
    }

    .remove-comment:hover { color: var(--danger); }

    .reattach-button {
      margin-top: 8px;
      padding: 4px 8px;
      color: #8a6500;
    }

    .wrap-control {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      min-height: 28px;
      padding: 0 8px;
      color: var(--muted);
      font-size: 14px;
    }

    .wrap-control input { margin: 0; }

    .review-actions {
      display: inline-flex;
      align-items: center;
      gap: 7px;
    }

    .review-actions button {
      min-height: 30px;
      padding: 5px 10px;
      white-space: nowrap;
    }

    .send-action {
      min-width: 130px;
      border-color: var(--accent);
      background: var(--accent);
      color: var(--accent-foreground);
    }

    .toast {
      position: fixed;
      z-index: 25;
      left: 50%;
      bottom: 54px;
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 8px 10px;
      border: 1px solid var(--border);
      border-radius: 7px;
      background: var(--background);
      box-shadow: 0 8px 24px color-mix(in srgb, #000 20%, transparent);
      transform: translateX(-50%);
    }

    .toast button {
      padding: 3px 7px;
      border-color: transparent;
      color: var(--accent);
      font-weight: 650;
    }

    .modal-backdrop {
      position: fixed;
      z-index: 30;
      inset: 0;
      display: grid;
      padding: 20px;
      place-items: center;
      background: color-mix(in srgb, #000 38%, transparent);
    }

    .modal {
      width: min(430px, 100%);
      max-height: min(600px, 90vh);
      overflow: auto;
      padding: 17px;
      border: 1px solid var(--border);
      border-radius: 10px;
      background: var(--background);
      box-shadow: 0 14px 45px color-mix(in srgb, #000 30%, transparent);
    }

    .modal h2 { margin: 0 0 9px; font-size: 18px; }
    .modal p { margin: 0 0 14px; color: var(--muted); line-height: 1.5; }
    .modal-actions { display: flex; justify-content: flex-end; gap: 8px; }
    .modal-actions button { padding: 6px 10px; }
    .modal-actions .danger { border-color: var(--danger); color: var(--danger); }

    .shortcut-list {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 8px 16px;
      margin: 12px 0 18px;
    }

    kbd {
      padding: 2px 5px;
      border: 1px solid var(--border);
      border-bottom-color: var(--strong-border);
      border-radius: 4px;
      background: var(--subtle);
      font: 13px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      white-space: nowrap;
    }

    @media (prefers-color-scheme: dark) {
      :root {
        --background: ${highlighted.darkBackground};
        --foreground: ${highlighted.darkForeground};
      }

      .syntax-token { color: var(--syntax-dark); }
    }

    @media (max-width: 760px) {
      body { grid-template-rows: 42px minmax(0, 1fr) 45px; }
      .workspace { grid-template-columns: 1fr; grid-template-rows: minmax(280px, 1fr) minmax(180px, 42%); }
      .divider { display: none; }
      .review-pane { border-top: 1px solid var(--border); }
      .topbar .count { display: none; }
    }
  </style>
</head>
<body>
  <header class="topbar">
    <div id="path" class="path"></div>
    <div class="topbar-spacer"></div>
    <span id="top-count" class="count">0 comments</span>
    <button id="help" class="icon-button" type="button" title="Keyboard shortcuts (?)" aria-label="Keyboard shortcuts">?</button>
    <button id="close" class="icon-button" type="button" title="Close and keep draft" aria-label="Close and keep draft">×</button>
  </header>

  <main class="workspace">
    <section id="document-pane" class="document-pane" aria-label="Raw Markdown">
      <div id="source" class="source" tabindex="0" aria-label="Raw Markdown source"></div>
    </section>

    <div id="divider" class="divider" role="separator" aria-orientation="vertical" aria-label="Resize review rail"></div>

    <aside class="review-pane" aria-label="Review comments">
      <div class="review-header">
        <strong>Review</strong>
        <button id="document-comment" class="text-button" type="button" title="Add whole-document comment (D)">+ Document comment</button>
      </div>
      <div id="review-scroll" class="review-scroll">
        <div id="restore-banner" class="banner" hidden></div>

        <div id="empty-state" class="empty-state">
          Select text to comment on it. Press <kbd>D</kbd> for a whole-document comment.
        </div>
        <div id="annotation-list" class="annotation-list"></div>
      </div>
    </aside>
  </main>

  <footer class="bottombar">
    <label class="wrap-control" title="Toggle line wrapping (W)">
      <input id="wrap" type="checkbox" checked>
      Wrap
    </label>
    <span id="footer-status" class="count">No comments</span>
    <div class="bottombar-spacer"></div>
    <div class="review-actions">
      <button id="insert-action" type="button" disabled>Insert ⌘⇧↵</button>
      <button id="send-action" class="send-action" type="button" disabled>Send ⌘↵</button>
    </div>
  </footer>

  <section id="composer" class="composer" aria-label="Comment editor" hidden>
    <div class="composer-target">
      <span id="composer-number" class="target-number" hidden></span>
      <span id="composer-location"></span>
    </div>
    <div id="composer-preview" class="composer-preview"></div>
    <textarea id="comment" placeholder="Write a comment…" aria-label="Comment"></textarea>
    <div class="composer-actions">
      <span class="shortcut-hint">Esc cancel · ⌘↵ save</span>
      <button id="cancel-comment" class="text-button" type="button">Cancel</button>
      <button id="save-comment" class="text-button save-button" type="button">Add</button>
    </div>
  </section>

  <div id="toast" class="toast" role="status" hidden>
    <span id="toast-message"></span>
    <button id="undo" type="button">Undo</button>
  </div>

  <div id="help-modal" class="modal-backdrop" hidden>
    <section class="modal" role="dialog" aria-modal="true" aria-labelledby="help-heading">
      <h2 id="help-heading">Keyboard shortcuts</h2>
      <div class="shortcut-list">
        <span>Add a document comment</span><kbd>D</kbd>
        <span>Edit the active comment</span><kbd>E</kbd> or <kbd>Enter</kbd>
        <span>Remove the active comment</span><kbd>X</kbd>
        <span>Previous / next comment</span><kbd>K</kbd> / <kbd>J</kbd>
        <span>Toggle line wrapping</span><kbd>W</kbd>
        <span>Save a comment</span><kbd>⌘ Enter</kbd>
        <span>Send comments</span><kbd>⌘ Enter</kbd>
        <span>Insert into editor</span><kbd>⌘ Shift Enter</kbd>
        <span>Undo removed comment</span><kbd>⌘ Z</kbd>
        <span>Clear comments</span><kbd>⌘ Backspace</kbd>
        <span>Cancel the current action</span><kbd>Esc</kbd>
      </div>
      <div class="modal-actions">
        <button id="close-help" type="button">Close</button>
      </div>
    </section>
  </div>


  <script>
    const decodeUtf8 = (base64) => {
      const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
      return new TextDecoder().decode(bytes);
    };

    const sourceText = decodeUtf8("${sourceBase64}");
    const syntaxTokens = JSON.parse(decodeUtf8("${syntaxBase64}"));
    const sourcePath = decodeUtf8("${pathBase64}");
    const displayPath = decodeUtf8("${displayPathBase64}");
    const settingsKey = "pi-annotate:settings:v1";
    const draftKey = "pi-annotate:draft:" + hashText(sourcePath);
    const sourceFingerprint = hashText(sourceText);
    let storedSettings = decodeUtf8("${settingsBase64}") || null;
    let storedDraft = decodeUtf8("${draftBase64}") || null;

    const pathElement = document.getElementById("path");
    const documentPane = document.getElementById("document-pane");
    const sourceElement = document.getElementById("source");
    const dividerElement = document.getElementById("divider");
    const bannerElement = document.getElementById("restore-banner");
    const composerElement = document.getElementById("composer");
    const composerNumber = document.getElementById("composer-number");
    const composerLocation = document.getElementById("composer-location");
    const composerPreview = document.getElementById("composer-preview");
    const commentElement = document.getElementById("comment");
    const saveCommentButton = document.getElementById("save-comment");
    const listElement = document.getElementById("annotation-list");
    const emptyElement = document.getElementById("empty-state");
    const topCount = document.getElementById("top-count");
    const footerStatus = document.getElementById("footer-status");
    const wrapElement = document.getElementById("wrap");
    const insertAction = document.getElementById("insert-action");
    const sendAction = document.getElementById("send-action");
    const toastElement = document.getElementById("toast");
    const toastMessage = document.getElementById("toast-message");
    const helpModal = document.getElementById("help-modal");

    const lineStarts = buildLineStarts(sourceText);
    const syntaxTokensByLine = groupSyntaxTokensByLine(syntaxTokens);
    let annotations = [];
    let nextId = 1;
    let composer = null;
    let composerAnchor = null;
    let activeId = null;
    let reattachId = null;
    let deletedAnnotation = null;
    let toastTimer = null;
    let persistTimer = null;
    let hostPersistTimer = null;
    let geometryTimer = null;
    let finishing = false;
    let lastSourceSelectionAt = 0;
    let sourceSelectionInProgress = false;
    let selectionCaptureFrame = null;
    let pendingSelectionAnchor = null;
    let settings = loadSettings();

    pathElement.textContent = displayPath;
    document.documentElement.style.setProperty("--rail-width", settings.railWidth + "px");
    wrapElement.checked = settings.wrap;
    sourceElement.classList.toggle("nowrap", !settings.wrap);
    restoreWindowGeometry();

    restoreDraft();
    render();
    sourceElement.focus();

    function hashText(value) {
      let hash = 2166136261;
      for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
      }
      return (hash >>> 0).toString(36);
    }

    function safeParse(value) {
      try {
        return value ? JSON.parse(value) : null;
      } catch {
        return null;
      }
    }

    function loadSettings() {
      const stored = safeParse(safeStorageGet(settingsKey));
      const geometry = stored?.geometry;
      return {
        wrap: typeof stored?.wrap === "boolean" ? stored.wrap : true,
        railWidth: Number.isFinite(stored?.railWidth) ? clamp(stored.railWidth, 280, 620) : 360,
        geometry: geometry && Number.isFinite(geometry.x) && Number.isFinite(geometry.y) &&
          Number.isFinite(geometry.width) && Number.isFinite(geometry.height)
          ? geometry
          : null,
      };
    }

    function saveSettings() {
      safeStorageSet(settingsKey, JSON.stringify(settings));
    }

    function restoreWindowGeometry() {
      if (!settings.geometry) return;
      try {
        window.resizeTo(
          clamp(settings.geometry.width, 900, screen.availWidth),
          clamp(settings.geometry.height, 600, screen.availHeight),
        );
        window.moveTo(settings.geometry.x, settings.geometry.y);
      } catch {}
    }

    function captureWindowGeometry() {
      if (window.outerWidth < 1 || window.outerHeight < 1) return;
      settings.geometry = {
        x: window.screenX,
        y: window.screenY,
        width: window.outerWidth,
        height: window.outerHeight,
      };
      saveSettings();
    }

    function safeStorageGet(key) {
      if (key === settingsKey) return storedSettings;
      if (key === draftKey) return storedDraft;
      return null;
    }

    function safeStorageSet(key, value) {
      if (key === settingsKey) storedSettings = value;
      if (key === draftKey) storedDraft = value;
      scheduleHostPersistence();
    }

    function safeStorageRemove(key) {
      if (key === settingsKey) storedSettings = null;
      if (key === draftKey) storedDraft = null;
      scheduleHostPersistence();
    }

    function persistenceMessage(type, extra) {
      return {
        type,
        settings: storedSettings,
        draftKey,
        draft: storedDraft,
        ...extra,
      };
    }

    function scheduleHostPersistence() {
      clearTimeout(hostPersistTimer);
      hostPersistTimer = setTimeout(() => {
        window.glimpse.send(persistenceMessage("persist"));
      }, 80);
    }

    function sendTerminalMessage(type, extra) {
      clearTimeout(hostPersistTimer);
      window.glimpse.send(persistenceMessage(type, extra));
    }

    function schedulePersist() {
      clearTimeout(persistTimer);
      persistTimer = setTimeout(persistDraft, 120);
    }

    function persistDraft() {
      clearTimeout(persistTimer);
      if (annotations.length === 0 && !composer) {
        safeStorageRemove(draftKey);
        return;
      }

      const storedAnnotations = annotations.map((annotation) => ({
        ...annotation,
        selectedText: annotation.kind === "selection" && annotation.resolved !== false
          ? sourceText.slice(annotation.start, annotation.end)
          : annotation.selectedText,
      }));

      safeStorageSet(draftKey, JSON.stringify({
        version: 1,
        path: sourcePath,
        sourceFingerprint,
        savedAt: Date.now(),
        nextId,
        annotations: storedAnnotations,
        composer: composer ? { ...composer, comment: commentElement.value } : null,
      }));
    }

    function restoreDraft() {
      const stored = safeParse(safeStorageGet(draftKey));
      if (!stored || stored.version !== 1 || stored.path !== sourcePath || !Array.isArray(stored.annotations)) {
        return;
      }

      let reanchored = 0;
      let unresolved = 0;
      const sourceChanged = stored.sourceFingerprint !== sourceFingerprint;

      annotations = stored.annotations.flatMap((item) => {
        if (!item || typeof item.id !== "string" || typeof item.comment !== "string") {
          return [];
        }

        if (item.kind === "document") {
          return [{ id: item.id, kind: "document", comment: item.comment }];
        }

        if (item.kind !== "selection" || typeof item.selectedText !== "string" || item.selectedText.length === 0) {
          return [];
        }

        let start = Number.isInteger(item.start) ? item.start : -1;
        let end = Number.isInteger(item.end) ? item.end : -1;
        let resolved = sourceText.slice(start, end) === item.selectedText;

        if (!resolved) {
          const matches = allIndexesOf(sourceText, item.selectedText, 2);
          if (matches.length === 1) {
            start = matches[0];
            end = start + item.selectedText.length;
            resolved = true;
            reanchored += 1;
          } else {
            unresolved += 1;
          }
        }

        return [{
          id: item.id,
          kind: "selection",
          start,
          end,
          comment: item.comment,
          selectedText: item.selectedText,
          resolved,
        }];
      });

      nextId = Math.max(
        Number.isInteger(stored.nextId) ? stored.nextId : 1,
        ...annotations.map((annotation) => annotationNumber(annotation) + 1),
      );

      if (!sourceChanged && stored.composer && isRestorableComposer(stored.composer)) {
        composer = stored.composer;
        if (composer.mode === "create-selection") {
          const target = composer.target;
          if (!target || sourceText.slice(target.start, target.end) !== target.selectedText) {
            composer = null;
          }
        }
      }

      if (unresolved > 0) {
        bannerElement.textContent = "Restored a review from an older version. " + unresolved +
          plural(unresolved, " comment needs", " comments need") + " a new source selection.";
        bannerElement.hidden = false;
      } else if (sourceChanged || reanchored > 0) {
        bannerElement.textContent = "Restored and re-anchored your saved review to the current file.";
        bannerElement.hidden = false;
      } else {
        bannerElement.textContent = "Restored your saved review.";
        bannerElement.hidden = false;
      }

      if (composer) {
        queueMicrotask(() => {
          commentElement.value = stored.composer.comment || "";
          renderComposer();
          commentElement.focus();
        });
      }
    }

    function isRestorableComposer(value) {
      return value && typeof value.mode === "string" && typeof value.comment === "string";
    }

    function allIndexesOf(value, search, limit) {
      const matches = [];
      let from = 0;
      while (matches.length < limit) {
        const index = value.indexOf(search, from);
        if (index === -1) break;
        matches.push(index);
        from = index + 1;
      }
      return matches;
    }

    function buildLineStarts(value) {
      const starts = [0];
      for (let index = 0; index < value.length; index += 1) {
        if (value.charCodeAt(index) === 10) starts.push(index + 1);
      }
      return starts;
    }

    function lineIndexAt(offset) {
      let low = 0;
      let high = lineStarts.length;
      while (low + 1 < high) {
        const middle = Math.floor((low + high) / 2);
        if (lineStarts[middle] <= offset) low = middle;
        else high = middle;
      }
      return low;
    }

    function groupSyntaxTokensByLine(tokens) {
      const grouped = new Map();
      for (const token of tokens) {
        const lineIndex = lineIndexAt(token.start);
        const lineTokens = grouped.get(lineIndex) || [];
        lineTokens.push(token);
        grouped.set(lineIndex, lineTokens);
      }
      return grouped;
    }

    function lineLabel(start, end) {
      const first = lineIndexAt(start) + 1;
      const last = lineIndexAt(Math.max(start, end - 1)) + 1;
      return first === last ? "Line " + first : "Lines " + first + "–" + last;
    }

    function compactPreview(value, limit) {
      const compact = value.replace(/\\s+/g, " ").trim();
      return compact.length <= limit ? compact : compact.slice(0, limit - 1) + "…";
    }

    function annotationNumber(annotation) {
      const value = Number.parseInt(annotation.id.replace(/^a/, ""), 10);
      return Number.isFinite(value) ? value : 0;
    }

    function plural(count, one, many) {
      return count === 1 ? one : many;
    }

    function clamp(value, minimum, maximum) {
      return Math.min(maximum, Math.max(minimum, value));
    }

    function sortedAnnotations() {
      return [...annotations].sort((left, right) => {
        if (left.kind === "document" && right.kind !== "document") return -1;
        if (right.kind === "document" && left.kind !== "document") return 1;
        if (left.kind === "selection" && right.kind === "selection") {
          if (left.resolved === false && right.resolved !== false) return 1;
          if (right.resolved === false && left.resolved !== false) return -1;
          if (left.start !== right.start) return left.start - right.start;
        }
        return annotationNumber(left) - annotationNumber(right);
      });
    }

    function render() {
      renderSource();
      renderComposer();
      renderAnnotationList();
      renderActions();
      schedulePersist();
    }

    function renderSource() {
      const scrollTop = documentPane.scrollTop;
      const scrollLeft = documentPane.scrollLeft;
      const ranges = annotations
        .filter((annotation) => annotation.kind === "selection" && annotation.resolved !== false)
        .map((annotation) => ({ ...annotation, draft: false }));

      if (composer?.mode === "create-selection") {
        ranges.push({
          id: "draft",
          kind: "selection",
          start: composer.target.start,
          end: composer.target.end,
          draft: true,
          resolved: true,
        });
      }

      ranges.sort((left, right) => left.start - right.start || left.end - right.end);
      const markersByLine = new Map();
      for (const range of ranges) {
        if (range.draft) continue;
        const lineIndex = lineIndexAt(range.start);
        const markers = markersByLine.get(lineIndex) || [];
        markers.push(range);
        markersByLine.set(lineIndex, markers);
      }

      const fragment = document.createDocumentFragment();
      let rangeCursor = 0;
      let activeRanges = [];

      for (let lineIndex = 0; lineIndex < lineStarts.length; lineIndex += 1) {
        const lineStart = lineStarts[lineIndex];
        const nextStart = lineIndex + 1 < lineStarts.length ? lineStarts[lineIndex + 1] : sourceText.length;
        const lineEnd = nextStart > lineStart && sourceText.charCodeAt(nextStart - 1) === 10
          ? nextStart - 1
          : nextStart;

        activeRanges = activeRanges.filter((range) => range.end > lineStart);
        while (rangeCursor < ranges.length && ranges[rangeCursor].start < Math.max(lineEnd, lineStart + 1)) {
          if (ranges[rangeCursor].end > lineStart) activeRanges.push(ranges[rangeCursor]);
          rangeCursor += 1;
        }

        const row = document.createElement("div");
        row.className = "source-line";
        row.dataset.line = String(lineIndex + 1);

        const number = document.createElement("span");
        number.className = "line-number";
        number.textContent = String(lineIndex + 1);

        const markers = document.createElement("span");
        markers.className = "line-markers";
        for (const range of markersByLine.get(lineIndex) || []) {
          const marker = document.createElement("button");
          marker.type = "button";
          marker.className = "marker";
          marker.dataset.annotationId = range.id;
          marker.textContent = String(annotationNumber(range));
          marker.title = "Comment " + annotationNumber(range) + " — " + lineLabel(range.start, range.end);
          marker.addEventListener("click", (event) => {
            event.stopPropagation();
            beginEdit(range.id, eventPoint(event));
          });
          markers.append(marker);
        }

        const content = document.createElement("span");
        content.className = "line-content";
        content.dataset.start = String(lineStart);
        content.dataset.end = String(lineEnd);
        appendLineContent(
          content,
          lineStart,
          lineEnd,
          activeRanges,
          syntaxTokensByLine.get(lineIndex) || [],
        );

        row.append(number, markers, content);
        fragment.append(row);
      }

      sourceElement.replaceChildren(fragment);
      documentPane.scrollTop = scrollTop;
      documentPane.scrollLeft = scrollLeft;
      updateActiveStyles();
    }

    function appendLineContent(content, lineStart, lineEnd, ranges, lineSyntax) {
      if (lineStart === lineEnd) return;

      const boundaries = new Set([lineStart, lineEnd]);
      for (const range of ranges) {
        if (range.start < lineEnd && range.end > lineStart) {
          boundaries.add(clamp(range.start, lineStart, lineEnd));
          boundaries.add(clamp(range.end, lineStart, lineEnd));
        }
      }
      for (const token of lineSyntax) {
        boundaries.add(clamp(token.start, lineStart, lineEnd));
        boundaries.add(clamp(token.end, lineStart, lineEnd));
      }

      const points = Array.from(boundaries).sort((left, right) => left - right);
      for (let index = 0; index < points.length - 1; index += 1) {
        const start = points[index];
        const end = points[index + 1];
        const text = sourceText.slice(start, end);
        const matching = ranges.filter((range) => range.start < end && range.end > start);
        const syntax = lineSyntax.find((token) => token.start <= start && token.end >= end);
        if (matching.length === 0 && !syntax) {
          content.append(document.createTextNode(text));
          continue;
        }

        const span = document.createElement("span");
        span.textContent = text;
        if (syntax) applySyntaxStyle(span, syntax);
        if (matching.length > 0) applyAnnotationStyle(span, matching);
        content.append(span);
      }
    }

    function applySyntaxStyle(span, syntax) {
      span.classList.add("syntax-token");
      span.style.setProperty("--syntax-light", syntax.lightColor);
      span.style.setProperty("--syntax-dark", syntax.darkColor);
      if ((syntax.fontStyle & 1) !== 0) span.style.setProperty("--syntax-font-style", "italic");
      if ((syntax.fontStyle & 2) !== 0) span.style.setProperty("--syntax-font-weight", "700");
      if ((syntax.fontStyle & 4) !== 0) span.style.setProperty("--syntax-text-decoration", "underline");
    }

    function applyAnnotationStyle(span, matching) {
      const isDraft = matching.some((range) => range.draft);
      span.classList.add(isDraft ? "draft-range" : "annotated");
      span.dataset.annotationIds = matching.filter((range) => !range.draft).map((range) => range.id).join(" ");
      span.addEventListener("mouseenter", () => {
        const id = matching.find((range) => !range.draft)?.id;
        if (id) setActiveId(id, false);
      });
      span.addEventListener("click", (event) => {
        if (performance.now() - lastSourceSelectionAt < 250) return;
        const id = matching.find((range) => !range.draft)?.id;
        if (id && window.getSelection()?.isCollapsed) beginEdit(id, eventPoint(event));
      });
    }

    function renderComposer() {
      composerElement.hidden = !composer;
      if (!composer) return;

      let location = "Whole document";
      let preview = "Comment on the document as a whole";
      let number = null;

      if (composer.mode === "create-selection") {
        location = lineLabel(composer.target.start, composer.target.end);
        preview = compactPreview(sourceText.slice(composer.target.start, composer.target.end), 120);
      } else if (composer.mode === "edit") {
        const annotation = annotations.find((item) => item.id === composer.annotationId);
        if (!annotation) {
          cancelComposer();
          return;
        }
        number = annotationNumber(annotation);
        if (annotation.kind === "selection") {
          location = annotation.resolved === false ? "Needs a new source selection" : lineLabel(annotation.start, annotation.end);
          preview = compactPreview(annotation.selectedText || sourceText.slice(annotation.start, annotation.end), 120);
        }
      }

      composerNumber.hidden = number === null;
      composerNumber.textContent = number === null ? "" : String(number);
      composerLocation.textContent = location;
      composerPreview.textContent = preview;
      saveCommentButton.textContent = composer.mode === "edit" ? "Save" : "Add";
      positionComposer();
    }

    function positionComposer() {
      if (composerElement.hidden) return;

      const margin = 12;
      const gap = 12;
      const bounds = composerElement.getBoundingClientRect();
      let left = (window.innerWidth - bounds.width) / 2;
      let top = (window.innerHeight - bounds.height) / 2;

      if (composerAnchor) {
        left = composerAnchor.x + gap;
        if (left + bounds.width > window.innerWidth - margin) {
          left = composerAnchor.x - bounds.width - gap;
        }

        top = composerAnchor.y + gap;
        if (top + bounds.height > window.innerHeight - margin) {
          top = composerAnchor.y - bounds.height - gap;
        }
      }

      composerElement.style.left = clamp(left, margin, window.innerWidth - bounds.width - margin) + "px";
      composerElement.style.top = clamp(top, margin, window.innerHeight - bounds.height - margin) + "px";
    }

    function renderAnnotationList() {
      listElement.replaceChildren();
      emptyElement.hidden = annotations.length > 0 || Boolean(composer);

      for (const annotation of sortedAnnotations()) {
        const card = document.createElement("article");
        card.className = "annotation-card";
        card.tabIndex = 0;
        card.dataset.annotationId = annotation.id;
        card.classList.toggle("active", annotation.id === activeId);
        card.classList.toggle("unresolved", annotation.resolved === false);

        const location = document.createElement("div");
        location.className = "annotation-location";

        const number = document.createElement("span");
        number.className = "annotation-number";
        number.textContent = String(annotationNumber(annotation));

        const label = document.createElement("span");
        label.textContent = annotation.kind === "document"
          ? "Whole document"
          : annotation.resolved === false
            ? "Needs a new source selection"
            : lineLabel(annotation.start, annotation.end);
        location.append(number, label);

        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "remove-comment";
        remove.textContent = "×";
        remove.title = "Remove comment";
        remove.setAttribute("aria-label", "Remove comment " + annotationNumber(annotation));
        remove.addEventListener("click", (event) => {
          event.stopPropagation();
          removeAnnotation(annotation.id);
        });

        const comment = document.createElement("div");
        comment.className = "annotation-comment";
        comment.textContent = annotation.comment;
        card.append(location, remove, comment);

        if (annotation.kind === "selection") {
          const preview = document.createElement("div");
          preview.className = "annotation-preview";
          preview.textContent = compactPreview(
            annotation.selectedText || sourceText.slice(annotation.start, annotation.end),
            100,
          );
          card.append(preview);

          if (annotation.resolved === false) {
            const reattach = document.createElement("button");
            reattach.type = "button";
            reattach.className = "reattach-button";
            reattach.textContent = "Reattach";
            reattach.addEventListener("click", (event) => {
              event.stopPropagation();
              beginReattach(annotation.id);
            });
            card.append(reattach);
          }
        }

        card.addEventListener("mouseenter", () => setActiveId(annotation.id, false));
        card.addEventListener("focus", () => setActiveId(annotation.id, false));
        card.addEventListener("click", (event) => {
          beginEdit(annotation.id, eventPoint(event));
          scrollAnnotationSource(annotation);
        });
        card.addEventListener("keydown", (event) => {
          if (event.key === "Enter" || event.key.toLowerCase() === "e") {
            event.preventDefault();
            event.stopPropagation();
            beginEdit(annotation.id);
          } else if (event.key.toLowerCase() === "x") {
            event.preventDefault();
            event.stopPropagation();
            removeAnnotation(annotation.id);
          }
        });

        listElement.append(card);
      }
      updateActiveStyles();
    }

    function renderActions() {
      const count = annotations.length;
      const unresolved = annotations.filter((annotation) => annotation.resolved === false).length;
      topCount.textContent = count + plural(count, " comment", " comments");
      footerStatus.textContent = reattachId
        ? "Select replacement source for comment " + annotationNumber(annotations.find((item) => item.id === reattachId))
        : unresolved > 0
          ? unresolved + plural(unresolved, " comment needs", " comments need") + " a source selection"
          : count === 0
            ? "No comments"
            : count + plural(count, " comment", " comments") + " ready";

      const disabled = count === 0 || unresolved > 0 || Boolean(composer);
      sendAction.disabled = disabled;
      insertAction.disabled = disabled;
    }

    function eventPoint(event) {
      return event.detail === 0 ? null : { x: event.clientX, y: event.clientY };
    }

    function sourceOffset(node, offset) {
      const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
      const content = element?.closest?.(".line-content");
      if (content && sourceElement.contains(content)) {
        const range = document.createRange();
        range.selectNodeContents(content);
        try {
          range.setEnd(node, offset);
        } catch {
          return null;
        }
        return Number(content.dataset.start) + range.toString().length;
      }

      if (node.nodeType !== Node.ELEMENT_NODE) return null;
      if (node === sourceElement) {
        if (offset <= 0) return 0;
        if (offset >= sourceElement.children.length) return sourceText.length;
        return lineStarts[offset] ?? null;
      }

      const row = element?.closest?.(".source-line");
      if (!row || !sourceElement.contains(row) || node !== row) return null;
      const lineContent = row.querySelector(".line-content");
      const contentIndex = Array.prototype.indexOf.call(row.childNodes, lineContent);
      return offset <= contentIndex
        ? Number(lineContent.dataset.start)
        : Number(lineContent.dataset.end);
    }

    function selectedSourceRange() {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null;
      const range = selection.getRangeAt(0);
      const start = sourceOffset(range.startContainer, range.startOffset);
      const end = sourceOffset(range.endContainer, range.endOffset);
      return start === null || end === null || end <= start ? null : { start, end };
    }

    function scheduleSourceSelectionCapture(anchor = null) {
      if (anchor) pendingSelectionAnchor = anchor;
      if (selectionCaptureFrame !== null) cancelAnimationFrame(selectionCaptureFrame);
      selectionCaptureFrame = requestAnimationFrame(() => {
        selectionCaptureFrame = null;
        const captureAnchor = pendingSelectionAnchor;
        pendingSelectionAnchor = null;
        captureSourceSelection(captureAnchor);
      });
    }

    function captureSourceSelection(anchor) {
      const selection = window.getSelection();
      const selectedRange = selectedSourceRange();
      if (!selection || !selectedRange) return;
      const { start, end } = selectedRange;

      if (reattachId) {
        const annotation = annotations.find((item) => item.id === reattachId);
        if (annotation) {
          annotation.start = start;
          annotation.end = end;
          annotation.selectedText = sourceText.slice(start, end);
          annotation.resolved = true;
          activeId = annotation.id;
        }
        reattachId = null;
        bannerElement.hidden = true;
        selection.removeAllRanges();
        render();
        sourceElement.focus();
        return;
      }

      if (composer && commentElement.value.trim() !== "") {
        showToast("Save or cancel the current comment first", false);
        selection.removeAllRanges();
        return;
      }

      lastSourceSelectionAt = performance.now();
      composer = {
        mode: "create-selection",
        target: { start, end, selectedText: sourceText.slice(start, end) },
        comment: "",
      };
      composerAnchor = anchor;
      activeId = null;
      selection.removeAllRanges();
      render();
      commentElement.value = "";
      commentElement.focus();
    }

    function beginDocumentComment(anchor = null) {
      if (composer && commentElement.value.trim() !== "") {
        showToast("Save or cancel the current comment first", false);
        commentElement.focus();
        return;
      }
      composer = { mode: "create-document", comment: "" };
      composerAnchor = anchor;
      activeId = null;
      render();
      commentElement.value = "";
      commentElement.focus();
    }

    function beginEdit(id, anchor = null) {
      const annotation = annotations.find((item) => item.id === id);
      if (!annotation) return;
      composer = { mode: "edit", annotationId: id, comment: annotation.comment };
      composerAnchor = anchor;
      activeId = id;
      render();
      commentElement.value = annotation.comment;
      commentElement.focus();
      commentElement.setSelectionRange(commentElement.value.length, commentElement.value.length);
    }

    function saveComment() {
      if (!composer) return;
      const comment = commentElement.value.trim();
      if (!comment) {
        commentElement.focus();
        return;
      }

      if (composer.mode === "edit") {
        const annotation = annotations.find((item) => item.id === composer.annotationId);
        if (annotation) {
          annotation.comment = comment;
          activeId = annotation.id;
        }
      } else if (composer.mode === "create-document") {
        const id = "a" + nextId++;
        annotations.push({ id, kind: "document", comment });
        activeId = id;
      } else {
        const id = "a" + nextId++;
        annotations.push({
          id,
          kind: "selection",
          start: composer.target.start,
          end: composer.target.end,
          selectedText: composer.target.selectedText,
          resolved: true,
          comment,
        });
        activeId = id;
      }

      composer = null;
      composerAnchor = null;
      commentElement.value = "";
      render();
      sourceElement.focus();
    }

    function cancelComposer() {
      composer = null;
      composerAnchor = null;
      commentElement.value = "";
      render();
      sourceElement.focus();
    }

    function beginReattach(id) {
      if (composer) cancelComposer();
      reattachId = id;
      activeId = id;
      footerStatus.textContent = "Select replacement source for comment " + annotationNumber(annotations.find((item) => item.id === id));
      sourceElement.focus();
      updateActiveStyles();
    }

    function removeAnnotation(id) {
      const index = annotations.findIndex((annotation) => annotation.id === id);
      if (index === -1) return;
      deletedAnnotation = { annotation: annotations[index], index };
      annotations.splice(index, 1);
      if (annotations.length === 0) nextId = 1;
      if (activeId === id) activeId = null;
      if (reattachId === id) reattachId = null;
      if (composer?.annotationId === id) {
        composer = null;
        composerAnchor = null;
      }
      render();
      showToast("Comment removed", true);
    }

    function undoRemoval() {
      if (!deletedAnnotation) return;
      const { annotation, index } = deletedAnnotation;
      if (annotations.some((item) => item.id === annotation.id)) {
        annotation.id = "a" + nextId++;
      }
      annotations.splice(index, 0, annotation);
      nextId = Math.max(nextId, annotationNumber(annotation) + 1);
      activeId = annotation.id;
      deletedAnnotation = null;
      hideToast();
      render();
      activateAnnotation(activeId, true);
    }

    function showToast(message, canUndo) {
      clearTimeout(toastTimer);
      toastMessage.textContent = message;
      document.getElementById("undo").hidden = !canUndo;
      toastElement.hidden = false;
      toastTimer = setTimeout(hideToast, 4500);
    }

    function hideToast() {
      clearTimeout(toastTimer);
      toastElement.hidden = true;
    }

    function setActiveId(id, scrollCard) {
      activeId = id;
      updateActiveStyles();
      if (scrollCard) {
        listElement.querySelector('[data-annotation-id="' + id + '"]')?.scrollIntoView({ block: "nearest" });
      }
    }

    function activateAnnotation(id, shouldScroll) {
      const annotation = annotations.find((item) => item.id === id);
      if (!annotation) return;
      setActiveId(id, shouldScroll);
      if (shouldScroll) scrollAnnotationSource(annotation);
    }

    function scrollAnnotationSource(annotation) {
      if (annotation.kind !== "selection" || annotation.resolved === false) return;
      const marker = sourceElement.querySelector('.marker[data-annotation-id="' + annotation.id + '"]');
      marker?.closest(".source-line")?.scrollIntoView({ block: "center", behavior: "smooth" });
    }

    function updateActiveStyles() {
      for (const element of document.querySelectorAll("[data-annotation-id]")) {
        element.classList.toggle("active", element.dataset.annotationId === activeId);
      }
      for (const element of sourceElement.querySelectorAll("[data-annotation-ids]")) {
        const ids = element.dataset.annotationIds.split(" ");
        element.classList.toggle("active", Boolean(activeId && ids.includes(activeId)));
      }
    }

    function moveActive(direction) {
      const ordered = sortedAnnotations();
      if (ordered.length === 0) return;
      const index = ordered.findIndex((annotation) => annotation.id === activeId);
      const nextIndex = index === -1
        ? direction > 0 ? 0 : ordered.length - 1
        : (index + direction + ordered.length) % ordered.length;
      activateAnnotation(ordered[nextIndex].id, true);
      listElement.querySelector('[data-annotation-id="' + ordered[nextIndex].id + '"]')?.focus();
    }

    function finish(action) {
      if (composer) {
        showToast("Save or cancel the current comment first", false);
        commentElement.focus();
        return;
      }
      const unresolved = annotations.filter((annotation) => annotation.resolved === false);
      if (annotations.length === 0 || unresolved.length > 0) {
        if (unresolved.length > 0) showToast("Reattach unresolved comments before finishing", false);
        return;
      }

      captureWindowGeometry();
      finishing = true;
      clearTimeout(persistTimer);
      safeStorageRemove(draftKey);
      const result = annotations.map((annotation) => annotation.kind === "document"
        ? { id: annotation.id, kind: "document", comment: annotation.comment }
        : {
            id: annotation.id,
            kind: "selection",
            start: annotation.start,
            end: annotation.end,
            comment: annotation.comment,
          });
      sendTerminalMessage("result", {
        result: { action, annotations: result },
      });
    }

    function openHelp() {
      helpModal.hidden = false;
      document.getElementById("close-help").focus();
    }

    function closeHelp() {
      helpModal.hidden = true;
      sourceElement.focus();
    }

    function clearComments() {
      annotations = [];
      nextId = 1;
      composer = null;
      composerAnchor = null;
      activeId = null;
      reattachId = null;
      deletedAnnotation = null;
      hideToast();
      safeStorageRemove(draftKey);
      render();
      sourceElement.focus();
    }

    function closeAndKeepDraft() {
      persistDraft();
      captureWindowGeometry();
      sendTerminalMessage("close");
    }

    sourceElement.addEventListener("mousedown", () => {
      sourceSelectionInProgress = true;
    });
    sourceElement.addEventListener("copy", (event) => {
      const range = selectedSourceRange();
      if (!range || !event.clipboardData) return;
      event.preventDefault();
      event.clipboardData.setData("text/plain", sourceText.slice(range.start, range.end));
    });
    document.addEventListener("mouseup", (event) => {
      if (!sourceSelectionInProgress) return;
      sourceSelectionInProgress = false;
      scheduleSourceSelectionCapture(eventPoint(event));
    });
    document.addEventListener("keyup", () => {
      scheduleSourceSelectionCapture();
    });
    window.addEventListener("blur", () => {
      sourceSelectionInProgress = false;
    });

    document.getElementById("document-comment").addEventListener("click", (event) => {
      beginDocumentComment(eventPoint(event));
    });
    document.getElementById("save-comment").addEventListener("click", saveComment);
    document.getElementById("cancel-comment").addEventListener("click", cancelComposer);
    document.getElementById("undo").addEventListener("click", undoRemoval);
    document.getElementById("close").addEventListener("click", closeAndKeepDraft);
    document.getElementById("help").addEventListener("click", openHelp);
    document.getElementById("close-help").addEventListener("click", closeHelp);

    commentElement.addEventListener("input", schedulePersist);
    commentElement.addEventListener("keydown", (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        event.stopPropagation();
        saveComment();
      } else if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        cancelComposer();
      }
    });

    wrapElement.addEventListener("change", () => {
      settings.wrap = wrapElement.checked;
      sourceElement.classList.toggle("nowrap", !settings.wrap);
      saveSettings();
    });

    sendAction.addEventListener("click", () => finish("send"));
    insertAction.addEventListener("click", () => finish("insert"));

    dividerElement.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      dividerElement.classList.add("dragging");
      dividerElement.setPointerCapture(event.pointerId);
    });

    dividerElement.addEventListener("pointermove", (event) => {
      if (!dividerElement.hasPointerCapture(event.pointerId)) return;
      const width = clamp(window.innerWidth - event.clientX, 280, Math.min(620, window.innerWidth - 426));
      settings.railWidth = width;
      document.documentElement.style.setProperty("--rail-width", width + "px");
    });

    dividerElement.addEventListener("pointerup", (event) => {
      if (!dividerElement.hasPointerCapture(event.pointerId)) return;
      dividerElement.releasePointerCapture(event.pointerId);
      dividerElement.classList.remove("dragging");
      saveSettings();
    });

    document.addEventListener("keydown", (event) => {
      const typing = event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLInputElement;
      const command = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();

      if (command && (key === "w" || key === "q")) {
        event.preventDefault();
        closeAndKeepDraft();
        return;
      }

      if (command && key === "z" && !typing && deletedAnnotation) {
        event.preventDefault();
        undoRemoval();
        return;
      }

      if (command && event.key === "Backspace" && !typing) {
        event.preventDefault();
        clearComments();
        return;
      }

      if (command && event.key === "Enter" && !typing) {
        event.preventDefault();
        finish(event.shiftKey ? "insert" : "send");
        return;
      }

      if (event.key === "Escape") {
        if (!helpModal.hidden) closeHelp();
        else if (composer) cancelComposer();
        else if (reattachId) {
          reattachId = null;
          renderActions();
          sourceElement.focus();
        } else return;
        event.preventDefault();
        return;
      }

      const buttonFocused = event.target instanceof HTMLButtonElement;
      if (typing || buttonFocused || command || event.altKey) return;
      if (key === "?") {
        event.preventDefault();
        openHelp();
      } else if (key === "d") {
        event.preventDefault();
        beginDocumentComment();
      } else if (key === "j") {
        event.preventDefault();
        moveActive(1);
      } else if (key === "k") {
        event.preventDefault();
        moveActive(-1);
      } else if (key === "w") {
        event.preventDefault();
        wrapElement.checked = !wrapElement.checked;
        wrapElement.dispatchEvent(new Event("change"));
      } else if ((key === "e" || event.key === "Enter") && activeId) {
        event.preventDefault();
        beginEdit(activeId);
      } else if (key === "x" && activeId) {
        event.preventDefault();
        removeAnnotation(activeId);
      }
    });

    window.addEventListener("resize", () => {
      positionComposer();
      clearTimeout(geometryTimer);
      geometryTimer = setTimeout(captureWindowGeometry, 250);
    });

    window.addEventListener("beforeunload", () => {
      captureWindowGeometry();
      if (!finishing) persistDraft();
      clearTimeout(hostPersistTimer);
      window.glimpse.send(persistenceMessage("persist"));
    });
  </script>
</body>
</html>`;
}
