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

    const uniqueEmail = `teacher.register.${Date.now()}@example.com`;
    const response = await fetch(`http://localhost:${serverPort}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: 'Professeur Test',
        email: uniqueEmail,
        password: 'student123',
        role: 'teacher',
        sexe: 'F',
        matricule: 'TEST-1',
        promotion: '2026',
        faculte: 'Informatique',
        filiere: 'Informatique',
        classe: 'L1-A'
      })
    });

    const payload = await response.json();
    assert.equal(response.status, 201, `Statut inattendu: ${payload.message || response.status}`);
    assert.equal(payload.user.role, 'student', `Le rôle public doit être student, reçu: ${payload.user.role}`);
    console.log('public registration student role ok');
  } finally {
    server.kill('SIGTERM');
  }
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
