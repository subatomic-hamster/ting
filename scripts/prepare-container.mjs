// Maintainer step only. Docker itself never installs dependencies or downloads files.
import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { gzipSync } from 'node:zlib';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
process.chdir(root);
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
async function sourceHash() {
  const files = ['index.html', 'package.json', 'package-lock.json', 'vite.config.ts', 'tsconfig.json', 'tsconfig.app.json', 'tsconfig.node.json', 'docker/server.go', 'docker/go.mod'];
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const name = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(name);
      else files.push(name);
    }
  }
  await walk('src');
  await walk('public');
  const digest = createHash('sha256');
  for (const file of files.sort()) {
    digest.update(file + '\0');
    digest.update(await readFile(file));
  }
  return digest.digest('hex');
}

const sourceSha256 = await sourceHash();
if (process.argv.includes('--check')) {
  const manifest = JSON.parse(await readFile('docker/manifest.json', 'utf8'));
  if (manifest.sourceSha256 !== sourceSha256) throw Error('Container snapshot is stale. Run npm run docker:prepare and commit docker/.');
  for (const [file, expected] of Object.entries(manifest.artifacts)) {
    if (hash(await readFile(file)) !== expected) throw Error(`Container artifact changed: ${file}`);
  }
  console.log('Container source and artifact hashes match.');
  process.exit(0);
}

execFileSync('npm', ['run', 'build'], {
  stdio: 'inherit',
  env: { ...process.env, VITE_USE_MOCKS: 'true', VITE_API_URL: '', VITE_WS_URL: '', VITE_BRIDGE_URL: 'http://localhost:8787' },
});
await rm('docker/.site', { recursive: true, force: true });
await cp('dist', 'docker/.site', { recursive: true });
await mkdir('docker/.site/ocr', { recursive: true });
await mkdir('docker/bin', { recursive: true });
await writeFile('docker/.site/config.js', 'window.TING_CONFIG = { useMocks: true, ocrAssetBase: "/ocr" };\n');
await cp('node_modules/tesseract.js/dist/worker.min.js', 'docker/.site/ocr/worker.min.js');
await cp('node_modules/tesseract.js/dist/worker.min.js.LICENSE.txt', 'docker/.site/ocr/worker.LICENSE.txt');
await cp('node_modules/tesseract.js-core/LICENSE', 'docker/.site/ocr/core.LICENSE.txt');
for (const name of ['tesseract-core-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm.js', 'tesseract-core-relaxedsimd-lstm.wasm.js']) {
  await cp(`node_modules/tesseract.js-core/${name}`, `docker/.site/ocr/${name}`);
}
const languageUrl = 'https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/main/eng.traineddata';
const response = await fetch(languageUrl, { signal: AbortSignal.timeout(60_000) });
if (!response.ok) throw Error(`English OCR data download failed: ${response.status}`);
const language = Buffer.from(await response.arrayBuffer());
await writeFile('docker/.site/ocr/eng.traineddata.gz', gzipSync(language));
const license = await fetch('https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/main/LICENSE', { signal: AbortSignal.timeout(30_000) });
if (!license.ok) throw Error('OCR license download failed');
await writeFile('docker/.site/ocr/language.LICENSE.txt', await license.text());
execFileSync('go', ['test', './...'], { cwd: 'docker', stdio: 'inherit' });
for (const architecture of ['amd64', 'arm64']) {
  execFileSync('go', ['build', '-trimpath', '-buildvcs=false', '-ldflags=-s -w', '-o', `bin/server-${architecture}`, '.'], {
    cwd: 'docker', stdio: 'inherit', env: { ...process.env, CGO_ENABLED: '0', GOOS: 'linux', GOARCH: architecture },
  });
}
execFileSync('tar', ['-czf', '../site.tar', '.'], { cwd: 'docker/.site' });
const artifacts = {};
for (const file of ['docker/site.tar', 'docker/bin/server-amd64', 'docker/bin/server-arm64']) artifacts[file] = hash(await readFile(file));
await writeFile('docker/manifest.json', JSON.stringify({
  sourceSha256, artifacts, language: { url: languageUrl, sha256: hash(language), license: 'Apache-2.0' },
  mode: 'offline demo; original browser engine; local PDF and English OCR assets',
}, null, 2) + '\n');
await rm('docker/.site', { recursive: true, force: true });
console.log('Prepared offline image artifacts for Linux amd64 and arm64.');
