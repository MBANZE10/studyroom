const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

const dataFiles = ['users.json', 'assignments.json', 'submissions.json', 'notifications.json', 'results.json'].map((file) => path.resolve(__dirname, '../src/data', file));
const originalData = dataFiles.map((file) => fs.readFileSync(file, 'utf8'));

const server = spawn(process.execPath, ['server.js'], {
  cwd: path.resolve(__dirname, '../..'),
  env: { ...process.env, PORT: '0' },
  stdio: ['ignore', 'pipe', 'pipe']
});

let output = '';
let port = null;
server.stdout.on('data', (chunk) => {
  output += chunk.toString();
  const match = output.match(/localhost:(\d+)/);
  if (match) port = Number(match[1]);
});

async function waitForServer() {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    if (port) {
      try {
        const response = await fetch(`http://localhost:${port}/api/health`);
        if (response.ok) return;
      } catch (error) {
        // Le serveur finit son démarrage.
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Serveur non démarré: ${output}`);
}

async function request(route, options = {}) {
  const response = await fetch(`http://localhost:${port}${route}`, options);
  const body = response.headers.get('content-type')?.includes('json')
    ? await response.json()
    : await response.arrayBuffer();
  return { response, body };
}

async function registerStudent(suffix, faculte, promotion) {
  const email = `evaluation.${suffix}.${Date.now()}@example.com`;
  const registration = await request('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fullName: `Étudiant ${suffix}`, email, password: 'student123', matricule: `EVAL-${suffix}`, sexe: 'F', faculte, promotion })
  });
  assert.equal(registration.response.status, 201);
  assert.equal(registration.body.user.role, 'student');
  const login = await request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'student123' })
  });
  assert.equal(login.response.status, 200);
  return login.body.token;
}

(async () => {
  try {
    await waitForServer();
    const teacherLogin = await request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'teacher@studyroom.com', password: 'teacher123' })
    });
    assert.equal(teacherLogin.response.status, 200);

    const studentToken = await registerStudent('l2', 'Sciences informatiques', 'L2');
    const peerStudentToken = await registerStudent('l2-peer', 'Sciences informatiques', 'L2');
    const otherPromotionToken = await registerStudent('l1', 'Sciences informatiques', 'L1');
    const otherFacultyToken = await registerStudent('droit-l2', 'Droit', 'L2');
    const teacherToken = teacherLogin.body.token;
    const missingTarget = await request('/api/assignments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${teacherToken}` },
      body: JSON.stringify({
        title: 'Travail sans cible',
        type: 'devoir',
        startAt: new Date(Date.now() + 60000).toISOString(),
        endAt: new Date(Date.now() + 3600000).toISOString(),
        instructions: 'Test',
        questions: [{ id: 1, type: 'qcm', text: 'Question ?', options: ['A', 'B'], correctAnswer: 'A', points: 1 }]
      })
    });
    assert.equal(missingTarget.response.status, 400);
    const timezoneAssignment = await request('/api/assignments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${teacherToken}` },
      body: JSON.stringify({
        title: `Timezone ${Date.now()}`,
        subject: 'Mathematiques',
        type: 'interrogation',
        faculty: 'Sciences informatiques',
        promotion: 'L2',
        startAt: '2030-09-02T10:00',
        endAt: '2030-09-02T11:00',
        duration: 30,
        instructions: 'Test fuseau.',
        questions: [{ id: 1, type: 'qcm', text: 'Question ?', options: ['A', 'B'], correctAnswer: 'A', points: 1 }]
      })
    });
    assert.equal(timezoneAssignment.response.status, 201);
    assert.equal(timezoneAssignment.body.assignment.startAt, '2030-09-02T09:00:00.000Z');
    assert.equal(timezoneAssignment.body.assignment.endAt, '2030-09-02T10:00:00.000Z');
    const displayParts = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Africa/Kinshasa', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(timezoneAssignment.body.assignment.startAt));
    assert.equal(displayParts, '10:00');

    const assignment = await request('/api/assignments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${teacherToken}` },
      body: JSON.stringify({
        title: `Evaluation ${Date.now()}`,
        subject: 'Mathematiques',
        type: 'interrogation',
        faculty: 'Sciences informatiques',
        promotion: 'L2',
        startAt: new Date(Date.now() - 60000).toISOString(),
        endAt: new Date(Date.now() + 3600000).toISOString(),
        duration: 30,
        instructions: 'Repondre aux questions.',
        questions: [{ id: 1, type: 'qcm', text: 'Deux plus deux ?', options: ['3', '4'], correctAnswer: '4', points: 2 }]
      })
    });
    assert.equal(assignment.response.status, 201);
    const assignmentId = assignment.body.assignment.id;

    const studentDashboard = await request('/api/student/dashboard', { headers: { Authorization: `Bearer ${studentToken}` } });
    assert.ok(studentDashboard.body.dashboard.assignments.some((item) => item.id === assignmentId));
    assert.equal(studentDashboard.body.dashboard.assignments.find((item) => item.id === assignmentId).type, 'interrogation');
    for (const token of [otherPromotionToken, otherFacultyToken]) {
      const dashboard = await request('/api/student/dashboard', { headers: { Authorization: `Bearer ${token}` } });
      assert.ok(!dashboard.body.dashboard.assignments.some((item) => item.id === assignmentId));
      const directAccess = await request(`/api/assignments/${assignmentId}?faculte=Sciences%20informatiques&promotion=L2`, { headers: { Authorization: `Bearer ${token}` } });
      assert.equal(directAccess.response.status, 403);
      const forbiddenStart = await request(`/api/assignments/${assignmentId}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ faculty: 'Sciences informatiques', promotion: 'L2' })
      });
      assert.equal(forbiddenStart.response.status, 403);
      const forbiddenSubmit = await request(`/api/assignments/${assignmentId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ answers: [] })
      });
      assert.equal(forbiddenSubmit.response.status, 403);
    }

    const upcomingAssignment = await request('/api/assignments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${teacherToken}` },
      body: JSON.stringify({ ...JSON.parse(JSON.stringify({
        title: `Upcoming ${Date.now()}`,
        subject: 'Mathematiques',
        type: 'devoir',
        faculty: 'Sciences informatiques',
        promotion: 'L2',
        startAt: new Date(Date.now() + 60000).toISOString(),
        endAt: new Date(Date.now() + 3600000).toISOString(),
        duration: 30,
        instructions: 'Test',
        questions: [{ id: 1, type: 'qcm', text: 'Question ?', options: ['A', 'B'], correctAnswer: 'A', points: 1 }]
      })) })
    });
    assert.equal(upcomingAssignment.response.status, 201);
    assert.equal(upcomingAssignment.body.assignment.type, 'devoir');
    const examAssignment = await request('/api/assignments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${teacherToken}` },
      body: JSON.stringify({
        title: `Exam ${Date.now()}`,
        subject: 'Mathematiques',
        type: 'examen',
        faculty: 'Sciences informatiques',
        promotion: 'L2',
        startAt: new Date(Date.now() + 60000).toISOString(),
        endAt: new Date(Date.now() + 3600000).toISOString(),
        duration: 30,
        instructions: 'Test examen',
        questions: [{ id: 1, type: 'qcm', text: 'Question ?', options: ['A', 'B'], correctAnswer: 'A', points: 1 }]
      })
    });
    assert.equal(examAssignment.response.status, 201);
    assert.equal(examAssignment.body.assignment.type, 'examen');
    const refreshedDashboard = await request('/api/student/dashboard', { headers: { Authorization: `Bearer ${studentToken}` } });
    const visibleAssignments = refreshedDashboard.body.dashboard.assignments;
    assert.ok(visibleAssignments.some((item) => item.id === assignmentId));
    assert.ok(visibleAssignments.some((item) => item.type === 'devoir'));
    assert.ok(visibleAssignments.some((item) => item.type === 'examen'));
    const peerDashboard = await request('/api/student/dashboard', { headers: { Authorization: `Bearer ${peerStudentToken}` } });
    assert.ok(peerDashboard.body.dashboard.assignments.some((item) => item.id === assignmentId));
    const upcomingStart = await request(`/api/assignments/${upcomingAssignment.body.assignment.id}/start`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${studentToken}` }
    });
    assert.equal(upcomingStart.response.status, 403);

    const publicAssignment = await request(`/api/assignments/${assignmentId}`, {
      headers: { Authorization: `Bearer ${studentToken}` }
    });
    assert.equal(publicAssignment.response.status, 200);
    assert.equal(Object.hasOwn(publicAssignment.body.assignment.questions[0], 'correctAnswer'), false);

    const attempt = await request(`/api/assignments/${assignmentId}/start`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${studentToken}` }
    });
    assert.equal(attempt.response.status, 201);

    const resumedAttempt = await request(`/api/assignments/${assignmentId}/attempt`, {
      headers: { Authorization: `Bearer ${studentToken}` }
    });
    assert.equal(resumedAttempt.response.status, 200);
    assert.equal(resumedAttempt.body.attempt.id, attempt.body.attempt.id);
    assert.ok(resumedAttempt.body.attempt.remainingSeconds > 0);

    const startAgainWhileInProgress = await request(`/api/assignments/${assignmentId}/start`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${studentToken}` }
    });
    assert.equal(startAgainWhileInProgress.response.status, 200);
    assert.equal(startAgainWhileInProgress.body.attempt.id, attempt.body.attempt.id);

    const submission = await request(`/api/assignments/${assignmentId}/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${studentToken}` },
      body: JSON.stringify({ answers: [{ questionId: 1, answer: 1 }], score: 999, percentage: 100 })
    });
    assert.equal(submission.response.status, 201);
    assert.equal(submission.body.result.score, 2);
    assert.equal(submission.body.result.percentage, 100);
    const studentResults = await request('/api/student/results', { headers: { Authorization: `Bearer ${studentToken}` } });
    assert.equal(studentResults.response.status, 200);
    assert.equal(studentResults.body.results.length, 1);
    assert.equal(studentResults.body.results[0].type, 'interrogation');

    const secondAttempt = await request(`/api/assignments/${assignmentId}/start`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${studentToken}` }
    });
    assert.equal(secondAttempt.response.status, 409);

    const expiringAssignment = await request('/api/assignments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${teacherToken}` },
      body: JSON.stringify({
        title: `Expiring ${Date.now()}`,
        subject: 'Mathematiques',
        type: 'interrogation',
        faculty: 'Sciences informatiques',
        promotion: 'L2',
        startAt: new Date(Date.now() - 1000).toISOString(),
        endAt: new Date(Date.now() + 300).toISOString(),
        duration: 1,
        instructions: 'Test',
        questions: [{ id: 1, type: 'qcm', text: 'Question ?', options: ['A', 'B'], correctAnswer: 'A', points: 1 }]
      })
    });
    const expiringId = expiringAssignment.body.assignment.id;
    const expiringStart = await request(`/api/assignments/${expiringId}/start`, { method: 'POST', headers: { Authorization: `Bearer ${studentToken}` } });
    assert.equal(expiringStart.response.status, 201);
    await new Promise((resolve) => setTimeout(resolve, 400));
    const expiredSubmit = await request(`/api/assignments/${expiringId}/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${studentToken}` },
      body: JSON.stringify({ answers: [] })
    });
    assert.equal(expiredSubmit.response.status, 403);
    const expiredDashboard = await request('/api/student/dashboard', { headers: { Authorization: `Bearer ${studentToken}` } });
    assert.equal(expiredDashboard.body.dashboard.assignments.find((item) => item.id === expiringId).studentStatus, 'expired');

    const teacherResults = await request(`/api/teacher/assignments/${assignmentId}/results`, {
      headers: { Authorization: `Bearer ${teacherToken}` }
    });
    assert.equal(teacherResults.response.status, 200);
    assert.equal(teacherResults.body.results.length, 1);

    const exportResponse = await request(`/api/teacher/assignments/${assignmentId}/export.xlsx`, {
      headers: { Authorization: `Bearer ${teacherToken}` }
    });
    assert.equal(exportResponse.response.status, 200);
    assert.equal(new Uint8Array(exportResponse.body).slice(0, 2).toString(), '80,75');
    console.log('evaluation flow ok');
  } finally {
    server.kill('SIGTERM');
    dataFiles.forEach((file, index) => fs.writeFileSync(file, originalData[index], 'utf8'));
  }
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
