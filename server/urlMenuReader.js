const crypto = require("node:crypto");
const { fetchMenuText } = require("./menuFetcher");
const { readMenu } = require("./menuReader");

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

function normalize(value) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function dishKey(venueId, dish) {
  return crypto
    .createHash("sha256")
    .update(
      JSON.stringify([
        venueId,
        normalize(dish.section),
        normalize(dish.name),
        normalize(dish.price),
      ])
    )
    .digest("hex")
    .slice(0, 24);
}

function inventoryPricedItems(source, venue) {
  // Preserve inventories already created by menuFetcher.
  if (Array.isArray(source.items) && source.items.length) {
    return;
  }

  const lines = String(source.text || "")
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);

  const pricePattern = /^[$£€]\s*\d+(?:[.,]\d{1,2})?$/;
  const entries = [];

  for (let index = 1; index < lines.length; index++) {
    if (!pricePattern.test(lines[index])) continue;

    const name = lines[index - 1];

    if (!name || pricePattern.test(name)) continue;

    entries.push({
      name,
      price: lines[index],
      nameIndex: index - 1,
    });
  }

  const items = [];
  const seen = new Set();

  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index];
    const next = entries[index + 1];

    const id = dishKey(venue.id, {
      section: "",
      name: entry.name,
      price: entry.price,
    });

    if (seen.has(id)) continue;
    seen.add(id);

    const evidence = lines
      .slice(
        entry.nameIndex,
        next ? next.nameIndex : lines.length
      )
      .join("\n");

    items.push({
      id,
      sourceItemId: id,
      name: entry.name,
      price: entry.price,
      section: "",
      description: "",
      evidence,
      listedIngredients: [],
      possibleAllergens: [],
      ingredientCompleteness: "unknown",
      crossContact: "unknown",
      restaurantConfirmed: false,
      extractionStatus: "pending",
    });
  }

  if (items.length) {
    source.items = items;

    // Finding priced items does not prove complete coverage.
    source.inventoryComplete = false;

    console.log(
      `[menu] Inventoried ${items.length} priced menu items.`
    );
  }
}

async function fetchPdfText(venue) {
  let url = new URL(venue.menuUrl);

  const allowedHosts = new Set([
    url.hostname,
    ...(Array.isArray(venue.menuAllowedHosts)
      ? venue.menuAllowedHosts
      : []),
  ]);

  if (url.hostname === "www.piccino.com") {
    allowedHosts.add("static1.squarespace.com");
  }

  const signal = AbortSignal.timeout(30000);
  let response;

  for (let attempt = 0; attempt <= 3; attempt++) {
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      !allowedHosts.has(url.hostname)
    ) {
      throw new Error(
        "The menu PDF redirected to an unconfigured host."
      );
    }

    response = await fetch(url, {
      redirect: "manual",
      signal,
      headers: {
        Accept: "application/pdf",
      },
    });

    if (
      [301, 302, 303, 307, 308].includes(response.status)
    ) {
      const location = response.headers.get("location");
      await response.body?.cancel();

      if (!location || attempt === 3) {
        throw new Error(
          "The menu PDF redirected too many times."
        );
      }

      url = new URL(location, url);
      continue;
    }

    break;
  }

  if (!response?.ok) {
    await response?.body?.cancel();

    throw new Error(
      `Menu PDF download failed: HTTP ${
        response?.status || "unknown"
      }.`
    );
  }

  const type = (
    response.headers.get("content-type") || ""
  ).toLowerCase();

  if (!type.includes("application/pdf")) {
    await response.body?.cancel();

    throw new Error(
      "The configured menu PDF link did not return a PDF."
    );
  }

  if (!response.body) {
    throw new Error("The menu PDF was empty.");
  }

  const chunks = [];
  let bytes = 0;

  for await (const chunk of response.body) {
    bytes += chunk.length;

    if (bytes > 10 * 1024 * 1024) {
      throw new Error(
        "The menu PDF exceeds the 10 MB limit."
      );
    }

    chunks.push(Buffer.from(chunk));
  }

  const { PDFParse } = require("pdf-parse");

  const parser = new PDFParse({
    data: Uint8Array.from(Buffer.concat(chunks)),
  });

  try {
    const result = await parser.getText();

    const text = String(result.text || "")
      .replace(/\u00a0/g, " ")
      .split(/\r?\n/)
      .map(line => line.replace(/[ \t]+/g, " ").trim())
      .filter(Boolean)
      .join("\n");

    if (text.length < 100) {
      throw new Error(
        "The menu PDF has too little readable text. " +
        "It may need image recognition."
      );
    }

    if (text.length > 200000) {
      throw new Error(
        "This menu PDF needs section-based configuration."
      );
    }

    return {
      venueId: venue.id,
      restaurant: venue.displayName.text,
      address: venue.formattedAddress,
      sourceUrl: url.href,
      fetchedAt: new Date().toISOString(),
      sourceType: "pdf",
      text,
      items: [],
      inventoryComplete: false,
      truncated: false,
    };
  } finally {
    await parser.destroy();
  }
}

async function readMenuUrl(
  venue,
  { preview = true, onProgress = () => {} } = {}
) {
  if (!venue?.menuUrl) {
    throw new Error(
      "An official menu URL has not been configured."
    );
  }

  const isPdf = new URL(venue.menuUrl)
    .pathname
    .toLowerCase()
    .endsWith(".pdf");

  console.log(
    `[menu] Fetching menu source for ${venue.displayName.text}…`
  );

  const source = isPdf
    ? await fetchPdfText(venue)
    : await fetchMenuText(venue.id);

  if (!isPdf) {
    inventoryPricedItems(source, venue);
  }

  const dishesById = new Map();
  const failedPartsByIndex = new Map();
  let firstBatchError;
  let validationNeedsReview = Boolean(source.truncated);

  const hasInventory =
    Array.isArray(source.items) &&
    source.items.length > 0;

  const inventory = hasInventory
    ? preview
      ? source.items.slice(0, 8)
      : source.items
    : [];

  // Retain every inventoried item if Gemini omits it or fails.
  for (const item of inventory) {
    dishesById.set(item.id, {
      ...item,
      description: item.description || "",
      sourceUrl: source.sourceUrl,
      extractionStatus: "pending",
    });
  }

  const batches = [];

  if (hasInventory) {
    for (
      let offset = 0;
      offset < inventory.length;
      offset += 8
    ) {
      const items = inventory.slice(offset, offset + 8);

      batches.push({
        ...source,
        items,
        text: items.map(item => item.evidence).join("\n\n"),
      });
    }
  } else {
    const excerpts = splitMenu(source.text);

    for (const text of preview ? excerpts.slice(0, 1) : excerpts) {
      batches.push({
        ...source,
        items: [],
        text,
      });
    }
  }

  let nextBatch = 0;
  let completedBatches = 0;
  let stopped = false;

  onProgress({
    completed: 0,
    total: batches.length,
    unit: "batches",
  });

  function retainDish(dish, batch) {
    // Inventory IDs must belong to this batch.
    if (
      hasInventory &&
      !batch.items.some(item => item.id === dish.id)
    ) {
      validationNeedsReview = true;
      return;
    }

    const id = hasInventory
      ? dish.id
      : dishKey(venue.id, dish);

    dishesById.set(id, {
      ...dishesById.get(id),
      ...dish,
      id,
      description: dish.description || "",
      sourceUrl: source.sourceUrl,
      extractionStatus: "readable",
    });
  }

  async function processBatch(index) {
    const batch = batches[index];

    console.log(
      `[menu] ${venue.displayName.text}: ` +
      `reading part ${index + 1}/${batches.length}…`
    );

    try {
      const output = await readMenu(batch, {
        preview: preview && !hasInventory,
      });

      if (output.status !== "readable") {
        validationNeedsReview = true;
      }

      for (const dish of output.dishes) {
        retainDish(dish, batch);
      }

      if (hasInventory) {
        const missing = batch.items.filter(
          item =>
            dishesById.get(item.id)?.extractionStatus !==
            "readable"
        );

        // Retry omitted items once unless another batch has
        // already found a provider-wide failure.
        if (missing.length && !stopped) {
          const repairBatch = {
            ...source,
            items: missing,
            text: missing
              .map(item => item.evidence)
              .join("\n\n"),
          };

          const repair = await readMenu(repairBatch);

          for (const dish of repair.dishes) {
            retainDish(dish, repairBatch);
          }
        }

        for (const item of missing) {
          if (
            dishesById.get(item.id)?.extractionStatus !==
            "readable"
          ) {
            validationNeedsReview = true;

            dishesById.set(item.id, {
              ...dishesById.get(item.id),
              extractionStatus: "needs_review",
              extractionError:
                "Menu details could not be extracted reliably.",
            });
          }
        }
      }
    } catch (error) {
      firstBatchError ||= error;
      validationNeedsReview = true;

      console.error(
        `[menu] Part ${index + 1} failed. Code:`,
        error.status || error.code || error.name || "unknown"
      );

      failedPartsByIndex.set(index, {
        part: index + 1,
        error: "This menu section could not be fully read.",
      });

      for (const item of batch.items) {
        if (
          dishesById.get(item.id)?.extractionStatus !==
          "readable"
        ) {
          dishesById.set(item.id, {
            ...dishesById.get(item.id),
            extractionStatus: "needs_review",
            extractionError:
              "Menu details could not be extracted reliably.",
          });
        }
      }

      if (
        [400, 401, 403, 404, 429].includes(
          Number(error.status || error.code)
        ) ||
        /API_KEY_INVALID|API key not valid/i.test(
          String(error.message || "")
        )
      ) {
        stopped = true;
      }
    }
  }

  async function worker() {
    while (!stopped && nextBatch < batches.length) {
      const index = nextBatch++;
      await processBatch(index);
      completedBatches++;

      onProgress({
        completed: completedBatches,
        total: batches.length,
        unit: "batches",
      });
    }
  }

  // Two in-flight batches per extraction.
  await Promise.all(
    Array.from(
      { length: Math.min(2, batches.length) },
      () => worker()
    )
  );

  // These batches were never started after a provider failure.
  for (let index = nextBatch; index < batches.length; index++) {
    failedPartsByIndex.set(index, {
      part: index + 1,
      error:
        "Reading stopped because of a provider configuration or usage limit.",
    });
  }

  for (const [id, dish] of dishesById) {
    if (dish.extractionStatus === "pending") {
      dishesById.set(id, {
        ...dish,
        extractionStatus: "needs_review",
        extractionError: "Menu reading did not finish.",
      });
    }
  }

  let dishes = [...dishesById.values()];

  if (!hasInventory) {
    dishes.sort(
      (a, b) =>
        source.text.indexOf(a.name) -
        source.text.indexOf(b.name)
    );
  }

  if (preview) {
    dishes = dishes.slice(0, 8);
  }

  if (!dishes.length) {
    if (firstBatchError) throw firstBatchError;

    throw new Error(
      "No dishes could be read from this menu."
    );
  }

  const extracted = dishes.filter(
    item => item.extractionStatus === "readable"
  ).length;

  const failed = dishes.length - extracted;

  console.log(
    `[menu] Finished ${venue.displayName.text}: ` +
    `${dishes.length} dishes listed, ` +
    `${extracted} with extracted details.`
  );

  return {
    venueId: venue.id,
    restaurant: venue.displayName.text,
    address: venue.formattedAddress,
    mode: preview ? "preview" : "full",
    sourceUrl: source.sourceUrl,
    sourceType: "official_menu_text",
    fetchedAt: source.fetchedAt,
    dishes,
    status: "partial",
    intentionalPreview: preview,
    coverageVerified: false,
    validationNeedsReview:
      validationNeedsReview || failed > 0,
    sourceTruncated: Boolean(source.truncated),
    coverage: {
      listed: dishes.length,
      extracted,
      failed,
      remaining: 0,
    },
    failedParts: [...failedPartsByIndex.values()]
      .sort((a, b) => a.part - b.part),
  };
}

module.exports = {
  readMenuUrl,
};