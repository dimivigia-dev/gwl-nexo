'use strict';

// Funciona tanto com `node server.cjs` quanto com carregadores da hospedagem.
module.exports = import('./server.mjs')
  .then(({ startApplication }) => startApplication())
  .catch(error => {
    console.error('Não foi possível iniciar o GWL NEXO:', error.code || error.name);
    process.exitCode = 1;
    return null;
  });
