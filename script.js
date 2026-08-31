const apiBase = 'http://localhost:3000';

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
  examStartedAt: null,
  examDurationSeconds: 0,
  examTimerId: null,
  examLocked: false
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
const teacherAssignmentForm = document.getElementById('teacherAssignmentForm');
const adminCreateUserForm = document.getElementById('adminCreateUserForm');
const adminUsersList = document.getElementById('adminUsersList');
const resultModal = document.getElementById('resultModal');
const resultText = document.getElementById('resultText');
const closeResultBtn = document.getElementById('closeResultBtn');
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
}

async function handleRegister(event) {
  event.preventDefault();

  const fullName = document.getElementById('registerFullName').value.trim();
  const email = document.getElementById('registerEmail').value.trim();
  const password = document.getElementById('registerPassword').value.trim();
  const sexe = document.getElementById('registerGender').value;
  const matricule = document.getElementById('registerMatricule').value.trim();
  const filiere = document.getElementById('registerFiliere').value.trim();
  const classe = document.getElementById('registerClasse').value.trim();

  if (!fullName || !email || !password) {
    showLoginMessage('Veuillez remplir tous les champs pour créer votre compte.', 'error');
    return;
  }

  try {
    const response = await fetch(`${apiBase}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fullName, email, password, sexe, matricule, filiere, classe })
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
  setLoggedUser(null);
  showOnly('home');
  closeLogin();
  closeRegister();
}

async function loadStudentDashboard() {
  const response = await fetch(`${apiBase}/api/student/dashboard`, {
    headers: { Authorization: `Bearer ${state.token}` }
  });

  const data = await response.json();
  state.studentData = data;

  const user = data.user;
  studentTitle.textContent = `${user.fullName}`;

  document.getElementById('studentCourseCount').textContent = 0;
  document.getElementById('studentTaskCount').textContent = 0;
  document.getElementById('studentNoteCount').textContent = 0;

  studentCourses.innerHTML = `
    <div class="list-item">
      <h4>Aucun cours proposé</h4>
      <p>Les matières seront publiées par l’enseignant.</p>
    </div>
  `;

  studentAssignments.innerHTML = `
    <div class="list-item">
      <h4>Aucun travail publié</h4>
      <p>Les devoirs et interrogations apparaîtront ici dès que l’enseignant les publiera.</p>
    </div>
  `;

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
      <p>Les notes seront affichées ici après correction par l’enseignant.</p>
    </div>
  `;
}

async function loadTeacherDashboard() {
  const response = await fetch(`${apiBase}/api/teacher/dashboard`, {
    headers: { Authorization: `Bearer ${state.token}` }
  });

  const data = await response.json();
  state.teacherData = data;

  document.getElementById('teacherCourseCount').textContent = data.statistics.courses;
  document.getElementById('teacherAssignmentCount').textContent = data.statistics.assignments;
  document.getElementById('teacherPendingCount').textContent = data.statistics.pendingReviews;

  const allStudents = state.adminUsers.length ? state.adminUsers.filter((u) => u.role === 'student') : [];
  const teacherStudents = document.getElementById('teacherStudents');

  teacherStudents.innerHTML = allStudents.length ? allStudents.map((student) => `
    <div class="list-item">
      <h4>${student.fullName}</h4>
      <p>${student.sexe || 'M'} • ${student.email} • ${student.matricule || 'Pas de matricule'}</p>
    </div>
  `).join('') : '<div class="list-item"><p>Aucun étudiant enregistré pour le moment.</p></div>';

  teacherAssignments.innerHTML = `
    <div class="list-item">
      <h4>Programmation Web</h4>
      <p>Devoir • date limite : 2026-09-12</p>
    </div>
    <div class="list-item">
      <h4>Base de données</h4>
      <p>Interrogation • date limite : 2026-09-15</p>
    </div>
  `;

  teacherSubmissions.innerHTML = `
    <div class="list-item">
      <h4>Alice Mvila</h4>
      <p>Interrogation JavaScript • en attente</p>
    </div>
    <div class="list-item">
      <h4>Jules N'Guessan</h4>
      <p>Devoir HTML/CSS • à corriger</p>
    </div>
  `;
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

function startQuizFromTask(taskTitle) {
  if (getQuizLockState()) {
    showLoginMessage('Cette interrogation est verrouillée. Vous avez quitté l’application pendant l’épreuve, donc l’accès est refusé.', 'error');
    return;
  }

  const exam = exams.find((item) => item.title.toLowerCase().includes(taskTitle.toLowerCase())) || exams[0];
  const now = new Date();
  const startAt = exam.startAt ? new Date(exam.startAt) : null;
  const endAt = exam.endAt ? new Date(exam.endAt) : null;

  if (startAt && now < startAt) {
    showLoginMessage('L’interrogation n’est pas encore ouverte. L’enseignant doit déclencher le début de l’épreuve.', 'error');
    return;
  }

  if (endAt && now > endAt) {
    showLoginMessage('L’heure de l’interrogation est terminée. Vous n’avez plus accès à cette épreuve.', 'error');
    return;
  }

  state.currentExam = exam;
  state.currentQuestionIndex = 0;
  state.answers = Array(exam.questions.length).fill(null);
  state.examStartedAt = Date.now();
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

    const elapsed = Math.floor((Date.now() - state.examStartedAt) / 1000);
    const remaining = Math.max(state.examDurationSeconds - elapsed, 0);
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

  questionCard.innerHTML = `
    <p class="question-counter">Question ${state.currentQuestionIndex + 1} / ${exam.questions.length}</p>
    <h3>${question.question}</h3>
    <div class="answer-list">
      ${question.options.map((option, index) => `
        <button type="button" class="answer-option ${state.answers[state.currentQuestionIndex] === index ? 'selected' : ''}" data-option-index="${index}">
          ${option}
        </button>
      `).join('')}
    </div>
  `;

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

function submitExam(customMessage = '') {
  const exam = state.currentExam;
  if (!exam) {
    return;
  }

  const total = exam.questions.length;
  const score = exam.questions.reduce((count, question, index) => count + (state.answers[index] === question.correctIndex ? 1 : 0), 0);
  const percentage = Math.round((score / total) * 100);

  resultText.textContent = customMessage || `Vous avez ${score} bonne(s) réponse(s) sur ${total}. Votre score est de ${percentage}%.`;
  unlockQuizSession();
  quizPanel.classList.add('hidden');
  resultModal.style.display = 'flex';
  resultModal.setAttribute('aria-hidden', 'false');
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

function handleTeacherAssignment(event) {
  event.preventDefault();

  const title = document.getElementById('assignmentTitle').value.trim();
  const subject = document.getElementById('assignmentSubject').value.trim();
  const type = document.getElementById('assignmentType').value;
  const startAtValue = document.getElementById('assignmentStartAt').value;
  const endAtValue = document.getElementById('assignmentEndAt').value;
  const duration = document.getElementById('assignmentDuration').value || '30';
  const instructions = document.getElementById('assignmentInstructions').value.trim();

  if (!title || !subject || !startAtValue || !endAtValue || !instructions) {
    showLoginMessage('Veuillez remplir la date de début, la date de fin et les instructions.', 'error');
    return;
  }

  const startAt = new Date(startAtValue);
  const endAt = new Date(endAtValue);

  if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime()) || endAt <= startAt) {
    showLoginMessage('L’heure de fin doit être supérieure à l’heure de début.', 'error');
    return;
  }

  const item = document.createElement('div');
  item.className = 'list-item';
  item.innerHTML = `
    <h4>${title}</h4>
    <p>${subject} • ${type} • ${duration} min • début : ${startAt.toLocaleString()} • fin : ${endAt.toLocaleString()}</p>
    <p>${instructions}</p>
  `;

  teacherAssignments.prepend(item);
  teacherAssignmentForm.reset();
  showLoginMessage('Interrogation publiée avec succès pour les étudiants.', 'success');
  window.setTimeout(() => showLoginMessage('', ''), 1200);
}

window.addEventListener('beforeunload', () => {
  handleQuizExit();
});

window.addEventListener('visibilitychange', () => {
  if (document.hidden && state.currentExam && state.user && state.user.role === 'student') {
    handleQuizExit();
  }
});

openLoginBtn.addEventListener('click', openLogin);
accessBtn.addEventListener('click', openLogin);
closeLoginModal.addEventListener('click', closeLogin);
closeRegisterModal.addEventListener('click', closeRegister);
closeAdminCreateModal.addEventListener('click', closeAdminCreateModalWindow);
showRegisterBtn.addEventListener('click', openRegister);
openAdminCreateModalBtn.addEventListener('click', openAdminCreateModal);
logoutBtn.addEventListener('click', logout);
loginForm.addEventListener('submit', handleLogin);
registerForm.addEventListener('submit', handleRegister);
closeResultBtn.addEventListener('click', goBackToDashboard);
leaveQuizBtn.addEventListener('click', goBackToDashboard);
prevBtn.addEventListener('click', goToPreviousQuestion);
nextBtn.addEventListener('click', goToNextQuestion);
teacherAssignmentForm.addEventListener('submit', handleTeacherAssignment);
adminCreateUserForm.addEventListener('submit', handleAdminCreateUser);

showOnly('home');
setLoggedUser(null);
