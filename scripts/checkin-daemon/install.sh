#!/bin/bash

# Rage Studios QR Check-in Daemon Installer for macOS
# Usage: curl -fsSL https://raw.githubusercontent.com/Eddy-C127/rage-checkin-daemon/main/install.sh | bash

set -e

echo "===================================================="
echo "  RAGE STUDIOS - INSTALADOR DE DAEMON QR CHECK-IN"
echo "===================================================="
echo ""

# Directorios de destino
INSTALL_DIR="$HOME/.rage-checkin-daemon"
CONFIG_DIR="$HOME/.config/rage-checkin"
CONFIG_FILE="$CONFIG_DIR/config.json"
PLIST_FILE="$HOME/Library/LaunchAgents/com.ragestudios.checkin.plist"

# 1. Comprobar si es macOS
if [ "$(uname)" != "Darwin" ]; then
    echo "[-] Este instalador automático está diseñado para macOS."
    echo "    Para Linux, por favor configura el script manualmente."
    exit 1
fi

# 2. Comprobar si Python 3 está instalado
if ! command -v python3 &> /dev/null; then
    echo "[-] Error: Python 3 no está instalado en este sistema."
    echo "    Por favor, instala Python 3 usando Homebrew (brew install python) o desde python.org"
    exit 1
fi

# Crear directorios
mkdir -p "$INSTALL_DIR"
mkdir -p "$CONFIG_DIR"

# 3. Preguntar credenciales y configuración
OVERWRITE_CONFIG="y"
if [ -f "$CONFIG_FILE" ]; then
    echo "[!] Se detectó una configuración previa en: $CONFIG_FILE"
    read -p "    ¿Deseas conservar la configuración actual? [Y/n]: " keep_config
    keep_config=${keep_config:-y}
    if [[ "$keep_config" =~ ^[Yy]$ ]]; then
        OVERWRITE_CONFIG="n"
        echo "[+] Usando configuración existente."
    fi
fi

if [ "$OVERWRITE_CONFIG" = "y" ]; then
    echo "[+] Configurando nuevas credenciales de conexión..."
    
    DEFAULT_URL="https://qixgxmlpmploaataidnv.supabase.co"
    DEFAULT_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFpeGd4bWxwbXBsb2FhdGFpZG52Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUyOTExODMsImV4cCI6MjA3MDg2NzE4M30.ItBAlRYQuXTIkihyXejTwSfUTephNOwspseuoMcWpgU"
    
    read -p "    URL de Supabase [$DEFAULT_URL]: " url
    url=${url:-$DEFAULT_URL}
    
    read -p "    API Key de Supabase [$DEFAULT_KEY]: " key
    key=${key:-$DEFAULT_KEY}
    
    # Buscar puertos USB de serie conectados en Mac
    echo "[+] Buscando puertos serie (lectores QR conectados)..."
    ports=($(ls /dev/cu.usbmodem* /dev/cu.usbserial* 2>/dev/null || true))
    
    if [ ${#ports[@]} -eq 0 ]; then
        echo "    No se detectaron puertos de tipo /dev/cu.usbmodem* o /dev/cu.usbserial*."
        DEFAULT_PORT="/dev/cu.usbmodem101"
        read -p "    Especifica el puerto serie manualmente [$DEFAULT_PORT]: " port
        port=${port:-$DEFAULT_PORT}
    else
        echo "    Puertos serie encontrados:"
        for i in "${!ports[@]}"; do
            echo "      [$((i+1))] ${ports[$i]}"
        done
        read -p "    Selecciona un número [1-${#ports[@]}] o ingresa ruta manual: " port_sel
        if [[ "$port_sel" =~ ^[0-9]+$ ]] && [ "$port_sel" -ge 1 ] && [ "$port_sel" -le "${#ports[@]}" ]; then
            port="${ports[$((port_sel-1))]}"
        else
            port=${port_sel:-${ports[0]}}
        fi
    fi
    echo "    Puerto seleccionado: $port"
    
    read -p "    Correo de Recepcionista/Admin: " email
    while [ -z "$email" ]; do
        read -p "    [!] El correo es requerido: " email
    done
    
    read -s -p "    Contraseña: " password
    echo ""
    while [ -z "$password" ]; do
        read -s -p "    [!] La contraseña es requerida: " password
        echo ""
    done
    
    # Guardar en config.json
    cat <<EOF > "$CONFIG_FILE"
{
  "SUPABASE_URL": "$url",
  "SUPABASE_KEY": "$key",
  "PORT": "$port",
  "EMAIL": "$email",
  "PASSWORD": "$password"
}
EOF
    echo "[+] Configuración guardada exitosamente en $CONFIG_FILE"
fi

# 4. Configurar Entorno Virtual de Python (Venv)
echo "[+] Preparando entorno virtual Python..."
python3 -m venv "$INSTALL_DIR/venv"
"$INSTALL_DIR/venv/bin/pip" install --upgrade pip
"$INSTALL_DIR/venv/bin/pip" install pyserial requests

# 5. Descargar/Copiar el Script de Python
echo "[+] Descargando script del Daemon..."
curl -fsSL -o "$INSTALL_DIR/checkin_daemon.py" "https://raw.githubusercontent.com/Eddy-C127/rage-checkin-daemon/main/checkin_daemon.py"

# 6. Crear el LaunchAgent para macOS
echo "[+] Configurando servicio de auto-arranque (launchd)..."
cat <<EOF > "$PLIST_FILE"
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.ragestudios.checkin</string>
    <key>ProgramArguments</key>
    <array>
        <string>$INSTALL_DIR/venv/bin/python3</string>
        <string>$INSTALL_DIR/checkin_daemon.py</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>$HOME/Library/Logs/rage-checkin.log</string>
    <key>StandardErrorPath</key>
    <string>$HOME/Library/Logs/rage-checkin.log</string>
</dict>
</plist>
EOF

# 7. Cargar el servicio en macOS launchctl
echo "[+] Iniciando servicio..."
launchctl unload "$PLIST_FILE" 2>/dev/null || true
launchctl load "$PLIST_FILE"

# 8. Agregar alias en .zshrc
ZSHRC="$HOME/.zshrc"
if [ -f "$ZSHRC" ]; then
    if ! grep -q "rage-checkin" "$ZSHRC"; then
        echo "[+] Agregando comandos rápidos (aliases) a tu terminal (.zshrc)..."
        cat <<'EOF' >> "$ZSHRC"

# --- RAGE STUDIOS QR DAEMON ALIASES ---
alias rage-checkin-logs="tail -f ~/Library/Logs/rage-checkin.log"
alias rage-checkin-restart="launchctl unload ~/Library/LaunchAgents/com.ragestudios.checkin.plist && launchctl load ~/Library/LaunchAgents/com.ragestudios.checkin.plist"
alias rage-checkin-status="launchctl list | grep com.ragestudios.checkin"
alias rage-checkin-config="nano ~/.config/rage-checkin/config.json && rage-checkin-restart"
# --------------------------------------
EOF
        echo "    [i] Abre una nueva terminal o ejecuta 'source ~/.zshrc' para activar los aliases."
    fi
fi

echo ""
echo "===================================================="
echo "  [✓] ¡INSTALACIÓN COMPLETADA EXITOSAMENTE!"
echo "===================================================="
echo "  - El servicio está corriendo de fondo en la Mac."
echo "  - Registra todos los logs en: ~/Library/Logs/rage-checkin.log"
echo ""
echo "  Comandos rápidos disponibles:"
echo "    rage-checkin-logs     -> Ver escaneos y logs en tiempo real"
echo "    rage-checkin-status   -> Verificar si el daemon está corriendo"
echo "    rage-checkin-restart  -> Reiniciar el daemon"
echo "    rage-checkin-config   -> Modificar la configuración (puerto/cuenta)"
echo "===================================================="
