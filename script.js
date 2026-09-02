const configuredApiBase = window.STUDYROOM_CONFIG?.apiBaseUrl;
const apiBase = typeof configuredApiBase === 'string' ? configuredApiBase.replace(/\/$/, '') : '';

if (!apiBase) {
  throw new Error('StudyRoom: apiBaseUrl doit être configurée dans config.js.');
}

const exams = [
  {
    title: 'Mathématiques',
    level: 'Niveau 1',
    durationMinutes: 30,
    description: 'Test de logique, fractions et équations simples.',
    questions: [
      { question: 'Quelle est la valeur de 7 + 5 ?', options: ['10', '11', '12', '13'], correctIndex: 2 },
      { question: 'Résolvez : 3x = 15', options: ['x = 3', 'x = 4', 'x = 5', 'x = 6'], correctIndex: 2 },
      { question: 'La moitié de 18 est :', options: ['7', '8', '9', '10'], correctIndex: 2 }
    ]
  },
  {
    title: 'Informatique',
    level: 'Niveau 2',
    durationMinutes: 25,
    description: 'Questions sur les bases du web et du JavaScript.',
    questions: [
      { question: 'Que signifie HTML ?', options: ['HyperText Markup Language', 'HighText Main Language', 'HyperTrade Market Language', 'Home Tool Markup Language'], correctIndex: 0 },
      { question: 'Quel mot-clé sert à déclarer une variable en JavaScript ?', options: ['var', 'constant', 'function', 'string'], correctIndex: 0 },
      { question: 'Quelle balise crée un titre principal ?', options: ['<p>', '<h1>', '<div>', '<span>'], correctIndex: 1 }
    ]
  }
];

const state = {
  token: '',
  user: null,
  currentExam: null,
  currentQuestionIndex: 0,
  answers: [],
  studentData: null,
  teacherData: null,
  adminUsers: [],
  adminStudents: [],
  examStartedAt: null,
  examDurationSeconds: 0,
  examTimerId: null,
  examAttemptId: null,
  examExpiresAt: null,
  examLocked: false,
  teacherAssignments: [],
  teacherResults: []
};

const loginModal = document.getElementById('loginModal');
const registerModal = document.getElementById('registerModal');
const adminCreateModal = document.getElementById('adminCreateModal');
const loginMessage = document.getElementById('loginMessage');
const registerMessage = document.getElementById('registerMessage');
const adminCreateMessage = document.getElementById('adminCreateMessage');
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
const openLoginBtn = document.getElementById('openLoginBtn');
const openAdminCreateModalBtn = document.getElementById('openAdminCreateModalBtn');
const accessBtn = document.getElementById('accessBtn');
const closeLoginModal = document.getElementById('closeLoginModal');
const closeRegisterModal = document.getElementById('closeRegisterModal');
const closeAdminCreateModal = document.getElementById('closeAdminCreateModal');
const showRegisterBtn = document.getElementById('showRegisterBtn');
const forgotPasswordBtn = document.getElementById('forgotPasswordBtn');
const logoutBtn = document.getElementById('logoutBtn');
const userLabel = document.getElementById('userLabel');
const homeView = document.getElementById('homeView');
const studentDashboard = document.getElementById('studentDashboard');
const teacherDashboard = document.getElementById('teacherDashboard');
const adminDashboard = document.getElementById('adminDashboard');
const studentTitle = document.getElementById('studentTitle');
const studentCourses = document.getElementById('studentCourses');
const studentAssignments = document.getElementById('studentAssignments');
const studentSubmissions = document.getElementById('studentSubmissions');
const studentNotes = document.getElementById('studentNotes');
const teacherAssignments = document.getElementById('teacherAssignments');
const teacherSubmissions = document.getElementById('teacherSubmissions');
const teacherResultsAssignment = document.getElementById('teacherResultsAssignment');
const teacherResultsList = document.getElementById('teacherResultsList');
const viewTeacherResultsBtn = document.getElementById('viewTeacherResultsBtn');
const exportTeacherResultsBtn = document.getElementById('exportTeacherResultsBtn');
const teacherAssignmentForm = document.getElementById('teacherAssignmentForm');
const adminCreateUserForm = document.getElementById('adminCreateUserForm');
const adminUsersList = document.getElementById('adminUsersList');
const adminStudentSearch = document.getElementById('adminStudentSearch');
const adminStudentsTableBody = document.getElementById('adminStudentsTableBody');
const adminStudentTotal = document.getElementById('adminStudentTotal');
const resultModal = document.getElementById('resultModal');
const resultText = document.getElementById('resultText');
const resultActions = document.getElementById('resultActions');
const closeResultBtn = document.getElementById('closeResultBtn');
const saveResultBtn = document.getElementById('saveResultBtn');
const exportResultBtn = document.getElementById('exportResultBtn');
const quizPanel = document.getElementById('quizPanel');
const questionCard = document.getElementById('questionCard');
const progressBar = document.getElementById('progressBar');
const quizTimer = document.getElementById('quizTimer');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const leaveQuizBtn = document.getElementById('leaveQuizBtn');

function openLogin() {
  loginModal.style.display = 'flex';
  loginModal.setAttribute('aria-hidden', 'false');
}

function closeLogin() {
  loginModal.style.display = 'none';
  loginModal.setAttribute('aria-hidden', 'true');
  loginForm.reset();
  showLoginMessage('', '');
}

function closeRegister() {
  registerModal.style.display = 'none';
  registerModal.setAttribute('aria-hidden', 'true');
  registerForm.reset();
  showRegisterMessage('', '');
}

function openAdminCreateModal() {
  adminCreateModal.style.display = 'flex';
  adminCreateModal.setAttribute('aria-hidden', 'false');
}

function closeAdminCreateModalWindow() {
  adminCreateModal.style.display = 'none';
  adminCreateModal.setAttribute('aria-hidden', 'true');
  adminCreateUserForm.reset();
  showAdminCreateMessage('', '');
}

function openRegister() {
  closeLogin();
  registerModal.style.display = 'flex';
  registerModal.setAttribute('aria-hidden', 'false');
}

function showLoginMessage(message, type) {
  loginMessage.textContent = message;
  loginMessage.className = 'login-message';

  if (type) {
    loginMessage.classList.add(type);
  }
}

function showRegisterMessage(message, type) {
  registerMessage.textContent = message;
  registerMessage.className = 'login-message';

  if (type) {
    registerMessage.classList.add(type);
  }
}

function showAdminCreateMessage(message, type) {
  adminCreateMessage.textContent = message;
  adminCreateMessage.className = 'login-message';

  if (type) {
    adminCreateMessage.classList.add(type);
  }
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

async function handleForgotPassword() {
  const email = document.getElementById('email').value.trim();

  if (!email) {
    showLoginMessage('Veuillez entrer votre adresse e-mail pour réinitialiser le mot de passe.', 'error');
    return;
  }

  try {
    const response = await fetch(`${apiBase}/api/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });

    const data = await response.json();

    if (!response.ok) {
      showLoginMessage(data.message || 'Impossible de réinitialiser le mot de passe.', 'error');
      return;
    }

    showLoginMessage(`Un mot de passe temporaire a été envoyé à ${email}.`, 'success');
    if (data.tempPassword) {
      console.log('Mot de passe temporaire :', data.tempPassword);
    }
  } catch (error) {
    showLoginMessage('Le serveur est indisponible pour la réinitialisation du mot de passe.', 'error');
  }
}

function showOnly(viewName) {
  homeView.classList.toggle('hidden', viewName !== 'home');
  studentDashboard.classList.toggle('hidden', viewName !== 'student');
  teacherDashboard.classList.toggle('hidden', viewName !== 'teacher');
  adminDashboard.classList.toggle('hidden', viewName !== 'admin');
  quizPanel.classList.toggle('hidden', true);
}

function setLoggedUser(user) {
  state.user = user;
  userLabel.textContent = user ? user.fullName : '';
  userLabel.classList.toggle('hidden', !user);
  logoutBtn.classList.toggle('hidden', !user);
  syncResultActions();
}

async function handleRegister(event) {
  event.preventDefault();

  const fullName = document.getElementById('registerFullName').value.trim();
  const email = document.getElementById('registerEmail').value.trim();
  const password = document.getElementById('registerPassword').value.trim();
  const sexe = document.getElementById('registerGender').value;
  const matricule = document.getElementById('registerMatricule').value.trim();
  const faculte = document.getElementById('registerFaculte').value.trim();
  const promotion = document.getElementById('registerPromotion').value.trim();

  if (!fullName || !email || !password || !matricule || !faculte || !promotion) {
    showRegisterMessage('Veuillez remplir tous les champs pour créer votre compte.', 'error');
    return;
  }

  try {
    const response = await fetch(`${apiBase}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fullName, email, password, sexe, matricule, faculte, promotion })
    });

    const data = await response.json();

    if (!response.ok) {
      showRegisterMessage(data.message || 'Impossible de créer le compte.', 'error');
      return;
    }

    closeRegister();
    showLoginMessage('Compte créé avec succès. Vous pouvez maintenant vous connecter.', 'success');
    window.setTimeout(() => showLoginMessage('', ''), 1600);
  } catch (error) {
    showRegisterMessage('Le serveur est inaccessible au moment de l’inscription.', 'error');
  }
}

async function handleLogin(event) {
  event.preventDefault();

  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value.trim();

  if (!email || !password) {
    showLoginMessage('Veuillez remplir tous les champs.', 'error');
    return;
  }

  try {
    const response = await fetch(`${apiBase}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    const data = await response.json();

    if (!response.ok) {
      showLoginMessage(data.message || 'Erreur de connexion.', 'error');
      return;
    }

    state.token = data.token;
    state.user = data.user;
    setLoggedUser(data.user);
    closeLogin();

    if (data.user.role === 'student') {
      await loadStudentDashboard();
      showOnly('student');
    } else if (data.user.role === 'teacher') {
      await loadTeacherDashboard();
      showOnly('teacher');
    } else if (data.user.role === 'admin') {
      await loadAdminDashboard();
      showOnly('admin');
    } else {
      showOnly('home');
    }

    showLoginMessage('Connexion réussie.', 'success');
    window.setTimeout(() => showLoginMessage('', ''), 900);
  } catch (error) {
    showLoginMessage('Serveur indisponible. Vérifiez le backend StudyRoom.', 'error');
  }
}

function logout() {
  state.token = '';
  state.user = null;
  state.studentData = null;
  state.teacherData = null;
  state.adminUsers = [];
  state.teacherResults = [];
  setLoggedUser(null);
  showOnly('home');
  closeLogin();
  closeRegister();
}

function syncResultActions() {
  const isTeacherView = state.user && (state.user.role === 'teacher' || state.user.role === 'admin');
  if (resultActions) {
    resultActions.classList.toggle('hidden', !isTeacherView);
  }
}

async function loadStudentDashboard() {
  const response = await fetch(`${apiBase}/api/student/dashboard`, {
    headers: { Authorization: `Bearer ${state.token}` }
  });

  const data = await response.json();
  state.studentData = data;
  state.teacherAssignments = Array.isArray(data.dashboard?.assignments) ? data.dashboard.assignments : [];

  const user = data.user;
  studentTitle.textContent = `${user.fullName}`;

  document.getElementById('studentCourseCount').textContent = 0;
  document.getElementById('studentTaskCount').textContent = state.teacherAssignments.length;
  document.getElementById('studentNoteCount').textContent = 0;

  studentCourses.innerHTML = `
    <div class="list-item">
      <h4>Aucun cours proposé</h4>
      <p>Les matières seront publiées par l’enseignant.</p>
    </div>
  `;

  if (!state.teacherAssignments.length) {
    studentAssignments.innerHTML = `
      <div class="list-item">
        <h4>Aucun travail publié</h4>
        <p>Les devoirs et interrogations apparaîtront ici dès que l’enseignant les publiera.</p>
      </div>
    `;
  } else {
    studentAssignments.innerHTML = state.teacherAssignments.map((item) => `
      <div class="list-item">
        <h4>${item.title}</h4>
        <p>${item.subject} • ${item.type} • ${item.duration} min</p>
        <p>Début : ${new Date(item.startAt).toLocaleString()} • Fin : ${new Date(item.endAt).toLocaleString()}</p>
        <button type="button" class="secondary-button start-exam" data-title="${item.title}">Répondre</button>
      </div>
    `).join('');
  }

  const examButtons = studentAssignments.querySelectorAll('.start-exam');
  examButtons.forEach((button) => {
    button.addEventListener('click', () => startQuizFromTask(button.dataset.title));
  });

  studentSubmissions.innerHTML = `
    <div class="list-item">
      <h4>Aucune soumission</h4>
      <p>Les soumissions apparaîtront ici après publication d’un travail par l’enseignant.</p>
    </div>
  `;

  studentNotes.innerHTML = `
    <div class="list-item">
      <h4>Aucune note publiée</h4>
      <p>Les notes seront affichées ici après correction automatique.</p>
    </div>
  `;

  try {
    const resultsResponse = await fetch(`${apiBase}/api/student/results`, {
      headers: { Authorization: `Bearer ${state.token}` }
    });
    const resultsData = await resultsResponse.json();
    const studentResults = Array.isArray(resultsData.results) ? resultsData.results : [];
    document.getElementById('studentNoteCount').textContent = studentResults.length;
    studentNotes.innerHTML = studentResults.length ? studentResults.map((result) => `
      <div class="list-item"><h4>${result.examTitle}</h4><p>${result.type} • ${result.score}/${result.maxScore} • ${result.percentage}%</p></div>
    `).join('') : studentNotes.innerHTML;
  } catch (error) {
    // Le dashboard principal reste visible même si les résultats ne répondent pas.
  }
}

async function loadTeacherDashboard() {
  const response = await fetch(`${apiBase}/api/teacher/dashboard`, {
    headers: { Authorization: `Bearer ${state.token}` }
  });

  const data = await response.json();
  state.teacherData = data;

  const assignmentsResponse = await fetch(`${apiBase}/api/assignments`, {
    headers: { Authorization: `Bearer ${state.token}` }
  });
  const assignmentsData = await assignmentsResponse.json();
  state.teacherAssignments = Array.isArray(assignmentsData.assignments) ? assignmentsData.assignments : [];
  teacherResultsAssignment.innerHTML = '<option value="">Choisir une évaluation</option>' + state.teacherAssignments.map((item) => `<option value="${item.id}">${item.title} (${item.type})</option>`).join('');

  let submittedResults = [];
  try {
    const resultsResponse = await fetch(`${apiBase}/api/results`, {
      headers: { Authorization: `Bearer ${state.token}` }
    });
    const resultsData = await resultsResponse.json();
    submittedResults = Array.isArray(resultsData.results) ? resultsData.results : [];
    state.teacherResults = submittedResults;
  } catch (error) {
    state.teacherResults = [];
  }

  const uniqueStudents = new Set(submittedResults.filter((result) => result.email).map((result) => result.email.toLowerCase()));

  document.getElementById('teacherCourseCount').textContent = 0;
  document.getElementById('teacherAssignmentCount').textContent = state.teacherAssignments.length;
  document.getElementById('teacherPendingCount').textContent = uniqueStudents.size;

  const allStudents = state.adminUsers.length ? state.adminUsers.filter((u) => u.role === 'student') : [];
  const teacherStudents = document.getElementById('teacherStudents');

  teacherStudents.innerHTML = allStudents.length ? allStudents.map((student) => `
    <div class="list-item">
      <h4>${student.fullName}</h4>
      <p>${student.sexe || 'M'} • ${student.email} • ${student.matricule || 'Pas de matricule'}</p>
    </div>
  `).join('') : '<div class="list-item"><p>Aucun étudiant enregistré pour le moment.</p></div>';

  if (!state.teacherAssignments.length) {
    teacherAssignments.innerHTML = `
      <div class="list-item">
        <h4>Aucun travail publié</h4>
        <p>Les publications de l’enseignant apparaîtront ici après validation.</p>
      </div>
    `;
  } else {
    teacherAssignments.innerHTML = state.teacherAssignments.map((item) => `
      <div class="list-item">
        <h4>${item.title}</h4>
        <p>${item.subject} • ${item.type}</p>
        <p>${Array.isArray(item.questions) ? item.questions.length : 0} question(s) • corrigé intégré</p>
        <p>Début : ${new Date(item.startAt).toLocaleString()} • Fin : ${new Date(item.endAt).toLocaleString()}</p>
        <p>Durée : ${item.duration} min</p>
      </div>
    `).join('');
  }

  if (!submittedResults.length) {
    teacherSubmissions.innerHTML = `
      <div class="list-item">
        <h4>Aucune soumission</h4>
        <p>Les réponses des étudiants s’afficheront ici après publication d’un travail.</p>
      </div>
    `;
  } else {
    teacherSubmissions.innerHTML = submittedResults.map((result) => `
      <div class="list-item">
        <h4>${result.fullName}</h4>
        <p>${result.email} • ${result.examTitle}</p>
        <p>Note : ${result.score}/${result.maxScore} • ${result.percentage}% • ${result.status}</p>
      </div>
    `).join('');
  }
}

async function loadAdminDashboard() {
  const response = await fetch(`${apiBase}/api/admin/users`, {
    headers: { Authorization: `Bearer ${state.token}` }
  });

  const data = await response.json();
  state.adminUsers = data.users;

  if (state.user && state.user.role === 'teacher') {
    const teacherStudents = document.getElementById('teacherStudents');
    const studentList = data.users.filter((user) => user.role === 'student');
    teacherStudents.innerHTML = studentList.length ? studentList.map((student) => `
      <div class="list-item">
        <h4>${student.fullName}</h4>
        <p>${student.sexe || 'M'} • ${student.email} • ${student.matricule || 'Sans matricule'}</p>
      </div>
    `).join('') : '<div class="list-item"><p>Aucun étudiant enregistré.</p></div>';
  }

  document.getElementById('adminUserCount').textContent = data.users.length;
  document.getElementById('adminStudentCount').textContent = data.users.filter((u) => u.role === 'student').length;
  document.getElementById('adminTeacherCount').textContent = data.users.filter((u) => u.role === 'teacher').length;

  adminUsersList.innerHTML = data.users.map((user) => `
    <div class="list-item">
      <h4>${user.fullName}</h4>
      <p>${user.role} • ${user.email}</p>
    </div>
  `).join('');

  const studentsResponse = await fetch(`${apiBase}/api/admin/students`, {
    headers: { Authorization: `Bearer ${state.token}` }
  });
  const studentsData = await studentsResponse.json();
  state.adminStudents = Array.isArray(studentsData.students) ? studentsData.students : [];
  adminStudentTotal.textContent = `${studentsData.total || 0} étudiant${studentsData.total === 1 ? '' : 's'}`;
  renderAdminStudents();
}

function renderAdminStudents() {
  const query = (adminStudentSearch.value || '').trim().toLowerCase();
  const visibleStudents = state.adminStudents.filter((student) => [student.fullName, student.matricule, student.email]
    .some((value) => String(value || '').toLowerCase().includes(query)));

  adminStudentsTableBody.innerHTML = visibleStudents.length ? visibleStudents.map((student) => `
    <tr>
      <td>${escapeHtml(student.fullName)}</td>
      <td>${escapeHtml(student.matricule || 'Non renseigné')}</td>
      <td>${escapeHtml(student.sexe || 'Non renseigné')}</td>
      <td>${escapeHtml(student.faculte || student.filiere || 'Non renseignée')}</td>
      <td>${escapeHtml(student.promotion || 'Non renseignée')}</td>
      <td>${escapeHtml(student.email)}</td>
      <td>${escapeHtml(student.createdAt ? new Date(student.createdAt).toLocaleString('fr-FR') : 'Non disponible')}</td>
    </tr>
  `).join('') : `
    <tr><td colspan="7">Aucun étudiant trouvé.</td></tr>
  `;
}

async function handleAdminCreateUser(event) {
  event.preventDefault();

  const fullName = document.getElementById('adminFullName').value.trim();
  const email = document.getElementById('adminEmail').value.trim();
  const password = document.getElementById('adminPassword').value.trim();
  const role = document.getElementById('adminRole').value;
  const sexe = document.getElementById('adminGender').value;
  const matricule = document.getElementById('adminMatricule').value.trim();
  const promotion = document.getElementById('adminPromotion').value.trim();
  const filiere = document.getElementById('adminFiliere').value.trim();
  const classe = document.getElementById('adminClasse').value.trim();
  const specialite = document.getElementById('adminSpecialite').value.trim();

  if (!fullName || !email || !password || !role) {
    showLoginMessage('Veuillez remplir tous les champs nécessaires.', 'error');
    return;
  }

  try {
    const response = await fetch(`${apiBase}/api/admin/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${state.token}`
      },
      body: JSON.stringify({ fullName, email, password, role, sexe, matricule, promotion, filiere, classe, specialite })
    });

    const data = await response.json();

    if (!response.ok) {
      showAdminCreateMessage(data.message || 'Erreur lors de la création du compte.', 'error');
      return;
    }

    adminCreateUserForm.reset();
    closeAdminCreateModalWindow();
    await loadAdminDashboard();
    showLoginMessage('Compte enregistré avec succès.', 'success');
    window.setTimeout(() => showLoginMessage('', ''), 1200);
  } catch (error) {
    showAdminCreateMessage('Impossible d’enregistrer le compte.', 'error');
  }
}

function getQuizLockState() {
  return sessionStorage.getItem('studyroom_exam_lock') === 'locked';
}

function setQuizLockedState(locked) {
  state.examLocked = locked;
  sessionStorage.setItem('studyroom_exam_lock', locked ? 'locked' : 'open');
}

function unlockQuizSession() {
  if (state.examTimerId) {
    clearInterval(state.examTimerId);
    state.examTimerId = null;
  }
  state.examStartedAt = null;
  state.examDurationSeconds = 0;
  state.examAttemptId = null;
  state.examExpiresAt = null;
  setQuizLockedState(false);
  sessionStorage.removeItem('studyroom_active_exam');
}

function handleQuizExit() {
  if (state.currentExam && state.user && state.user.role === 'student' && !state.examLocked) {
    setQuizLockedState(true);
    sessionStorage.setItem('studyroom_active_exam', JSON.stringify({
      title: state.currentExam.title,
      startedAt: state.examStartedAt,
      duration: state.examDurationSeconds
    }));
  }
}

function normalizeText(value = '') {
  return String(value)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ');
}

function evaluateQuestionByRules(question, studentAnswer) {
  const points = Number(question.points) || 1;
  const answerText = normalizeText(studentAnswer ?? '');
  const correctText = normalizeText(question.correctAnswer || '');

  if (question.type === 'qcm' || question.type === 'vrai_faux') {
    const isCorrect = answerText === correctText || normalizeText(question.options[Number(studentAnswer)] || '') === correctText;
    return {
      points: isCorrect ? points : 0,
      isCorrect,
      elvis: isCorrect ? points : 0,
      robert: isCorrect ? points : 0,
      maxPoints: points
    };
  }

  if (question.type === 'ouverte') {
    const rawExpected = question.expectedAnswer || question.correctAnswer || '';
    const keywordList = normalizeText(rawExpected)
      .split(' ')
      .filter((token) => token.length > 2 && !['et', 'les', 'des', 'une', 'pour', 'dans', 'avec', 'sans', 'sur', 'sont', 'que', 'qui'].includes(token));

    const uniqueKeywords = [...new Set(keywordList)];
    const expectedCount = uniqueKeywords.length || 1;

    const exactMatch = answerText.includes(correctText) || correctText.includes(answerText) || answerText === correctText;
    if (exactMatch) {
      return {
        points: points,
        isCorrect: true,
        elvis: points,
        robert: points,
        maxPoints: points
      };
    }

    const foundKeywords = uniqueKeywords.filter((keyword) => answerText.includes(keyword)).length;
    const ratio = foundKeywords / expectedCount;
    const awarded = Math.max(0, Math.min(points, points * ratio));

    return {
      points: Number(awarded.toFixed(2)),
      isCorrect: awarded >= points * 0.5,
      elvis: Number((awarded * 0.6).toFixed(2)),
      robert: Number((awarded * 0.4).toFixed(2)),
      maxPoints: points
    };
  }

  const isCorrect = answerText === correctText;
  return {
    points: isCorrect ? points : 0,
    isCorrect,
    elvis: isCorrect ? points : 0,
    robert: isCorrect ? points : 0,
    maxPoints: points
  };
}

async function startQuizFromTask(taskTitle) {
  if (getQuizLockState()) {
    showLoginMessage('Cette interrogation est verrouillée. Vous avez quitté l’application pendant l’épreuve, donc l’accès est refusé.', 'error');
    return;
  }

  const assignment = state.teacherAssignments.find((item) => item.title.toLowerCase().includes(taskTitle.toLowerCase()));
  if (!assignment) {
    showLoginMessage('Cette interrogation n’est plus disponible.', 'error');
    return;
  }

  let data;
  try {
    const response = await fetch(`${apiBase}/api/assignments/${assignment.id}/start`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${state.token}` }
    });
    data = await response.json();
    if (!response.ok) {
      showLoginMessage(data.message || 'Impossible de démarrer cette évaluation.', 'error');
      return;
    }
  } catch (error) {
    showLoginMessage('Le serveur est inaccessible pour démarrer l’évaluation.', 'error');
    return;
  }

  const exam = {
    ...data.assignment,
    level: data.assignment.subject,
    durationMinutes: Number(data.assignment.duration) || 30,
    questions: data.assignment.questions.map((question) => ({
      ...question,
      options: question.options || [],
      points: Number(question.points) || 1,
      type: question.type || 'qcm'
    }))
  };

  state.currentExam = exam;
  state.currentQuestionIndex = 0;
  state.answers = Array(exam.questions.length).fill(null);
  state.examAttemptId = data.attempt.id;
  state.examStartedAt = new Date(data.attempt.startedAt).getTime();
  state.examExpiresAt = new Date(data.attempt.expiresAt).getTime();
  state.examDurationSeconds = (exam.durationMinutes || 30) * 60;
  state.examLocked = false;
  setQuizLockedState(false);
  sessionStorage.removeItem('studyroom_active_exam');
  studentDashboard.classList.add('hidden');
  quizPanel.classList.remove('hidden');
  renderQuestion();
  startQuizTimer();
}

function startQuizTimer() {
  if (state.examTimerId) {
    clearInterval(state.examTimerId);
  }

  state.examTimerId = setInterval(() => {
    if (!state.currentExam) {
      clearInterval(state.examTimerId);
      return;
    }

    const remaining = Math.max(Math.ceil((state.examExpiresAt - Date.now()) / 1000), 0);
    const minutes = String(Math.floor(remaining / 60)).padStart(2, '0');
    const seconds = String(remaining % 60).padStart(2, '0');
    quizTimer.textContent = `${minutes}:${seconds}`;

    if (remaining <= 0) {
      clearInterval(state.examTimerId);
      submitExam('Temps écoulé : l’épreuve a été clôturée automatiquement.');
    }
  }, 1000);
}

function renderQuestion() {
  const exam = state.currentExam;
  const question = exam.questions[state.currentQuestionIndex];
  const progress = ((state.currentQuestionIndex + 1) / exam.questions.length) * 100;

  document.getElementById('quizTitle').textContent = exam.title;
  progressBar.style.width = `${progress}%`;

  prevBtn.disabled = state.currentQuestionIndex === 0;
  nextBtn.textContent = state.currentQuestionIndex === exam.questions.length - 1 ? 'Terminer' : 'Suivant';

  const currentAnswer = state.answers[state.currentQuestionIndex] ?? '';
  const isOpenQuestion = question.type === 'ouverte';
  let answerMarkup = '';

  if (isOpenQuestion) {
    answerMarkup = `
      <label>
        Votre réponse
        <textarea id="openAnswerBox" rows="6" placeholder="Répondez ici...">${typeof currentAnswer === 'string' ? currentAnswer : ''}</textarea>
      </label>
    `;
  } else {
    const options = question.options.length ? question.options : ['Vrai', 'Faux'];
    answerMarkup = `
      <div class="answer-list">
        ${options.map((option, index) => `
          <button type="button" class="answer-option ${String(currentAnswer) === String(index) ? 'selected' : ''}" data-option-index="${index}">
            ${option}
          </button>
        `).join('')}
      </div>
    `;
  }

  questionCard.innerHTML = `
    <p class="question-counter">Question ${state.currentQuestionIndex + 1} / ${exam.questions.length}</p>
    <h3>${question.text}</h3>
    ${answerMarkup}
  `;

  if (isOpenQuestion) {
    const openField = document.getElementById('openAnswerBox');
    if (openField) {
      openField.addEventListener('input', (event) => {
        state.answers[state.currentQuestionIndex] = event.target.value;
      });
    }
    return;
  }

  questionCard.querySelectorAll('.answer-option').forEach((button) => {
    button.addEventListener('click', () => {
      const optionIndex = Number(button.dataset.optionIndex);
      state.answers[state.currentQuestionIndex] = optionIndex;
      renderQuestion();
    });
  });
}

function goToPreviousQuestion() {
  if (state.currentQuestionIndex > 0) {
    state.currentQuestionIndex -= 1;
    renderQuestion();
  }
}

function goToNextQuestion() {
  if (state.currentQuestionIndex < state.currentExam.questions.length - 1) {
    state.currentQuestionIndex += 1;
    renderQuestion();
    return;
  }

  submitExam();
}

function buildCurrentExamResult(customMessage = '') {
  const exam = state.currentExam;
  if (!exam) {
    return null;
  }

  const evaluations = exam.questions.map((question, index) => evaluateQuestionByRules(question, state.answers[index]));
  const totalMax = evaluations.reduce((sum, item) => sum + (item.maxPoints || 0), 0);
  const totalEarned = evaluations.reduce((sum, item) => sum + (Number(item.points) || 0), 0);
  const average = totalMax > 0 ? (totalEarned / totalMax) * 100 : 0;
  const finalPercent = Math.round(average);
  const isSuccessful = finalPercent >= 50;

  const elvisScore = evaluations.reduce((sum, item) => sum + (Number(item.elvis) || 0), 0);
  const robertScore = evaluations.reduce((sum, item) => sum + (Number(item.robert) || 0), 0);
  const statusText = customMessage || (isSuccessful
    ? 'Réussi — la réponse correspond à la clé de correction de l’enseignant.'
    : 'Échec — la réponse ne correspond pas à la clé de correction de l’enseignant.');

  const result = {
    fullName: state.user?.fullName || 'Étudiant',
    email: state.user?.email || '',
    matricule: state.user?.matricule || '',
    promotion: state.user?.promotion || '',
    filiere: state.user?.filiere || '',
    classe: state.user?.classe || '',
    examTitle: exam.title,
    subject: exam.level,
    score: totalEarned,
    maxScore: totalMax,
    percentage: finalPercent,
    status: isSuccessful ? 'Réussi' : 'Échec',
    elvisScore,
    robertScore,
    message: statusText,
    date: new Date().toISOString(),
    details: evaluations.map((item, index) => ({
      question: exam.questions[index]?.text || `Question ${index + 1}`,
      points: Number(item.points) || 0,
      maxPoints: Number(item.maxPoints) || 0,
      isCorrect: Boolean(item.isCorrect)
    }))
  };

  resultText.textContent = `${statusText}\n\nCorrection automatique locale\nElvis Mbanze : ${elvisScore}/${totalMax} points\nRobert Gbema : ${robertScore}/${totalMax} points\nNote finale : ${totalEarned}/${totalMax} (${finalPercent}%)`;

  return result;
}

async function saveCurrentExamResult() {
  if (!state.currentExam) {
    return;
  }

  if (!(state.user && (state.user.role === 'teacher' || state.user.role === 'admin'))) {
    showLoginMessage('Seuls les enseignants peuvent enregistrer les résultats.', 'error');
    return;
  }

  const result = buildCurrentExamResult();
  if (!result) {
    return;
  }

  try {
    const response = await fetch(`${apiBase}/api/results`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${state.token}`
      },
      body: JSON.stringify(result)
    });

    const data = await response.json();

    if (!response.ok) {
      showLoginMessage(data.message || 'Impossible d’enregistrer le résultat.', 'error');
      return;
    }

    showLoginMessage('Résultat enregistré dans la base locale et prêt pour export Excel.', 'success');
    window.setTimeout(() => showLoginMessage('', ''), 1800);
  } catch (error) {
    showLoginMessage('Le serveur est indisponible pour l’enregistrement du résultat.', 'error');
  }
}

async function exportCurrentExamResultToExcel() {
  if (!(state.user && (state.user.role === 'teacher' || state.user.role === 'admin'))) {
    showLoginMessage('Seuls les enseignants peuvent exporter les résultats.', 'error');
    return;
  }

  const current = state.currentExam ? buildCurrentExamResult() : null;
  let rows = [];

  try {
    const response = await fetch(`${apiBase}/api/results`, {
      headers: { Authorization: `Bearer ${state.token}` }
    });

    if (response.ok) {
      const data = await response.json();
      const sortedResults = (data.results || []).sort((a, b) => (a.fullName || '').localeCompare(b.fullName || ''));
      if (sortedResults.length) {
        rows = sortedResults.map((item) => [
          item.fullName || '',
          item.email || '',
          item.matricule || '',
          item.promotion || '',
          item.filiere || '',
          item.classe || '',
          item.examTitle || '',
          item.subject || '',
          Number(item.score) || 0,
          Number(item.maxScore) || 0,
          Number(item.percentage) || 0,
          item.status || '',
          new Date(item.date || Date.now()).toLocaleString(),
          Number(item.details && item.details.elvisScore) || 0,
          Number(item.details && item.details.robertScore) || 0
        ]);
      }
    }
  } catch (error) {
    // Si le serveur ne répond pas, on exporte le résultat en cours.
  }

  if (!rows.length && current) {
    rows = [[
      current.fullName,
      current.email,
      current.matricule,
      current.promotion,
      current.filiere,
      current.classe,
      current.examTitle,
      current.subject,
      current.score,
      current.maxScore,
      current.percentage,
      current.status,
      new Date(current.date).toLocaleString(),
      current.elvisScore,
      current.robertScore
    ]];
  }

  if (!rows.length) {
    showLoginMessage('Aucun résultat enregistré pour l’export Excel.', 'error');
    return;
  }

  const header = ['Nom', 'Email', 'Matricule', 'Promotion', 'Filière', 'Classe', 'Examen', 'Matière', 'Score', 'Total', 'Pourcentage', 'Statut', 'Date', 'Elvis', 'Robert'];
  const csvRows = [header, ...rows];
  const csvContent = csvRows.map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(';')).join('\n');
  const blob = new Blob([csvContent], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `studyroom-resultats-${Date.now()}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  showLoginMessage('Fichier Excel exporté en ordre alphabétique par nom.', 'success');
  window.setTimeout(() => showLoginMessage('', ''), 1800);
}

async function submitExam(customMessage = '') {
  const exam = state.currentExam;
  if (!exam) {
    return;
  }

  const answers = exam.questions.map((question, index) => ({
    questionId: question.id,
    answer: state.answers[index] ?? ''
  }));

  try {
    const response = await fetch(`${apiBase}/api/assignments/${exam.id}/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${state.token}` },
      body: JSON.stringify({ answers })
    });
    const data = await response.json();
    if (!response.ok) {
      showLoginMessage(data.message || 'La soumission a été refusée.', 'error');
      return;
    }
    const result = data.result;
    resultText.textContent = `${customMessage ? `${customMessage}\n\n` : ''}Résultat disponible\n\n${result.examTitle}\nNote : ${result.score}/${result.maxScore}\nPourcentage : ${result.percentage}%\nStatut : ${result.status}`;
  } catch (error) {
    showLoginMessage('Le serveur est indisponible pour la soumission.', 'error');
    return;
  }

  unlockQuizSession();
  quizPanel.classList.add('hidden');
  resultModal.style.display = 'flex';
  resultModal.setAttribute('aria-hidden', 'false');
}

async function loadTeacherResults() {
  const assignmentId = Number(teacherResultsAssignment.value);
  if (!assignmentId) {
    showLoginMessage('Choisissez une évaluation.', 'error');
    return;
  }
  const response = await fetch(`${apiBase}/api/teacher/assignments/${assignmentId}/results`, {
    headers: { Authorization: `Bearer ${state.token}` }
  });
  const data = await response.json();
  if (!response.ok) {
    showLoginMessage(data.message || 'Impossible de récupérer les résultats.', 'error');
    return;
  }
  teacherResultsList.innerHTML = data.results.length ? data.results.map((result) => `
    <div class="list-item"><h4>${result.fullName}</h4><p>${result.matricule || 'Sans matricule'} • ${result.sexe || ''} • ${result.faculte || ''} • ${result.promotion || ''}</p><p>${result.email} • Cote : ${result.score}/${result.maxScore} (${result.percentage}%)</p></div>
  `).join('') : '<div class="list-item"><p>Aucun résultat pour cette évaluation.</p></div>';
}

async function exportTeacherResults() {
  const assignmentId = Number(teacherResultsAssignment.value);
  if (!assignmentId) {
    showLoginMessage('Choisissez une évaluation.', 'error');
    return;
  }
  const response = await fetch(`${apiBase}/api/teacher/assignments/${assignmentId}/export.xlsx`, {
    headers: { Authorization: `Bearer ${state.token}` }
  });
  if (!response.ok) {
    const data = await response.json();
    showLoginMessage(data.message || 'Impossible de générer le fichier Excel.', 'error');
    return;
  }
  const blob = await response.blob();
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `studyroom-resultats-${assignmentId}.xlsx`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function goBackToDashboard() {
  state.currentExam = null;
  state.currentQuestionIndex = 0;
  state.answers = [];
  unlockQuizSession();
  quizPanel.classList.add('hidden');
  resultModal.style.display = 'none';
  resultModal.setAttribute('aria-hidden', 'true');

  if (state.user && state.user.role === 'student') {
    showOnly('student');
    if (state.studentData) {
      loadStudentDashboard();
    }
  } else if (state.user && state.user.role === 'teacher') {
    showOnly('teacher');
  } else if (state.user && state.user.role === 'admin') {
    showOnly('admin');
  }
}

function createEmptyQuestionCard() {
  return {
    id: Date.now() + Math.random(),
    type: 'qcm',
    text: '',
    options: ['', '', '', ''],
    correctAnswer: '',
    points: 2,
    expectedAnswer: ''
  };
}

function renderQuestionBuilder() {
  const container = document.getElementById('teacherQuestionsContainer');
  if (!container) return;

  container.innerHTML = state.teacherAssignments.length ? '' : '';

  const draftQuestions = window.teacherDraftQuestions || [];

  if (!draftQuestions.length) {
    draftQuestions.push(createEmptyQuestionCard());
  }

  window.teacherDraftQuestions = draftQuestions;

  container.innerHTML = draftQuestions.map((question, questionIndex) => {
    const isOpen = question.type === 'ouverte';
    const isTrueFalse = question.type === 'vrai_faux';

    return `
      <div class="teacher-question-card" data-question-index="${questionIndex}">
        <div class="teacher-question-card-header">
          <h4>Question ${questionIndex + 1}</h4>
          <button type="button" class="ghost-button remove-question-btn" data-index="${questionIndex}">Supprimer</button>
        </div>

        <label>
          Type de question
          <select class="question-type-select" data-index="${questionIndex}">
            <option value="qcm" ${question.type === 'qcm' ? 'selected' : ''}>Choix multiple</option>
            <option value="vrai_faux" ${question.type === 'vrai_faux' ? 'selected' : ''}>Vrai / Faux</option>
            <option value="ouverte" ${question.type === 'ouverte' ? 'selected' : ''}>Réponse courte / ouverte</option>
          </select>
        </label>

        <label>
          Libellé de la question
          <textarea class="question-text-input" data-index="${questionIndex}" rows="3" placeholder="Posez ici la question...">${question.text}</textarea>
        </label>

        ${!isOpen ? `
          <div class="question-option-list">
            ${question.options.map((option, optionIndex) => `
              <div class="question-option-row">
                <span class="inline-label">${String.fromCharCode(65 + optionIndex)}</span>
                <input type="text" class="question-option-input" data-question-index="${questionIndex}" data-option-index="${optionIndex}" value="${option}" placeholder="Option ${String.fromCharCode(65 + optionIndex)}">
                ${question.type === 'qcm' ? `<button type="button" class="ghost-button remove-option-btn" data-question-index="${questionIndex}" data-option-index="${optionIndex}" ${question.options.length <= 2 ? 'disabled' : ''}>Supprimer</button>` : ''}
              </div>
            `).join('')}
            ${question.type === 'qcm' ? `<button type="button" class="secondary-button add-option-btn" data-index="${questionIndex}" ${question.options.length >= 5 ? 'disabled' : ''}>Ajouter un choix</button>` : ''}
          </div>
        ` : ''}

        ${isTrueFalse ? `
          <div class="question-option-list">
            <div class="question-option-row">
              <span class="inline-label">V</span>
              <input type="text" value="Vrai" readonly>
            </div>
            <div class="question-option-row">
              <span class="inline-label">F</span>
              <input type="text" value="Faux" readonly>
            </div>
          </div>
        ` : ''}

        <label>
          Bonne réponse
          <input type="text" class="question-answer-input" data-index="${questionIndex}" value="${question.correctAnswer}" placeholder="HTML / Vrai / réponse attendue...">
        </label>

        <label>
          Barème (points)
          <input type="number" min="1" max="20" class="question-points-input" data-index="${questionIndex}" value="${question.points}">
        </label>

        ${isOpen ? `
          <label>
            Éléments attendus / réponse de référence
            <textarea class="question-expected-input" data-index="${questionIndex}" rows="4" placeholder="- notion 1\n- notion 2\n- élément attendu...">${question.expectedAnswer}</textarea>
          </label>
        ` : ''}
      </div>
    `;
  }).join('');

  const typeInputs = container.querySelectorAll('.question-type-select');
  typeInputs.forEach((input) => {
    input.addEventListener('change', (event) => {
      const index = Number(event.target.dataset.index);
      const draft = window.teacherDraftQuestions[index];
      draft.type = event.target.value;
      if (draft.type === 'qcm' && draft.options.length < 4) {
        draft.options = ['', '', '', ''];
      }
      if (draft.type === 'vrai_faux') {
        draft.options = ['Vrai', 'Faux'];
      }
      if (draft.type === 'ouverte') {
        draft.options = ['', '', '', ''];
      }
      renderQuestionBuilder();
    });
  });

  container.querySelectorAll('.question-text-input').forEach((input) => {
    input.addEventListener('input', (event) => {
      const index = Number(event.target.dataset.index);
      window.teacherDraftQuestions[index].text = event.target.value;
    });
  });

  container.querySelectorAll('.question-option-input').forEach((input) => {
    input.addEventListener('input', (event) => {
      const questionIndex = Number(event.target.dataset.questionIndex);
      const optionIndex = Number(event.target.dataset.optionIndex);
      const draft = window.teacherDraftQuestions[questionIndex];
      draft.options[optionIndex] = event.target.value;
    });
  });

  container.querySelectorAll('.add-option-btn').forEach((button) => {
    button.addEventListener('click', (event) => {
      const question = window.teacherDraftQuestions[Number(event.target.dataset.index)];
      if (question.options.length < 5) {
        question.options.push('');
        renderQuestionBuilder();
      }
    });
  });

  container.querySelectorAll('.remove-option-btn').forEach((button) => {
    button.addEventListener('click', (event) => {
      const question = window.teacherDraftQuestions[Number(event.target.dataset.questionIndex)];
      const optionIndex = Number(event.target.dataset.optionIndex);
      if (question.options.length > 2) {
        question.options.splice(optionIndex, 1);
        renderQuestionBuilder();
      }
    });
  });

  container.querySelectorAll('.question-answer-input').forEach((input) => {
    input.addEventListener('input', (event) => {
      const index = Number(event.target.dataset.index);
      window.teacherDraftQuestions[index].correctAnswer = event.target.value;
    });
  });

  container.querySelectorAll('.question-points-input').forEach((input) => {
    input.addEventListener('input', (event) => {
      const index = Number(event.target.dataset.index);
      window.teacherDraftQuestions[index].points = Number(event.target.value) || 1;
    });
  });

  container.querySelectorAll('.question-expected-input').forEach((input) => {
    input.addEventListener('input', (event) => {
      const index = Number(event.target.dataset.index);
      window.teacherDraftQuestions[index].expectedAnswer = event.target.value;
    });
  });

  container.querySelectorAll('.remove-question-btn').forEach((button) => {
    button.addEventListener('click', (event) => {
      const index = Number(event.target.dataset.index);
      const draft = window.teacherDraftQuestions || [];
      draft.splice(index, 1);
      if (!draft.length) {
        draft.push(createEmptyQuestionCard());
      }
      window.teacherDraftQuestions = draft;
      renderQuestionBuilder();
    });
  });
}

function addQuestionBuilder() {
  if (!window.teacherDraftQuestions) {
    window.teacherDraftQuestions = [];
  }
  window.teacherDraftQuestions.push(createEmptyQuestionCard());
  renderQuestionBuilder();
}

async function handleTeacherAssignment(event) {
  event.preventDefault();

  const title = document.getElementById('assignmentTitle').value.trim();
  const subject = document.getElementById('assignmentSubject').value.trim();
  const type = document.getElementById('assignmentType').value;
  const startAtValue = document.getElementById('assignmentStartAt').value;
  const endAtValue = document.getElementById('assignmentEndAt').value;
  const duration = document.getElementById('assignmentDuration').value || '30';
  const instructions = document.getElementById('assignmentInstructions').value.trim();
  const consent = document.getElementById('teacherAssignmentConsent').checked;
  const questions = window.teacherDraftQuestions || [];

  if (!title || !subject || !type || !startAtValue || !endAtValue || !instructions) {
    showLoginMessage('Veuillez remplir le titre, la matière, les dates et les instructions.', 'error');
    return;
  }

  if (!questions.length || questions.some((question) => !question.text.trim())) {
    showLoginMessage('Chaque question doit contenir un libellé avant publication.', 'error');
    return;
  }

  if (!consent) {
    showLoginMessage('Le consentement de l’enseignant est requis avant toute publication.', 'error');
    return;
  }

  const startAt = new Date(startAtValue);
  const endAt = new Date(endAtValue);

  if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime()) || endAt <= startAt) {
    showLoginMessage('L’heure de fin doit être supérieure à l’heure de début.', 'error');
    return;
  }

  const normalizedQuestions = questions.map((question) => ({
    id: question.id,
    type: question.type,
    text: question.text.trim(),
    options: Array.isArray(question.options) ? question.options.map((opt) => opt.trim()) : [],
    correctAnswer: String(question.correctAnswer || '').trim(),
    points: Number(question.points) || 1,
    expectedAnswer: String(question.expectedAnswer || '').trim()
  }));

  const assignment = {
    title,
    subject,
    type,
    startAt: startAtValue,
    endAt: endAtValue,
    duration,
    instructions,
    questions: normalizedQuestions,
    publishedAt: new Date().toISOString()
  };

  try {
    const response = await fetch(`${apiBase}/api/assignments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${state.token}` },
      body: JSON.stringify(assignment)
    });
    const data = await response.json();
    if (!response.ok) {
      showLoginMessage(data.message || 'Impossible de publier cette évaluation.', 'error');
      return;
    }
    teacherAssignmentForm.reset();
    window.teacherDraftQuestions = [createEmptyQuestionCard()];
    await loadTeacherDashboard();
    showLoginMessage('Évaluation publiée. La correction sera automatique après soumission.', 'success');
    window.setTimeout(() => showLoginMessage('', ''), 1500);
  } catch (error) {
    showLoginMessage('Le serveur est inaccessible pour la publication.', 'error');
  }
}

window.addEventListener('beforeunload', () => {
  handleQuizExit();
});

window.addEventListener('visibilitychange', () => {
  if (document.hidden && state.currentExam && state.user && state.user.role === 'student') {
    handleQuizExit();
  }
});

document.getElementById('addQuestionBtn').addEventListener('click', addQuestionBuilder);
openLoginBtn.addEventListener('click', openLogin);
accessBtn.addEventListener('click', openLogin);
closeLoginModal.addEventListener('click', closeLogin);
closeRegisterModal.addEventListener('click', closeRegister);
closeAdminCreateModal.addEventListener('click', closeAdminCreateModalWindow);
showRegisterBtn.addEventListener('click', openRegister);
forgotPasswordBtn.addEventListener('click', handleForgotPassword);
openAdminCreateModalBtn.addEventListener('click', openAdminCreateModal);
logoutBtn.addEventListener('click', logout);
loginForm.addEventListener('submit', handleLogin);
registerForm.addEventListener('submit', handleRegister);
closeResultBtn.addEventListener('click', goBackToDashboard);
saveResultBtn.addEventListener('click', saveCurrentExamResult);
exportResultBtn.addEventListener('click', exportCurrentExamResultToExcel);
leaveQuizBtn.addEventListener('click', goBackToDashboard);
prevBtn.addEventListener('click', goToPreviousQuestion);
nextBtn.addEventListener('click', goToNextQuestion);
teacherAssignmentForm.addEventListener('submit', handleTeacherAssignment);
adminCreateUserForm.addEventListener('submit', handleAdminCreateUser);
adminStudentSearch.addEventListener('input', renderAdminStudents);
viewTeacherResultsBtn.addEventListener('click', loadTeacherResults);
exportTeacherResultsBtn.addEventListener('click', exportTeacherResults);

window.teacherDraftQuestions = [createEmptyQuestionCard()];
renderQuestionBuilder();
showOnly('home');
setLoggedUser(null);
