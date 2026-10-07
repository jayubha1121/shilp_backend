require('dotenv').config();

const { randomUUID } = require('node:crypto');
const path = require('node:path');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const express = require('express');
const { rateLimit } = require('express-rate-limit');
const helmet = require('helmet');
const multer = require('multer');
const sanitizeHtml = require('sanitize-html');
const mongoose = require('mongoose');
const { authenticate, authenticateOptional, assertAuthConfig, login, logout, register, setupStatus } = require('./auth');
const { archiveProject, createProject, getProject, listProjects, parseProjectDraft, updateProject } = require('./mongo-projects');
const { sanitizeSvg } = require('./sanitize-svg');

const app = express();
const port = Number(process.env.PORT || 8081);
const publicApiUrl = process.env.API_PUBLIC_URL || `http://localhost:${port}`;
const allowedOrigins = (process.env.ADMIN_ORIGIN || 'http://localhost:3000,http://localhost:3001').split(',').map((origin) => origin.trim());
let databaseConnection;

app.disable('x-powered-by');
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

app.get('/', (_req, res) => res.json({ success: true, message: 'Shilp API is running.' }));
app.get('/api/health', (_req, res) => res.json({ success: true }));

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-7', legacyHeaders: false });
const registerLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 5, standardHeaders: 'draft-7', legacyHeaders: false });
app.get('/api/auth/setup', setupStatus);
app.post('/api/auth/register', registerLimiter, register);
app.post('/api/auth/login', loginLimiter, login);
app.post('/api/auth/logout', logout);
app.get('/api/auth/check', authenticate, (req, res) => res.json({ success: true, user: req.admin }));

const imageTypes = new Map([
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/webp', '.webp'],
  ['image/gif', '.gif'],
  ['image/svg+xml', '.svg'],
]);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => callback(null, imageTypes.has(file.mimetype) || path.extname(file.originalname).toLowerCase() === '.svg'),
});

app.post('/api/upload', authenticate, upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'Choose a JPG, PNG, WebP, GIF or SVG image under 8 MB.' });
    const isSvg = req.file.mimetype === 'image/svg+xml' || path.extname(req.file.originalname).toLowerCase() === '.svg';
    const extension = isSvg ? '.svg' : imageTypes.get(req.file.mimetype);
    const contentType = isSvg ? 'image/svg+xml' : req.file.mimetype;
    const filename = `${randomUUID()}${extension}`;
    const bucket = req.app.locals.projectUploads;
    if (!bucket) return res.status(503).json({ success: false, message: 'Image storage is not ready.' });
    let fileBuffer = req.file.buffer;
    if (isSvg) {
      const sanitized = sanitizeSvg(fileBuffer.toString('utf8'));
      if (!sanitized) return res.status(400).json({ success: false, message: 'SVG must contain a valid vector image.' });
      fileBuffer = Buffer.from(sanitized, 'utf8');
    }
    const uploadStream = bucket.openUploadStream(filename, { metadata: { contentType } });
    uploadStream.once('error', next);
    uploadStream.once('finish', () => res.json({ success: true, url: `${publicApiUrl}/api/uploads/${uploadStream.id.toString()}` }));
    uploadStream.end(fileBuffer);
  } catch (error) {
    return next(error);
  }
});

app.get('/api/uploads/:id', async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(404).end();
    const fileId = new mongoose.Types.ObjectId(req.params.id);
    const bucket = req.app.locals.projectUploads;
    const file = await bucket.find({ _id: fileId }).next();
    if (!file) return res.status(404).end();
    res.type(file.metadata?.contentType || 'application/octet-stream');
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    return bucket.openDownloadStream(fileId).on('error', next).pipe(res);
  } catch (error) {
    return next(error);
  }
});

app.get('/api/projects', (req, res, next) => {
  if (req.query.all === 'true') return authenticate(req, res, next);
  return next();
}, async (req, res, next) => {
  try {
    const all = req.query.all === 'true';
    const type = ['commercial', 'residential', 'plotted'].includes(String(req.query.type)) ? String(req.query.type) : undefined;
    const search = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : '';
    const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 200);
    const skip = Math.max(Number(req.query.skip) || 0, 0);
    const result = await listProjects({ type, search, includeInactive: all, skip, limit });
    return res.json({ success: true, ...result });
  } catch (error) {
    return next(error);
  }
});

app.post('/api/projects', authenticate, async (req, res, next) => {
  try {
    const draft = parseProjectDraft(req.body);
    if (!draft) return res.status(400).json({ success: false, message: 'Complete the required project, banner, about, location, brochure, and three update-image fields.' });
    const project = await createProject(draft);
    return res.status(201).json({ success: true, message: 'Project created successfully.', data: project });
  } catch (error) {
    return next(error);
  }
});

app.get('/api/projects/:id', authenticateOptional, async (req, res, next) => {
  try {
    const project = await getProject(req.params.id, true);
    if (!project) return res.status(404).json({ success: false, message: 'Project not found.' });
    if (!project.isActive && !req.admin) return res.status(410).json({ success: false, archived: true, message: 'Project is archived.' });
    return res.json({ success: true, data: project });
  } catch (error) {
    return next(error);
  }
});

app.put('/api/projects/:id', authenticate, async (req, res, next) => {
  try {
    const draft = parseProjectDraft(req.body);
    if (!draft) return res.status(400).json({ success: false, message: 'Complete the required project, banner, about, location, brochure, and three update-image fields.' });
    const project = await updateProject(req.params.id, draft);
    if (!project) return res.status(404).json({ success: false, message: 'Project not found.' });
    return res.json({ success: true, message: 'Project updated successfully.', data: project });
  } catch (error) {
    return next(error);
  }
});

app.delete('/api/projects/:id', authenticate, async (req, res, next) => {
  try {
    const deleted = await archiveProject(req.params.id);
    if (!deleted) return res.status(404).json({ success: false, message: 'Project not found.' });
    return res.json({ success: true, message: 'Project archived.' });
  } catch (error) {
    return next(error);
  }
});

app.use((error, _req, res, _next) => {
  if (error instanceof multer.MulterError) {
    return res.status(400).json({ success: false, message: error.code === 'LIMIT_FILE_SIZE' ? 'Image must be smaller than 8 MB.' : 'Only one image can be uploaded at a time.' });
  }
  console.error(error);
  return res.status(500).json({ success: false, message: 'The request could not be completed.' });
});

async function connectToDatabase() {
  assertAuthConfig();
  if (!process.env.MONGODB_URI) throw new Error('Set MONGODB_URI in the backend environment before starting the API.');

  if (mongoose.connection.readyState === 1) return;
  if (mongoose.connection.readyState === 0) databaseConnection = undefined;
  if (!databaseConnection) {
    databaseConnection = mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 5000,
    })
      .then(() => {
        app.locals.projectUploads = new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: 'projectMedia' });
      })
      .catch((error) => {
        databaseConnection = undefined;
        throw error;
      });
  }
  await databaseConnection;
}

async function start() {
  await connectToDatabase();
  app.listen(port, () => console.log(`Shilp API connected to MongoDB and listening on http://localhost:${port}`));
}

if (require.main === module) {
  start().catch((error) => {
    console.error('Shilp API failed to start:', error.message);
    process.exit(1);
  });
}

module.exports = { app, connectToDatabase };