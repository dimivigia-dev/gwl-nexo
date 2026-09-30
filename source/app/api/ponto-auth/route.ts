import { getChatGPTUser } from "../../chatgpt-auth";
import {
  clearedSessionCookie,
  constantTimeEqual,
  cookieValue,
  createPontoSession,
  credentialIdentity,
  passwordDigest,
  passwordMaterial,
  PONTO_COOKIE,
  PontoDatabase,
  sessionCookie,
  sha256,
  upsertCredential,
} from "../../ponto-auth";

async function database(): Promise<PontoDatabase> {
  const { env } = await import("cloudflare:workers");
  if (!env.DB) throw new Error("Banco do Ponto DIMIVIG indisponível.");
  return env.DB as unknown as PontoDatabase;
}

const bad = (message: string, status = 400) => Response.json({ error: message }, { status });
const cleanEmail = (value: unknown) => String(value || "").trim().toLowerCase().slice(0, 180);
const ownerEmail = process.env.OWNER_EMAIL || "dimivigia@gmail.com";

async function profileForCredential(db: PontoDatabase, credentialId: number) {
  return db.prepare("SELECT p.*,c.must_change_password,c.last_login_at FROM ponto_credentials c JOIN ponto_access_profiles p ON p.id=c.profile_id WHERE c.id=?")
    .bind(credentialId).first<Record<string, unknown>>();
}

function sessionPayload(identity: Record<string, unknown>, profile: Record<string, unknown>) {
  return {
    authenticated: true,
    user: { email: identity.email, fullName: profile.name || identity.email },
    appUser: profile,
    mustChangePassword: Boolean(profile.must_change_password),
  };
}

export async function GET(request: Request) {
  try {
    const db = await database();
    const credential = await credentialIdentity(request, db);
    if (credential?.credentialId) {
      const profile = await profileForCredential(db, credential.credentialId);
      if (profile) return Response.json(sessionPayload(credential as unknown as Record<string, unknown>, profile));
    }
    const platformUser = await getChatGPTUser();
    let needsSetup = false;
    const canOwnerRecover = platformUser?.email.toLowerCase() === ownerEmail;
    if (canOwnerRecover) {
      const existing = await db.prepare("SELECT id FROM ponto_credentials WHERE lower(email)=lower(?)").bind(ownerEmail).first();
      needsSetup = !existing;
    }
    return Response.json({
      authenticated: false,
      needsSetup,
      canBootstrap: needsSetup && canOwnerRecover,
      canOwnerRecover,
      ownerLogin: canOwnerRecover ? ownerEmail : null,
    });
  } catch (error) {
    return bad(error instanceof Error ? error.message : "Falha ao conferir o acesso.", 500);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const action = String(body.action || "login");
    const db = await database();

    if (action === "bootstrap") {
      const platformUser = await getChatGPTUser();
      if (!platformUser || platformUser.email.toLowerCase() !== ownerEmail) return bad("Somente o proprietário do portal pode ativar o primeiro acesso.", 403);
      const existingCredential = await db.prepare("SELECT id FROM ponto_credentials WHERE lower(email)=lower(?)").bind(ownerEmail).first();
      if (existingCredential) return bad("O acesso administrativo já foi ativado.", 409);
      const password = String(body.password || "");
      await passwordMaterial(password);
      let profile = await db.prepare("SELECT * FROM ponto_access_profiles WHERE lower(email)=lower(?)").bind(ownerEmail).first<Record<string, unknown>>();
      if (!profile) {
        const result = await db.prepare("INSERT INTO ponto_access_profiles (email,name,role,status) VALUES (?,?, 'Administrador','active')")
          .bind(ownerEmail, platformUser.fullName || platformUser.displayName || "Administração DIMIVIG").run();
        profile = await db.prepare("SELECT * FROM ponto_access_profiles WHERE id=?").bind(result.meta?.last_row_id).first<Record<string, unknown>>();
      } else {
        await db.prepare("UPDATE ponto_access_profiles SET role='Administrador',status='active',updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(profile.id).run();
      }
      await upsertCredential(db, Number(profile?.id), ownerEmail, password, false);
      const credential = await db.prepare("SELECT id FROM ponto_credentials WHERE profile_id=?").bind(profile?.id).first<{ id: number }>();
      const session = await createPontoSession(db, Number(credential?.id), request, Boolean(body.remember));
      const savedProfile = await profileForCredential(db, Number(credential?.id));
      return Response.json(sessionPayload({ email: ownerEmail }, savedProfile || profile || {}), { headers: { "set-cookie": sessionCookie(session.token, session.maxAge) } });
    }

    if (action === "ownerReset") {
      const platformUser = await getChatGPTUser();
      if (!platformUser || platformUser.email.toLowerCase() !== ownerEmail) {
        return bad("Somente o proprietário do portal pode redefinir o acesso administrativo principal.", 403);
      }
      const password = String(body.password || "");
      await passwordMaterial(password);
      let profile = await db.prepare("SELECT * FROM ponto_access_profiles WHERE lower(email)=lower(?)")
        .bind(ownerEmail).first<Record<string, unknown>>();
      if (!profile) {
        const result = await db.prepare("INSERT INTO ponto_access_profiles (email,name,role,status) VALUES (?,?, 'Administrador','active')")
          .bind(ownerEmail, platformUser.fullName || platformUser.displayName || "Administração DIMIVIG").run();
        profile = await db.prepare("SELECT * FROM ponto_access_profiles WHERE id=?")
          .bind(result.meta?.last_row_id).first<Record<string, unknown>>();
      } else {
        await db.prepare("UPDATE ponto_access_profiles SET role='Administrador',status='active',updated_at=CURRENT_TIMESTAMP WHERE id=?")
          .bind(profile.id).run();
      }
      await upsertCredential(db, Number(profile?.id), ownerEmail, password, false);
      const credential = await db.prepare("SELECT id FROM ponto_credentials WHERE profile_id=?")
        .bind(profile?.id).first<{ id: number }>();
      if (!credential?.id) return bad("Não foi possível localizar o acesso principal.", 500);
      await db.prepare("DELETE FROM ponto_sessions WHERE credential_id=?").bind(credential.id).run();
      const session = await createPontoSession(db, credential.id, request, Boolean(body.remember));
      const savedProfile = await profileForCredential(db, credential.id);
      return Response.json(sessionPayload({ email: ownerEmail }, savedProfile || profile || {}), {
        headers: { "set-cookie": sessionCookie(session.token, session.maxAge) },
      });
    }

    if (action === "changePassword") {
      const identity = await credentialIdentity(request, db);
      if (!identity?.credentialId) return bad("Sua sessão expirou. Entre novamente.", 401);
      const row = await db.prepare("SELECT * FROM ponto_credentials WHERE id=?").bind(identity.credentialId).first<Record<string, unknown>>();
      if (!row) return bad("Acesso não encontrado.", 404);
      const current = await passwordDigest(String(body.currentPassword || ""), String(row.password_salt), Number(row.iterations));
      if (!constantTimeEqual(current, String(row.password_hash))) return bad("A senha atual não confere.", 401);
      const material = await passwordMaterial(String(body.newPassword || ""));
      await db.prepare("UPDATE ponto_credentials SET password_hash=?,password_salt=?,iterations=?,must_change_password=0,failed_attempts=0,locked_until=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?")
        .bind(material.hash, material.salt, material.iterations, identity.credentialId).run();
      return Response.json({ ok: true });
    }

    const email = cleanEmail(body.email);
    const password = String(body.password || "");
    const accessType = String(body.accessType || "colaborador");
    if (!email || !password) return bad("Informe e-mail ou CPF e a senha.");
    const row = await db.prepare("SELECT c.*,p.name,p.role,p.status,p.employee_id,p.site_id FROM ponto_credentials c JOIN ponto_access_profiles p ON p.id=c.profile_id WHERE lower(c.email)=lower(?)")
      .bind(email).first<Record<string, unknown>>();
    if (!row) return bad("Login ou senha inválidos.", 401);
    if (row.status === "inactive") return bad("Este acesso está inativo. Procure a administração.", 403);
    if (row.locked_until && Date.parse(String(row.locked_until)) > Date.now()) return bad("Acesso temporariamente bloqueado por tentativas inválidas. Tente novamente em alguns minutos.", 429);
    const digest = await passwordDigest(password, String(row.password_salt), Number(row.iterations));
    if (!constantTimeEqual(digest, String(row.password_hash))) {
      const attempts = Number(row.failed_attempts || 0) + 1;
      const lockedUntil = attempts >= 5 ? new Date(Date.now() + 10 * 60 * 1000).toISOString() : null;
      await db.prepare("UPDATE ponto_credentials SET failed_attempts=?,locked_until=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(attempts >= 5 ? 0 : attempts, lockedUntil, row.id).run();
      return bad("Login ou senha inválidos.", 401);
    }
    const administrative = ["Administrador", "Fiscal"].includes(String(row.role));
    if (accessType === "administrativo" && !administrative) return bad("Este usuário não possui perfil administrativo.", 403);
    if (accessType === "colaborador" && String(row.role) !== "Colaborador") return bad("Este usuário não está vinculado a um perfil de colaborador.", 403);
    await db.prepare("UPDATE ponto_credentials SET failed_attempts=0,locked_until=NULL,last_login_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(row.id).run();
    const session = await createPontoSession(db, Number(row.id), request, Boolean(body.remember));
    const profile = await profileForCredential(db, Number(row.id));
    return Response.json(sessionPayload({ email }, profile || row), { headers: { "set-cookie": sessionCookie(session.token, session.maxAge) } });
  } catch (error) {
    return bad(error instanceof Error ? error.message : "Não foi possível entrar.", 500);
  }
}

export async function DELETE(request: Request) {
  try {
    const db = await database();
    const token = cookieValue(request, PONTO_COOKIE);
    if (token) await db.prepare("DELETE FROM ponto_sessions WHERE token_hash=?").bind(await sha256(token)).run();
    return Response.json({ ok: true }, { headers: { "set-cookie": clearedSessionCookie() } });
  } catch {
    return Response.json({ ok: true }, { headers: { "set-cookie": clearedSessionCookie() } });
  }
}
