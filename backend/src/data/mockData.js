const bcrypt = require('bcryptjs');

const users = [
  {
    id: 1,
    fullName: 'Enseignant',
    email: 'teacher@studyroom.com',
    passwordHash: bcrypt.hashSync('teacher123', 10),
    role: 'teacher',
    matricule: null,
    promotion: null,
    filiere: null,
    classe: null
  },
  {
    id: 2,
    fullName: 'Admin Principal',
    email: 'admin@studyroom.com',
    passwordHash: bcrypt.hashSync('admin123', 10),
    role: 'admin'
  }
];

const courses = [
  { id: 1, title: 'Programmation Web', teacher: 'Enseignant', students: 42 },
  { id: 2, title: 'Bases de données', teacher: 'Enseignant', students: 38 },
  { id: 3, title: 'Réseaux', teacher: 'Enseignant', students: 31 }
];

const assignments = [
  { id: 1, title: 'Interrogation JavaScript', type: 'interrogation', dueDate: '2026-09-10', status: 'ouverte' },
  { id: 2, title: 'Devoir HTML/CSS', type: 'devoir', dueDate: '2026-09-12', status: 'à faire' },
  { id: 3, title: 'Test SQL', type: 'interrogation', dueDate: '2026-09-15', status: 'ouverte' }
];

const notifications = [
  'Nouvelle interrogation disponible',
  'Devoir soumis et validé',
  'Votre note de JavaScript a été publiée'
];

module.exports = { users, courses, assignments, notifications };
