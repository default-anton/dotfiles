# Interaction checks

Use when relevant. These experiments may not generalize to other sites or versions.

Search/navigation:
Search may be a textbox, searchbox or combobox. After Enter, wait for article
or results; do not seek another link if already at the destination. Check URL
predicates against URLs alone, not URL+label strings. Require destination identity
and content readiness: URLs can change before old content disappears.

Keyboard/contenteditable:
Verify focus and actual selection/Range before destructive edits, then text/HTML
afterward. `fill` has inserted instead of replaced; select-all has failed despite
command success. Stop rather than blindly trying shortcuts.

Uploads:
Use host-owned canonical paths. Verify accepted names, MIME, nonzero sizes/content
and app attachment identity. CLI success has accompanied unreadable zero-byte
files. Draft selection does not prove server upload or native-picker cancellation.

Drag/drop:
Authorize the exact source/destination pair. Verify ordered membership and unchanged
unrelated items. Native drag, synthetic DataTransfer and direct DOM mutation are
different coverage.

Iframes:
Verify child URL/origin and scoped values. Some CLI versions scope snapshots/values
but leave eval/get-url at the top document. Top-level identity is not child proof;
stop on unsupported scope.

Popups/tabs:
Identify the new owned target from before/after tabs, URL and opener/content.
Switch explicitly and rebuild refs. Close only that child; verify the parent is unchanged.

Authentication:
Use approved account scope and safe vault transport. Never put secrets in classifier
state, shell arguments or reports. Opaque keys do not protect DOM, screenshots,
traces or saved browser state.

## Navigation-only adaptation

Reuse example.js's checked `browser` wrapper, chooser loader, budgets and
handoff reporting. Replace its search block with the pattern below.
Inspect actual DOM before writing probes: an accessibility `region` may be a
semantic `<section>`, not an element with a literal `role="region"` attribute.

`scope`, `task`, `allowedHrefs`, `destinationReady`, `evidence` and
`remaining` are host-defined, not classifier output.
`allowedHrefs` is a Set of exact permitted hrefs observed during site inspection;
for dynamic destinations, derive it from an independently verified container
(for example the release carrying GitHub's Latest badge), not the first link.

```js
const page = await browser("snapshot", "-i", "-c", "-s", scope);
if (page.snapshot.length > 10000) throw new Error("scope_required");
const present = new Set([...page.snapshot.matchAll(/ref=(e\d+)/g)].map(m => m[1]));
const click = {};
for (const [ref, target] of Object.entries(page.refs)) {
  if (!present.has(ref) || target.role !== "link") continue;
  const href = (await browser("get", "attr", `@${ref}`, "href")).value;
  if (allowedHrefs.has(href)) click[ref] = { ...target, href };
}
const decision = await choose({
  task, observation: page.snapshot, evidence, remaining
}, { targets: { click }, values: {} }, { callBudget: 3 });
const action = decision.action;
if (!action || action.kind !== "click" || !Object.hasOwn(click, action.ref)) {
  throw new Error(decision.reason ?? "navigation_handoff");
}
const href = (await browser("get", "attr", `@${action.ref}`, "href")).value;
if (href !== click[action.ref].href || !allowedHrefs.has(href)) throw new Error("binding_changed");
await browser("click", `@${action.ref}`);
await browser("wait", "--fn", destinationReady);
```

Account for `decision.metrics` in the enclosing workflow budget/report. Define
`destinationReady` to check both expected URL and substantive matching content;
then independently read back identity/content and update evidence. Capture and
return are separate remaining obligations. If only one uniquely authorized
target can advance the task, bind it directly instead of classifying.

Classification may run in parallel; browser actions stay serial (SKILL.md).
Native deltas reduce CLI text, not necessarily reconstructed classifier tokens.
A confidence critic is not an independent security gate.
