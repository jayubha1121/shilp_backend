const mongoose = require('mongoose');
const sanitizeHtml = require('sanitize-html');
const { Schema } = mongoose;
const richTextOptions = {
  allowedTags: ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'a', 'code', 'pre', 'hr'],
  allowedAttributes: { a: ['href', 'title', 'target', 'rel'] },
  allowedSchemes: ['http', 'https', 'mailto'],
  allowedSchemesByTag: { a: ['http', 'https', 'mailto'] },
  allowProtocolRelative: false,
  transformTags: {
    a: (_tagName, attributes) => ({ tagName: 'a', attribs: { ...attributes, ...(attributes.target === '_blank' ? { rel: 'noopener noreferrer' } : {}) } }),
  },
};
const pointSchema = new Schema({
  title: { type: String, required: true, maxlength: 180 },
  subtitle: { type: String, default: '', maxlength: 300 },
  content: { type: String, default: '', maxlength: 50000 },
  imageUrl: { type: String, default: '', maxlength: 1000 },
  imageAlt: { type: String, default: '', maxlength: 240 },
}, { _id: false });
const blogSchema = new Schema({
  title: { type: String, required: true, maxlength: 200 },
  slug: { type: String, required: true, maxlength: 200, unique: true, index: true },
  description: { type: String, required: true, maxlength: 100000 },
  author: { type: String, required: true, maxlength: 120 },
  date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
  status: { type: String, required: true, enum: ['draft', 'published'], default: 'draft', index: true },
  imageUrl: { type: String, required: true, maxlength: 1000 },
  imageAlt: { type: String, required: true, maxlength: 240 },
  points: { type: [pointSchema], default: [] },
}, { timestamps: true, versionKey: false });
const Blog = mongoose.models.Blog || mongoose.model('Blog', blogSchema);
function text(value, maxLength) { return typeof value === 'string' ? value.trim().slice(0, maxLength) : ''; }
function safeImage(value) {
  const image = text(value, 1000);
  if (!image) return '';
  if (image.startsWith('/') && !image.startsWith('//') && !image.includes('..')) return image;
  try {
    const url = new URL(image);
    return url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)) ? image : '';
  } catch { return ''; }
}
function isoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + 'T00:00:00.000Z');
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}
function parseBlogDraft(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (['title', 'slug', 'description', 'author', 'date', 'status', 'imageUrl', 'imageAlt'].some((key) => value[key] !== undefined && typeof value[key] !== 'string')) return null;
  if (value.points !== undefined && !Array.isArray(value.points)) return null;
  const title = text(value.title, 200);
  const slug = text(value.slug, 200);
  const description = sanitizeHtml(typeof value.description === 'string' ? value.description : '', richTextOptions).trim();
  const author = text(value.author, 120);
  const date = value.date;
  const status = value.status === undefined ? 'draft' : value.status;
  const rawImageUrl = text(value.imageUrl, 1000);
  const imageUrl = rawImageUrl ? safeImage(rawImageUrl) : '';
  const imageAlt = text(value.imageAlt, 240);
  if (!title || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || !description || !author || !isoDate(date) || !['draft', 'published'].includes(status) || !rawImageUrl || !imageUrl || !imageAlt) return null;
  const points = [];
  for (const point of value.points || []) {
    if (!point || typeof point !== 'object' || Array.isArray(point) || ['title', 'subtitle', 'content'].some((key) => typeof point[key] !== 'string') || ['imageUrl', 'imageAlt'].some((key) => point[key] !== undefined && typeof point[key] !== 'string')) return null;
    const pointTitle = text(point.title, 180);
    const pointSubtitle = text(point.subtitle, 300);
    const content = sanitizeHtml(typeof point.content === 'string' ? point.content : '', richTextOptions).slice(0, 50000);
    const rawPointImage = text(point.imageUrl, 1000);
    const pointImageUrl = rawPointImage ? safeImage(rawPointImage) : '';
    const pointImageAlt = text(point.imageAlt, 240);
    if (!pointTitle || (rawPointImage && !pointImageUrl)) return null;
    points.push({ title: pointTitle, subtitle: pointSubtitle, content, imageUrl: pointImageUrl, imageAlt: pointImageAlt });
  }
  return { title, slug, description: description.slice(0, 100000), author, date, status, imageUrl, imageAlt, points };
}
function serialize(blog) {
  const result = blog.toObject();
  result.description = sanitizeHtml(result.description, richTextOptions);
  result.points = (result.points || []).map((point) => ({ ...point, content: sanitizeHtml(point.content || '', richTextOptions) }));
  return { ...result, id: result._id.toString(), _id: undefined };
}
async function listBlogs({ includeUnpublished = false, skip = 0, limit = 100 } = {}) {
  const query = includeUnpublished ? {} : { status: 'published' };
  const [blogs, total] = await Promise.all([Blog.find(query).sort({ date: -1, createdAt: -1 }).skip(skip).limit(limit), Blog.countDocuments(query)]);
  return { data: blogs.map(serialize), total };
}
async function getBlogBySlug(slug, includeUnpublished = false) {
  const query = { slug };
  if (!includeUnpublished) query.status = 'published';
  const blog = await Blog.findOne(query);
  return blog ? serialize(blog) : null;
}
async function createBlog(draft) { return serialize(await Blog.create(draft)); }
async function updateBlog(id, draft) {
  if (!mongoose.isValidObjectId(id)) return null;
  const blog = await Blog.findByIdAndUpdate(id, draft, { new: true, runValidators: true });
  return blog ? serialize(blog) : null;
}
async function deleteBlog(id) {
  if (!mongoose.isValidObjectId(id)) return false;
  const blog = await Blog.findByIdAndDelete(id);
  return Boolean(blog);
}
module.exports = { createBlog, deleteBlog, getBlogBySlug, listBlogs, parseBlogDraft, updateBlog };
