'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const {
  buildGhArgs,
  createManifestData,
  createManifestFile,
  loadManifest,
  normalizeRepo,
  normalizeUser,
  parseArgs,
  readUserConfig,
  registerCloneInManifest,
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

test('reconoce init, all y un manifiesto alternativo', () => {
  const init = parseArgs(['init'], 'salinxlg');
  const all = parseArgs(['all', '--manifest=equipos.json'], 'salinxlg');

  assert.equal(init.action, 'init');
  assert.equal(all.action, 'all');
  assert.equal(all.manifest, 'equipos.json');
});

test('crea un manifiesto con la autoría de Dexly Studios', () => {
  const manifest = createManifestData('salinxlg');
  assert.equal(manifest.author, 'Roger Salinas');
  assert.equal(manifest.vendor, 'Dexly Studios');
  assert.equal(manifest.defaults.user, 'salinxlg');
  assert.deepEqual(manifest.repositories, []);
});

test('detecta repositorios kit y store desde xclone.json', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'xclone-manifest-'));
  const manifestPath = path.join(temporary, 'xclone.json');

  try {
    const manifest = createManifestData('salinxlg');
    manifest.repositories = [
      { repo: 'dexkit', mode: 'kit' },
      { repo: 'dexly-store', mode: 'store', branch: 'develop', to: 'store-local' },
      { repo: 'disabled-helper', mode: 'kit', enabled: false }
    ];
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

    const loaded = loadManifest(manifestPath, 'fallback');
    assert.equal(loaded.repositories[0].keepGit, false);
    assert.equal(loaded.repositories[1].keepGit, true);
    assert.equal(loaded.repositories[1].branch, 'develop');
    assert.equal(loaded.repositories[1].destination, 'store-local');
    assert.equal(loaded.repositories[2].enabled, false);
  } finally {
    fs.rmSync(temporary, { force: true, recursive: true });
  }
});

test('no reemplaza un manifiesto existente', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'xclone-init-'));
  const manifestPath = path.join(temporary, 'xclone.json');

  try {
    createManifestFile(manifestPath, 'salinxlg');
    assert.throws(() => createManifestFile(manifestPath, 'salinxlg'), /ya existe/u);
  } finally {
    fs.rmSync(temporary, { force: true, recursive: true });
  }
});

test('registra clones individuales en xclone.json y actualiza sin duplicar', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'xclone-register-'));
  const manifestPath = path.join(temporary, 'xclone.json');

  try {
    createManifestFile(manifestPath, 'salinxlg');
    const kit = {
      baseDirectory: temporary,
      branch: null,
      destination: null,
      keepGit: false,
      repo: 'dexkit',
      user: 'salinxlg'
    };

    const added = registerCloneInManifest(
      kit,
      manifestPath,
      'salinxlg',
      path.join(temporary, 'dexkit')
    );
    assert.equal(added.status, 'added');

    const firstManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    assert.deepEqual(firstManifest.repositories, [{ repo: 'dexkit', mode: 'kit' }]);

    const updated = registerCloneInManifest(
      {
        ...kit,
        branch: 'develop',
        destination: 'dexkit-local',
        keepGit: true,
        repo: 'DEXKIT'
      },
      manifestPath,
      'salinxlg',
      path.join(temporary, 'dexkit-local')
    );
    assert.equal(updated.status, 'updated');

    const secondManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    assert.equal(secondManifest.repositories.length, 1);
    assert.deepEqual(secondManifest.repositories[0], {
      repo: 'DEXKIT',
      mode: 'store',
      branch: 'develop',
      to: 'dexkit-local'
    });
  } finally {
    fs.rmSync(temporary, { force: true, recursive: true });
  }
});

test('registra otro propietario por separado y no crea manifiestos implícitos', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'xclone-register-user-'));
  const manifestPath = path.join(temporary, 'xclone.json');
  const config = {
    baseDirectory: temporary,
    branch: null,
    destination: null,
    keepGit: false,
    repo: 'dexkit',
    user: 'otra-cuenta'
  };

  try {
    const missing = registerCloneInManifest(config, manifestPath, 'salinxlg');
    assert.equal(missing.status, 'missing');
    assert.equal(fs.existsSync(manifestPath), false);

    createManifestFile(manifestPath, 'salinxlg');
    registerCloneInManifest(
      config,
      manifestPath,
      'salinxlg',
      path.join(temporary, 'dexkit')
    );
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    assert.deepEqual(manifest.repositories, [
      { repo: 'dexkit', mode: 'kit', user: 'otra-cuenta' }
    ]);
  } finally {
    fs.rmSync(temporary, { force: true, recursive: true });
  }
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
  assert.match(version.stdout, /^xclone 7\.2\.1/u);
  assert.equal(help.status, 0);
  assert.match(help.stdout, /xclone <repo> store/u);
});
