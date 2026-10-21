const test = require('node:test');
const assert = require('node:assert/strict');
const { parseProjectTreeDraft } = require('./mongo-project-tree');

const validItem = {
  year: '2026',
  title: 'Shilp Ananta',
  location: 'Shela, Ahmedabad',
  type: 'residential',
  image: '/api/uploads/123',
  imageAlt: 'Residential tower at Shilp Ananta',
};

test('accepts a complete project tree item', () => {
  assert.deepEqual(parseProjectTreeDraft(validItem), { ...validItem, isActive: true });
});

test('trims and limits project tree text fields', () => {
  const item = parseProjectTreeDraft({ ...validItem, title: ` ${'a'.repeat(130)} `, location: ' Shela ' });
  assert.equal(item.title.length, 120);
  assert.equal(item.location, 'Shela');
});

test('rejects missing fields, invalid years, unsupported types, and unsafe image URLs', () => {
  for (const changes of [
    { title: '' },
    { year: '26' },
    { year: '12026' },
    { type: 'other' },
    { image: 'javascript:alert(1)' },
    { image: '//example.com/image.jpg' },
    { imageAlt: '' },
    { isActive: 'false' },
  ]) {
    assert.equal(parseProjectTreeDraft({ ...validItem, ...changes }), null);
  }
});
