async function run({ skillDir, article = "Web browser", strategy = "hybrid" } = {}) {
  if (!["Web browser", "Accessibility"].includes(article)) throw new Error("unsupported_article");
  const started = Date.now();
  if (!skillDir) {
    const directory = await tools.bash({ command: 'printf "%s" "$HOME/.pi/agent/skills/classifier-browser"', timeout: 10 });
    if (directory.exit_code !== 0 || directory.truncated) throw new Error("cannot_resolve_skill_directory");
    skillDir = directory.output;
  }
  const session = `classifier-wiki-${started}-${Math.random().toString(36).slice(2, 8)}`;
  const outputDir = `/tmp/${session}`;
  const quote = value => "'" + String(value).replace(/'/g, "'\\''") + "'";
  const loaded = await tools.bash({ command: `cat ${quote(`${skillDir}/choose.js`)}`, timeout: 10 });
  if (loaded.exit_code !== 0 || loaded.truncated) throw new Error("cannot_load_chooser");
  const choose = eval(`(${loaded.output})`);
  const directory = await tools.bash({ command: `mkdir ${quote(outputDir)}`, timeout: 10 });
  if (directory.exit_code !== 0) throw new Error("cannot_create_output_directory");
  text({ session, outputDir });
  const evidence = {}, captures = [], history = [];
  const metrics = { calls: 0, classifierMs: 0, usage: [], commands: 0 };
  let observation, reason, cleanupError;
  async function browser(...args) {
    if (Date.now() - started > 90000 && !["eval", "close"].includes(args[0])) throw new Error("workflow_budget");
    if (args[0] === "wait") args.push("--timeout", "5000");
    const result = await tools.bash({
      command: `AGENT_BROWSER_DEFAULT_TIMEOUT=5000 agent-browser --session ${quote(session)} ${args.map(quote).join(" ")} --json`,
      timeout: 10
    });
    metrics.commands++;
    if (result.truncated) throw new Error("truncated_browser_output");
    if (result.exit_code !== 0) throw new Error(result.output);
    const response = JSON.parse(result.output);
    if (!response.success) throw new Error(JSON.stringify(response.error));
    return response.data;
  }
  const mainUrl = "https://en.wikipedia.org/wiki/Main_Page";
  const articleUrl = `https://en.wikipedia.org/wiki/${article.replaceAll(" ", "_")}`;
  const probe = `(() => {
    const heading = document.querySelector("h1");
    const content = document.querySelector("#mw-content-text");
    const lead = [...(content?.querySelectorAll(".mw-parser-output p") ?? [])]
      .find(e => e.getClientRects().length && !e.closest("table") && e.innerText.trim().length > 100);
    const framed = e => {
      const r = e?.getBoundingClientRect();
      return !!r && r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight && r.right <= innerWidth;
    };
    return { url: location.href, heading: heading?.innerText.trim(),
      contentLength: content?.innerText.length ?? 0, lead: lead?.innerText.trim(),
      framed: framed(heading) && framed(lead) };
  })()`;
  const observe = async () => observation = (await browser("eval", probe)).result;
  const articleReady = state => state.url === articleUrl && state.heading === article
    && state.contentLength > 1000 && state.lead?.length > 100;
  const remaining = () => ["searched", "captured", "returned"].filter(key => !evidence[key]);
  try {
    await browser("open", "https://en.wikipedia.org/");
    await browser("set", "viewport", "1440", "1100");
    await browser("wait", "--fn", `location.href === ${JSON.stringify(mainUrl)} && document.querySelector("#mw-content-text")?.innerText.length > 1000`);
    evidence.original = await observe();
    if (observation.heading !== "Main Page") throw new Error("wrong_start_page");
    for (let step = 0; step < 6 && !evidence.searched; step++) {
      const state = await observe();
      if (articleReady(state)) {
        evidence.searched = { url: state.url, heading: state.heading, lead: state.lead };
        break;
      }
      if (state.url !== mainUrl) throw new Error("unexpected_search_route");
      const page = await browser("snapshot", "-i", "-c");
      if (page.snapshot.length > 10000) throw new Error("scope_required");
      const present = new Set([...page.snapshot.matchAll(/ref=(e\d+)/g)].map(match => match[1]));
      const fill = {};
      for (const [ref, target] of Object.entries(page.refs)) {
        if (present.has(ref) && ["textbox", "searchbox", "combobox"].includes(target.role)
          && target.name === "Search Wikipedia") {
          const currentValue = (await browser("get", "value", `@${ref}`)).value;
          fill[ref] = { ...target, context: "Wikipedia site search", currentValue, valueKeys: ["query"] };
        }
      }
      if (Object.keys(fill).length !== 1) throw new Error("search_field_missing_or_ambiguous");
      const pool = { targets: { fill }, values: { query: { value: article, purpose: `Search for the ${article} article` } } };
      const decision = await choose({
        task: `Search Wikipedia for ${article}, capture its introduction, then return to Main Page.`,
        observation: page.snapshot, evidence, remaining: remaining(), history: history.slice(-3),
        assignments: Object.fromEntries(Object.entries(fill).map(([ref, target]) =>
          [ref, { requiredKey: "query", satisfied: target.currentValue === article }]))
      }, pool, { strategy, callBudget: 12 - metrics.calls });
      metrics.calls += decision.metrics.calls;
      metrics.classifierMs += decision.metrics.classifierMs;
      metrics.usage.push(...decision.metrics.usage);
      const action = decision.action;
      if (!action || action.kind !== "fill" || !Object.hasOwn(fill, action.ref) || action.valueKey !== "query") {
        throw new Error(decision.reason ?? "no_valid_search_action");
      }
      if ((await observe()).url !== mainUrl) throw new Error("source_changed");
      await browser("fill", `@${action.ref}`, pool.values[action.valueKey].value);
      const actual = (await browser("get", "value", `@${action.ref}`)).value;
      const focused = (await browser("eval", `document.activeElement?.tagName === "INPUT" && document.activeElement?.value === ${JSON.stringify(article)}`)).result;
      if (actual !== article || !focused) throw new Error("fill_or_focus_effect");
      history.push({ kind: "fill", name: fill[action.ref].name, value: article });
      await browser("press", "Enter");
      await browser("wait", "--fn", `location.href === ${JSON.stringify(articleUrl)} && document.querySelector("h1")?.innerText.trim() === ${JSON.stringify(article)} && document.querySelector("#mw-content-text")?.innerText.length > 1000`);
      if (!articleReady(await observe())) throw new Error("search_effect");
    }
    if (!evidence.searched) throw new Error("step_budget");
    await browser("scroll", "up", "2000");
    const before = await observe();
    if (!articleReady(before) || !before.framed) throw new Error("capture_framing");
    const path = `${outputDir}/article.png`;
    const capture = await browser("screenshot", path);
    const after = await observe();
    if (capture.path !== path || !articleReady(after) || !after.framed || before.lead !== after.lead) {
      throw new Error("capture_state_changed");
    }
    captures.push({ id: "01-article", expected: `${article}: heading and introduction`, path, url: after.url, heading: after.heading });
    evidence.captured = true;
    await browser("back");
    await browser("wait", "--fn", `location.href === ${JSON.stringify(mainUrl)} && document.querySelector("h1")?.innerText.trim() === "Main Page" && document.querySelector("#mw-content-text")?.innerText.length > 1000`);
    const returned = await observe();
    if (returned.url !== evidence.original.url || returned.heading !== evidence.original.heading) throw new Error("return_effect");
    evidence.returned = true;
  } catch (error) {
    reason = String(error);
    try { await observe(); } catch (error) { observation = { previous: observation, diagnosticError: String(error) }; }
  }
  const workflowMs = Date.now() - started;
  if (!reason) {
    try { await browser("close"); } catch (error) { cleanupError = String(error); }
  }
  return {
    outcome: reason ? "handoff" : "verified", visualReview: "pending", reason, session, evidence,
    remaining: remaining(), captures, history, metrics, workflowMs, wallMs: Date.now() - started,
    ...(reason ? { observation } : {}), ...(cleanupError ? { cleanupError } : {})
  };
}
