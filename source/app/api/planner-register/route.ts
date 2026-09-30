import { getChatGPTUser } from "../../chatgpt-auth";
import {
  constantTimeEqual,
  createPontoSession,
  PLATFORM_OWNER_EMAIL,
  PontoDatabase,
  sessionCookie,
  sha256,
  upsertCredential,
} from "../../ponto-auth";

async function database(): Promise<PontoDatabase> {
  const { env } = await import("cloudflare:workers");
  if (!env.DB) throw new Error("Banco do GWL Planner indisponível.");
  return env.DB as unknown as PontoDatabase;
}

const bad = (message: string, status = 400) => Response.json({ error: message }, { status });
const cleanEmail = (value: unknown) => String(value || "").trim().toLowerCase().slice(0, 180);
const CAPTCHA_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

function randomInt(max: number) {
  const value = crypto.getRandomValues(new Uint32Array(1))[0];
  return value % max;
}

function captchaCode() {
  return Array.from({ length: 5 }, () => CAPTCHA_ALPHABET[randomInt(CAPTCHA_ALPHABET.length)]).join("");
}

function captchaSvg(code: string) {
  const letters = code.split("").map((letter, index) => {
    const x = 31 + index * 34;
    const y = 49 + (randomInt(9) - 4);
    const rotation = randomInt(17) - 8;
    return `<text x="${x}" y="${y}" transform="rotate(${rotation} ${x} ${y})">${letter}</text>`;
  }).join("");
  const lines = Array.from({ length: 5 }, () => {
    const x1 = randomInt(200); const y1 = randomInt(68);
    const x2 = randomInt(200); const y2 = randomInt(68);
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
  }).join("");
  const dots = Array.from({ length: 26 }, () =>
    `<circle cx="${randomInt(200)}" cy="${randomInt(68)}" r="${1 + randomInt(2)}"/>`,
  ).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="68" viewBox="0 0 200 68"><defs><linearGradient id="bg" x1="0" x2="1"><stop stop-color="#eef5ff"/><stop offset="1" stop-color="#f7f1ff"/></linearGradient></defs><rect width="200" height="68" rx="12" fill="url(#bg)"/><g stroke="#7389b8" stroke-width="1.3" opacity=".26">${lines}</g><g fill="#4967a5" opacity=".2">${dots}</g><g fill="#15366f" font-family="Arial,sans-serif" font-size="31" font-weight="800" letter-spacing="5">${letters}</g></svg>`;
}

async function requesterHash(request: Request) {
  const ip = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for") || "local";
  const agent = (request.headers.get("user-agent") || "unknown").slice(0, 160);
  return sha256(`${ip}|${agent}`);
}

export async function GET(request: Request) {
  try {
    const user = await getChatGPTUser();
    if (!user?.email) return bad("Verifique seu e-mail antes de continuar.", 401);
    const db = await database();
    const owner = await requesterHash(request);
    await db.prepare("DELETE FROM planner_captcha_challenges WHERE expires_at<=CURRENT_TIMESTAMP OR (used=1 AND created_at<datetime('now','-10 minutes'))").run();
    const recent = await db.prepare("SELECT COUNT(*) AS total FROM planner_captcha_challenges WHERE requester_hash=? AND created_at>datetime('now','-10 minutes')")
      .bind(owner).first<{ total: number }>();
    if (Number(recent?.total || 0) >= 12) return bad("Muitas atualizações do CAPTCHA. Aguarde alguns minutos.", 429);

    const code = captchaCode();
    const id = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    await db.prepare("INSERT INTO planner_captcha_challenges (id,answer_hash,requester_hash,expires_at,used) VALUES (?,?,?,?,0)")
      .bind(id, await sha256(code), owner, expiresAt).run();
    return Response.json(
      { challengeId: id, image: `data:image/svg+xml;base64,${btoa(captchaSvg(code))}`, expiresAt },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return bad(error instanceof Error ? error.message : "Não foi possível gerar o CAPTCHA.", 500);
  }
}

export async function POST(request: Request) {
  try {
    const user = await getChatGPTUser();
    if (!user?.email) return bad("Verifique seu e-mail antes de criar a conta.", 401);
    const body = await request.json() as Record<string, unknown>;
    const rawEmail = String(body.email || "").trim().toLowerCase();
    const email = cleanEmail(body.email);
    const verifiedEmail = cleanEmail(user.email);
    const name = String(body.name || "").trim().replace(/\s+/g, " ").slice(0, 120);
    const phone = String(body.phone || "").trim().slice(0, 30);
    const password = String(body.password || "");
    const confirmation = String(body.confirmPassword || "");
    const challengeId = String(body.challengeId || "").trim();
    const captcha = String(body.captcha || "").trim().toUpperCase();

    const ownerCreatingAccount = verifiedEmail === PLATFORM_OWNER_EMAIL;
    if (rawEmail.length > 180 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(email)) return bad("Informe um endereço de e-mail válido.");
    if (email !== verifiedEmail && !ownerCreatingAccount) return bad("Somente o administrador principal pode cadastrar uma conta para outro e-mail.", 403);
    if (name.length < 3) return bad("Informe seu nome completo.");
    if (password.length < 10 || password.length > 128) return bad("A senha deve ter entre 10 e 128 caracteres.");
    if (password !== confirmation) return bad("A confirmação da senha não confere.");
    if (phone && !/^\+?[0-9 ()-]{8,24}$/.test(phone)) return bad("Informe um telefone válido ou deixe o campo vazio.");
    if (!challengeId || !captcha) return bad("Resolva o CAPTCHA para continuar.");

    const db = await database();
    const challenge = await db.prepare("SELECT * FROM planner_captcha_challenges WHERE id=?")
      .bind(challengeId).first<Record<string, unknown>>();
    if (!challenge || challenge.used || Date.parse(String(challenge.expires_at)) <= Date.now()) {
      return bad("O CAPTCHA expirou. Gere uma nova imagem e tente outra vez.");
    }
    await db.prepare("UPDATE planner_captcha_challenges SET used=1 WHERE id=?").bind(challengeId).run();
    const submittedHash = await sha256(captcha);
    if (!constantTimeEqual(submittedHash, String(challenge.answer_hash))) return bad("O código do CAPTCHA está incorreto.");

    const credentialExists = await db.prepare("SELECT c.id FROM ponto_credentials c JOIN ponto_access_profiles p ON p.id=c.profile_id WHERE lower(c.email)=lower(?) OR lower(p.email)=lower(?)")
      .bind(email, email).first();
    if (credentialExists) return bad("Já existe uma conta com este e-mail. Entre com sua senha.", 409);

    let profile = await db.prepare("SELECT * FROM ponto_access_profiles WHERE lower(email)=lower(?)")
      .bind(email).first<Record<string, unknown>>();
    if (!profile) {
      const result = await db.prepare("INSERT INTO ponto_access_profiles (email,name,phone,role,status) VALUES (?,?,?,'Planner','active')")
        .bind(email, name, phone).run();
      profile = await db.prepare("SELECT * FROM ponto_access_profiles WHERE id=?")
        .bind(result.meta?.last_row_id).first<Record<string, unknown>>();
    } else {
      if (profile.status === "inactive") return bad("Este perfil está inativo. Procure a administração.", 403);
      await db.prepare("UPDATE ponto_access_profiles SET name=?,phone=?,updated_at=CURRENT_TIMESTAMP WHERE id=?")
        .bind(name, phone, profile.id).run();
    }
    if (!profile?.id) return bad("Não foi possível criar o perfil.", 500);

    await upsertCredential(db, Number(profile.id), email, password, false);
    const credential = await db.prepare("SELECT id FROM ponto_credentials WHERE profile_id=?")
      .bind(profile.id).first<{ id: number }>();
    if (!credential?.id) return bad("Não foi possível criar o acesso.", 500);
    const session = await createPontoSession(db, credential.id, request, false);
    return Response.json({ ok: true }, { headers: { "set-cookie": sessionCookie(session.token, session.maxAge) } });
  } catch (error) {
    return bad(error instanceof Error ? error.message : "Não foi possível criar a conta.", 500);
  }
}
