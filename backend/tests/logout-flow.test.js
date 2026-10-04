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

    const email = `logout.${Date.now()}@example.com`;
    const register = await fetch(`http://localhost:${serverPort}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nom: 'Logout',
        postnom: 'Student',
        prenom: 'Test',
        email,
        password: 'student123',
        sexe: 'M',
        matricule: `LOG-${Date.now()}`,
        promotion: 'L2',
        faculte: 'Informatique',
        classe: 'L2-A'
      })
    });

    const created = await register.json();
    assert.equal(register.status, 201, `Création compte impossible: ${created.message || register.status}`);

    const logout = await fetch(`http://localhost:${serverPort}/api/auth/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${created.token}` }
    });
    const logoutPayload = await logout.json();
    assert.equal(logout.status, 200, `Logout impossible: ${logoutPayload.message || logout.status}`);

    const dashboard = await fetch(`http://localhost:${serverPort}/api/student/dashboard`, {
      headers: { Authorization: `Bearer ${created.token}` }
    });
    const dashboardPayload = await dashboard.json();
    assert.equal(dashboard.status, 401, `Le token ne doit plus être valide après déconnexion: ${dashboardPayload.message || dashboard.status}`);

    console.log('logout flow ok');
  } finally {
    server.kill('SIGTERM');
  }
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
