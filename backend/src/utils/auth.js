const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_key';

function createToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role
    },
    JWT_SECRET,
    { expiresIn: '8h' }
  );
}

function generateTemporaryPassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  let pass = '';

  for (let index = 0; index < 12; index += 1) {
    pass += alphabet[Math.floor(Math.random() * alphabet.length)];
  }

  return pass;
}

function verifyPassword(password, hash) {
  return bcrypt.compareSync(password, hash);
}

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
}

module.exports = {
  createToken,
  generateTemporaryPassword,
  verifyPassword,
  verifyToken
};
