const fs = require('fs');
const readline = require('readline');

const port = '/dev/ttyACM0';
console.log(`Abriendo puerto ${port} en modo lectura...`);

try {
  const stream = fs.createReadStream(port);
  const rl = readline.createInterface({
    input: stream,
    crlfDelay: Infinity
  });

  rl.on('line', (line) => {
    const clean = line.trim();
    if (clean) {
      console.log(`Código escaneado: [${clean}] (longitud: ${clean.length})`);
    }
  });

  stream.on('error', (err) => {
    console.error('Error en el puerto:', err.message);
    console.log('Asegúrate de tener permisos (puedes necesitar correr con sudo o estar en el grupo dialout).');
  });
} catch (e) {
  console.error('Fallo al inicializar:', e.message);
}
