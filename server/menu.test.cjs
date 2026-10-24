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
  assert.equal(result[0].ingredientCompleteness,'unknown');
  assert.equal(result[0].sourcing,'unknown');
  assert.equal(result[0].crossContact,'unknown');
  reader=readerWith(async()=>({text:JSON.stringify({assessments:[{dishId:'soup',profileStatus:'potential',reason:'No listed conflict',concerns:[]}]})}));
  const incomplete=await reader.assessMenu([{...dishes[0],extractionStatus:'pending'}],preferences,null);
  assert.equal(incomplete[0].profileStatus,'unknown');
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


test('HTML inventory keeps all real cards and preserves distinct same-name options', () => {
  const { parseMenuHtml } = require('./menuFetcher');
  const card = (description) => `<div class="food-item-holder"><div class="food-item-title"><h3>Vegetarian</h3></div><div class="food-price">$19.95</div><div class="food-item-description">${description}</div></div>`;
  const html = `<main><div class="food-menu-grid-item-content"><h2>Skillets</h2><p>Served with eggs.</p><div class="food-menu-content">${card('Avocado and cheese')}</div></div><div class="food-menu-grid-item-content"><h2>Crepes</h2><p>Served with salsa.</p><div class="food-menu-content">${card('Spinach and onion')}</div></div></main>`;
  const source = parseMenuHtml(html,{id:'test',displayName:{text:'Test Diner'}},'https://example.com/menu');
  assert.equal(source.items.length,2);assert.equal(source.inventoryComplete,true);
  assert.notEqual(source.items[0].sourceItemId,source.items[1].sourceItemId);
  assert.equal(source.items[0].price,'$19.95');assert.match(source.items[1].evidence,/Served with salsa/);
});

test('full inventory is visible before Gemini completes, and omissions are retried without dropping dishes', async () => {
  const items=Array.from({length:19},(_,i)=>({...dish(`item-${i}`),sourceItemId:`source-${i}`,extractionStatus:'pending'}));
  const seen=new Map();let release,markStarted;
  const gate=new Promise(resolve=>release=resolve),started=new Promise(resolve=>markStarted=resolve);
  const h=harness({fetchMenuText:async()=>({...source,items,inventoryComplete:true}),readMenu:async input=>{
    markStarted();await gate;
    for(const item of input.items)seen.set(item.sourceItemId,(seen.get(item.sourceItemId)||0)+1);
    return {status:'readable',dishes:input.items.filter(item=>item.sourceItemId!=='source-3'||seen.get(item.sourceItemId)>1).map(item=>({...item,extractionStatus:'readable'}))};
  }});
  const job=await h.call('POST','/api/menu/jobs',{venueId:VENUE,mode:'full'});await started;
  let state=(await h.call('GET',`/api/menu/jobs/${job.body.jobId}`)).body;
  assert.equal(state.result.dishes.length,19);assert.equal(state.result.coverage.remaining,19);
  release();state=await h.completed(job.body.jobId);
  assert.equal(state.result.dishes.length,19);assert.equal(state.result.coverage.extracted,19);
  assert.equal(state.result.coverage.remaining,0);assert.equal(state.result.coverageVerified,true);
  assert.equal(seen.size,19);assert.equal(seen.get('source-3'),2);
});

test('provider failure retains every source item as unconfirmed instead of presenting a tiny full menu', async () => {
  const items=Array.from({length:11},(_,i)=>({...dish(`item-${i}`),sourceItemId:`source-${i}`,extractionStatus:'pending'}));
  const assessed=[];
  const h=harness({fetchMenuText:async()=>({...source,items,inventoryComplete:true}),readMenu:async()=>{throw new Error('Gemini unavailable');},assessMenu:async dishes=>{assessed.push(...dishes.map(item=>item.id));return dishes.map(item=>({dishId:item.id,profileStatus:'unknown',reason:'Ingredients, sourcing and cross-contact unknown.',concerns:[]}));}});
  const job=await h.call('POST','/api/menu/jobs',{venueId:VENUE,mode:'full'});
  const result=await h.completed(job.body.jobId);
  assert.equal(result.result.dishes.length,11);assert.equal(result.result.coverage.failed,11);
  assert.equal(result.result.coverageVerified,false);
  assert.ok(result.result.dishes.every(item=>item.extractionStatus==='needs_review'));
  const review=await h.call('POST','/api/menu/reviews',{menuJobId:job.body.jobId,preferences:{diet:'Vegan',allergies:[]}});
  assert.equal(review.status,202);
  const checked=await h.completed(review.body.jobId);
  assert.equal(checked.result.assessments.length,11);
  assert.equal(new Set(assessed).size,11);
});

test('invalid optional Gemini fields do not remove a verified menu item', async t => {
  const key=process.env.GEMINI_API_KEY,model=process.env.GEMINI_MODEL;
  process.env.GEMINI_API_KEY='mock';process.env.GEMINI_MODEL='mock';
  t.after(()=>{if(key===undefined)delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=key;if(model===undefined)delete process.env.GEMINI_MODEL;else process.env.GEMINI_MODEL=model;});
  const anchor={...dish('source-rice'),sourceItemId:'source-rice',name:'Rice',description:'Rice with sauce',evidence:'Rice $5 with sauce'};
  const reader=readerWith(async()=>({text:JSON.stringify({status:'readable',dishes:[{...anchor,description:'Invented description',price:'$999',evidence:'Paraphrased evidence',listedIngredients:['rice','imaginary ingredient']} ]})}));
  const result=await reader.readMenu({restaurant:'Test',text:anchor.evidence,items:[anchor]});
  assert.equal(result.dishes.length,1);assert.equal(result.dishes[0].price,'$5');
  assert.equal(result.dishes[0].description,anchor.description);assert.equal(result.dishes[0].evidence,anchor.evidence);
  assert.deepEqual(result.dishes[0].listedIngredients,['rice']);
});


test('exact repeated source cards count once without marking inventory incomplete', () => {
  const { parseMenuHtml } = require('./menuFetcher');
  const card='<div class="food-item-holder"><h3>Rice</h3><div class="food-price">$5</div><div class="food-item-description">Rice and beans with sauce.</div></div>';
  const source=parseMenuHtml(`<main><div class="food-menu-grid-item-content"><h2>Bowls</h2><div class="food-menu-content">${card}${card}</div></div><p>${'Menu information. '.repeat(10)}</p></main>`,{id:'test',displayName:{text:'Test'}},'https://example.com/menu');
  assert.equal(source.items.length,1);assert.equal(source.sourceCardCount,2);assert.equal(source.inventoryComplete,true);
});

test('successful inventory items survive a failed targeted repair and are reused on retry', async () => {
  const items=[0,1].map(i=>({...dish(`item-${i}`),sourceItemId:`source-${i}`,extractionStatus:'pending'}));
  const attempts=[];let repairFails=true;
  const h=harness({fetchMenuText:async()=>({...source,items,inventoryComplete:true}),readMenu:async input=>{
    attempts.push(input.items.map(item=>item.sourceItemId));
    if(input.items.length===2)return {status:'partial',dishes:[{...input.items[0],extractionStatus:'readable'}]};
    if(repairFails)throw new Error('Gemini temporary failure');
    return {status:'readable',dishes:input.items.map(item=>({...item,extractionStatus:'readable'}))};
  }});
  let job=await h.call('POST','/api/menu/jobs',{venueId:VENUE,mode:'full'});
  let result=await h.completed(job.body.jobId);
  assert.equal(result.result.coverage.extracted,1);assert.equal(result.result.coverage.failed,1);
  repairFails=false;
  job=await h.call('POST','/api/menu/jobs',{venueId:VENUE,mode:'full',refresh:true});
  result=await h.completed(job.body.jobId);
  assert.equal(result.result.coverage.extracted,2);assert.equal(result.result.coverage.failed,0);
  assert.deepEqual(attempts.at(-1),['source-1']);
});


test('partial inventory cache resumes only unfinished items after a backend restart', async () => {
  const cacheDir=await fs.mkdtemp(path.join(os.tmpdir(),'table8-resume-test-'));
  const items=[0,1].map(i=>({...dish(`item-${i}`),sourceItemId:`source-${i}`,extractionStatus:'pending'}));
  try {
    let h=harness({cacheDir,fetchMenuText:async()=>({...source,items,inventoryComplete:true}),readMenu:async input=>{
      if(input.items.length===2)return {status:'partial',dishes:[{...input.items[0],extractionStatus:'readable'}]};
      throw new Error('Gemini unavailable');
    }});
    let job=await h.call('POST','/api/menu/jobs',{venueId:VENUE,mode:'full'});
    let result=await h.completed(job.body.jobId);assert.equal(result.result.coverage.failed,1);
    const requests=[];
    h=harness({cacheDir,fetchMenuText:async()=>({...source,items,inventoryComplete:true}),readMenu:async input=>{
      requests.push(input.items.map(item=>item.sourceItemId));
      return {status:'readable',dishes:input.items.map(item=>({...item,extractionStatus:'readable'}))};
    }});
    job=await h.call('POST','/api/menu/jobs',{venueId:VENUE,mode:'full'});
    result=await h.completed(job.body.jobId);
    assert.equal(result.result.coverage.extracted,2);assert.equal(result.result.coverage.failed,0);
    assert.deepEqual(requests,[['source-1']]);
  } finally {await fs.rm(cacheDir,{recursive:true,force:true});}
});


test('rate-limit retries respect provider cooldown instead of retrying every second', () => {
  const { providerRetryDelay } = require('./menuReader');
  const error={status:429,message:JSON.stringify({error:{details:[{'@type':'type.googleapis.com/google.rpc.RetryInfo',retryDelay:'55s'}]}})};
  assert.ok(providerRetryDelay(error,0)>=55000);
  assert.ok(providerRetryDelay({status:429},1)>=60000);
  assert.ok(providerRetryDelay({status:503},0)<2000);
});


test('completed reviews survive progress and refresh but never cross allergy profiles or changed ingredients', async t => {
  const original=global.sessionStorage;const storage=new Map();
  global.sessionStorage={getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)};
  t.after(()=>global.sessionStorage=original);
  const cache=await import('../src/data/dietaryReviewCache.js?review-cache-test');
  const option={...dish('persisted-rice'),extractionStatus:'readable'};
  const milk={diet:'Hindu non-veg',allergies:['Milk'],allergiesAnswered:true};
  const shellfish={...milk,allergies:['Shellfish']};
  const review={dishId:option.id,profileStatus:'unknown',reason:'Sauce needs review',concerns:[]};
  let notifications=0;const unsubscribe=cache.subscribeReviews(()=>notifications++);
  cache.storeReview(option,milk,review);unsubscribe();
  assert.equal(notifications,1);
  assert.deepEqual(cache.assessmentsFor(cache.getReviewSnapshot(),[{...option,extractionStatus:'pending'}],milk),{});
  assert.deepEqual(cache.assessmentsFor(cache.getReviewSnapshot(),[option],shellfish),{});
  assert.deepEqual(cache.assessmentsFor(cache.getReviewSnapshot(),[{...option,listedIngredients:['butter']}],milk),{});
  const reloaded=await import('../src/data/dietaryReviewCache.js?review-cache-reloaded');
  reloaded.restoreReviews();
  assert.equal(reloaded.assessmentsFor(reloaded.getReviewSnapshot(),[option],milk)[option.id].reason,'Sauce needs review');
});

test('a failed review item preserves successes, continues later batches, and retries only unfinished items', async () => {
  const items=Array.from({length:9},(_,i)=>({...dish(`review-${i}`),sourceItemId:`review-${i}`,extractionStatus:'pending'}));
  const calls=[];
  let fail=true;
  const h=harness({fetchMenuText:async()=>({...source,items,inventoryComplete:true}),readMenu:async input=>({status:'readable',dishes:input.items.map(item=>({...item,extractionStatus:'readable'}))}),assessMenu:async batch=>{
    calls.push(...batch.map(item=>item.id));
    const assessments=batch.filter(item=>!fail||item.id!=='review-1').map(item=>({dishId:item.id,profileStatus:'unknown',reason:'Unknown sourcing and cross-contact',concerns:[]}));
    if(assessments.length!==batch.length){const error=new Error('Invalid evidence for one item');error.assessments=assessments;throw error;}
    return assessments;
  }});
  const menu=await h.call('POST','/api/menu/jobs',{venueId:VENUE,mode:'full'});await h.completed(menu.body.jobId);
  const body={menuJobId:menu.body.jobId,preferences:{diet:'Vegan',allergies:[]}};
  const first=await h.call('POST','/api/menu/reviews',body);
  const partial=await h.completed(first.body.jobId);
  assert.equal(partial.status,'error');assert.equal(partial.result.assessments.length,8);
  assert.deepEqual(partial.result.failedItems.map(item=>item.dishId),['review-1']);
  assert.equal(new Set(calls).size,9);
  fail=false;calls.length=0;
  const retry=await h.call('POST','/api/menu/reviews',body);
  const complete=await h.completed(retry.body.jobId);
  assert.equal(complete.status,'ready');assert.equal(complete.result.assessments.length,9);
  assert.deepEqual(calls,['review-1']);
});

test('review requests assess only requested unfinished dish IDs from the server menu', async () => {
  const assessed=[];
  const h=harness({fetchMenuText:async()=>source,readMenu:async()=>({status:'readable',dishes:[dish('one'),dish('two')]}),assessMenu:async dishes=>{
    assessed.push(...dishes.map(item=>item.id));return dishes.map(item=>({dishId:item.id,profileStatus:'unknown',reason:'Unknown',concerns:[]}));
  }});
  const menu=await h.call('POST','/api/menu/jobs',{venueId:VENUE});await h.completed(menu.body.jobId);
  const body={menuJobId:menu.body.jobId,preferences:{diet:'Vegan',allergies:[]},dishIds:['two']};
  const review=await h.call('POST','/api/menu/reviews',body);await h.completed(review.body.jobId);
  assert.deepEqual(assessed,['two']);
  assert.equal((await h.call('POST','/api/menu/reviews',{...body,dishIds:['invented']})).status,400);
});
