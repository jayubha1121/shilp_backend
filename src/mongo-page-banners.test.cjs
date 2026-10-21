const test = require('node:test');
const assert = require('node:assert/strict');
const { bannerPages, parsePageBannerDraft } = require('./mongo-page-banners');

const validBanner = {
  desktopImage: '/api/uploads/desktop-id',
  mobileImage: '/api/uploads/mobile-id',
  imageAlt: 'Shilp Group development',
};

test('lists all managed non-project banner slots', () => {
  assert.deepEqual(bannerPages, [
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
  ]);
});

test('accepts a complete desktop and mobile page banner', () => {
  assert.deepEqual(parsePageBannerDraft(validBanner), validBanner);
});

test('accepts and persists one banner image before the other image is uploaded', () => {
  assert.deepEqual(parsePageBannerDraft({ desktopImage: validBanner.desktopImage }), {
    desktopImage: validBanner.desktopImage,
    mobileImage: '',
    imageAlt: '',
  });
  assert.deepEqual(parsePageBannerDraft({ mobileImage: validBanner.mobileImage, imageAlt: validBanner.imageAlt }), {
    desktopImage: '',
    mobileImage: validBanner.mobileImage,
    imageAlt: validBanner.imageAlt,
  });
});

test('trims and limits the banner alt text', () => {
  const result = parsePageBannerDraft({ ...validBanner, imageAlt: ` ${'a'.repeat(250)} ` });
  assert.equal(result.imageAlt.length, 240);
});

test('rejects banners with no image, non-text alt text, and unsafe image URLs', () => {
  for (const changes of [
    { desktopImage: '', mobileImage: '' },
    { desktopImage: 'javascript:alert(1)' },
    { mobileImage: '//example.com/banner.jpg' },
    { imageAlt: 123 },
  ]) {
    assert.equal(parsePageBannerDraft({ ...validBanner, ...changes }), null);
  }
});
