#!/usr/bin/env node

'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const packageInfo = require('../package.json');
const {
  createActivity,
  createPainter,
  printBrand,
  printInfo,
  printResultCard,
  printStep,
  supportsAnimation,
  supportsColor
} = require('../lib/ui');

const DEFAULT_USER = 'salinxlg';
const MANIFEST_FILENAME = 'xclone.json';
const MANIFEST_SCHEMA_VERSION = 1;
const PRODUCT_AUTHOR = 'Roger Salinas';
const PRODUCT_VENDOR = 'Dexly Studios';
const MINIMUM_NODE_MAJOR = 18;
const MAX_CAPTURED_OUTPUT = 384 * 1024;

class XCloneError extends Error {
  constructor(message, exitCode = 1) {
    super(message);
    this.name = 'XCloneError';
    this.exitCode = exitCode;
  }
}

function cleanOptionValue(value, optionName) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new XCloneError(`Falta el valor de ${optionName}.`);
  }

  if (/\0|[\r\n]/u.test(value)) {
    throw new XCloneError(`El valor de ${optionName} no es válido.`);
  }

  return value.trim();
}

function normalizeRepo(value) {
  const repo = cleanOptionValue(value, 'repositorio').replace(/\.git$/iu, '');

  if (repo.includes('/') || repo.includes('\\')) {
    throw new XCloneError(
      'Escribe solo el nombre del repositorio. Para cambiar de cuenta usa --user=usuario.'
    );
  }

  if (repo === '.' || repo === '..' || repo.length > 100 || !/^[A-Za-z0-9._-]+$/u.test(repo)) {
    throw new XCloneError(`El nombre de repositorio "${repo}" no es válido.`);
  }

  return repo;
}

function normalizeUser(value) {
  const user = cleanOptionValue(value, 'usuario de GitHub');
  const valid = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/u.test(user);

  if (!valid || user.includes('--')) {
    throw new XCloneError(`El usuario u organización "${user}" no es válido.`);
  }

  return user;
}

function normalizeBranch(value) {
  const branch = cleanOptionValue(value, '--branch');

  if (branch.length > 255 || branch.startsWith('-')) {
    throw new XCloneError(`La rama "${branch}" no es válida.`);
  }

  return branch;
}

function getConfigPath(environment = process.env, homeDirectory = os.homedir()) {
  if (environment.APPDATA) {
    return path.join(environment.APPDATA, 'Dexly', 'xClone', 'config.json');
  }

  return path.join(homeDirectory, '.config', 'xclone', 'config.json');
}

function readUserConfig(configPath = getConfigPath()) {
  try {
    const stored = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    return {
      configPath,
      source: 'saved',
      user: normalizeUser(stored.defaultUser)
    };
  } catch {
    return {
      configPath,
      source: 'fallback',
      user: DEFAULT_USER
    };
  }
}

function saveDefaultUser(value, configPath = getConfigPath()) {
  const user = normalizeUser(value);
  const payload = {
    schemaVersion: 1,
    defaultUser: user
  };

  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return { configPath, user };
}

function getManifestPath(requestedPath = null, baseDirectory = process.cwd()) {
  return path.resolve(baseDirectory, requestedPath || MANIFEST_FILENAME);
}

function createManifestData(defaultUser = DEFAULT_USER) {
  return {
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    name: 'Dexly Studios Workspace',
    author: PRODUCT_AUTHOR,
    vendor: PRODUCT_VENDOR,
    defaults: {
      user: normalizeUser(defaultUser)
    },
    repositories: []
  };
}

function createManifestFile(manifestPath, defaultUser = DEFAULT_USER) {
  if (fs.existsSync(manifestPath)) {
    throw new XCloneError(`El manifiesto ya existe y no fue modificado:\n  ${manifestPath}`);
  }

  const manifest = createManifestData(defaultUser);
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return manifest;
}

function normalizeManifestLabel(value, fieldName, fallback) {
  if (value === undefined) return fallback;
  if (typeof value !== 'string') {
    throw new XCloneError(`El campo ${fieldName} de ${MANIFEST_FILENAME} debe ser texto.`);
  }
  const normalized = cleanOptionValue(value, fieldName);
  if (normalized.length > 100) {
    throw new XCloneError(`El campo ${fieldName} de ${MANIFEST_FILENAME} es demasiado largo.`);
  }
  return normalized;
}

function loadManifest(manifestPath, fallbackUser = DEFAULT_USER, globalUser = null) {
  let manifest;

  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      throw new XCloneError(
        `No encontré ${path.basename(manifestPath)} en:\n  ${manifestPath}\nEjecuta xclone init para crearlo.`
      );
    }
    throw new XCloneError(`No pude leer ${manifestPath}: ${error.message}`);
  }

  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new XCloneError(`${MANIFEST_FILENAME} debe contener un objeto JSON.`);
  }

  if (manifest.schemaVersion !== MANIFEST_SCHEMA_VERSION) {
    throw new XCloneError(
      `schemaVersion debe ser ${MANIFEST_SCHEMA_VERSION} en ${MANIFEST_FILENAME}.`
    );
  }

  if (!Array.isArray(manifest.repositories)) {
    throw new XCloneError(`repositories debe ser un arreglo en ${MANIFEST_FILENAME}.`);
  }

  const defaults = manifest.defaults === undefined ? {} : manifest.defaults;
  if (!defaults || typeof defaults !== 'object' || Array.isArray(defaults)) {
    throw new XCloneError(`defaults debe ser un objeto en ${MANIFEST_FILENAME}.`);
  }

  const defaultUser = globalUser
    ? normalizeUser(globalUser)
    : defaults.user
      ? normalizeUser(defaults.user)
      : normalizeUser(fallbackUser);
  const baseDirectory = path.dirname(manifestPath);
  const repositories = manifest.repositories.map((entry, index) => {
    const position = index + 1;
    const item = typeof entry === 'string' ? { repo: entry } : entry;

    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new XCloneError(`El repositorio #${position} de ${MANIFEST_FILENAME} no es válido.`);
    }

    if (item.enabled !== undefined && typeof item.enabled !== 'boolean') {
      throw new XCloneError(`enabled debe ser true o false en el repositorio #${position}.`);
    }

    const mode = item.mode === undefined ? 'kit' : String(item.mode).toLowerCase();
    if (mode !== 'kit' && mode !== 'store') {
      throw new XCloneError(`mode debe ser "kit" o "store" en el repositorio #${position}.`);
    }

    return {
      baseDirectory,
      branch: item.branch === undefined ? null : normalizeBranch(item.branch),
      destination:
        item.to === undefined && item.destination === undefined
          ? null
          : cleanOptionValue(item.to ?? item.destination, 'to'),
      enabled: item.enabled !== false,
      keepGit: mode === 'store',
      mode,
      repo: normalizeRepo(item.repo),
      sourceIndex: position,
      user: globalUser
        ? normalizeUser(globalUser)
        : item.user
          ? normalizeUser(item.user)
          : defaultUser
    };
  });

  return {
    author: normalizeManifestLabel(manifest.author, 'author', PRODUCT_AUTHOR),
    baseDirectory,
    defaultUser,
    manifestPath,
    name: normalizeManifestLabel(manifest.name, 'name', 'Dexly Studios Workspace'),
    repositories,
    vendor: normalizeManifestLabel(manifest.vendor, 'vendor', PRODUCT_VENDOR)
  };
}

function writeManifestFile(manifestPath, manifest) {
  const temporaryPath = `${manifestPath}.${process.pid}.${Date.now()}.tmp`;

  try {
    fs.writeFileSync(temporaryPath, `${JSON.stringify(manifest, null, 2)}\n`, {
      encoding: 'utf8',
      flag: 'wx'
    });
    fs.renameSync(temporaryPath, manifestPath);
  } catch (error) {
    try {
      fs.rmSync(temporaryPath, { force: true });
    } catch {
      // El archivo temporal se limpiará en el siguiente mantenimiento del sistema.
    }
    throw error;
  }
}

function registerCloneInManifest(
  config,
  manifestPath = getManifestPath(config.manifest),
  fallbackUser = DEFAULT_USER,
  clonedDestination = destinationPath(config)
) {
  if (!fs.existsSync(manifestPath)) {
    return { manifestPath, status: 'missing' };
  }

  const loaded = loadManifest(manifestPath, fallbackUser);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const repository = {
    repo: config.repo,
    mode: config.keepGit ? 'store' : 'kit'
  };

  if (config.user !== loaded.defaultUser) repository.user = config.user;
  if (config.branch) repository.branch = config.branch;

  const resolvedDestination = path.resolve(clonedDestination);
  const defaultDestination = path.resolve(loaded.baseDirectory, config.repo);
  const comparableDestination = process.platform === 'win32'
    ? resolvedDestination.toLowerCase()
    : resolvedDestination;
  const comparableDefault = process.platform === 'win32'
    ? defaultDestination.toLowerCase()
    : defaultDestination;

  if (comparableDestination !== comparableDefault) {
    repository.to = path.relative(loaded.baseDirectory, resolvedDestination) || config.repo;
  }

  const existing = loaded.repositories.find(
    (item) =>
      item.repo.toLowerCase() === config.repo.toLowerCase() &&
      item.user.toLowerCase() === config.user.toLowerCase()
  );
  let status = 'added';

  if (existing) {
    const index = existing.sourceIndex - 1;
    const previous = manifest.repositories[index];
    const updated = previous && typeof previous === 'object' && !Array.isArray(previous)
      ? { ...previous }
      : {};

    for (const field of ['repo', 'mode', 'user', 'branch', 'to', 'destination']) {
      delete updated[field];
    }
    manifest.repositories[index] = { ...repository, ...updated };
    status = 'updated';
  } else {
    manifest.repositories.push(repository);
  }

  try {
    writeManifestFile(manifestPath, manifest);
  } catch (error) {
    throw new XCloneError(
      `El repositorio se clonó, pero no pude actualizar ${manifestPath}: ${error.message}`
    );
  }

  return {
    manifestPath,
    mode: repository.mode,
    repository,
    status
  };
}

function readFollowingValue(args, index, optionName) {
  const value = args[index + 1];

  if (value === undefined || value.startsWith('-')) {
    throw new XCloneError(`Falta el valor de ${optionName}.`);
  }

  return cleanOptionValue(value, optionName);
}

function parseArgs(args, defaultUser = readUserConfig().user) {
  const config = {
    action: 'clone',
    branch: null,
    destination: null,
    dryRun: false,
    keepGit: false,
    manifest: null,
    noAnimation: false,
    noColor: false,
    repo: null,
    reset: false,
    user: normalizeUser(defaultUser),
    userExplicit: false,
    verbose: false
  };
  const positional = [];

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    const lower = token.toLowerCase();

    if (lower === '--help' || lower === '-h' || lower === 'help') {
      config.action = 'help';
      continue;
    }

    if (lower === '--version' || lower === '-v' || lower === 'version') {
      config.action = 'version';
      continue;
    }

    if (lower === '--developer' || lower === 'developer') {
      config.action = 'developer';
      continue;
    }

    if (lower === '--doctor' || lower === 'doctor') {
      config.action = 'doctor';
      continue;
    }

    if (lower === 'all') {
      config.action = 'all';
      continue;
    }

    if (lower === 'init') {
      config.action = 'init';
      continue;
    }

    if (lower === 'config' || lower === '--config') {
      config.action = 'config';
      continue;
    }

    if (lower === '--reset') {
      config.action = 'config';
      config.reset = true;
      continue;
    }

    if (lower === '--store' || lower === '--keep-git') {
      config.keepGit = true;
      continue;
    }

    if (lower === '--dry-run') {
      config.dryRun = true;
      continue;
    }

    if (lower === '--no-color') {
      config.noColor = true;
      continue;
    }

    if (lower === '--no-animation') {
      config.noAnimation = true;
      continue;
    }

    if (lower === '--verbose') {
      config.verbose = true;
      continue;
    }

    if (lower.startsWith('--manifest=')) {
      config.manifest = cleanOptionValue(token.slice(token.indexOf('=') + 1), '--manifest');
      continue;
    }

    if (lower === '--manifest' || lower === '-m') {
      config.manifest = readFollowingValue(args, index, '--manifest');
      index += 1;
      continue;
    }

    if (lower.startsWith('--user=')) {
      config.user = normalizeUser(token.slice(token.indexOf('=') + 1));
      config.userExplicit = true;
      continue;
    }

    if (lower === '--user' || lower === '-u') {
      config.user = normalizeUser(readFollowingValue(args, index, '--user'));
      config.userExplicit = true;
      index += 1;
      continue;
    }

    if (lower.startsWith('--to=') || lower.startsWith('--destination=')) {
      config.destination = cleanOptionValue(token.slice(token.indexOf('=') + 1), '--to');
      continue;
    }

    if (lower === '--to' || lower === '--destination' || lower === '-d') {
      config.destination = readFollowingValue(args, index, '--to');
      index += 1;
      continue;
    }

    if (lower.startsWith('--branch=')) {
      config.branch = normalizeBranch(token.slice(token.indexOf('=') + 1));
      continue;
    }

    if (lower === '--branch' || lower === '-b') {
      config.branch = normalizeBranch(readFollowingValue(args, index, '--branch'));
      index += 1;
      continue;
    }

    if (token.startsWith('-')) {
      throw new XCloneError(`Opción desconocida: ${token}`);
    }

    positional.push(token);
  }

  if (config.action === 'config') {
    if (positional.length > 1) {
      throw new XCloneError(`Argumento inesperado: ${positional[1]}`);
    }
    if (positional.length === 1) {
      if (config.userExplicit) {
        throw new XCloneError('Indica el usuario una sola vez.');
      }
      config.user = normalizeUser(positional[0]);
      config.userExplicit = true;
    }
    if (config.reset && config.userExplicit) {
      throw new XCloneError('--reset no se puede combinar con un usuario.');
    }
    return config;
  }

  if (config.action !== 'clone') {
    if (positional.length > 0) {
      throw new XCloneError(`"${positional[0]}" no se puede combinar con esta operación.`);
    }
    return config;
  }

  if (positional.length === 0) {
    config.action = 'help';
    return config;
  }

  config.repo = normalizeRepo(positional[0]);

  for (const modifier of positional.slice(1)) {
    if (modifier.toLowerCase() === 'store') {
      config.keepGit = true;
      continue;
    }
    throw new XCloneError(`Argumento inesperado: ${modifier}`);
  }

  return config;
}

function buildGhArgs(config, destination) {
  const args = ['repo', 'clone', `${config.user}/${config.repo}`, destination];
  const gitArgs = [];

  if (!config.keepGit) {
    gitArgs.push('--depth', '1', '--single-branch');
  }

  if (config.branch) {
    gitArgs.push('--branch', config.branch);
  }

  if (gitArgs.length > 0) {
    args.push('--', ...gitArgs);
  }

  return args;
}

function printableCommand(command, args) {
  const quote = (value) => (/\s|"/u.test(value) ? `"${value.replaceAll('"', '\\"')}"` : value);
  return [command, ...args].map(quote).join(' ');
}

function commandStatus(command, args = []) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    shell: false,
    stdio: 'pipe',
    windowsHide: true
  });

  return {
    available: !result.error,
    error: result.error,
    output: `${result.stdout || ''}${result.stderr || ''}`.trim(),
    status: result.status
  };
}

function ensureCloneRequirements() {
  const gh = commandStatus('gh', ['--version']);

  if (!gh.available && gh.error && gh.error.code === 'ENOENT') {
    throw new XCloneError('No encontré GitHub CLI (gh). Instálalo y ejecuta: gh auth login');
  }

  if (!gh.available || gh.status !== 0) {
    throw new XCloneError('GitHub CLI está instalado, pero no pudo ejecutarse correctamente.');
  }
}

function destinationPath(config) {
  const requested = config.destination || config.repo;
  const destination = path.resolve(config.baseDirectory || process.cwd(), requested);
  const root = path.parse(destination).root;

  if (destination === root) {
    throw new XCloneError('La raíz del disco no puede usarse como destino.');
  }

  return destination;
}

function resolveDestination(config) {
  const destination = destinationPath(config);

  if (fs.existsSync(destination)) {
    throw new XCloneError(
      `El destino ya existe y no se modificó nada:\n  ${destination}\nUsa --to=otra-carpeta.`
    );
  }

  return destination;
}

function appendCaptured(current, chunk) {
  const combined = `${current}${chunk.toString('utf8')}`;
  return combined.length > MAX_CAPTURED_OUTPUT
    ? combined.slice(combined.length - MAX_CAPTURED_OUTPUT)
    : combined;
}

function cleanFailureOutput(output) {
  const withoutAnsi = output.replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/gu, '');
  return withoutAnsi
    .replace(/\r/gu, '\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .slice(-12)
    .join('\n');
}

function runCloneProcess(ghArgs, config, painter) {
  return new Promise((resolve, reject) => {
    const animated = !config.noAnimation && !config.verbose && supportsAnimation();
    const activity = createActivity('Clonando repositorio', painter, animated);
    const stdio = config.verbose ? 'inherit' : ['inherit', 'pipe', 'pipe'];
    let output = '';
    let settled = false;
    const child = spawn('gh', ghArgs, {
      cwd: config.baseDirectory || process.cwd(),
      shell: false,
      stdio,
      windowsHide: true
    });

    activity.start();

    if (!config.verbose) {
      child.stdout.on('data', (chunk) => {
        output = appendCaptured(output, chunk);
      });
      child.stderr.on('data', (chunk) => {
        output = appendCaptured(output, chunk);
      });
    }

    child.once('error', (error) => {
      if (settled) return;
      settled = true;
      activity.stop(false, 'No se pudo iniciar GitHub CLI');
      reject(new XCloneError(`No se pudo iniciar GitHub CLI: ${error.message}`));
    });

    child.once('close', (status, signal) => {
      if (settled) return;
      settled = true;

      if (status === 0) {
        activity.stop(true, 'Descarga completada');
        resolve();
        return;
      }

      activity.stop(false, 'GitHub CLI detuvo la clonación');
      const details = cleanFailureOutput(output);
      const suffix = details ? `\n\nDetalle de GitHub:\n${details}` : '';
      reject(
        new XCloneError(
          `GitHub CLI terminó con ${signal ? `la señal ${signal}` : `el código ${status ?? 'desconocido'}`}. ` +
            `El destino no fue borrado.${suffix}`
        )
      );
    });
  });
}

async function cloneRepository(config, painter, options = {}) {
  const compact = options.compact === true;
  const showBrand = options.showBrand !== false;
  const destination = resolveDestination(config);
  const ghArgs = buildGhArgs(config, destination);
  const repository = `${config.user}/${config.repo}`;

  if (showBrand) {
    printBrand(painter, packageInfo.version);
  } else {
    const position = options.position ? `${options.position.current}/${options.position.total}` : '•';
    console.log(`\n  ${painter.accent('◆')}  ${painter.bold(position)}  ${repository}`);
  }
  printInfo(painter, 'ORIGEN', repository);
  printInfo(painter, 'DESTINO', destination);
  printInfo(
    painter,
    'PERFIL',
    config.keepGit ? 'Store · historial conectado' : 'Kit · copia limpia sin .git'
  );
  if (config.branch) printInfo(painter, 'RAMA', config.branch);
  console.log('');

  if (config.dryRun) {
    console.log(`  ${painter.warning('◆')}  ${painter.bold('Simulación activa')}`);
    console.log(`  ${painter.dim('No se modificó ningún archivo.')}`);
    console.log(`\n  ${painter.dim(printableCommand('gh', ghArgs))}\n`);
    return { destination, simulated: true };
  }

  if (!config.skipRequirements) ensureCloneRequirements();
  printStep(painter, 1, 3, 'Entorno validado');
  await runCloneProcess(ghArgs, config, painter);
  printStep(painter, 2, 3, 'Repositorio descargado');

  if (!config.keepGit) {
    const gitMetadata = path.join(destination, '.git');

    if (!fs.existsSync(gitMetadata)) {
      throw new XCloneError(
        `El clon terminó, pero no encontré ${gitMetadata}. La carpeta clonada se conservó.`
      );
    }

    try {
      fs.rmSync(gitMetadata, {
        force: true,
        maxRetries: 5,
        recursive: true,
        retryDelay: 150
      });
    } catch (error) {
      throw new XCloneError(
        `El repositorio se clonó, pero no pude quitar .git: ${error.message}\nLa carpeta clonada se conservó.`
      );
    }
  }

  printStep(
    painter,
    3,
    3,
    config.keepGit ? 'Historial de Git conservado' : 'Metadatos de Git eliminados'
  );
  if (compact) {
    console.log(
      `  ${painter.success('✓')}  ${config.repo} listo · ${config.keepGit ? 'Store' : 'Kit'}`
    );
    printInfo(painter, 'UBICACIÓN', destination);
  } else {
    printResultCard(painter, `${config.repo} está listo`, [
      config.keepGit ? 'Conectado a GitHub en modo Store.' : 'Copia limpia creada sin .git.'
    ]);
    console.log('');
    printInfo(painter, 'UBICACIÓN', destination);
    console.log('');
  }
  return { destination, simulated: false };
}

function runInit(config, painter) {
  const manifestPath = getManifestPath(config.manifest);
  const manifest = createManifestFile(manifestPath, config.user);

  printBrand(painter, packageInfo.version, 'Colecciones de repositorios.');
  printInfo(painter, 'ARCHIVO', manifestPath);
  printInfo(painter, 'USUARIO', painter.accent(`@${manifest.defaults.user}`));
  printInfo(painter, 'AUTOR', PRODUCT_AUTHOR);
  printInfo(painter, 'ESTUDIO', PRODUCT_VENDOR);
  console.log('');
  console.log(`  ${painter.success('✓')}  ${MANIFEST_FILENAME} fue creado.`);
  console.log(`  ${painter.dim('Agrega tus repositorios y ejecuta:')} xclone all\n`);
  return 0;
}

async function cloneAll(config, painter, fallbackUser) {
  const manifestPath = getManifestPath(config.manifest);
  const manifest = loadManifest(
    manifestPath,
    fallbackUser,
    config.userExplicit ? config.user : null
  );
  const repositories = manifest.repositories.filter((item) => item.enabled);

  if (repositories.length === 0) {
    throw new XCloneError(
      `${MANIFEST_FILENAME} no contiene repositorios habilitados. Agrega entradas en repositories.`
    );
  }

  const destinations = new Map();
  for (const repository of repositories) {
    const resolved = destinationPath(repository);
    const key = process.platform === 'win32' ? resolved.toLowerCase() : resolved;
    if (destinations.has(key)) {
      throw new XCloneError(
        `Los repositorios #${destinations.get(key)} y #${repository.sourceIndex} usan el mismo destino:\n  ${resolved}`
      );
    }
    destinations.set(key, repository.sourceIndex);
  }

  printBrand(painter, packageInfo.version, 'Colección de repositorios.');
  printInfo(painter, 'COLECCIÓN', manifest.name);
  printInfo(painter, 'MANIFIESTO', manifest.manifestPath);
  printInfo(painter, 'AUTOR', manifest.author);
  printInfo(painter, 'ESTUDIO', manifest.vendor);
  printInfo(painter, 'REPOS', String(repositories.length));
  console.log('');

  if (!config.dryRun) ensureCloneRequirements();

  const results = {
    cloned: 0,
    failed: 0,
    simulated: 0,
    skipped: 0
  };

  for (let index = 0; index < repositories.length; index += 1) {
    const repository = repositories[index];
    const repositoryConfig = {
      ...config,
      ...repository,
      action: 'clone',
      dryRun: config.dryRun,
      noAnimation: config.noAnimation,
      noColor: config.noColor,
      skipRequirements: true,
      verbose: config.verbose
    };
    const resolved = destinationPath(repositoryConfig);

    if (fs.existsSync(resolved)) {
      results.skipped += 1;
      console.log(
        `  ${painter.warning('↷')}  ${painter.bold(`${index + 1}/${repositories.length}`)}  ` +
          `${repository.user}/${repository.repo} · destino existente`
      );
      printInfo(painter, 'UBICACIÓN', resolved);
      continue;
    }

    try {
      const result = await cloneRepository(repositoryConfig, painter, {
        compact: true,
        position: { current: index + 1, total: repositories.length },
        showBrand: false
      });
      if (result.simulated) results.simulated += 1;
      else results.cloned += 1;
    } catch (error) {
      results.failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      console.error(`  ${painter.error('✕')}  ${repository.repo} falló`);
      console.error(`     ${message.replace(/\n/gu, '\n     ')}\n`);
    }
  }

  const completedLabel = config.dryRun ? `Simulados: ${results.simulated}` : `Clonados: ${results.cloned}`;
  const summary = [
    `${completedLabel} · Omitidos: ${results.skipped}`,
    `Fallidos: ${results.failed}`,
    `${PRODUCT_VENDOR} · ${PRODUCT_AUTHOR}`
  ];

  if (results.failed === 0) {
    printResultCard(painter, config.dryRun ? 'Simulación completada' : 'Colección completada', summary);
  } else {
    console.log(`\n  ${painter.warning('Colección finalizada con errores')}`);
    for (const line of summary) console.log(`  ${line}`);
  }
  console.log('');
  return results.failed === 0 ? 0 : 1;
}

function printHelp(painter, defaultUser) {
  printBrand(painter, packageInfo.version, 'Clona menos. Construye más.');
  console.log(`  Usuario predeterminado: ${painter.accent(`@${defaultUser}`)}\n`);
  console.log(`${painter.bold('  USO')}
    xclone <repo>
    xclone <repo> store
    xclone <repo> [opciones]
    xclone all
    xclone init

${painter.bold('  COLECCIONES')}
    xclone init                    Crea xclone.json en la carpeta actual.
    xclone all                     Clona todo lo definido en xclone.json.
    xclone <repo>                  Se registra si xclone.json ya existe.
    --manifest=<archivo>, -m       Utiliza otro manifiesto.

${painter.bold('  CONFIGURACIÓN')}
    xclone config                  Muestra el usuario guardado.
    xclone config <usuario>        Cambia el usuario predeterminado.
    xclone config --reset          Vuelve a ${DEFAULT_USER}.

${painter.bold('  MODOS')}
    normal                         Clon superficial y elimina .git.
    store                          Conserva .git y todo el historial.

${painter.bold('  OPCIONES')}
    --user=<usuario>, -u           Cambia el usuario solo para este clon.
    --store, --keep-git            Equivale al modificador store.
    --to=<carpeta>, -d             Define otro destino.
    --branch=<rama>, -b            Selecciona una rama.
    --dry-run                      Simula sin modificar archivos.
    --verbose                      Muestra la salida completa de GitHub.
    --no-animation                 Desactiva las animaciones.
    --no-color                     Desactiva los colores.
    --doctor                       Revisa el entorno y la sesión.
    --version, -v                  Muestra la versión instalada.
    --developer                    Muestra la autoría.
    --help, -h                     Muestra esta ayuda.

${painter.bold('  EJEMPLOS')}
    xclone dexkit
    xclone dexly-store store
    xclone init
    xclone all
    xclone all --manifest=equipos.json
    xclone api-helper --user=otra-cuenta
    xclone nataly --to=mi-copia
    xclone proyecto --branch=develop

  ${painter.dim(`${PRODUCT_VENDOR} · Desarrollado por ${PRODUCT_AUTHOR}`)}
`);
}

function printDeveloper(painter) {
  printBrand(painter, packageInfo.version, 'Una herramienta de Dexly Studios.');
  printInfo(painter, 'AUTOR', PRODUCT_AUTHOR);
  printInfo(painter, 'ESTUDIO', PRODUCT_VENDOR);
  printInfo(painter, 'PRODUCTO', 'xClone');
  printInfo(painter, 'LEMA', painter.italic('Build without limits'));
  console.log('');
}

function runConfig(config, painter) {
  const configPath = getConfigPath();
  let result;

  if (config.reset) {
    result = saveDefaultUser(DEFAULT_USER, configPath);
  } else if (config.userExplicit) {
    result = saveDefaultUser(config.user, configPath);
  } else {
    result = readUserConfig(configPath);
  }

  printBrand(painter, packageInfo.version, 'Preferencias de clonación.');
  printInfo(painter, 'USUARIO', painter.accent(`@${result.user}`));
  printInfo(painter, 'ARCHIVO', painter.dim(result.configPath));
  console.log('');

  if (config.reset || config.userExplicit) {
    console.log(`  ${painter.success('✓')}  Usuario predeterminado actualizado.\n`);
  } else {
    console.log(`  ${painter.dim('Para cambiarlo:')} xclone config otro-usuario\n`);
  }
  return 0;
}

function runDoctor(painter, defaultUser) {
  const checks = [];
  const nodeMajor = Number.parseInt(process.versions.node.split('.')[0], 10);
  checks.push({ detail: `v${process.versions.node}`, name: 'Node.js', ok: nodeMajor >= MINIMUM_NODE_MAJOR });

  const git = commandStatus('git', ['--version']);
  checks.push({
    detail: git.output.split(/\r?\n/u)[0] || 'no encontrado',
    name: 'Git',
    ok: git.available && git.status === 0
  });

  const gh = commandStatus('gh', ['--version']);
  checks.push({
    detail: gh.output.split(/\r?\n/u)[0] || 'no encontrado',
    name: 'GitHub CLI',
    ok: gh.available && gh.status === 0
  });

  const auth = gh.available && gh.status === 0 ? commandStatus('gh', ['auth', 'status']) : null;
  checks.push({
    detail: auth && auth.status === 0 ? 'sesión activa' : 'ejecuta: gh auth login',
    name: 'GitHub',
    ok: Boolean(auth && auth.status === 0)
  });

  printBrand(painter, packageInfo.version, 'Diagnóstico del entorno.');
  printInfo(painter, 'USUARIO', painter.accent(`@${defaultUser}`));
  printInfo(painter, 'ESTUDIO', PRODUCT_VENDOR);
  printInfo(painter, 'AUTOR', PRODUCT_AUTHOR);
  console.log('');
  for (const check of checks) {
    const mark = check.ok ? painter.success('✓') : painter.error('✕');
    console.log(`  ${mark}  ${painter.bold(check.name.padEnd(12, ' '))} ${check.detail}`);
  }

  const healthy = checks.every((check) => check.ok);
  console.log(
    `\n  ${healthy ? painter.success('Todo está listo para clonar.') : painter.warning('Hay requisitos pendientes.')}\n`
  );
  return healthy ? 0 : 1;
}

async function main(args = process.argv.slice(2)) {
  let config;

  try {
    const saved = readUserConfig();
    config = parseArgs(args, saved.user);
    const painter = createPainter(!config.noColor && supportsColor());

    switch (config.action) {
      case 'help':
        printHelp(painter, saved.user);
        return 0;
      case 'version':
        console.log(`xclone ${packageInfo.version}`);
        return 0;
      case 'developer':
        printDeveloper(painter);
        return 0;
      case 'doctor':
        return runDoctor(painter, saved.user);
      case 'config':
        return runConfig(config, painter);
      case 'init':
        return runInit(config, painter);
      case 'all':
        return await cloneAll(config, painter, saved.user);
      default: {
        const manifestPath = getManifestPath(config.manifest);
        const manifestExists = fs.existsSync(manifestPath);

        if (manifestExists || config.manifest) {
          loadManifest(manifestPath, saved.user);
        }

        const result = await cloneRepository(config, painter);
        if (!result.simulated && manifestExists) {
          const registration = registerCloneInManifest(
            config,
            manifestPath,
            saved.user,
            result.destination
          );
          const action = registration.status === 'added' ? 'Registrado' : 'Actualizado';
          console.log(
            `  ${painter.success('✓')}  ${action} en ${path.basename(manifestPath)} · ` +
              `${registration.mode === 'store' ? 'Store' : 'Kit'}`
          );
          printInfo(painter, 'MANIFIESTO', manifestPath);
          console.log('');
        }
        return 0;
      }
    }
  } catch (error) {
    const colorEnabled = !(config && config.noColor) && supportsColor(process.stderr);
    const painter = createPainter(colorEnabled);
    const message = error instanceof Error ? error.message : String(error);
    console.error(`\n  ${painter.error('✕ Error')}  ${message}`);
    console.error(`\n  Usa ${painter.bold('xclone --help')} para ver los comandos disponibles.\n`);
    return error instanceof XCloneError ? error.exitCode : 1;
  }
}

if (require.main === module) {
  main().then((exitCode) => {
    process.exitCode = exitCode;
  });
}

module.exports = {
  DEFAULT_USER,
  MANIFEST_FILENAME,
  PRODUCT_AUTHOR,
  PRODUCT_VENDOR,
  XCloneError,
  buildGhArgs,
  commandStatus,
  createManifestData,
  createManifestFile,
  destinationPath,
  getConfigPath,
  getManifestPath,
  loadManifest,
  main,
  normalizeRepo,
  normalizeUser,
  parseArgs,
  readUserConfig,
  registerCloneInManifest,
  resolveDestination,
  saveDefaultUser
};
