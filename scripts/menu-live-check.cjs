// This check intentionally never consumes Gemini quota, even if enabled elsewhere.
process.env.MENU_READER = 'local';
const { readMenuUrl } = require('../server/urlMenuReader');
const venues = require('../src/data/sampleVenues.json');
(async () => {
  const venue = venues.find(item => item.id === 'ChIJayGBoiRAjoARzA3Sc9KqN3g');
  const start = Date.now();
  const menu = await readMenuUrl(venue, { preview: false });
  if (!menu.dishes.length || menu.analysisMethod !== 'local') throw new Error('No locally parsed menu returned.');
  const { analyzeDishLocally } = await import('../src/data/localMenuAnalysis.js');
  const sample = analyzeDishLocally(menu.dishes[0], { diet: 'Hindu non-veg', allergies: ['Milk'], allergiesAnswered: true });
  console.log(JSON.stringify({ check: 'live_local_menu', dishes: menu.dishes.length, milliseconds: Date.now() - start, name: sample.name, ingredients: sample.listedIngredients, warnings: sample.matching.hasConflict }));
})().catch(error => { console.error(error.message); process.exitCode = 1; });
