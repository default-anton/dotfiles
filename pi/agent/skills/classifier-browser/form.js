async function run({ skillDir, resume, pauseAfterPrepared = false } = {}) {
  const started = Date.now();
  const quote = value => "'" + String(value).replace(/'/g, "'\\''") + "'";
  if (!skillDir) {
    const home = await tools.bash({ command: 'printf "%s" "$HOME/.pi/agent/skills/classifier-browser"', timeout: 10 });
    if (home.exit_code !== 0 || home.truncated) throw new Error("skill_directory");
    skillDir = home.output;
  }
  const source = await tools.bash({ command: `cat ${quote(`${skillDir}/choose.js`)}`, timeout: 10 });
  if (source.exit_code !== 0 || source.truncated) throw new Error("chooser_load");
  const choose = eval(`(${source.output})`);
  const session = resume?.session ?? `classifier-form-${started}-${Math.random().toString(36).slice(2, 8)}`;
  const outputDir = resume?.outputDir ?? `/tmp/${session}`;
  const url = `file://${encodeURI(skillDir)}/form.html`;
  const evidence = { ...resume?.evidence };
  const captures = [...(resume?.captures ?? [])];
  const metrics = { calls: 0, usage: [], actions: 0 };
  const history = [];
  let observation, reason, cleanupError;
  text({ session, outputDir });
  async function browser(...args) {
    if (Date.now() - started > 90000 && !["eval", "close"].includes(args[0])) throw new Error("workflow_budget");
    if (["open", "click", "fill", "select", "check", "uncheck", "screenshot"].includes(args[0])) {
      if (++metrics.actions > 25) throw new Error("action_budget");
    }
    if (args[0] === "wait") args.push("--timeout", "5000");
    const result = await tools.bash({
      command: `AGENT_BROWSER_DEFAULT_TIMEOUT=5000 agent-browser --session ${quote(session)} ${args.map(quote).join(" ")} --json`,
      timeout: 10
    });
    if (result.exit_code !== 0 || result.truncated) throw new Error(result.output);
    const response = JSON.parse(result.output);
    if (!response.success) throw new Error(JSON.stringify(response.error));
    return response.data;
  }
  const desired = { name: "Weekly digest", email: "alex@example.test", prompt: "Summarize this week's delivery notes." };
  const purposes = { name: "Draft name", email: "Shipping Email, never Billing Email", prompt: "Draft instructions" };
  const probe = `(() => {
    const form = document.querySelector("#draft");
    const controls = [...document.querySelectorAll("input, textarea, select")];
    return {
      url: location.href, open: !!form && !form.hidden,
      weekly: !document.querySelector("#weekly")?.hidden,
      fields: Object.fromEntries(controls.map(e => [e.id, {
        value: e.value, checked: e.checked ?? false, disabled: e.disabled,
        selected: e.getAttribute("aria-selected"), pressed: e.getAttribute("aria-pressed"),
        visible: !!e.getClientRects().length, focused: e === document.activeElement
      }])),
      framed: [...document.querySelectorAll("main, aside")].every(e => {
        const r = e.getBoundingClientRect();
        return r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight && r.right <= innerWidth;
      })
    };
  })()`;
  async function observe() {
    observation = (await browser("eval", probe)).result;
    if (observation.url !== url || observation.fields.timezone?.value !== "UTC"
      || observation.fields.billing?.value !== "billing@example.test"
      || observation.fields["first-run"]?.value !== "09:00") throw new Error("identity_or_untouched_fields");
    return observation;
  }
  const empty = state => state.open && !state.weekly
    && Object.keys(desired).every(id => state.fields[id].value === "")
    && state.fields.repeat.value === "daily" && state.fields.interval.value === "1"
    && state.fields.mon.checked && !state.fields.tue.checked && !state.fields.fri.checked;
  const prepared = state => state.open && state.weekly
    && Object.entries(desired).every(([id, value]) => state.fields[id].value === value)
    && state.fields.repeat.value === "weekly" && state.fields.interval.value === "2"
    && !state.fields.mon.checked && state.fields.tue.checked && state.fields.fri.checked;
  const remaining = () => ["empty", "prepared", "cancelled", "reopened", "closed"].filter(key => !evidence[key]);
  async function capture(id, expected, predicate) {
    const before = await observe();
    if (!predicate(before) || !before.framed) throw new Error(`capture_prerequisite:${id}`);
    const path = `${outputDir}/${id}-${Date.now()}.png`;
    const result = await browser("screenshot", path);
    const after = await observe();
    if (result.path !== path || !predicate(after) || !after.framed
      || JSON.stringify(before.fields) !== JSON.stringify(after.fields)) throw new Error(`capture_effect:${id}`);
    captures.push({ id, expected, path });
  }
  async function setOpen(open) {
    if ((await observe()).open !== open) {
      await browser("click", open ? "#open" : "#cancel");
      await browser("wait", "--fn", `document.querySelector("#draft").hidden === ${!open}`);
    }
    if ((await observe()).open !== open) throw new Error("form_visibility_effect");
  }
  try {
    if (!resume) {
      const directory = await tools.bash({ command: `mkdir ${quote(outputDir)}`, timeout: 10 });
      if (directory.exit_code !== 0) throw new Error("output_directory");
      await browser("open", url);
      await browser("set", "viewport", "1200", "1100");
      await browser("wait", "#open");
    }
    await observe();
    if (!evidence.empty) {
      await setOpen(true);
      await capture("01-empty", "Empty draft; daily; defaults preserved", empty);
      evidence.empty = true;
    }
    if (!evidence.prepared) {
      const before = await observe();
      if (!before.open) throw new Error("draft_missing");
      const page = await browser("snapshot", "-i", "-c", "-s", "#draft");
      const present = new Set([...page.snapshot.matchAll(/ref=(e\d+)/g)].map(match => match[1]));
      const fields = [];
      for (const [id, name] of Object.entries({ name: "Name", email: "Email", prompt: "Prompt" })) {
        const matches = Object.entries(page.refs).filter(([ref, target]) =>
          present.has(ref) && target.role === "textbox" && target.name === name);
        if (matches.length !== 1 || before.fields[id].disabled || !before.fields[id].visible) throw new Error("field_binding");
        fields.push({ id, ref: matches[0][0], name, context: id === "email" ? "Shipping" : "Draft",
          requiredKey: id, satisfied: before.fields[id].value === desired[id] });
      }
      const questions = Object.fromEntries(fields.map(field => [field.id, {
        type: "choice",
        instructions: `The host verified THIS field binding and authorized its requiredKey: ${JSON.stringify(field)}. Choose requiredKey when unsatisfied, or keep when satisfied. Literal values remain host-side; you only choose keys. none only if the binding is inconsistent or ambiguous.`,
        criteria: { ...purposes, keep: "Already matches requested value", none: "No safe binding" }
      }]));
      const result = await models.classify({ provider: "typesafe", id: "jev-latest" }, {
        state: { task: "Fill Name, Shipping Email and Prompt with their authorized host-bound requiredKey values. Prepare only an unsaved draft; preserve Billing, timezone and First run.", fields, evidence, remaining: remaining() },
        questions
      });
      metrics.calls++;
      metrics.usage.push(result.usage ?? null);
      if (result.stopReason !== "stop") throw new Error(result.errorMessage ?? result.stopReason);
      history.push({ kind: "fillProposal", choices: Object.fromEntries(fields.map(field =>
        [field.id, result.answers[field.id]?.choice ?? null])) });
      const batch = fields.map(field => {
        const answer = result.answers[field.id];
        if (answer?.type !== "choice" || !(answer.choice === field.requiredKey || answer.choice === "keep" && field.satisfied)) {
          throw new Error(`batch_binding:${field.id}`);
        }
        return { ...field, valueKey: answer.choice };
      });
      for (const field of batch) {
        if (field.valueKey !== "keep") await browser("fill", `@${field.ref}`, desired[field.valueKey]);
      }
      const filled = await observe();
      if (!Object.entries(desired).every(([id, value]) => filled.fields[id].value === value)) throw new Error("batch_effect");
      history.push({ kind: "fillBatch", fields: batch.map(field => field.id) });
      if (filled.fields.repeat.value !== "weekly") await browser("select", "#repeat", "weekly");
      await browser("wait", "--fn", '!document.querySelector("#weekly").hidden');
      if ((await observe()).fields.repeat.value !== "weekly") throw new Error("select_effect");
      if ((await observe()).fields.interval.value !== "2") await browser("fill", "#interval", "2");
      const seen = new Set();
      for (let step = 0; step < 4; step++) {
        const state = await observe();
        if (prepared(state)) break;
        const page = await browser("snapshot", "-i", "-c", "-s", "#weekly");
        const present = new Set([...page.snapshot.matchAll(/ref=(e\d+)/g)].map(match => match[1]));
        const targets = { check: {}, uncheck: {} };
        for (const [ref, target] of Object.entries(page.refs)) {
          const id = target.name?.toLowerCase();
          if (!present.has(ref) || target.role !== "checkbox" || !["mon", "tue", "fri"].includes(id)) continue;
          const wanted = id !== "mon";
          if (state.fields[id].checked !== wanted && !state.fields[id].disabled) {
            targets[wanted ? "check" : "uncheck"][ref] = { ...target, id, context: "Weekly recurrence", checked: state.fields[id].checked };
          }
        }
        const decision = await choose({
          task: "Select only Tue and Fri, not Mon.", evidence, remaining: remaining(),
          observation: page.snapshot, history: history.slice(-3)
        }, { targets, values: {} }, { callBudget: 12 - metrics.calls });
        metrics.calls += decision.metrics.calls;
        metrics.usage.push(...decision.metrics.usage);
        const action = decision.action;
        const target = targets[action?.kind]?.[action?.ref];
        if (!target) throw new Error(decision.reason ?? "toggle_handoff");
        const signature = JSON.stringify([action.kind, target.id, state.fields, remaining()]);
        if (seen.has(signature)) throw new Error("no_progress");
        seen.add(signature);
        await browser(action.kind, `@${action.ref}`);
        const after = await observe();
        if (after.fields[target.id].checked !== (action.kind === "check")) throw new Error("toggle_effect");
        history.push({ kind: action.kind, id: target.id });
      }
      await capture("02-prepared", "Weekly / 2 weeks / Tue + Fri only", prepared);
      evidence.prepared = true;
    }
    if (pauseAfterPrepared) throw new Error("checkpoint_pause");
    if (!evidence.cancelled) {
      const state = await observe();
      if (state.open && !prepared(state)) throw new Error("prepared_state_changed");
      await setOpen(false);
      await capture("03-cancelled", "Draft closed; unrelated fields unchanged", state => !state.open);
      evidence.cancelled = true;
    }
    if (!evidence.reopened) {
      await setOpen(true);
      await capture("04-reset", "Reopened empty; original defaults restored", empty);
      evidence.reopened = true;
    }
    await setOpen(false);
    evidence.closed = true;
  } catch (error) {
    reason = error instanceof Error ? error.message : String(error);
    try { await observe(); } catch (error) { observation = { diagnosticError: String(error) }; }
  }
  const workflowMs = Date.now() - started;
  if (!reason) {
    try { await browser("close"); } catch (error) { cleanupError = String(error); }
  }
  return {
    outcome: reason ? "handoff" : "verified", visualReview: "pending", reason,
    session, outputDir, url, evidence, remaining: remaining(), captures, history, metrics,
    workflowMs, wallMs: Date.now() - started,
    ...(reason ? { observation } : {}), ...(cleanupError ? { cleanupError } : {})
  };
}
