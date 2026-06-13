import os
import sys
import json
import serial
import requests
import subprocess
import platform
import time

DEFAULT_PORT = '/dev/ttyACM0' if platform.system() == 'Linux' else '/dev/cu.usbmodem101'
DEFAULT_URL = 'https://qixgxmlpmploaataidnv.supabase.co'
DEFAULT_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFpeGd4bWxwbXBsb2FhdGFpZG52Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUyOTExODMsImV4cCI6MjA3MDg2NzE4M30.ItBAlRYQuXTIkihyXejTwSfUTephNOwspseuoMcWpgU'

CONFIG_DIR = os.path.expanduser('~/.config/rage-checkin')
CONFIG_FILE = os.path.join(CONFIG_DIR, 'config.json')

def load_config():
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, 'r') as f:
                return json.load(f)
        except Exception:
            pass
    return {}

def save_config(config):
    try:
        os.makedirs(CONFIG_DIR, exist_ok=True)
        with open(CONFIG_FILE, 'w') as f:
            json.dump(config, f, indent=2)
    except Exception as e:
        print(f"Error al guardar configuración: {e}")

def play_sound(success=True):
    """Reproduce un sonido de alerta según la plataforma."""
    try:
        if platform.system() == 'Darwin': # macOS
            sound = '/System/Library/Sounds/Glass.aiff' if success else '/System/Library/Sounds/Sosumi.aiff'
            subprocess.Popen(['afplay', sound], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        elif platform.system() == 'Linux': # Linux/Ubuntu
            sound = '/usr/share/sounds/freedesktop/stereo/complete.oga' if success else '/usr/share/sounds/freedesktop/stereo/dialog-error.oga'
            if os.path.exists(sound):
                subprocess.Popen(['paplay', sound], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            else:
                # Terminal bell character as fallback
                sys.stdout.write('\a')
                sys.stdout.flush()
    except Exception:
        # Fallback terminal bell
        sys.stdout.write('\a')
        sys.stdout.flush()

def login_supabase(url, key, email, password):
    login_url = f"{url}/auth/v1/token?grant_type=password"
    headers = {
        "apikey": key,
        "Content-Type": "application/json"
    }
    payload = {
        "email": email,
        "password": password
    }
    print(f"Iniciando sesión en Supabase como {email}...")
    response = requests.post(login_url, json=payload, headers=headers)
    if response.status_code != 200:
        raise Exception(f"Fallo de autenticación: {response.text}")
    data = response.json()
    return data["access_token"]

def main():
    print("============================================")
    print("    RAGE STUDIOS - QR CHECK-IN DAEMON       ")
    print("============================================")
    
    config = load_config()
    
    # Cargar o preguntar variables
    url = config.get('SUPABASE_URL') or input(f"Supabase URL [{DEFAULT_URL}]: ").strip() or DEFAULT_URL
    key = config.get('SUPABASE_KEY') or input(f"Supabase Key [{DEFAULT_KEY}]: ").strip() or DEFAULT_KEY
    port = config.get('PORT') or input(f"Puerto Serie [{DEFAULT_PORT}]: ").strip() or DEFAULT_PORT
    email = config.get('EMAIL') or input("Correo de Recepcionista/Admin: ").strip()
    password = config.get('PASSWORD') or input("Contraseña: ").strip()
    
    if not email or not password:
        print("Error: Correo y contraseña son requeridos para validar check-ins como Administrador.")
        sys.exit(1)
        
    # Guardar configuración localmente
    save_config({
        'SUPABASE_URL': url,
        'SUPABASE_KEY': key,
        'PORT': port,
        'EMAIL': email,
        'PASSWORD': password
    })
    
    # Obtener Token inicial
    try:
        access_token = login_supabase(url, key, email, password)
        print("Sesión iniciada correctamente.")
    except Exception as e:
        print(f"Error al conectar con Supabase: {e}")
        sys.exit(1)
        
    # Conectar a Lector QR
    print(f"Conectando al puerto lector QR: {port}...")
    try:
        ser = serial.Serial(
            port=port,
            baudrate=9600,
            bytesize=serial.EIGHTBITS,
            parity=serial.PARITY_NONE,
            stopbits=serial.STOPBITS_ONE,
            timeout=1
        )
        print("Lector conectado exitosamente. Esperando escaneos de clientes...")
        play_sound(True)
    except Exception as e:
        print(f"Error al abrir el puerto {port}: {e}")
        print("Por favor, verifica que el lector esté en modo USB CDC y que el puerto sea el correcto.")
        sys.exit(1)
        
    while True:
        try:
            if ser.in_waiting > 0:
                line = ser.readline()
                token = line.decode('utf-8').strip()
                if not token:
                    continue
                    
                print(f"\n[Escaneo] Token recibido: {token[:10]}...{token[-10:] if len(token) > 20 else ''} (longitud: {len(token)})")
                
                # Ejecutar RPC en Supabase
                rpc_url = f"{url}/rest/v1/rpc/checkin_scan_pass"
                headers = {
                    "apikey": key,
                    "Authorization": f"Bearer {access_token}",
                    "Content-Type": "application/json"
                }
                
                response = requests.post(rpc_url, json={"p_token": token}, headers=headers)
                
                # Manejar expiración de token JWT de la sesión
                if response.status_code in (401, 403):
                    print("Sesión expirada. Renovando token de acceso...")
                    try:
                        access_token = login_supabase(url, key, email, password)
                        headers["Authorization"] = f"Bearer {access_token}"
                        response = requests.post(rpc_url, json={"p_token": token}, headers=headers)
                    except Exception as re_err:
                        print(f"Error al renovar sesión: {re_err}")
                        play_sound(False)
                        continue
                
                if response.status_code != 200:
                    print(f"Error de servidor RPC: {response.text}")
                    play_sound(False)
                    continue
                    
                result = response.json()
                status_code = result.get("status_code")
                message = result.get("message", "")
                client_id = result.get("client_id")
                client_name = result.get("client_name", "Cliente")
                
                print(f"[Resultado] Status: {status_code} - {message}")
                
                # Emitir Broadcast en Supabase Realtime para actualizar la app del cliente
                if client_id:
                    broadcast_url = f"{url}/realtime/v1/api/broadcast"
                    broadcast_headers = {
                        "apikey": key,
                        "Authorization": f"Bearer {access_token}",
                        "Content-Type": "application/json"
                    }
                    broadcast_payload = {
                        "messages": [
                            {
                                "topic": "checkin-realtime",
                                "event": "scan-result",
                                "payload": result
                            }
                        ]
                    }
                    try:
                        b_res = requests.post(broadcast_url, json=broadcast_payload, headers=broadcast_headers)
                        if b_res.status_code in (200, 202):
                            print(f"[Realtime] Difusión enviada con éxito para {client_name}.")
                        else:
                            print(f"[Realtime] Error al enviar difusión (HTTP {b_res.status_code}): {b_res.text}")
                    except Exception as b_err:
                        print(f"[Realtime] Fallo de conexión de red: {b_err}")
                
                # Acciones de audio
                if status_code in ('OK', 'ALREADY_CHECKED_IN'):
                    play_sound(True)
                else:
                    play_sound(False)
                    
        except KeyboardInterrupt:
            print("\nCerrando daemon por solicitud del usuario.")
            play_sound(False)
            break
        except Exception as e:
            print(f"Error inesperado en el bucle principal: {e}")
            time.sleep(1)

if __name__ == '__main__':
    main()
