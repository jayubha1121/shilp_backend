const mongoose = require('mongoose');

const { Schema } = mongoose;

const imageItemSchema = new Schema({
  title: { type: String, default: '', maxlength: 160 },
  image: { type: String, required: true, maxlength: 1000 },
  alt: { type: String, required: true, maxlength: 240 },
}, { _id: false });

const faqSchema = new Schema({
  question: { type: String, required: true, maxlength: 240 },
  answer: { type: String, required: true, maxlength: 3000 },
}, { _id: false });

const amenitySchema = new Schema({
  title: { type: String, required: true, maxlength: 120 },
  image: { type: String, required: true, maxlength: 1000 },
  alt: { type: String, required: true, maxlength: 240 },
}, { _id: false });

const projectSchema = new Schema({
  slug: { type: String, required: true, unique: true, index: true },
  typeOfProject: { type: String, required: true, enum: ['commercial', 'residential', 'plotted'] },
  projectState: { type: String, required: true, enum: ['Upcoming', 'On-going', 'Completed'] },
  statusPercentage: { type: Number, required: true, min: 0, max: 100 },
  projectDetail: {
    title: { type: String, required: true, maxlength: 120 },
    shortAddress: { type: String, default: '', maxlength: 160 },
    projectWorkStatus: { type: String, default: '', maxlength: 80 },
    brochure: { type: String, default: '', maxlength: 1000 },
    projectStatus: { type: String, default: '', maxlength: 80 },
  },
  banner: {
    banner: { type: String, required: true, maxlength: 1000 },
    mobileBanner: { type: String, required: true, maxlength: 1000 },
  },
  aboutUs: {
    description: { type: [String], default: [] },
    image: { type: String, required: true, maxlength: 1000 },
    imageAlt: { type: String, required: true, maxlength: 240 },
    faqs: { type: [faqSchema], default: [] },
  },
  floorPlans: { type: [imageItemSchema], default: [] },
  projectImages: { type: [imageItemSchema], default: [] },
  projectUpdates: {
    title: { type: String, required: true, maxlength: 160 },
    images: { type: [imageItemSchema], required: true, validate: (images) => images.length === 2 },
  },
  location: {
    title: { type: String, default: '', maxlength: 160 },
    description: { type: String, required: true, maxlength: 2000 },
    area: { type: String, default: '', maxlength: 160 },
    phone1: { type: String, default: '9898211567', maxlength: 40 },
    phone2: { type: String, default: '9898508567', maxlength: 40 },
    email1: { type: String, default: '', maxlength: 160 },
    email2: { type: String, default: '', maxlength: 160 },
    mapUrl: { type: String, default: '', maxlength: 1000 },
    address1: { type: String, default: '', maxlength: 200 },
    address2: { type: String, default: '', maxlength: 200 },
    city: { type: String, default: '', maxlength: 100 },
    state: { type: String, default: '', maxlength: 100 },
    zip: { type: String, default: '', maxlength: 24 },
    country: { type: String, default: '', maxlength: 100 },
  },
  amenities: { type: [amenitySchema], default: [] },
  projectVideo: {
    videoUrl: { type: String, default: '', maxlength: 1000 },
    title: { type: String, default: '', maxlength: 160 },
  },
  reraDetails: { type: String, default: '', maxlength: 4000 },
  isActive: { type: Boolean, default: true },
  year: { type: String, default: '', maxlength: 4 },
  typology: { type: String, default: '', maxlength: 100 },
  plotSize: { type: String, default: '', maxlength: 100 },
}, {
  timestamps: true,
  versionKey: false,
});

const Project = mongoose.models.Project || mongoose.model('Project', projectSchema);

function slugify(value) {
  return value.normalize('NFKD').toLowerCase().replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function string(value, length = 2000) {
  return typeof value === 'string' ? value.trim().slice(0, length) : '';
}

function safeImage(value) {
  const image = string(value, 1000);
  if (image.startsWith('/') && !image.startsWith('//') && !image.includes('..')) return image;
  try {
    const url = new URL(image);
    return url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)) ? image : '';
  } catch {
    return '';
  }
}

function safeHttpsUrl(value) {
  const url = string(value, 1000);
  try {
    return new URL(url).protocol === 'https:' ? url : '';
  } catch {
    return '';
  }
}

function parseImageItems(value, maxItems) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, maxItems).map((item) => ({
    title: string(item?.title, 160),
    image: safeImage(item?.image),
    alt: string(item?.alt, 240),
  }));
}

function parseProjectDraft(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const detail = value.projectDetail || {};
  const banner = value.banner || {};
  const about = value.aboutUs || {};
  const location = value.location || {};
  const typeOfProject = value.typeOfProject;
  const title = string(detail.title, 120);
  const slug = slugify(string(value.slug, 160) || title);
  const projectState = value.projectState;
  const statusPercentage = Number(value.statusPercentage);
  const desktopBanner = safeImage(banner.banner);
  const mobileBanner = safeImage(banner.mobileBanner);
  const brochure = safeHttpsUrl(detail.brochure);
  const aboutImage = safeImage(about.image);
  const aboutImageAlt = string(about.imageAlt, 240);
  const description = Array.isArray(about.description)
    ? about.description.slice(0, 12).map((line) => string(line, 3000)).filter(Boolean)
    : [];
  const floorPlans = parseImageItems(value.floorPlans, 40);
  const projectImages = parseImageItems(value.projectImages, 5);
  const projectUpdates = value.projectUpdates || {};
  const updateImages = parseImageItems(projectUpdates.images, 2);
  const mapUrl = safeHttpsUrl(location.mapUrl);

  if (
    !title || !slug || !desktopBanner || !mobileBanner || !brochure || !aboutImage || !aboutImageAlt || !description[0] ||
    !['commercial', 'residential', 'plotted'].includes(typeOfProject) ||
    !['Upcoming', 'On-going', 'Completed'].includes(projectState) || !Number.isInteger(statusPercentage) ||
    statusPercentage < 0 || statusPercentage > 100 || !Array.isArray(projectUpdates.images) || projectUpdates.images.length !== 2 ||
    updateImages.some((image) => !image.image || !image.alt) || !string(projectUpdates.title, 160) ||
    !string(location.description, 2000) || !mapUrl ||
    floorPlans.some((image) => !image.title || !image.image || !image.alt) ||
    projectImages.some((image) => !image.image || !image.alt)
  ) return null;

  const rawAmenities = Array.isArray(value.amenities) ? value.amenities.slice(0, 30) : [];
  const amenities = rawAmenities.map((item) => ({
    title: string(typeof item === 'string' ? item : item?.title, 120),
    image: safeImage(typeof item === 'string' ? '' : item?.image),
    alt: string(typeof item === 'string' ? '' : item?.alt, 240),
  }));
  if (amenities.some((amenity) => !amenity.title || !amenity.image || !amenity.alt)) return null;

  let videoUrl = '';
  try {
    const candidate = string(value.projectVideo?.videoUrl, 1000);
    if (new URL(candidate).protocol === 'https:') videoUrl = candidate;
  } catch {
    videoUrl = '';
  }

  return {
    slug,
    typeOfProject,
    projectState,
    statusPercentage,
    projectDetail: {
      title,
      shortAddress: string(detail.shortAddress, 160),
      projectWorkStatus: projectState,
      brochure,
      projectStatus: projectState,
    },
    banner: { banner: desktopBanner, mobileBanner },
    aboutUs: {
      description,
      image: aboutImage,
      imageAlt: aboutImageAlt,
      faqs: Array.isArray(about.faqs)
        ? about.faqs.slice(0, 30).map((faq) => ({ question: string(faq?.question, 240), answer: string(faq?.answer, 3000) })).filter((faq) => faq.question && faq.answer)
        : [],
    },
    floorPlans,
    projectImages,
    amenities,
    projectUpdates: { title: string(projectUpdates.title, 160), images: updateImages },
    location: {
      title: string(location.title, 160),
      description: string(location.description, 2000),
      area: string(location.area, 160),
      phone1: string(location.phone1, 40),
      phone2: string(location.phone2, 40),
      email1: string(location.email1, 160),
      email2: string(location.email2, 160),
      mapUrl,
      address1: string(location.address1, 200),
      address2: string(location.address2, 200),
      city: string(location.city, 100),
      state: string(location.state, 100),
      zip: string(location.zip, 24),
      country: string(location.country, 100),
    },
    projectVideo: { videoUrl, title: string(value.projectVideo?.title, 160) },
    reraDetails: string(value.reraDetails, 4000),
    isActive: value.isActive !== false,
    year: string(value.year, 4) || new Date().getFullYear().toString(),
    typology: string(value.typology, 100),
    plotSize: string(value.plotSize, 100),
  };
}

function serialize(project) {
  const result = project.toObject();
  return { ...result, id: result._id.toString(), _id: undefined };
}

function projectQuery(id) {
  const clauses = [{ slug: id }];
  if (mongoose.isValidObjectId(id)) clauses.push({ _id: id });
  return { $or: clauses };
}

async function listProjects({ type, search, includeInactive, skip, limit }) {
  const query = {};
  if (!includeInactive) query.isActive = true;
  if (type) query.typeOfProject = type;
  if (search) {
    query.$or = [
      { 'projectDetail.title': { $regex: search, $options: 'i' } },
      { 'projectDetail.shortAddress': { $regex: search, $options: 'i' } },
      { slug: { $regex: search, $options: 'i' } },
    ];
  }
  const archivedQuery = { ...query, isActive: false };
  const [projects, total, archived] = await Promise.all([
    Project.find(query).sort({ updatedAt: -1 }).skip(skip).limit(limit),
    Project.countDocuments(query),
    includeInactive ? [] : Project.find(archivedQuery).select('slug').lean(),
  ]);
  return { data: projects.map(serialize), total, archivedSlugs: archived.map((project) => project.slug) };
}

async function getProject(id, includeInactive = false) {
  const query = projectQuery(id);
  if (!includeInactive) query.isActive = true;
  const project = await Project.findOne(query);
  return project ? serialize(project) : null;
}

async function createProject(draft) {
  const baseSlug = slugify(draft.slug || draft.projectDetail.title) || 'project';
  let slug = baseSlug;
  let suffix = 2;
  while (await Project.exists({ slug })) slug = `${baseSlug}-${suffix++}`;
  const project = await Project.create({ ...draft, slug });
  return serialize(project);
}

async function updateProject(id, draft) {
  const project = await Project.findOne(projectQuery(id));
  if (!project) return null;
  const baseSlug = slugify(draft.slug || draft.projectDetail.title) || 'project';
  let slug = baseSlug;
  let suffix = 2;
  while (await Project.exists({ slug, _id: { $ne: project._id } })) slug = `${baseSlug}-${suffix++}`;
  project.set({ ...draft, slug });
  await project.save();
  return serialize(project);
}

async function archiveProject(id) {
  const project = await Project.findOne(projectQuery(id));
  if (!project) return false;
  project.isActive = false;
  await project.save();
  return true;
}

module.exports = {
  archiveProject,
  createProject,
  getProject,
  listProjects,
  parseProjectDraft,
  slugify,
  updateProject,
};