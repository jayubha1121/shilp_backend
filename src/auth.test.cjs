const test = require('node:test');
const assert = require('node:assert/strict');
const { validateRegistration } = require('./auth');

test('normalizes a valid first admin registration', () => {
  assert.deepEqual(validateRegistration({
    name: '  Shilp Admin ',
    email: ' ADMIN@SHILP.COM ',
    password: 'a-long-secure-password',
  }), {
    name: 'Shilp Admin',
    email: 'admin@shilp.com',
    password: 'a-long-secure-password',
  });
});

test('rejects missing names, malformed emails, and short passwords', () => {
  assert.equal(validateRegistration({ name: '', email: 'admin@shilp.com', password: 'a-long-secure-password' }), null);
  assert.equal(validateRegistration({ name: 'Admin', email: 'not-an-email', password: 'a-long-secure-password' }), null);
  assert.equal(validateRegistration({ name: 'Admin', email: 'admin@shilp.com', password: 'short' }), null);
});

test('rejects oversized account fields and passwords bcrypt would truncate', () => {
  assert.equal(validateRegistration({ name: 'a'.repeat(81), email: 'admin@shilp.com', password: 'a-long-secure-password' }), null);
  assert.equal(validateRegistration({ name: 'Admin', email: 'a'.repeat(245) + '@shilp.com', password: 'a-long-secure-password' }), null);
  assert.equal(validateRegistration({ name: 'Admin', email: 'admin@shilp.com', password: 'a'.repeat(73) }), null);
});
