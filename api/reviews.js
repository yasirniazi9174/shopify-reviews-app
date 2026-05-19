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
      .update('timestamp=' + timestamp + API_SECRET)
      .digest('hex');

    const formData = [
      'file=data:' + (resourceType === 'video' ? 'video/mp4' : 'image/jpeg') + ';base64,' + base64Data,
      'api_key=' + API_KEY,
      'timestamp=' + timestamp,
      'signature=' + signature
    ].join('&');

    const options = {
      hostname: 'api.cloudinary.com',
      path: '/v1_1/' + CLOUD_NAME + '/' + resourceType + '/upload',
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
          if (parsed.secure_url) {
            resolve(parsed.secure_url);
          } else {
            resolve(null);
          }
        } catch(e) {
          resolve(null);
        }
      });
    });
    req.on('error', () => resolve(null));
    req.write(formData);
    req.end();
  });
}

function getFile() {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.github.com',
      path: '/repos/' + GITHUB_REPO + '/contents/' + GITHUB_FILE_PATH,
      headers: {
        'Authorization': 'token ' + GITHUB_TOKEN,
        'User-Agent': 'reviews-app'
      }
    };
    https.get(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch(e) { reject(e); }
      });
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
      path: '/repos/' + GITHUB_REPO + '/contents/' + GITHUB_FILE_PATH,
      method: 'PUT',
      headers: {
        'Authorization': 'token ' + GITHUB_TOKEN,
        'User-Agent': 'reviews-app',
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch(e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const fileData = await getFile();
    const sha = fileData.sha;
    const decoded = Buffer.from(fileData.content, 'base64').toString();
    const existing = JSON.parse(decoded);

    if (!existing.reviews) {
      existing.reviews = [];
    }

    if (req.method === 'GET') {
      return res.status(200).json({ reviews: existing.reviews });
    }

    if (req.method === 'POST') {
      let body = req.body;

      // Parse body manually if needed
      if (typeof body === 'string') {
        body = JSON.parse(body);
      }

      const name = body.name;
      const title = body.title;
      const reviewBody = body.body;
      const rating = body.rating;
      const media = body.media || [];

      var uploadedMedia = [];
      for (var i = 0; i < media.length; i++) {
        try {
          var item = media[i];
          var base64 = item.data.split(',')[1];
          var resourceType = item.type === 'video' ? 'video' : 'image';
          var url = await cloudinaryUpload(base64, resourceType);
          if (url) {
            uploadedMedia.push({ url: url, type: item.type });
          }
        } catch(e) {
          console.error('Media skip:', e.message);
        }
      }

      const review = {
        name: name,
        title: title,
        body: reviewBody,
        rating: rating,
        media: uploadedMedia,
        ts: Date.now()
      };

      existing.reviews.push(review);
      await saveFile(existing, sha);

      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch(err) {
    console.error('Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}

handler.config = {
  api: {
    bodyParser: {
      sizeLimit: '20mb'
    }
  }
};

module.exports = handler;
