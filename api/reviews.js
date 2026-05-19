const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO = process.env.GITHUB_REPO;
const GITHUB_FILE_PATH = process.env.GITHUB_FILE_PATH;

const GITHUB_API = `https://api.github.com/repos/${GITHUB_REPO}/contents/${GITHUB_FILE_PATH}`;

async function getReviews() {
  const res = await fetch(GITHUB_API, {
    headers: {
      Authorization: `token ${GITHUB_TOKEN}`,
      Accept: 'application/vnd.github.v3+json',
    },
  });

  if (res.status === 404) {
    return { sha: null, reviews: [] };
  }

  const data = await res.json();
  const content = Buffer.from(data.content, 'base64').toString('utf8');
  try {
    return { sha: data.sha, reviews: JSON.parse(content) };
  } catch {
    return { sha: data.sha, reviews: [] };
  }
}

async function saveReviews(sha, reviews) {
  const content = Buffer.from(JSON.stringify(reviews, null, 2)).toString('base64');

  const body = {
    message: 'Update reviews',
    content,
    ...(sha && { sha }),
  };

  await fetch(GITHUB_API, {
    method: 'PUT',
    headers: {
      Authorization: `token ${GITHUB_TOKEN}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    if (req.method === 'GET') {
      const { reviews } = await getReviews();
      return res.status(200).json({ reviews });
    }

    if (req.method === 'POST') {
      const { name, title, body, rating, media } = req.body;

      if (!name || !title || !body || !rating) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      const { sha, reviews } = await getReviews();

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
      await saveReviews(sha, reviews);

      return res.status(200).json({ success: true, review: newReview });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error', detail: err.message });
  }
}
