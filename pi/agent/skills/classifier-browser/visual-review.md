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

Run sheet.py directly; its uv shebang manages Python and Pillow. No ImageMagick or system
font setup is needed. Supply a JSON manifest with absolute or manifest-relative
PNG paths and expected states; omitted IDs become numbered checkpoints.
Output must be a new PNG path.

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

Substitute your reported run directory:

```bash
~/.pi/agent/skills/classifier-browser/sheet.py \
  /tmp/YOUR-RUN/captures.json /tmp/YOUR-RUN/contact-sheet.png
```

The script wraps labels and chooses one or two columns to maximize displayed
image area without upscaling. Canvas dimensions follow the content, capped at
2000 × 2000 including labels and gutters. More than four captures produce
contact-sheet-01.png, contact-sheet-02.png, etc.; JSON output lists every sheet.
Labels are literal text, not ImageMagick expressions. Extremely long labels
that cannot fit still require shortening.

## Review and refine

- Start with the automatic layout. Use fewer panels or focused crops for fine details.
- Use original PNG captures, never earlier sheets or lossy derivatives.
  The script preserves aspect ratio and resizes once.
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
headings and nearby labels. Layout is automatic, cropping is not.
Reframe source captures rather than enlarging tiny text.

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
