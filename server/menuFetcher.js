const cheerio = require("cheerio");
const crypto = require("node:crypto");
const venues = require("../src/data/sampleVenues.json");

async function fetchMenuText(venueId) {
  const venue = venues.find((item) => item.id === venueId);

  if (!venue) {
    throw new Error("Restaurant not found.");
  }

  if (!venue.menuUrl) {
    throw new Error(
      "This restaurant does not have a menu URL configured."
    );
  }

  // Only fetch the URL stored in our venue configuration.
  let currentUrl = new URL(venue.menuUrl);
  const allowedHost = currentUrl.hostname;

  if (
    currentUrl.protocol !== "https:" ||
    currentUrl.username ||
    currentUrl.password ||
    currentUrl.port ||
    currentUrl.hostname === "localhost" ||
    /^[\d.]+$/.test(currentUrl.hostname)
  ) {
    throw new Error(
      "The configured menu URL must use HTTPS."
    );
  }

  const signal = AbortSignal.timeout(20000);
  let response;

  // Follow redirects on the configured host only.
  for (let redirect = 0; redirect <= 3; redirect++) {
    response = await fetch(currentUrl, {
      signal,
      redirect: "manual",
      headers: {
        Accept: "text/html",
      },
    });

    if (
      [301, 302, 303, 307, 308].includes(response.status)
    ) {
      const location = response.headers.get("location");
      await response.body?.cancel();

      if (!location || redirect === 3) {
        throw new Error(
          "The menu page redirected too many times."
        );
      }

      const nextUrl = new URL(location, currentUrl);

      if (
        nextUrl.protocol !== "https:" ||
        nextUrl.hostname !== allowedHost ||
        nextUrl.port ||
        nextUrl.username ||
        nextUrl.password
      ) {
        throw new Error(
          "The menu redirects to another website. " +
          "Update its configured URL."
        );
      }

      currentUrl = nextUrl;
      continue;
    }

    break;
  }

  if (!response?.ok) {
    await response?.body?.cancel();

    if (response?.status === 403 && venue.id === 'ChIJrSzz8JlBjoAR4EwBj-WBV4E') {
      const saved = require('./menuSnapshots/pretty-good-advice.json');
      const { menuItem } = require('./menuFormats');
      return {
        venueId: venue.id, sourceUrl: saved.sourceUrl, fetchedAt: saved.recordedOn,
        sourceNotice: saved.notice, sourceType: 'saved_official_listing',
        inventoryComplete: false, truncated: false,
        text: saved.items.map(([name, price]) => `${name}\n$${price}`).join('\n'),
        items: saved.items.map(([name, price]) => ({ ...menuItem(venue, name, '', '$' + price), ingredientsUnavailable: true })),
      };
    }

    throw new Error(
      `Menu download failed: HTTP ${
        response?.status || "unknown"
      }.`
    );
  }

  const contentType =
    response.headers.get("content-type") || "";

  if (!contentType.toLowerCase().includes("text/html")) {
    await response.body?.cancel();

    throw new Error(
      "This reader currently supports HTML menus. " +
      "PDF and image menus need a separate reader."
    );
  }

  if (!response.body) {
    throw new Error("The menu page was empty.");
  }

  // Limit downloaded HTML to 2 MB.
  const chunks = [];
  let bytes = 0;

  for await (const chunk of response.body) {
    bytes += chunk.length;

    if (bytes > 2 * 1024 * 1024) {
      throw new Error(
        "The menu page exceeds the 2 MB download limit."
      );
    }

    chunks.push(Buffer.from(chunk));
  }

  const html = Buffer.concat(chunks).toString("utf8");

  let initialResult;

  try {
    initialResult = parseMenuHtml(
      html,
      venue,
      currentUrl.href
    );
  } catch (error) {
    if (error.code !== "MENU_TEXT_TOO_SHORT") {
      throw error;
    }
  }

  // Keep the existing fast path for recognized menu cards.
  if (initialResult?.items.length > 0) {
    return initialResult;
  }

  // Automatically run JavaScript for other HTML menus.
  console.log(
    "[menu] Checking the JavaScript-rendered menu…"
  );

  return fetchRenderedMenu(venue, currentUrl.href);
}

async function fetchRenderedMenu(venue, sourceUrl) {
  const { chromium } = require("playwright");

  console.log(
    `[menu] Opening ${venue.displayName.text} ` +
    "and waiting for menu text…"
  );

  const browser = await chromium.launch({
    headless: true,
    timeout: 20000,
  });

  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(15000);
    const configuredUrl = new URL(sourceUrl);

    // Keep main-page navigation on the configured host.
    // Embedded resources can still load from other hosts.
    await page.route("**/*", async (route) => {
      const request = route.request();
      // Menu text does not need product photos, videos or custom fonts.
      // Avoid downloading/decoding these on the small hosted backend.
      if (['image', 'media', 'font'].includes(request.resourceType())) {
        await route.abort();
        return;
      }

      if (
        request.isNavigationRequest() &&
        request.frame() === page.mainFrame()
      ) {
        const target = new URL(request.url());

        if (
          target.protocol !== "https:" ||
          target.hostname !== configuredUrl.hostname ||
          target.port ||
          target.username ||
          target.password
        ) {
          await route.abort();
          return;
        }
      }

      await route.continue();
    });

    const response = await page.goto(sourceUrl, {
      waitUntil: "domcontentloaded",
      timeout: 45000,
    });

    if (!response || !response.ok()) {
      throw new Error(
        `Menu page failed: HTTP ${
          response?.status() || "unknown"
        }.`
      );
    }

    // Allow JavaScript to load content, then wait for
    // visible text to remain unchanged for three seconds.
    // This is a readiness heuristic, not a coverage check.
    await page.waitForFunction(
      () => {
        const text =
          document.body?.innerText?.trim() || "";

        const now = Date.now();

        if (!window.__table8MenuWait) {
          window.__table8MenuWait = {
            started: now,
            changed: now,
            text,
          };

          return false;
        }

        const state = window.__table8MenuWait;

        if (state.text !== text) {
          state.text = text;
          state.changed = now;
        }

        return (
          text.length >= 100 &&
          now - state.started >= 8000 &&
          now - state.changed >= 3000
        );
      },
      null,
      {
        timeout: 45000,
        polling: 500,
      }
    );

    const finalUrl = new URL(page.url());

    if (
      finalUrl.protocol !== "https:" ||
      finalUrl.hostname !== configuredUrl.hostname ||
      finalUrl.port ||
      finalUrl.username ||
      finalUrl.password
    ) {
      throw new Error(
        "The rendered menu redirected to an unconfigured website."
      );
    }

    const html = await page.content();
    let result;

    try {
      result = parseMenuHtml(
        html,
        venue,
        finalUrl.href
      );
    } catch (error) {
      if (error.code !== "MENU_TEXT_TOO_SHORT") {
        throw error;
      }

      console.log(
        "[menu] HTML parsing found too little text. " +
        "Reading browser-visible text…"
      );

      // Some ordering dialogs mark the menu aria-hidden.
      // HTML cleanup can remove that menu even though its
      // text is available in the rendered browser.
      const text = await page.evaluate(() => {
        const main = document.querySelector("main");
        const mainText = main?.innerText?.trim() || "";

        return mainText.length >= 100
          ? mainText
          : document.body?.innerText || "";
      });

      const fullText = text
        .replace(/\u00a0/g, " ")
        .split(/\r?\n/)
        .map((line) =>
          line.replace(/[ \t]+/g, " ").trim()
        )
        .filter(Boolean)
        .join("\n");

      if (fullText.length < 100) {
        throw new Error(
          "Neither HTML parsing nor browser-visible text " +
          "provided enough readable menu content.", { cause: error }
        );
      }

      result = {
        venueId: venue.id,
        restaurant: venue.displayName.text,
        address: venue.formattedAddress,
        sourceUrl: finalUrl.href,
        fetchedAt: new Date().toISOString(),
        items: [],
        inventoryComplete: false,
        sourceCardCount: 0,
        text: fullText,
        truncated: false,
        totalCharacters: fullText.length,
      };
    }

    console.log(
      `[menu] Rendered menu: ${
        result.totalCharacters
      } characters.`
    );

    return result;
  } catch (error) {
    if (error.name === "TimeoutError") {
      throw new Error(
        `${venue.displayName.text}'s menu did not ` +
        "become readable in time.", { cause: error }
      );
    }

    throw error;
  } finally {
    await browser.close();
  }
}

function parseMenuHtml(html, venue, sourceUrl) {
  const $ = cheerio.load(html);

  const clean = (value) =>
    String(value || "")
      .replace(/\u00a0/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  // Inventory SpotApps menu cards before Gemini reads them.
  const items = [];
  const seen = new Set();
  const sourceCardCount = $(".food-item-holder").length;
  let inventoriedCards = 0;

  // The official Ghirardelli location page publishes names in carousel captions.
  // Prices and recipes are absent, so do not manufacture either from the photos.
  if (new URL(sourceUrl).hostname === 'www.ghirardelli.com') {
    const { menuItem } = require('./menuFormats');
    $('.ls-carousel-menu__title').each((_, element) => {
      const name = clean($(element).text());
      let parent = $(element).parent();
      while (parent.length && !parent.find('h2').length) parent = parent.parent();
      const section = clean(parent.find('h2').first().text());
      if (!name || /gift/i.test(section) || seen.has(name)) return;
      seen.add(name);
      items.push(menuItem(venue, name, '', '', section));
    });
  }

  $(".food-item-holder").each((_, element) => {
    const card = $(element);

    const group = card.closest(
      ".food-menu-grid-item-content"
    );

    const name = clean(
      card.find("h3").first().text()
    );

    if (!name) return;

    inventoriedCards++;

    const price = clean(
      card.find(".food-price").text()
    );

    const description = clean(
      card.find(".food-item-description").text()
    );

    const section = clean(
      group.find("h2").first().text()
    );

    const contextNode = group.clone();

    contextNode
      .find(
        ".food-menu-content, .food-item-holder, script, style"
      )
      .remove();

    const context = clean(contextNode.text());

    const identity = JSON.stringify([
      section,
      name,
      price,
      description,
      context,
    ]);

    const sourceItemId = crypto
      .createHash("sha256")
      .update(identity)
      .digest("hex")
      .slice(0, 24);

    if (seen.has(sourceItemId)) return;

    seen.add(sourceItemId);

    items.push({
      id: sourceItemId,
      sourceItemId,
      name,
      price,
      description,
      section,
      evidence: [
        section,
        context,
        name,
        price,
        description,
      ]
        .filter(Boolean)
        .join("\n"),
      listedIngredients: [],
      possibleAllergens: [],
      ingredientCompleteness: "unknown",
      crossContact: "unknown",
      restaurantConfirmed: false,
      extractionStatus: "pending",
    });
  });

  // Remove code, navigation, and unrelated content.
  $(
    "script, style, noscript, template, svg, nav, header, footer, " +
    '[hidden], [aria-hidden="true"]'
  ).remove();

  // Preserve boundaries between names, descriptions, and prices.
  $("br").replaceWith("\n");

  $(
    "h1, h2, h3, h4, p, li, tr, section, article, div"
  ).each((_, element) => {
    $(element).append("\n");
  });

  const main = $("main").first();
  const root = main.length ? main : $("body");

  const fullText = root
    .text()
    .replace(/\u00a0/g, " ")
    .split("\n")
    .map((line) =>
      line.replace(/[ \t]+/g, " ").trim()
    )
    .filter(Boolean)
    .join("\n");

  if (fullText.length < 100) {
    const error = new Error(
      "Not enough readable text was found. " +
      "The menu may require JavaScript or use images."
    );

    error.code = "MENU_TEXT_TOO_SHORT";
    throw error;
  }

  return {
    venueId: venue.id,
    items,
    inventoryComplete:
      sourceCardCount > 0 && items.length > 0 &&
      inventoriedCards === sourceCardCount,
    sourceCardCount,
    restaurant: venue.displayName.text,
    address: venue.formattedAddress,
    sourceUrl,
    fetchedAt: new Date().toISOString(),
    text: fullText,
    truncated: false,
    totalCharacters: fullText.length,
  };
}

module.exports = {
  fetchMenuText,
  parseMenuHtml,
};
