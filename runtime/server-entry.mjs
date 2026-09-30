import http from 'node:http';
import { Readable } from 'node:stream';
import { readFile, stat } from 'node:fs/promises';
import { resolve, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import nodemailer from 'nodemailer';
import { env, pool, database } from './mysql-platform.mjs';
import { withRequest } from './request-context.mjs';
import { credentialIdentity, upsertCredential, sha256, constantTimeEqual, cookieValue } from '../source/app/ponto-auth.ts';
import * as contracts from '../source/app/api/contracts/route.ts';
import * as results from '../source/app/api/results/route.ts';
import * as ponto from '../source/app/api/ponto/route.ts';
import * as auth from '../source/app/api/ponto-auth/route.ts';
import * as planner from '../source/app/api/planner/route.ts';
import * as register from '../source/app/api/planner-register/route.ts';

export { pool };
const root = dirname(fileURLToPath(import.meta.url));
const publicDir = resolve(root, 'public');
const api = { '/api/contracts': contracts, '/api/results': results, '/api/ponto': ponto, '/api/ponto-auth': auth, '/api/planner': planner, '/api/planner-register': register };
const ownerEmail = (process.env.OWNER_EMAIL || 'dimivigia@gmail.com').trim().toLowerCase();
const json = (data, status = 200, headers) => Response.json(data, {status, headers});
const publicError = (message, status = 400) => json({error:message}, status);
const mime = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.woff2':'font/woff2','.pdf':'application/pdf','.ico':'image/x-icon','.wasm':'application/wasm'};

function configurationError() {
  const missing = ['APP_URL','DB_NAME','DB_USER','DB_PASSWORD'].filter(name => !process.env[name]?.trim());
  if (missing.length) return `Preencha estas variáveis na Hostinger e reinicie a aplicação: ${missing.join(', ')}.`;
  try {
    const url = new URL(process.env.APP_URL);
    if (!['http:','https:'].includes(url.protocol)) throw new Error('URL inválida');
  } catch { return 'APP_URL deve conter o endereço completo do site, começando com https://.'; }
  return null;
}

function databaseError(error) {
  if (error.code === 'ER_ACCESS_DENIED_ERROR') return 'O banco recusou o acesso. Confira DB_USER e DB_PASSWORD na Hostinger e reinicie a aplicação.';
  if (error.code === 'ER_BAD_DB_ERROR') return 'O banco informado não foi encontrado. Confira o nome completo em DB_NAME e reinicie a aplicação.';
  if (error.code === 'ER_NO_SUCH_TABLE') return 'A estrutura do banco está incompleta. Importe GWL_NEXO_HOSTINGER_V2.sql no phpMyAdmin do banco configurado.';
  if (['ECONNREFUSED','ENOTFOUND','ETIMEDOUT','EHOSTUNREACH'].includes(error.code)) return 'Não foi possível conectar ao banco. Confira DB_HOST e DB_PORT na Hostinger e reinicie a aplicação.';
  return 'Não foi possível verificar o banco. Confira as variáveis e a importação do SQL; consulte o erro nos logs da aplicação.';
}

async function profile(identity) {
  if (!identity) return null;
  return env.DB.prepare('SELECT * FROM ponto_access_profiles WHERE lower(email)=lower(?) AND status=\'active\'').bind(identity.email).first();
}
async function installed() {
  const row = await env.DB.prepare('SELECT installed FROM hostinger_install_state WHERE id=1').first();
  return Boolean(row?.installed);
}
async function setup(request) {
  if (!process.env.INSTALL_TOKEN || process.env.INSTALL_TOKEN.length < 32) return publicError('Configure INSTALL_TOKEN com pelo menos 32 caracteres no painel da hospedagem.', 503);
  const body = await request.json();
  if (!constantTimeEqual(String(body.token || ''), process.env.INSTALL_TOKEN)) return publicError('Código de instalação inválido.', 403);
  if (body.password !== body.confirmPassword) return publicError('A confirmação da senha não confere.');
  const name = String(body.name || '').trim().slice(0, 120);
  if (name.length < 3) return publicError('Informe o nome do administrador.');
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [[state]] = await connection.query('SELECT installed FROM hostinger_install_state WHERE id=1 FOR UPDATE');
    if (!state || state.installed) { await connection.rollback(); return publicError('O primeiro acesso já foi configurado.', 409); }
    const db = database(connection);
    let saved = await db.prepare('SELECT id FROM ponto_access_profiles WHERE lower(email)=lower(?)').bind(ownerEmail).first();
    if (!saved) {
      const result = await db.prepare("INSERT INTO ponto_access_profiles(email,name,role,planner_role,status) VALUES (?,?,'Administrador','administrador','active')").bind(ownerEmail, name).run();
      saved = {id:result.meta.last_row_id};
    } else await db.prepare("UPDATE ponto_access_profiles SET name=?,role='Administrador',planner_role='administrador',status='active' WHERE id=?").bind(name, saved.id).run();
    await upsertCredential(db, Number(saved.id), ownerEmail, String(body.password || ''), false);
    await db.prepare('UPDATE hostinger_install_state SET installed=1 WHERE id=1').run();
    await connection.commit();
    return json({ok:true,email:ownerEmail});
  } catch(error) { await connection.rollback(); return publicError(/senha/i.test(error.message) ? error.message : 'Não foi possível configurar o acesso. Confira o banco de dados.', 400); }
  finally { connection.release(); }
}

const verificationCookie = token => `gwl_email_verified=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=1800`;
async function verifiedEmail(request) {
  const token = cookieValue(request, 'gwl_email_verified'); if (!token) return null;
  return env.DB.prepare("SELECT * FROM hostinger_email_verifications WHERE token_hash=? AND confirmed=1 AND used=0 AND expires_at>CURRENT_TIMESTAMP").bind(await sha256(token)).first();
}
async function emailLink(request) {
  if (!process.env.SMTP_HOST || !process.env.SMTP_FROM) return publicError('O envio de e-mail ainda não foi configurado. Procure a administração para cadastrar seu acesso.', 503);
  const body = await request.json();
  const email = String(body.email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 180) return publicError('Informe um e-mail válido.');
  const recent = await env.DB.prepare('SELECT count(*) AS total FROM hostinger_email_verifications WHERE email=? AND created_at>DATE_SUB(UTC_TIMESTAMP(), INTERVAL 10 MINUTE)').bind(email).first();
  if (Number(recent.total) >= 3) return publicError('Aguarde alguns minutos antes de solicitar outro e-mail.',429);
  const token = randomBytes(32).toString('hex'), tokenHash = await sha256(token);
  await env.DB.prepare('INSERT INTO hostinger_email_verifications(token_hash,email,expires_at) VALUES (?,?,?)').bind(tokenHash,email,new Date(Date.now()+30*60*1000).toISOString()).run();
  const transport = nodemailer.createTransport({host:process.env.SMTP_HOST,port:Number(process.env.SMTP_PORT || 587),secure:process.env.SMTP_SECURE === 'true',auth:process.env.SMTP_USER ? {user:process.env.SMTP_USER,pass:process.env.SMTP_PASSWORD}:undefined});
  const link = new URL('/verificar-email', process.env.APP_URL); link.searchParams.set('token',token);
  try { await transport.sendMail({from:process.env.SMTP_FROM,to:email,subject:'Confirme seu e-mail — GWL NEXO',text:`Acesse este link para confirmar seu e-mail e concluir o cadastro no GWL Planner:\n\n${link.href}\n\nO link expira em 30 minutos.`}); }
  catch { await env.DB.prepare('DELETE FROM hostinger_email_verifications WHERE token_hash=?').bind(tokenHash).run(); return publicError('Não foi possível enviar o e-mail. Confira a configuração SMTP.',503); }
  return json({ok:true});
}

export async function handleRequest(request) {
  const url = new URL(request.url);
  if (!['GET','HEAD','OPTIONS'].includes(request.method)) {
    const origin = request.headers.get('origin');
    if (origin && origin !== new URL(process.env.APP_URL || request.url).origin) return publicError('Origem da solicitação inválida.',403);
  }
  if (url.pathname === '/api/hostinger-status') {
    const error = configurationError();
    if (error) return publicError(error,503);
    try { return json({installed:await installed(),ownerEmail}); }
    catch (error) { console.error('Falha ao verificar o banco:',error.code || error.name); return publicError(databaseError(error),503); }
  }
  if (url.pathname === '/api/hostinger-setup') return request.method === 'POST' ? setup(request) : publicError('Método não permitido.',405);
  if (url.pathname === '/api/hostinger-email') return request.method === 'POST' ? emailLink(request) : publicError('Método não permitido.',405);
  if (url.pathname === '/api/hostinger-verification') {
    const verification = await verifiedEmail(request);
    return json({email:verification?.email || '',ownerEmail});
  }
  if (url.pathname === '/verificar-email') {
    const token = url.searchParams.get('token') || '';
    if (!/^[a-f0-9]{64}$/.test(token)) return publicError('Link de confirmação inválido.',400);
    const result = await env.DB.prepare('UPDATE hostinger_email_verifications SET confirmed=1 WHERE token_hash=? AND used=0 AND expires_at>CURRENT_TIMESTAMP').bind(await sha256(token)).run();
    if (!result.meta.changes) return publicError('Este link expirou ou já foi utilizado. Solicite outro e-mail.',400);
    return new Response(null,{status:303,headers:{location:'/planner/cadastro','set-cookie':verificationCookie(token)}});
  }
  if (url.pathname === '/signout-with-chatgpt') {
    await auth.DELETE(request);
    return new Response(null,{status:303,headers:{location:'/', 'set-cookie':'ponto_dimivig_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0'}});
  }
  if (url.pathname === '/signin-with-chatgpt') return new Response(null,{status:303,headers:{location:'/gwl'}});
  const handlers = api[url.pathname];
  if (handlers) {
    const requestHeaders = new Headers(request.headers);
    for (const name of [...requestHeaders.keys()]) if (name.startsWith('oai-')) requestHeaders.delete(name);
    const identity = await credentialIdentity(request,env.DB);
    const userProfile = await profile(identity);
    if (['/api/contracts','/api/results'].includes(url.pathname) && (!identity || identity.email.toLowerCase() !== ownerEmail)) return publicError('Entre com o usuário administrativo do GWL Flow.',401);
    const verification = url.pathname === '/api/planner-register' ? await verifiedEmail(request) : null;
    const trustedEmail = identity?.email || verification?.email;
    if (trustedEmail) {
      requestHeaders.set('oai-authenticated-user-email',trustedEmail);
      requestHeaders.set('oai-authenticated-user-full-name',encodeURIComponent(identity?.fullName || trustedEmail));
      requestHeaders.set('oai-authenticated-user-full-name-encoding','percent-encoded-utf-8');
    }
    const trustedRequest = new Request(request,{headers:requestHeaders});
    return withRequest(trustedRequest,async()=>{
      if (url.pathname === '/api/ponto-auth' && request.method === 'POST') {
        const body = await trustedRequest.clone().json();
        if (['bootstrap','ownerReset'].includes(body.action) && (!identity || identity.email.toLowerCase() !== ownerEmail)) return publicError('Use a configuração de primeiro acesso para ativar o administrador.',403);
      }
      const handler = handlers[request.method];
      if (!handler) return publicError('Método não permitido.',405);
      const response = await handler(trustedRequest);
      if (verification && request.method === 'POST' && response.ok) await env.DB.prepare('UPDATE hostinger_email_verifications SET used=1 WHERE token_hash=?').bind(verification.token_hash).run();
      return response;
    });
  }
  if (url.pathname.startsWith('/api/')) return publicError('Recurso não encontrado.',404);
  let file = resolve(publicDir, '.' + decodeURIComponent(url.pathname));
  if (!file.startsWith(publicDir + '/') && file !== publicDir) return new Response('Not found',{status:404});
  try { if ((await stat(file)).isDirectory()) file = resolve(file,'index.html'); await stat(file); }
  catch { file = resolve(publicDir,'index.html'); }
  const contentType = mime[extname(file)] || 'application/octet-stream';
  const immutable = /\/assets\//.test(file) && !file.includes('/ponto-dimivig/');
  return new Response(await readFile(file),{headers:{'content-type':contentType,'cache-control':immutable?'public, max-age=31536000, immutable':'no-cache','x-content-type-options':'nosniff'}});
}

export function createApplication() {
  return http.createServer(async(incoming,outgoing)=>{
    try {
      let base = 'http://localhost:3000';
      try { const url = new URL(process.env.APP_URL); if (['http:','https:'].includes(url.protocol)) base=url.href; } catch {}
      if (Number(incoming.headers['content-length'] || 0) > 150*1024*1024) { outgoing.writeHead(413,{'content-type':'application/json'}); outgoing.end(JSON.stringify({error:'O arquivo excede o limite de 150 MB.'})); return; }
      const init = {method:incoming.method,headers:incoming.headers};
      if (!['GET','HEAD'].includes(incoming.method)) { init.body=Readable.toWeb(incoming);init.duplex='half'; }
      const response = await handleRequest(new Request(new URL(incoming.url,base),init));
      outgoing.statusCode=response.status;
      for (const [name,value] of response.headers) if (name !== 'set-cookie') outgoing.setHeader(name,value);
      const cookies=response.headers.getSetCookie();if(cookies.length)outgoing.setHeader('set-cookie',cookies);
      if (incoming.method === 'HEAD' || !response.body) outgoing.end();
      else Readable.fromWeb(response.body).on('error',()=>outgoing.destroy()).pipe(outgoing);
    } catch(error) { console.error('Falha ao atender solicitação:',error.code || error.name); if(!outgoing.headersSent){outgoing.writeHead(500,{'content-type':'application/json'});outgoing.end(JSON.stringify({error:'Não foi possível concluir a operação. Confira a configuração da hospedagem.'}));}else outgoing.destroy(); }
  });
}

let application;
export function startApplication() {
  if (application) return application;
  const error = configurationError();
  if (error) console.warn('Configuração pendente:',error);
  application=createApplication();
  application.on('error',error=>{console.error('Falha ao iniciar servidor:',error.code || error.name);process.exitCode=1;});
  application.listen(Number(process.env.PORT || 3000),'0.0.0.0',()=>console.log('GWL NEXO iniciado.'));
  return application;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) startApplication();
