import { build as viteBuild } from 'vite';
import { build as esbuild } from 'esbuild';
import react from '@vitejs/plugin-react';
import { resolve,dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
await viteBuild({root:resolve(root,'source'),configFile:false,plugins:[react()],resolve:{alias:{'next/link':resolve(root,'runtime/next-link.tsx')}},build:{outDir:resolve(root,'public'),emptyOutDir:true}});
await esbuild({entryPoints:[resolve(root,'runtime/server-entry.mjs')],outfile:resolve(root,'server.mjs'),bundle:true,platform:'node',target:'node24',format:'esm',packages:'bundle',external:['mysql2/promise','nodemailer'],alias:{'cloudflare:workers':resolve(root,'runtime/mysql-platform.mjs'),'next/headers':resolve(root,'runtime/request-context.mjs'),'next/navigation':resolve(root,'runtime/next-navigation.mjs')},minify:false,legalComments:'eof'});
console.log('GWL NEXO reconstruído para Hostinger.');
