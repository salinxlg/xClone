<div align="center">

  <img src="https://cdn-icons-png.flaticon.com/512/9168/9168217.png" alt="xClone Logo" width="80" height="80">

</div>

<h1 align="center">xClone Repository CLI</h1>

<div align="center">

<br>

<b>xClone</b> es una herramienta de línea de comandos diseñada para simplificar la clonación de repositorios de GitHub, eliminar automáticamente los metadatos de Git cuando se necesita una copia limpia y conservar el historial completo cuando el proyecto será utilizado como repositorio de trabajo.<br><br>

Incluye configuración persistente del propietario de GitHub, instalación interactiva, perfiles de clonación, validaciones de seguridad, colores, paneles, progreso por fases y una animación activa durante la descarga del repositorio.<br><br>

Este proyecto ha sido creado y desarrollado por <a href="https://github.com/salinxlg">Roger Salinas</a> para <b>Dexly Studios</b>.<br>
<b>xClone funciona en Windows y macOS mediante Node.js; cada sistema tiene sus propios scripts de instalación.</b>

<br>

</div>

## Inicio rápido en macOS

Instala Node.js 18 o superior, Git y GitHub CLI (`gh`). Si utilizas Homebrew, puedes instalar los requisitos con `brew install node git gh`. Después, desde Terminal, entra en la carpeta extraída y ejecuta:

```sh
sh install.sh
```

Selecciona tu usuario de GitHub. Abre otra terminal para que se actualice el `PATH`, inicia sesión y comprueba el entorno:

```sh
gh auth login
xclone --doctor
xclone nombre-del-repositorio
```

El instalador instala una copia independiente; cuando confirmes `xclone --version`, puedes borrar el ZIP y la carpeta extraída. Si `xclone` no se encuentra tras instalarlo, comprueba que el directorio global de npm esté en tu `PATH` con `npm prefix -g` y vuelve a abrir Terminal. Para ejecutar el paquete sin instalarlo globalmente, usa `sh xclone.sh nombre-del-repositorio`. Para desinstalarlo, usa `sh uninstall.sh`. La configuración permanece en `~/.config/xclone/config.json`.

Si npm devuelve `EACCES` al instalar en `/usr/local`, configura un prefijo de npm para tu usuario:

```sh
mkdir -p "$HOME/.npm-global"
npm config set prefix "$HOME/.npm-global"
echo 'export PATH="$HOME/.npm-global/bin:$PATH"' >> "$HOME/.zprofile"
export PATH="$HOME/.npm-global/bin:$PATH"
sh install.sh
```

## Inicio rápido en Windows

Descarga y extrae el paquete completo de xClone. Después, ejecuta el instalador:

```powershell
.\install.cmd
```

Durante la instalación, el sistema solicitará el usuario u organización de GitHub que será utilizado como propietario predeterminado.

Cuando la instalación termine, abre una terminal nueva y ejecuta:

```powershell
xclone --doctor
```

Si todos los requisitos están disponibles, puedes realizar el primer clon:

```powershell
xclone nombre-del-repositorio
```

Para administrar una colección completa de kits, stores, API y helpers:

```powershell
xclone init
xclone all
```

xClone también puede instalarse manualmente desde la carpeta extraída. Empaqueta e instala el archivo generado para que el comando no dependa de esa carpeta:

```sh
npm pack
npm install -g ./dexly-xclone-7.2.1.tgz
```

<br>

## Estructura y distribución del proyecto

A continuación se presenta la estructura general de xClone:

```text
xClone/
├── bin/
│   ├── install.js
│   └── xclone.js
│
├── lib/
│   └── ui.js
│
├── test/
│   └── xclone.test.js
│
├── install.cmd / install.sh
├── uninstall.cmd / uninstall.sh
├── xclone.cmd / xclone.sh
├── xclone.example.json
├── package.json
└── README.md
```

- `bin/xclone.js` contiene el motor principal del CLI.
- `bin/install.js` controla la instalación interactiva y la selección del usuario.
- `lib/ui.js` contiene la interfaz, colores, paneles, barras y animaciones.
- `install.cmd` y `install.sh` inician el instalador en Windows y macOS, respectivamente.
- `xclone.cmd` y `xclone.sh` permiten ejecutar xClone directamente en modo portable.
- `uninstall.cmd` y `uninstall.sh` eliminan el comando global instalado mediante npm.
- `xclone.example.json` es un ejemplo de manifiesto para colecciones; `xclone init` crea uno propio.
- `test/xclone.test.js` contiene las pruebas automatizadas del proyecto.

<br><br>

## Configuración antes de comenzar

Antes de clonar repositorios, es necesario tener instalados los siguientes componentes:

- Node.js `18` o superior.
- npm.
- Git.
- GitHub CLI (`gh`).
- Una sesión activa de GitHub CLI.

Para iniciar sesión en GitHub CLI, ejecuta:

```powershell
gh auth login
```

Después puedes comprobar el entorno completo mediante:

```powershell
xclone --doctor
```

El diagnóstico revisa Node.js, Git, GitHub CLI, la autenticación y el usuario predeterminado configurado.

<br>

## Configuración del usuario de GitHub

El usuario elegido durante la instalación se almacena en Windows dentro de:

```text
%APPDATA%\Dexly\xClone\config.json
```

En macOS se almacena en `~/.config/xclone/config.json`.

El archivo contiene una estructura similar a la siguiente:

```json
{
  "schemaVersion": 1,
  "defaultUser": "salinxlg"
}
```

No es necesario modificar este archivo manualmente. xClone incluye comandos para consultar, cambiar o restablecer la configuración.

Consultar el usuario actual:

```powershell
xclone config
```

Cambiar el usuario predeterminado:

```powershell
xclone config otro-usuario
```

También puede utilizarse la sintaxis:

```powershell
xclone config --user=otro-usuario
```

Restablecer el propietario inicial `salinxlg`:

```powershell
xclone config --reset
```

<br><br>

## Colecciones con xclone.json

El archivo `xclone.json` cumple una función similar a `package.json`: describe todos los repositorios que forman parte de una colección y conserva la forma en que debe clonarse cada uno.

Para crear el manifiesto inicial dentro de la carpeta actual:

```powershell
xclone init
```

El archivo generado incluye la autoría de Roger Salinas, Dexly Studios y el usuario de GitHub configurado durante la instalación:

```json
{
  "schemaVersion": 1,
  "name": "Dexly Studios Workspace",
  "author": "Roger Salinas",
  "vendor": "Dexly Studios",
  "defaults": {
    "user": "salinxlg"
  },
  "repositories": []
}
```

Desde ese momento no tienes que editar la lista después de cada descarga: cuando `xclone.json` existe, cada `xclone <repo>` exitoso agrega automáticamente el repositorio. Los clones normales se guardan como `kit`; los ejecutados con `store` se guardan como `store`. Si la entrada ya existe para ese propietario, xClone la actualiza sin duplicarla. `--dry-run` nunca modifica el manifiesto.

Puedes registrar kits, stores, API o helpers dentro de `repositories`:

```json
{
  "schemaVersion": 1,
  "name": "Dexly Studios Development Collection",
  "author": "Roger Salinas",
  "vendor": "Dexly Studios",
  "defaults": {
    "user": "salinxlg"
  },
  "repositories": [
    {
      "repo": "dexkit",
      "mode": "kit"
    },
    {
      "repo": "dexly-store",
      "mode": "store"
    },
    {
      "repo": "api-helper",
      "mode": "kit",
      "branch": "develop",
      "to": "api-local"
    },
    {
      "repo": "legacy-helper",
      "mode": "kit",
      "enabled": false
    }
  ]
}
```

### Campos del manifiesto

| Campo | Descripción |
| --- | --- |
| `schemaVersion` | Versión del formato de `xclone.json`. Actualmente debe ser `1`. |
| `name` | Nombre visible de la colección. |
| `author` | Autor de la colección. El valor inicial es `Roger Salinas`. |
| `vendor` | Estudio responsable. El valor inicial es `Dexly Studios`. |
| `defaults.user` | Usuario u organización utilizado cuando una entrada no define otro. |
| `repositories` | Lista de repositorios que procesa `xclone all`. |
| `repo` | Nombre del repositorio dentro de GitHub. |
| `mode` | `kit` elimina `.git`; `store` conserva el historial completo. |
| `user` | Propietario opcional para una entrada concreta. |
| `branch` | Rama opcional que debe quedar seleccionada. |
| `to` | Carpeta o ruta de destino opcional. |
| `enabled` | Si es `false`, la entrada se conserva pero no se clona. |

### Clonar la colección completa

Después de configurar el manifiesto, ejecuta:

```powershell
xclone all
```

xClone valida todo el archivo antes de comenzar, procesa los repositorios en orden y presenta un resumen final. Las carpetas que ya existen son detectadas y omitidas, permitiendo ejecutar `xclone all` nuevamente sin volver a clonar lo que ya está disponible.

Los destinos relativos se resuelven desde la carpeta que contiene el manifiesto. También puedes utilizar otro archivo:

```powershell
xclone all --manifest=equipos.json
```

Para revisar toda la colección sin realizar cambios:

```powershell
xclone all --dry-run
```

<br><br>

## Conexión con GitHub

xClone utiliza la sesión existente de GitHub CLI para acceder a repositorios públicos o privados.

Internamente, una clonación utiliza una operación equivalente a:

```powershell
gh repo clone usuario/repositorio destino
```

Los argumentos se envían directamente a GitHub CLI sin ser interpretados como comandos adicionales del sistema. El nombre del propietario, repositorio, rama y destino se validan antes de iniciar el proceso.

<br>

## API y comandos del CLI

xClone expone sus operaciones mediante el comando global `xclone`:

```powershell
xclone operacion
```

Actualmente incluye los siguientes comandos:

- `xclone <repo>` → Clona un repositorio como copia limpia y elimina `.git`.
- `xclone <repo> store` → Clona el repositorio y conserva `.git` junto con su historial.
- Si existe `xclone.json`, ambos comandos registran o actualizan automáticamente el repositorio.
- `xclone init` → Crea el manifiesto `xclone.json`.
- `xclone all` → Clona todos los repositorios habilitados del manifiesto.
- `xclone config` → Muestra el usuario predeterminado.
- `xclone config <usuario>` → Guarda un nuevo propietario predeterminado.
- `xclone --doctor` → Comprueba el entorno y la autenticación.
- `xclone --version` → Devuelve la versión instalada.
- `xclone --developer` → Muestra la información del desarrollador.
- `xclone --help` → Muestra la documentación integrada del CLI.

<br><br>

## Proceso de clonación

El modo normal se inicia enviando únicamente el nombre del repositorio:

```powershell
xclone dexkit
```

xClone realiza automáticamente el siguiente proceso:

1. Obtiene el usuario guardado durante la instalación.
2. Valida el nombre del repositorio y la carpeta de destino.
3. Comprueba que GitHub CLI se encuentre disponible.
4. Ejecuta una clonación superficial para descargar menos historial.
5. Espera a que GitHub CLI finalice correctamente.
6. Elimina únicamente el `.git` del destino recién clonado.
7. Presenta el resultado y la ubicación del proyecto.

El resultado es una copia independiente que puede integrarse dentro de otro proyecto sin conservar el repositorio original como origen remoto.

<br>

### Modo Store

Cuando el repositorio será utilizado como proyecto completo, debe agregarse el modificador `store`:

```powershell
xclone dexkit store
```

Este modo conserva:

- La carpeta `.git`.
- El historial completo de commits.
- Las ramas y referencias descargadas por Git.
- La conexión del repositorio con GitHub.

También puede activarse mediante:

```powershell
xclone dexkit --store
xclone dexkit --keep-git
```

<br>

### Clonar desde otro usuario

Para utilizar temporalmente otro usuario u organización sin modificar la configuración guardada:

```powershell
xclone dexkit --user=otro-usuario
```

El cambio aplica únicamente a esa operación.

<br>

### Seleccionar otra carpeta

xClone utiliza el nombre del repositorio como carpeta de destino. Puede establecerse otro nombre o ruta mediante `--to`:

```powershell
xclone dexkit --to=mi-kit
```

También puede utilizarse la opción corta:

```powershell
xclone dexkit -d mi-kit
```

<br>

### Seleccionar una rama

Para clonar una rama concreta:

```powershell
xclone proyecto --branch=develop
```

O mediante la opción corta:

```powershell
xclone proyecto -b develop
```

<br>

### Combinar opciones

Los perfiles y modificadores pueden combinarse en una misma operación:

```powershell
xclone api-helper store --user=otra-cuenta --branch=develop --to=api-local
```

<br><br>

## Opciones disponibles

| Opción | Descripción |
| --- | --- |
| `store` | Conserva `.git` y el historial completo. |
| `--store` | Activa el perfil Store. |
| `--keep-git` | Alias de `--store`. |
| `--user=<usuario>` | Cambia el propietario únicamente para ese clon. |
| `-u <usuario>` | Versión corta de `--user`. |
| `--to=<carpeta>` | Define otra carpeta o ruta de destino. |
| `-d <carpeta>` | Versión corta de `--to`. |
| `--branch=<rama>` | Selecciona una rama concreta. |
| `-b <rama>` | Versión corta de `--branch`. |
| `--dry-run` | Simula la operación sin clonar ni eliminar archivos. |
| `--verbose` | Muestra directamente la salida completa de GitHub CLI. |
| `--no-animation` | Desactiva las animaciones conservando el progreso. |
| `--no-color` | Desactiva los colores de la terminal. |
| `--doctor` | Ejecuta el diagnóstico del entorno. |
| `--version` / `-v` | Muestra la versión instalada. |
| `--developer` | Muestra la autoría del proyecto. |
| `--help` / `-h` | Muestra la ayuda integrada. |

<br><br>

## Interfaz y experiencia visual

xClone incluye una interfaz diseñada para Windows Terminal y consolas modernas:

- Banner compacto con identidad de producto.
- Paleta magenta, violeta y cyan.
- Jerarquías tipográficas mediante estilos bold, italic y dim.
- Paneles de información antes y después del clon.
- Barra de progreso basada en fases realmente completadas.
- Animación activa mientras el proceso `gh repo clone` continúa ejecutándose.
- Mensajes diferenciados para éxito, advertencia y error.
- Degradación automática a texto sencillo cuando la terminal no soporta color o animaciones.

Las animaciones pueden desactivarse en cualquier momento:

```powershell
xclone repositorio --no-animation
```

<br><br>

## Simulación y diagnóstico

Antes de realizar una clonación, puedes revisar el comando que xClone ejecutaría utilizando `--dry-run`:

```powershell
xclone dexkit --dry-run
```

La simulación muestra el usuario, destino, perfil y comando final sin modificar ningún archivo.

Para comprobar el estado general del sistema:

```powershell
xclone --doctor
```

<br><br>

## Manejo de errores

xClone incluye un sistema unificado de validación y manejo de errores. Si GitHub CLI devuelve información técnica, el CLI conserva las últimas líneas relevantes y las presenta al usuario.

No se elimina ninguna carpeta parcial cuando GitHub CLI falla. Esto permite revisar el contenido descargado antes de decidir qué hacer con él.

<br>

## Errores comunes

### 1) Node.js no fue encontrado durante la instalación

Este mensaje aparece cuando Node.js no está instalado o cuando VS Code fue abierto antes de que Node.js se agregara al `PATH` de Windows.

Comprueba primero:

```powershell
node --version
```

Si el comando no existe, instala la versión LTS mediante:

```powershell
winget install OpenJS.NodeJS.LTS
```

Después de instalarlo, cierra completamente VS Code, vuelve a abrirlo y ejecuta:

```powershell
.\install.cmd
```

xClone requiere Node.js `18` o superior.

<br>

### 2) GitHub CLI no fue encontrado

Este error ocurre cuando `gh` no está instalado o no se encuentra disponible dentro de `PATH`.

Instala GitHub CLI, abre una terminal nueva y ejecuta:

```powershell
gh --version
gh auth login
```

<br>

### 3) GitHub no tiene una sesión activa

Puede aparecer cuando se intenta clonar un repositorio privado sin haber iniciado sesión.

Ejecuta:

```powershell
gh auth login
```

Después confirma el estado con:

```powershell
xclone --doctor
```

<br>

### 4) La carpeta de destino ya existe

xClone nunca reemplaza, limpia ni mezcla automáticamente una carpeta existente.

Puedes seleccionar otra ubicación mediante:

```powershell
xclone dexkit --to=dexkit-copia
```

<br>

### 5) El repositorio no fue encontrado

Este error puede ocurrir cuando el nombre está escrito incorrectamente, el propietario seleccionado no contiene el repositorio o la cuenta autenticada no tiene permisos.

Consulta el propietario actual:

```powershell
xclone config
```

O prueba temporalmente con otra cuenta:

```powershell
xclone repositorio --user=otro-propietario
```

<br>

### 6) El repositorio fue clonado, pero `.git` no pudo eliminarse

xClone conserva la carpeta completa y detiene la operación sin intentar eliminar otros archivos. Generalmente ocurre cuando otro programa mantiene abierto un archivo dentro de `.git` o cuando Windows bloquea temporalmente el acceso.

Cierra editores o procesos que estén utilizando el repositorio y vuelve a intentarlo con otro destino.

<br>

### 7) Los colores o caracteres no aparecen correctamente

Se recomienda utilizar Windows Terminal, PowerShell moderno o una terminal compatible con UTF-8.

También puedes iniciar xClone sin elementos visuales avanzados:

```powershell
xclone repositorio --no-color --no-animation
```

<br><br>

## Seguridad del proceso

- Los nombres del repositorio y propietario son validados antes de ejecutar GitHub CLI.
- Los argumentos no pasan por un intérprete de comandos durante la clonación.
- La raíz del disco no puede utilizarse como destino.
- Una carpeta existente nunca es sobrescrita.
- xClone solo elimina `.git` dentro del destino que acaba de crear.
- Los reintentos de eliminación están limitados y controlados.
- Una clonación fallida nunca provoca la limpieza automática del destino parcial.

<br><br>

## Obtener información del paquete

Puedes consultar la versión instalada utilizando:

```powershell
xclone --version
```

La respuesta utiliza el siguiente formato:

```text
xclone 7.2.1
```

La información general del paquete corresponde a:

```json
{
  "name": "@dexly/xclone",
  "version": "7.2.1",
  "runtime": "Node.js >=18",
  "developer": "Roger Salinas",
  "vendor": "Dexly Studios",
  "platform": "Windows 10/11",
  "license": "UNLICENSED"
}
```

También puedes consultar la información del desarrollador mediante:

```powershell
xclone --developer
```

<br>

## Desinstalación

Ejecuta el archivo incluido:

```powershell
uninstall.cmd
```

O elimina el paquete global mediante npm:

```powershell
npm uninstall -g @dexly/xclone
```

La configuración del usuario se conserva para futuras instalaciones.

<br><br>

## Información final del proyecto

- <a href="https://github.com/salinxlg">Roger Salinas</a> es el creador y desarrollador de xClone.
- xClone es una herramienta desarrollada para Dexly Studios.
- La versión actual de xClone es `v7.2.1`.
- El proyecto utiliza Node.js, npm, Git y GitHub CLI.
- Las colecciones se definen mediante `xclone.json` y pueden restaurarse con `xclone all`.
- Puede ejecutarse como comando global o directamente mediante `xclone.cmd`.
- © 2026 Roger Salinas, Dexly Studios. Todos los derechos reservados.

<br><br><br>

<div align="center">

  <img src="https://github.com/salinxlg/HelloAuth/raw/main/docs/sign.svg" alt="Roger Salinas" width="205">

</div>
