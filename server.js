require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
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
  promoCodes,
  savePromoCodes,
  passwordResetTokens,
  savePasswordResetTokens,
  sortResultsByStudentName
} = require('./backend/src/config/db');
const { createToken, verifyPassword, generateTemporaryPassword, generateResetToken, hashToken, revokeToken, hashPassword, isValidPassword } = require('./backend/src/utils/auth');
const { authenticate, authorize } = require('./backend/src/middleware/authMiddleware');

const smtpCredentialsConfigured = Boolean(process.env.SMTP_USER && process.env.SMTP_PASS);
const smtpHost = process.env.SMTP_HOST || (smtpCredentialsConfigured ? 'smtp.gmail.com' : 'localhost');
const smtpPort = Number(process.env.SMTP_PORT || (smtpHost === 'smtp.gmail.com' ? 465 : 587));
const smtpConfig = {
  host: smtpHost,
  port: smtpPort,
  secure: process.env.SMTP_SECURE
    ? String(process.env.SMTP_SECURE).toLowerCase() === 'true'
    : smtpHost === 'smtp.gmail.com' && smtpPort === 465,
  auth: smtpCredentialsConfigured ? {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  } : undefined
};

const defaultFrontendUrl = process.env.NODE_ENV === 'production'
  ? 'https://mbanze10.github.io/studyroom'
  : 'http://localhost:3000';
const frontendUrl = (process.env.FRONTEND_URL || defaultFrontendUrl).replace(/\/$/, '');
const mailTransporter = nodemailer.createTransport(smtpConfig);

const defaultPromoCodes = [
  {
    id: 1,
    code: 'CODE2027',
    label: 'Promotion 2027',
    isActive: false,
    description: 'Code promo préparé en attente d’activation par l’administrateur.',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
];

if (!promoCodes.length) {
  promoCodes.push(...defaultPromoCodes);
  savePromoCodes();
}

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
for (const publicAsset of ['script.js', 'style.css', 'config.js', 'reset-password.html']) {
  app.get(`/${publicAsset}`, (req, res) => res.sendFile(path.join(__dirname, publicAsset)));
}

function defaultUserPreferences() {
  return {
    theme: 'light',
    textSize: 'medium',
    language: 'fr',
    notifications: {
      newAssignments: true,
      newHomework: true,
      newExams: true,
      resultsPublished: true,
      adminAnnouncements: true,
      generalNotifications: true
    },
    accessibility: {
      reducedMotion: false,
      highContrast: false,
      textSize: 'medium'
    },
    communication: {
      emailUpdates: true
    },
    navigation: {
      compactView: false
    }
  };
}

function normalizeUserPreferences(value) {
  const safeSource = value && typeof value === 'object' ? value : {};
  const defaultPreferences = defaultUserPreferences();

  const notifications = {
    newAssignments: Boolean(safeSource.notifications?.newAssignments ?? defaultPreferences.notifications.newAssignments),
    newHomework: Boolean(safeSource.notifications?.newHomework ?? defaultPreferences.notifications.newHomework),
    newExams: Boolean(safeSource.notifications?.newExams ?? defaultPreferences.notifications.newExams),
    resultsPublished: Boolean(safeSource.notifications?.resultsPublished ?? defaultPreferences.notifications.resultsPublished),
    adminAnnouncements: Boolean(safeSource.notifications?.adminAnnouncements ?? defaultPreferences.notifications.adminAnnouncements),
    generalNotifications: Boolean(safeSource.notifications?.generalNotifications ?? defaultPreferences.notifications.generalNotifications)
  };

  return {
    theme: safeSource.theme === 'dark' ? 'dark' : 'light',
    textSize: ['small', 'medium', 'large'].includes(safeSource.textSize) ? safeSource.textSize : defaultPreferences.textSize,
    language: typeof safeSource.language === 'string' && safeSource.language.trim() ? safeSource.language.trim().slice(0, 2).toLowerCase() : defaultPreferences.language,
    notifications,
    accessibility: {
      reducedMotion: Boolean(safeSource.accessibility?.reducedMotion ?? defaultPreferences.accessibility.reducedMotion),
      highContrast: Boolean(safeSource.accessibility?.highContrast ?? defaultPreferences.accessibility.highContrast),
      textSize: ['small', 'medium', 'large'].includes(safeSource.accessibility?.textSize) ? safeSource.accessibility.textSize : defaultPreferences.accessibility.textSize
    },
    communication: {
      emailUpdates: Boolean(safeSource.communication?.emailUpdates ?? defaultPreferences.communication.emailUpdates)
    },
    navigation: {
      compactView: Boolean(safeSource.navigation?.compactView ?? defaultPreferences.navigation.compactView)
    }
  };
}

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
    specialite: user.specialite || null,
    createdAt: user.createdAt || null,
    lastLoginAt: user.lastLoginAt || null,
    lastActivityAt: user.lastActivityAt || user.lastLoginAt || null,
    isActive: user.isActive !== false,
    deletedAt: user.deletedAt || null,
    preferences: normalizeUserPreferences(user.preferences)
  };
}

function isUserActive(user) {
  return !!user && user.isActive !== false && !user.deletedAt;
}

function createUserRecord(payload) {
  const role = ['student', 'teacher', 'admin'].includes(payload.role) ? payload.role : 'student';
  const normalizedRole = role === 'admin' ? 'admin' : role === 'teacher' ? 'teacher' : 'student';

  const newUser = {
    id: users.length ? Math.max(...users.map((u) => u.id)) + 1 : 1,
    fullName: String(payload.fullName || '').trim(),
    email: String(payload.email || '').trim().toLowerCase(),
    passwordHash: hashPassword(payload.password),
    role: normalizedRole,
    sexe: payload.sexe || 'M',
    matricule: payload.matricule || null,
    promotion: payload.promotion || null,
    filiere: payload.filiere || null,
    faculte: payload.faculte || payload.filiere || null,
    classe: payload.classe || null,
    specialite: payload.specialite || null,
    createdAt: new Date().toISOString(),
    lastLoginAt: null,
    lastActivityAt: null,
    isActive: true,
    deletedAt: null,
    preferences: defaultUserPreferences()
  };

  users.push(newUser);
  saveUsers();
  return newUser;
}

function ensureDefaultAccounts() {
  if (users.length > 0) {
    return;
  }

  const defaultAccounts = [
    { fullName: 'MOISE GBEMA', email: 'teacher@studyroom.com', password: 'teacher123', role: 'teacher' },
    { fullName: 'Admin Principal', email: 'admin@studyroom.com', password: 'admin123', role: 'admin' }
  ];

  for (const account of defaultAccounts) {
    createUserRecord(account);
  }
}

ensureDefaultAccounts();

const assignmentTypes = new Set(['interrogation', 'devoir', 'examen']);
const allowedPromotions = ['L1', 'L2', 'L3', 'L4', 'M1', 'M2', 'Doctorat'];
const allowedFaculties = ['Théologie', 'Droit', 'Médecine', 'Sciences informatiques', 'Économie'];
const academicLegacyAliases = {
  informatique: 'Sciences informatiques',
  'science informatique': 'Sciences informatiques',
  'sciences informatique': 'Sciences informatiques',
  'sciences informatiques': 'Sciences informatiques',
  sciences: 'Sciences informatiques',
  economie: 'Économie',
  theologie: 'Théologie',
  droit: 'Droit',
  medecine: 'Médecine',
  'sciences sociales': 'Sciences informatiques'
};
const studyRoomTimeZone = 'Africa/Kinshasa';

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

function parseStudyRoomDate(value) {
  const rawValue = String(value || '').trim();
  if (!rawValue) return null;
  if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(rawValue)) {
    const instant = new Date(rawValue);
    return Number.isNaN(instant.getTime()) ? null : instant;
  }

  const match = rawValue.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return null;
  const [, year, month, day, hour, minute, second = '00'] = match;
  const wallClockAsUtc = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
  let candidate = wallClockAsUtc;
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: studyRoomTimeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  });

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(candidate)).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
    const displayedAsUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
    candidate = wallClockAsUtc - (displayedAsUtc - candidate);
  }

  return new Date(candidate);
}

function formatStudyRoomDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date invalide';
  const parts = new Intl.DateTimeFormat('fr-FR', {
    timeZone: studyRoomTimeZone,
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
  }).formatToParts(date).reduce((result, part) => ({ ...result, [part.type]: part.value }), {});
  return `${parts.day}/${parts.month}/${parts.year} à ${parts.hour}:${parts.minute}`;
}

function sanitizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizePromoCode(value) {
  return String(value || '').trim().toUpperCase();
}

function serializePromoCode(item) {
  return {
    id: item.id,
    code: item.code,
    label: item.label || item.code,
    isActive: Boolean(item.isActive),
    description: item.description || '',
    createdAt: item.createdAt || new Date().toISOString(),
    updatedAt: item.updatedAt || new Date().toISOString()
  };
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

function buildResetLink(token, requestOrigin) {
  let safeUrl = frontendUrl && /^https?:\/\//.test(frontendUrl) ? frontendUrl : 'http://localhost:3000';
  if (requestOrigin && allowedOrigins.has(requestOrigin)) {
    try {
      if (new URL(requestOrigin).origin !== new URL(safeUrl).origin) safeUrl = requestOrigin;
    } catch (error) {
      // Keep the configured frontend URL if an invalid origin somehow reaches this helper.
    }
  }
  return `${safeUrl}/reset-password.html?token=${encodeURIComponent(token)}`;
}

function createPasswordResetRecord(userId, token) {
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  const hashedToken = hashToken(token);
  const existing = passwordResetTokens.find((item) => item.userId === userId && item.usedAt === null);
  if (existing) {
    existing.tokenHash = hashedToken;
    existing.expiresAt = expiresAt;
    existing.createdAt = new Date().toISOString();
    existing.usedAt = null;
    savePasswordResetTokens();
    return { ...existing };
  }

  const record = {
    id: passwordResetTokens.length ? Math.max(...passwordResetTokens.map((item) => Number(item.id) || 0)) + 1 : 1,
    userId,
    tokenHash: hashedToken,
    createdAt: new Date().toISOString(),
    expiresAt,
    usedAt: null,
    consumedBy: null
  };

  passwordResetTokens.push(record);
  savePasswordResetTokens();
  return record;
}

function consumeResetToken(userId, token) {
  const hashedToken = hashToken(token);
  const now = Date.now();
  const record = passwordResetTokens.find((item) =>
    Number(item.userId) === Number(userId) && item.tokenHash === hashedToken && item.usedAt === null
  );

  if (!record) {
    return null;
  }

  const expiresAt = new Date(record.expiresAt).getTime();
  if (Number.isNaN(expiresAt) || now >= expiresAt) {
    record.usedAt = new Date().toISOString();
    record.consumedBy = 'expired';
    savePasswordResetTokens();
    return null;
  }

  record.usedAt = new Date().toISOString();
  record.consumedBy = 'used';
  savePasswordResetTokens();
  return record;
}

function publicAssignment(assignment) {
  const teacher = users.find((user) => user.id === assignment.teacherId);
  return {
    id: assignment.id,
    title: assignment.title,
    subject: assignment.subject,
    instructions: assignment.instructions,
    type: assignment.type,
    teacherId: assignment.teacherId,
    teacher: teacher?.fullName || 'Enseignant',
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

function assignmentStatusForStudent(assignment, studentId) {
  const attempt = submissions.find((item) => item.assignmentId === assignment.id && item.studentId === studentId);
  if (attempt?.status === 'submitted') return 'submitted';
  if (attempt?.status === 'in_progress') return Date.now() >= new Date(attempt.expiresAt).getTime() ? 'expired' : 'in_progress';
  if (Date.now() < new Date(assignment.startAt).getTime()) return 'upcoming';
  if (Date.now() > new Date(assignment.endAt).getTime()) return 'expired';
  return 'available';
}

function normalizeAcademicValue(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’']/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function resolveAllowedAcademicValue(value, allowedValues) {
  const normalizedValue = normalizeAcademicValue(value);
  if (!normalizedValue) {
    return null;
  }

  const aliasedValue = academicLegacyAliases[normalizedValue] || null;
  const match = allowedValues.find((allowed) => normalizeAcademicValue(allowed) === normalizedValue)
    || (aliasedValue ? allowedValues.find((allowed) => normalizeAcademicValue(allowed) === normalizeAcademicValue(aliasedValue)) : null);

  if (match) {
    return match;
  }

  if (/^\d{4}$/.test(normalizedValue) || /^\d{4}[a-zA-Z-]*$/.test(normalizedValue)) {
    return String(value).trim();
  }

  return null;
}

function studentMatchesAssignment(student, assignment) {
  if (!assignment) return false;
  const requiredFaculty = resolveAllowedAcademicValue(assignment.faculty || assignment.faculte, allowedFaculties);
  const requiredPromotion = resolveAllowedAcademicValue(assignment.promotion || assignment.promo, allowedPromotions);
  const studentFaculty = resolveAllowedAcademicValue(student?.faculte || student?.filiere, allowedFaculties);
  const studentPromotion = resolveAllowedAcademicValue(student?.promotion, allowedPromotions);

  return Boolean(requiredFaculty && requiredPromotion && studentFaculty && studentPromotion)
    && normalizeAcademicValue(studentFaculty) === normalizeAcademicValue(requiredFaculty)
    && normalizeAcademicValue(studentPromotion) === normalizeAcademicValue(requiredPromotion);
}

function assignmentTypeLabel(type) {
  return type === 'devoir' ? 'devoir' : type === 'examen' ? 'examen' : 'interrogation';
}

function teacherAssignmentTargetedStudents(assignment) {
  return users.filter((user) => user.role === 'student' && isUserActive(user) && studentMatchesAssignment(user, assignment));
}

function studentAssignment(assignment, studentId) {
  const student = users.find((user) => user.id === studentId);
  const status = assignmentStatusForStudent(assignment, studentId);
  return {
    ...publicAssignment(assignment),
    studentStatus: status,
    canAccess: student ? studentMatchesAssignment(student, assignment) : false
  };
}

app.get('/api/health', (req, res) => {
  const serverNow = Date.now();
  res.json({
    message: 'StudyRoom API est en ligne.',
    status: 'ok',
    version: '1.0.0',
    timezone: studyRoomTimeZone,
    serverNow,
    kinshasaTime: formatStudyRoomDate(serverNow)
  });
});

app.get('/api/server-time', (req, res) => {
  res.json({
    timezone: studyRoomTimeZone,
    serverNow: Date.now(),
    serverIso: new Date().toISOString(),
    kinshasaTime: formatStudyRoomDate(Date.now())
  });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.post('/api/auth/register', (req, res) => {
  const { nom, postnom, prenom, fullName, email, password, sexe, matricule, promotion, faculte, filiere } = req.body || {};

  const derivedFullName = [nom, postnom, prenom].filter((value) => String(value || '').trim()).join(' ') || String(fullName || '').trim();
  const finalEmail = String(email || '').trim();
  const finalPassword = String(password || '');
  const selectedFaculte = resolveAllowedAcademicValue(faculte || filiere || '', allowedFaculties);
  const selectedPromotion = resolveAllowedAcademicValue(promotion, allowedPromotions);

  if (!derivedFullName || !finalEmail || !finalPassword || !matricule || !sexe || !selectedFaculte || !selectedPromotion) {
    return res.status(400).json({ message: 'Nom, postnom, prénom, matricule, sexe, faculté, promotion, email et mot de passe sont requis.' });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(finalEmail)) {
    return res.status(400).json({ message: 'L’adresse e-mail est invalide.' });
  }

  if (!isValidPassword(finalPassword)) {
    return res.status(400).json({ message: 'Le mot de passe doit contenir au moins 8 caractères.' });
  }

  if (users.some((item) => item.email.toLowerCase() === finalEmail.toLowerCase())) {
    return res.status(409).json({ message: 'Un compte avec cet email existe déjà.' });
  }

  const newUser = createUserRecord({
    fullName: derivedFullName,
    email: finalEmail,
    password: finalPassword,
    role: 'student',
    sexe,
    matricule,
    promotion: selectedPromotion,
    filiere: selectedFaculte,
    faculte: selectedFaculte
  });

  const token = createToken(newUser);

  return res.status(201).json({
    message: 'Compte créé avec succès.',
    token,
    user: serializeUser(newUser)
  });
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body || {};
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const normalizedPassword = String(password || '');

  if (!normalizedEmail || !normalizedPassword) {
    return res.status(400).json({ message: 'Email et mot de passe requis.' });
  }

  const user = users.find((item) => item.email.toLowerCase() === normalizedEmail);

  if (!user || !isUserActive(user) || !verifyPassword(normalizedPassword, user.passwordHash)) {
    return res.status(401).json({ message: 'Identifiants incorrects.' });
  }

  user.lastLoginAt = new Date().toISOString();
  user.lastActivityAt = user.lastLoginAt;
  saveUsers();

  const token = createToken(user);

  res.json({
    message: 'Connexion réussie.',
    token,
    user: serializeUser(user)
  });
});

app.post('/api/auth/forgot-password', async (req, res) => {
  const { email } = req.body || {};
  const normalizedEmail = sanitizeEmail(email);

  if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return res.status(400).json({ message: 'Veuillez saisir une adresse e-mail valide.' });
  }

  const smtpReady = smtpHost !== 'localhost'
    && (smtpHost !== 'smtp.gmail.com' || smtpCredentialsConfigured);
  if (!smtpReady) {
    return res.status(503).json({
      message: 'Le service d’envoi d’e-mails n’est pas configuré. Veuillez contacter l’administrateur.'
    });
  }

  const user = users.find((item) => sanitizeEmail(item.email) === normalizedEmail && isUserActive(item));
  const genericResponse = {
    message: 'Si un compte correspond à cette adresse e-mail, un message de récupération sera envoyé.'
  };

  if (!user) {
    return res.status(200).json(genericResponse);
  }

  const requestKey = `pwreset:${normalizedEmail}`;
  const now = Date.now();
  const previousAttempt = global.__studyroomResetRequests || {};
  const lastRequestedAt = Number(previousAttempt[requestKey] || 0);

  if (!Number.isNaN(lastRequestedAt) && now - lastRequestedAt < 60 * 1000) {
    return res.status(200).json(genericResponse);
  }

  previousAttempt[requestKey] = now;
  global.__studyroomResetRequests = previousAttempt;

  const token = generateResetToken();
  createPasswordResetRecord(user.id, token);
  const resetLink = buildResetLink(token, req.get('origin'));

  try {
    await mailTransporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: user.email,
      subject: 'Réinitialisation de votre mot de passe StudyRoom',
      text: `Bonjour ${user.fullName},\n\nPour réinitialiser votre mot de passe, cliquez sur le lien ci-dessous :\n${resetLink}\n\nCe lien est valable 15 minutes.\n\nStudyRoom`,
      html: `<p>Bonjour ${escapeHtml(user.fullName)},</p><p>Pour réinitialiser votre mot de passe, cliquez sur le lien ci-dessous :</p><p><a href="${resetLink}">Réinitialiser mon mot de passe</a></p><p>Ce lien est valable 15 minutes.</p><p>StudyRoom</p>`
    });
  } catch (error) {
    const pending = passwordResetTokens.find((item) => item.userId === user.id && item.tokenHash === hashToken(token) && item.usedAt === null);
    if (pending) {
      pending.usedAt = new Date().toISOString();
      pending.consumedBy = 'delivery-failed';
      savePasswordResetTokens();
    }
    console.error('[StudyRoom] Unable to send password-reset email', error);
  }

  return res.status(200).json(genericResponse);
});

app.post('/api/auth/reset-password', (req, res) => {
  const { token, password } = req.body || {};
  const normalizedToken = String(token || '').trim();
  const newPassword = String(password || '');

  if (!normalizedToken || !newPassword) {
    return res.status(400).json({ message: 'Le jeton et le nouveau mot de passe sont requis.' });
  }

  if (!isValidPassword(newPassword)) {
    return res.status(400).json({ message: 'Le mot de passe doit contenir au moins 8 caractères.' });
  }

  const validRecords = passwordResetTokens.filter((record) => record.usedAt === null && record.expiresAt && new Date(record.expiresAt).getTime() > Date.now());
  const matchingRecord = validRecords.find((record) => record.tokenHash === hashToken(normalizedToken));

  if (!matchingRecord) {
    return res.status(400).json({ message: 'Jeton de réinitialisation invalide ou expiré.' });
  }

  const user = users.find((item) => item.id === Number(matchingRecord.userId) && isUserActive(item));
  if (!user) {
    return res.status(400).json({ message: 'Jeton de réinitialisation invalide ou expiré.' });
  }

  const previousHash = user.passwordHash;
  const updatedHash = hashPassword(newPassword);

  if (verifyPassword(newPassword, previousHash)) {
    return res.status(400).json({ message: 'Ce mot de passe est identique au précédent.' });
  }

  user.passwordHash = updatedHash;
  user.tokenVersion = (Number(user.tokenVersion) || 0) + 1;
  consumeResetToken(user.id, normalizedToken);
  saveUsers();

  return res.status(200).json({
    message: 'Votre mot de passe a été réinitialisé avec succès.'
  });
});

app.post('/api/auth/logout', authenticate, (req, res) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

  if (token) {
    revokeToken(token);
  }

  return res.status(200).json({
    message: 'Déconnexion réussie. La session a été invalidée.'
  });
});

app.post('/api/auth/change-password', authenticate, (req, res) => {
  const { currentPassword, newPassword, confirmPassword } = req.body || {};
  const user = users.find((item) => item.id === req.user.id);

  if (!user) {
    return res.status(404).json({ message: 'Utilisateur introuvable.' });
  }

  if (!currentPassword || !newPassword || !confirmPassword) {
    return res.status(400).json({ message: 'L’ancien mot de passe, le nouveau mot de passe et sa confirmation sont requis.' });
  }

  if (newPassword !== confirmPassword) {
    return res.status(400).json({ message: 'La confirmation du nouveau mot de passe ne correspond pas.' });
  }

  if (!verifyPassword(currentPassword, user.passwordHash)) {
    return res.status(401).json({ message: 'L’ancien mot de passe est incorrect.' });
  }

  if (!isValidPassword(newPassword)) {
    return res.status(400).json({ message: 'Le mot de passe doit contenir au moins 8 caractères.' });
  }

  if (verifyPassword(newPassword, user.passwordHash)) {
    return res.status(400).json({ message: 'Le nouveau mot de passe doit être différent de l’ancien.' });
  }

  user.passwordHash = hashPassword(newPassword);
  user.tokenVersion = (Number(user.tokenVersion) || 0) + 1;
  user.lastActivityAt = new Date().toISOString();
  saveUsers();

  return res.status(200).json({
    message: 'Votre mot de passe a été modifié avec succès.'
  });
});

app.get('/api/profile', authenticate, (req, res) => {
  const user = users.find((item) => item.id === req.user.id);

  if (!user) {
    return res.status(404).json({ message: 'Utilisateur introuvable.' });
  }

  const profile = serializeUser(user);
  return res.json({
    user: profile,
    preferences: profile.preferences,
    lastActivityAt: user.lastActivityAt || user.lastLoginAt || null
  });
});

app.get('/api/profile/preferences', authenticate, (req, res) => {
  const user = users.find((item) => item.id === req.user.id);
  if (!user) {
    return res.status(404).json({ message: 'Utilisateur introuvable.' });
  }

  const preferences = normalizeUserPreferences(user.preferences);
  return res.json({ preferences });
});

app.post('/api/profile/preferences', authenticate, (req, res) => {
  const user = users.find((item) => item.id === req.user.id);
  if (!user) {
    return res.status(404).json({ message: 'Utilisateur introuvable.' });
  }

  const incoming = req.body || {};
  const mergedPreferences = normalizeUserPreferences({
    ...user.preferences,
    ...incoming,
    notifications: { ...(user.preferences?.notifications || {}), ...(incoming.notifications || {}) },
    accessibility: { ...(user.preferences?.accessibility || {}), ...(incoming.accessibility || {}) },
    communication: { ...(user.preferences?.communication || {}), ...(incoming.communication || {}) },
    navigation: { ...(user.preferences?.navigation || {}), ...(incoming.navigation || {}) }
  });

  user.preferences = mergedPreferences;
  user.lastActivityAt = new Date().toISOString();
  saveUsers();

  return res.json({
    message: 'Préférences mises à jour.',
    preferences: mergedPreferences,
    user: serializeUser(user)
  });
});

app.get('/api/student/dashboard', authenticate, authorize(['student']), (req, res) => {
  const user = users.find((item) => item.id === req.user.id);
  if (!user) {
    return res.status(404).json({ message: 'Étudiant introuvable.' });
  }

  const eligibleAssignments = assignments.filter((item) => item.status === 'published' && studentMatchesAssignment(user, item));

  res.json({
    user: { fullName: user.fullName, email: user.email, matricule: user.matricule, promotion: user.promotion, faculte: user.faculte || user.filiere, filiere: user.filiere, classe: user.classe, sexe: user.sexe },
    dashboard: {
      courses: [],
      assignments: eligibleAssignments.map((item) => studentAssignment(item, req.user.id))
    }
  });
});

app.get('/api/assignments', authenticate, (req, res) => {
  if (req.user.role === 'student') {
    const user = users.find((item) => item.id === req.user.id);
    return res.json({ assignments: assignments.filter((item) => item.status === 'published' && studentMatchesAssignment(user, item)).map((item) => studentAssignment(item, req.user.id)) });
  }

  return res.json({ assignments: assignments.filter((item) => item.teacherId === req.user.id).map(teacherAssignment) });
});

app.post('/api/assignments', authenticate, authorize(['teacher']), (req, res) => {
  const { title, subject, type, faculty, promotion, startAt, endAt, duration, instructions, questions } = req.body || {};
  if (!title || !instructions || !assignmentTypes.has(type) || !faculty || !promotion || !startAt || !endAt || !Array.isArray(questions) || !questions.length) {
    return res.status(400).json({ message: 'Le titre, le type, la faculté, la promotion, les dates, les instructions et les questions sont obligatoires.' });
  }

  if (typeof title !== 'string' || title.trim().length < 3) {
    return res.status(400).json({ message: 'Le titre de l’évaluation est invalide.' });
  }

  const normalizedFaculty = faculty ? resolveAllowedAcademicValue(faculty, allowedFaculties) : null;
  const normalizedPromotion = promotion ? resolveAllowedAcademicValue(promotion, allowedPromotions) : null;
  const normalizedInstructions = String(instructions).trim();

  if (faculty && !normalizedFaculty) {
    return res.status(400).json({ message: 'La faculté ciblée doit être choisie parmi les valeurs autorisées.' });
  }

  if (promotion && !normalizedPromotion) {
    return res.status(400).json({ message: 'La promotion ciblée doit être choisie parmi les valeurs autorisées.' });
  }

  const start = parseStudyRoomDate(startAt);
  const end = parseStudyRoomDate(endAt);
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
    subject: String(subject || title).trim(),
    instructions: normalizedInstructions,
    type,
    faculty: normalizedFaculty,
    promotion: normalizedPromotion,
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

  const targetStudents = teacherAssignmentTargetedStudents(assignment);
  const assignmentLabel = assignmentTypeLabel(assignment.type);

  targetStudents.forEach((student) => {
    notifications.push({
      id: nextId(notifications),
      userId: student.id,
      title: `Nouvelle ${assignmentLabel}`,
      message: `Une ${assignmentLabel} intitulée “${assignment.title}” a été publiée pour votre faculté et votre promotion.`,
      date: new Date().toISOString(),
      read: false
    });
  });
  saveNotifications();

  return res.status(201).json({ assignment: teacherAssignment(assignment) });
});

app.get('/api/assignments/:assignmentId', authenticate, (req, res) => {
  const assignment = assignments.find((item) => item.id === Number(req.params.assignmentId));
  if (!assignment || assignment.status !== 'published') return res.status(404).json({ message: 'Évaluation introuvable.' });
  if (req.user.role === 'student') {
    const student = users.find((item) => item.id === req.user.id);
    if (!student || !studentMatchesAssignment(student, assignment)) {
      return res.status(403).json({ message: 'Vous n’êtes pas autorisé à accéder à cette évaluation.' });
    }
    return res.json({ assignment: publicAssignment(assignment) });
  }
  if (req.user.role !== 'teacher' || assignment.teacherId !== req.user.id) return res.status(403).json({ message: 'Accès interdit à cette évaluation.' });
  return res.json({ assignment: teacherAssignment(assignment) });
});

app.post('/api/assignments/:assignmentId/start', authenticate, authorize(['student']), (req, res) => {
  const assignment = assignments.find((item) => item.id === Number(req.params.assignmentId));
  const student = users.find((item) => item.id === req.user.id);
  if (!assignment || assignment.status !== 'published') return res.status(404).json({ message: 'Évaluation introuvable.' });
  if (!student || !studentMatchesAssignment(student, assignment)) return res.status(403).json({ message: 'Cette évaluation n’est pas ouverte pour votre faculté ou promotion.' });
  const now = Date.now();
  if (now < new Date(assignment.startAt).getTime()) return res.status(403).json({ message: `Cette interrogation n’est pas encore disponible. Elle sera accessible à partir de ${formatStudyRoomDate(assignment.startAt)}.` });
  if (now > new Date(assignment.endAt).getTime()) return res.status(403).json({ message: 'Le temps disponible pour cette interrogation est écoulé. L’accès est fermé.' });
  const existingAttempt = submissions.find((item) => item.assignmentId === assignment.id && item.studentId === req.user.id);
  if (existingAttempt?.status === 'submitted') return res.status(409).json({ message: 'Vous avez déjà soumis cette interrogation.' });
  if (existingAttempt?.status === 'expired') return res.status(403).json({ message: 'Votre temps est écoulé. La tentative est maintenant fermée.' });
  if (existingAttempt?.status === 'in_progress') {
    const remainingSeconds = Math.max(Math.ceil((new Date(existingAttempt.expiresAt).getTime() - Date.now()) / 1000), 0);
    if (!remainingSeconds) {
      existingAttempt.status = 'expired';
      saveSubmissions();
      return res.status(403).json({ message: 'Votre temps est écoulé. La tentative est maintenant fermée.' });
    }
    return res.status(200).json({ serverNow: Date.now(), attempt: { id: existingAttempt.id, startedAt: existingAttempt.startedAt, expiresAt: existingAttempt.expiresAt, remainingSeconds, answers: existingAttempt.answers || [] }, assignment: publicAssignment(assignment) });
  }
  const startedAt = new Date(now);
  const expiresAt = new Date(Math.min(now + assignment.duration * 60000, new Date(assignment.endAt).getTime()));
  const attempt = { id: nextId(submissions), assignmentId: assignment.id, studentId: req.user.id, startedAt: startedAt.toISOString(), expiresAt: expiresAt.toISOString(), status: 'in_progress', answers: [] };
  submissions.push(attempt);
  saveSubmissions();
  return res.status(201).json({ serverNow: Date.now(), attempt: { id: attempt.id, startedAt: attempt.startedAt, expiresAt: attempt.expiresAt, remainingSeconds: Math.max(Math.ceil((expiresAt.getTime() - now) / 1000), 0), answers: [] }, assignment: publicAssignment(assignment) });
});

app.get('/api/assignments/:assignmentId/attempt', authenticate, authorize(['student']), (req, res) => {
  const assignment = assignments.find((item) => item.id === Number(req.params.assignmentId));
  const attempt = submissions.find((item) => item.assignmentId === Number(req.params.assignmentId) && item.studentId === req.user.id && item.status === 'in_progress');
  if (!assignment || !attempt) return res.status(404).json({ message: 'Aucune tentative en cours.' });
  const student = users.find((item) => item.id === req.user.id);
  if (assignment.status !== 'published' || !student || !studentMatchesAssignment(student, assignment)) {
    return res.status(403).json({ message: 'Vous n’êtes pas autorisé à accéder à cette tentative.' });
  }
  const remainingSeconds = Math.max(Math.ceil((new Date(attempt.expiresAt).getTime() - Date.now()) / 1000), 0);
  if (!remainingSeconds) {
    attempt.status = 'expired';
    saveSubmissions();
    return res.status(403).json({ message: 'Votre temps est écoulé. La tentative est maintenant fermée.' });
  }
  return res.json({ serverNow: Date.now(), attempt: { id: attempt.id, startedAt: attempt.startedAt, expiresAt: attempt.expiresAt, remainingSeconds, answers: attempt.answers || [] }, assignment: publicAssignment(assignment) });
});

app.patch('/api/assignments/:assignmentId/attempt', authenticate, authorize(['student']), (req, res) => {
  const attempt = submissions.find((item) => item.assignmentId === Number(req.params.assignmentId) && item.studentId === req.user.id && item.status === 'in_progress');
  if (!attempt) return res.status(404).json({ message: 'Tentative introuvable ou déjà fermée.' });
  const assignment = assignments.find((item) => item.id === attempt.assignmentId);
  const student = users.find((item) => item.id === req.user.id);
  if (!assignment || assignment.status !== 'published' || !student || !studentMatchesAssignment(student, assignment)) {
    return res.status(403).json({ message: 'Vous n’êtes pas autorisé à modifier cette tentative.' });
  }
  if (Date.now() > new Date(attempt.expiresAt).getTime()) {
    attempt.status = 'expired';
    saveSubmissions();
    return res.status(403).json({ message: 'Votre temps est écoulé. La tentative est maintenant fermée.' });
  }
  const answers = Array.isArray(req.body?.answers) ? req.body.answers : [];
  const validQuestionIds = new Set(assignment.questions.map((question) => question.id));
  attempt.answers = answers.filter((answer) => validQuestionIds.has(Number(answer.questionId))).map((answer) => ({ questionId: Number(answer.questionId), answer: answer.answer }));
  saveSubmissions();
  return res.status(204).send();
});

app.post('/api/assignments/:assignmentId/submit', authenticate, authorize(['student']), (req, res) => {
  const assignment = assignments.find((item) => item.id === Number(req.params.assignmentId));
  const student = users.find((item) => item.id === req.user.id);
  if (!assignment || assignment.status !== 'published') return res.status(404).json({ message: 'Évaluation introuvable.' });
  if (!student || !studentMatchesAssignment(student, assignment)) return res.status(403).json({ message: 'Cette évaluation n’est pas ouverte pour votre compte.' });
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
  notifications.push({
    id: nextId(notifications),
    userId: user.id,
    title: `Résultat de la ${assignmentTypeLabel(assignment.type)}`,
    message: `Votre résultat de la ${assignmentTypeLabel(assignment.type)} “${assignment.title}” est maintenant disponible.`,
    date: attempt.submittedAt,
    read: false
  });
  saveNotifications();
  return res.status(201).json({ result: studentResult(result) });
});

app.get('/api/student/results', authenticate, authorize(['student']), (req, res) => {
  const student = users.find((item) => item.id === req.user.id);
  if (!student) return res.status(404).json({ message: 'Étudiant introuvable.' });
  return res.json({ results: results.filter((item) => {
    const assignment = assignments.find((candidate) => candidate.id === item.assignmentId);
    return item.studentId === student.id && assignment && studentMatchesAssignment(student, assignment);
  }).map(studentResult) });
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
  const studentCount = users.filter((user) => user.role === 'student' && isUserActive(user)).length;
  const teacherAssignmentsCount = assignments.filter((assignment) => assignment.teacherId === req.user.id).length;
  const pendingReviews = results.filter((result) => assignments.some((assignment) => assignment.id === result.assignmentId && assignment.teacherId === req.user.id)).length;

  res.json({
    message: 'Tableau de bord enseignant.',
    statistics: {
      courses: 0,
      assignments: teacherAssignmentsCount,
      pendingReviews,
      students: studentCount
    }
  });
});

app.get('/api/admin/promo-codes', authenticate, authorize(['admin']), (req, res) => {
  return res.json({
    promoCodes: promoCodes.map(serializePromoCode)
  });
});

app.post('/api/admin/promo-codes', authenticate, authorize(['admin']), (req, res) => {
  const { code, label, description, isActive } = req.body || {};
  const normalizedCode = normalizePromoCode(code);

  if (!/^[A-Z0-9_-]{4,32}$/.test(normalizedCode)) {
    return res.status(400).json({ message: 'Le code promo doit contenir de 4 à 32 lettres, chiffres, tirets ou tirets bas.' });
  }

  if (typeof label === 'string' && label.trim().length > 100) return res.status(400).json({ message: 'Le libellé ne peut pas dépasser 100 caractères.' });
  if (typeof description === 'string' && description.trim().length > 500) return res.status(400).json({ message: 'La description ne peut pas dépasser 500 caractères.' });
  if (isActive !== undefined && typeof isActive !== 'boolean') return res.status(400).json({ message: 'Le statut actif doit être un booléen.' });

  const existing = promoCodes.find((item) => normalizePromoCode(item.code) === normalizedCode);
  if (existing) {
    return res.status(409).json({ message: 'Ce code promo existe déjà.' });
  }

  const newCode = {
    id: nextId(promoCodes),
    code: normalizedCode,
    label: String(label || normalizedCode).trim() || normalizedCode,
    description: String(description || '').trim(),
    isActive: isActive === true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  promoCodes.push(newCode);
  savePromoCodes();

  return res.status(201).json({
    message: 'Code promo créé avec succès.',
    promoCode: serializePromoCode(newCode)
  });
});

app.patch('/api/admin/promo-codes/:id', authenticate, authorize(['admin']), (req, res) => {
  const promoId = Number(req.params.id);
  const codeEntry = promoCodes.find((item) => Number(item.id) === promoId);

  if (!codeEntry) {
    return res.status(404).json({ message: 'Code promo introuvable.' });
  }

  const { code, label, description, isActive } = req.body || {};
  const normalizedCode = typeof code === 'string' && code.trim() ? normalizePromoCode(code) : null;
  if (normalizedCode && !/^[A-Z0-9_-]{4,32}$/.test(normalizedCode)) return res.status(400).json({ message: 'Le code promo est invalide.' });
  if (normalizedCode && promoCodes.some((item) => item !== codeEntry && normalizePromoCode(item.code) === normalizedCode)) return res.status(409).json({ message: 'Ce code promo existe déjà.' });
  if (typeof label === 'string' && label.trim().length > 100) return res.status(400).json({ message: 'Le libellé ne peut pas dépasser 100 caractères.' });
  if (typeof description === 'string' && description.trim().length > 500) return res.status(400).json({ message: 'La description ne peut pas dépasser 500 caractères.' });
  if (isActive !== undefined && typeof isActive !== 'boolean') return res.status(400).json({ message: 'Le statut actif doit être un booléen.' });

  if (normalizedCode) {
    codeEntry.code = normalizedCode;
  }
  if (typeof label === 'string') {
    codeEntry.label = label.trim() || codeEntry.code;
  }
  if (typeof description === 'string') {
    codeEntry.description = description.trim();
  }
  if (typeof isActive === 'boolean') {
    codeEntry.isActive = isActive;
  }
  codeEntry.updatedAt = new Date().toISOString();
  savePromoCodes();

  return res.json({
    message: 'Code promo mis à jour.',
    promoCode: serializePromoCode(codeEntry)
  });
});

app.get('/api/student/promo-status', authenticate, authorize(['student']), (req, res) => {
  const { code } = req.query || {};
  const normalizedCode = normalizePromoCode(code);

  if (!normalizedCode) {
    return res.status(400).json({ message: 'Code promo requis.' });
  }

  const matched = promoCodes.find((item) => normalizePromoCode(item.code) === normalizedCode);
  if (!matched) {
    return res.status(404).json({ message: 'Code promo introuvable.' });
  }

  return res.json({
    valid: Boolean(matched.isActive),
    promoCode: serializePromoCode(matched),
    message: matched.isActive ? 'Code promo actif.' : 'Ce code promo est actuellement désactivé par l’administrateur.'
  });
});

app.get('/api/admin/users', authenticate, authorize(['admin']), (req, res) => {
  const activeUsers = users.filter(isUserActive).map(serializeUser);

  res.json({
    users: activeUsers
  });
});

app.get('/api/admin/students', authenticate, authorize(['admin']), (req, res) => {
  const rawPage = Number(req.query.page) || 1;
  const rawLimit = Number(req.query.limit) || 50;
  const page = Math.max(1, rawPage);
  const limit = Math.min(100, Math.max(1, rawLimit));
  const students = users
    .filter((user) => user.role === 'student' && isUserActive(user))
    .map(serializeUser)
    .sort((first, second) => String(first.fullName || '').localeCompare(String(second.fullName || '')));

  const total = students.length;
  const startIndex = (page - 1) * limit;

  res.json({
    total,
    page,
    limit,
    students: students.slice(startIndex, startIndex + limit)
  });
});

app.delete('/api/admin/students/:id', authenticate, authorize(['admin']), (req, res) => {
  const studentId = Number(req.params.id);
  const student = users.find((user) => user.id === studentId && user.role === 'student');

  if (!student) {
    return res.status(404).json({ message: 'Étudiant introuvable.' });
  }

  if (student.isActive === false || student.deletedAt) {
    return res.status(409).json({ message: 'Ce compte étudiant est déjà désactivé.' });
  }

  student.isActive = false;
  student.deletedAt = new Date().toISOString();
  saveUsers();

  return res.json({
    message: 'Compte étudiant désactivé avec succès.',
    student: {
      id: student.id,
      fullName: student.fullName,
      email: student.email,
      isActive: student.isActive,
      deletedAt: student.deletedAt
    }
  });
});

app.delete('/api/assignments/:assignmentId', authenticate, authorize(['teacher']), (req, res) => {
  const assignmentId = Number(req.params.assignmentId);
  const assignmentIndex = assignments.findIndex((item) => item.id === assignmentId && item.teacherId === req.user.id);

  if (assignmentIndex === -1) {
    return res.status(404).json({ message: 'Ce travail est introuvable ou ne vous appartient pas.' });
  }

  const [deletedAssignment] = assignments.splice(assignmentIndex, 1);
  submissions.splice(0, submissions.length, ...submissions.filter((entry) => entry.assignmentId !== assignmentId));
  saveAssignments();
  saveSubmissions();

  return res.json({
    message: 'Travail supprimé avec succès.',
    assignment: { id: deletedAssignment.id, title: deletedAssignment.title, type: deletedAssignment.type }
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

  const selectedPromotion = allowedRole === 'student' ? resolveAllowedAcademicValue(promotion, allowedPromotions) : null;
  const selectedFaculty = allowedRole === 'student' ? resolveAllowedAcademicValue(filiere || '', allowedFaculties) : null;

  if (allowedRole === 'student' && (!selectedPromotion || !selectedFaculty)) {
    return res.status(400).json({ message: 'La promotion et la faculté de l’étudiant doivent être choisies parmi les valeurs autorisées.' });
  }

  const newUser = createUserRecord({
    fullName,
    email,
    password,
    role: allowedRole,
    sexe,
    matricule,
    promotion: selectedPromotion || promotion,
    filiere: selectedFaculty || filiere,
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
