const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const clientDirectory = path.resolve(__dirname, '../client');
const outputDirectory = path.join(__dirname, 'public');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

execFileSync(npm, ['ci'], { cwd: clientDirectory, stdio: 'inherit' });
execFileSync(npm, ['run', 'build'], { cwd: clientDirectory, stdio: 'inherit' });

fs.rmSync(outputDirectory, { recursive: true, force: true });
fs.cpSync(path.join(clientDirectory, 'dist'), outputDirectory, { recursive: true });

console.log(`Vue 前端已建置到 ${outputDirectory}`);
