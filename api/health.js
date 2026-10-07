module.exports = function handler(_req, res) {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify({ success: true, message: 'Shilp API is running.' }));
};
