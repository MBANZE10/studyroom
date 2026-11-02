const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const projectRoot = path.resolve(__dirname, '../..');
const auditScript = path.join(projectRoot, 'backend/scripts/audit-json-migration.js');
const fixtureDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'studyroom-migration-audit-test-'));

function writeCollection(name, value) {
  fs.writeFileSync(path.join(fixtureDirectory, `${name}.json`), `${JSON.stringify(value, null, 2)}\n`);
}

function runAudit() {
  return spawnSync(process.execPath, [auditScript], {
    cwd: projectRoot,
    env: { ...process.env, STUDYROOM_DATA_DIR: fixtureDirectory },
    encoding: 'utf8'
  });
}

function seedValidData() {
  const now = '2026-01-01T00:00:00.000Z';
  writeCollection('users', [
    { id: 2, fullName: 'Fixture Student', email: 'student-fixture@example.test', role: 'student', passwordHash: 'not-output' },
    { id: 5, fullName: 'Fixture Teacher', email: 'teacher-fixture@example.test', role: 'teacher', passwordHash: 'not-output' }
  ]);
  writeCollection('assignments', [{
    id: 11, title: 'Fixture Assignment', teacherId: 5, startAt: now, endAt: '2026-01-02T00:00:00.000Z',
    questions: [{ id: 1, type: 'qcm' }]
  }]);
  writeCollection('submissions', [{ id: 13, assignmentId: 11, studentId: 2, status: 'submitted' }]);
  writeCollection('results', [{ id: 17, assignmentId: 11, studentId: 2, score: 4, maxScore: 5, percentage: 80 }]);
  writeCollection('notifications', [{ id: 19, userId: 2 }]);
  writeCollection('promoCodes', [{ id: 23, code: 'FIXTURE-1', isActive: false }]);
  writeCollection('passwordResetTokens', [{
    id: 29, userId: 2, tokenHash: crypto.createHash('sha256').update('raw-token-never-output').digest('hex'),
    createdAt: now, expiresAt: '2026-01-01T00:15:00.000Z', usedAt: null
  }]);
}

try {
  seedValidData();
  const originals = new Map(fs.readdirSync(fixtureDirectory).map((name) => [name, fs.readFileSync(path.join(fixtureDirectory, name))]));
  const valid = runAudit();
  assert.equal(valid.status, 0, valid.stderr || valid.stdout);
  const validReport = JSON.parse(valid.stdout);
  assert.equal(validReport.mode, 'read-only-preflight');
  assert.deepEqual(validReport.counts, {
    users: 2, assignments: 1, submissions: 1, results: 1, notifications: 1, promoCodes: 1, passwordResetTokens: 1
  });
  assert.equal(validReport.fatalIssues.length, 0);
  assert.doesNotMatch(valid.stdout, /student-fixture|teacher-fixture|not-output|raw-token-never-output/);
  for (const [name, contents] of originals) assert.deepEqual(fs.readFileSync(path.join(fixtureDirectory, name)), contents);

  writeCollection('submissions', [{ id: 13, assignmentId: 999, studentId: 2, status: 'submitted' }]);
  const orphan = runAudit();
  assert.equal(orphan.status, 1);
  assert.match(orphan.stdout, /missing assignment reference/);
  assert.doesNotMatch(orphan.stdout, /student-fixture|raw-token-never-output/);

  seedValidData();
  const users = JSON.parse(fs.readFileSync(path.join(fixtureDirectory, 'users.json'), 'utf8'));
  users.push({ id: 31, fullName: 'Duplicate Email', email: 'STUDENT-FIXTURE@example.test', role: 'student' });
  writeCollection('users', users);
  const duplicateEmail = runAudit();
  assert.equal(duplicateEmail.status, 1);
  assert.match(duplicateEmail.stdout, /case-insensitive duplicate emails/);

  const productionDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'studyroom-production-startup-test-'));
  try {
    const emptyProduction = spawnSync(process.execPath, [path.join(projectRoot, 'server.js')], {
      cwd: projectRoot,
      env: { ...process.env, NODE_ENV: 'production', JWT_SECRET: 'production-startup-test-secret', STUDYROOM_DATA_DIR: productionDirectory, PORT: '0' },
      encoding: 'utf8'
    });
    assert.notEqual(emptyProduction.status, 0, 'La production doit refuser un fichier utilisateurs absent au lieu de charger les comptes démo.');
    assert.match(`${emptyProduction.stdout}${emptyProduction.stderr}`, /refusing to use demo accounts/);
    assert.doesNotMatch(`${emptyProduction.stdout}${emptyProduction.stderr}`, /teacher@studyroom\.com|admin@studyroom\.com/);

    fs.writeFileSync(path.join(productionDirectory, 'users.json'), '[{"id":1,"role":"admin"}]');
    fs.writeFileSync(path.join(productionDirectory, 'results.json'), '{corrupt');
    const corruptProduction = spawnSync(process.execPath, [path.join(projectRoot, 'server.js')], {
      cwd: projectRoot,
      env: { ...process.env, NODE_ENV: 'production', JWT_SECRET: 'production-startup-test-secret', STUDYROOM_DATA_DIR: productionDirectory, PORT: '0' },
      encoding: 'utf8'
    });
    assert.notEqual(corruptProduction.status, 0, 'La production doit refuser une collection JSON corrompue.');
    assert.match(`${corruptProduction.stdout}${corruptProduction.stderr}`, /results\.json/);
  } finally {
    fs.rmSync(productionDirectory, { recursive: true, force: true });
  }
  console.log('JSON migration preflight tests passed');
} finally {
  fs.rmSync(fixtureDirectory, { recursive: true, force: true });
}
