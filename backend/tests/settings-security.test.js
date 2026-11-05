const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { hashPassword } = require('../src/utils/auth');

const projectRoot = path.resolve(__dirname, '../..');
const sourceDataDirectory = path.join(projectRoot, 'backend/src/data');
const dataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'studyroom-settings-test-'));
for (const filename of fs.readdirSync(sourceDataDirectory).filter((entry) => entry.endsWith('.json'))) {
  fs.copyFileSync(path.join(sourceDataDirectory, filename), path.join(dataDirectory, filename));
}

const userEmail = `settings.user.${Date.now()}@example.com`;
const initialPassword = 'StrongPass123!';
const newPassword = 'UpdatedPass456!';
const userFile = path.join(dataDirectory, 'users.json');
const allUsers = JSON.parse(fs.readFileSync(userFile, 'utf8'));
allUsers.push({
  id: Math.max(0, ...allUsers.map((item) => Number(item.id) || 0)) + 1,
  fullName: 'Profile User',
  email: userEmail,
  passwordHash: hashPassword(initialPassword),
  role: 'student',
  sexe: 'F',
  matricule: 'ST-SET-001',
  promotion: 'L3',
  faculte: 'Sciences informatiques',
  filiere: 'Sciences informatiques',
  createdAt: new Date().toISOString(),
  isActive: true,
  deletedAt: null,
  preferences: { theme: 'light', notifications: { newAssignments: true }, accessibility: { textSize: 'medium' } }
});
fs.writeFileSync(userFile, JSON.stringify(allUsers, null, 2));

function startApp(extraEnv = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['server.js'], {
      cwd: projectRoot,
      env: { ...process.env, STUDYROOM_DATA_DIR: dataDirectory, PORT: '0', JWT_SECRET: 'studyroom-test-secret', ...extraEnv },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let output = '';
    child.stdout.on('data', (chunk) => { output += chunk.toString(); });
    child.stderr.on('data', (chunk) => { output += chunk.toString(); });
    const timer = setInterval(async () => {
      const portMatch = output.match(/localhost:(\d+)/);
      if (portMatch) {
        clearInterval(timer);
        resolve({ child, port: Number(portMatch[1]), output: () => output });
      } else if (child.exitCode !== null) {
        clearInterval(timer);
        reject(new Error(`server exited early: ${output}`));
      }
    }, 50);
  });
}

(async () => {
  const app = await startApp();
  const baseUrl = `http://127.0.0.1:${app.port}`;

  const login = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: userEmail, password: initialPassword })
  });
  const loginBody = await login.json();
  assert.equal(login.status, 200, loginBody.message);
  const token = loginBody.token;

  const profile = await fetch(`${baseUrl}/api/profile`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const profileBody = await profile.json();
  assert.equal(profile.status, 200);
  assert.equal(profileBody.user.email, userEmail);
  assert.equal(profileBody.user.role, 'student');

  const changePassword = await fetch(`${baseUrl}/api/auth/change-password`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ currentPassword: initialPassword, newPassword, confirmPassword: newPassword })
  });
  const changeBody = await changePassword.json();
  assert.equal(changePassword.status, 200, changeBody.message);

  const updatedLogin = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: userEmail, password: newPassword })
  });
  assert.equal(updatedLogin.status, 200, 'Le nouveau mot de passe doit être accepté.');
  const refreshedToken = (await updatedLogin.json()).token;

  const prefs = await fetch(`${baseUrl}/api/profile/preferences`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${refreshedToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ theme: 'dark', notifications: { newAssignments: false, examResults: true }, accessibility: { textSize: 'large' } })
  });
  const prefsBody = await prefs.json();
  assert.equal(prefs.status, 200, prefsBody.message);
  assert.equal(prefsBody.preferences.theme, 'dark');
  assert.equal(prefsBody.preferences.notifications.newAssignments, false);

  const promoCheck = await fetch(`${baseUrl}/api/student/promo-status?code=CODE2027`, {
    headers: { Authorization: `Bearer ${refreshedToken}` }
  });
  const promoBody = await promoCheck.json();
  assert.equal(promoCheck.status, 200, promoBody.message);
  assert.equal(promoBody.valid, false, 'CODE2027 doit rester désactivé sans validation admin.');

  app.child.kill();
  console.log('settings security flow ok');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
