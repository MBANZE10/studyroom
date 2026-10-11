const { verifyToken } = require('../utils/auth');
const { users } = require('../config/db');

function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Token manquant ou invalide.' });
  }

  const token = authHeader.split(' ')[1];
  const decoded = verifyToken(token);

  if (!decoded) {
    return res.status(401).json({ message: 'Session invalide ou expirée.' });
  }

  const user = users.find((item) => item.id === decoded.id);
  if (!user || user.isActive === false || user.deletedAt) {
    return res.status(401).json({ message: 'Compte désactivé ou session invalide.' });
  }

  req.user = decoded;
  next();
}

function authorize(roles = []) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Utilisateur non authentifié.' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Accès interdit pour ce rôle.' });
    }

    next();
  };
}

module.exports = {
  authenticate,
  authorize
};
