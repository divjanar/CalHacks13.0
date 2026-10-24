const cheerio = require("cheerio");
const venues = require("../src/data/sampleVenues.json");

async function fetchMenuText(venueId) {
  const venue = venues.find((item) => item.id === venueId);

  if (!venue) {
    throw new Error("Restaurant not found.");
  }

  if (!venue.menuUrl) {
    throw new Error("This restaurant does not have a menu URL configured.");
  }

  // Only fetch the URL stored in our venue configuration.
  let currentUrl = new URL(venue.menuUrl);
  const allowedHost = currentUrl.hostname;

  if (currentUrl.protocol !== "https:" || currentUrl.username || currentUrl.password || currentUrl.port || currentUrl.hostname === "localhost" || /^[\d.]+$/.test(currentUrl.hostname)) {
    throw new Error("The configured menu URL must use HTTPS.");
  }

  const signal = AbortSignal.timeout(20000);
  let response;

  // Follow a small number of redirects on the configured host only.
  for (let redirect = 0; redirect <= 3; redirect++) {
    response = await fetch(currentUrl, {
      signal,
      redirect: "manual",
      headers: {
        Accept: "text/html",
      },
    });

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");

      if (!location || redirect === 3) {
        await response.body?.cancel();
        throw new Error("The menu page redirected too many times.");
      }

      const nextUrl = new URL(location, currentUrl);
      await response.body?.cancel();

      if (
        nextUrl.protocol !== "https:" ||
        nextUrl.hostname !== allowedHost ||
        nextUrl.port ||
        nextUrl.username ||
        nextUrl.password
      ) {
        throw new Error(
          "The menu redirects to another website. Update its configured URL."
        );
      }

      currentUrl = nextUrl;
      continue;
    }

    break;
  }

  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`Menu download failed: HTTP ${response.status}.`);
  }

  const contentType = response.headers.get("content-type") || "";

  if (!contentType.toLowerCase().includes("text/html")) {
    await response.body?.cancel();
    throw new Error(
      "This reader currently supports HTML menus. PDF and image menus need a separate reader."
    );
  }

  // Limit downloaded HTML to 2 MB.
  const chunks = [];
  let bytes = 0;

  for await (const chunk of response.body) {
    bytes += chunk.length;

    if (bytes > 2 * 1024 * 1024) {
      throw new Error("The menu page exceeds the 2 MB download limit.");
    }

    chunks.push(Buffer.from(chunk));
  }

  const html = Buffer.concat(chunks).toString("utf8");
  const $ = cheerio.load(html);

  // Remove code, navigation, and common unrelated content.
  $(
    "script, style, noscript, template, svg, nav, header, footer, " +
    '[hidden], [aria-hidden="true"]'
  ).remove();

  // Preserve boundaries between dish names, descriptions, and prices.
  $("br").replaceWith("\n");

  $("h1, h2, h3, h4, p, li, tr, section, article, div").each(
    (_, element) => {
      $(element).append("\n");
    }
  );

  const main = $("main").first();
  const root = main.length ? main : $("body");

  const fullText = root
    .text()
    .replace(/\u00a0/g, " ")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean)
    .join("\n");

  if (fullText.length < 100) {
    throw new Error(
      "Not enough readable text was found. The menu may require JavaScript or use images."
    );
  }

  const maxCharacters = 60000;

  return {
    venueId: venue.id,
    restaurant: venue.displayName.text,
    address: venue.formattedAddress,
    sourceUrl: currentUrl.href,
    fetchedAt: new Date().toISOString(),
    text: fullText.slice(0, maxCharacters),
    truncated: fullText.length > maxCharacters,
    totalCharacters: fullText.length,
  };
}

module.exports = { fetchMenuText };