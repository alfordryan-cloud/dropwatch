// Vercel serverless function — POST /api/poke-alerts-webhook?retailer=<r>&key=<secret>
//
// Receives Discord-style webhook payloads (typical fields: content, embeds[],
// channel_id) and ingests them into dropwatch's products table.
//
// Used when we can't run our own bot in Poke Alerts' server (Ryan isn't a
// server admin), so Poke Alerts admins set up a forwarder on their side
// that POSTs each retailer-channel message to this URL with retailer scope
// in the query string.
//
// Auth: ?key=<INGEST_SECRET>. We use query-string auth (not header) because
// generic Discord forwarder tools often only let you set the URL, not
// custom headers.
//
// Body shape (Discord-compatible — ignores fields we don't use):
//   {
//     "content": "raw text",
//     "embeds": [{ "title": "...", "url": "...", "description": "...",
//                  "fields": [{"name":"SKU","value":"19283656289"}, ...] }],
//     "channel_id": "...", "id": "..."
//   }
//
// To configure on Poke Alerts side, give them ONE URL per retailer:
//   https://dropwatch-ashen.vercel.app/api/poke-alerts-webhook?retailer=walmart&key=<INGEST_SECRET>
//   https://dropwatch-ashen.vercel.app/api/poke-alerts-webhook?retailer=target&key=...
//   etc.

import { createClient } from '@supabase/supabase-js';

// Reuse the regex parsers we built for the Discord bot. Vercel serverless
// can import from anywhere in the repo, so we inline minimal parser logic
// here rather than depending on workers/poke-alerts-bot/parsers.js (which
// lives in the dropwatch-engine repo, not this one).

function extractSkuFromUrl(retailer, url) {
  if (!url) return null;
  if (retailer === 'walmart') return url.match(/walmart\.com\/ip\/(?:[^/]+\/)?(\d+)/i)?.[1] || null;
  if (retailer === 'target') return url.match(/target\.com\/p\/[^/]*\/-?\/?A-(\d+)/i)?.[1] || null;
  if (retailer === 'bestbuy') return url.match(/skuId=(\d+)/i)?.[1]
    || url.match(/bestbuy\.com\/site\/[^/]+\/(\d+)\.p/i)?.[1] || null;
  if (retailer === 'costco') return url.match(/costco\.com\/[^/]+\.product\.(\d+)/i)?.[1]
    || url.match(/costco\.com\/.*-(\d+)\.html/i)?.[1] || null;
  if (retailer === 'samsclub') return url.match(/samsclub\.com\/p\/[^/]+\/P?(\d+)/i)?.[1] || null;
  if (retailer === 'topps') return url.match(/topps\.com\/products\/([a-zA-Z0-9_\-%]+)/i)?.[1] || null;
  return null;
}

function findUrl(text, hostMatch) {
  const re = new RegExp(`https?://[^\\s)]*${hostMatch}[^\\s)]*`, 'i');
  return text.match(re)?.[0]?.replace(/[.,;:!?]+$/, '') || null;
}

function parseDiscordPayload(retailer, body) {
  const hostMap = {
    walmart: 'walmart\\.com',
    target: 'target\\.com',
    bestbuy: 'bestbuy\\.com',
    costco: 'costco\\.com',
    samsclub: 'samsclub\\.com',
    topps: 'topps\\.com',
  };
  const hostRe = hostMap[retailer];
  if (!hostRe) return null;

  // Build a flat text blob from content + all embed fields
  const parts = [body.content || ''];
  let embedTitle = null;
  let embedUrl = null;
  for (const e of body.embeds || []) {
    if (e.title) { parts.push(`TITLE: ${e.title}`); embedTitle = embedTitle || e.title; }
    if (e.description) parts.push(e.description);
    if (e.url) { parts.push(`URL: ${e.url}`); embedUrl = embedUrl || e.url; }
    for (const f of e.fields || []) parts.push(`${f.name}: ${f.value}`);
  }
  const text = parts.join('\n').slice(0, 4000);
  if (!text.trim()) return null;

  const url = embedUrl && new RegExp(hostRe, 'i').test(embedUrl) ? embedUrl : findUrl(text, hostRe);
  const sku = extractSkuFromUrl(retailer, url);
  if (!sku) return null;

  const priceMatch = text.match(/\$\s*(\d{1,5}(?:\.\d{2})?)/);
  const limitMatch = text.match(/limit[:\s]+(\d+)/i) || text.match(/max[:\s]+(\d+)/i);
  const name = embedTitle || (text.split('\n').find(l => l.trim() && !/^(URL:|TITLE:|.*\$\d)/.test(l.trim()))?.trim().slice(0, 200)) || null;

  return {
    sku,
    url,
    name,
    price: priceMatch ? Number(priceMatch[1]) : null,
    quantity: limitMatch ? Number(limitMatch[1]) : null,
    raw_text: text,
    discord_channel_id: body.channel_id || null,
    discord_message_id: body.id || null,
  };
}

function db() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL or SUPABASE_SERVICE_KEY not set');
  return createClient(url, key);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const ingestSecret = process.env.INGEST_SECRET;
  if (!ingestSecret) return res.status(500).json({ error: 'INGEST_SECRET not set on server' });

  const key = (req.query.key || req.headers['x-ingest-key'] || '').trim();
  if (key !== ingestSecret) return res.status(401).json({ error: 'invalid key' });

  const retailer = (req.query.retailer || '').toLowerCase().trim();
  if (!retailer) return res.status(400).json({ error: 'retailer query param required' });

  const parsed = parseDiscordPayload(retailer, req.body || {});
  if (!parsed || !parsed.sku) {
    return res.status(200).json({ skipped: true, reason: 'could not extract SKU' });
  }

  let supabase;
  try { supabase = db(); }
  catch (e) { return res.status(500).json({ error: e.message }); }

  const fields = {
    retailer,
    sku: String(parsed.sku),
    name: parsed.name || null,
    url: parsed.url || null,
    last_price: parsed.price != null ? Number(parsed.price) : null,
    target_price: null,
    max_quantity: parsed.quantity != null ? Number(parsed.quantity) : null,
    is_active: true,
    status: 'detected',
    in_stock: true,
    last_in_stock_at: new Date().toISOString(),
    last_checked_at: new Date().toISOString(),
    notes: `via webhook ch:${parsed.discord_channel_id || '-'} msg:${parsed.discord_message_id || '-'}\n---\n${parsed.raw_text.slice(0, 800)}`,
  };
  if (retailer === 'target') fields.tcin = String(parsed.sku);

  try {
    const { data: existing } = await supabase
      .from('products')
      .select('id')
      .eq('retailer', fields.retailer)
      .eq('sku', fields.sku)
      .maybeSingle();

    if (existing?.id) {
      const { data, error } = await supabase
        .from('products').update(fields).eq('id', existing.id).select().single();
      if (error) throw error;
      return res.status(200).json({ updated: true, id: data.id, source: 'webhook' });
    }
    const { data, error } = await supabase
      .from('products').insert(fields).select().single();
    if (error) throw error;
    return res.status(201).json({ created: true, id: data.id, source: 'webhook' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
