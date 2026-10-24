const path = require('node:path');
require('../server/node_modules/dotenv').config({ path: path.join(__dirname, '../server/.env'), quiet: true });
const { fetchMenuText } = require('../server/menuFetcher');
const { readMenu, assessMenu } = require('../server/menuReader');
const { registerMenu, splitMenu, publicError } = require('../server/menu');
const VENUE = 'ChIJayGBoiRAjoARzA3Sc9KqN3g';
(async () => {
  if (process.argv.includes('--full')) {
    const routes = {};
    registerMenu({post:(url,fn)=>routes[`POST ${url}`]=fn,get:(url,fn)=>routes[`GET ${url}`]=fn});
    let job;
    for (let attempt=0;attempt<2;attempt++) {
      await routes['POST /api/menu/jobs']({body:{venueId:VENUE,mode:'full',refresh:attempt>0}},{status(){return this},json(value){job=structuredClone(value)}});
      let last=-1;
      while(job.status==='running') {
        await new Promise(resolve=>setTimeout(resolve,1000));
        routes['GET /api/menu/jobs/:jobId']({params:{jobId:job.jobId}},{status(){return this},json(value){job=structuredClone(value)}});
        if(job.progress.completed!==last) {last=job.progress.completed;console.log(JSON.stringify({check:'live_full_progress',attempt:attempt+1,...job.progress,coverage:job.result?.coverage}));}
      }
      if(job.status!=='ready')throw new Error(job.error);
      console.log(JSON.stringify({check:'live_full_result',attempt:attempt+1,items:job.result.dishes.length,coverage:job.result.coverage,coverageVerified:job.result.coverageVerified}));
      if(!job.result.coverage?.failed)break;
      if(attempt===1) {
        console.log(JSON.stringify({check:'live_full_failed_items',items:job.result.failedItems}));
        process.exitCode=1;
      }
    }
    return;
  }
  const source = await fetchMenuText(VENUE);
  console.log(JSON.stringify({check:'live_inventory',items:source.items.length,inventoryComplete:source.inventoryComplete,characters:source.text.length}));
  if(process.argv.includes('--inventory'))return;
  const items=source.items.slice(0,8);
  const menu = await readMenu({ ...source, items, text: items.length ? items.map(item=>item.evidence).join('\n\n') : splitMenu(source.text)[0] }, { preview: true });
  if (!menu.dishes.length || menu.dishes.length > 8) throw new Error('Invalid live menu preview count.');
  console.log(JSON.stringify({ check: 'live_preview', status: menu.status, dishes: menu.dishes.length, evidencePreserved: menu.dishes.every(dish => Boolean(dish.evidence)) }));
  const { dietaryPresets } = await import('../src/data/dietaryGuidance.js');
  const preferences = { diet: 'Hindu non-veg', allergies: ['Milk'], allergiesAnswered: true, religiousDetails: '', notes: '' };
  const assessments = await assessMenu(menu.dishes.slice(0, 4), preferences, dietaryPresets[preferences.diet]);
  console.log(JSON.stringify({ check: 'live_dietary_review', assessments: assessments.length, states: assessments.map(item => item.profileStatus) }));
})().catch(error => { console.error(publicError(error)); process.exitCode = 1; });
