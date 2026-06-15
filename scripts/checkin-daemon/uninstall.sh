#!/bin/bash

# Rage Studios QR Check-in Daemon Uninstaller
# Supports macOS & Linux

echo "===================================================="
echo "  RAGE STUDIOS - DESINSTALADOR DE DAEMON QR CHECK-IN"
echo "===================================================="
echo ""

OS="$(uname)"
INSTALL_DIR="$HOME/.rage-checkin-daemon"
CONFIG_DIR="$HOME/.config/rage-checkin"

# 1. Detener y descargar servicio según OS
if [ "$OS" = "Darwin" ]; then
    PLIST_FILE="$HOME/Library/LaunchAgents/com.ragestudios.checkin.plist"
    echo "[+] Deteniendo y removiendo servicio de launchd (macOS)..."
    launchctl unload "$PLIST_FILE" 2>/dev/null || true
    rm -f "$PLIST_FILE"
else
    echo "[+] Deteniendo y removiendo servicio de systemd (Linux)..."
    systemctl --user stop rage-checkin.service 2>/dev/null || true
    systemctl --user disable rage-checkin.service 2>/dev/null || true
    rm -f "$HOME/.config/systemd/user/rage-checkin.service"
    systemctl --user daemon-reload
fi

# 2. Eliminar binarios y venv
echo "[+] Eliminando archivos del daemon y entorno virtual..."
rm -rf "$INSTALL_DIR"

# 3. Preguntar si eliminar la configuración
read -p "¿Deseas eliminar también los archivos de configuración y credenciales? [y/N]: " del_config
del_config=${del_config:-n}
if [[ "$del_config" =~ ^[Yy]$ ]]; then
    echo "[+] Eliminando configuración en $CONFIG_DIR..."
    rm -rf "$CONFIG_DIR"
fi

# 4. Eliminar logs (Solo macOS)
if [ "$OS" = "Darwin" ]; then
    read -p "¿Deseas eliminar los archivos de log históricos? [y/N]: " del_logs
    del_logs=${del_logs:-n}
    if [[ "$del_logs" =~ ^[Yy]$ ]]; then
        echo "[+] Eliminando logs de macOS..."
        rm -f "$HOME/Library/Logs/rage-checkin.log"
    fi
fi

echo ""
echo "[-] Desinstalación completada."
echo "[!] Nota: Los aliases en tu configuración de shell (~/.bashrc o ~/.zshrc)"
echo "    no han sido eliminados automáticamente. Si deseas quitarlos, abre los"
echo "    archivos y remueve la sección RAGE STUDIOS QR DAEMON ALIASES."
echo "===================================================="
