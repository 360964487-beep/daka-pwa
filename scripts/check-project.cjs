const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const fail = (message) => { throw new Error(message); };
const assert = (condition, message) => { if (!condition) fail(message); };

const moduleOrder = [
  'js/app-core.js',
  'js/tasks.js',
  'js/calendar.js',
  'js/finance.js',
  'js/credentials.js',
  'js/notes-settings.js',
  'js/timetable.js',
  'js/deepseek-assistant.js',
  'js/bootstrap.js'
];

try {
  const html = read('index.html');
  assert(/<link\s+rel="stylesheet"\s+href="\.\/styles\.css"\s*>/i.test(html), 'index.html must load styles.css');

  const loadedScripts = [...html.matchAll(/<script\b[^>]*\bsrc="\.\/([^\"]+)"[^>]*><\/script>/gi)].map((match) => match[1]);
  assert(JSON.stringify(loadedScripts) === JSON.stringify(moduleOrder), 'JavaScript files must be included once and in dependency order');

  const sources = moduleOrder.map((file) => {
    assert(fs.existsSync(path.join(root, file)), `Missing JavaScript module: ${file}`);
    const result = spawnSync(process.execPath, ['--check', path.join(root, file)], { encoding: 'utf8' });
    assert(result.status === 0, `JavaScript syntax error in ${file}\n${result.stderr || result.stdout}`);
    return read(file);
  });
  const combined = sources.join('\n;\n');
  try { new Function(combined); }
  catch (error) { fail(`Modules cannot be loaded together: ${error.message}`); }

  const declaredFunctions = new Set([...combined.matchAll(/(?:async\s+)?function\s+([\w$]+)\s*\(/g)].map((match) => match[1]));
  const declaredVariables = new Set([...combined.matchAll(/\b(?:const|let|var)\s+([\w$]+)\s*=/g)].map((match) => match[1]));
  for (const [, handler] of html.matchAll(/\bonclick\s*=\s*"([^"]+)"/gi)) {
    const call = handler.match(/^\s*([\w$]+)\s*\(/);
    if (call) assert(declaredFunctions.has(call[1]) || declaredVariables.has(call[1]), `onclick handler refers to missing function or variable: ${call[1]}`);
  }

  const manifest = JSON.parse(read('manifest.webmanifest'));
  for (const asset of [...(manifest.icons || []), ...(manifest.screenshots || [])]) {
    assert(asset.src && fs.existsSync(path.join(root, asset.src)), `Manifest asset does not exist: ${asset.src}`);
  }

  const worker = read('sw.js');
  const assetBlock = worker.match(/const\s+ASSETS\s*=\s*\[([\s\S]*?)\];/);
  assert(assetBlock, 'Service worker cache asset list is missing');
  for (const [, asset] of assetBlock[1].matchAll(/'([^']+)'/g)) {
    const localPath = asset === './' ? '.' : asset.replace(/^\.\//, '');
    assert(fs.existsSync(path.join(root, localPath)), `Service worker cache asset does not exist: ${asset}`);
  }

  console.log(`Static project check passed: ${moduleOrder.length} JavaScript files, HTML handlers, manifest assets, and service worker assets.`);
} catch (error) {
  console.error(`Static project check failed: ${error.message}`);
  process.exitCode = 1;
}
