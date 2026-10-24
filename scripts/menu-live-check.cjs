const path = require('node:path');
require('../server/node_modules/dotenv').config({ path: path.join(__dirname, '../server/.env'), quiet: true });
const { fetchMenuText } = require('../server/menuFetcher');
const { readMenu, assessMenu } = require('../server/menuReader');
const { splitMenu, publicError } = require('../server/menu');
(async () => {
  const source = await fetchMenuText('ChIJayGBoiRAjoARzA3Sc9KqN3g');
  const menu = await readMenu({ ...source, text: splitMenu(source.text)[0] }, { preview: true });
  if (!menu.dishes.length || menu.dishes.length > 8) throw new Error('Invalid live menu preview count.');
  console.log(JSON.stringify({ check: 'live_preview', status: menu.status, dishes: menu.dishes.length, sourceCharacters: source.text.length, evidencePreserved: menu.dishes.every(dish => Boolean(dish.evidence)) }));
  const { dietaryPresets } = await import('../src/data/dietaryGuidance.js');
  const preferences = { diet: 'Hindu non-veg', allergies: ['Milk'], allergiesAnswered: true, religiousDetails: '', notes: '' };
  const assessments = await assessMenu(menu.dishes.slice(0, 4), preferences, dietaryPresets[preferences.diet]);
  console.log(JSON.stringify({ check: 'live_dietary_review', assessments: assessments.length, states: assessments.map(item => item.profileStatus) }));
})().catch(error => { console.error(publicError(error)); process.exitCode = 1; });
