const crypto = require("node:crypto");
const { fetchMenuText } = require("./menuFetcher");
const { menuSettings } = require("./menuSettings");

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

  // PDF menus often put a price after a vertical bar or a spaced dash.
  const inline = lines.map((line, index) => {
    const match = line.match(/^([^|]+?)\s+(?:\||-)\s*\.?\s*\$?(\d+(?:\.\d{1,2})?(?:\/\d+)?)\.?$/);
    if (!match || /^\+|surcharge|transactions/i.test(match[1])) return null;
    const [name, ...description] = match[1].split(/,\s*/);
    const following = lines[index + 1] || '';
    // Piccino prints cocktail recipes on a separate, comma-separated line.
    if (!/[|]/.test(following) && /,/.test(following) && !/surcharge|transactions/i.test(following)) description.push(following);
    return { name, price: '$' + match[2], description: description.join(', '), index, evidence: line };
  }).filter(Boolean);
  if (inline.length) {
    source.items = inline.map(entry => {
      const id = dishKey(venue.id, entry);
      return { ...entry, id, sourceItemId: id, section: '', listedIngredients: [], possibleAllergens: [] };
    });
    source.inventoryComplete = false;
    return;
  }

  for (let index = 1; index < lines.length; index++) {
    if (!pricePattern.test(lines[index])) continue;

    const name = lines[index - 1];

    if (!name || pricePattern.test(name)) continue;

    entries.push({
      name,
      price: lines[index],
      priceIndex: index,
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
      description: lines.slice(entry.priceIndex + 1, next ? next.nameIndex : lines.length).join(' '),
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
      description: lines.slice(entry.priceIndex + 1, next ? next.nameIndex : lines.length).join(' '),
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

  const signal = AbortSignal.timeout(60000);
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

    let items = [];
    if (venue.menuFormat === 'three-column-pdf') {
      const { readColumnPdf } = require('./menuFormats');
      items = await readColumnPdf(Buffer.concat(chunks), venue, result.pages);
    }
    return {
      venueId: venue.id,
      restaurant: venue.displayName.text,
      address: venue.formattedAddress,
      sourceUrl: url.href,
      fetchedAt: new Date().toISOString(),
      sourceType: "pdf",
      text,
      items,
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
  const settings = menuSettings();
  onProgress({ progress: { phase: 'fetching', reader: settings.reader, completed: 0, total: 0 } });
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

  inventoryPricedItems(source, venue);
  if (!source.items?.length) {
    throw new Error("This menu has no locally readable item structure. No dishes were invented; configure a text-based official menu for this restaurant.");
  }
  const { analyzeDishLocally } = await import("../src/data/localMenuAnalysis.js");
  const items = preview ? source.items.slice(0, 8) : source.items;
  const resultFor = (dishes, complete) => ({
    venueId: venue.id, restaurant: venue.displayName.text, address: venue.formattedAddress,
    mode: preview ? 'preview' : 'full', sourceUrl: source.sourceUrl,
    sourceType: source.sourceType || 'official_menu_text', sourceNotice: source.sourceNotice || '',
    analysisMethod: settings.reader, fetchedAt: source.fetchedAt,
    dishes: [...dishes], status: complete ? 'readable' : 'partial', intentionalPreview: preview,
    coverageVerified: complete && !preview && Boolean(source.inventoryComplete),
    validationNeedsReview: Boolean(source.truncated), sourceTruncated: Boolean(source.truncated),
    coverage: { listed: items.length, extracted: dishes.length, failed: 0, remaining: items.length - dishes.length }, failedParts: [],
  });
  onProgress({ progress: { phase: settings.reader === 'gemini' ? 'gemini' : 'local', reader: settings.reader, completed: 0, total: items.length } });
  let dishes = items.map(item => analyzeDishLocally({ ...item, sourceUrl: source.sourceUrl }));
  if (settings.reader === 'gemini') {
    // Lazy load so local mode never loads the SDK or consumes API quota.
    const { readMenu } = require('./menuReader');
    const extracted = [];
    for (let offset = 0; offset < items.length; offset += 8) {
      const batch = items.slice(offset, offset + 8);
      const result = await readMenu({ ...source, items: batch, text: batch.map(item => item.evidence).join('\n\n') });
      const byId = new Map(result.dishes.filter(item => batch.some(expected => expected.id === item.id)).map(item => [item.id, item]));
      if (byId.size !== batch.length) throw new Error('Gemini did not return supported ingredients for every requested menu item. Retry or select MENU_READER=local.');
      for (const item of batch) extracted.push({ ...byId.get(item.id), sourceUrl: source.sourceUrl, analysisMethod: 'gemini' });
      onProgress({ progress: { phase: 'gemini', reader: 'gemini', completed: extracted.length, total: items.length }, result: resultFor(extracted, false) });
    }
    dishes = extracted;
  }
  return resultFor(dishes, true);
}

module.exports = {
  readMenuUrl,
  fetchPdfText,
  inventoryPricedItems,
};
