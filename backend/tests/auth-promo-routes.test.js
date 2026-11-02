const assert = require('node:assert/strict');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { hashPassword, hashToken } = require('../src/utils/auth');

const projectRoot = path.resolve(__dirname, '../..');
const sourceDataDirectory = path.join(projectRoot, 'backend/src/data');
const copiedDataFiles = ['users.json', 'assignments.json', 'submissions.json', 'notifications.json', 'results.json', 'promoCodes.json', 'passwordResetTokens.json'];
const dataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'studyroom-route-tests-'));
let activeServer = null;
let smtpServer = null;

for (const name of copiedDataFiles) {
  const source = path.join(sourceDataDirectory, name);
  if (fs.existsSync(source)) fs.copyFileSync(source, path.join(dataDirectory, name));
}

function writeJson(name, value) {
  fs.writeFileSync(path.join(dataDirectory, name), `${JSON.stringify(value, null, 2)}\n`);
}

function readJson(name) {
  return JSON.parse(fs.readFileSync(path.join(dataDirectory, name), 'utf8'));
}

function makeSmtpServer() {
  const messages = [];
  const server = net.createServer((socket) => {
    let buffer = '';
    let receivingData = false;
    let message = '';
    socket.write('220 studyroom-test ESMTP\r\n');
    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      let newline;
      while ((newline = buffer.indexOf('\r\n')) >= 0) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 2);
        if (receivingData) {
          if (line === '.') {
            receivingData = false;
            messages.push(message);
            message = '';
            socket.write('250 message accepted\r\n');
          } else {
            message += `${line}\n`;
          }
          continue;
        }
        if (/^(EHLO|HELO)\b/i.test(line)) socket.write('250 studyroom-test\r\n');
        else if (/^MAIL FROM:/i.test(line) || /^RCPT TO:/i.test(line)) socket.write('250 accepted\r\n');
        else if (/^DATA$/i.test(line)) {
          receivingData = true;
          socket.write('354 end with dot\r\n');
        } else if (/^QUIT$/i.test(line)) socket.write('221 bye\r\n');
        else socket.write('250 ok\r\n');
      }
    });
  });
  return { server, messages };
}

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return server.address().port;
}

async function startApp(extraEnv = {}) {
  let output = '';
  const child = spawn(process.execPath, ['server.js'], {
    cwd: projectRoot,
    env: { ...process.env, JWT_SECRET: 'studyroom-route-test-secret', STUDYROOM_DATA_DIR: dataDirectory, PORT: '0', ...extraEnv },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  activeServer = child;
  child.stdout.on('data', (chunk) => { output += chunk.toString(); });
  child.stderr.on('data', (chunk) => { output += chunk.toString(); });

  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    const match = output.match(/localhost:(\d+)/);
    if (match) {
      const port = Number(match[1]);
      try {
        const response = await fetch(`http://127.0.0.1:${port}/api/health`);
        if (response.ok) return { child, port, getOutput: () => output };
      } catch {}
    }
    if (child.exitCode !== null) break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`StudyRoom n'a pas démarré. Sortie: ${output}`);
}

async function stopApp() {
  if (!activeServer) return;
  const child = activeServer;
  activeServer = null;
  if (child.exitCode === null) child.kill();
  await new Promise((resolve) => child.once('exit', resolve));
}

async function jsonRequest(baseUrl, route, options = {}) {
  const response = await fetch(`${baseUrl}${route}`, options);
  return { response, body: await response.json() };
}

function bearer(token) {
  return { Authorization: `Bearer ${token}` };
}

function decodeQuotedPrintable(message) {
  return message
    .replace(/=\n/g, '')
    .replace(/=([0-9A-F]{2})/gi, (match, hex) => String.fromCharCode(parseInt(hex, 16)));
}

async function login(baseUrl, email, password) {
  return jsonRequest(baseUrl, '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
}

async function run() {
  const now = new Date().toISOString();
  const users = readJson('users.json');
  const baseId = Math.max(0, ...users.map((user) => Number(user.id) || 0));
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const adminEmail = `route-admin-${suffix}@example.test`;
  const studentEmail = `route-student-${suffix}@example.test`;
  const oldPassword = 'StartingPassword123!';
  const newPassword = 'ReplacementPassword456!';
  const targetId = baseId + 1;
  const fixtureUsers = [
    { id: targetId, fullName: 'Route Test Student', email: studentEmail, passwordHash: hashPassword(oldPassword), role: 'student', createdAt: now, isActive: true, deletedAt: null },
    { id: targetId + 1, fullName: 'Route Test Admin', email: adminEmail, passwordHash: hashPassword(oldPassword), role: 'admin', createdAt: now, isActive: true, deletedAt: null }
  ];
  writeJson('users.json', [...users, ...fixtureUsers]);

  const expiredToken = 'a'.repeat(64);
  const usedToken = 'b'.repeat(64);
  const seededResetTokens = [
    { id: 1, userId: targetId, tokenHash: hashToken(expiredToken), createdAt: now, expiresAt: new Date(Date.now() - 1000).toISOString(), usedAt: null, consumedBy: null },
    { id: 2, userId: targetId, tokenHash: hashToken(usedToken), createdAt: now, expiresAt: new Date(Date.now() + 60000).toISOString(), usedAt: now, consumedBy: 'used' }
  ];
  writeJson('passwordResetTokens.json', seededResetTokens);

  // No SMTP configured: report the service configuration issue consistently
  // without revealing whether the requested account exists or creating a token.
  const noSmtpApp = await startApp({ SMTP_HOST: '', SMTP_PORT: '', SMTP_USER: '', SMTP_PASS: '' });
  const noSmtpBase = `http://127.0.0.1:${noSmtpApp.port}`;
  const allowedOriginHealth = await fetch(`${noSmtpBase}/api/health`, { headers: { Origin: 'https://mbanze10.github.io' } });
  assert.equal(allowedOriginHealth.headers.get('access-control-allow-origin'), 'https://mbanze10.github.io');
  const rejectedOriginHealth = await fetch(`${noSmtpBase}/api/health`, { headers: { Origin: 'https://untrusted.example' } });
  assert.equal(rejectedOriginHealth.headers.get('access-control-allow-origin'), null);
  for (const privatePath of ['/backend/src/data/users.json', '/backend/src/data/passwordResetTokens.json', '/server.js']) {
    const privateResponse = await fetch(`${noSmtpBase}${privatePath}`);
    assert.equal(privateResponse.status, 404, `La ressource privÃ©e ${privatePath} ne doit pas Ãªtre servie.`);
  }
  for (const publicPath of ['/style.css', '/script.js', '/config.js', '/reset-password.html']) {
    const publicResponse = await fetch(`${noSmtpBase}${publicPath}`);
    assert.equal(publicResponse.status, 200, `La ressource frontend ${publicPath} doit rester disponible.`);
  }
  const knownRequest = await jsonRequest(noSmtpBase, '/api/auth/forgot-password', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: studentEmail })
  });
  const unknownRequest = await jsonRequest(noSmtpBase, '/api/auth/forgot-password', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: `missing-${suffix}@example.test` })
  });
  assert.equal(knownRequest.response.status, 503);
  assert.equal(unknownRequest.response.status, 503);
  assert.deepEqual(knownRequest.body, unknownRequest.body);
  assert.match(knownRequest.body.message, /service d’envoi d’e-mails n’est pas configuré/i);
  assert.equal(readJson('passwordResetTokens.json').length, seededResetTokens.length, 'Sans SMTP, aucun jeton ne doit être créé.');
  assert.doesNotMatch(noSmtpApp.getOutput(), /[a-f0-9]{64}/i, 'Aucun jeton ne doit apparaître dans les logs sans SMTP.');
  await stopApp();

  // Controlled local SMTP sink: this verifies SMTP protocol handoff and email
  // content without claiming that a real external mail provider delivered it.
  const smtp = makeSmtpServer();
  smtpServer = smtp.server;
  const smtpPort = await listen(smtp.server);
  const mailApp = await startApp({ SMTP_HOST: '127.0.0.1', SMTP_PORT: String(smtpPort), SMTP_SECURE: 'false', FRONTEND_URL: 'https://mbanze10.github.io/studyroom' });
  const baseUrl = `http://127.0.0.1:${mailApp.port}`;
  const oldLogin = await login(baseUrl, studentEmail, oldPassword);
  assert.equal(oldLogin.response.status, 200);

  for (const [label, token] of [['invalid', 'c'.repeat(64)], ['expired', expiredToken], ['used', usedToken]]) {
    const attempt = await jsonRequest(baseUrl, '/api/auth/reset-password', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, password: newPassword })
    });
    assert.equal(attempt.response.status, 400, `${label}: le jeton doit être refusé.`);
    assert.match(attempt.body.message, /invalide|expiré/i);
  }

  const invalidEmail = await jsonRequest(baseUrl, '/api/auth/forgot-password', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'not-an-email' })
  });
  assert.equal(invalidEmail.response.status, 400);

  const missingRequest = await jsonRequest(baseUrl, '/api/auth/forgot-password', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: `missing-${suffix}@example.test` })
  });
  assert.equal(missingRequest.response.status, 200);
  assert.match(missingRequest.body.message, /Si un compte correspond/i);
  assert.equal(smtp.messages.length, 0, 'Une adresse inexistante ne doit déclencher aucun courriel.');

  const resetRequest = await jsonRequest(baseUrl, '/api/auth/forgot-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://mbanze10.github.io' },
    body: JSON.stringify({ email: studentEmail })
  });
  assert.equal(resetRequest.response.status, 200);
  assert.equal(smtp.messages.length, 1, 'Le SMTP contrôlé doit recevoir exactement un message.');
  const mailTokenRecords = readJson('passwordResetTokens.json');
  const decodedMail = decodeQuotedPrintable(smtp.messages[0]);
  assert.match(decodedMail, /https:\/\/mbanze10\.github\.io\/studyroom\/reset-password\.html\?token=/, 'Le mail doit pointer vers le chemin GitHub Pages du dépôt StudyRoom.');
  const sentTokens = [...decodedMail.matchAll(/token=([a-f0-9]{64})/gi)].map((match) => match[1]);
  const sentToken = sentTokens.find((candidate) => mailTokenRecords.some((item) => item.tokenHash === hashToken(candidate) && item.usedAt === null));
  assert.ok(sentToken, 'Le message SMTP contrôlé doit contenir le jeton actif correspondant au hachage persistant.');
  assert.doesNotMatch(mailApp.getOutput(), new RegExp(sentToken), 'Le jeton ne doit pas apparaître dans les logs du serveur.');

  const successfulReset = await jsonRequest(baseUrl, '/api/auth/reset-password', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: sentToken, password: newPassword })
  });
  assert.equal(successfulReset.response.status, 200, successfulReset.body.message);
  const persistedResetUser = readJson('users.json').find((user) => user.id === targetId);
  assert.equal(persistedResetUser.tokenVersion, 1, 'La version de session invalide doit persister sur le compte.');
  await stopApp();
  const restartedApp = await startApp({ SMTP_HOST: '127.0.0.1', SMTP_PORT: String(smtpPort), SMTP_SECURE: 'false' });
  const restartedBaseUrl = `http://127.0.0.1:${restartedApp.port}`;
  const oldSession = await fetch(`${restartedBaseUrl}/api/profile`, { headers: bearer(oldLogin.body.token) });
  assert.equal(oldSession.status, 401, 'La session antérieure doit être invalidée.');
  const oldPasswordLogin = await login(restartedBaseUrl, studentEmail, oldPassword);
  assert.equal(oldPasswordLogin.response.status, 401);
  const newLogin = await login(restartedBaseUrl, studentEmail, newPassword);
  assert.equal(newLogin.response.status, 200, 'Une nouvelle connexion doit rester possible.');
  const repeatedReset = await jsonRequest(restartedBaseUrl, '/api/auth/reset-password', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: sentToken, password: 'AnotherPassword789!' })
  });
  assert.equal(repeatedReset.response.status, 400, 'Un jeton déjà consommé ne doit pas être réutilisable.');

  const adminLogin = await login(restartedBaseUrl, adminEmail, oldPassword);
  assert.equal(adminLogin.response.status, 200);
  const adminHeaders = { ...bearer(adminLogin.body.token), 'Content-Type': 'application/json' };
  const studentHeaders = { ...bearer(newLogin.body.token), 'Content-Type': 'application/json' };
  const initialPromoList = await jsonRequest(restartedBaseUrl, '/api/admin/promo-codes', { headers: bearer(adminLogin.body.token) });
  assert.equal(initialPromoList.response.status, 200);
  const beforeInvalidPromoRequests = initialPromoList.body.promoCodes;

  const forbiddenStudentRead = await fetch(`${restartedBaseUrl}/api/admin/promo-codes`, { headers: bearer(newLogin.body.token) });
  assert.equal(forbiddenStudentRead.status, 403);
  const forbiddenStudentCreate = await jsonRequest(restartedBaseUrl, '/api/admin/promo-codes', {
    method: 'POST', headers: studentHeaders, body: JSON.stringify({ code: 'STUDENT1', isActive: true })
  });
  assert.equal(forbiddenStudentCreate.response.status, 403);

  const createdPromo = await jsonRequest(restartedBaseUrl, '/api/admin/promo-codes', {
    method: 'POST', headers: adminHeaders, body: JSON.stringify({ code: ' route-2027 ', label: 'Route 2027', description: 'Integration', isActive: true })
  });
  assert.equal(createdPromo.response.status, 201);
  assert.equal(createdPromo.body.promoCode.code, 'ROUTE-2027');
  const duplicatePromo = await jsonRequest(restartedBaseUrl, '/api/admin/promo-codes', {
    method: 'POST', headers: adminHeaders, body: JSON.stringify({ code: 'route-2027' })
  });
  assert.equal(duplicatePromo.response.status, 409);

  const invalidPromoPayloads = [
    { code: 'abc' },
    { code: 'BAD CODE' },
    { code: 'X'.repeat(33) },
    { code: 'TOOLONG1', label: 'L'.repeat(101) },
    { code: 'TOOLONG2', description: 'D'.repeat(501) },
    { code: 'BADBOOL1', isActive: 'true' },
    { code: 'BADBOOL2', isActive: 1 }
  ];
  for (const payload of invalidPromoPayloads) {
    const result = await jsonRequest(restartedBaseUrl, '/api/admin/promo-codes', {
      method: 'POST', headers: adminHeaders, body: JSON.stringify(payload)
    });
    assert.equal(result.response.status, 400, `Payload promo invalide accepté: ${JSON.stringify(payload).slice(0, 40)}`);
  }
  const afterInvalidCreates = await jsonRequest(restartedBaseUrl, '/api/admin/promo-codes', { headers: bearer(adminLogin.body.token) });
  assert.deepEqual(afterInvalidCreates.body.promoCodes, [...beforeInvalidPromoRequests, createdPromo.body.promoCode]);

  const invalidPatch = await jsonRequest(restartedBaseUrl, `/api/admin/promo-codes/${createdPromo.body.promoCode.id}`, {
    method: 'PATCH', headers: adminHeaders, body: JSON.stringify({ code: 'CHANGED1', label: 'L'.repeat(101), isActive: false })
  });
  assert.equal(invalidPatch.response.status, 400);
  const afterInvalidPatch = await jsonRequest(restartedBaseUrl, '/api/admin/promo-codes', { headers: bearer(adminLogin.body.token) });
  assert.deepEqual(afterInvalidPatch.body.promoCodes, afterInvalidCreates.body.promoCodes, 'Une mise à jour invalide ne doit rien modifier.');

  const forbiddenStudentPatch = await fetch(`${restartedBaseUrl}/api/admin/promo-codes/${createdPromo.body.promoCode.id}`, {
    method: 'PATCH', headers: studentHeaders, body: JSON.stringify({ isActive: false })
  });
  assert.equal(forbiddenStudentPatch.status, 403);
  const studentPromoStatus = await jsonRequest(restartedBaseUrl, '/api/student/promo-status?code=ROUTE-2027', { headers: bearer(newLogin.body.token) });
  assert.equal(studentPromoStatus.response.status, 200);
  assert.equal(studentPromoStatus.body.valid, true);

  const validPatch = await jsonRequest(restartedBaseUrl, `/api/admin/promo-codes/${createdPromo.body.promoCode.id}`, {
    method: 'PATCH', headers: adminHeaders, body: JSON.stringify({ isActive: false })
  });
  assert.equal(validPatch.response.status, 200);
  const disabledStatus = await jsonRequest(restartedBaseUrl, '/api/student/promo-status?code=ROUTE-2027', { headers: bearer(newLogin.body.token) });
  assert.equal(disabledStatus.response.status, 200);
  assert.equal(disabledStatus.body.valid, false);

  assert.doesNotMatch(mailApp.getOutput(), /[a-f0-9]{64}/i, 'Aucun jeton brut ne doit apparaître dans les logs SMTP.');
  console.log('auth and promo route integration tests passed');
}

(async () => {
  try {
    await run();
  } finally {
    await stopApp();
    if (smtpServer) await new Promise((resolve) => smtpServer.close(resolve));
    fs.rmSync(dataDirectory, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
