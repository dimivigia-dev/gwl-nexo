import React, {useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import Home from './app/page';
import PlannerApp from './app/planner/planner-app';
import PlannerRegister from './app/planner/cadastro/planner-register';
import About from './app/sobre-nos/page';
import './app/globals.css';
import './app/pdf-editor.css';
import './app/planner/planner.css';
import './app/sobre-nos/sobre-nos.css';
import './hostinger.css';

async function data(response:Response){const value=await response.json();if(!response.ok)throw new Error(value.error||'Não foi possível concluir a operação.');return value;}
async function post(url:string,body:any){return data(await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}));}

function Login(){const[error,setError]=useState('');const[busy,setBusy]=useState(false);
  return <main className="hostinger-access"><a href="/">Voltar ao GWL NEXO</a><section><img src="/gwl-logo.jpg" alt="GWL"/><h1>Entrar no GWL Flow</h1><p>Acesse com a conta administrativa.</p><form onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');const f=new FormData(e.currentTarget);try{await post('/api/ponto-auth',{action:'login',accessType:'administrativo',email:f.get('email'),password:f.get('password'),remember:Boolean(f.get('remember'))});window.location.assign('/gwl');}catch(err:any){setError(err.message);}finally{setBusy(false);}}}><label>E-mail<input type="email" name="email" autoComplete="username" required/></label><label>Senha<input type="password" name="password" autoComplete="current-password" required/></label><label className="hostinger-checkbox"><input type="checkbox" name="remember"/>Manter conectado</label>{error&&<p role="alert" className="hostinger-error">{error}</p>}<button disabled={busy}>{busy?'Entrando...':'Entrar'}</button></form></section></main>;
}
function Flow(){const[state,setState]=useState<any>(null);const[error,setError]=useState('');
  useEffect(()=>{Promise.all([fetch('/api/ponto-auth').then(data),fetch('/api/hostinger-status').then(data)]).then(([auth,status])=>setState({auth,status})).catch(e=>setError(e.message));},[]);
  if(error)return <main className="hostinger-access"><section><h1>Acesso indisponível</h1><p role="alert">{error}</p><a href="/instalar">Configurar primeiro acesso</a></section></main>;
  if(!state)return <main className="hostinger-access"><p>Conferindo o acesso...</p></main>;
  if(!state.status.installed)return <main className="hostinger-access"><section><h1>Configurar o GWL NEXO</h1><p>Ative a conta administrativa para começar.</p><a href="/instalar">Configurar primeiro acesso</a></section></main>;
  if(!state.auth.authenticated)return <Login/>;
  if(state.auth.user.email.toLowerCase()!==state.status.ownerEmail)return <main className="hostinger-access"><section><h1>Acesso administrativo</h1><p>Entre com o administrador principal para abrir o GWL Flow.</p><a href="/signout-with-chatgpt">Trocar de conta</a></section></main>;
  return <Home initialPortal="gwl" userName={state.auth.user.fullName} signOutHref="/signout-with-chatgpt"/>;
}
function Install(){const[status,setStatus]=useState<any>(null);const[error,setError]=useState('');const[busy,setBusy]=useState(false);
  useEffect(()=>{fetch('/api/hostinger-status').then(data).then(setStatus).catch(e=>setError(e.message));},[]);
  return <main className="hostinger-access"><a href="/">Voltar ao GWL NEXO</a><section><img src="/gwl-nexo-logo.svg" alt="GWL NEXO"/><h1>Primeiro acesso</h1>{status?.installed?<><p>O acesso administrativo já foi configurado.</p><a href="/gwl">Entrar no GWL Flow</a></>:<><p>Configure a conta administrativa com o código de instalação definido na hospedagem.</p><form onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');const f=new FormData(e.currentTarget);try{await post('/api/hostinger-setup',Object.fromEntries(f));window.location.assign('/gwl');}catch(err:any){setError(err.message);}finally{setBusy(false);}}}><label>Nome do administrador<input name="name" minLength={3} required autoComplete="name"/></label><label>E-mail administrativo<input value={status?.ownerEmail||''} readOnly/></label><label>Código de instalação<input name="token" type="password" minLength={32} required autoComplete="off"/></label><label>Senha<input name="password" type="password" minLength={10} maxLength={128} required autoComplete="new-password"/></label><label>Confirmar senha<input name="confirmPassword" type="password" minLength={10} required autoComplete="new-password"/></label><button disabled={busy||!status}>{busy?'Salvando...':'Ativar conta administrativa'}</button></form></>}{error&&<p className="hostinger-error" role="alert">{error}</p>}</section></main>;
}
function Register(){const[state,setState]=useState<any>(null);const[error,setError]=useState('');const[busy,setBusy]=useState(false);const[sent,setSent]=useState(false);
  useEffect(()=>{Promise.all([fetch('/api/hostinger-verification').then(data),fetch('/api/ponto-auth').then(data)]).then(([proof,auth])=>setState({proof,auth})).catch(e=>setError(e.message));},[]);
  const admin=state?.auth.authenticated&&state.auth.user.email.toLowerCase()===state.proof.ownerEmail;
  if((state?.proof.email&&!new URLSearchParams(window.location.search).has('outro-email'))||admin)return <PlannerRegister verifiedEmail={admin?state.auth.user.email:state.proof.email} verifiedName={admin?'':''} verificationPath="/planner/cadastro" changeEmailPath="/planner/cadastro?outro-email=1" allowOtherEmail={admin}/>;
  return <main className="hostinger-access"><a href="/planner">Voltar para entrar</a><section><img src="/gwl-planner-logo.png" alt="GWL Planner"/><h1>Confirme seu e-mail</h1>{sent?<p>Enviamos um link de confirmação. Abra o e-mail e acesse o link para concluir seu cadastro.</p>:<form onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');const f=new FormData(e.currentTarget);try{await post('/api/hostinger-email',{email:f.get('email')});setSent(true);}catch(err:any){setError(err.message);}finally{setBusy(false);}}}><label>E-mail<input type="email" name="email" required autoComplete="email"/></label><button disabled={busy}>{busy?'Enviando...':'Enviar link de confirmação'}</button></form>}{error&&<p role="alert" className="hostinger-error">{error}</p>}</section></main>;
}
const path=window.location.pathname.replace(/\/$/,'')||'/';
createRoot(document.getElementById('root')!).render(path==='/gwl'?<Flow/>:path==='/planner/cadastro'?<Register/>:path==='/planner'?<PlannerApp/>:path==='/sobre-nos'?<About/>:path==='/instalar'?<Install/>:<Home/>);
