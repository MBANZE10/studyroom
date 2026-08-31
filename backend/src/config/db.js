const fs = require('fs');
const path = require('path');
const { users: defaultUsers, courses, assignments, notifications } = require('../data/mockData');

const usersFile = path.join(__dirname, '../data/users.json');

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

let users = readUsers();

function saveUsers() {
  fs.writeFileSync(usersFile, JSON.stringify(users, null, 2), 'utf8');
}

module.exports = {
  users,
  courses,
  assignments,
  notifications,
  saveUsers
};
