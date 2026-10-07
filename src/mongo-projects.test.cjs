const test = require('node:test');
const assert = require('node:assert/strict');
const { parseProjectDraft } = require('./mongo-projects');
const { sanitizeSvg } = require('./sanitize-svg');

function completeProject() {
  const image = { title: 'Floor plan', image: '/uploads/plan.webp', alt: 'Floor plan drawing' };
  return {
    slug: 'sample-project',
    typeOfProject: 'residential',
    projectState: 'On-going',
    statusPercentage: 35,
    projectDetail: { title: 'Sample project', shortAddress: 'Ahmedabad', brochure: 'https://drive.google.com/file/d/example/view' },
    banner: { banner: '/uploads/desktop.webp', mobileBanner: '/uploads/mobile.webp' },
    aboutUs: { description: ['Project description'], image: '/uploads/about.webp', imageAlt: 'Building exterior' },
    floorPlans: [image],
    projectImages: [{ ...image, title: 'Exterior' }],
    amenities: [{ title: 'Pool', image: '/api/uploads/pool-icon.svg', alt: 'Pool icon' }],
    projectUpdates: { title: 'Latest progress', images: [image, image] },
    location: { title: 'Find us', description: 'Ahmedabad, Gujarat', mapUrl: 'https://maps.google.com/maps/embed' },
    projectVideo: {},
  };
}

test('accepts and preserves the complete project payload', () => {
  const project = parseProjectDraft(completeProject());
  assert.ok(project);
  assert.equal(project.slug, 'sample-project');
  assert.equal(project.projectUpdates.images.length, 2);
  assert.equal(project.amenities[0].image, '/api/uploads/pool-icon.svg');
  assert.equal(project.floorPlans[0].alt, 'Floor plan drawing');
});

test('rejects projects without exactly two completed update images', () => {
  const draft = completeProject();
  draft.projectUpdates.images.pop();
  assert.equal(parseProjectDraft(draft), null);

  draft.projectUpdates.images.push({ title: 'Third image', image: '/uploads/third.webp', alt: 'Third image' });
  draft.projectUpdates.images.push({ title: 'Fourth image', image: '/uploads/fourth.webp', alt: 'Fourth image' });
  assert.equal(parseProjectDraft(draft), null);
});

test('sanitizes uploaded SVG icons while preserving their viewport', () => {
  const safe = sanitizeSvg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" onload="alert(1)"><script>alert(1)</script><path d="M1 1h22v22H1z" onclick="alert(1)"/><image href="https://example.com/x.png"/></svg>');
  assert.ok(safe);
  assert.match(safe, /viewBox="0 0 24 24"/);
  assert.match(safe, /<path/);
  assert.doesNotMatch(safe, /script|onload|onclick|<image|https:\/\//i);
});

test('rejects SVG payloads without an SVG root', () => {
  assert.equal(sanitizeSvg('<script>alert(1)</script>'), null);
});