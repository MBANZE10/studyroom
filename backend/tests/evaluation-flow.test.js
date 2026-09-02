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

(async () => {
  try {
    await waitForServer();
    const teacherLogin = await request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'teacher@studyroom.com', password: 'teacher123' })
    });
    assert.equal(teacherLogin.response.status, 200);

    const email = `evaluation.${Date.now()}@example.com`;
    const registration = await request('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fullName: 'Étudiant Evaluation', email, password: 'student123', role: 'teacher', matricule: 'EVAL-1', sexe: 'F', faculte: 'Sciences', promotion: '2026' })
    });
    assert.equal(registration.response.status, 201);
    assert.equal(registration.body.user.role, 'student');

    const studentLogin = await request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'student123' })
    });
    assert.equal(studentLogin.response.status, 200);
    const teacherToken = teacherLogin.body.token;
    const studentToken = studentLogin.body.token;
    const assignment = await request('/api/assignments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${teacherToken}` },
      body: JSON.stringify({
        title: `Evaluation ${Date.now()}`,
        subject: 'Mathematiques',
        type: 'interrogation',
        startAt: new Date(Date.now() - 60000).toISOString(),
        endAt: new Date(Date.now() + 3600000).toISOString(),
        duration: 30,
        instructions: 'Repondre aux questions.',
        questions: [{ id: 1, type: 'qcm', text: 'Deux plus deux ?', options: ['3', '4'], correctAnswer: '4', points: 2 }]
      })
    });
    assert.equal(assignment.response.status, 201);
    const assignmentId = assignment.body.assignment.id;

    const upcomingAssignment = await request('/api/assignments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${teacherToken}` },
      body: JSON.stringify({ ...JSON.parse(JSON.stringify({
        title: `Upcoming ${Date.now()}`,
        subject: 'Mathematiques',
        type: 'devoir',
        startAt: new Date(Date.now() + 60000).toISOString(),
        endAt: new Date(Date.now() + 3600000).toISOString(),
        duration: 30,
        instructions: 'Test',
        questions: [{ id: 1, type: 'qcm', text: 'Question ?', options: ['A', 'B'], correctAnswer: 'A', points: 1 }]
      })) })
    });
    assert.equal(upcomingAssignment.response.status, 201);
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
