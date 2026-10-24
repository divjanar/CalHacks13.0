// Explicit live official-source check; does not load secrets or use Gemini.
process.env.MENU_READER = 'local';
const venues = require('../src/data/sampleVenues.json');
const { readMenuUrl } = require('../server/urlMenuReader');
(async () => {
  for (const venue of venues) {
    const started = Date.now();
    try {
      const result = await readMenuUrl(venue, { preview: false });
      if (!result.dishes.length || result.dishes.some(item => !item.name || typeof item.description !== 'string' || !item.evidence)) throw new Error('Invalid menu inventory');
      console.log(JSON.stringify({ restaurant: venue.displayName.text, dishes: result.dishes.length, seconds: (Date.now() - started) / 1000 }));
    } catch (error) {
      process.exitCode = 1;
      console.error(JSON.stringify({ restaurant: venue.displayName.text, error: error.message }));
    }
  }
})();
