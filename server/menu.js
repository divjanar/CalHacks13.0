const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const venues = require("../src/data/sampleVenues.json");
const { fetchMenuText } = require("./menuFetcher");
const { readMenu, assessMenu } = require("./menuReader");
const TTL = 24 * 60 * 60 * 1000;
const hash = value => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
function splitMenu(text, size = 5500) {
  const parts = [];
  for (let start = 0; start < text.length;) {
    let end = Math.min(start + size, text.length);
    const boundary = text.lastIndexOf("\n", end);
    if (end < text.length && boundary > start + size / 2) end = boundary;
    parts.push(text.slice(start, end));
    if (end === text.length) break;
    start = Math.max(start + 1, end - 500);
  }
  return parts;
}
function publicError(error) {
  const code = Number(error.status || error.code);
  if (code === 429) return "Gemini reached its usage limit. Wait a little, then retry.";
  if ([500, 502, 503, 504].includes(code)) return "Gemini is temporarily unavailable after three attempts. Please retry later.";
  if (["AbortError", "TimeoutError"].includes(error.name) || code === 20) return "The menu provider timed out after limited retries. Please retry.";
  if ([400, 401, 403, 404].includes(code)) return "Gemini rejected the request. Check the backend API key, configured model and model access.";
  const message = String(error.message || "");
  const secret = process.env.GEMINI_API_KEY;
  if (/Gemini|menu|Configure|dietary|supported|restaurant/i.test(message)) return secret ? message.split(secret).join("[REDACTED]") : message;
  return "Menu processing failed. Please retry.";
}
function registerMenu(app, dependencies = {}) {
  const fetchSource = dependencies.fetchMenuText || fetchMenuText;
  const extract = dependencies.readMenu || readMenu;
  const assess = dependencies.assessMenu || assessMenu;
  const cacheDir = dependencies.cacheDir === undefined ? path.join(__dirname, ".menu-cache-v2") : dependencies.cacheDir;
  const jobs = new Map(), byKey = new Map(), sources = new Map(), sourcePending = new Map(), parts = new Map(), reviews = new Map();
  const model = () => process.env.GEMINI_MENU_MODEL || process.env.GEMINI_MODEL;
  const extractionKey = (venue, mode) => hash([3, venue.id, venue.menuUrl, model(), mode]);
  const validResult = result => result && Array.isArray(result.dishes) && result.dishes.length && result.dishes.every(dish => typeof dish.id === "string" && typeof dish.evidence === "string" && Array.isArray(dish.listedIngredients) && Array.isArray(dish.possibleAllergens));
  async function diskRead(venue, mode) {
    if (!cacheDir) return null;
    try {
      const saved = JSON.parse(await fs.readFile(path.join(cacheDir, `${extractionKey(venue, mode)}.json`), "utf8"));
      return Date.now() - saved.at < TTL && saved.result?.venueId === venue.id && saved.result?.mode === mode && validResult(saved.result) ? saved.result : null;
    } catch { return null; }
  }
  async function sourceFor(venue, refresh = false) {
    const key = hash([venue.id, venue.menuUrl]);
    const saved = sources.get(key);
    if (!refresh && saved && Date.now() - saved.at < TTL) return saved.value;
    if (!sourcePending.has(key)) sourcePending.set(key, fetchSource(venue.id).then(value => {
      sources.set(key, { at: Date.now(), value }); return value;
    }).finally(() => sourcePending.delete(key)));
    return sourcePending.get(key);
  }
  const serialize = job => ({ jobId: job.id, status: job.status, progress: job.progress, result: job.result, error: job.error });
  function start(key, task) {
    const existing = byKey.get(key);
    if (existing && Date.now() - existing.at < TTL && existing.status !== "error") return existing;
    for (const [id, job] of jobs) if (job.status !== "running" && Date.now() - job.at >= TTL) { jobs.delete(id); if (byKey.get(job.key) === job) byKey.delete(job.key); }
    if (jobs.size >= 500) throw new Error("Too many menu jobs are active. Please retry later.");
    const job = { id: crypto.randomUUID(), key, at: Date.now(), status: "running", progress: { completed: 0, total: 0 }, result: null, error: null };
    jobs.set(job.id, job); byKey.set(key, job);
    void Promise.resolve().then(() => task(job)).then(() => { job.status = "ready"; }).catch(error => {
      job.status = "error"; job.error = publicError(error);
      // Do not print provider errors that may contain secrets or account data.
      console.error("[menu] job failed:", error.status || error.code || error.name || "unknown");
    }).finally(() => { job.at = Date.now(); });
    return job;
  }
  app.post("/api/menu/jobs", (req, res) => {
    const venue = venues.find(item => item.id === req.body?.venueId);
    const mode = req.body?.mode || "preview";
    if (!venue || !["preview", "full"].includes(mode) || req.body?.url !== undefined || req.body?.menuUrl !== undefined) return res.status(400).json({ error: "Provide a configured restaurant ID and preview or full mode. URLs cannot be supplied by the client." });
    if (!venue.menuUrl) return res.status(400).json({ error: "An official menu URL has not been configured for this restaurant yet." });
    const key = extractionKey(venue, mode);
    if (req.body.refresh === true && byKey.get(key)?.status !== "running") byKey.delete(key);
    try {
      const job = start(key, async job => {
        const cached = req.body.refresh !== true && (await diskRead(venue, mode) || (mode === "preview" && await diskRead(venue, "full")));
        if (cached) { job.result = { ...cached, mode, dishes: mode === "preview" ? cached.dishes.slice(0, 8) : cached.dishes }; return; }
        const source = await sourceFor(venue, req.body.refresh === true);
        const excerpts = splitMenu(source.text);
        const selected = mode === "preview" ? excerpts.slice(0, 1) : excerpts;
        const { deduplicateDishes } = await import("../src/data/menuDishes.js");
        let dishes = [];
        const failedParts = [];
        let partial = Boolean(source.truncated);
        job.progress.total = selected.length;
        const deadline = Date.now() + 10 * 60 * 1000;
        for (let index = 0; index < selected.length; index++) {
          if (Date.now() >= deadline) {
            partial = true;
            for (let skipped = index; skipped < selected.length; skipped++) failedParts.push({ part: skipped + 1, error: "Menu time limit reached. Retry to continue extracting unread sections." });
            break;
          }
          const text = selected[index];
          const partKey = hash([model(), text, mode === "preview"]);
          try {
            let output = parts.get(partKey);
            if (!output || req.body.refresh === true) {
              output = await extract({ ...source, text }, { preview: mode === "preview" });
              if (output.status === "readable") parts.set(partKey, output);
            }
            if (output.status !== "readable") partial = true;
            dishes = deduplicateDishes([...dishes, ...output.dishes]);
          } catch (error) {
            failedParts.push({ part: index + 1, error: publicError(error) }); partial = true;
          }
          job.progress.completed = index + 1;
          job.result = { venueId: venue.id, mode, sourceUrl: source.sourceUrl, fetchedAt: source.fetchedAt,
            validationNeedsReview: partial, failedParts: [...failedParts], status: partial ? "partial" : "readable",
            dishes: mode === "preview" ? dishes.slice(0, 8) : dishes,
            intentionalPreview: mode === "preview", coverageVerified: false,
          };
        }
        if (job.result) { job.result.failedParts = failedParts; job.result.validationNeedsReview = partial; job.result.status = partial ? "partial" : "readable"; }
        if (!job.result?.dishes.length) throw new Error(failedParts[0]?.error || "No readable dishes were found in this menu excerpt.");
        if (cacheDir && !partial) {
          try {
            await fs.mkdir(cacheDir, { recursive: true });
            const file = path.join(cacheDir, `${key}.json`), temporary = `${file}.${job.id}.tmp`;
            await fs.writeFile(temporary, JSON.stringify({ at: Date.now(), result: job.result })); await fs.rename(temporary, file);
          } catch { console.warn("[menu] extraction cache could not be saved."); }
        }
      });
      return res.status(202).json(serialize(job));
    } catch (error) { return res.status(503).json({ error: publicError(error) }); }
  });
  app.post("/api/menu/reviews", async (req, res) => {
    const menuJob = jobs.get(req.body?.menuJobId);
    const p = req.body?.preferences;
    if (!menuJob?.result?.dishes?.length) return res.status(404).json({ error: "The extracted menu job is not available. Retry menu reading to reconnect to the backend." });
    if (!p || typeof p.diet !== "string" || p.diet.length > 100 ||
      !Array.isArray(p.allergies) || p.allergies.length > 30 || !p.allergies.every(value => typeof value === "string" && value.length <= 100) ||
      ["notes", "religiousDetails"].some(key => p[key] !== undefined && (typeof p[key] !== "string" || p[key].length > 4000))) return res.status(400).json({ error: "Provide a menu job and valid saved dining needs." });
    const preferences = { diet: p.diet, allergies: [...new Set(p.allergies)].sort(), allergiesAnswered: p.allergiesAnswered === true, notes: p.notes || "", religiousDetails: p.religiousDetails || "" };
    const { dietaryPresets } = await import("../src/data/dietaryGuidance.js");
    const preset = dietaryPresets[preferences.diet] || null;
    // Snapshot extraction results. A later progressive update gets its own review job.
    const dishes = structuredClone(menuJob.result.dishes);
    const key = hash(["review", model(), dishes, preferences, preset]);
    try {
      const job = start(key, async job => {
        job.result = { assessments: [] }; job.progress.total = dishes.length;
        for (let offset = 0; offset < dishes.length; offset += 4) {
          const batch = dishes.slice(offset, offset + 4);
          const batchKey = hash([model(), batch, preferences, preset]);
          const saved = reviews.get(batchKey);
          let task = saved && Date.now() - saved.at < TTL ? saved.task : null;
          if (!task) {
            task = assess(batch, preferences, preset);
            reviews.set(batchKey, { at: Date.now(), task });
            task.catch(() => reviews.delete(batchKey));
          }
          const assessments = await task;
          job.result.assessments.push(...assessments);
          job.progress.completed += batch.length;
        }
      });
      return res.status(202).json(serialize(job));
    } catch (error) { return res.status(503).json({ error: publicError(error) }); }
  });
  app.get("/api/menu/jobs/:jobId", (req, res) => {
    const job = jobs.get(req.params.jobId);
    return job ? res.json(serialize(job)) : res.status(404).json({ error: "Menu job expired or the backend restarted. Please retry." });
  });
}
module.exports = { registerMenu, splitMenu, publicError };
