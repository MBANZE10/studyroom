const fs = require('fs');
const path = require('path');
const { users: defaultUsers, courses } = require('../data/mockData');

const usersFile = path.join(__dirname, '../data/users.json');
const resultsFile = path.join(__dirname, '../data/results.json');
const assignmentsFile = path.join(__dirname, '../data/assignments.json');
const submissionsFile = path.join(__dirname, '../data/submissions.json');
const notificationsFile = path.join(__dirname, '../data/notifications.json');

function readUsers() {
  try {
    const raw = fs.readFileSync(usersFile, 'utf8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length) {
      return parsed;
    }
  } catch (error) {
    // Fichier absent ou invalide : on utilise les données de démonstration.
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
    // Fichier absent ou invalide : on initialise la liste vide.
  }

  return [];
}

function readCollection(file) {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

let users = readUsers();
let results = readResults();
const assignments = readCollection(assignmentsFile);
const submissions = readCollection(submissionsFile);
const notifications = readCollection(notificationsFile);

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
  saveUsers,
  saveResults,
  saveAssignments,
  saveSubmissions,
  saveNotifications,
  sortResultsByStudentName
};
