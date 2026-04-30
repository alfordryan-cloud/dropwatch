// Vercel serverless function — POST /api/poke-alerts-ingest
//
// Receives parsed Discord alerts from the poke-alerts-bot worker and upserts
// them into the Supabase products table (the same table the watchlist UI
// reads). Authenticated via shared secret in the `x-ingest-key` header
// matching INGEST_SECRET env var.
//
// Body shape (from workers/poke-alerts-bot/index.js):
//   { retailer, sku, name, url, price, quantity, raw_text, source,
//     discord_channel_id, discord_message_id, discord_message_ts }

import { createClient } from '@supabase/supabase-js';

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
  if (req.headers['x-ingest-key'] !== ingestSecret) {
    return res.status(401).json({ error: 'invalid ingest key' });
  }

  const b = req.body || {};
  if (!b.retailer || !b.sku) return res.status(400).json({ error: 'retailer and sku required' });

  let supabase;
  try { supabase = db(); }
  catch (e) { return res.status(500).json({ error: e.message }); }

  // Upsert by (retailer, sku) — re-firing the same alert is idempotent and
  // refreshes is_active=true so it shows in the watchlist.
  const fields = {
    retailer: b.retailer,
    sku: String(b.sku),
    name: b.name || null,
    url: b.url || null,
    last_price: b.price != null ? Number(b.price) : null,
    target_price: null,                    // user sets via dashboard before deploy
    max_quantity: b.quantity != null ? Number(b.quantity) : null,
    is_active: true,
    status: 'detected',                    // came from a stock alert
    in_stock: true,                        // Poke Alerts only fires on stock
    last_in_stock_at: new Date().toISOString(),
    last_checked_at: new Date().toISOString(),
    notes: `from poke-alerts ch:${b.discord_channel_id} msg:${b.discord_message_id}${b.raw_text ? '\n---\n' + String(b.raw_text).slice(0, 800) : ''}`,
  };
  if (b.retailer === 'target') fields.tcin = String(b.sku);

  try {
    const { data: existing } = await supabase
      .from('products')
      .select('id')
      .eq('retailer', fields.retailer)
      .eq('sku', fields.sku)
      .maybeSingle();

    if (existing?.id) {
      const { data, error } = await supabase
        .from('products')
        .update(fields)
        .eq('id', existing.id)
        .select()
        .single();
      if (error) throw error;
      return res.status(200).json({ updated: true, id: data.id, source: 'poke-alerts' });
    }

    const { data, error } = await supabase
      .from('products')
      .insert(fields)
      .select()
      .single();
    if (error) throw error;
    return res.status(201).json({ created: true, id: data.id, source: 'poke-alerts' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
