const mongoose = require('mongoose');

const { Schema } = mongoose;

const projectTreeItemSchema = new Schema({
  year: { type: String, required: true, match: /^[12]\d{3}$/, maxlength: 4 },
  title: { type: String, required: true, maxlength: 120 },
  location: { type: String, required: true, maxlength: 160 },
  type: { type: String, required: true, enum: ['residential', 'commercial', 'plotted'] },
  image: { type: String, required: true, maxlength: 1000 },
  imageAlt: { type: String, required: true, maxlength: 240 },
  isActive: { type: Boolean, default: true },
}, {
  timestamps: true,
  versionKey: false,
});

const ProjectTreeItem = mongoose.models.ProjectTreeItem || mongoose.model('ProjectTreeItem', projectTreeItemSchema);

function string(value, length) {
  return typeof value === 'string' ? value.trim().slice(0, length) : '';
}

function safeImage(value) {
  const image = string(value, 1000);
  if (image.startsWith('/') && !image.startsWith('//') && !image.includes('..')) return image;
  try {
    const url = new URL(image);
    return url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))
      ? image
      : '';
  } catch {
    return '';
  }
}

function parseProjectTreeDraft(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const year = string(value.year, 4);
  const title = string(value.title, 120);
  const location = string(value.location, 160);
  const type = value.type;
  const image = safeImage(value.image);
  const imageAlt = string(value.imageAlt, 240);

  if (typeof value.year !== 'string' || value.year.trim() !== year || !/^[12]\d{3}$/.test(year) ||
      typeof value.isActive !== 'undefined' && typeof value.isActive !== 'boolean' || !title || !location ||
      !['residential', 'commercial', 'plotted'].includes(type) || !image || !imageAlt) return null;

  return { year, title, location, type, image, imageAlt, isActive: value.isActive !== false };
}

function serialize(item) {
  const result = item.toObject();
  return { ...result, id: result._id.toString(), _id: undefined };
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function listProjectTreeItems({ search, year, type, includeInactive, skip, limit }) {
  const query = {};
  if (!includeInactive) query.isActive = true;
  if (year) query.year = year;
  if (type) query.type = type;
  if (search) {
    const expression = new RegExp(escapeRegex(search), 'i');
    query.$or = [{ title: expression }, { location: expression }];
  }
  const [items, total] = await Promise.all([
    ProjectTreeItem.find(query).sort({ year: -1, createdAt: -1 }).skip(skip).limit(limit),
    ProjectTreeItem.countDocuments(query),
  ]);
  return { data: items.map(serialize), total };
}

async function getProjectTreeItem(id, includeInactive = false) {
  if (!mongoose.isValidObjectId(id)) return null;
  const query = { _id: id };
  if (!includeInactive) query.isActive = true;
  const item = await ProjectTreeItem.findOne(query);
  return item ? serialize(item) : null;
}

async function createProjectTreeItem(draft) {
  return serialize(await ProjectTreeItem.create(draft));
}

async function updateProjectTreeItem(id, draft) {
  if (!mongoose.isValidObjectId(id)) return null;
  const item = await ProjectTreeItem.findById(id);
  if (!item) return null;
  item.set(draft);
  await item.save();
  return serialize(item);
}

async function archiveProjectTreeItem(id) {
  if (!mongoose.isValidObjectId(id)) return false;
  const item = await ProjectTreeItem.findById(id);
  if (!item) return false;
  item.isActive = false;
  await item.save();
  return true;
}

module.exports = {
  archiveProjectTreeItem,
  createProjectTreeItem,
  getProjectTreeItem,
  listProjectTreeItems,
  parseProjectTreeDraft,
  updateProjectTreeItem,
};
