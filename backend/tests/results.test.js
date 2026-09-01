const assert = require('node:assert/strict');
const { results, sortResultsByStudentName } = require('../src/config/db');

assert.ok(Array.isArray(results), 'results doit être un tableau');
const sorted = sortResultsByStudentName(results);
assert.ok(Array.isArray(sorted), 'sortResultsByStudentName doit retourner un tableau');
console.log('results storage ok');
