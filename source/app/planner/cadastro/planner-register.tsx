"use client";

/* eslint-disable @next/next/no-img-element */

import { FormEvent, useEffect, useState } from "react";

type Captcha = { challengeId: string; image: string; expiresAt: string };

async function responseJson(response: Response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Não foi possível concluir o cadastro.");
  return data;
}

export default function PlannerRegister({ verifiedEmail, verifiedName, verificationPath, changeEmailPath, allowOtherEmail }: {
  verifiedEmail: string;
  verifiedName: string;
  verificationPath: string;
  changeEmailPath: string;
  allowOtherEmail: boolean;
}) {
  const [captcha, setCaptcha] = useState<Captcha | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function refreshCaptcha() {
    setCaptcha(null);
    setError("");
    try { setCaptcha(await responseJson(await fetch("/api/planner-register", { cache: "no-store" }))); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível gerar o CAPTCHA."); }
  }

  useEffect(() => {
    if (!verifiedEmail) return;
    let active = true;
    fetch("/api/planner-register", { cache: "no-store" })
      .then(responseJson)
      .then((value) => { if (active) setCaptcha(value); })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Não foi possível gerar o CAPTCHA."); });
    return () => { active = false; };
  }, [verifiedEmail]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!captcha) return;
    setBusy(true); setError("");
    const form = new FormData(event.currentTarget);
    try {
      await responseJson(await fetch("/api/planner-register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: form.get("name"), email: form.get("email"), phone: form.get("phone"),
          password: form.get("password"), confirmPassword: form.get("confirmPassword"),
          captcha: form.get("captcha"), challengeId: captcha.challengeId,
        }),
      }));
      window.location.assign("/planner");
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Não foi possível criar a conta.";
      await refreshCaptcha();
      setError(message);
    } finally { setBusy(false); }
  }

  return <main className="planner-login planner-register">
    <a href="/planner" className="login-back">← Voltar para entrar</a>
    <section>
      <div className="login-art">
        <img src="/gwl-planner-logo.png" alt="GWL Planner" />
        <h1>Crie seu espaço.<br /><em>Planeje melhor.</em></h1>
        <p>Uma conta para organizar tarefas, agenda, documentos e comunicação da equipe.</p>
        <div className="register-benefits"><span>✓ E-mail confirmado</span><span>✓ Senha protegida</span><span>✓ CAPTCHA de uso único</span></div>
      </div>
      {!verifiedEmail ? <div className="verification-card">
        <small>PRIMEIRO PASSO</small>
        <h2>Verifique seu e-mail</h2>
        <p>Confirme sua identidade para garantir que a conta seja criada com um endereço de e-mail válido.</p>
        <a href={verificationPath}>Verificar e-mail e continuar →</a>
        <footer>Depois da confirmação, você voltará automaticamente para concluir o cadastro.</footer>
      </div> : <form onSubmit={submit}>
        <small>NOVA CONTA</small>
        <h2>Cadastre-se no Planner</h2>
        <p className="verified-copy"><b>✓</b> {allowOtherEmail ? "Cadastro administrativo autorizado." : "E-mail verificado com segurança."}</p>
        <label>Nome completo <em>Obrigatório</em><input name="name" type="text" minLength={3} maxLength={120} required autoComplete="name" defaultValue={verifiedName} placeholder="Seu nome completo" /></label>
        <label>{allowOtherEmail ? "E-mail da nova conta" : "E-mail verificado"} <em>Obrigatório</em><input name="email" type="email" required readOnly={!allowOtherEmail} defaultValue={verifiedEmail} autoComplete="email" placeholder="usuario@empresa.com.br" /><span className="verified-email-actions"><small>{allowOtherEmail ? "Como administrador principal, você pode cadastrar outro e-mail." : "Este é o e-mail confirmado na sua conta."}</small>{!allowOtherEmail && <a href={changeEmailPath}>Usar outro e-mail</a>}</span></label>
        <label>Telefone <em className="optional">Opcional</em><input name="phone" type="tel" autoComplete="tel" placeholder="(62) 99999-9999" /></label>
        <div className="register-passwords">
          <label>Senha <em>Obrigatório</em><input name="password" type="password" minLength={10} maxLength={128} required autoComplete="new-password" placeholder="Mínimo de 10 caracteres" /></label>
          <label>Confirmar senha <em>Obrigatório</em><input name="confirmPassword" type="password" minLength={10} maxLength={128} required autoComplete="new-password" placeholder="Repita sua senha" /></label>
        </div>
        <label className="captcha-label">Confirmação de segurança <em>Obrigatório</em><span className="captcha-box">{captcha ? <img src={captcha.image} alt="Código de verificação CAPTCHA" /> : <i>Gerando...</i>}<button type="button" onClick={refreshCaptcha} aria-label="Gerar novo CAPTCHA">↻ Nova imagem</button></span><input name="captcha" type="text" required minLength={5} maxLength={5} autoComplete="off" autoCapitalize="characters" placeholder="Digite os 5 caracteres" /></label>
        {error && <div className="login-error" role="alert">{error}</div>}
        <button disabled={busy || !captcha}>{busy ? "Criando conta..." : "Criar conta e entrar →"}</button>
        <footer>{allowOtherEmail ? "A nova conta será criada com o e-mail e a senha informados acima." : "Ao criar a conta, seus dados ficam vinculados ao e-mail verificado."}</footer>
      </form>}
    </section>
  </main>;
}
