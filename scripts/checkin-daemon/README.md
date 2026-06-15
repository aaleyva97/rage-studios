# Rage Studios - QR Check-in Daemon

Daemon de segundo plano para macOS que lee un lector de código QR físico conectado por USB (modo Puerto Serie / Virtual COM) y procesa los pases de asistencia de las clientas en tiempo real directamente con Supabase.

## Instalación rápida (macOS)

Para instalar el daemon en una Mac de recepción con un solo comando, abre la Terminal y ejecuta:

```bash
curl -fsSL https://raw.githubusercontent.com/Eddy-C127/rage-checkin-daemon/main/install.sh | bash
```

### ¿Qué hace el instalador?
1. Detecta si tienes Python 3 instalado.
2. Te pide las credenciales de Supabase (URL, API Key, correo del administrador y contraseña) y el puerto COM del escáner (detectándolo automáticamente).
3. Crea un entorno virtual (`venv`) aislado y descarga el script del daemon.
4. Registra un Launch Agent (`launchd`) de macOS para que el daemon corra siempre de fondo en segundo plano y se ejecute automáticamente al encender la Mac.
5. Registra atajos fáciles en tu terminal.

---

## Comandos rápidos (Aliases de Terminal)

Una vez completada la instalación, abre una nueva terminal o ejecuta `source ~/.zshrc`. Podrás usar los siguientes comandos:

* **Ver logs en tiempo real:**
  ```bash
  rage-checkin-logs
  ```
  *(Útil para ver cuándo ingresa un cliente, qué responde la base de datos o si hay desconexiones del lector).*

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

## Desinstalación

Si deseas remover el daemon de tu sistema:

```bash
curl -fsSL https://raw.githubusercontent.com/Eddy-C127/rage-checkin-daemon/main/uninstall.sh | bash
```
