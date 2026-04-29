// Vercel serverless function — /api/watchlist (CRUD)
//
// Methods:
//   GET    /api/watchlist                 → list all watchlist rows (newest first)
//   POST   /api/watchlist                 → add row (body: full product fields)
//   PATCH  /api/watchlist?id=<uuid>       → update row (body: partial fields)
//   DELETE /api/watchlist?id=<uuid>       → soft-delete (sets is_active=false)
//
// Uses the existing `products` table in Supabase. is_active=true means
// "currently watching"; is_active=false means archived/removed.

import { createClient } from '@supabase/supabase-js';

function db() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL or SUPABASE_SERVICE_KEY not set');
  return createClient(url, key);
}

// Whitelist of writable columns. Anything not in this list is dropped from
// inbound bodies — protects against accidental writes to internal fields
// (id, created_at, last_checked_at, etc.).
const WRITABLE = new Set([
  'sku', 'name', 'retailer', 'tcin', 'url', 'image_url',
  'target_price', 'max_quantity', 'is_active', 'status',
  'in_stock', 'last_price', 'notes', 'offer_id', 'pid',
]);

function pickWritable(body) {
  const out = {};
  for (const k of Object.keys(body || {})) {
    if (WRITABLE.has(k) && body[k] !== undefined) out[k] = body[k];
  }
  return out;
}

export default async function handler(req, res) {
  let supabase;
  try { supabase = db(); }
  catch (e) { return res.status(500).json({ error: e.message }); }

  try {
    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('products')
        .select('id, retailer, sku, tcin, name, url, image_url, target_price, max_quantity, is_active, in_stock, last_price, status, last_checked_at, last_in_stock_at, notes, created_at, updated_at')
        .eq('is_active', true)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return res.status(200).json({ count: (data || []).length, items: data || [] });
    }

    if (req.method === 'POST') {
      const fields = pickWritable(req.body);
      if (!fields.retailer || !fields.sku) {
        return res.status(400).json({ error: 'retailer and sku required' });
      }
      // Default values
      if (fields.is_active === undefined) fields.is_active = true;
      if (!fields.status) fields.status = 'watching';
      if (fields.tcin === undefined && fields.retailer === 'target') fields.tcin = fields.sku;

      // Upsert by (retailer, sku) so re-adding the same product just refreshes it.
      const { data: existing } = await supabase
        .from('products')
        .select('id')
        .eq('retailer', fields.retailer)
        .eq('sku', fields.sku)
        .maybeSingle();

      if (existing?.id) {
        const { data, error } = await supabase
          .from('products')
          .update({ ...fields, is_active: true })
          .eq('id', existing.id)
          .select()
          .single();
        if (error) throw error;
        return res.status(200).json({ updated: true, item: data });
      }

      const { data, error } = await supabase
        .from('products')
        .insert(fields)
        .select()
        .single();
      if (error) throw error;
      return res.status(201).json({ created: true, item: data });
    }

    if (req.method === 'PATCH') {
      const id = req.query?.id || req.body?.id;
      if (!id) return res.status(400).json({ error: 'id required (query or body)' });
      const fields = pickWritable(req.body);
      const { data, error } = await supabase
        .from('products')
        .update(fields)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return res.status(200).json({ updated: true, item: data });
    }

    if (req.method === 'DELETE') {
      const id = req.query?.id;
      if (!id) return res.status(400).json({ error: 'id required (?id=...)' });
      // Soft delete to preserve history.
      const { data, error } = await supabase
        .from('products')
        .update({ is_active: false, status: 'removed' })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return res.status(200).json({ removed: true, item: data });
    }

    return res.status(405).json({ error: `${req.method} not allowed` });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
