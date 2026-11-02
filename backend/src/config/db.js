const fs = require('fs');
const path = require('path');
const { users: defaultUsers, courses } = require('../data/mockData');

const dataDirectory = process.env.STUDYROOM_DATA_DIR || path.join(__dirname, '../data');
fs.mkdirSync(dataDirectory, { recursive: true });
const usersFile = path.join(dataDirectory, 'users.json');
const resultsFile = path.join(dataDirectory, 'results.json');
const assignmentsFile = path.join(dataDirectory, 'assignments.json');
const submissionsFile = path.join(dataDirectory, 'submissions.json');
const notificationsFile = path.join(dataDirectory, 'notifications.json');
const promoCodesFile = path.join(dataDirectory, 'promoCodes.json');
const passwordResetTokensFile = path.join(dataDirectory, 'passwordResetTokens.json');

function readUsers() {
  try {
    const raw = fs.readFileSync(usersFile, 'utf8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && (parsed.length || process.env.NODE_ENV !== 'production')) {
      return parsed;
    }
  } catch (error) {
    // Fichier absent ou invalide : on utilise les données de démonstration.
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('users.json is missing, invalid, or empty in production; refusing to use demo accounts.');
  }
  return defaultUsers.map((user) => ({ ...user }));
}

function readResults() {
  try {
    const raw = fs.readFileSync(resultsFile, 'utf8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed;
    }
  } catch (error) {
    if (process.env.NODE_ENV === 'production' && error.code !== 'ENOENT') {
      throw new Error('Unable to load results.json in production.');
    }
    // Fichier absent ou invalide : on initialise la liste vide.
  }

  if (process.env.NODE_ENV === 'production' && fs.existsSync(resultsFile)) {
    throw new Error('results.json is invalid in production.');
  }

  return [];
}

function readCollection(file) {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (Array.isArray(parsed)) return parsed;
    if (process.env.NODE_ENV === 'production') {
      throw new Error(`Collection ${path.basename(file)} must be a JSON array.`);
    }
    return [];
  } catch (error) {
    if (process.env.NODE_ENV === 'production' && error.code !== 'ENOENT') {
      throw new Error(`Unable to load collection ${path.basename(file)} in production.`);
    }
    return [];
  }
}

let users = readUsers();
let results = readResults();
const assignments = readCollection(assignmentsFile);
const submissions = readCollection(submissionsFile);
const notifications = readCollection(notificationsFile);
const promoCodes = readCollection(promoCodesFile);
const passwordResetTokens = readCollection(passwordResetTokensFile);

function saveUsers() {
  fs.writeFileSync(usersFile, JSON.stringify(users, null, 2), 'utf8');
}

function saveResults() {
  fs.writeFileSync(resultsFile, JSON.stringify(results, null, 2), 'utf8');
}

function saveCollection(file, collection) {
  fs.writeFileSync(file, JSON.stringify(collection, null, 2), 'utf8');
}

function saveAssignments() {
  saveCollection(assignmentsFile, assignments);
}

function saveSubmissions() {
  saveCollection(submissionsFile, submissions);
}

function saveNotifications() {
  saveCollection(notificationsFile, notifications);
}

function savePromoCodes() {
  saveCollection(promoCodesFile, promoCodes);
}

function savePasswordResetTokens() {
  saveCollection(passwordResetTokensFile, passwordResetTokens);
}

function sortResultsByStudentName(items = []) {
  return [...items].sort((a, b) => {
    const first = (a.fullName || '').toLowerCase();
    const second = (b.fullName || '').toLowerCase();
    return first.localeCompare(second);
  });
}

module.exports = {
  users,
  courses,
  assignments,
  notifications,
  submissions,
  results,
  promoCodes,
  passwordResetTokens,
  saveUsers,
  saveResults,
  saveAssignments,
  saveSubmissions,
  saveNotifications,
  savePromoCodes,
  savePasswordResetTokens,
  sortResultsByStudentName
};
