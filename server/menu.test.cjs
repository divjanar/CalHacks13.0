const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { registerMenu, splitMenu } = require("./menu");
const VENUE = "ChIJayGBoiRAjoARzA3Sc9KqN3g";
const dish = (id = "rice") => ({ id, name: id, section: "", price: "$5", description: "Rice with sauce", listedIngredients: ["rice"], evidence: "Rice $5 with sauce", possibleAllergens: [], ingredientCompleteness: "unknown", crossContact: "unknown" });
const source = { restaurant: "Santa Cruz Diner", sourceUrl: "https://santacruzdiner.com/-food-menu", text: "Rice $5 with sauce\n" + "x".repeat(6000), fetchedAt: new Date().toISOString() };
function harness(dependencies) {
  const handlers = {};
  registerMenu({ post: (path, fn) => handlers[`POST ${path}`] = fn, get: (path, fn) => handlers[`GET ${path}`] = fn }, { cacheDir: null, ...dependencies });
  async function call(method, route, body) {
    const response = { status: 200 };
    const handler = handlers[`${method} ${route.startsWith('/api/menu/jobs/') ? '/api/menu/jobs/:jobId' : route}`];
    assert.ok(handler, `Route exists: ${method} ${route}`);
    await handler({ body, params: { jobId: route.split('/').at(-1) } }, { status(value) { response.status = value; return this; }, json(value) { response.body = structuredClone(value); return this; } });
    return response;
  }
  async function completed(id) {
    for (let i = 0; i < 100; i++) {
      const response = await call('GET', `/api/menu/jobs/${id}`);
      if (response.body.status !== 'running') return response.body;
      await new Promise(resolve => setTimeout(resolve, 2));
    }
    throw new Error('Test job did not complete');
  }
  return { call, completed };
}

test('preview responds immediately, duplicate extraction is shared across profiles, full extraction is opt-in', async () => {
  let downloads = 0, release, calls = [];
  const gate = new Promise(resolve => release = resolve);
  let markStarted;
  const started = new Promise(resolve => markStarted = resolve);
  const h = harness({ fetchMenuText: async () => { downloads++; return source; }, readMenu: async (_, options) => { calls.push(options.preview); markStarted(); await gate; return { status: 'readable', dishes: [dish()] }; } });
  const first = await h.call('POST', '/api/menu/jobs', { venueId: VENUE, preferences: { diet: 'Vegan' } });
  assert.equal(first.status, 202); assert.equal(first.body.status, 'running');
  const second = await h.call('POST', '/api/menu/jobs', { venueId: VENUE, preferences: { diet: 'Jain' } });
  assert.equal(first.body.jobId, second.body.jobId);
  await started;
  assert.deepEqual(calls, [true]); assert.equal(downloads, 1);
  release();
  const preview = await h.completed(first.body.jobId);
  assert.equal(preview.status, 'ready'); assert.equal(preview.result.mode, 'preview');
  assert.equal(preview.result.dishes.length, 1);
  assert.deepEqual(calls, [true]);
  const full = await h.call('POST', '/api/menu/jobs', { venueId: VENUE, mode: 'full' });
  const result = await h.completed(full.body.jobId);
  assert.equal(result.status, 'ready'); assert.equal(downloads, 1);
  assert.equal(calls.filter(value => !value).length, splitMenu(source.text).length);
});

test('only configured venue URLs are allowed, missing menus fail without search', async () => {
  let calls = 0;
  const h = harness({ fetchMenuText: async () => { calls++; return source; } });
  for (const body of [{venueId:VENUE, url:'https://evil.test'}, {venueId:VENUE, menuUrl:'https://evil.test'}, {venueId:'missing'}, {venueId:VENUE,mode:'top'}]) assert.equal((await h.call('POST', '/api/menu/jobs', body)).status, 400);
  const missing = require('../src/data/sampleVenues.json').find(venue => !venue.menuUrl);
  assert.equal((await h.call('POST', '/api/menu/jobs', {venueId:missing.id})).status, 400);
  assert.equal(calls, 0);
  assert.equal((await h.call('GET', '/api/menu/jobs/expired')).status, 404);
});

test('disk extraction cache survives backend restart and contains no preferences', async () => {
  const cacheDir = await fs.mkdtemp(path.join(os.tmpdir(), 'table8-menu-test-'));
  try {
    let downloads = 0, extractions = 0;
    const dependencies = { cacheDir, fetchMenuText: async () => { downloads++; return source; }, readMenu: async () => { extractions++; return { status:'readable', dishes:[dish()] }; } };
    let h = harness(dependencies);
    const first = await h.call('POST','/api/menu/jobs',{venueId:VENUE});
    assert.equal((await h.completed(first.body.jobId)).status,'ready');
    h = harness(dependencies);
    const second = await h.call('POST','/api/menu/jobs',{venueId:VENUE});
    assert.equal((await h.completed(second.body.jobId)).result.dishes[0].id,'rice');
    assert.equal(downloads,1); assert.equal(extractions,1);
    const files = await fs.readdir(cacheDir);
    const content = await fs.readFile(path.join(cacheDir,files[0]),'utf8');
    assert.doesNotMatch(content,/preferences|allergiesAnswered|religiousDetails/);
  } finally { await fs.rm(cacheDir,{recursive:true,force:true}); }
});

test('reviews use trusted preset rules, share duplicates, and do not refetch extraction on profile changes', async () => {
  let downloads = 0, assessments = 0;
  const h = harness({ fetchMenuText: async () => { downloads++; return source; }, readMenu: async () => ({status:'readable',dishes:[dish()]}), assessMenu: async (dishes, preferences, preset) => {
    assessments++; assert.ok(preset.avoidedGroups.includes('pork')); assert.equal(preferences.notes,'No gravy');
    return dishes.map(dish=>({dishId:dish.id,profileStatus:'unknown',reason:'Sauce unknown',concerns:[]}));
  } });
  const extraction = await h.call('POST','/api/menu/jobs',{venueId:VENUE}); await h.completed(extraction.body.jobId);
  const body = {menuJobId:extraction.body.jobId,preferences:{diet:'Hindu non-veg',allergies:['Milk'],allergiesAnswered:true,notes:'No gravy'},preset:{avoidedGroups:[]}};
  const [a,b] = await Promise.all([h.call('POST','/api/menu/reviews',body),h.call('POST','/api/menu/reviews',body)]);
  assert.equal(a.body.jobId,b.body.jobId);
  assert.equal((await h.completed(a.body.jobId)).result.assessments[0].profileStatus,'unknown');
  const changed = await h.call('POST','/api/menu/reviews',{...body,preferences:{...body.preferences,allergies:['Eggs']}});
  await h.completed(changed.body.jobId); assert.equal(assessments,2); assert.equal(downloads,1);
});

test('partial extraction and failed assessment surface useful errors, never fabricated results', async () => {
  const h = harness({ fetchMenuText: async () => source, readMenu: async () => { const error = new Error('busy'); error.status=503; throw error; } });
  const start = await h.call('POST','/api/menu/jobs',{venueId:VENUE});
  const result = await h.completed(start.body.jobId);
  assert.equal(result.status,'error'); assert.match(result.error,/temporarily unavailable/);
  assert.equal(result.result.dishes.length,0);
  const failedReview = harness({ fetchMenuText: async () => source, readMenu: async () => ({status:'readable',dishes:[dish()]}), assessMenu: async () => { throw new Error('Missing dietary assessments'); } });
  const menu = await failedReview.call('POST','/api/menu/jobs',{venueId:VENUE}); await failedReview.completed(menu.body.jobId);
  const review = await failedReview.call('POST','/api/menu/reviews',{menuJobId:menu.body.jobId,preferences:{diet:'Vegan',allergies:[]}});
  const checked = await failedReview.completed(review.body.jobId);
  assert.equal(checked.status,'error'); assert.deepEqual(checked.result.assessments,[]);
});

function readerWith(generateContent) {
  const original=Module._load;
  delete require.cache[require.resolve('./menuReader')];
  Module._load=function(name,...args) { return name==='@google/genai' ? {GoogleGenAI:class {constructor(){this.models={generateContent}}}} : original.call(this,name,...args); };
  try { return require('./menuReader'); } finally { Module._load=original; }
}

test('Gemini extraction validates quoted evidence and rejects invented dishes', async t => {
  const previousKey=process.env.GEMINI_API_KEY, previousModel=process.env.GEMINI_MODEL;
  process.env.GEMINI_API_KEY='mock'; process.env.GEMINI_MODEL='mock';
  t.after(()=>{if(previousKey===undefined)delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=previousKey;if(previousModel===undefined)delete process.env.GEMINI_MODEL;else process.env.GEMINI_MODEL=previousModel;});
  const {readMenu}=readerWith(async request=>{
    assert.equal(request.config.tools,undefined);
    return {text:JSON.stringify({status:'readable',dishes:[
      {...dish(),name:'Rice',section:'',price:'$5',description:'with sauce',evidence:'Rice $5 with sauce'},
      {...dish('invented'),name:'Invented',evidence:'Invented $5'},
    ]})};
  });
  const result=await readMenu({restaurant:'Test',text:'Rice $5 with sauce'},{preview:true});
  assert.equal(result.dishes.length,1); assert.equal(result.status,'partial');
  assert.equal(result.dishes[0].evidence,'Rice $5 with sauce');
  assert.equal(result.dishes[0].crossContact,'unknown');
});

test('temporary Gemini failures retry at most three times; permanent errors do not retry', async t => {
  const key=process.env.GEMINI_API_KEY,model=process.env.GEMINI_MODEL;
  process.env.GEMINI_API_KEY='mock';process.env.GEMINI_MODEL='mock';
  t.after(()=>{if(key===undefined)delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=key;if(model===undefined)delete process.env.GEMINI_MODEL;else process.env.GEMINI_MODEL=model;});
  let calls=0,sleeps=0;
  let reader=readerWith(async()=>{calls++;const error=new Error('busy');error.status=503;throw error;});
  await assert.rejects(reader.generate({},'test',{sleep:async()=>sleeps++}));assert.equal(calls,3);assert.equal(sleeps,2);
  calls=0;reader=readerWith(async()=>{calls++;const error=new Error('denied');error.status=403;throw error;});
  await assert.rejects(reader.generate({},'test',{sleep:async()=>{}}));assert.equal(calls,1);
});

test('local warnings never approve unassessed dishes and can veto Gemini suggestions', async()=>{
  const {mergeDishAssessment}=await import('../src/data/dietaryMatching.js');
  const preferences={diet:'Hindu non-veg',allergies:['Milk'],allergiesAnswered:true};
  let result=mergeDishAssessment({...dish(),name:'Rice',description:'Rice',listedIngredients:['rice']},preferences,null);
  assert.equal(result.matching.assessed,false);assert.equal(result.matching.recommended,false);
  result=mergeDishAssessment({...dish(),name:'Bacon cheese rice',description:'Bacon and cheese',listedIngredients:['bacon','cheese']},preferences,{profileStatus:'potential',reason:'No issues',concerns:[]});
  assert.equal(result.matching.recommended,false);assert.equal(result.matching.hasConflict,true);
  assert.ok(result.matching.dietConflicts.some(item=>item.group==='pork'));
  assert.ok(result.matching.allergyConflicts.some(item=>item.allergen==='Milk'));
  const vegan={diet:'Vegan',allergies:[],allergiesAnswered:true};
  assert.equal(mergeDishAssessment({...dish(),name:'Coconut milk rice',description:'',listedIngredients:['coconut milk','rice']},vegan,null).matching.hasConflict,false);
});

test('official menu fetch extracts readable text and rejects cross-host redirects', async t=>{
  const original=global.fetch;t.after(()=>global.fetch=original);
  let requested;
  global.fetch=async url=>{requested=String(url);return new Response('<main><h2>Rice</h2><p>$5 rice and vegetables. '+ 'Menu details '.repeat(12)+'</p><script>do not extract script</script></main>',{headers:{'content-type':'text/html'}});};
  const {fetchMenuText}=require('./menuFetcher');const source=await fetchMenuText(VENUE);
  assert.equal(requested,'https://santacruzdiner.com/-food-menu');assert.match(source.text,/Rice/);assert.doesNotMatch(source.text,/extract script/);
  global.fetch=async()=>new Response('',{status:302,headers:{location:'https://evil.test/menu'}});
  await assert.rejects(fetchMenuText(VENUE),/redirects to another website/);
});

test('existing age calculation keeps the 18-year boundary',()=>{
  const {checkAge}=require('./ageCheck');const today={year:2026,month:10,day:23};
  assert.equal(checkAge('2008-10-23',today).eligible,true);assert.equal(checkAge('2008-10-24',today).eligible,false);
  assert.equal(checkAge('2008-02-30',today).status,'needs_review');
});


test('invalid dietary evidence gets one targeted repair and never an endless retry', async t => {
  const key=process.env.GEMINI_API_KEY,model=process.env.GEMINI_MODEL;
  process.env.GEMINI_API_KEY='mock';process.env.GEMINI_MODEL='mock';
  t.after(()=>{if(key===undefined)delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=key;if(model===undefined)delete process.env.GEMINI_MODEL;else process.env.GEMINI_MODEL=model;});
  let calls=0;
  const preferences={diet:'Hindu non-veg',allergies:['Milk']};
  const dishes=[{...dish('soup'),description:'cream soup',evidence:'cream soup'}];
  let reader=readerWith(async request=>{
    calls++;
    assert.deepEqual(request.config.responseJsonSchema.properties.assessments.items.properties.concerns.items.properties.restriction.enum,['Hindu non-veg','Milk']);
    return {text:JSON.stringify({assessments:[{dishId:'soup',profileStatus:'conflict',reason:'Milk concern',concerns:[{restriction:calls===1?'dairy':'Milk',evidence:'cream',reasoning:'Dairy ingredient'}]}]})};
  });
  const result=await reader.assessMenu(dishes,preferences,{avoidedGroups:['beef','pork']});
  assert.equal(calls,2);assert.equal(result[0].concerns[0].restriction,'Milk');
  calls=0;reader=readerWith(async()=>{calls++;return {text:JSON.stringify({assessments:[]})};});
  await assert.rejects(reader.assessMenu(dishes,preferences,null),/after one repair attempt/);
  assert.equal(calls,2);
});


test('duplicate menu headings merge ingredients and concerns without hiding conflicts', async () => {
  const { deduplicateDishes } = await import('../src/data/menuDishes.js');
  const a = { ...dish('a'), name: 'Tofu Scramble', price: '$19.95', section: 'Scrambles', listedIngredients: ['tofu'], matching: { assessed: true, recommended: true, hasConflict: false, suitabilityScore: 100, allergyConflicts: [], dietConflicts: [] } };
  const b = { ...a, id: 'b', name: ' tofu scramble ', section: 'Breakfast', listedIngredients: ['tofu', 'butter'], evidence: 'Tofu with butter', matching: { ...a.matching, recommended: false, hasConflict: true, allergyConflicts: [{allergen:'Milk', evidence:'butter'}] } };
  const merged = deduplicateDishes([a,b,{...a,id:'variant',price:'$21.95'}]);
  assert.equal(merged.length,2);
  assert.deepEqual(merged[0].listedIngredients,['tofu','butter']);
  assert.equal(merged[0].matching.hasConflict,true);
  assert.equal(merged[0].matching.recommended,false);
  assert.match(merged[0].evidence,/butter/);
  assert.equal(deduplicateDishes([a,{...a,matching:{...a.matching,assessed:false}}])[0].matching.recommended,false);
});
