#!/usr/bin/env node
/**
 * test-report.cjs — roda a suíte e grava resumo versionável em test-results/summary.txt
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const outDir = path.join(root, 'test-results');
const summaryPath = path.join(outDir, 'summary.txt');

function runJest(config, label, options) {
  options = options || {};
  const jsonPath = path.join(outDir, label + '.json');
  const args = [
    'node_modules/jest/bin/jest.js',
    '--config', config,
    '--json',
    '--outputFile', jsonPath,
  ];
  const env = Object.assign({}, process.env);
  if (options.experimentalVmModules) {
    env.NODE_OPTIONS = ((env.NODE_OPTIONS || '') + ' --experimental-vm-modules').trim();
  }
  const proc = spawnSync(process.execPath, args, {
    cwd: root,
    encoding: 'utf8',
    env: env,
  });
  let report = { numPassedTests: 0, numFailedTests: 0, numPendingTests: 0, numTotalTests: 0, success: false };
  if (fs.existsSync(jsonPath)) {
    try {
      report = Object.assign(report, JSON.parse(fs.readFileSync(jsonPath, 'utf8')));
    } catch (e) {
      report.parseError = e.message;
    }
  }
  report.exitCode = proc.status;
  report.label = label;
  return report;
}

fs.mkdirSync(outDir, { recursive: true });

const frontend = runJest('jest.frontend.config.cjs', 'jest-frontend');
const backend = runJest('jest.backend.config.cjs', 'jest-backend', { experimentalVmModules: true });

const lines = [
  'FinançasPro — resumo de testes',
  'Gerado em: ' + new Date().toISOString(),
  '',
  'Frontend:',
  '  suites: ' + (frontend.numPassedTestSuites || 0) + ' pass, '
    + (frontend.numFailedTestSuites || 0) + ' fail, '
    + (frontend.numPendingTestSuites || 0) + ' pending, '
    + (frontend.numTotalTestSuites || 0) + ' total',
  '  tests:  ' + frontend.numPassedTests + ' pass, '
    + frontend.numFailedTests + ' fail, '
    + frontend.numPendingTests + ' pending, '
    + frontend.numTotalTests + ' total',
  '',
  'Backend:',
  '  suites: ' + (backend.numPassedTestSuites || 0) + ' pass, '
    + (backend.numFailedTestSuites || 0) + ' fail, '
    + (backend.numPendingTestSuites || 0) + ' pending, '
    + (backend.numTotalTestSuites || 0) + ' total',
  '  tests:  ' + backend.numPassedTests + ' pass, '
    + backend.numFailedTests + ' fail, '
    + backend.numPendingTests + ' pending, '
    + backend.numTotalTests + ' total',
  '',
  'Total combinado:',
  '  tests: ' + (frontend.numTotalTests + backend.numTotalTests),
  '  pass:  ' + (frontend.numPassedTests + backend.numPassedTests),
  '  fail:  ' + (frontend.numFailedTests + backend.numFailedTests),
  '  skip:  ' + (frontend.numPendingTests + backend.numPendingTests),
];

fs.writeFileSync(summaryPath, lines.join('\n') + '\n');
console.log(lines.join('\n'));
console.log('\n[test-report] gravado em', summaryPath);

const failed = frontend.exitCode !== 0 || backend.exitCode !== 0;
process.exit(failed ? 1 : 0);
