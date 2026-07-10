/**
 * android-release.cjs — Build APK/AAB release (requer android/keystore.properties)
 */
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const androidDir = path.join(__dirname, '..', 'android');
const keystore = path.join(androidDir, 'keystore.properties');

if (!fs.existsSync(keystore)) {
  console.error('Crie android/keystore.properties a partir de keystore.properties.example');
  process.exit(1);
}

const gradle = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
execSync(gradle + ' assembleRelease', { cwd: androidDir, stdio: 'inherit' });
console.log('Release em android/app/build/outputs/apk/release/');
