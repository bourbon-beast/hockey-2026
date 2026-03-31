const test = require('node:test');
const assert = require('node:assert');
const { corsOptions, allowedOrigins } = require('./cors-config');

test('CORS allows allowed origins', (t) => {
  allowedOrigins.forEach(origin => {
    corsOptions.origin(origin, (err, allowed) => {
      assert.strictEqual(err, null);
      assert.strictEqual(allowed, true);
    });
  });
});

test('CORS disallows disallowed origins', (t) => {
  corsOptions.origin('https://malicious.com', (err, allowed) => {
    assert.notStrictEqual(err, null);
    assert.strictEqual(err.message, 'Not allowed by CORS');
  });
});

test('CORS allows requests with no origin', (t) => {
  corsOptions.origin(undefined, (err, allowed) => {
    assert.strictEqual(err, null);
    assert.strictEqual(allowed, true);
  });
});
