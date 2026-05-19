const https = require('https');
const crypto = require('crypto');

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO = process.env.GITHUB_REPO;
const GITHUB_FILE_PATH = process.env.GITHUB_FILE_PATH || 'reviews/reviews.json';
const CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME;
const API_KEY = process.env.CLOUDINARY_API_KEY;
const API_SECRET = process.env.CLOUDINARY_API_SECRET;

function cloudinaryUpload(base64Data, resourceType) {
  return new Promise((resolve, reject) => {
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = crypto
      .createHash('sha1')
      .update(`timestamp=${timestamp}${API_SECRET}`)
      .digest('hex');

    const formData = [
      `file=data:${resourceType === 'video' ? 'video/mp4' : 'image/jpeg'};base64,${base64Data}`,
      `api_key=${API_KEY}`,
      `timestamp=${timestamp}`,
      `signature=${signature}`
    ].join('&');

    const options = {
      hostname: 'api.cloudinary.com',
      path: `/v1_1/${CLOUD_NAME}/${resourceType}/upload`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(formData)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed.secure_url);
        } catch(e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.write(formData);
    req.end();
  });
}

function getFile() {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.github.com',
      path: `/repos/${GITHUB_REPO}/contents/${GITHUB_FILE_PATH}`,
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'User-Agent': 'reviews-app'
      }
    };
    https.get(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
  });
}

function saveFile(content, sha) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      message: 'Add review',
      content: Buffer.from(JSON.stringify(content)).toString('base64'),
      sha: sha
    });
    const options = {
      hostname: 'api.github.com',
      path: `/repos/${GITHUB_REPO}/contents/${GITHUB_FILE_PATH}`,
      method: 'PUT',
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'User-Agent': 'reviews-app',
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const fileData = await getFile();
    const sha = fileData.sha;
    const existing = JSON.parse(Buffer.from(fileData.content, 'base64').toString());

    if (req.method === 'GET') {
      return res.status(200).json(existing);
    }

    if (req.method === 'POST') {
      const { name, title, body, rating, media } = req.body;

      // Upload media to Cloudinary
      var uploadedMedia = [];
      if (media && media.length > 0) {
        for (var i = 0; i < media.length; i++) {
          var item = media[i];
          var base64 = item.data.split(',')[1];
          var resourceType = item.type === 'video' ? 'video' : 'image';
          var url = await cloudinaryUpload(base64, resourceType);
          uploadedMedia.push({ url: url, type: item.type });
        }
      }

      const review = {
        name, title, body, rating,
        media: uploadedMedia,
        ts: Date.now()
      };

      existing.reviews.push(review);
      await saveFile(existing, sha);

      return res.status(200).json({ success: true });
    }

  } catch(err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
};
