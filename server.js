require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const XLSX = require('xlsx');

const app = express();
const port = Number(process.env.PORT || 3000);
const allowedOrigins = new Set(
  (process.env.CORS_ORIGINS || 'http://localhost:3000,http://127.0.0.1:3000,http://localhost:5500,http://localhost:5501,https://mbanze10.github.io')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
);

const {
  users,
  saveUsers,
  assignments,
  saveAssignments,
  submissions,
  saveSubmissions,
  notifications,
  saveNotifications,
  results,
  saveResults,
  sortResultsByStudentName
} = require('./backend/src/config/db');
const { createToken, verifyPassword, generateTemporaryPassword } = require('./backend/src/utils/auth');
const { authenticate, authorize } = require('./backend/src/middleware/authMiddleware');

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin)) {
      callback(null, true);
      return;
    }

    callback(null, false);
  }
}));
app.use(express.json());
app.use(express.static(__dirname));

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
    faculte: user.faculte || user.filiere || null,
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
    faculte: payload.faculte || payload.filiere || null,
    classe: payload.classe || null,
    specialite: payload.specialite || null
  };

  users.push(newUser);
  saveUsers();
  return newUser;
}

function ensureDefaultAccounts() {
  const defaultAccounts = [
    { fullName: 'MOISE GBEMA', email: 'teacher@studyroom.com', password: 'teacher123', role: 'teacher' },
    { fullName: 'Admin Principal', email: 'admin@studyroom.com', password: 'admin123', role: 'admin' }
  ];

  for (const account of defaultAccounts) {
    const existing = users.find((user) => user.email.toLowerCase() === account.email.toLowerCase());

    if (!existing) {
      createUserRecord(account);
      continue;
    }

    const needsRoleUpdate = existing.role !== account.role;
    const needsPasswordReset = !verifyPassword(account.password, existing.passwordHash);

    if (needsRoleUpdate || needsPasswordReset) {
      existing.fullName = account.fullName;
      existing.role = account.role;
      existing.passwordHash = bcrypt.hashSync(account.password, 10);
      saveUsers();
    }
  }
}

ensureDefaultAccounts();

const assignmentTypes = new Set(['interrogation', 'devoir', 'examen']);

function nextId(items) {
  return items.length ? Math.max(...items.map((item) => Number(item.id) || 0)) + 1 : 1;
}

function normalizeAnswer(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ');
}

function publicAssignment(assignment) {
  return {
    id: assignment.id,
    title: assignment.title,
    subject: assignment.subject,
    instructions: assignment.instructions,
    type: assignment.type,
    teacherId: assignment.teacherId,
    startAt: assignment.startAt,
    endAt: assignment.endAt,
    duration: assignment.duration,
    status: assignment.status,
    questionCount: assignment.questions.length,
    createdAt: assignment.createdAt,
    questions: assignment.questions.map((question) => ({
      id: question.id,
      type: question.type,
      text: question.text,
      options: question.options || [],
      points: question.points
    }))
  };
}

function teacherAssignment(assignment) {
  return { ...publicAssignment(assignment), questions: assignment.questions };
}

function studentResult(result) {
  return {
    id: result.id,
    assignmentId: result.assignmentId,
    examTitle: result.examTitle,
    subject: result.subject,
    type: result.type,
    score: result.score,
    maxScore: result.maxScore,
    percentage: result.percentage,
    status: result.status,
    date: result.date
  };
}

function enrichedResult(result) {
  const user = users.find((item) => item.id === result.studentId);
  return {
    ...result,
    fullName: user?.fullName || result.fullName,
    matricule: user?.matricule || '',
    sexe: user?.sexe || '',
    faculte: user?.faculte || user?.filiere || '',
    promotion: user?.promotion || '',
    email: user?.email || result.email
  };
}

function compareStudentNames(first, second) {
  const firstParts = String(first.fullName || '').toLowerCase().trim().split(/\s+/);
  const secondParts = String(second.fullName || '').toLowerCase().trim().split(/\s+/);
  for (let index = 0; index < Math.max(firstParts.length, secondParts.length); index += 1) {
    const comparison = (firstParts[index] || '').localeCompare(secondParts[index] || '');
    if (comparison !== 0) return comparison;
  }
  return 0;
}

function calculateQuestion(question, answer) {
  const points = Number(question.points) || 1;
  const submitted = normalizeAnswer(answer);
  let expected = normalizeAnswer(question.correctAnswer);

  if (question.type === 'qcm' || question.type === 'vrai_faux') {
    const optionValue = question.options?.[Number(answer)];
    expected = normalizeAnswer(question.correctAnswer);
    return { points: submitted === expected || normalizeAnswer(optionValue) === expected ? points : 0, maxPoints: points };
  }

  const keywords = normalizeAnswer(question.expectedAnswer || question.correctAnswer)
    .split(' ')
    .filter((word) => word.length > 2);
  const matches = keywords.filter((word) => submitted.includes(word)).length;
  const awarded = keywords.length ? Math.min(points, points * matches / keywords.length) : (submitted === expected ? points : 0);
  return { points: Number(awarded.toFixed(2)), maxPoints: points };
}

app.get('/api/health', (req, res) => {
  res.json({
    message: 'StudyRoom API est en ligne.',
    status: 'ok',
    version: '1.0.0'
  });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.post('/api/auth/register', (req, res) => {
  const { fullName, email, password, sexe, matricule, promotion, faculte, filiere } = req.body;

  if (!fullName || !email || !password || !matricule || !sexe || !faculte || !promotion) {
    return res.status(400).json({ message: 'Nom complet, matricule, sexe, faculté, promotion, email et mot de passe sont requis.' });
  }

  if (password.length < 4) {
    return res.status(400).json({ message: 'Le mot de passe doit contenir au moins 4 caractères.' });
  }

  if (users.some((item) => item.email.toLowerCase() === String(email).trim().toLowerCase())) {
    return res.status(409).json({ message: 'Un compte avec cet email existe déjà.' });
  }

  const newUser = createUserRecord({
    fullName,
    email,
    password,
    role: 'student',
    sexe,
    matricule,
    promotion,
    filiere: faculte || filiere,
    faculte
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

app.post('/api/auth/forgot-password', (req, res) => {
  const { email } = req.body;

  if (!email || !String(email).trim()) {
    return res.status(400).json({ message: 'Veuillez saisir votre adresse e-mail.' });
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  const user = users.find((item) => item.email.toLowerCase() === normalizedEmail);

  if (!user) {
    return res.status(404).json({ message: 'Aucun compte ne correspond à cette adresse e-mail.' });
  }

  const tempPassword = generateTemporaryPassword();
  user.passwordHash = bcrypt.hashSync(tempPassword, 10);
  saveUsers();

  const emailMessage = `Bonjour ${user.fullName},\n\nVotre mot de passe temporaire est : ${tempPassword}\n\nVeuillez le changer dès votre prochaine connexion pour sécuriser votre compte.\n\nStudyRoom`;

  return res.status(200).json({
    message: 'Un mot de passe temporaire a été envoyé à votre adresse e-mail.',
    tempPassword,
    emailPreview: emailMessage
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
    user: { fullName: user.fullName, email: user.email, matricule: user.matricule, promotion: user.promotion, faculte: user.faculte || user.filiere, filiere: user.filiere, classe: user.classe, sexe: user.sexe },
    dashboard: {
      courses: [],
      assignments: assignments.filter((item) => item.status === 'published').map(publicAssignment)
    }
  });
});

app.get('/api/assignments', authenticate, (req, res) => {
  if (req.user.role === 'student') {
    return res.json({ assignments: assignments.filter((item) => item.status === 'published').map(publicAssignment) });
  }

  return res.json({ assignments: assignments.filter((item) => item.teacherId === req.user.id).map(teacherAssignment) });
});

app.post('/api/assignments', authenticate, authorize(['teacher']), (req, res) => {
  const { title, subject, type, startAt, endAt, duration, instructions, questions } = req.body || {};
  if (!title || !subject || !instructions || !assignmentTypes.has(type) || !startAt || !endAt || !Array.isArray(questions) || !questions.length) {
    return res.status(400).json({ message: 'Les informations et les questions de l’évaluation sont obligatoires.' });
  }

  const start = new Date(startAt);
  const end = new Date(endAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    return res.status(400).json({ message: 'Les dates de l’évaluation sont invalides.' });
  }

  const normalizedQuestions = questions.map((question, index) => {
    const questionType = question.type || 'qcm';
    const options = questionType === 'vrai_faux' ? ['Vrai', 'Faux'] : (Array.isArray(question.options) ? question.options.map((option) => String(option).trim()).filter(Boolean) : []);
    if (!String(question.text || '').trim() || !['qcm', 'vrai_faux', 'ouverte'].includes(questionType)) return null;
    if (questionType === 'qcm' && (options.length < 2 || options.length > 5)) return null;
    if (!String(question.correctAnswer || '').trim()) return null;
    return {
      id: Number(question.id) || index + 1,
      type: questionType,
      text: String(question.text).trim(),
      options,
      correctAnswer: String(question.correctAnswer).trim(),
      expectedAnswer: String(question.expectedAnswer || '').trim(),
      points: Math.max(1, Math.min(20, Number(question.points) || 1))
    };
  });
  if (normalizedQuestions.some((question) => !question)) return res.status(400).json({ message: 'Chaque question doit avoir un type, un texte, une bonne réponse et des choix valides.' });

  const assignment = {
    id: nextId(assignments),
    title: String(title).trim(),
    subject: String(subject).trim(),
    instructions: String(instructions).trim(),
    type,
    teacherId: req.user.id,
    startAt: start.toISOString(),
    endAt: end.toISOString(),
    duration: Math.max(1, Number(duration) || 30),
    status: 'published',
    questions: normalizedQuestions,
    createdAt: new Date().toISOString()
  };
  assignments.push(assignment);
  saveAssignments();
  return res.status(201).json({ assignment: teacherAssignment(assignment) });
});

app.get('/api/assignments/:assignmentId', authenticate, (req, res) => {
  const assignment = assignments.find((item) => item.id === Number(req.params.assignmentId));
  if (!assignment || assignment.status !== 'published') return res.status(404).json({ message: 'Évaluation introuvable.' });
  if (req.user.role === 'student') return res.json({ assignment: publicAssignment(assignment) });
  if (req.user.role !== 'teacher' || assignment.teacherId !== req.user.id) return res.status(403).json({ message: 'Accès interdit à cette évaluation.' });
  return res.json({ assignment: teacherAssignment(assignment) });
});

app.post('/api/assignments/:assignmentId/start', authenticate, authorize(['student']), (req, res) => {
  const assignment = assignments.find((item) => item.id === Number(req.params.assignmentId));
  if (!assignment || assignment.status !== 'published') return res.status(404).json({ message: 'Évaluation introuvable.' });
  const now = Date.now();
  if (now < new Date(assignment.startAt).getTime()) return res.status(403).json({ message: 'L’évaluation n’est pas encore ouverte.' });
  if (now > new Date(assignment.endAt).getTime()) return res.status(403).json({ message: 'L’évaluation est terminée.' });
  if (submissions.some((item) => item.assignmentId === assignment.id && item.studentId === req.user.id)) return res.status(409).json({ message: 'Une seule tentative est autorisée pour cette évaluation.' });
  const startedAt = new Date(now);
  const expiresAt = new Date(Math.min(now + assignment.duration * 60000, new Date(assignment.endAt).getTime()));
  const attempt = { id: nextId(submissions), assignmentId: assignment.id, studentId: req.user.id, startedAt: startedAt.toISOString(), expiresAt: expiresAt.toISOString(), status: 'in_progress', answers: [] };
  submissions.push(attempt);
  saveSubmissions();
  return res.status(201).json({ attempt: { id: attempt.id, startedAt: attempt.startedAt, expiresAt: attempt.expiresAt }, assignment: publicAssignment(assignment) });
});

app.post('/api/assignments/:assignmentId/submit', authenticate, authorize(['student']), (req, res) => {
  const assignment = assignments.find((item) => item.id === Number(req.params.assignmentId));
  const attempt = submissions.find((item) => item.assignmentId === Number(req.params.assignmentId) && item.studentId === req.user.id && item.status === 'in_progress');
  if (!assignment || !attempt) return res.status(404).json({ message: 'Tentative introuvable ou déjà soumise.' });
  if (Date.now() > new Date(attempt.expiresAt).getTime()) {
    attempt.status = 'expired';
    saveSubmissions();
    return res.status(403).json({ message: 'Le délai de l’évaluation est expiré.' });
  }
  const answers = Array.isArray(req.body?.answers) ? req.body.answers : [];
  const answerMap = new Map(answers.map((answer) => [Number(answer.questionId), answer.answer]));
  const evaluations = assignment.questions.map((question) => calculateQuestion(question, answerMap.get(question.id)));
  const score = evaluations.reduce((sum, item) => sum + item.points, 0);
  const maxScore = evaluations.reduce((sum, item) => sum + item.maxPoints, 0);
  const percentage = maxScore ? Number((score / maxScore * 100).toFixed(2)) : 0;
  attempt.answers = answers;
  attempt.status = 'submitted';
  attempt.submittedAt = new Date().toISOString();
  saveSubmissions();
  const user = users.find((item) => item.id === req.user.id);
  const result = { id: nextId(results), assignmentId: assignment.id, studentId: user.id, fullName: user.fullName, email: user.email, matricule: user.matricule || '', sexe: user.sexe || '', faculte: user.faculte || user.filiere || '', promotion: user.promotion || '', examTitle: assignment.title, subject: assignment.subject, type: assignment.type, score, maxScore, percentage, status: percentage >= 50 ? 'Réussi' : 'Échec', date: attempt.submittedAt };
  results.push(result);
  saveResults();
  notifications.push({ id: nextId(notifications), userId: user.id, title: 'Résultats disponibles', message: `Votre résultat pour ${assignment.title} est disponible.`, date: attempt.submittedAt, read: false });
  saveNotifications();
  return res.status(201).json({ result: studentResult(result) });
});

app.get('/api/student/results', authenticate, authorize(['student']), (req, res) => {
  return res.json({ results: results.filter((item) => item.studentId === req.user.id).map(studentResult) });
});

app.get('/api/teacher/assignments/:assignmentId/results', authenticate, authorize(['teacher', 'admin']), (req, res) => {
  const assignment = assignments.find((item) => item.id === Number(req.params.assignmentId));
  if (!assignment || (req.user.role === 'teacher' && assignment.teacherId !== req.user.id)) return res.status(403).json({ message: 'Accès interdit à cette évaluation.' });
  const assignmentResults = results.filter((item) => item.assignmentId === assignment.id).map(enrichedResult).sort(compareStudentNames);
  return res.json({ assignment: { id: assignment.id, title: assignment.title, subject: assignment.subject, type: assignment.type }, results: assignmentResults });
});

app.get('/api/teacher/assignments/:assignmentId/export.xlsx', authenticate, authorize(['teacher', 'admin']), (req, res) => {
  const assignment = assignments.find((item) => item.id === Number(req.params.assignmentId));
  if (!assignment || (req.user.role === 'teacher' && assignment.teacherId !== req.user.id)) return res.status(403).json({ message: 'Accès interdit à cette évaluation.' });
  const rows = results.filter((item) => item.assignmentId === assignment.id).map(enrichedResult).sort(compareStudentNames).map((item) => ({ 'NOM COMPLET': item.fullName, MATRICULE: item.matricule, SEXE: item.sexe, FACULTÉ: item.faculte, PROMOTION: item.promotion, 'E-MAIL': item.email, COTE: item.score, 'NOTE MAXIMALE': item.maxScore, POURCENTAGE: item.percentage, 'TYPE D’ÉVALUATION': assignment.type, 'TITRE DU COURS': assignment.subject, DATE: item.date }));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), 'Résultats');
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="studyroom-${assignment.id}-resultats.xlsx"`);
  return res.send(buffer);
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

app.get('/api/results', authenticate, authorize(['teacher', 'admin']), (req, res) => {
  const visibleResults = req.user.role === 'admin'
    ? results
    : results.filter((result) => assignments.some((assignment) => assignment.id === result.assignmentId && assignment.teacherId === req.user.id));
  res.json({
    results: sortResultsByStudentName(visibleResults)
  });
});

app.post('/api/results', authenticate, authorize(['teacher', 'admin']), (req, res) => {
  const record = req.body || {};
  const required = ['fullName', 'email', 'examTitle', 'score', 'maxScore', 'percentage', 'status'];

  if (required.some((field) => !record[field] && record[field] !== 0)) {
    return res.status(400).json({ message: 'Les informations de résultat sont incomplètes.' });
  }

  const newRecord = {
    id: results.length ? Math.max(...results.map((item) => Number(item.id) || 0)) + 1 : 1,
    fullName: String(record.fullName).trim(),
    email: String(record.email).trim(),
    matricule: record.matricule || '',
    promotion: record.promotion || '',
    filiere: record.filiere || '',
    classe: record.classe || '',
    examTitle: String(record.examTitle).trim(),
    subject: String(record.subject || '').trim(),
    score: Number(record.score) || 0,
    maxScore: Number(record.maxScore) || 0,
    percentage: Number(record.percentage) || 0,
    status: String(record.status || 'Échec').trim(),
    date: record.date || new Date().toISOString(),
    details: Array.isArray(record.details) ? record.details : []
  };

  results.push(newRecord);
  saveResults();

  return res.status(201).json({
    message: 'Résultat enregistré dans la base locale.',
    result: newRecord,
    results: sortResultsByStudentName(results)
  });
});

const server = app.listen(port, '0.0.0.0', () => {
  const actualPort = server.address().port;
  console.log(`StudyRoom API running on http://localhost:${actualPort}`);
  console.log(`StudyRoom API accessible on your network at http://<your-computer-ip>:${actualPort}`);
});

server.on('error', (error) => {
  console.error('Erreur de démarrage du serveur:', error);
  process.exit(1);
});