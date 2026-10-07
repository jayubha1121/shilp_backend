const { app, connectToDatabase } = require('../src');

module.exports = async function handler(req, res) {
  try {
    await connectToDatabase();
    return app(req, res);
  } catch (error) {
    console.error('Shilp API initialization failed:', error);
    return res.status(500).json({
      success: false,
      message: 'API initialization failed. Check the Vercel environment variables and database connection.',
    });
  }
};
