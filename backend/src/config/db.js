const fs = require('fs');
const path = require('path');
const { users: defaultUsers, courses, assignments, notifications } = require('../data/mockData');

const usersFile = path.join(__dirname, '../data/users.json');
const resultsFile = path.join(__dirname, '../data/results.json');

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

let users = readUsers();
let results = readResults();

function saveUsers() {
  fs.writeFileSync(usersFile, JSON.stringify(users, null, 2), 'utf8');
}

function saveResults() {
  fs.writeFileSync(resultsFile, JSON.stringify(results, null, 2), 'utf8');
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
  results,
  saveUsers,
  saveResults,
  sortResultsByStudentName
};
