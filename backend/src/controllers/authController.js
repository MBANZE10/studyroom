const { users } = require('../config/db');
const { createToken, verifyPassword } = require('../utils/auth');

function login(req, res) {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Email et mot de passe requis.' });
  }

  const user = users.find((item) => item.email.toLowerCase() === email.toLowerCase());

  if (!user || !verifyPassword(password, user.passwordHash)) {
    return res.status(401).json({ message: 'Identifiants incorrects.' });
  }

  const token = createToken(user);

  return res.json({
    message: 'Connexion réussie.',
    token,
    user: {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      role: user.role
    }
  });
}

module.exports = { login };
