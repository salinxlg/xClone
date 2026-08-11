# XClone 7.1.0

XClone convierte el flujo repetitivo de clonar un repositorio y borrar su
carpeta `.git` en un solo comando. El instalador pregunta qué usuario u
organización de GitHub quieres usar y lo conserva como propietario
predeterminado.

La interfaz incluye colores, jerarquías tipográficas, paneles, progreso por
fases y una animación activa durante la clonación. No muestra porcentajes
falsos: cada barra representa pasos que realmente terminaron.

## Requisitos

- Windows 10 u 11.
- Node.js 18 o posterior.
- Git.
- GitHub CLI (`gh`) con una sesión iniciada mediante `gh auth login`.

## Instalación

1. Extrae el ZIP completo.
2. Ejecuta `install.cmd`.
3. Escribe tu usuario u organización de GitHub cuando se solicite.
4. Abre una terminal nueva.
5. Ejecuta `xclone --doctor`.

El instalador tiene su propia interfaz interactiva y registra `xclone`
globalmente mediante npm. Normalmente no necesita permisos de administrador.

## Uso rápido

Clonar desde el usuario elegido durante la instalación y borrar `.git`:

```powershell
xclone dexkit
```

Clonar el proyecto completo y conservar `.git`:

```powershell
xclone dexkit store
```

Usar temporalmente otra cuenta, sin cambiar la preferencia guardada:

```powershell
xclone dexkit --user=otro-usuario
```

Los modificadores se pueden combinar:

```powershell
xclone api-helper store --user=otra-cuenta --branch=develop --to=api-local
```

## Usuario predeterminado

Consultar el usuario actual:

```powershell
xclone config
```

Cambiarlo permanentemente:

```powershell
xclone config otro-usuario
```

También puedes usar:

```powershell
xclone config --user=otro-usuario
xclone config --reset
```

`--reset` restaura `salinxlg` como valor inicial.

## Comandos y opciones

| Comando u opción | Resultado |
| --- | --- |
| `xclone <repo>` | Clon superficial desde el usuario guardado y elimina `.git`. |
| `xclone <repo> store` | Conserva `.git` y el historial completo. |
| `xclone config <usuario>` | Cambia el propietario predeterminado. |
| `--user=<usuario>` / `-u` | Cambia de propietario solo para ese clon. |
| `--store` / `--keep-git` | Otra forma de activar el modo `store`. |
| `--to=<carpeta>` / `-d` | Define otra carpeta o ruta de destino. |
| `--branch=<rama>` / `-b` | Selecciona una rama concreta. |
| `--dry-run` | Simula y muestra el comando sin cambiar archivos. |
| `--verbose` | Muestra directamente la salida completa de GitHub CLI. |
| `--no-animation` | Desactiva las animaciones conservando el progreso. |
| `--no-color` | Desactiva la paleta de colores. |
| `--doctor` | Revisa Node.js, Git, GitHub CLI y autenticación. |
| `--version` / `-v` | Muestra la versión de XClone. |
| `--developer` | Muestra la autoría de la herramienta. |
| `--help` / `-h` | Muestra la ayuda completa. |

## Interfaz premium

- Banner compacto con identidad XClone.
- Paleta magenta, violeta y cyan compatible con Windows Terminal.
- Tipografía de terminal en niveles bold, italic y dim.
- Indicador animado mientras el proceso `gh repo clone` sigue activo.
- Progreso de tres fases: validación, descarga y preparación final.
- Panel final con modo, resultado y ubicación del proyecto.
- Degradación automática a texto sencillo cuando la terminal no admite color o
  animaciones.

## Protecciones incluidas

- Nunca reemplaza ni limpia una carpeta de destino existente.
- Ejecuta GitHub CLI sin interpretar los argumentos del repositorio como
  comandos.
- Valida el nombre del repositorio y del propietario.
- Solo elimina `.git` dentro del destino que acaba de clonar.
- Si GitHub CLI falla, conserva cualquier carpeta parcial para inspeccionarla.
- El modo normal usa un clon superficial para descargar menos historial.
- La salida técnica de GitHub se conserva y aparece si la clonación falla.

## Modo portable

También puedes ejecutar `xclone.cmd` directamente desde la carpeta extraída,
sin instalar el comando global:

```powershell
.\xclone.cmd dexkit
```

La configuración del usuario funciona también en modo portable.

## Desinstalación

Ejecuta `uninstall.cmd` o usa:

```powershell
npm uninstall -g @dexly/xclone
```

---

Desarrollado por Roger Salinas para Dexly.  
Build without limits.
