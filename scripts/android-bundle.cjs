/**
 * android-bundle.cjs — gera AAB assinado para Play Store
 */
const { execSync } = require('child_process');
const path = require('path');

const root = path.join(__dirname, '..');
const androidDir = path.join(root, 'android');

const isWin = process.platform === 'win32';
const gradlew = isWin ? 'gradlew.bat' : './gradlew';

console.log('[android-bundle] Gerando Android App Bundle (AAB)...');
execSync(gradlew + ' bundleRelease', {
  cwd: androidDir,
  stdio: 'inherit',
  shell: isWin,
});

const aab = path.join(androidDir, 'app', 'build', 'outputs', 'bundle', 'release', 'app-release.aab');
console.log('[android-bundle] AAB:', aab);
