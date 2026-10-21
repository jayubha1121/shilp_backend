const mongoose = require('mongoose');

const { Schema } = mongoose;

const jobOpeningSchema = new Schema({
  title: { type: String, required: true, maxlength: 160 },
  description: { type: String, default: '', maxlength: 4000 },
  responsibilities: { type: String, default: '', maxlength: 6000 },
  qualifications: { type: String, default: '', maxlength: 6000 },
  jobType: { type: String, required: true, enum: ['Full-time', 'Part-time', 'Contract', 'Internship'] },
  location: { type: String, default: '', maxlength: 160 },
  experience: { type: String, required: true, maxlength: 120 },
  isActive: { type: Boolean, default: true },
}, {
  timestamps: true,
  versionKey: false,
});

const JobOpening = mongoose.models.JobOpening || mongoose.model('JobOpening', jobOpeningSchema);

function text(value, maxLength) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function parseJobOpeningDraft(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const draft = {
    title: text(value.title, 160),
    description: text(value.description, 4000),
    responsibilities: text(value.responsibilities, 6000),
    qualifications: text(value.qualifications, 6000),
    jobType: value.jobType,
    location: text(value.location, 160),
    experience: text(value.experience, 120),
    isActive: value.isActive !== false,
  };
  if (
    !draft.title ||
    !['Full-time', 'Part-time', 'Contract', 'Internship'].includes(draft.jobType) ||
    !draft.experience ||
    (typeof value.isActive !== 'undefined' && typeof value.isActive !== 'boolean')
  ) return null;
  return draft;
}

function serialize(opening) {
  const result = opening.toObject();
  return { ...result, id: result._id.toString(), _id: undefined };
}

async function listJobOpenings({ search, includeInactive, skip, limit }) {
  const query = {};
  if (!includeInactive) query.isActive = true;
  if (search) query.title = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  const [openings, total] = await Promise.all([
    JobOpening.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit),
    JobOpening.countDocuments(query),
  ]);
  return { data: openings.map(serialize), total };
}

async function createJobOpening(draft) {
  return serialize(await JobOpening.create(draft));
}

async function updateJobOpening(id, draft) {
  if (!mongoose.isValidObjectId(id)) return null;
  const opening = await JobOpening.findByIdAndUpdate(id, draft, { new: true, runValidators: true });
  return opening ? serialize(opening) : null;
}

async function archiveJobOpening(id) {
  if (!mongoose.isValidObjectId(id)) return false;
  const opening = await JobOpening.findByIdAndUpdate(id, { isActive: false });
  return Boolean(opening);
}

module.exports = {
  archiveJobOpening,
  createJobOpening,
  listJobOpenings,
  parseJobOpeningDraft,
  updateJobOpening,
};
