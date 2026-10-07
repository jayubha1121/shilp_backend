module.exports = async function handler(req, res) {
  const requestPath = new URL(req.url || '/', 'http://localhost').pathname;
  if (requestPath === '/' || requestPath === '/api/health') {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.end(JSON.stringify({ success: true, message: 'Shilp API is running.' }));
  }

  try {
    const { app, connectToDatabase } = require('../src');
    await connectToDatabase();
    return app(req, res);
  } catch (error) {
    console.error('Shilp API initialization failed:', error);
    const message = error.name === 'MongooseServerSelectionError'
      ? 'Unable to reach MongoDB. Check MONGODB_URI and MongoDB network access in Vercel.'
      : 'API initialization failed. Check JWT_SECRET, MONGODB_URI, and the Vercel function logs.';
    return res.status(500).json({
      success: false,
      message,
    });
  }
};
