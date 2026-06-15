#!/bin/bash

# Rage Studios QR Check-in Daemon Installer
# Supports macOS (launchd) & Linux (systemd)
# Usage: curl -fsSL https://raw.githubusercontent.com/Eddy-C127/rage-checkin-daemon/main/install.sh | bash

set -e

echo "===================================================="
echo "  RAGE STUDIOS - INSTALADOR DE DAEMON QR CHECK-IN"
echo "===================================================="
echo ""

# Identificar sistema operativo
OS="$(uname)"
INSTALL_DIR="$HOME/.rage-checkin-daemon"
CONFIG_DIR="$HOME/.config/rage-checkin"
CONFIG_FILE="$CONFIG_DIR/config.json"

if [ "$OS" != "Darwin" ] && [ "$OS" != "Linux" ]; then
    echo "[-] Sistema operativo no compatible: $OS"
    exit 1
fi

echo "[+] Detectado sistema operativo: $OS"

# 1. Comprobar si Python 3 está instalado
if ! command -v python3 &> /dev/null; then
    echo "[-] Error: Python 3 no está instalado en este sistema."
    if [ "$OS" = "Darwin" ]; then
        echo "    Instálalo usando Homebrew: brew install python"
    else
        echo "    Instálalo usando el administrador de paquetes de tu distro (ej: sudo apt install python3 python3-venv)"
    fi
    exit 1
fi

# 2. Configurar permisos del puerto serie (Solo Linux)
if [ "$OS" = "Linux" ]; then
    echo "[+] Verificando permisos para puertos serie..."
    # Buscar si el usuario pertenece al grupo 'dialout' o 'uucp'
    if ! (groups | grep -qE 'dialout|uucp'); then
        # Detectar grupo disponible
        SERIAL_GROUP="dialout"
        if grep -q "uucp" /etc/group; then
            SERIAL_GROUP="uucp"
        fi
        
        echo "[!] Tu usuario no pertenece al grupo '$SERIAL_GROUP' requerido para acceder a puertos USB serie."
        echo "    Se solicitarán permisos de administrador (sudo) para agregarte..."
        sudo usermod -aG "$SERIAL_GROUP" "$USER"
        echo "[✓] Agregado al grupo '$SERIAL_GROUP'."
        echo "    NOTA: En Linux, deberás reiniciar tu sesión (cerrar sesión e iniciar de nuevo) para que los permisos tengan efecto."
    else
        echo "[✓] El usuario ya pertenece a los grupos de acceso serial."
    fi
fi

# Crear directorios de destino
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
    
    # Buscar puertos USB de serie conectados
    echo "[+] Buscando puertos serie (lectores QR conectados)..."
    if [ "$OS" = "Darwin" ]; then
        ports=($(ls /dev/cu.usbmodem* /dev/cu.usbserial* 2>/dev/null || true))
        DEFAULT_PORT="/dev/cu.usbmodem101"
    else
        ports=($(ls /dev/ttyACM* /dev/ttyUSB* 2>/dev/null || true))
        DEFAULT_PORT="/dev/ttyACM0"
    fi
    
    if [ ${#ports[@]} -eq 0 ]; then
        echo "    No se detectaron puertos activos."
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

# 6. Configurar Servicio de Segundo Plano
if [ "$OS" = "Darwin" ]; then
    # --- macOS (launchd) ---
    echo "[+] Configurando servicio de auto-arranque (launchd)..."
    PLIST_FILE="$HOME/Library/LaunchAgents/com.ragestudios.checkin.plist"
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
    echo "[+] Iniciando servicio..."
    launchctl unload "$PLIST_FILE" 2>/dev/null || true
    launchctl load "$PLIST_FILE"

else
    # --- Linux (systemd user service) ---
    echo "[+] Configurando servicio de auto-arranque (systemd)..."
    SYSTEMD_DIR="$HOME/.config/systemd/user"
    mkdir -p "$SYSTEMD_DIR"
    SERVICE_FILE="$SYSTEMD_DIR/rage-checkin.service"
    
    cat <<EOF > "$SERVICE_FILE"
[Unit]
Description=Rage Studios QR Check-in Daemon
After=network.target

[Service]
ExecStart=$INSTALL_DIR/venv/bin/python3 $INSTALL_DIR/checkin_daemon.py
Restart=always
RestartSec=5

[Install]
WantedBy=default.target
EOF
    echo "[+] Iniciando servicio..."
    systemctl --user daemon-reload
    systemctl --user enable rage-checkin.service
    systemctl --user restart rage-checkin.service
fi

# 7. Agregar alias en archivos de configuración de Shell
SHELL_FILES=()
[ -f "$HOME/.zshrc" ] && SHELL_FILES+=("$HOME/.zshrc")
[ -f "$HOME/.bashrc" ] && SHELL_FILES+=("$HOME/.bashrc")

for shell_file in "${SHELL_FILES[@]}"; do
    if ! grep -q "rage-checkin" "$shell_file"; then
        echo "[+] Agregando atajos (aliases) a $(basename "$shell_file")..."
        if [ "$OS" = "Darwin" ]; then
            cat <<'EOF' >> "$shell_file"

# --- RAGE STUDIOS QR DAEMON ALIASES ---
alias rage-checkin-logs="tail -f ~/Library/Logs/rage-checkin.log"
alias rage-checkin-restart="launchctl unload ~/Library/LaunchAgents/com.ragestudios.checkin.plist && launchctl load ~/Library/LaunchAgents/com.ragestudios.checkin.plist"
alias rage-checkin-status="launchctl list | grep com.ragestudios.checkin"
alias rage-checkin-config="nano ~/.config/rage-checkin/config.json && rage-checkin-restart"
# --------------------------------------
EOF
        else
            cat <<'EOF' >> "$shell_file"

# --- RAGE STUDIOS QR DAEMON ALIASES ---
alias rage-checkin-logs="journalctl --user -u rage-checkin.service -f -n 100"
alias rage-checkin-restart="systemctl --user restart rage-checkin.service"
alias rage-checkin-status="systemctl --user status rage-checkin.service"
alias rage-checkin-config="nano ~/.config/rage-checkin/config.json && rage-checkin-restart"
# --------------------------------------
EOF
        fi
    fi
done

echo ""
echo "===================================================="
echo "  [✓] ¡INSTALACIÓN COMPLETADA EXITOSAMENTE!"
echo "===================================================="
echo "  - El servicio está corriendo de fondo."
if [ "$OS" = "Darwin" ]; then
    echo "  - Registra todos los logs en: ~/Library/Logs/rage-checkin.log"
else
    echo "  - Registra todos los logs en systemd journal."
fi
echo ""
echo "  Comandos rápidos disponibles:"
echo "    rage-checkin-logs     -> Ver escaneos y logs en tiempo real"
echo "    rage-checkin-status   -> Verificar si el daemon está corriendo"
echo "    rage-checkin-restart  -> Reiniciar el daemon"
echo "    rage-checkin-config   -> Modificar la configuración"
echo ""
if [ "$OS" = "Linux" ]; then
    echo "  *IMPORTANTE*: Si es la primera vez que instalas, recuerda cerrar sesión"
    echo "  y volver a entrar para aplicar los nuevos permisos de puertos serie."
fi
echo "===================================================="
