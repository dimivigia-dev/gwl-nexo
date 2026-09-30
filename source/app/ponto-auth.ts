import { getChatGPTUser } from "./chatgpt-auth";

export type PontoStatement = {
  bind: (...values: unknown[]) => PontoStatement;
  all: <T = Record<string, unknown>>() => Promise<{ results?: T[] }>;
  first: <T = Record<string, unknown>>() => Promise<T | null>;
  run: () => Promise<{ meta?: { last_row_id?: number } }>;
};

export type PontoDatabase = { prepare: (sql: string) => PontoStatement };

export type PontoIdentity = {
  email: string;
  fullName?: string | null;
  displayName?: string;
  credentialId?: number;
  mustChangePassword?: boolean;
  source: "ponto" | "chatgpt";
};

export const PONTO_COOKIE = "ponto_dimivig_session";
// Cloudflare Workers supports PBKDF2 with at most 100,000 iterations.
export const PASSWORD_ITERATIONS = 100000;
export const PLATFORM_OWNER_EMAIL = process.env.OWNER_EMAIL || "dimivigia@gmail.com";

const encoder = new TextEncoder();

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

export function randomSecret(size = 32) {
  const bytes = crypto.getRandomValues(new Uint8Array(size));
  return bytesToBase64(bytes).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export async function sha256(value: string) {
  return bytesToHex(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value))));
}

export async function passwordDigest(password: string, saltBase64: string, iterations = PASSWORD_ITERATIONS) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: base64ToBytes(saltBase64), iterations },
    key,
    256,
  );
  return bytesToHex(new Uint8Array(bits));
}

export async function passwordMaterial(password: string) {
  if (password.length < 10 || password.length > 128) {
    throw new Error("A senha deve ter entre 10 e 128 caracteres.");
  }
  const salt = bytesToBase64(crypto.getRandomValues(new Uint8Array(18)));
  return { salt, hash: await passwordDigest(password, salt), iterations: PASSWORD_ITERATIONS };
}

export function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index++) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

export function cookieValue(request: Request, name = PONTO_COOKIE) {
  const header = request.headers.get("cookie") || "";
  for (const part of header.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return "";
}

export function sessionCookie(token: string, maxAgeSeconds: number) {
  return `${PONTO_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}

export function clearedSessionCookie() {
  return `${PONTO_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export async function credentialIdentity(request: Request, db: PontoDatabase): Promise<PontoIdentity | null> {
  const token = cookieValue(request);
  if (!token) return null;
  const tokenHash = await sha256(token);
  const row = await db.prepare(
    "SELECT c.id AS credential_id,c.email,c.must_change_password,p.name,p.status,p.role,p.employee_id,p.site_id,s.expires_at FROM ponto_sessions s JOIN ponto_credentials c ON c.id=s.credential_id JOIN ponto_access_profiles p ON p.id=c.profile_id WHERE s.token_hash=? AND s.expires_at>CURRENT_TIMESTAMP",
  ).bind(tokenHash).first<Record<string, unknown>>();
  if (!row || row.status === "inactive") return null;
  await db.prepare("UPDATE ponto_sessions SET last_seen_at=CURRENT_TIMESTAMP WHERE token_hash=?").bind(tokenHash).run();
  return {
    email: String(row.email || ""),
    fullName: String(row.name || row.email || ""),
    displayName: String(row.name || row.email || ""),
    credentialId: Number(row.credential_id),
    mustChangePassword: Boolean(row.must_change_password),
    source: "ponto",
  };
}

export async function pontoIdentity(request: Request, db: PontoDatabase, allowPlatformOwner = true): Promise<PontoIdentity | null> {
  const credential = await credentialIdentity(request, db);
  if (credential) return credential;
  if (!allowPlatformOwner) return null;
  const user = await getChatGPTUser();
  if (!user || user.email.trim().toLowerCase() !== PLATFORM_OWNER_EMAIL) return null;
  return { email: user.email, fullName: user.fullName, displayName: user.displayName, source: "chatgpt" };
}

export async function upsertCredential(db: PontoDatabase, profileId: number, email: string, password: string, mustChange = false) {
  const material = await passwordMaterial(password);
  await db.prepare(
    "INSERT INTO ponto_credentials (profile_id,email,password_hash,password_salt,iterations,must_change_password,failed_attempts,locked_until,updated_at) VALUES (?,?,?,?,?,?,0,NULL,CURRENT_TIMESTAMP) ON CONFLICT(profile_id) DO UPDATE SET email=excluded.email,password_hash=excluded.password_hash,password_salt=excluded.password_salt,iterations=excluded.iterations,must_change_password=excluded.must_change_password,failed_attempts=0,locked_until=NULL,updated_at=CURRENT_TIMESTAMP",
  ).bind(profileId, email.trim().toLowerCase(), material.hash, material.salt, material.iterations, mustChange ? 1 : 0).run();
}

export async function createPontoSession(db: PontoDatabase, credentialId: number, request: Request, remember = false) {
  const token = randomSecret(36);
  const tokenHash = await sha256(token);
  const id = crypto.randomUUID();
  const maxAge = remember ? 60 * 60 * 24 * 30 : 60 * 60 * 12;
  const expiresAt = new Date(Date.now() + maxAge * 1000).toISOString();
  await db.prepare("DELETE FROM ponto_sessions WHERE expires_at<=CURRENT_TIMESTAMP").run();
  await db.prepare("INSERT INTO ponto_sessions (id,credential_id,token_hash,expires_at,user_agent) VALUES (?,?,?,?,?)")
    .bind(id, credentialId, tokenHash, expiresAt, (request.headers.get("user-agent") || "").slice(0, 300)).run();
  return { token, maxAge, expiresAt };
}
