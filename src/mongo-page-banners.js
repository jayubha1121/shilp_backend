const mongoose = require('mongoose');

const { Schema } = mongoose;

const bannerPages = [
  'home',
  'about-us',
  'our-team',
  'careers',
  'project-overview',
  'our-work',
  'contact-us',
  'commercial',
  'residential',
  'plotted',
  'blog',
];

const pageBannerSchema = new Schema({
  page: { type: String, required: true, enum: bannerPages, unique: true, index: true },
  desktopImage: { type: String, default: '', maxlength: 1000 },
  mobileImage: { type: String, default: '', maxlength: 1000 },
  imageAlt: { type: String, default: '', maxlength: 240 },
}, {
  timestamps: true,
  versionKey: false,
});

const PageBanner = mongoose.models.PageBanner || mongoose.model('PageBanner', pageBannerSchema);

function text(value, maxLength) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function safeImage(value) {
  const image = text(value, 1000);
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

function parsePageBannerDraft(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (['desktopImage', 'mobileImage', 'imageAlt'].some((key) => value[key] !== undefined && typeof value[key] !== 'string')) return null;
  const rawDesktopImage = text(value.desktopImage, 1000);
  const rawMobileImage = text(value.mobileImage, 1000);
  const desktopImage = rawDesktopImage ? safeImage(rawDesktopImage) : '';
  const mobileImage = rawMobileImage ? safeImage(rawMobileImage) : '';
  const imageAlt = text(value.imageAlt, 240);
  if ((rawDesktopImage && !desktopImage) || (rawMobileImage && !mobileImage) || (!desktopImage && !mobileImage)) return null;
  return { desktopImage, mobileImage, imageAlt };
}

function serialize(banner) {
  const result = banner.toObject();
  return { ...result, id: result._id.toString(), _id: undefined };
}

async function listPageBanners() {
  const banners = await PageBanner.find({ page: { $in: bannerPages } }).sort({ page: 1 });
  return banners.map(serialize);
}

async function savePageBanner(page, draft) {
  if (!bannerPages.includes(page)) return null;
  const banner = await PageBanner.findOneAndUpdate(
    { page },
    { ...draft, page },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
  );
  return serialize(banner);
}

module.exports = { bannerPages, listPageBanners, parsePageBannerDraft, savePageBanner };
