// Vercel serverless function — POST /api/lookup-sku
// Body: { url } OR { retailer, sku }

import { lookup } from './_lib/sku-finder.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST only' });
  }
  const { retailer, sku, url } = req.body || {};
  try {
    const item = await lookup({ retailer, sku, url });
    res.status(200).json(item);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
}
