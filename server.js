require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');

const app = express();
const port = process.env.PORT || 3000;

const { users, saveUsers } = require('./backend/src/config/db');
const { createToken, verifyPassword } = require('./backend/src/utils/auth');
const { authenticate, authorize } = require('./backend/src/middleware/authMiddleware');

app.use(cors());
app.use(express.json());

function serializeUser(user) {
  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    role: user.role,
    sexe: user.sexe || null,
    matricule: user.matricule || null,
    promotion: user.promotion || null,
    filiere: user.filiere || null,
    classe: user.classe || null,
    specialite: user.specialite || null
  };
}

function createUserRecord(payload) {
  const role = ['student', 'teacher', 'admin'].includes(payload.role) ? payload.role : 'student';
  const normalizedRole = role === 'admin' ? 'admin' : role === 'teacher' ? 'teacher' : 'student';

  const newUser = {
    id: users.length ? Math.max(...users.map((u) => u.id)) + 1 : 1,
    fullName: payload.fullName,
    email: payload.email.toLowerCase(),
    passwordHash: bcrypt.hashSync(payload.password, 10),
    role: normalizedRole,
    sexe: payload.sexe || 'M',
    matricule: payload.matricule || null,
    promotion: payload.promotion || null,
    filiere: payload.filiere || null,
    classe: payload.classe || null,
    specialite: payload.specialite || null
  };

  users.push(newUser);
  saveUsers();
  return newUser;
}

app.get('/', (req, res) => {
  res.json({
    message: 'StudyRoom API est en ligne.',
    status: 'ok',
    version: '1.0.0'
  });
});

app.post('/api/auth/register', (req, res) => {
  const { fullName, email, password, sexe, matricule, promotion, filiere, classe, specialite } = req.body;
  const role = 'student';

  if (!fullName || !email || !password) {
    return res.status(400).json({ message: 'Nom, email et mot de passe requis.' });
  }

  if (password.length < 4) {
    return res.status(400).json({ message: 'Le mot de passe doit contenir au moins 4 caractères.' });
  }

  if (users.some((item) => item.email.toLowerCase() === email.toLowerCase())) {
    return res.status(409).json({ message: 'Un compte avec cet email existe déjà.' });
  }

  const newUser = createUserRecord({
    fullName,
    email,
    password,
    role,
    sexe,
    matricule,
    promotion,
    filiere,
    classe,
    specialite
  });

  return res.status(201).json({
    message: 'Compte créé avec succès.',
    user: serializeUser(newUser)
  });
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Email et mot de passe requis.' });
  }

  const user = users.find((item) => item.email.toLowerCase() === email.toLowerCase());

  if (!user || !verifyPassword(password, user.passwordHash)) {
    return res.status(401).json({ message: 'Identifiants incorrects.' });
  }

  const token = createToken(user);

  res.json({
    message: 'Connexion réussie.',
    token,
    user: serializeUser(user)
  });
});

app.get('/api/profile', authenticate, (req, res) => {
  const user = users.find((item) => item.id === req.user.id);

  if (!user) {
    return res.status(404).json({ message: 'Utilisateur introuvable.' });
  }

  res.json(serializeUser(user));
});

app.get('/api/student/dashboard', authenticate, authorize(['student']), (req, res) => {
  const user = users.find((item) => item.id === req.user.id);

  res.json({
    user: { fullName: user.fullName, email: user.email, matricule: user.matricule, promotion: user.promotion, filiere: user.filiere, classe: user.classe },
    dashboard: {
      courses: [],
      assignments: []
    }
  });
});

app.get('/api/teacher/dashboard', authenticate, authorize(['teacher']), (req, res) => {
  res.json({
    message: 'Tableau de bord enseignant.',
    statistics: {
      courses: 3,
      assignments: 7,
      pendingReviews: 4,
      students: 42
    }
  });
});

app.get('/api/admin/users', authenticate, authorize(['admin']), (req, res) => {
  res.json({
    users: users.map(serializeUser)
  });
});

app.post('/api/admin/users', authenticate, authorize(['admin']), (req, res) => {
  const { fullName, email, password, role, sexe, matricule, promotion, filiere, classe, specialite } = req.body;

  if (!fullName || !email || !password || !role) {
    return res.status(400).json({ message: 'Tout les champs obligatoires doivent être remplis.' });
  }

  const allowedRole = ['student', 'teacher', 'admin'].includes(role) ? role : null;
  if (!allowedRole) {
    return res.status(400).json({ message: 'Le rôle autorisé est étudiant, enseignant ou administrateur.' });
  }

  if (users.some((item) => item.email.toLowerCase() === email.toLowerCase())) {
    return res.status(409).json({ message: 'Cet utilisateur existe déjà.' });
  }

  const newUser = createUserRecord({
    fullName,
    email,
    password,
    role: allowedRole,
    sexe,
    matricule,
    promotion,
    filiere,
    classe,
    specialite
  });

  return res.status(201).json({
    message: 'Utilisateur créé par l’administrateur.',
    user: serializeUser(newUser)
  });
});

app.listen(port, () => {
  console.log(`StudyRoom API running on http://localhost:${port}`);
});
