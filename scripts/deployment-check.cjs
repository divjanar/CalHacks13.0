// Public, read-only deployment verification. Never starts a Gemini job.
(async () => {
  const site = 'https://table8.vip';
  const response = await fetch(site, { signal: AbortSignal.timeout(20000) });
  const html = await response.text();
  const asset = html.match(/src="([^"]+\.js)"/);
  const js = asset ? await (await fetch(new URL(asset[1], site))).text() : '';
  console.log(JSON.stringify({ site, status: response.status, asset: asset?.[1], localReaderUI: js.includes('Checked locally against your saved dining needs'), correctAPI: js.includes('https://table8-api.onrender.com') }));
  const health = await fetch('https://table8-api.onrender.com/api/health', {
    headers: { Origin: site }, signal: AbortSignal.timeout(50000),
  });
  console.log(JSON.stringify({ backend: health.status, cors: health.headers.get('access-control-allow-origin'), health: await health.json() }));
})().catch(error => { console.error(error.message); process.exitCode = 1; });
