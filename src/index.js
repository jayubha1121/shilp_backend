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
const {
  archiveProjectTreeItem,
  createProjectTreeItem,
  getProjectTreeItem,
  listProjectTreeItems,
  parseProjectTreeDraft,
  updateProjectTreeItem,
} = require('./mongo-project-tree');
const {
  archiveJobOpening,
  createJobOpening,
  listJobOpenings,
  parseJobOpeningDraft,
  updateJobOpening,
} = require('./mongo-job-openings');
const { bannerPages, listPageBanners, parsePageBannerDraft, savePageBanner } = require('./mongo-page-banners');
const { sanitizeSvg } = require('./sanitize-svg');
const { createBlog, deleteBlog, getBlogBySlug, listBlogs, parseBlogDraft, updateBlog } = require('./mongo-blogs');

const app = express();
const port = Number(process.env.PORT || 8081);
const isProductionDeployment = Boolean(
  process.env.VERCEL ||
  process.env.VERCEL_URL ||
  process.env.VERCEL_PROJECT_PRODUCTION_URL ||
  process.env.NODE_ENV === 'production',
);
const vercelHost = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL || 'shilp-backend-dusky.vercel.app';
const productionApiUrl = isProductionDeployment ? `https://${vercelHost}` : '';
const configuredApiUrl = process.env.API_PUBLIC_URL?.trim();
const publicApiUrl = (configuredApiUrl && !/^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?/i.test(configuredApiUrl)
  ? configuredApiUrl
  : isProductionDeployment
    ? productionApiUrl
    : configuredApiUrl || `http://localhost:${port}`).replace(/\/+$/, '');
function publicizeUploadedMedia(value) {
  if (typeof value !== 'string') return value;
  try {
    const url = new URL(value);
    if (!['localhost', '127.0.0.1'].includes(url.hostname) || !url.pathname.startsWith('/api/uploads/')) return value;
    return `${publicApiUrl}${url.pathname}${url.search}`;
  } catch {
    return value;
  }
}
function publicizePageBanner(banner) {
  return {
    ...banner,
    desktopImage: publicizeUploadedMedia(banner.desktopImage),
    mobileImage: publicizeUploadedMedia(banner.mobileImage),
  };
}
const defaultOrigins = [
  'https://shilp-admin-omega.vercel.app',
  'https://shilp-website.vercel.app',
  ...(!isProductionDeployment ? ['http://localhost:3000', 'http://localhost:3001'] : []),
];
const allowedOrigins = [...new Set([
  ...defaultOrigins,
  ...(process.env.ADMIN_ORIGIN || '').split(','),
].map((origin) => origin.trim()).filter(Boolean))];
let databaseConnection;

app.disable('x-powered-by');
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.set('json replacer', (_key, value) => {
  if (typeof value !== 'string') return value;
  return value.replace(/^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?(?=\/api\/uploads\/)/, publicApiUrl);
});

app.get('/', (_req, res) => res.json({ success: true, message: 'Shilp API is running.' }));
app.get('/api/health', (_req, res) => res.json({ success: true }));
app.use((_req, _res, next) => {
  connectToDatabase().then(() => next(), next);
});

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

app.get('/api/project-tree', (req, res, next) => {
  if (req.query.all === 'true') return authenticate(req, res, next);
  return next();
}, async (req, res, next) => {
  try {
    const all = req.query.all === 'true';
    const type = ['commercial', 'residential', 'plotted'].includes(String(req.query.type)) ? String(req.query.type) : undefined;
    const year = typeof req.query.year === 'string' && /^[12]\d{3}$/.test(req.query.year) ? req.query.year : undefined;
    const search = typeof req.query.search === 'string' ? req.query.search.trim().slice(0, 120) : '';
    const status = all && ['active', 'archived'].includes(String(req.query.status)) ? String(req.query.status) : undefined;
    const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 200);
    const skip = Math.max(Number(req.query.skip) || 0, 0);
    const result = await listProjectTreeItems({ search, year, type, status, includeInactive: all, skip, limit });
    return res.json({ success: true, ...result });
  } catch (error) {
    return next(error);
  }
});

app.post('/api/project-tree', authenticate, async (req, res, next) => {
  try {
    const draft = parseProjectTreeDraft(req.body);
    if (!draft) return res.status(400).json({ success: false, message: 'Enter a valid year, title, location, project type, image, and image description.' });
    const item = await createProjectTreeItem(draft);
    return res.status(201).json({ success: true, message: 'Project tree item created.', data: item });
  } catch (error) {
    return next(error);
  }
});

app.get('/api/project-tree/:id', authenticateOptional, async (req, res, next) => {
  try {
    const item = await getProjectTreeItem(req.params.id, Boolean(req.admin));
    if (!item) return res.status(404).json({ success: false, message: 'Project tree item not found.' });
    return res.json({ success: true, data: item });
  } catch (error) {
    return next(error);
  }
});

app.put('/api/project-tree/:id', authenticate, async (req, res, next) => {
  try {
    const draft = parseProjectTreeDraft(req.body);
    if (!draft) return res.status(400).json({ success: false, message: 'Enter a valid year, title, location, project type, image, and image description.' });
    const item = await updateProjectTreeItem(req.params.id, draft);
    if (!item) return res.status(404).json({ success: false, message: 'Project tree item not found.' });
    return res.json({ success: true, message: 'Project tree item updated.', data: item });
  } catch (error) {
    return next(error);
  }
});

app.delete('/api/project-tree/:id', authenticate, async (req, res, next) => {
  try {
    const archived = await archiveProjectTreeItem(req.params.id);
    if (!archived) return res.status(404).json({ success: false, message: 'Project tree item not found.' });
    return res.json({ success: true, message: 'Project tree item archived.' });
  } catch (error) {
    return next(error);
  }
});

app.get('/api/job-openings', (req, res, next) => {
  if (req.query.all === 'true') return authenticate(req, res, next);
  return next();
}, async (req, res, next) => {
  try {
    const all = req.query.all === 'true';
    const search = typeof req.query.search === 'string' ? req.query.search.trim().slice(0, 120) : '';
    const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 200);
    const skip = Math.max(Number(req.query.skip) || 0, 0);
    const result = await listJobOpenings({ search, includeInactive: all, skip, limit });
    return res.json({ success: true, ...result });
  } catch (error) {
    return next(error);
  }
});

app.post('/api/job-openings', authenticate, async (req, res, next) => {
  try {
    const draft = parseJobOpeningDraft(req.body);
    if (!draft) return res.status(400).json({ success: false, message: 'Enter a valid job title, job type, and experience.' });
    const opening = await createJobOpening(draft);
    return res.status(201).json({ success: true, message: 'Job opening created.', data: opening });
  } catch (error) {
    return next(error);
  }
});

app.put('/api/job-openings/:id', authenticate, async (req, res, next) => {
  try {
    const draft = parseJobOpeningDraft(req.body);
    if (!draft) return res.status(400).json({ success: false, message: 'Enter a valid job title, job type, and experience.' });
    const opening = await updateJobOpening(req.params.id, draft);
    if (!opening) return res.status(404).json({ success: false, message: 'Job opening not found.' });
    return res.json({ success: true, message: 'Job opening updated.', data: opening });
  } catch (error) {
    return next(error);
  }
});

app.delete('/api/job-openings/:id', authenticate, async (req, res, next) => {
  try {
    const archived = await archiveJobOpening(req.params.id);
    if (!archived) return res.status(404).json({ success: false, message: 'Job opening not found.' });
    return res.json({ success: true, message: 'Job opening archived.' });
  } catch (error) {
    return next(error);
  }
});

app.get('/api/blogs', (req, res, next) => {
  if (req.query.all === 'true') return authenticate(req, res, next);
  return next();
}, async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 200);
    const skip = Math.max(Number(req.query.skip) || 0, 0);
    const result = await listBlogs({ includeUnpublished: req.query.all === 'true', skip, limit });
    return res.json(result);
  } catch (error) { return next(error); }
});
app.post('/api/blogs', authenticate, async (req, res, next) => {
  try {
    const draft = parseBlogDraft(req.body);
    if (!draft) return res.status(400).json({ success: false, message: 'Enter a valid blog title, slug, HTML description, author, ISO date, status, images, and points.' });
    return res.status(201).json({ data: await createBlog(draft) });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ success: false, message: 'A blog with that slug already exists.' });
    return next(error);
  }
});
app.get('/api/blogs/:slug', authenticateOptional, async (req, res, next) => {
  try {
    const blog = await getBlogBySlug(req.params.slug, Boolean(req.admin));
    if (!blog) return res.status(404).json({ success: false, message: 'Blog not found.' });
    return res.json({ data: blog });
  } catch (error) { return next(error); }
});
app.put('/api/blogs/:id', authenticate, async (req, res, next) => {
  try {
    const draft = parseBlogDraft(req.body);
    if (!draft) return res.status(400).json({ success: false, message: 'Enter a valid blog title, slug, HTML description, author, ISO date, status, images, and points.' });
    const blog = await updateBlog(req.params.id, draft);
    if (!blog) return res.status(404).json({ success: false, message: 'Blog not found.' });
    return res.json({ data: blog });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ success: false, message: 'A blog with that slug already exists.' });
    return next(error);
  }
});
app.delete('/api/blogs/:id', authenticate, async (req, res, next) => {
  try {
    if (!await deleteBlog(req.params.id)) return res.status(404).json({ success: false, message: 'Blog not found.' });
    return res.json({ success: true, message: 'Blog deleted.' });
  } catch (error) { return next(error); }
});

app.get('/api/page-banners', async (_req, res, next) => {
  try {
    const banners = (await listPageBanners()).map(publicizePageBanner);
    return res.json({ success: true, data: banners });
  } catch (error) {
    return next(error);
  }
});

app.put('/api/page-banners/:page', authenticate, async (req, res, next) => {
  try {
    if (!bannerPages.includes(req.params.page)) {
      return res.status(404).json({ success: false, message: 'Banner page not found.' });
    }
    const draft = parsePageBannerDraft(req.body);
    if (!draft) {
      return res.status(400).json({ success: false, message: 'Upload at least one valid desktop or mobile banner image.' });
    }
    const banner = publicizePageBanner(await savePageBanner(req.params.page, draft));
    return res.json({ success: true, message: 'Page banner saved.', data: banner });
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

if (require.main === module && !process.env.VERCEL) {
  start().catch((error) => {
    console.error('Shilp API failed to start:', error.message);
    process.exit(1);
  });
}

module.exports = app;
module.exports.connectToDatabase = connectToDatabase;