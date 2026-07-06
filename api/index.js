// Vercel serverless entry. The app lazily initializes the DB on first query,
// so we just export it; every request flows through the rewrite in vercel.json.
module.exports = require('../server.js');
