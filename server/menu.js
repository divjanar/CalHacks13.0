const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");

const venues = require("../src/data/sampleVenues.json");
const { readMenuUrl } = require("./urlMenuReader");
const { assessMenu } = require("./menuReader");

const TTL = 24 * 60 * 60 * 1000;
const MAX_JOBS = 500;
const MAX_REVIEWS = 4000;

const hash = value =>
  crypto
    .createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex");

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
  const message = String(error?.message || "");

  if (/API_KEY_INVALID|API key not valid/i.test(message)) {
    return (
      "Gemini rejected the backend API key. " +
      "Update GEMINI_API_KEY on Render and redeploy."
    );
  }

  if (code === 429) {
    return "Gemini reached its usage limit. Please retry later.";
  }

  if ([500, 502, 503, 504].includes(code)) {
    return "Gemini is temporarily unavailable. Please retry later.";
  }

  if (
    ["AbortError", "TimeoutError"].includes(error?.name) ||
    code === 20
  ) {
    return "The menu request timed out. Please retry.";
  }

  if ([400, 401, 403, 404].includes(code)) {
    return (
      "Gemini rejected the request. " +
      "Check the configured model and API key."
    );
  }

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

  const assess =
    dependencies.assessMenu || assessMenu;

  const cacheDir =
    dependencies.cacheDir === undefined
      ? path.join(__dirname, ".menu-cache-v2")
      : dependencies.cacheDir;

  const jobs = new Map();
  const byKey = new Map();
  const reviews = new Map();

  const model = () =>
    process.env.GEMINI_MENU_MODEL ||
    process.env.GEMINI_MODEL;

  const extractionKey = (venue, mode) =>
    hash([
      "menu-batches-v3",
      venue.id,
      venue.menuUrl,
      model(),
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
        saved.result?.sourceType !== "official_menu_text" ||
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
      console.warn(
        "[menu] Menu cache could not be saved."
      );
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

    for (const [key, entry] of reviews) {
      if (now - entry.at >= TTL) {
        reviews.delete(key);
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

    const key = extractionKey(venue, mode);

    // A refresh never duplicates an extraction already running.
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
              unit: "dishes",
            };
            return;
          }

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
                unit: "dishes",
              };

              return;
            }
          }
        }

        console.log(
          `[menu] Reading ${venue.displayName.text}: ${mode}`
        );

        const result = await readUrl(venue, {
          preview: mode === "preview",
          onProgress: progress => {
            job.progress = progress;
          },
        });

        if (!validResult(result)) {
          throw new Error(
            "Gemini returned no usable menu dishes."
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
          unit: "dishes",
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

  app.post("/api/menu/reviews", async (req, res) => {
    try {
      cleanup();

      const menuJob = jobs.get(req.body?.menuJobId);
      const supplied = req.body?.preferences;

      if (!menuJob?.result?.dishes?.length) {
        return res.status(404).json({
          error:
            "The extracted menu job is unavailable. Retry menu reading to reconnect.",
        });
      }

      if (
        !supplied ||
        typeof supplied.diet !== "string" ||
        supplied.diet.length > 100 ||
        !Array.isArray(supplied.allergies) ||
        supplied.allergies.length > 30 ||
        !supplied.allergies.every(
          value =>
            typeof value === "string" &&
            value.length <= 100
        ) ||
        ["notes", "religiousDetails"].some(
          key =>
            supplied[key] !== undefined &&
            (
              typeof supplied[key] !== "string" ||
              supplied[key].length > 4000
            )
        )
      ) {
        return res.status(400).json({
          error:
            "Provide a menu job and valid dining preferences.",
        });
      }

      const preferences = {
        diet: supplied.diet,
        allergies: [...new Set(supplied.allergies)].sort(),
        allergiesAnswered:
          supplied.allergiesAnswered === true,
        notes: supplied.notes || "",
        religiousDetails: supplied.religiousDetails || "",
      };

      const { dietaryPresets } = await import(
        "../src/data/dietaryGuidance.js"
      );

      const preset =
        dietaryPresets[preferences.diet] || null;

      const eligible = menuJob.result.dishes;
      const ids = req.body.dishIds;

      const eligibleIds = new Set(
        eligible.map(item => item.id)
      );

      if (
        ids !== undefined &&
        (
          !Array.isArray(ids) ||
          ids.length === 0 ||
          ids.length > 2000 ||
          new Set(ids).size !== ids.length ||
          !ids.every(
            id =>
              typeof id === "string" &&
              eligibleIds.has(id)
          )
        )
      ) {
        return res.status(400).json({
          error:
            "Request only valid dish IDs from this menu job.",
        });
      }

      const requestedIds = ids ? new Set(ids) : null;

      const dishes = structuredClone(
        requestedIds
          ? eligible.filter(item => requestedIds.has(item.id))
          : eligible
      );

      const key = hash([
        "menu-review-v2",
        model(),
        dishes,
        preferences,
        preset,
      ]);

      const job = start(key, async job => {
        job.result = {
          assessments: [],
          failedItems: [],
        };

        job.progress.total = dishes.length;
        job.progress.unit = "dishes";

        const itemKey = item =>
          hash([
            model(),
            menuJob.result.venueId,
            menuJob.result.sourceUrl,
            item,
            preferences,
            preset,
          ]);

        let nextOffset = 0;
        let reviewFailure = null;

        async function reviewBatch(offset) {
          const batch = dishes.slice(offset, offset + 4);

          const missing = batch.filter(item => {
            const entry = reviews.get(itemKey(item));

            return (
              !entry ||
              Date.now() - entry.at >= TTL
            );
          });

          if (missing.length) {
            const shared = Promise.resolve().then(() =>
              assess(missing, preferences, preset)
            );

            for (const item of missing) {
              const reviewKey = itemKey(item);

              const task = shared.then(
                assessments => {
                  const assessment = assessments.find(
                    result => result.dishId === item.id
                  );

                  if (!assessment) {
                    throw new Error(
                      "Gemini omitted a requested dietary assessment."
                    );
                  }

                  return assessment;
                },
                error => {
                  const assessment =
                    error.assessments?.find(
                      result => result.dishId === item.id
                    );

                  if (assessment) return assessment;

                  throw error;
                }
              );

              const entry = {
                at: Date.now(),
                task,
              };

              reviews.set(reviewKey, entry);

              void task.catch(() => {
                if (reviews.get(reviewKey) === entry) {
                  reviews.delete(reviewKey);
                }
              });
            }
          }

          const tasks = batch.map(
            item => reviews.get(itemKey(item)).task
          );

          const settled = await Promise.allSettled(tasks);
          let providerFailure = null;

          settled.forEach((result, index) => {
            if (result.status === "fulfilled") {
              job.result.assessments.push(result.value);
              return;
            }

            job.result.failedItems.push({
              dishId: batch[index].id,
              error: publicError(result.reason),
            });

            const code = Number(
              result.reason?.status ||
              result.reason?.code
            );

            if (
              [400, 401, 403, 404, 429, 503].includes(code) ||
              /API_KEY_INVALID|API key not valid/i.test(
                String(result.reason?.message || "")
              )
            ) {
              providerFailure = result.reason;
            }
          });

          job.progress.completed += batch.length;

          while (reviews.size > MAX_REVIEWS) {
            reviews.delete(reviews.keys().next().value);
          }

          if (providerFailure) {
            throw providerFailure;
          }
        }

        async function reviewWorker() {
          while (
            !reviewFailure &&
            nextOffset < dishes.length
          ) {
            const offset = nextOffset;
            nextOffset += 4;

            try {
              await reviewBatch(offset);
            } catch (error) {
              reviewFailure ||= error;
            }
          }
        }

        // Wait for both workers before completing the job.
        await Promise.all([
          reviewWorker(),
          reviewWorker(),
        ]);

        if (reviewFailure) {
          const processedIds = new Set([
            ...job.result.assessments.map(item => item.dishId),
            ...job.result.failedItems.map(item => item.dishId),
          ]);

          for (const item of dishes) {
            if (!processedIds.has(item.id)) {
              job.result.failedItems.push({
                dishId: item.id,
                error: publicError(reviewFailure),
              });
            }
          }

          throw reviewFailure;
        }

        if (job.result.failedItems.length) {
          throw new Error(
            `${job.result.failedItems.length} dishes still need Gemini review. Completed assessments were retained. Retry dietary review for the remaining dishes.`
          );
        }
      });

      return res.status(202).json(serialize(job));
    } catch (error) {
      return res.status(503).json({
        error: publicError(error),
      });
    }
  });

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