const SHOP = process.env.SHOPIFY_SHOP_DOMAIN; // e.g. your-store.myshopify.com
const TOKEN = process.env.SHOPIFY_ADMIN_TOKEN; // Admin API token

const METAFIELD_NAMESPACE = 'reviews_app';
const METAFIELD_KEY = 'all_reviews';

async function getMetafield() {
  const res = await fetch(
    `https://${SHOP}/admin/api/2024-01/metafields.json?namespace=${METAFIELD_NAMESPACE}&key=${METAFIELD_KEY}&owner_resource=shop`,
    {
      headers: {
        'X-Shopify-Access-Token': TOKEN,
        'Content-Type': 'application/json',
      },
    }
  );
  const data = await res.json();
  const mf = data.metafields?.[0];
  if (!mf) return { id: null, reviews: [] };
  try {
    return { id: mf.id, reviews: JSON.parse(mf.value) };
  } catch {
    return { id: mf.id, reviews: [] };
  }
}

async function saveMetafield(id, reviews) {
  const body = {
    metafield: {
      namespace: METAFIELD_NAMESPACE,
      key: METAFIELD_KEY,
      type: 'json',
      value: JSON.stringify(reviews),
      owner_resource: 'shop',
    },
  };

  if (id) {
    // Update existing
    await fetch(`https://${SHOP}/admin/api/2024-01/metafields/${id}.json`, {
      method: 'PUT',
      headers: {
        'X-Shopify-Access-Token': TOKEN,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  } else {
    // Create new
    await fetch(`https://${SHOP}/admin/api/2024-01/metafields.json`, {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': TOKEN,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  }
}

export default async function handler(req, res) {
  // Allow CORS from your Shopify store
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    if (req.method === 'GET') {
      // Return all reviews
      const { reviews } = await getMetafield();
      return res.status(200).json({ reviews });
    }

    if (req.method === 'POST') {
      // Save new review
      const { name, title, body, rating, media } = req.body;

      if (!name || !title || !body || !rating) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      const { id, reviews } = await getMetafield();

      const newReview = {
        id: Date.now(),
        name,
        title,
        body,
        rating: parseInt(rating),
        media: media || [],
        ts: Date.now(),
      };

      reviews.push(newReview);
      await saveMetafield(id, reviews);

      return res.status(200).json({ success: true, review: newReview });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error', detail: err.message });
  }
}
