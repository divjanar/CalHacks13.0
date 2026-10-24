# Table 8

React + Vite JavaScript implementation of the 13 supplied app screens, three menu-assistant states, and shared UI kit. Each page lives in `src/pages`; reusable navigation, controls, notices, booking summary, restaurant questions, and waiter live in `src/components`.

## Run

- `npm.cmd run dev`
- `npm.cmd run lint`
- `npm.cmd run build`
- `npm.cmd run test:smoke`

## Screens and navigation

| Route | Screen |
| --- | --- |
| `/#/` | Home |
| `/#/discover` | Discover dinners, with functional area/date/budget filters |
| `/#/dinner` | Selected dinner details |
| `/#/signin` | University .edu sign-in, create-account, and password-reset previews |
| `/#/preferences` | Dinner preferences, explicit allergy/None selection, general and religious dietary restrictions |
| `/#/verify` | University email/code and sample government-ID verification |
| `/#/consent` | Three required acknowledgments and separate optional updates preference |
| `/#/confirmation` or `/#/request-received` | Request Received, with the six-frame booking celebration |
| `/#/table` | Eight fictional diner profiles, dinner plan, check-in and cancellation previews |
| `/#/safety` | Trust and safety |
| `/#/report` | Report and support, including local received state |
| `/#/food` | Restaurant menu analyzed for the saved account needs |
| `/#/confirmed` | Fully confirmed sample outcome and waiter celebration |
| `/#/reading` | Alias for the menu options page |
| `/#/checking` | Alias for the menu options page |
| `/#/unavailable` | Incomplete menu and restaurant-question preview |
| `/#/ui-kit` | Shared controls and navigation from the supplied UI kit |

All routes support direct links and browser back/forward using hash navigation. Desktop layouts use the attached screenshots as references; mobile layouts reflow using the existing project conventions and original mobile homepage layout. The UI kit is directly accessible at `/#/ui-kit` without adding a product navigation item absent from the supplied design.

## Demo data and services awaiting connection

Dinner dates, availability, restaurants, profiles, prices, and dishes are fictional. The default sample profile is vegetarian with a peanut allergy, matching the supplied design. It is editable; users can explicitly select None. Missing allergy answers are not treated as None. Religious choices include Hindu non-veg, Hindu veg, Jain, Halal, Kosher, Buddhist, and Other, with space to describe personal requirements. The Hindu options are explicit app presets: Hindu non-veg avoids beef, pork, and their derivatives; Hindu veg avoids all meat, poultry, fish, seafood, eggs, and animal-derived stock/fat/gelatin, with dairy permitted. The UI lists these exclusions. All named choices now show the same explicit app-preset definition, Avoid list and Not excluded list. Jain excludes meat, fish, eggs, root vegetables, honey and alcohol; Buddhist uses an egg-free vegetarian preset excluding alliums and alcohol; Halal excludes pork, alcohol and non-halal animal ingredients; Kosher excludes pork, shellfish, fish without fins/scales, non-kosher animal ingredients and meat/dairy combinations. Vegetarian, Vegan, Pescatarian and None also use the same guidance format. These definitions describe this app, not universal religious practices. Existing unspecific Hindu selections are cleared on restoration so the user can explicitly choose a preset rather than having vegetarian status inferred. Other opens a blank field for the user to describe their needs. Preset exclusions are compared against explicitly tagged sample ingredients, including known root vegetables and meat/dairy combinations. Rules are defined by the displayed app selection rather than inferred privately. All these choices still require restaurant review, and unknown ingredients are not accepted as matches. Saved personal dietary notes are included in menu analysis. Available evening, meal budget, and accessibility fields are removed from preferences; dinner dates and prices remain on the discovery and dinner screens.

Filtering, validation, dietary rules, navigation, check-in previews, sample request cancellation, and request/approval previews run locally. No authentication, email delivery, identity provider, enrollment check, ID upload, restaurant API, booking, payment, support delivery, blocking, or marketing service is connected. Disconnected actions are labeled in their screens. Use sample credentials and information.

Verification code `123456` is displayed after the sample send action. An incorrect code shows an error. The government-ID button selects fictional demo metadata; it never opens a real file picker or accepts an ID. Both demo checks are needed to continue from verification.

Sign-in, account creation, reset, and verification require an address ending in `.edu` (including university subdomains). Creating an account opens identity verification first, prefilled with the entered university email. After both demo checks, users continue to preferences and then community consent without repeating verification. Sign-in opens Discover dinners so the user can browse available tables. Account setup also returns to Discover after preferences and consent. Choosing Find my seat on a dinner while signed in starts an explicit booking flow; only submitting that seat request opens Request Received. Completing account setup alone does not create a request. Email is carried between screens in memory only and is not persisted; domain validation does not establish enrollment or real email ownership.

Preferences and local demo flags persist in this tab's session storage, with an in-memory fallback. Email, passwords, report text, and identity documents are not persisted or sent. The optional updates choice is separate from required acknowledgments, with no marketing subscription created.

Menu results distinguish potential fits, unknown information, and conflicts. The menu reader uses Gemini and the saved account needs; see Menu analysis below. They do not determine allergy safety or cross-contact. Table-wide counts (eight reviewed, six potential, two pending) are a fixed fictional snapshot, clearly identified as such; they are not derived from live diner data. Confirmation screens are sample outcomes and never represent a real restaurant reservation. Restaurant-question controls display a question locally and send nothing.

## Original artwork and motion

All pre-existing artwork is preserved. The original table SVGs and old waiter sprite remain local, with no temporary Figma runtime URLs. The 18 supplied original PNG frames are copied unchanged into `src/assets/waiter/{pointing,reading,celebration}/1.png` through `6.png`.

The shared Waiter component plays all six poses in order: pointing on Home, menu reading on Menu Reading, and the original crouch/jump/landing celebration on Request Received and Fully Confirmed. It waits for all six images to load before starting, keeps one pose visible at a time, and shows the first pose under reduced motion. The old extra CSS bounce is removed because the celebration poses already contain the jump. Canvas alignment and transparency are preserved. No existing asset requires renaming.

The images do not include timeline metadata. Playback defaults are 1.5 seconds per pointing loop, 1.8 seconds per reading loop, and 0.96 seconds per celebration loop; adjust `durations` in `src/components/Waiter.jsx` to change these timings.

## Validation

- ESLint and production build pass.
- `npm.cmd run test:smoke`: dietary-rule checks and 38 route renders across fresh/populated sessions.
- `npm.cmd run test:browser`: native Chrome DevTools checks, without additional dependencies. Requires Vite at `http://127.0.0.1:5173` and a dedicated headless Chrome debugging session on port 9333.
- Browser checks cover all 17 supplied screens at 1440, 390, and 320 pixels, image loading, the request flow, validation/error paths, filtering, dietary edits, report/check-in previews, and reduced motion. Desktop/mobile screenshots are in `.browser-check/screens` and ignored by Git and ESLint.
- `npm.cmd run test:animations`: observes a full real-time loop on all four host screens, verifies that all six poses appear with exactly one visible at a time, checks original 320×320 image loading and reduced motion, and saves review screenshots under `.browser-check/animations`. Requires the same preview/debugging setup as `test:browser`.

Existing typography uses Google Fonts and requires access to that service.

## Typed area search and map

Discover now accepts a typed city, neighborhood or postal code. Pressing Enter or leaving the Area field calls Photon's live geocoder, selects a matching location, and opens an interactive OpenStreetMap map centered and zoomed into it. Ambiguous results can be selected from a matching-area picker. Clear/reset returns to all sample dinners; typing alone does not send requests. Requests time out, can be cancelled, and repeat queries use an in-memory cache.

The map and place search are live; restaurant availability remains sample data. The marker represents an area center, not a fictional restaurant location. Sample dinners are filtered using the returned city and region; a similarly named place in another country or a different city in Santa Cruz County does not become a sample venue match.

Geocoding uses the [Photon API](https://github.com/komoot/photon/blob/master/docs/api-v1.md), with the modest-use public demo endpoint by default. The provider offers no uptime guarantee; configure `VITE_GEOCODER_URL` (see `.env.example`) to use another Photon-compatible endpoint for production traffic. No API key or new package is required. Submitted area text is sent to Photon; the embedded map requests OpenStreetMap data. Attribution and service names are shown in the UI. These services require a network connection.

- `npm.cmd run test:area`: matching, city/county distinction, zoom bounds, caching and error-response checks without live service calls.
- `npm.cmd run test:area:browser`: real city searches, changing map bounds, sample dinner filtering, mobile sizing and reset. Uses the same Chrome/Vite setup as other browser checks. Review captures are under `.browser-check/area`.

Discover includes a month calendar with day or Monday?Sunday week selection, and minimum/maximum budget sliders with $5 increments and numeric inputs accepting custom or empty values. The full estimated meal range must fit the chosen budget. The compact map sits directly below the matching-area picker.

To activate Google Maps, enable the Maps JavaScript API and Places API (New) in a Google Cloud project and set `VITE_GOOGLE_MAPS_API_KEY` in `.env.local`, then restart Vite. Restrict this public browser key to your site and the Maps JavaScript API and Places API (New). Until a key is configured the map uses OpenStreetMap. Google setup: https://developers.google.com/maps/documentation/embed/get-api-key

US-only area lookup appends United States, requests countrycode=us, and rejects non-US results. The supplied browser key is configured in ignored `.env.local`. Restaurant cards use Google Places Text Search (New), including pagination, current opening hours, ratings, addresses and published price ranges. Unknown prices stay visible. Restaurant results do not establish future seat availability; the calendar filters the explicitly labeled Table 8 sample dinners. No live restaurant is presented as a confirmed Table 8 booking. Google Maps uses a compact JavaScript map with cream/sage styling.

Discover now shows only three sample Table 8 dinners: Santa Cruz Diner, Makai Island Kitchen & Groggery, and Pretty Good Advice (1319 Pacific Ave, Santa Cruz). Google Places verified venue coordinates and price bands are in `src/data/sampleVenues.json`. Numbered map pins and the legend track the visible dinner cards, including before an area search. The live dining component is no longer mounted on Discover. Sample dates, seats, menu analysis, and reservations remain fictional; venue details do not imply restaurant participation. Pretty Good Advice uses an early 5:00?6:30 PM sample event.

Discover uses a wider (up to 440px) map panel, with Table 8 sample dinners in a vertical scrollable list to its right. The list is bounded to 680px on desktop and keyboard-focusable. Small screens stack the controls, map and dinner list without horizontal overflow.

Account creation collects first and last name plus an optional preferred first name (defaults to first name). After identity verification, the header displays that preferred name with a user icon on desktop and mobile. Sign-in asks only for university email and password and reuses the saved demo profile. Without a saved profile the header shows My account. A backend account/profile service is not connected yet; production sign-in must retrieve the preferred name from the authenticated account. Names persist with the demo profile in this tab session; email and passwords are not persisted.

The header account dropdown contains User settings followed by Sign out. `#/settings` pre-fills first name, last name, preferred first name, and the in-memory sign-in email when available. Saving names updates the header immediately and persists in the demo tab session. Sign out clears signed-in status, pending reservation intent and in-memory email, closes the account menu and returns to Discover; it does not cancel an existing seat request. Settings require a signed-in account or active account setup.

Four San Francisco sample outings are included: Ghirardelli Chocolate Experience (900 North Point St F301), Arsicault Bakery (87 McAllister St), Piccino (1001 Minnesota St), and Salt & Straw (586 Hayes St). Locations and available price bands were verified through Google Places. Bakery/dessert events use appropriate daytime/evening sample times; these are fictional group outings, not confirmed venue reservations. SF is recognized as San Francisco. The default budget maximum is $100 to include Piccino; venues with unknown prices remain visible and labeled.

Local area is edited in User settings, not dietary preferences or reservation preferences. Settings save `profile.localArea` and keep the legacy preferences area in sync. Discover pre-fills and resolves the saved area automatically on entry/reload, using the existing California-first US-only search. Existing profiles fall back to their previously saved preferences area. Users can still manually search another area or reset to all areas without changing their saved home area.

Location fields in User settings and Discover offer debounced Google Places Autocomplete (New) region suggestions while typing. California results appear first, followed by other US matches; keyboard arrows/Enter/Escape and pointer selection are supported. The typo `San Fransico` was verified to suggest San Francisco, CA. Only US predictions are requested; saving the selected settings location continues to populate Discover automatically. Requests are cancelled when input changes or the field closes.

Local area is now required in User settings and is normalized to city, full state name, and country (for example San Francisco, California, United States). Leaving the field automatically chooses the first California-first US city suggestion, including when the suggestions have not finished loading. Selecting a suggestion resolves the same complete format. Saving validates/resolves the location so an incomplete or unrecognized area is not stored.


### Menu analysis

The menu flow fetches the official `menuUrl` stored in `src/data/sampleVenues.json`.
Santa Cruz Diner is configured as `ChIJayGBoiRAjoARzA3Sc9KqN3g` with
`https://santacruzdiner.com/-food-menu`. Other restaurants currently have
`menuUrl: null` and show an explicit configuration error; no search fallback,
upload or diner-entered URL is used. Add verified official URLs to venue data
to enable those restaurants. The fetcher accepts only configured HTTPS URLs,
rejects credentials/ports and cross-host redirects, limits HTML to 2 MB, and
extracts at most 60,000 characters of readable text.

`server/menu.js` exposes:

- `POST /api/menu/jobs` with `{ venueId, mode: "preview" | "full" }` returns a job ID immediately.
- `GET /api/menu/jobs/:jobId` returns progress, extracted dishes, and useful errors.
- `POST /api/menu/reviews` with `{ menuJobId, preferences }` starts a separate background dietary review of server-extracted dishes.

The app requests the full menu by default, starting when dinner details open.
The food page shows extracted dishes as sections finish. Adjacent **Full menu**
and **Top options** buttons switch between all extracted dishes and up to eight
assessed matches for the account. Switching views reuses the same results. The
backend preview mode remains available but is not requested by these screens.
There is no promise that eight suitable dishes exist. Cached extracted dishes render immediately. On a first
visit, menu extraction has an honest loading message. Dietary review shows its
own pending state and can be retried independently.

Extraction caches and in-flight requests are shared independently of account
preferences. Validated extraction results are cached for 24 hours in ignored
`server/.menu-cache-v2` and in browser storage (`table8-extracted-menu-v6`).
Menu cache keys include the configured URL and server model setting. Account
reviews stay in memory, keyed by dishes and the saved profile; dietary data is
not written to disk or browser menu storage. A backend restart invalidates active
jobs but reloads saved extractions. Retry reconnects/restarts work. Temporary
provider errors retry at most three times per call with backoff. A missing or
invalid dietary assessment gets at most one targeted repair attempt. Failed
sections are marked partial, never replaced with demo dishes.

`server/menuReader.js` validates structured Gemini output against retrieved menu
text, preserves dish excerpts and supporting allergen evidence, and rejects
unsupported dishes. Reviews use the explicit server-loaded rules in
`src/data/dietaryGuidance.js` plus saved allergies and personal notes.
`src/data/dietaryMatching.js` adds local warnings but never approves an unassessed
dish or overrides an AI/local conflict. Ingredients, religious sourcing, and
cross-contact remain unknown until confirmed by the restaurant; results never
establish allergy safety or religious certification. Full menu coverage remains
unverified, especially for image/PDF/JavaScript-only menus (HTML is supported).

Run the frontend with `npm.cmd run dev`; run the backend with `node server/index.js`
(or `node index.js` from `server`). Credentials are read from `server/.env` using
`GEMINI_API_KEY`, `GEMINI_MODEL`, and the existing optional `GEMINI_MENU_MODEL`
override. Model values are unchanged. The ID age-check endpoint and its model
setting remain separate. Never put Gemini keys in Vite variables.

Checks: `node --test server/menu.test.cjs`, `npm.cmd run test:smoke`,
`npm.cmd run build`. `node scripts/menu-live-check.cjs` is an optional paid,
networked preview and four-dish review check using the configured backend key;
it never requests full-menu extraction.
