# Interaction checks

Use these only when relevant. They are lessons from bounded experiments, not
proof that every site or browser version behaves the same.

| Interaction | Required checks / common trap |
| --- | --- |
| Search/navigation | Search may be a textbox, searchbox or combobox. After Enter, wait for article **or** results, then check whether the destination already arrived. Do not look for another link on the article. Check URL predicates against URLs alone, not URL+label strings. URL can change before old content disappears: require destination identity **and** content readiness. |
| Forms | Keep group context for duplicate names (Shipping versus Billing). Read actual values and selected/checked states. Nonempty is not necessarily correct. Check untouched controls and cancellation/reset separately. |
| Independent fills | A few stable, nonsubmitting fields can be classified together, filled serially and individually verified. Do not batch autosaving, remounting or conditional controls. |
| Keyboard/contenteditable | Verify focus and actual selection/Range before destructive edits, then text/HTML afterward. `fill` has inserted instead of replaced; select-all has failed despite command success. Stop rather than blindly trying shortcuts. |
| Uploads | Use host-owned canonical paths. Verify accepted names, MIME, nonzero sizes/content and app attachment identity. CLI success has accompanied unreadable zero-byte files. Draft selection does not prove server upload or native-picker cancellation. |
| Drag/drop | Authorize the exact source/destination pair. Verify ordered membership and unchanged unrelated items. Native drag, synthetic DataTransfer and direct DOM mutation are different coverage. |
| Iframes | Verify actual child URL/origin and scoped values. Some CLI versions scope snapshots/values but leave eval/get-url at the top document. Top-level identity is not child proof; stop on unsupported scope. |
| Popups/tabs | Identify the exact new owned target from before/after tabs, URL and opener/content. Switch explicitly and rebuild refs. Close only that child, then verify the parent is unchanged. |
| Authentication | Use approved account scope and safe vault transport. Do not put secrets in classifier state, shell arguments or reports. Opaque keys do not protect DOM, screenshots, traces or saved browser state. |
| Unknown submission | Do not retry because a receipt is absent. Read a trustworthy correlated effect record; if missing/ambiguous, hand off. |

## Navigation-only adaptation

Reuse the example's checked `browser` wrapper, chooser loader, budgets and
handoff reporting. Replace its search-specific block with this pattern.
Inspect actual DOM before writing probes: an accessibility `region` may be a
semantic `<section>`, not an element with a literal `role="region"` attribute.

Here `scope`, `task`, `allowedHrefs`, `destinationReady`, `evidence` and
`remaining` are **host-defined for your task**, not classifier output.
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

## Why this shape

The original research tried five classification layouts, batching, caches,
deltas, critics and varied sites. The useful defaults were simpler:

- Durable evidence prevented loops of re-filling and reopening.
- Grouped observations prevented wrong duplicate-label choices.
- Actual-value checks caught errors hidden by successful CLI output.
- Direct bindings and host-controlled captures removed unnecessary decisions.
- Site-specific readiness avoided false “no progress” immediately after clicks.
- Parent takeover was part of the design, not failure of the approach.

Do not recreate the experiments before doing useful work. Native deltas reduced
CLI text, not reconstructed classifier tokens; cache and adaptive complexity
had no established general advantage. A confidence critic is not an independent
security gate. Parallel classification is fine; parallel browser mutations are not.

Source history: `~/code/sebastian`, `docs/classifier-browser.md`,
commits `134cb21`, `0a29efa`, `537f6ee`, `7e44f12`, `deae580`, plus the historical
experiment registry and varied-site records. This skill is self-contained and
does not need that checkout or its temporary artifacts.

Manual QA on 2026-10-03 used `gpt-6.1-sol:low` agents and real Jev calls.
Wikipedia hybrid/speculative, MDN keyboard-section capture and GitHub release
navigation completed, with takeover where needed. The added local form passed
four checkpoints; pause → parent Cancel → same-session resume retained captures
and completed without repeating preparation. An initially unclear batch prompt
was rejected before fills, corrected and rerun successfully.

Sheet-only review covered the form and Wikipedia captures, including refinement
sheets. Canvas dimensions/aspect ratio were checked; oversized canvases and
out-of-bounds crops were rejected. These are bounded manual checks, not general
reliability, real-app form coverage or a speed benchmark.
