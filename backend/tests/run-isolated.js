const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const projectRoot = path.resolve(__dirname, '../..');
const sourceDataDirectory = path.join(projectRoot, 'backend/src/data');
const testFiles = fs.readdirSync(__dirname)
  .filter((name) => name.endsWith('.test.js'))
  .sort();
const failures = [];

for (const testFile of testFiles) {
  const isolatedDataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'studyroom-test-data-'));
  try {
    for (const name of fs.readdirSync(sourceDataDirectory).filter((entry) => entry.endsWith('.json'))) {
      fs.copyFileSync(path.join(sourceDataDirectory, name), path.join(isolatedDataDirectory, name));
    }

    console.log(`\n=== ${testFile} (données isolées) ===`);
    const result = spawnSync(process.execPath, [path.join(__dirname, testFile)], {
      cwd: projectRoot,
      env: { ...process.env, STUDYROOM_DATA_DIR: isolatedDataDirectory },
      stdio: 'inherit'
    });
    console.log(`Résultat ${testFile}: code=${result.status}, signal=${result.signal || 'aucun'}`);
    if (result.error || result.status !== 0) {
      failures.push({ testFile, error: result.error?.message || `code de sortie ${result.status}` });
    }
  } finally {
    fs.rmSync(isolatedDataDirectory, { recursive: true, force: true });
  }
}

if (failures.length) {
  console.error('\nTests en échec :');
  for (const failure of failures) console.error(`- ${failure.testFile}: ${failure.error}`);
  process.exitCode = 1;
} else {
  console.log(`\nTous les ${testFiles.length} scripts de test ont réussi.`);
}
