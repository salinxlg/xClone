#!/usr/bin/env node

'use strict';

const path = require('node:path');
const readline = require('node:readline/promises');
const { spawn, spawnSync } = require('node:child_process');
const packageInfo = require('../package.json');
const {
  PRODUCT_AUTHOR,
  PRODUCT_VENDOR,
  normalizeUser,
  readUserConfig,
  saveDefaultUser
} = require('./xclone');
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

function npmInvocation(args) {
  if (process.platform === 'win32') {
    return {
      args: ['/d', '/s', '/c', `npm ${args.join(' ')}`],
      command: process.env.ComSpec || 'cmd.exe'
    };
  }

  return { args, command: 'npm' };
}

function checkCommand(command, args) {
  const invocation = command === 'npm' ? npmInvocation(args) : { args, command };
  const result = spawnSync(invocation.command, invocation.args, {
    encoding: 'utf8',
    shell: false,
    stdio: 'pipe',
    windowsHide: true
  });
  return !result.error && result.status === 0;
}

async function askForUser(painter, currentUser) {
  if (!process.stdin.isTTY) {
    return normalizeUser(process.env.XCLONE_INSTALL_USER || currentUser);
  }

  const interfaceInstance = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  try {
    while (true) {
      const answer = await interfaceInstance.question(
        `  ${painter.bold('Usuario de GitHub')} ${painter.dim(`[${currentUser}]`)} ${painter.accent('›')} `
      );
      try {
        return normalizeUser(answer || currentUser);
      } catch (error) {
        console.log(`  ${painter.error('✕')}  ${error.message}\n`);
      }
    }
  } finally {
    interfaceInstance.close();
  }
}

function installPackage(painter) {
  return new Promise((resolve, reject) => {
    const packageRoot = path.resolve(__dirname, '..');
    const invocation = npmInvocation(['install', '-g', '.', '--no-audit', '--no-fund']);
    const activity = createActivity(
      'Instalando comando global',
      painter,
      supportsAnimation()
    );
    let output = '';
    let settled = false;
    const child = spawn(invocation.command, invocation.args, {
      cwd: packageRoot,
      shell: false,
      stdio: ['inherit', 'pipe', 'pipe'],
      windowsHide: true
    });

    activity.start();
    child.stdout.on('data', (chunk) => {
      output += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk) => {
      output += chunk.toString('utf8');
    });
    child.once('error', (error) => {
      if (settled) return;
      settled = true;
      activity.stop(false, 'La instalación no pudo iniciar');
      reject(error);
    });
    child.once('close', (status) => {
      if (settled) return;
      settled = true;
      if (status === 0) {
        activity.stop(true, 'Comando global instalado');
        resolve();
        return;
      }
      activity.stop(false, 'npm detuvo la instalación');
      reject(new Error(output.trim() || `npm terminó con el código ${status}.`));
    });
  });
}

async function install() {
  const painter = createPainter(supportsColor());
  const current = readUserConfig();
  const nodeMajor = Number.parseInt(process.versions.node.split('.')[0], 10);

  printBrand(painter, packageInfo.version, 'Instalación para Windows.');
  console.log(`  ${painter.bold('Configura tu identidad de GitHub')}`);
  console.log(`  ${painter.dim('xClone usará este usuario cuando no envíes --user.')}\n`);
  console.log(`  ${painter.dim(`${PRODUCT_VENDOR} · Creado por ${PRODUCT_AUTHOR}`)}\n`);

  if (!Number.isInteger(nodeMajor) || nodeMajor < 18) {
    throw new Error(
      `Node.js ${process.versions.node} no es compatible. Instala Node.js 18 o superior.`
    );
  }

  if (!checkCommand('npm', ['--version'])) {
    throw new Error('npm no está disponible. Reinstala Node.js incluyendo npm.');
  }

  const user = await askForUser(painter, current.user);
  console.log('');
  printStep(painter, 1, 3, `Identidad seleccionada: @${user}`);
  await installPackage(painter);
  printStep(painter, 2, 3, 'Comando xclone registrado');
  const saved = saveDefaultUser(user);
  printStep(painter, 3, 3, 'Preferencias guardadas');

  const ghReady = checkCommand('gh', ['--version']);
  printResultCard(painter, `xClone ${packageInfo.version} está listo`, [
    `Usuario predeterminado: @${saved.user}`,
    ghReady ? 'GitHub CLI detectado.' : 'Pendiente: instala GitHub CLI (gh).',
    `${PRODUCT_VENDOR} · ${PRODUCT_AUTHOR}`,
    'Siguiente paso: xclone --doctor'
  ]);
  console.log('');
  printInfo(painter, 'PRIMER CLON', 'xclone nombre-del-repo');
  printInfo(painter, 'CAMBIAR USER', 'xclone config otro-usuario');
  console.log('');
  return 0;
}

install()
  .then((exitCode) => {
    process.exitCode = exitCode;
  })
  .catch((error) => {
    const painter = createPainter(supportsColor(process.stderr));
    console.error(`\n  ${painter.error('✕ Instalación fallida')}  ${error.message}\n`);
    process.exitCode = 1;
  });
