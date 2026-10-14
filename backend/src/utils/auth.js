const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const JWT_SECRET = process.env.JWT_SECRET || (process.env.NODE_ENV === 'production' ? null : 'studyroom-local-dev-secret');
const revokedTokens = new Set();
const revokedUserIds = new Set();

if (!JWT_SECRET && process.env.NODE_ENV === 'production') {
  throw new Error('JWT_SECRET environment variable is required in production.');
}

function hashPassword(password) {
  return bcrypt.hashSync(String(password || ''), 12);
}

function isValidPassword(password) {
  return typeof password === 'string' && password.length >= 8;
}

function createToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      jti: crypto.randomUUID()
    },
    JWT_SECRET,
    { expiresIn: '8h' }
  );
}

function generateTemporaryPassword() {
  const uppercase = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lowercase = 'abcdefghijkmnopqrstuvwxyz';
  const digits = '23456789';
  const alphabet = uppercase + lowercase + digits;
  let pass = uppercase[Math.floor(Math.random() * uppercase.length)] +
    lowercase[Math.floor(Math.random() * lowercase.length)] +
    digits[Math.floor(Math.random() * digits.length)];

  while (pass.length < 12) {
    pass += alphabet[Math.floor(Math.random() * alphabet.length)];
  }

  return pass;
}

function verifyPassword(password, hash) {
  if (typeof password !== 'string' || typeof hash !== 'string') {
    return false;
  }
  return bcrypt.compareSync(password, hash);
}

function revokeToken(token) {
  try {
    const decoded = jwt.decode(token);
    if (decoded && decoded.jti) {
      revokedTokens.add(decoded.jti);
    }
  } catch (error) {
    // Ignore invalid tokens during logout.
  }
}

function revokeUserTokens(userId) {
  if (userId === null || userId === undefined) {
    return;
  }
  revokedUserIds.add(Number(userId));
}

function verifyToken(token) {
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (!decoded) {
      return null;
    }
    if (decoded.jti && revokedTokens.has(decoded.jti)) {
      return null;
    }
    if (decoded.id !== undefined && revokedUserIds.has(Number(decoded.id))) {
      return null;
    }
    return decoded;
  } catch (error) {
    return null;
  }
}

module.exports = {
  createToken,
  generateTemporaryPassword,
  hashPassword,
  isValidPassword,
  verifyPassword,
  verifyToken,
  revokeToken,
  revokeUserTokens
};
