import {access,readFile} from 'node:fs/promises';
for(const file of ['server.cjs','server.mjs','public/index.html','public/ponto-dimivig/index.html','banco_sql/GWL_NEXO_estrutura.sql','banco_sql/GWL_NEXO_HOSTINGER_V2.sql'])await access(new URL('../'+file,import.meta.url));
const packageJson=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'));
if(!packageJson.scripts?.start)throw new Error('Comando de inicialização ausente.');
console.log('Pacote GWL NEXO validado. Use Node.js 24 e configure as variáveis do banco.');
