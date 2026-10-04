const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');

const server = spawn(process.execPath, ['server.js'], {
  cwd: require('node:path').resolve(__dirname, '../..'),
  env: { ...process.env, PORT: '0' },
  stdio: ['ignore', 'pipe', 'pipe']
});

let stdout = '';
let stderr = '';
let serverPort = null;

server.stdout.on('data', (chunk) => {
  const text = chunk.toString();
  stdout += text;
  const match = text.match(/localhost:(\d+)/) || text.match(/0\.0\.0\.0:(\d+)/);
  if (match) {
    serverPort = Number(match[1]);
  }
});

server.stderr.on('data', (chunk) => {
  stderr += chunk.toString();
});

async function waitForServer() {
  const deadline = Date.now() + 10000;

  while (Date.now() < deadline) {
    if (serverPort) {
      try {
        const response = await fetch(`http://localhost:${serverPort}/api/health`);
        if (response.ok) {
          return;
        }
      } catch (error) {
        // attendre que le serveur démarre
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  throw new Error(`Le serveur n’a pas démarré.\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`);
}

(async () => {
  try {
    await waitForServer();

    const adminLogin = await fetch(`http://localhost:${serverPort}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@studyroom.com', password: 'admin123' })
    });
    const adminPayload = await adminLogin.json();
    assert.equal(adminLogin.status, 200, `Connexion admin impossible: ${adminPayload.message || adminLogin.status}`);

    const uniqueEmail = `student.delete.${Date.now()}@example.com`;
    const registration = await fetch(`http://localhost:${serverPort}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: 'Étudiant à supprimer',
        email: uniqueEmail,
        password: 'student123',
        sexe: 'M',
        matricule: `MAT-${Date.now()}`,
        promotion: '2026',
        faculte: 'Informatique'
      })
    });
    const createdStudent = await registration.json();
    assert.equal(registration.status, 201, `Création étudiant impossible: ${createdStudent.message || registration.status}`);

    const removeResponse = await fetch(`http://localhost:${serverPort}/api/admin/students/${createdStudent.user.id}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${adminPayload.token}`
      }
    });
    const removePayload = await removeResponse.json();

    assert.equal(removeResponse.status, 200, `Suppression absente ou refusée: ${removePayload.message || removeResponse.status}`);
    assert.equal(removePayload.student.isActive, false, 'Le compte étudiant doit être désactivé en soft delete.');

    const listResponse = await fetch(`http://localhost:${serverPort}/api/admin/students`, {
      headers: { Authorization: `Bearer ${adminPayload.token}` }
    });
    const listPayload = await listResponse.json();
    const isStillVisible = (listPayload.students || []).some((student) => Number(student.id) === Number(createdStudent.user.id));

    assert.equal(isStillVisible, false, 'L’étudiant supprimé ne doit plus apparaître dans la liste active.');
    console.log('admin student delete soft delete ok');
  } finally {
    server.kill('SIGTERM');
  }
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
