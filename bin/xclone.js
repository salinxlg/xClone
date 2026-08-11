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
    return path.join(environment.APPDATA, 'Dexly', 'XClone', 'config.json');
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

function resolveDestination(config) {
  const requested = config.destination || config.repo;
  const destination = path.resolve(process.cwd(), requested);
  const root = path.parse(destination).root;

  if (destination === root) {
    throw new XCloneError('La raíz del disco no puede usarse como destino.');
  }

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
      cwd: process.cwd(),
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

async function cloneRepository(config, painter) {
  const destination = resolveDestination(config);
  const ghArgs = buildGhArgs(config, destination);
  const repository = `${config.user}/${config.repo}`;

  printBrand(painter, packageInfo.version);
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
    return 0;
  }

  ensureCloneRequirements();
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
  printResultCard(painter, `${config.repo} está listo`, [
    config.keepGit ? 'Conectado a GitHub en modo Store.' : 'Copia limpia creada sin .git.'
  ]);
  console.log('');
  printInfo(painter, 'UBICACIÓN', destination);
  console.log('');
  return 0;
}

function printHelp(painter, defaultUser) {
  printBrand(painter, packageInfo.version, 'Clona menos. Construye más.');
  console.log(`  Usuario predeterminado: ${painter.accent(`@${defaultUser}`)}\n`);
  console.log(`${painter.bold('  USO')}
    xclone <repo>
    xclone <repo> store
    xclone <repo> [opciones]

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
    xclone api-helper --user=otra-cuenta
    xclone nataly --to=mi-copia
    xclone proyecto --branch=develop
`);
}

function printDeveloper(painter) {
  printBrand(painter, packageInfo.version, 'Built by Dexly.');
  printInfo(painter, 'AUTOR', 'Roger Salinas');
  printInfo(painter, 'MARCA', 'Dexly');
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
      default:
        return await cloneRepository(config, painter);
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
  XCloneError,
  buildGhArgs,
  commandStatus,
  getConfigPath,
  main,
  normalizeRepo,
  normalizeUser,
  parseArgs,
  readUserConfig,
  resolveDestination,
  saveDefaultUser
};
