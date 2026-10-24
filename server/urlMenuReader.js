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
  // Preserve existing inventories, such as Santa Cruz Diner's.
  if (
    Array.isArray(source.items) &&
    source.items.length > 0
  ) {
    return;
  }

  // This fallback recognizes menus printed as:
  // Item name
  // $price
  // Optional description
  const lines = String(source.text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
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

    // Keep the source wording and line order intact.
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
      evidence,
      listedIngredients: [],
      possibleAllergens: [],
      ingredientCompleteness: "unknown",
      crossContact: "unknown",
      restaurantConfirmed: false,
      extractionStatus: "pending",
    });
  }

  if (items.length > 0) {
    source.items = items;

    // This heuristic does not prove full-menu coverage.
    source.inventoryComplete = false;

    console.log(
      `[menu] Inventoried ${items.length} priced menu items.`
    );
  }
}

async function fetchPdfText(venue) {
  let url = new URL(venue.menuUrl);

  // Allowed hosts come from server configuration.
  const allowedHosts = new Set([
    url.hostname,
    ...(Array.isArray(venue.menuAllowedHosts)
      ? venue.menuAllowedHosts
      : []),
  ]);

  // Piccino's official PDF redirects to Squarespace.
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
      .map((line) =>
        line.replace(/[ \t]+/g, " ").trim()
      )
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
  { preview = true } = {}
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
    "[menu] Fetching the configured menu source…"
  );

  const source = isPdf
    ? await fetchPdfText(venue)
    : await fetchMenuText(venue.id);

  // HTML menus without cards get a price-line inventory.
  // Keep the existing PDF extraction path unchanged.
  if (!isPdf) {
    inventoryPricedItems(source, venue);
  }

  const dishesById = new Map();
  const failedParts = [];
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

  // Keep all inventoried items visible, even if Gemini
  // cannot finish extracting their details.
  for (const item of inventory) {
    dishesById.set(item.id, {
      ...item,
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
        text: items
          .map((item) => item.evidence)
          .join("\n\n"),
      });
    }
  } else {
    const excerpts = splitMenu(source.text);

    const selectedExcerpts = preview
      ? excerpts.slice(0, 1)
      : excerpts;

    for (const text of selectedExcerpts) {
      batches.push({
        ...source,
        items: [],
        text,
      });
    }
  }

  for (let index = 0; index < batches.length; index++) {
    const batch = batches[index];

    console.log(
      `[menu] Reading part ${index + 1}/${batches.length}…`
    );

    try {
      const output = await readMenu(batch, {
        preview: preview && !hasInventory,
      });

      if (output.status !== "readable") {
        validationNeedsReview = true;
      }

      for (const dish of output.dishes) {
        const id = hasInventory
          ? dish.id
          : dishKey(venue.id, dish);

        dishesById.set(id, {
          ...dish,
          id,
          sourceUrl: source.sourceUrl,
          extractionStatus: "readable",
        });
      }

      if (hasInventory) {
        const missing = batch.items.filter(
          (item) =>
            dishesById.get(item.id)?.extractionStatus !==
            "readable"
        );

        // Retry omitted inventory items once.
        if (missing.length) {
          const repair = await readMenu({
            ...source,
            items: missing,
            text: missing
              .map((item) => item.evidence)
              .join("\n\n"),
          });

          for (const dish of repair.dishes) {
            dishesById.set(dish.id, {
              ...dish,
              sourceUrl: source.sourceUrl,
              extractionStatus: "readable",
            });
          }

          for (const item of missing) {
            if (
              dishesById.get(item.id)?.extractionStatus !==
              "readable"
            ) {
              validationNeedsReview = true;

              dishesById.set(item.id, {
                ...item,
                sourceUrl: source.sourceUrl,
                extractionStatus: "needs_review",
                extractionError:
                  "Menu details could not be extracted reliably.",
              });
            }
          }
        }
      }
    } catch (error) {
      firstBatchError ||= error;

      console.error(
        `[menu] Part ${index + 1} failed:`,
        error.message || error
      );

      validationNeedsReview = true;

      failedParts.push({
        part: index + 1,
        error: "This menu section could not be fully read.",
      });

      for (const item of batch.items) {
        if (
          dishesById.get(item.id)?.extractionStatus !==
          "readable"
        ) {
          dishesById.set(item.id, {
            ...item,
            sourceUrl: source.sourceUrl,
            extractionStatus: "needs_review",
            extractionError:
              "Menu details could not be extracted reliably.",
          });
        }
      }

      // Stop on provider-wide quota or access failures.
      if (
        [429, 401, 403].includes(
          Number(error.status || error.code)
        )
      ) {
        if (!dishesById.size) {
          throw error;
        }

        for (
          let remaining = index + 1;
          remaining < batches.length;
          remaining++
        ) {
          failedParts.push({
            part: remaining + 1,
            error:
              "Reading stopped because of a provider limit.",
          });
        }

        break;
      }
    }
  }

  // Mark entries skipped after a provider failure.
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

  if (preview) {
    dishes = dishes.slice(0, 8);
  }

  if (!dishes.length) {
    // Preserve the actual provider or validation error.
    if (firstBatchError) {
      throw firstBatchError;
    }

    throw new Error(
      "No dishes could be read from this menu."
    );
  }

  const extracted = dishes.filter(
    (item) => item.extractionStatus === "readable"
  ).length;

  const failed = dishes.length - extracted;

  console.log(
    `[menu] Finished: ${dishes.length} dishes listed, ` +
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
    failedParts,
  };
}

module.exports = {
  readMenuUrl,
};