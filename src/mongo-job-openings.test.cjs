const test = require('node:test');
const assert = require('node:assert/strict');
const { parseJobOpeningDraft } = require('./mongo-job-openings');

const validOpening = {
  title: 'Interior Site Supervisor',
  description: 'Oversee finishing work at residential sites.',
  responsibilities: 'Coordinate vendors\nReview daily progress',
  qualifications: 'Diploma or degree in civil engineering',
  jobType: 'Full-time',
  location: 'Ahmedabad',
  experience: '4–5 years experience',
  isActive: true,
};

test('accepts a complete job opening and trims text fields', () => {
  assert.deepEqual(parseJobOpeningDraft({ ...validOpening, title: ' Interior Site Supervisor ' }), validOpening);
});

test('defaults new job openings to active', () => {
  const { isActive, ...draft } = validOpening;
  assert.equal(parseJobOpeningDraft(draft).isActive, true);
});

test('rejects invalid required fields, job types, and active values', () => {
  for (const changes of [
    { title: '' },
    { experience: '' },
    { jobType: 'Volunteer' },
    { isActive: 'false' },
  ]) {
    assert.equal(parseJobOpeningDraft({ ...validOpening, ...changes }), null);
  }
});
