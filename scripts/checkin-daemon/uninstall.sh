#!/bin/bash

# Rage Studios QR Check-in Daemon Uninstaller for macOS

echo "===================================================="
echo "  RAGE STUDIOS - DESINSTALADOR DE DAEMON QR CHECK-IN"
echo "===================================================="
echo ""

INSTALL_DIR="$HOME/.rage-checkin-daemon"
CONFIG_DIR="$HOME/.config/rage-checkin"
PLIST_FILE="$HOME/Library/LaunchAgents/com.ragestudios.checkin.plist"

# Detener y descargar servicio
echo "[+] Deteniendo y removiendo servicio de launchd..."
launchctl unload "$PLIST_FILE" 2>/dev/null || true
rm -f "$PLIST_FILE"

# Eliminar binarios y venv
echo "[+] Eliminando archivos del daemon y entorno virtual..."
rm -rf "$INSTALL_DIR"

# Preguntar si eliminar la configuración
read -p "¿Deseas eliminar también los archivos de configuración y credenciales? [y/N]: " del_config
del_config=${del_config:-n}
if [[ "$del_config" =~ ^[Yy]$ ]]; then
    echo "[+] Eliminando configuración en $CONFIG_DIR..."
    rm -rf "$CONFIG_DIR"
fi

# Eliminar logs
read -p "¿Deseas eliminar los archivos de log históricos? [y/N]: " del_logs
del_logs=${del_logs:-n}
if [[ "$del_logs" =~ ^[Yy]$ ]]; then
    echo "[+] Eliminando logs..."
    rm -f "$HOME/Library/Logs/rage-checkin.log"
fi

echo ""
echo "[-] Desinstalación completada."
echo "[!] Nota: Los aliases en tu ~/.zshrc no han sido eliminados automáticamente."
echo "    Si deseas quitarlos, abre ~/.zshrc y remueve la sección RAGE STUDIOS QR DAEMON ALIASES."
echo "===================================================="
