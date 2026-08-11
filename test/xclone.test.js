'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const {
  buildGhArgs,
  normalizeRepo,
  normalizeUser,
  parseArgs,
  readUserConfig,
  saveDefaultUser
} = require('../bin/xclone');

test('usa el usuario configurado y elimina .git por defecto', () => {
  const config = parseArgs(['dexkit'], 'mi-cuenta');
  assert.equal(config.user, 'mi-cuenta');
  assert.equal(config.repo, 'dexkit');
  assert.equal(config.keepGit, false);
});

test('store conserva .git', () => {
  assert.equal(parseArgs(['dexkit', 'store']).keepGit, true);
  assert.equal(parseArgs(['dexkit', '--store']).keepGit, true);
});

test('acepta usuario, destino y rama en ambas sintaxis', () => {
  const equals = parseArgs([
    'api-helper',
    '--user=otra-cuenta',
    '--to=api-local',
    '--branch=develop'
  ]);
  assert.equal(equals.user, 'otra-cuenta');
  assert.equal(equals.destination, 'api-local');
  assert.equal(equals.branch, 'develop');

  const spaced = parseArgs(['api-helper', '-u', 'otra-cuenta', '-d', 'api-local']);
  assert.equal(spaced.user, 'otra-cuenta');
  assert.equal(spaced.destination, 'api-local');
});

test('config permite mostrar, cambiar o restablecer el usuario', () => {
  const show = parseArgs(['config'], 'mi-cuenta');
  const change = parseArgs(['config', 'otra-cuenta'], 'mi-cuenta');
  const reset = parseArgs(['config', '--reset'], 'mi-cuenta');

  assert.equal(show.action, 'config');
  assert.equal(show.userExplicit, false);
  assert.equal(change.user, 'otra-cuenta');
  assert.equal(change.userExplicit, true);
  assert.equal(reset.reset, true);
});

test('guarda y vuelve a leer el usuario configurado', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'xclone-test-'));
  const configPath = path.join(temporary, 'config.json');

  try {
    saveDefaultUser('dexly-team', configPath);
    const saved = readUserConfig(configPath);
    assert.equal(saved.user, 'dexly-team');
    assert.equal(saved.source, 'saved');
  } finally {
    fs.rmSync(temporary, { force: true, recursive: true });
  }
});

test('permite desactivar animaciones o ver la salida completa', () => {
  assert.equal(parseArgs(['dexkit', '--no-animation']).noAnimation, true);
  assert.equal(parseArgs(['dexkit', '--verbose']).verbose, true);
});

test('el clon descartable es superficial', () => {
  const config = parseArgs(['dexkit']);
  const args = buildGhArgs(config, 'C:\\proyectos\\dexkit');
  assert.deepEqual(args.slice(-4), ['--', '--depth', '1', '--single-branch']);
});

test('store conserva el historial completo', () => {
  const config = parseArgs(['dexkit', 'store']);
  const args = buildGhArgs(config, 'C:\\proyectos\\dexkit');
  assert.equal(args.includes('--depth'), false);
  assert.equal(args.includes('--single-branch'), false);
});

test('rechaza rutas y propietarios incrustados en el repo', () => {
  assert.throws(() => normalizeRepo('../dexkit'), /solo el nombre/u);
  assert.throws(() => normalizeRepo('otra-cuenta/dexkit'), /--user/u);
});

test('valida usuarios de GitHub', () => {
  assert.equal(normalizeUser('salinxlg'), 'salinxlg');
  assert.throws(() => normalizeUser('-invalido'), /no es válido/u);
  assert.throws(() => normalizeUser('doble--guion'), /no es válido/u);
});

test('la version y la ayuda funcionan sin GitHub CLI', () => {
  const executable = path.resolve(__dirname, '..', 'bin', 'xclone.js');
  const version = spawnSync(process.execPath, [executable, '--version'], { encoding: 'utf8' });
  const help = spawnSync(process.execPath, [executable, '--help'], { encoding: 'utf8' });

  assert.equal(version.status, 0);
  assert.match(version.stdout, /^xclone 7\.1\.0/u);
  assert.equal(help.status, 0);
  assert.match(help.stdout, /xclone <repo> store/u);
});
