const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_key';
const revokedTokens = new Set();

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

function verifyToken(token) {
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded && decoded.jti && revokedTokens.has(decoded.jti)) {
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
  verifyPassword,
  verifyToken,
  revokeToken
};
