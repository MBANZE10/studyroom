const assert = require('node:assert/strict');
const { generateTemporaryPassword } = require('../src/utils/auth');

const password = generateTemporaryPassword();
assert.ok(typeof password === 'string', 'generateTemporaryPassword doit retourner une chaîne');
assert.ok(password.length >= 10, 'Le mot de passe temporaire doit être assez long');
assert.match(password, /[A-Z]/, 'Le mot de passe doit contenir une majuscule');
console.log('forgot password flow ok');
