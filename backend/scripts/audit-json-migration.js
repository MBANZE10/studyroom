#!/usr/bin/env node
// Read-only preflight for the future JSON -> PostgreSQL migration.
// It reports aggregate counts and source checksums, never record values or token hashes.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const dataDirectory = process.env.STUDYROOM_DATA_DIR || path.resolve(__dirname, '../src/data');
const collectionNames = [
  'users', 'assignments', 'submissions', 'results', 'notifications',
  'promoCodes', 'passwordResetTokens'
];
const fatalIssues = [];
const warnings = [];
const collections = {};
const fileReports = [];

function loadCollection(name, required = false) {
  const filePath = path.join(dataDirectory, `${name}.json`);
  if (!fs.existsSync(filePath)) {
    if (required) fatalIssues.push(`${name}.json is required but missing`);
    collections[name] = [];
    return [];
  }

  const contents = fs.readFileSync(filePath);
  fileReports.push({
    file: `${name}.json`,
    bytes: contents.length,
    sha256: crypto.createHash('sha256').update(contents).digest('hex')
  });

  try {
    const value = JSON.parse(contents.toString('utf8'));
    if (!Array.isArray(value)) {
      fatalIssues.push(`${name}.json must contain a JSON array`);
      collections[name] = [];
      return [];
    }
    collections[name] = value;
    return value;
  } catch {
    fatalIssues.push(`${name}.json contains invalid JSON`);
    collections[name] = [];
    return [];
  }
}

function numericId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function checkIds(name, rows) {
  const seen = new Set();
  rows.forEach((row, index) => {
    const id = numericId(row?.id);
    if (id === null) {
      fatalIssues.push(`${name}[${index}] has an invalid or missing id`);
      return;
    }
    if (seen.has(id)) fatalIssues.push(`${name} contains duplicate id values`);
    seen.add(id);
  });
}

for (const name of collectionNames) loadCollection(name, name === 'users');

const { users, assignments, submissions, results, notifications, promoCodes, passwordResetTokens } = collections;
for (const name of collectionNames) checkIds(name, collections[name]);

const usersById = new Map(users.map((user) => [numericId(user.id), user]));
const assignmentsById = new Map(assignments.map((assignment) => [numericId(assignment.id), assignment]));

const emailKeys = users.map((user) => String(user.email || '').trim().toLowerCase());
if (emailKeys.some((email) => !email)) fatalIssues.push('users contains a missing email');
if (emailKeys.length !== new Set(emailKeys).size) fatalIssues.push('users contains case-insensitive duplicate emails');
for (const user of users) {
  if (!['student', 'teacher', 'admin'].includes(user.role)) fatalIssues.push('users contains an unsupported role');
}

for (const assignment of assignments) {
  const owner = usersById.get(numericId(assignment.teacherId));
  if (!owner || owner.role !== 'teacher') fatalIssues.push('assignments contains a missing or non-teacher owner');
  if (!Array.isArray(assignment.questions) || assignment.questions.length === 0) {
    fatalIssues.push('assignments contains an assignment without questions');
  } else {
    const questionIds = assignment.questions.map((question) => numericId(question.id));
    if (questionIds.some((id) => id === null) || questionIds.length !== new Set(questionIds).size) {
      fatalIssues.push('assignments contains invalid or duplicate question ids');
    }
  }
}

const submissionPairs = new Set();
for (const submission of submissions) {
  const assignmentId = numericId(submission.assignmentId);
  const studentId = numericId(submission.studentId);
  const student = usersById.get(studentId);
  if (!assignmentsById.has(assignmentId)) fatalIssues.push('submissions contains a missing assignment reference');
  if (!student || student.role !== 'student') fatalIssues.push('submissions contains a missing or non-student reference');
  const pair = `${assignmentId}:${studentId}`;
  if (submissionPairs.has(pair)) fatalIssues.push('submissions contains duplicate assignment/student pairs');
  submissionPairs.add(pair);
  if (!['in_progress', 'submitted', 'expired'].includes(submission.status)) {
    fatalIssues.push('submissions contains an unsupported status');
  }
}

let unlinkedResults = 0;
let duplicateResultPairs = 0;
const resultPairs = new Set();
for (const result of results) {
  if (result.assignmentId == null || result.studentId == null) {
    unlinkedResults += 1;
    continue;
  }
  if (!assignmentsById.has(numericId(result.assignmentId))) fatalIssues.push('results contains a missing assignment reference');
  const student = usersById.get(numericId(result.studentId));
  if (!student || student.role !== 'student') fatalIssues.push('results contains a missing or non-student reference');
  const pair = `${numericId(result.assignmentId)}:${numericId(result.studentId)}`;
  if (resultPairs.has(pair)) duplicateResultPairs += 1;
  resultPairs.add(pair);
  const score = Number(result.score);
  const maxScore = Number(result.maxScore);
  const percentage = Number(result.percentage);
  if (!Number.isFinite(score) || !Number.isFinite(maxScore) || score < 0 || maxScore < score
      || !Number.isFinite(percentage) || percentage < 0 || percentage > 100) {
    fatalIssues.push('results contains values outside the proposed score constraints');
  }
}
if (unlinkedResults) warnings.push(`${unlinkedResults} result rows are not linked to both an assignment and a student; they require snapshot preservation.`);
if (duplicateResultPairs) warnings.push(`${duplicateResultPairs} result rows share an assignment/student pair; preserve them as separate records and review their provenance.`);

for (const notification of notifications) {
  if (!usersById.has(numericId(notification.userId))) fatalIssues.push('notifications contains a missing user reference');
}

const promoKeys = promoCodes.map((promo) => String(promo.code || '').trim().toUpperCase());
if (promoKeys.some((code) => !/^[A-Z0-9_-]{4,32}$/.test(code))) fatalIssues.push('promoCodes contains an invalid code');
if (promoKeys.length !== new Set(promoKeys).size) fatalIssues.push('promoCodes contains case-insensitive duplicate codes');
if (promoCodes.some((promo) => typeof promo.isActive !== 'boolean')) fatalIssues.push('promoCodes contains a non-boolean isActive value');

for (const token of passwordResetTokens) {
  if (!usersById.has(numericId(token.userId))) fatalIssues.push('passwordResetTokens contains a missing user reference');
  if (!/^[a-f0-9]{64}$/.test(String(token.tokenHash || ''))) fatalIssues.push('passwordResetTokens contains a malformed token hash');
  const createdAt = Date.parse(token.createdAt);
  const expiresAt = Date.parse(token.expiresAt);
  if (!Number.isFinite(createdAt) || !Number.isFinite(expiresAt) || expiresAt <= createdAt) {
    fatalIssues.push('passwordResetTokens contains invalid timestamps');
  }
}

const counts = Object.fromEntries(collectionNames.map((name) => [name, collections[name].length]));
const report = {
  mode: 'read-only-preflight',
  dataDirectory,
  counts,
  fileReports,
  relationCounts: {
    linkedResults: results.length - unlinkedResults,
    unlinkedResults,
    duplicateLinkedResultPairs: duplicateResultPairs,
    assignmentsWithQuestions: assignments.filter((assignment) => Array.isArray(assignment.questions) && assignment.questions.length > 0).length
  },
  warnings,
  fatalIssues
};

console.log(JSON.stringify(report, null, 2));
if (fatalIssues.length) process.exitCode = 1;
