// Vercel serverless function — POST /api/search-skus
// Body: { retailer, keyword, maxResults?, minPrice?, maxPrice?, inStockOnly? }

import { search } from './_lib/sku-finder.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST only' });
  }
  const { retailer, keyword, maxResults, minPrice, maxPrice, inStockOnly, firstPartyOnly } = req.body || {};
  if (!retailer || !keyword) {
    return res.status(400).json({ error: 'retailer and keyword required' });
  }
  try {
    const items = await search(retailer, keyword, {
      maxResults: maxResults ? Number(maxResults) : 25,
      minPrice: minPrice != null ? Number(minPrice) : undefined,
      maxPrice: maxPrice != null ? Number(maxPrice) : undefined,
      inStockOnly: !!inStockOnly,
      firstPartyOnly: firstPartyOnly !== false,
    });
    res.status(200).json({ retailer, keyword, count: items.length, items });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
}
