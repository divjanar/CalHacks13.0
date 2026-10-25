const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");

const venues = require("../src/data/sampleVenues.json");
const { readMenuUrl } = require("./urlMenuReader");
const { menuSettings } = require("./menuSettings");

const TTL = 24 * 60 * 60 * 1000;
const MAX_JOBS = 500;

const hash = value =>
  crypto
    .createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex");

// Retained for compatibility with existing imports.
function splitMenu(text, size = 5500) {
  const parts = [];

  for (let start = 0; start < text.length;) {
    let end = Math.min(start + size, text.length);
    const boundary = text.lastIndexOf("\n", end);

    if (
      end < text.length &&
      boundary > start + size / 2
    ) {
      end = boundary;
    }

    parts.push(text.slice(start, end));

    if (end === text.length) break;

    start = Math.max(start + 1, end - 500);
  }

  return parts;
}

function publicError(error) {
  const code = Number(error?.status || error?.code);

  if (code === 429) {
    return "The official menu website is rate-limiting requests. Please retry later.";
  }

  if ([500, 502, 503, 504].includes(code)) {
    return "The official menu website is temporarily unavailable. Please retry later.";
  }

  if (
    ["AbortError", "TimeoutError"].includes(error?.name) ||
    code === 20
  ) {
    return "The menu request timed out. Please retry.";
  }

  if ([400, 401, 403, 404].includes(code)) {
    return "The official menu website rejected the request. Check its configured URL.";
  }

  const message = String(error?.message || "");
  const secret = process.env.GEMINI_API_KEY;

  if (
    /Gemini|menu|configure|dietary|restaurant|URL/i.test(message)
  ) {
    return secret
      ? message.split(secret).join("[REDACTED]")
      : message;
  }

  return "Menu processing failed. Please retry.";
}

function registerMenu(app, dependencies = {}) {
  const readUrl =
    dependencies.readMenuUrl || readMenuUrl;

  const cacheDir =
    dependencies.cacheDir === undefined
      ? path.join(__dirname, ".menu-cache-v2")
      : dependencies.cacheDir;

  const jobs = new Map();
  const byKey = new Map();

  const extractionKey = (venue, mode) =>
    hash([
      "switchable-menu-v2",
      menuSettings().identity,
      venue.id,
      venue.menuUrl,
      mode,
    ]);

  function validResult(result) {
    return Boolean(
      result &&
      Array.isArray(result.dishes) &&
      result.dishes.length > 0 &&
      result.dishes.every(
        dish =>
          dish &&
          typeof dish.id === "string" &&
          typeof dish.name === "string" &&
          typeof dish.description === "string" &&
          typeof dish.evidence === "string" &&
          Array.isArray(dish.listedIngredients) &&
          dish.listedIngredients.every(
            item => typeof item === "string"
          ) &&
          Array.isArray(dish.possibleAllergens)
      )
    );
  }

  async function diskRead(venue, mode) {
    if (!cacheDir) return null;

    try {
      const file = path.join(
        cacheDir,
        `${extractionKey(venue, mode)}.json`
      );

      const saved = JSON.parse(
        await fs.readFile(file, "utf8")
      );

      if (
        typeof saved.at !== "number" ||
        Date.now() - saved.at >= TTL ||
        saved.result?.venueId !== venue.id ||
        saved.result?.mode !== mode ||
        !["official_menu_text", "pdf", "saved_official_listing"].includes(saved.result?.sourceType) ||
        !validResult(saved.result)
      ) {
        return null;
      }

      return saved.result;
    } catch {
      return null;
    }
  }

  async function diskWrite(venue, mode, job) {
    if (!cacheDir) return;

    try {
      await fs.mkdir(cacheDir, { recursive: true });

      const file = path.join(
        cacheDir,
        `${extractionKey(venue, mode)}.json`
      );

      const temporary = `${file}.${job.id}.tmp`;

      await fs.writeFile(
        temporary,
        JSON.stringify({
          at: Date.now(),
          result: job.result,
        })
      );

      await fs.rename(temporary, file);
    } catch {
      console.warn("[menu] Menu cache could not be saved.");
    }
  }

  function serialize(job) {
    return {
      jobId: job.id,
      status: job.status,
      progress: job.progress,
      result: job.result,
      error: job.error,
    };
  }

  function cleanup() {
    const now = Date.now();

    for (const [id, job] of jobs) {
      if (
        job.status !== "running" &&
        now - job.at >= TTL
      ) {
        jobs.delete(id);

        if (byKey.get(job.key) === job) {
          byKey.delete(job.key);
        }
      }
    }

  }

  function start(key, task) {
    cleanup();

    const existing = byKey.get(key);

    if (
      existing &&
      existing.status !== "error" &&
      (
        existing.status === "running" ||
        Date.now() - existing.at < TTL
      )
    ) {
      return existing;
    }

    if (jobs.size >= MAX_JOBS) {
      throw new Error(
        "Too many menu jobs are active. Please retry later."
      );
    }

    const job = {
      id: crypto.randomUUID(),
      key,
      at: Date.now(),
      status: "running",
      progress: {
        completed: 0,
        total: 0,
      },
      result: null,
      error: null,
    };

    jobs.set(job.id, job);
    byKey.set(key, job);

    void Promise.resolve()
      .then(() => task(job))
      .then(() => {
        job.status = "ready";
      })
      .catch(error => {
        job.status = "error";
        job.error = publicError(error);

        // Never log provider response bodies or dining profiles.
        console.error(
          "[menu] Job failed. Code:",
          error.status ||
          error.code ||
          error.name ||
          "unknown"
        );
      })
      .finally(() => {
        job.at = Date.now();
      });

    return job;
  }

  // Start or reuse menu extraction.
  app.post("/api/menu/jobs", (req, res) => {
    const venue = venues.find(
      item => item.id === req.body?.venueId
    );

    const mode = req.body?.mode || "preview";
    const refresh = req.body?.refresh === true;

    if (
      !venue ||
      !["preview", "full"].includes(mode) ||
      req.body?.url !== undefined ||
      req.body?.menuUrl !== undefined
    ) {
      return res.status(400).json({
        error:
          "Provide a configured restaurant ID and preview or full mode. URLs cannot be supplied by the client.",
      });
    }

    if (!venue.menuUrl) {
      return res.status(400).json({
        error:
          "An official menu URL has not been configured for this restaurant yet.",
      });
    }

    let key;
    try { key = extractionKey(venue, mode); }
    catch (error) { return res.status(400).json({ error: publicError(error) }); }

    if (
      refresh &&
      byKey.get(key)?.status !== "running"
    ) {
      byKey.delete(key);
    }

    try {
      const job = start(key, async job => {
        if (!refresh) {
          const cached = await diskRead(venue, mode);

          if (cached) {
            job.result = cached;
            job.progress = {
              completed: cached.dishes.length,
              total: cached.dishes.length,
            };
            return;
          }

          // Reuse a full extraction for an eight-item preview.
          if (mode === "preview") {
            const full = await diskRead(venue, "full");

            if (full) {
              job.result = {
                ...full,
                mode: "preview",
                intentionalPreview: true,
                coverageVerified: false,
                dishes: full.dishes.slice(0, 8),
              };

              job.progress = {
                completed: job.result.dishes.length,
                total: job.result.dishes.length,
              };

              return;
            }
          }
        }

        console.log(
          `[menu] Reading configured menu (${menuSettings().reader}): ${mode}`
        );

        const result = await readUrl(venue, {
          preview: mode === "preview",
        });

        if (!validResult(result)) {
          throw new Error(
            "The official menu returned no usable dishes."
          );
        }

        job.result = {
          ...result,
          venueId: venue.id,
          mode,
          intentionalPreview: mode === "preview",
          coverageVerified: false,
          dishes:
            mode === "preview"
              ? result.dishes.slice(0, 8)
              : result.dishes,
        };

        job.progress = {
          completed: job.result.dishes.length,
          total: job.result.dishes.length,
        };

        await diskWrite(venue, mode, job);
      });

      return res.status(202).json(serialize(job));
    } catch (error) {
      return res.status(503).json({
        error: publicError(error),
      });
    }
  });

  app.post("/api/menu/reviews", (req, res) => res.status(410).json({ error: "Menu checks now run locally against saved dietary needs. Gemini reviews are disabled." }));
  app.get("/api/menu/jobs/:jobId", (req, res) => {
    cleanup();

    const job = jobs.get(req.params.jobId);

    if (!job) {
      return res.status(404).json({
        error:
          "Menu job expired or the backend restarted. Please retry.",
      });
    }

    return res.json(serialize(job));
  });
}

module.exports = {
  registerMenu,
  splitMenu,
  publicError,
};
