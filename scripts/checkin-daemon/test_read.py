import serial
import sys

port = '/dev/ttyACM0'
baudrate = 9600

print(f"Abriendo {port} a {baudrate} baudios con pyserial (diagnóstico)...")
try:
    ser = serial.Serial(
        port=port,
        baudrate=baudrate,
        bytesize=serial.EIGHTBITS,
        parity=serial.PARITY_NONE,
        stopbits=serial.STOPBITS_ONE,
        timeout=1
    )
    print("Puerto abierto correctamente. Escanea un código QR ahora...")
    
    while True:
        if ser.in_waiting > 0:
            line = ser.readline()
            print(f"Bytes recibidos: {repr(line)}")
            try:
                decoded = line.decode('utf-8').strip()
                print(f"Decodificado: [{decoded}] (longitud: {len(decoded)})")
            except Exception as e:
                print(f"Fallo al decodificar: {e}")
            sys.stdout.flush()
except KeyboardInterrupt:
    print("\nPrograma terminado por el usuario.")
except Exception as e:
    print(f"Error al abrir o leer el puerto: {e}")
