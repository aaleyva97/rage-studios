# Rage Studios - QR Check-in Daemon

Daemon de segundo plano para macOS y Linux que lee un lector de código QR físico conectado por USB (modo Puerto Serie / Virtual COM) y procesa los pases de asistencia de las clientas en tiempo real directamente con Supabase.

## Instalación rápida (macOS / Linux)

Para instalar el daemon en una computadora de recepción con un solo comando, abre la Terminal y ejecuta:

```bash
curl -fsSL https://raw.githubusercontent.com/Eddy-C127/rage-checkin-daemon/main/install.sh | bash
```

### ¿Qué hace el instalador?
1. Detecta si tienes Python 3 instalado.
2. Configura los permisos del puerto USB serie (en Linux te añade al grupo `dialout` o `uucp` automáticamente si hace falta).
3. Te pide las credenciales de Supabase (URL, API Key, correo del administrador y contraseña) y el puerto de conexión del escáner (detectándolo y ofreciéndote una lista interactiva).
4. Crea un entorno virtual (`venv`) aislado y descarga el script del daemon.
5. Registra el daemon como servicio de segundo plano:
   * **macOS:** Registra un Launch Agent (`launchd`) de usuario.
   * **Linux:** Registra un servicio de usuario (`systemd`).
6. Registra atajos rápidos (aliases) en tu terminal (`.zshrc` / `.bashrc`).

---

## Comandos rápidos (Aliases de Terminal)

Una vez completada la instalación, abre una nueva terminal (o ejecuta `source ~/.zshrc` / `source ~/.bashrc`). Tendrás los siguientes comandos a tu disposición:

* **Ver logs en tiempo real:**
  ```bash
  rage-checkin-logs
  ```
  *(Útil para ver cuándo ingresa un cliente, qué responde la base de datos o si hay desconexiones del lector. En macOS lee de `~/Library/Logs/` y en Linux usa `journalctl`).*

* **Verificar si está activo:**
  ```bash
  rage-checkin-status
  ```

* **Reiniciar el daemon:**
  ```bash
  rage-checkin-restart
  ```

* **Reconfigurar credenciales o cambiar de puerto:**
  ```bash
  rage-checkin-config
  ```

---

## Consideraciones para Linux

En sistemas Linux, tras realizar la instalación por primera vez, el instalador te añadirá al grupo de hardware correspondiente (`dialout` o `uucp`). Para que tu sistema operativo aplique estos cambios de permisos, **debes cerrar sesión de usuario actual e iniciarla de nuevo** o reiniciar la computadora de recepción.

---

## Desinstalación

Si deseas remover el daemon por completo de tu sistema:

```bash
curl -fsSL https://raw.githubusercontent.com/Eddy-C127/rage-checkin-daemon/main/uninstall.sh | bash
```
