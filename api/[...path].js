module.exports = async function handler(req, res) {
  try {
    const app = require('../src');
    const { connectToDatabase } = app;
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
