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

    const uniqueEmail = `student.flow.${Date.now()}@example.com`;
    const response = await fetch(`http://localhost:${serverPort}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nom: 'Mbanze',
        postnom: 'Elvis',
        prenom: 'Robert',
        email: uniqueEmail,
        password: 'student123',
        sexe: 'M',
        matricule: `MAT-${Date.now()}`,
        promotion: 'L2',
        faculte: 'Informatique',
        classe: 'L2-A'
      })
    });

    const payload = await response.json();
    assert.equal(response.status, 201, `Création de compte impossible: ${payload.message || response.status}`);
    assert.ok(payload.token, 'Le token JWT est absent après création du compte.');
    assert.equal(payload.user.role, 'student', `Rôle inattendu: ${payload.user.role}`);
    assert.match(payload.user.fullName, /Mbanze/i, 'Le nom complet n’a pas été reconstruit à partir des champs distincts.');

    const dashboard = await fetch(`http://localhost:${serverPort}/api/student/dashboard`, {
      headers: { Authorization: `Bearer ${payload.token}` }
    });
    const dashboardPayload = await dashboard.json();
    assert.equal(dashboard.status, 200, `Accès étudiant impossible: ${dashboardPayload.message || dashboard.status}`);
    assert.equal(dashboardPayload.user.fullName, payload.user.fullName, 'Le profil étudiant n’est pas correctement restauré.');

    console.log('student registration flow ok');
  } finally {
    server.kill('SIGTERM');
  }
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
