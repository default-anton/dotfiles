# Capture checkpoints, then review sheets

## Capture contract

Runnable example: forms.md (empty → prepared → cancelled → reopened/reset).
For navigation, check selected view, URL/content identity and unchanged fields.

For every checkpoint, code:
1. Waits for the required state and verifies its actual values/content.
2. Frames the relevant region, including header clearance and surrounding context.
3. Captures a new source PNG and rechecks the state.
4. Appends `{id, expected, path}` to `captures` only after both checks pass.

Keep every required checkpoint even when DOM states look identical; cancellation
and reset need separate evidence. For long content, use scroll checkpoints,
not one enormous full-page screenshot shrunk to illegibility.
Capture is deterministic host work, not a Jev question.

## Build a sheet

sheet.py requires Python 3, ImageMagick (`magick`) and an installed font file.
It composes 1–4 panels from a JSON manifest with absolute or manifest-relative
source paths. Output must be a new PNG path.

```json
[
  {"id":"01-empty","expected":"Empty draft; defaults preserved","path":"01-empty.png"}
]
```

Write the manifest from the report stored by forms.md:

```js
const report = load("formRun");
const quote = value => "'" + String(value).replace(/'/g, "'\\''") + "'";
const manifest = `${report.outputDir}/captures.json`;
const saved = await tools.bash({
  command: `printf '%s\\n' ${quote(JSON.stringify(report.captures))} > ${quote(manifest)}`,
  timeout: 10
});
if (saved.exit_code !== 0) throw new Error("manifest_write");
text({ manifest });
```

For example on macOS, substitute your reported run directory:

```bash
python3 ~/.pi/agent/skills/classifier-browser/sheet.py \
  /tmp/YOUR-RUN/captures.json /tmp/YOUR-RUN/overview.png \
  --font /System/Library/Fonts/Supplemental/Arial.ttf \
  --columns 2 --width 1600 --height 1200
```

Elsewhere, pass an installed font file (`fc-match -f '%{file}' sans` on fontconfig
systems). Shorten rejected labels; the script never silently clips or shrinks them.

## Review and refine

- Maximum entire canvas: 2000 × 2000 px, including labels and gutters.
  Use smaller, task-shaped dimensions when appropriate.
- Start with 2 × 2 panels for layout/state checks. Use fewer panels or
  focused crops for text and fine details.
- Preserve aspect ratio. Resize once from source captures, never from an
  earlier sheet. Prefer PNG; do not use aggressive lossy compression.
- Label each panel with its checkpoint ID and expected state. Keep enough
  surrounding context to establish which control/view the detail belongs to.
- Review every panel using the image tool. If any required detail is
  unreadable, leave that obligation pending and build another sheet with fewer
  panels or larger contextual crops. Never infer visual verification from DOM.
- Keep source captures for rebuilding sheets, not mandatory individual review.

The script enforces dimensions and crop bounds, not readability or meaningful framing.

For a detail sheet, create a second manifest referencing the original PNGs.
Optional `crop` is `[x, y, width, height]` in source pixels:

```json
[
  {"id":"02-recurrence","expected":"Weekly / 2 weeks / Tue + Fri","path":"02-prepared.png","crop":[100,480,1000,540]},
  {"id":"04-defaults","expected":"Daily / first run 09:00","path":"04-reset.png","crop":[100,300,1000,460]}
]
```

Choose crop coordinates from actual captures, not these examples; retain section
headings and nearby labels. Try `--columns 1 --width 1200 --height 1600`, or a
shorter canvas for one panel. Reframe source captures rather than enlarging tiny text.

## Report and optional timing

Keep a small review record per panel: checkpoint ID, sheet path, findings,
and which visual obligations are verified or still unreadable. Say
“automation verified; visual review pending” until required panels are reviewed.

For end-to-end timing, store `Date.now()` before loading/running the workflow.
In the first Code Mode call after sheet review:

```js
text({ captureThroughReviewMs: Date.now() - load("formStarted") });
```

This includes loading, capture, sheet generation, parent turns and review.
Report it separately from `workflowMs` (before close), `wallMs` (including close),
and classifier usage. Follow SKILL.md's reporting and benchmarking rules.
