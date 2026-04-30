// Throwaway test: verify Bright Data Web Unlocker (zone dropwatchv2) can now
// reach topps.com after Ron Azu's engineering fix on 2026-04-29.
// DELETE this file after Topps is wired into sku-finder.js properly.

export default async function handler(req, res) {
  const apiKey = process.env.BRIGHTDATA_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'BRIGHTDATA_API_KEY not set' });

  const url = req.query.url || 'https://www.topps.com/';
  const t0 = Date.now();
  try {
    const r = await fetch('https://api.brightdata.com/request', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ zone: 'dropwatchv2', url, format: 'json', country: 'us' }),
    });
    const wrapper = await r.json();
    const ms = Date.now() - t0;
    res.status(200).json({
      url,
      bd_status: wrapper.status_code,
      bd_error: wrapper.headers?.['x-brd-error-code'] || null,
      body_length: (wrapper.body || '').length,
      body_first_300: (wrapper.body || '').substring(0, 300),
      contains_topps_string: (wrapper.body || '').toLowerCase().includes('topps'),
      contains_cloudflare_block: /cloudflare|just a moment|attention required/i.test(wrapper.body || ''),
      latency_ms: ms,
    });
  } catch (e) {
    res.status(500).json({ error: e.message, latency_ms: Date.now() - t0 });
  }
}
