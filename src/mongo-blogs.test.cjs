const test = require('node:test');
const assert = require('node:assert/strict');
const { parseBlogDraft } = require('./mongo-blogs');
function completeBlog() {
  return {
    title: 'A blog post', slug: 'a-blog-post', description: '<p>Rich <strong>description</strong></p>',
    author: 'Shilp Team', date: '2026-10-26', status: 'published',
    imageUrl: '/api/uploads/cover-id', imageAlt: 'Cover image',
    points: [{ title: 'Key point', subtitle: 'A summary', content: '<p>Point <em>content</em></p>', imageUrl: 'https://example.com/point.jpg', imageAlt: 'Point image' }],
  };
}
test('accepts the blog contract, preserves all points and sanitizes rich HTML', () => {
  const blog = parseBlogDraft(completeBlog());
  assert.ok(blog);
  assert.equal(blog.date, '2026-10-26');
  assert.equal(blog.status, 'published');
  assert.equal(blog.points[0].title, 'Key point');
  assert.match(blog.description, /<strong>description<\/strong>/);
  assert.match(blog.points[0].content, /<em>content<\/em>/);
  assert.doesNotMatch(parseBlogDraft({ ...completeBlog(), description: '<p>Text</p><script>alert(1)</script><img src=x onerror=alert(1)>' }).description, /script|onerror|<img/i);
  const manyPoints = Array.from({ length: 250 }, (_, index) => ({ title: 'Point ' + index, subtitle: '', content: '<p>Body</p>' }));
  assert.equal(parseBlogDraft({ ...completeBlog(), points: manyPoints }).points.length, 250);
});
test('defaults status to draft and preserves an empty points array', () => {
  const input = completeBlog();
  delete input.status;
  delete input.points;
  const result = parseBlogDraft(input);
  assert.equal(result.status, 'draft');
  assert.equal(result.imageUrl, '/api/uploads/cover-id');
  assert.deepEqual(result.points, []);
});
test('rejects invalid required fields, dates, status, slugs, points and unsafe images', () => {
  for (const changes of [
    { title: '' }, { slug: 'Not valid' }, { description: '<script>alert(1)</script>' },
    { author: '' }, { date: '2026-02-30' }, { status: 'scheduled' },
    { imageUrl: 'javascript:alert(1)' }, { imageUrl: '' }, { imageAlt: '' },
    { points: [{ title: '' }] }, { points: [{ title: 'Missing fields' }] },
    { points: [{ title: 'Okay', imageUrl: '//evil.example/image.jpg' }] },
    { points: 'not-an-array' },
  ]) assert.equal(parseBlogDraft({ ...completeBlog(), ...changes }), null, JSON.stringify(changes));
});
