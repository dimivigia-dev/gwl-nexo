import { pontoIdentity, upsertCredential } from "../../ponto-auth";

type D1 = {
  prepare: (sql: string) => {
    bind: (...values: unknown[]) => any;
    all: <T = Record<string, unknown>>() => Promise<{ results?: T[] }>;
    first: <T = Record<string, unknown>>() => Promise<T | null>;
    run: () => Promise<{ meta?: { last_row_id?: number } }>;
  };
};

async function database(): Promise<D1> {
  const { env } = await import("cloudflare:workers");
  if (!env.DB) throw new Error("Banco do Ponto Dimivig indisponível.");
  return env.DB as unknown as D1;
}

async function storage() {
  const { env } = await import("cloudflare:workers");
  if (!env.BUCKET) throw new Error("Armazenamento de fotos indisponível.");
  return env.BUCKET;
}

function decodeDataUrl(value: unknown, maxBytes: number) {
  const dataUrl = typeof value === "string" ? value : "";
  const match = dataUrl.match(/^data:([^;,]+);base64,(.+)$/);
  if (!match) return null;
  const contentType = clean(match[1], 120);
  const base64 = match[2];
  if (base64.length > Math.ceil(maxBytes * 1.4)) throw new Error("O arquivo excede o limite permitido.");
  const binary = atob(base64);
  if (binary.length > maxBytes) throw new Error("O arquivo excede o limite permitido.");
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return { bytes, contentType };
}

const bad = (message: string, status = 400) =>
  Response.json({ error: message }, { status });
const clean = (value: unknown, max = 180) =>
  String(value ?? "")
    .trim()
    .slice(0, max);
const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);
const recordKinds = new Set([
  "entrada",
  "saida_intervalo",
  "retorno_intervalo",
  "saida",
]);
const occurrenceDefaults = [
  ["ajuste-ponto", "Ajuste de ponto", "Marcações", "ponto", 0],
  ["permuta", "Permuta", "Escala", "escala", 1],
  ["troca-escala", "Troca de escala", "Escala", "escala", 0],
  ["atestado-medico", "Atestado médico", "Saúde", "abono_total", 0],
  ["atestado-acompanhamento", "Atestado de acompanhamento", "Saúde", "abono_total", 0],
  ["declaracao-comparecimento", "Declaração de comparecimento", "Saúde", "abono_parcial", 0],
  ["licenca-medica", "Licença médica", "Licenças", "abono_total", 0],
  ["acidente-trabalho", "Acidente de trabalho", "Licenças", "abono_total", 0],
  ["afastamento-inss", "Afastamento pelo INSS", "Licenças", "abono_total", 0],
  ["falta-justificada", "Falta justificada", "Ausências", "abono_total", 0],
  ["falta-injustificada", "Falta injustificada", "Ausências", "debito", 0],
  ["esquecimento", "Esquecimento de marcação", "Marcações", "ponto", 0],
  ["problema-aplicativo", "Problema no aplicativo", "Marcações", "ponto", 0],
  ["problema-equipamento", "Problema no equipamento", "Marcações", "ponto", 0],
  ["trabalho-externo", "Trabalho externo", "Operação", "informativo", 0],
  ["home-office", "Home office", "Operação", "informativo", 0],
  ["treinamento", "Treinamento / capacitação", "Operação", "abono_total", 0],
  ["reuniao-externa", "Reunião externa", "Operação", "abono_total", 0],
  ["viagem-servico", "Viagem a serviço", "Operação", "abono_total", 0],
  ["hora-extra", "Hora extra autorizada", "Compensação", "credito", 0],
  ["banco-credito", "Banco de horas — crédito", "Compensação", "credito", 0],
  ["banco-debito", "Banco de horas — débito", "Compensação", "debito", 0],
  ["folga-autorizada", "Folga autorizada", "Folgas", "abono_total", 0],
  ["folga-compensatoria", "Folga compensatória", "Folgas", "abono_total", 0],
  ["folga-trabalhada", "Folga trabalhada", "Folgas", "credito", 0],
  ["feriado-trabalhado", "Feriado trabalhado", "Folgas", "credito", 0],
  ["ferias", "Férias", "Licenças", "abono_total", 0],
  ["licenca-maternidade", "Licença-maternidade", "Licenças", "abono_total", 0],
  ["licenca-paternidade", "Licença-paternidade", "Licenças", "abono_total", 0],
  ["licenca-casamento", "Licença casamento (gala)", "Licenças", "abono_total", 0],
  ["licenca-luto", "Licença luto (nojo)", "Licenças", "abono_total", 0],
  ["doacao-sangue", "Doação de sangue", "Ausências legais", "abono_total", 0],
  ["comparecimento-justica", "Comparecimento à Justiça", "Ausências legais", "abono_total", 0],
  ["alistamento", "Alistamento eleitoral ou militar", "Ausências legais", "abono_total", 0],
  ["acompanhamento-familiar", "Acompanhamento familiar", "Ausências legais", "abono_total", 0],
  ["saida-autorizada", "Saída autorizada", "Operação", "abono_parcial", 0],
  ["convocacao", "Convocação", "Operação", "informativo", 0],
  ["sobreaviso", "Sobreaviso", "Operação", "informativo", 0],
  ["suspensao", "Suspensão", "Ausências", "debito", 0],
  ["outro", "Outro", "Outros", "informativo", 0],
] as const;

async function ensureOccurrenceTypes(db: D1) {
  const count = await db.prepare("SELECT count(*) AS total FROM ponto_occurrence_types").first<{ total: number }>();
  if (Number(count?.total || 0) > 0) return;
  for (let index = 0; index < occurrenceDefaults.length; index++) {
    const [code, name, category, effect, related] = occurrenceDefaults[index];
    await db.prepare("INSERT OR IGNORE INTO ponto_occurrence_types (code,name,category,effect,requires_related_employee,status,sort_order) VALUES (?,?,?,?,?,'active',?)").bind(code, name, category, effect, related, index + 1).run();
  }
}

async function upsertPermutaSchedule(db: D1, employee: Record<string, unknown>, date: string, required: boolean, notes: string) {
  await db.prepare("INSERT INTO ponto_schedules (employee_id,work_date,shift,expected_start,expected_break_start,expected_break_end,expected_end,required,notes) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(employee_id,work_date) DO UPDATE SET shift=excluded.shift,expected_start=excluded.expected_start,expected_break_start=excluded.expected_break_start,expected_break_end=excluded.expected_break_end,expected_end=excluded.expected_end,required=excluded.required,notes=excluded.notes")
    .bind(Number(employee.id), date, clean(employee.schedule, 40) || "12x36", clean(employee.expected_start, 5) || "06:00", clean(employee.expected_break_start, 5), clean(employee.expected_break_end, 5), clean(employee.expected_end, 5) || "18:00", required ? 1 : 0, notes).run();
}

async function applyApprovedPermuta(db: D1, justificationId: number, actor: string) {
  const request = await db.prepare("SELECT * FROM ponto_justifications WHERE id=?").bind(justificationId).first<Record<string, unknown>>();
  if (!request || clean(request.kind, 100).toLowerCase() !== "permuta") return;
  const firstId = Number(request.employee_id);
  const secondId = Number(request.related_employee_id);
  const firstDate = clean(request.occurrence_date, 10);
  const secondDate = clean(request.related_date, 10);
  if (!firstId || !secondId || !validDate(firstDate) || !validDate(secondDate)) return;
  const first = await db.prepare("SELECT * FROM ponto_employees WHERE id=?").bind(firstId).first<Record<string, unknown>>();
  const second = await db.prepare("SELECT * FROM ponto_employees WHERE id=?").bind(secondId).first<Record<string, unknown>>();
  if (!first || !second) return;
  await upsertPermutaSchedule(db, first, firstDate, false, `PERMUTA COM ${clean(second.name, 120)} — TRABALHARÁ EM ${secondDate}`);
  await upsertPermutaSchedule(db, first, secondDate, true, `PERMUTA — COBERTURA DE ${clean(second.name, 120)}`);
  await upsertPermutaSchedule(db, second, secondDate, false, `PERMUTA COM ${clean(first.name, 120)} — TRABALHARÁ EM ${firstDate}`);
  await upsertPermutaSchedule(db, second, firstDate, true, `PERMUTA — COBERTURA DE ${clean(first.name, 120)}`);
  await db.prepare("INSERT INTO ponto_audit_events (entity,entity_id,action,before_json,after_json,actor) VALUES ('justification',?,'permuta_apply','',?,?)")
    .bind(justificationId, JSON.stringify({ firstId, firstDate, secondId, secondDate }), actor).run();
}
const radians = (value: number) => (value * Math.PI) / 180;
const distanceMeters = (aLat: number, aLng: number, bLat: number, bLng: number) => {
  const earth = 6371000;
  const dLat = radians(bLat - aLat);
  const dLng = radians(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(radians(aLat)) * Math.cos(radians(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * earth * Math.asin(Math.sqrt(h));
};

async function authorized(request: Request) {
  const db = await database();
  return pontoIdentity(request, db);
}

async function ensureProfile(db: D1, user: { email: string; fullName?: string | null; displayName?: string }) {
  // A conta proprietária do portal é a administradora inicial do Ponto.
  // A identidade vem do cabeçalho autenticado da plataforma, nunca do cliente.
  const isPortalAdministrator = user.email.trim().toLowerCase() === "dimivigia@gmail.com";
  let profile = await db
    .prepare("SELECT * FROM ponto_access_profiles WHERE lower(email)=lower(?)")
    .bind(user.email)
    .first<Record<string, unknown>>();
  if (profile) {
    if (isPortalAdministrator && profile.role !== "Administrador") {
      await db.prepare("UPDATE ponto_access_profiles SET role='Administrador',status='active',updated_at=CURRENT_TIMESTAMP WHERE id=?")
        .bind(profile.id).run();
      profile = await db.prepare("SELECT * FROM ponto_access_profiles WHERE id=?").bind(profile.id).first<Record<string, unknown>>();
    }
    return profile;
  }
  const total = await db
    .prepare("SELECT count(*) AS total FROM ponto_access_profiles")
    .first<{ total: number }>();
  const role = isPortalAdministrator || Number(total?.total || 0) === 0 ? "Administrador" : "Colaborador";
  const result = await db
    .prepare("INSERT INTO ponto_access_profiles (email,name,role,status) VALUES (?,?,?,'active')")
    .bind(user.email, clean(user.fullName || user.displayName), role)
    .run();
  profile = await db
    .prepare("SELECT * FROM ponto_access_profiles WHERE id=?")
    .bind(result.meta?.last_row_id)
    .first<Record<string, unknown>>();
  return profile;
}

export async function GET(request: Request) {
  const user = await authorized(request);
  if (!user) return bad("Faça login no Ponto Dimivig para continuar.", 401);
  try {
    const url = new URL(request.url);
    const entity = url.searchParams.get("entity") || "bootstrap";
    const db = await database();
    const appUser = await ensureProfile(db, user);
    if (appUser?.status === "inactive")
      return bad("Seu acesso ao Ponto Dimivig está inativo.", 403);
    await ensureOccurrenceTypes(db);
    const role = String(appUser?.role || "Colaborador");
    const linkedEmployeeId = Number(appUser?.employee_id) || 0;
    const linkedSiteId = Number(appUser?.site_id) || 0;
    if (entity === "photo") {
      const id = Number(url.searchParams.get("id"));
      const row = await db
        .prepare("SELECT r.photo_key,r.employee_id,e.site_id FROM ponto_records r JOIN ponto_employees e ON e.id=r.employee_id WHERE r.id = ?")
        .bind(id)
        .first<{ photo_key: string | null; employee_id: number; site_id: number | null }>();
      if (!row?.photo_key) return bad("Foto não encontrada.", 404);
      if (role === "Colaborador" && row.employee_id !== linkedEmployeeId) return bad("Acesso negado.", 403);
      if (role === "Cliente" && row.site_id !== linkedSiteId) return bad("Acesso negado.", 403);
      const object = await (await storage()).get(row.photo_key);
      if (!object) return bad("Foto não encontrada.", 404);
      return new Response(object.body, {
        headers: {
          "content-type": "image/jpeg",
          "cache-control": "private, max-age=300",
        },
      });
    }
    if (entity === "justification-evidence") {
      const id = Number(url.searchParams.get("id"));
      const row = await db.prepare("SELECT j.attachment_key,j.attachment_name,j.attachment_content_type,j.employee_id,e.site_id FROM ponto_justifications j JOIN ponto_employees e ON e.id=j.employee_id WHERE j.id=?")
        .bind(id).first<{ attachment_key: string | null; attachment_name: string; attachment_content_type: string; employee_id: number; site_id: number | null }>();
      if (!row?.attachment_key) return bad("Comprovante não encontrado.", 404);
      if (role === "Colaborador" && row.employee_id !== linkedEmployeeId) return bad("Acesso negado.", 403);
      if (role === "Cliente" && row.site_id !== linkedSiteId) return bad("Acesso negado.", 403);
      const object = await (await storage()).get(row.attachment_key);
      if (!object) return bad("Comprovante não encontrado.", 404);
      return new Response(object.body, { headers: { "content-type": row.attachment_content_type || "application/octet-stream", "content-disposition": `inline; filename="${row.attachment_name.replaceAll('"', '')}"`, "cache-control": "private, max-age=300" } });
    }
    if (entity === "signature") {
      const id = Number(url.searchParams.get("id"));
      const row = await db.prepare("SELECT sg.signature_key,sg.employee_id,e.site_id FROM ponto_timesheet_signatures sg JOIN ponto_employees e ON e.id=sg.employee_id WHERE sg.id=?")
        .bind(id).first<{ signature_key: string; employee_id: number; site_id: number | null }>();
      if (!row?.signature_key) return bad("Assinatura não encontrada.", 404);
      if (role === "Colaborador" && row.employee_id !== linkedEmployeeId) return bad("Acesso negado.", 403);
      if (role === "Cliente" && row.site_id !== linkedSiteId) return bad("Acesso negado.", 403);
      const object = await (await storage()).get(row.signature_key);
      if (!object) return bad("Assinatura não encontrada.", 404);
      return new Response(object.body, { headers: { "content-type": "image/png", "cache-control": "private, max-age=300" } });
    }
    if (entity === "document") {
      const id = Number(url.searchParams.get("id"));
      const row = await db.prepare("SELECT d.object_key,d.file_name,d.content_type,d.employee_id,d.site_id,e.site_id AS employee_site_id FROM ponto_documents d LEFT JOIN ponto_employees e ON e.id=d.employee_id WHERE d.id=?").bind(id).first<{ object_key: string; file_name: string; content_type: string; employee_id: number | null; site_id: number | null; employee_site_id: number | null }>();
      if (!row) return bad("Arquivo não encontrado.", 404);
      if (role === "Colaborador" && row.employee_id !== linkedEmployeeId) return bad("Acesso negado.", 403);
      if (role === "Cliente" && row.site_id !== linkedSiteId && row.employee_site_id !== linkedSiteId) return bad("Acesso negado.", 403);
      const object = await (await storage()).get(row.object_key);
      if (!object) return bad("Arquivo não encontrado.", 404);
      return new Response(object.body, { headers: { "content-type": row.content_type, "content-disposition": `inline; filename="${row.file_name.replaceAll('"', '')}"`, "cache-control": "private, max-age=300" } });
    }
    const month = /^\d{4}-\d{2}$/.test(url.searchParams.get("month") || "")
      ? url.searchParams.get("month")!
      : new Date().toISOString().slice(0, 7);
    const monthStart = `${month}-01`;
    const monthEndValue = new Date(`${monthStart}T12:00:00Z`);
    monthEndValue.setUTCMonth(monthEndValue.getUTCMonth() + 1);
    monthEndValue.setUTCDate(0);
    const monthEnd = monthEndValue.toISOString().slice(0, 10);
    const requestedStart = clean(url.searchParams.get("startDate"), 10);
    const requestedEnd = clean(url.searchParams.get("endDate"), 10);
    const startDate = validDate(requestedStart) ? requestedStart : monthStart;
    const endDate = validDate(requestedEnd) ? requestedEnd : monthEnd;
    const rangeDays = Math.floor((Date.parse(`${endDate}T12:00:00Z`) - Date.parse(`${startDate}T12:00:00Z`)) / 86400000);
    if (rangeDays < 0 || rangeDays > 62) return bad("O período da folha deve ter entre 1 e 63 dias.");
    // A jornada noturna pode começar no último dia do período e terminar no dia
    // seguinte. Carregamos uma pequena margem e o consolidado agrupa a saída no
    // cartão do dia da entrada.
    const recordStartValue = new Date(`${startDate}T12:00:00Z`);
    const recordEndValue = new Date(`${endDate}T12:00:00Z`);
    recordStartValue.setUTCDate(recordStartValue.getUTCDate() - 1);
    recordEndValue.setUTCDate(recordEndValue.getUTCDate() + 1);
    const recordsStartDate = recordStartValue.toISOString().slice(0, 10);
    const recordsEndDate = recordEndValue.toISOString().slice(0, 10);
    const documentCompetence = endDate.slice(0, 7);
    const [sites, employees, records, justifications, schedules, documents, profiles, assets, occurrenceTypes, auditEvents, signatures] =
      await Promise.all([
        db.prepare("SELECT * FROM ponto_sites ORDER BY status, name").all(),
        db
          .prepare(
            "SELECT e.*, s.name AS site_name, s.contract, s.company AS company_name, s.cnpj AS company_cnpj FROM ponto_employees e LEFT JOIN ponto_sites s ON s.id=e.site_id ORDER BY e.status, e.name",
          )
          .all(),
        db
          .prepare(
            "SELECT r.*, e.name AS employee_name, e.registration, e.job_title, e.site_id, e.status AS employee_status, s.name AS site_name, s.contract FROM ponto_records r JOIN ponto_employees e ON e.id=r.employee_id LEFT JOIN ponto_sites s ON s.id=e.site_id WHERE substr(r.recorded_at,1,10) BETWEEN ? AND ? ORDER BY r.recorded_at DESC LIMIT 10000",
          )
          .bind(recordsStartDate, recordsEndDate)
          .all(),
        db
          .prepare(
            "SELECT j.*, e.name AS employee_name, re.name AS related_employee_name FROM ponto_justifications j JOIN ponto_employees e ON e.id=j.employee_id LEFT JOIN ponto_employees re ON re.id=j.related_employee_id WHERE (j.occurrence_date<=? AND coalesce(nullif(j.end_date,''),j.occurrence_date)>=?) OR j.status='pending' ORDER BY j.created_at DESC LIMIT 1000",
          )
          .bind(endDate, startDate)
          .all(),
        db
          .prepare(
            "SELECT sc.*, e.name AS employee_name FROM ponto_schedules sc JOIN ponto_employees e ON e.id=sc.employee_id WHERE sc.work_date BETWEEN ? AND ? ORDER BY sc.work_date DESC, e.name LIMIT 5000",
          )
          .bind(startDate, endDate)
          .all(),
        db.prepare("SELECT d.*, e.name AS employee_name, s.name AS site_name FROM ponto_documents d LEFT JOIN ponto_employees e ON e.id=d.employee_id LEFT JOIN ponto_sites s ON s.id=d.site_id WHERE d.competence=? ORDER BY d.created_at DESC LIMIT 500").bind(documentCompetence).all(),
        db.prepare("SELECT p.*, e.name AS employee_name, s.name AS site_name, c.id AS credential_id, c.must_change_password, c.last_login_at FROM ponto_access_profiles p LEFT JOIN ponto_employees e ON e.id=p.employee_id LEFT JOIN ponto_sites s ON s.id=p.site_id LEFT JOIN ponto_credentials c ON c.profile_id=p.id ORDER BY p.status, p.name, p.email").all(),
        db.prepare("SELECT a.*, e.name AS employee_name, s.name AS site_name FROM ponto_assets a LEFT JOIN ponto_employees e ON e.id=a.employee_id LEFT JOIN ponto_sites s ON s.id=a.site_id ORDER BY a.status, a.name").all(),
        db.prepare("SELECT * FROM ponto_occurrence_types ORDER BY status, sort_order, name").all(),
        db.prepare("SELECT * FROM ponto_audit_events ORDER BY created_at DESC LIMIT 500").all(),
        db.prepare("SELECT sg.*,e.name AS employee_name,e.site_id,s.name AS site_name FROM ponto_timesheet_signatures sg JOIN ponto_employees e ON e.id=sg.employee_id LEFT JOIN ponto_sites s ON s.id=e.site_id WHERE sg.start_date<=? AND sg.end_date>=? ORDER BY sg.signed_at DESC LIMIT 1000").bind(endDate, startDate).all(),
      ]);
    const resultRows = <T extends Record<string, unknown>>(query: { results?: T[] }) => query.results || [];
    const employeeRows = resultRows(employees);
    const visibleEmployees = role === "Colaborador" ? employeeRows.filter((item) => Number(item.id) === linkedEmployeeId) : role === "Cliente" ? employeeRows.filter((item) => Number(item.site_id) === linkedSiteId) : employeeRows;
    const visibleRecords = resultRows(records).filter((item) => role === "Colaborador" ? Number(item.employee_id) === linkedEmployeeId : role === "Cliente" ? Number(item.site_id) === linkedSiteId : true);
    const visibleJustifications = resultRows(justifications).filter((item) => role === "Colaborador" ? Number(item.employee_id) === linkedEmployeeId : role === "Cliente" ? visibleEmployees.some((employee) => Number(employee.id) === Number(item.employee_id)) : true);
    const visibleSchedules = resultRows(schedules).filter((item) => role === "Colaborador" ? Number(item.employee_id) === linkedEmployeeId : role === "Cliente" ? visibleEmployees.some((employee) => Number(employee.id) === Number(item.employee_id)) : true);
    const visibleDocuments = resultRows(documents).filter((item) => role === "Colaborador" ? Number(item.employee_id) === linkedEmployeeId : role === "Cliente" ? Number(item.site_id) === linkedSiteId || visibleEmployees.some((employee) => Number(employee.id) === Number(item.employee_id)) : true);
    const visibleSignatures = resultRows(signatures).filter((item) => role === "Colaborador" ? Number(item.employee_id) === linkedEmployeeId : role === "Cliente" ? Number(item.site_id) === linkedSiteId : true);
    return Response.json({
      user,
      appUser,
      month,
      startDate,
      endDate,
      sites: role === "Cliente" ? resultRows(sites).filter((item) => Number(item.id) === linkedSiteId) : role === "Colaborador" ? resultRows(sites).filter((item) => visibleEmployees.some((employee) => Number(employee.site_id) === Number(item.id))) : resultRows(sites),
      employees: visibleEmployees,
      records: visibleRecords,
      justifications: visibleJustifications,
      schedules: visibleSchedules,
      documents: visibleDocuments,
      signatures: visibleSignatures,
      profiles: role === "Administrador" ? resultRows(profiles) : [],
      assets: role === "Administrador" ? resultRows(assets) : [],
      occurrenceTypes: resultRows(occurrenceTypes),
      auditEvents: ["Administrador", "Fiscal"].includes(role) ? resultRows(auditEvents) : [],
    });
  } catch (error) {
    return bad(
      error instanceof Error
        ? error.message
        : "Falha ao carregar o Ponto Dimivig.",
      500,
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const entity = clean(body.entity, 40);
    const user = await authorized(request);
    if (!user) return bad("Faça login no Ponto Dimivig para continuar.", 401);
    const db = await database();
    const appUser = await ensureProfile(db, user);
    if (appUser?.status === "inactive") return bad("Acesso inativo.", 403);
    const role = String(appUser?.role || "Colaborador");
    if (["site", "employee", "profile", "asset", "occurrenceType", "importBatch"].includes(entity) && role !== "Administrador") return bad("Apenas administradores podem realizar esta operação.", 403);
    if (["schedule", "scheduleRange", "document"].includes(entity) && !["Administrador", "Fiscal"].includes(role)) return bad("Apenas a gestão pode realizar esta operação.", 403);
    if (entity === "record" && role === "Colaborador" && Number(body.employeeId) !== Number(appUser?.employee_id)) return bad("Você só pode registrar o próprio ponto.", 403);
    if (entity === "justification" && role === "Colaborador" && Number(body.employeeId) !== Number(appUser?.employee_id)) return bad("Você só pode justificar o próprio ponto.", 403);
    if (entity === "timesheetSignature" && role === "Colaborador" && Number(body.employeeId) !== Number(appUser?.employee_id)) return bad("Você só pode assinar a própria folha.", 403);
    if (["record", "justification", "timesheetSignature"].includes(entity) && role === "Cliente") return bad("Perfil de cliente possui acesso somente para consulta.", 403);
    if (entity === "site") {
      const name = clean(body.name);
      if (!name) return bad("Informe o nome do posto.");
      const result = await db
        .prepare(
          "INSERT INTO ponto_sites (name,contract,city,responsible,company,cnpj,site_type,phone,email,address,address_number,zip_code,rotating,require_photo,require_geo,notes,latitude,longitude,radius_meters,status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        )
        .bind(
          name,
          clean(body.contract),
          clean(body.city),
          clean(body.responsible),
          clean(body.company) || "Dimivig Segurança",
          clean(body.cnpj, 30),
          clean(body.siteType, 60) || "Armado",
          clean(body.phone, 30),
          clean(body.email),
          clean(body.address),
          clean(body.addressNumber, 30),
          clean(body.zipCode, 20),
          body.rotating === true || body.rotating === "true" ? 1 : 0,
          body.requirePhoto === false || body.requirePhoto === "false" ? 0 : 1,
          body.requireGeo === false || body.requireGeo === "false" ? 0 : 1,
          clean(body.notes, 1000),
          clean(body.latitude, 30),
          clean(body.longitude, 30),
          Math.max(50, Number(body.radiusMeters) || 300),
          clean(body.status, 20) || "active",
        )
        .run();
      return Response.json(
        { ok: true, id: result.meta?.last_row_id },
        { status: 201 },
      );
    }
    if (entity === "employee") {
      const name = clean(body.name);
      const registration = clean(body.registration, 40);
      if (!name || !registration) return bad("Informe nome e matrícula.");
      const result = await db
        .prepare(
          "INSERT INTO ponto_employees (name,registration,cpf,job_title,site_id,schedule,admission_date,journey_start_date,ctps_number,ctps_series,pis_pasep,expected_start,expected_break_start,expected_break_end,expected_end,registers_point,email,phone,status,require_photo,require_geo) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        )
        .bind(
          name,
          registration,
          clean(body.cpf, 20),
          clean(body.jobTitle) || "Vigilante",
          Number(body.siteId) || null,
          clean(body.schedule, 30) || "12x36",
          clean(body.admissionDate, 10),
          clean(body.journeyStartDate, 10),
          clean(body.ctpsNumber, 40),
          clean(body.ctpsSeries, 30),
          clean(body.pisPasep, 30),
          clean(body.expectedStart, 5) || "06:00",
          clean(body.expectedBreakStart, 5) || "12:00",
          clean(body.expectedBreakEnd, 5) || "13:00",
          clean(body.expectedEnd, 5) || "18:00",
          body.registersPoint === false || body.registersPoint === "false" ? 0 : 1,
          clean(body.email),
          clean(body.phone, 30),
          "active",
          body.requirePhoto === "true" || body.requirePhoto === true ? 1 : 0,
          body.requireGeo === "true" || body.requireGeo === true ? 1 : 0,
        )
        .run();
      return Response.json(
        { ok: true, id: result.meta?.last_row_id },
        { status: 201 },
      );
    }
    if (entity === "profile") {
      const email = clean(body.email).toLowerCase();
      const name = clean(body.name);
      const profileRole = clean(body.role, 30) || "Colaborador";
      const password = String(body.password || "");
      if (!email || !email.includes("@")) return bad("Informe um e-mail válido para o acesso.");
      if (!["Administrador", "Fiscal", "Colaborador", "Cliente"].includes(profileRole)) return bad("Perfil inválido.");
      if (!password) return bad("Defina uma senha provisória para o primeiro acesso.");
      const result = await db.prepare("INSERT INTO ponto_access_profiles (email,name,role,employee_id,site_id,status) VALUES (?,?,?,?,?,'active')")
        .bind(email, name || email, profileRole, Number(body.employeeId) || null, Number(body.siteId) || null).run();
      const profileId = Number(result.meta?.last_row_id);
      await upsertCredential(db, profileId, email, password, true);
      await db.prepare("INSERT INTO ponto_audit_events (entity,entity_id,action,before_json,after_json,actor) VALUES ('profile',?,'credential_create','',?,?)")
        .bind(profileId, JSON.stringify({ email, role: profileRole, employeeId: Number(body.employeeId) || null }), user.email).run();
      return Response.json({ ok: true, id: profileId }, { status: 201 });
    }
    if (entity === "record") {
      const employeeId = Number(body.employeeId);
      const kind = clean(body.kind, 40);
      const manual = clean(body.source, 20) === "manual" && ["Administrador", "Fiscal"].includes(role);
      if (!employeeId || !recordKinds.has(kind))
        return bad("Registro de ponto inválido.");
      const employee = await db
        .prepare("SELECT * FROM ponto_employees WHERE id=? AND status='active'")
        .bind(employeeId)
        .first<Record<string, unknown>>();
      if (!employee) return bad("Colaborador não encontrado ou inativo.", 404);
      const latitude = Number(body.latitude);
      const longitude = Number(body.longitude);
      if (!manual && (!Number.isFinite(latitude) || !Number.isFinite(longitude)))
        return bad("Ative o GPS: a localização é obrigatória para registrar o ponto.", 422);
      const photo = typeof body.photoDataUrl === "string" ? body.photoDataUrl : "";
      if (!manual && !photo.startsWith("data:image/"))
        return bad("A foto em tempo real é obrigatória para registrar o ponto.", 422);
      if (!manual) {
        if (!employee.site_id) return bad("O colaborador precisa estar vinculado a um posto com geolocalização configurada.", 422);
        const site = await db.prepare("SELECT latitude,longitude,radius_meters FROM ponto_sites WHERE id=?").bind(employee.site_id).first<{ latitude: string; longitude: string; radius_meters: number }>();
        const siteLat = Number(site?.latitude);
        const siteLng = Number(site?.longitude);
        if (!Number.isFinite(siteLat) || !Number.isFinite(siteLng) || (!siteLat && !siteLng)) return bad("O posto ainda não possui coordenadas para validar a cerca.", 422);
        const distance = distanceMeters(latitude, longitude, siteLat, siteLng);
        if (distance > Number(site?.radius_meters || 300)) return bad(`Registro fora da cerca permitida (${Math.round(distance)} m do posto).`, 422);
      }
      const last = await db
        .prepare(
          "SELECT kind, recorded_at FROM ponto_records WHERE employee_id=? AND date(recorded_at)=date(?) ORDER BY recorded_at DESC LIMIT 1",
        )
        .bind(employeeId, clean(body.recordedAt, 40))
        .first<{ kind: string; recorded_at: string }>();
      const sequence: Record<string, string | null> = {
        entrada: null,
        saida_intervalo: "entrada",
        retorno_intervalo: "saida_intervalo",
        saida: "retorno_intervalo",
      };
      if (!manual && (
        (sequence[kind] && last?.kind !== sequence[kind]) ||
        (kind === "entrada" && last)
      ))
        return bad(
          "A sequência da jornada não permite esse registro agora.",
          409,
        );
      let photoKey: string | null = null;
      if (photo.startsWith("data:image/") && photo.includes(",")) {
        const base64 = photo.split(",")[1];
        if (base64.length > 3_000_000)
          return bad("A foto excede o limite permitido.", 413);
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        photoKey = `ponto/fotos/${employeeId}/${crypto.randomUUID()}.jpg`;
        await (
          await storage()
        ).put(photoKey, bytes, { httpMetadata: { contentType: "image/jpeg" } });
      }
      const recordedAt = clean(body.recordedAt, 40) || new Date().toISOString();
      const result = await db
        .prepare(
          "INSERT INTO ponto_records (employee_id,kind,recorded_at,latitude,longitude,accuracy,photo_key,source,status,notes,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
        )
        .bind(
          employeeId,
          kind,
          recordedAt,
          clean(body.latitude, 30),
          clean(body.longitude, 30),
          Math.round(Number(body.accuracy) || 0),
          photoKey,
          manual ? "manual" : "web",
          "valid",
          clean(body.notes, 500),
          user.email,
        )
        .run();
      if (manual && result.meta?.last_row_id) {
        await db.prepare("INSERT INTO ponto_audit_events (entity,entity_id,action,before_json,after_json,actor) VALUES ('record',?,'manual_create','',?,?)").bind(result.meta.last_row_id, JSON.stringify({ employeeId, kind, recordedAt, notes: clean(body.notes, 500) }), user.email).run();
      }
      return Response.json(
        { ok: true, id: result.meta?.last_row_id },
        { status: 201 },
      );
    }
    if (entity === "justification") {
      const employeeId = Number(body.employeeId);
      const date = clean(body.occurrenceDate, 10);
      const reason = clean(body.reason, 1000);
      if (!employeeId || !validDate(date) || !reason)
        return bad("Preencha colaborador, data e justificativa.");
      const kind = clean(body.kind, 100) || "Ajuste de ponto";
      const relatedEmployeeId = Number(body.relatedEmployeeId) || null;
      const relatedDate = clean(body.relatedDate, 10);
      if (relatedEmployeeId === employeeId) return bad("O substituto deve ser outro colaborador.");
      if (relatedEmployeeId && !validDate(relatedDate)) return bad("Informe a data correspondente da troca.");
      const attachment = decodeDataUrl(body.attachmentDataUrl, 8_000_000);
      if (kind.toLowerCase() === "permuta" && (!attachment || !attachment.contentType.startsWith("image/")))
        return bad("A foto do documento ou da escala é obrigatória para lançar uma permuta.", 422);
      let attachmentKey: string | null = null;
      const attachmentName = clean(body.attachmentName, 220);
      if (attachment) {
        if (!attachment.contentType.startsWith("image/") && attachment.contentType !== "application/pdf") return bad("Anexe uma imagem ou PDF válido.", 422);
        attachmentKey = `ponto/justificativas/${employeeId}/${crypto.randomUUID()}`;
        await (await storage()).put(attachmentKey, attachment.bytes, { httpMetadata: { contentType: attachment.contentType } });
      }
      const result = await db
        .prepare(
          "INSERT INTO ponto_justifications (employee_id,occurrence_date,kind,reason,end_date,start_time,end_time,related_employee_id,related_date,attachment_key,attachment_name,attachment_content_type,status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'pending')",
        )
        .bind(
          employeeId,
          date,
          kind,
          reason,
          validDate(clean(body.endDate, 10)) ? clean(body.endDate, 10) : "",
          clean(body.startTime, 5),
          clean(body.endTime, 5),
          relatedEmployeeId,
          validDate(relatedDate) ? relatedDate : "",
          attachmentKey,
          attachmentName,
          attachment?.contentType || "",
        )
        .run();
      return Response.json(
        { ok: true, id: result.meta?.last_row_id },
        { status: 201 },
      );
    }
    if (entity === "timesheetSignature") {
      const employeeId = Number(body.employeeId);
      const startDate = clean(body.startDate, 10);
      const endDate = clean(body.endDate, 10);
      const signedName = clean(body.signedName, 160);
      const signature = decodeDataUrl(body.signatureDataUrl, 1_500_000);
      if (!employeeId || !validDate(startDate) || !validDate(endDate) || startDate > endDate || !signedName || !signature?.contentType.startsWith("image/")) return bad("Confira o período, o nome e a assinatura.");
      const employee = await db.prepare("SELECT id FROM ponto_employees WHERE id=?").bind(employeeId).first<{ id: number }>();
      if (!employee) return bad("Colaborador não encontrado.", 404);
      const previous = await db.prepare("SELECT signature_key FROM ponto_timesheet_signatures WHERE employee_id=? AND start_date=? AND end_date=?").bind(employeeId, startDate, endDate).first<{ signature_key: string }>();
      const signatureKey = `ponto/assinaturas/${employeeId}/${startDate}-${endDate}-${crypto.randomUUID()}.png`;
      await (await storage()).put(signatureKey, signature.bytes, { httpMetadata: { contentType: "image/png" } });
      await db.prepare("INSERT INTO ponto_timesheet_signatures (employee_id,start_date,end_date,signature_key,signed_name,signed_by,status) VALUES (?,?,?,?,?,?,'signed') ON CONFLICT(employee_id,start_date,end_date) DO UPDATE SET signature_key=excluded.signature_key,signed_name=excluded.signed_name,signed_by=excluded.signed_by,signed_at=CURRENT_TIMESTAMP,status='signed'")
        .bind(employeeId, startDate, endDate, signatureKey, signedName, user.email).run();
      if (previous?.signature_key && previous.signature_key !== signatureKey) await (await storage()).delete(previous.signature_key);
      const saved = await db.prepare("SELECT id FROM ponto_timesheet_signatures WHERE employee_id=? AND start_date=? AND end_date=?").bind(employeeId, startDate, endDate).first<{ id: number }>();
      await db.prepare("INSERT INTO ponto_audit_events (entity,entity_id,action,before_json,after_json,actor) VALUES ('timesheet_signature',?,'sign','',?,?)")
        .bind(saved?.id || employeeId, JSON.stringify({ employeeId, startDate, endDate, signedName }), user.email).run();
      return Response.json({ ok: true, id: saved?.id }, { status: 201 });
    }
    if (entity === "importBatch") {
      const siteRows = Array.isArray(body.sites) ? body.sites.slice(0, 500) as Record<string, unknown>[] : [];
      const employeeRows = Array.isArray(body.employees) ? body.employees.slice(0, 500) as Record<string, unknown>[] : [];
      const existingSites = await db.prepare("SELECT id,name,source_system,source_id FROM ponto_sites ORDER BY id").all<{ id: number; name: string; source_system?: string; source_id?: string }>();
      const siteMap = new Map<string, number>();
      const siteSourceMap = new Map<string, number>();
      for (const item of existingSites.results || []) {
        const nameKey = item.name.trim().toLowerCase();
        if (!siteMap.has(nameKey)) siteMap.set(nameKey, item.id);
        if (item.source_system && item.source_id) siteSourceMap.set(`${item.source_system}:${item.source_id}`, item.id);
      }
      let importedSites = 0;
      let updatedSites = 0;
      let importedEmployees = 0;
      let updatedEmployees = 0;
      let skipped = 0;
      for (const row of siteRows) {
        const name = clean(row.name);
        if (!name) { skipped++; continue; }
        const key = name.toLowerCase();
        const sourceSystem = clean(row.sourceSystem, 30) || null;
        const sourceId = clean(row.sourceId, 80) || null;
        const sourceKey = sourceSystem && sourceId ? `${sourceSystem}:${sourceId}` : "";
        const existingId = sourceKey ? siteSourceMap.get(sourceKey) : siteMap.get(key);
        const values = [name, clean(row.contract), clean(row.city), clean(row.responsible), clean(row.company) || "Dimivig Segurança", clean(row.cnpj, 30), clean(row.siteType, 60) || "Armado", clean(row.phone, 30), clean(row.email), clean(row.address), clean(row.addressNumber, 30), clean(row.zipCode, 20), row.requirePhoto === false ? 0 : 1, row.requireGeo === false ? 0 : 1, clean(row.notes, 500), clean(row.latitude, 30), clean(row.longitude, 30), Math.max(50, Number(row.radiusMeters) || 300), clean(row.status, 20) === "inactive" ? "inactive" : "active"];
        if (existingId) {
          await db.prepare("UPDATE ponto_sites SET source_system=coalesce(?,source_system),source_id=coalesce(?,source_id),name=?,contract=?,city=?,responsible=?,company=?,cnpj=?,site_type=?,phone=?,email=?,address=?,address_number=?,zip_code=?,require_photo=?,require_geo=?,notes=?,latitude=?,longitude=?,radius_meters=?,status=? WHERE id=?")
            .bind(sourceSystem, sourceId, ...values, existingId).run();
          if (sourceKey) siteSourceMap.set(sourceKey, existingId);
          updatedSites++;
        } else {
          const result = await db.prepare("INSERT INTO ponto_sites (source_system,source_id,name,contract,city,responsible,company,cnpj,site_type,phone,email,address,address_number,zip_code,require_photo,require_geo,notes,latitude,longitude,radius_meters,status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
            .bind(sourceSystem, sourceId, ...values).run();
          if (result.meta?.last_row_id) { if (!siteMap.has(key)) siteMap.set(key, result.meta.last_row_id); if (sourceKey) siteSourceMap.set(sourceKey, result.meta.last_row_id); importedSites++; }
        }
      }
      const existingEmployees = await db.prepare("SELECT id,registration,source_system,source_id FROM ponto_employees ORDER BY id").all<{ id: number; registration: string; source_system?: string; source_id?: string }>();
      const employeeSourceMap = new Map<string, number>();
      const registrationMap = new Map<string, number>();
      for (const item of existingEmployees.results || []) {
        if (item.source_system && item.source_id) employeeSourceMap.set(`${item.source_system}:${item.source_id}`, item.id);
        const registrationKey = item.registration.trim().toLowerCase();
        if (!registrationMap.has(registrationKey)) registrationMap.set(registrationKey, item.id);
      }
      for (const row of employeeRows) {
        const name = clean(row.name);
        const registration = clean(row.registration, 40);
        if (!name || !registration) { skipped++; continue; }
        const sourceSystem = clean(row.sourceSystem, 30) || null;
        const sourceId = clean(row.sourceId, 80) || null;
        const sourceKey = sourceSystem && sourceId ? `${sourceSystem}:${sourceId}` : "";
        const siteName = clean(row.siteName);
        let siteId = Number(row.siteId) || siteMap.get(siteName.toLowerCase()) || null;
        if (!siteId && siteName && sourceSystem === "tirvu") {
          const fallbackSourceId = siteName.toLowerCase();
          const fallbackKey = `tirvu-lotacao:${fallbackSourceId}`;
          siteId = siteSourceMap.get(fallbackKey) || null;
          if (!siteId) {
            const fallback = await db.prepare("INSERT INTO ponto_sites (source_system,source_id,name,company,status) VALUES ('tirvu-lotacao',?,?,?,'active')")
              .bind(fallbackSourceId, siteName, clean(row.company) || "Dimivig Segurança").run();
            siteId = Number(fallback.meta?.last_row_id) || null;
            if (siteId) { siteSourceMap.set(fallbackKey, siteId); siteMap.set(siteName.toLowerCase(), siteId); importedSites++; }
          }
        }
        const existingId = sourceKey ? employeeSourceMap.get(sourceKey) : registrationMap.get(registration.toLowerCase());
        const values = [name, registration, clean(row.cpf, 20), clean(row.jobTitle) || "Vigilante", siteId, clean(row.schedule, 80) || "12x36", clean(row.admissionDate, 10), clean(row.journeyStartDate, 10), clean(row.expectedStart, 5) || "06:00", clean(row.expectedBreakStart, 5), clean(row.expectedBreakEnd, 5), clean(row.expectedEnd, 5) || "18:00", row.registersPoint === false ? 0 : 1, clean(row.email), clean(row.phone, 30), clean(row.status, 20) === "inactive" ? "inactive" : "active", row.requirePhoto === false ? 0 : 1, row.requireGeo === false ? 0 : 1];
        if (existingId) {
          await db.prepare("UPDATE ponto_employees SET source_system=coalesce(?,source_system),source_id=coalesce(?,source_id),name=?,registration=?,cpf=?,job_title=?,site_id=?,schedule=?,admission_date=?,journey_start_date=?,expected_start=?,expected_break_start=?,expected_break_end=?,expected_end=?,registers_point=?,email=?,phone=?,status=?,require_photo=?,require_geo=?,updated_at=CURRENT_TIMESTAMP WHERE id=?")
            .bind(sourceSystem, sourceId, ...values, existingId).run();
          if (sourceKey) employeeSourceMap.set(sourceKey, existingId);
          updatedEmployees++;
        } else {
          const result = await db.prepare("INSERT INTO ponto_employees (source_system,source_id,name,registration,cpf,job_title,site_id,schedule,admission_date,journey_start_date,expected_start,expected_break_start,expected_break_end,expected_end,registers_point,email,phone,status,require_photo,require_geo) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
            .bind(sourceSystem, sourceId, ...values).run();
          if (result.meta?.last_row_id) { if (sourceKey) employeeSourceMap.set(sourceKey, result.meta.last_row_id); importedEmployees++; } else skipped++;
        }
      }
      await db.prepare("INSERT INTO ponto_audit_events (entity,entity_id,action,before_json,after_json,actor) VALUES ('import',0,'batch_import','',?,?)")
        .bind(JSON.stringify({ importedSites, updatedSites, importedEmployees, updatedEmployees, skipped }), user.email).run();
      return Response.json({ ok: true, importedSites, updatedSites, importedEmployees, updatedEmployees, skipped }, { status: 201 });
    }
    if (entity === "schedule") {
      const employeeId = Number(body.employeeId);
      const date = clean(body.workDate, 10);
      if (!employeeId || !validDate(date))
        return bad("Informe colaborador e data da escala.");
      await db
        .prepare(
          "INSERT INTO ponto_schedules (employee_id,work_date,shift,expected_start,expected_break_start,expected_break_end,expected_end,required,notes) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(employee_id,work_date) DO UPDATE SET shift=excluded.shift,expected_start=excluded.expected_start,expected_break_start=excluded.expected_break_start,expected_break_end=excluded.expected_break_end,expected_end=excluded.expected_end,required=excluded.required,notes=excluded.notes",
        )
        .bind(
          employeeId,
          date,
          clean(body.shift, 30) || "12x36",
          clean(body.expectedStart, 5) || "07:00",
          clean(body.expectedBreakStart, 5) || "12:00",
          clean(body.expectedBreakEnd, 5) || "13:00",
          clean(body.expectedEnd, 5) || "19:00",
          body.required === false || body.required === "false" ? 0 : 1,
          clean(body.notes, 500),
        )
        .run();
      return Response.json({ ok: true }, { status: 201 });
    }
    if (entity === "scheduleRange") {
      const employeeId = Number(body.employeeId);
      const startDate = clean(body.startDate, 10);
      const endDate = clean(body.endDate, 10);
      const anchorDate = validDate(clean(body.anchorDate, 10)) ? clean(body.anchorDate, 10) : startDate;
      const cycle = clean(body.cycle, 30) || "12x36";
      const workDays = Array.isArray(body.workDays) ? body.workDays.map(Number).filter((item) => item >= 0 && item <= 6) : [1, 2, 3, 4, 5];
      if (!employeeId || !validDate(startDate) || !validDate(endDate) || startDate > endDate) return bad("Informe colaborador e período válidos.");
      const totalDays = Math.floor((Date.parse(`${endDate}T12:00:00Z`) - Date.parse(`${startDate}T12:00:00Z`)) / 86400000) + 1;
      if (totalDays < 1 || totalDays > 63) return bad("A escala pode abranger no máximo 63 dias.");
      const employee = await db.prepare("SELECT * FROM ponto_employees WHERE id=?").bind(employeeId).first<Record<string, unknown>>();
      if (!employee) return bad("Colaborador não encontrado.", 404);
      const anchorTime = Date.parse(`${anchorDate}T12:00:00Z`);
      let saved = 0;
      for (let offset = 0; offset < totalDays; offset++) {
        const current = new Date(`${startDate}T12:00:00Z`);
        current.setUTCDate(current.getUTCDate() + offset);
        const date = current.toISOString().slice(0, 10);
        const distance = Math.round((Date.parse(`${date}T12:00:00Z`) - anchorTime) / 86400000);
        const weekday = current.getUTCDay();
        let required = true;
        if (cycle === "12x36") required = Math.abs(distance) % 2 === 0;
        else if (cycle === "6x1") required = ((distance % 7) + 7) % 7 !== 6;
        else if (["44h", "5x2", "semanal", "personalizada"].includes(cycle)) required = workDays.includes(weekday);
        await db.prepare("INSERT INTO ponto_schedules (employee_id,work_date,shift,expected_start,expected_break_start,expected_break_end,expected_end,required,notes) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(employee_id,work_date) DO UPDATE SET shift=excluded.shift,expected_start=excluded.expected_start,expected_break_start=excluded.expected_break_start,expected_break_end=excluded.expected_break_end,expected_end=excluded.expected_end,required=excluded.required,notes=excluded.notes")
          .bind(employeeId, date, clean(body.shift, 40) || String(employee.schedule || cycle), clean(body.expectedStart, 5) || String(employee.expected_start || "06:00"), clean(body.expectedBreakStart, 5), clean(body.expectedBreakEnd, 5), clean(body.expectedEnd, 5) || String(employee.expected_end || "18:00"), required ? 1 : 0, required ? clean(body.notes, 500) : "FOLGA ESCALA").run();
        saved++;
      }
      await db.prepare("INSERT INTO ponto_audit_events (entity,entity_id,action,before_json,after_json,actor) VALUES ('schedule',?,'range_apply','',?,?)").bind(employeeId, JSON.stringify({ startDate, endDate, cycle, workDays, saved }), user.email).run();
      return Response.json({ ok: true, saved }, { status: 201 });
    }
    if (entity === "occurrenceType") {
      const name = clean(body.name, 100);
      if (!name) return bad("Informe o nome do motivo.");
      const code = clean(body.code, 80) || name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const result = await db.prepare("INSERT INTO ponto_occurrence_types (code,name,category,effect,requires_related_employee,status,sort_order) VALUES (?,?,?,?,?,'active',?)")
        .bind(code, name, clean(body.category, 80) || "Outros", clean(body.effect, 40) || "informativo", body.requiresRelatedEmployee === true || body.requiresRelatedEmployee === "true" ? 1 : 0, Number(body.sortOrder) || 999).run();
      return Response.json({ ok: true, id: result.meta?.last_row_id }, { status: 201 });
    }
    if (entity === "document") {
      const fileName = clean(body.fileName, 220);
      const contentType = clean(body.contentType, 120) || "application/octet-stream";
      const competence = clean(body.competence, 7);
      const dataUrl = typeof body.dataUrl === "string" ? body.dataUrl : "";
      if (!fileName || !/^\d{4}-\d{2}$/.test(competence) || !dataUrl.includes(",")) return bad("Selecione um arquivo e informe a competência.");
      const base64 = dataUrl.split(",")[1];
      if (base64.length > 16_000_000) return bad("O arquivo excede o limite de 12 MB.", 413);
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const objectKey = `ponto/documentos/${competence}/${crypto.randomUUID()}-${fileName.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      await (await storage()).put(objectKey, bytes, { httpMetadata: { contentType } });
      const result = await db.prepare("INSERT INTO ponto_documents (employee_id,site_id,kind,file_name,object_key,content_type,size,signed,signed_by,competence,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?)").bind(Number(body.employeeId) || null, Number(body.siteId) || null, clean(body.kind, 80) || "Outro", fileName, objectKey, contentType, bytes.length, body.signed === true || body.signed === "true" ? 1 : 0, clean(body.signedBy), competence, user.email).run();
      return Response.json({ ok: true, id: result.meta?.last_row_id }, { status: 201 });
    }
    if (entity === "asset") {
      const code = clean(body.code, 60);
      const name = clean(body.name);
      if (!code || !name) return bad("Informe código e nome do patrimônio.");
      const result = await db
        .prepare("INSERT INTO ponto_assets (code,name,category,site_id,employee_id,quantity,status,notes) VALUES (?,?,?,?,?,?,?,?)")
        .bind(code, name, clean(body.category, 80) || "Equipamento", Number(body.siteId) || null, Number(body.employeeId) || null, Math.max(1, Number(body.quantity) || 1), clean(body.status, 30) || "available", clean(body.notes, 500))
        .run();
      return Response.json({ ok: true, id: result.meta?.last_row_id }, { status: 201 });
    }
    return bad("Operação desconhecida.");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao salvar.";
    return bad(
      message.includes("UNIQUE")
        ? "Já existe um cadastro com essa matrícula."
        : message,
      message.includes("UNIQUE") ? 409 : 500,
    );
  }
}

export async function PATCH(request: Request) {
  const user = await authorized(request);
  if (!user) return bad("Faça login para continuar.", 401);
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const db = await database();
    const appUser = await ensureProfile(db, user);
    if (appUser?.status === "inactive") return bad("Acesso inativo.", 403);
    const entity = clean(body.entity, 40);
    const role = String(appUser?.role || "Colaborador");
    if (["employee", "site", "profile", "asset", "occurrenceType"].includes(entity) && role !== "Administrador") return bad("Apenas administradores podem realizar esta operação.", 403);
    if (["record", "justification"].includes(entity) && !["Administrador", "Fiscal"].includes(role)) return bad("Apenas a gestão pode realizar esta operação.", 403);
    const id = Number(body.id);
    if (!id) return bad("Registro inválido.");
    if (entity === "justification") {
      const status = clean(body.status, 20);
      if (!new Set(["approved", "rejected", "pending"]).has(status))
        return bad("Status inválido.");
      const before = await db.prepare("SELECT * FROM ponto_justifications WHERE id=?").bind(id).first<Record<string, unknown>>();
      await db
        .prepare(
          "UPDATE ponto_justifications SET status=?,reviewed_by=?,reviewed_at=CURRENT_TIMESTAMP WHERE id=?",
        )
        .bind(status, user.email, id)
        .run();
      if (status === "approved") await applyApprovedPermuta(db, id, user.email);
      const after = await db.prepare("SELECT * FROM ponto_justifications WHERE id=?").bind(id).first<Record<string, unknown>>();
      await db.prepare("INSERT INTO ponto_audit_events (entity,entity_id,action,before_json,after_json,actor) VALUES ('justification',?,'status_update',?,?,?)")
        .bind(id, JSON.stringify(before || {}), JSON.stringify(after || {}), user.email).run();
    } else if (entity === "employee") {
      await db
        .prepare(
          "UPDATE ponto_employees SET name=coalesce(nullif(?,''),name),registration=coalesce(nullif(?,''),registration),cpf=coalesce(?,cpf),job_title=coalesce(nullif(?,''),job_title),site_id=coalesce(?,site_id),schedule=coalesce(nullif(?,''),schedule),admission_date=coalesce(?,admission_date),journey_start_date=coalesce(?,journey_start_date),ctps_number=coalesce(?,ctps_number),ctps_series=coalesce(?,ctps_series),pis_pasep=coalesce(?,pis_pasep),expected_start=coalesce(nullif(?,''),expected_start),expected_break_start=coalesce(nullif(?,''),expected_break_start),expected_break_end=coalesce(nullif(?,''),expected_break_end),expected_end=coalesce(nullif(?,''),expected_end),registers_point=coalesce(?,registers_point),email=coalesce(?,email),phone=coalesce(?,phone),status=coalesce(?,status),require_photo=coalesce(?,require_photo),require_geo=coalesce(?,require_geo),updated_at=CURRENT_TIMESTAMP WHERE id=?",
        )
        .bind(clean(body.name), clean(body.registration, 40), body.cpf === undefined ? null : clean(body.cpf, 20), clean(body.jobTitle), Number(body.siteId) || null, clean(body.schedule, 30), body.admissionDate === undefined ? null : clean(body.admissionDate, 10), body.journeyStartDate === undefined ? null : clean(body.journeyStartDate, 10), body.ctpsNumber === undefined ? null : clean(body.ctpsNumber, 40), body.ctpsSeries === undefined ? null : clean(body.ctpsSeries, 30), body.pisPasep === undefined ? null : clean(body.pisPasep, 30), clean(body.expectedStart, 5), clean(body.expectedBreakStart, 5), clean(body.expectedBreakEnd, 5), clean(body.expectedEnd, 5), body.registersPoint === undefined ? null : body.registersPoint === false || body.registersPoint === "false" ? 0 : 1, body.email === undefined ? null : clean(body.email), body.phone === undefined ? null : clean(body.phone, 30), body.status === undefined ? null : clean(body.status, 20) === "inactive" ? "inactive" : "active", body.requirePhoto === undefined ? null : body.requirePhoto === false || body.requirePhoto === "false" ? 0 : 1, body.requireGeo === undefined ? null : body.requireGeo === false || body.requireGeo === "false" ? 0 : 1, id)
        .run();
    } else if (entity === "site") {
      await db
        .prepare("UPDATE ponto_sites SET status=? WHERE id=?")
        .bind(clean(body.status, 20) === "inactive" ? "inactive" : "active", id)
        .run();
    } else if (entity === "record") {
      const before = await db.prepare("SELECT * FROM ponto_records WHERE id=?").bind(id).first<Record<string, unknown>>();
      await db
        .prepare("UPDATE ponto_records SET status=?,notes=?,recorded_at=coalesce(nullif(?,''),recorded_at) WHERE id=?")
        .bind(clean(body.status, 20) || "valid", clean(body.notes, 500), clean(body.recordedAt, 40), id)
        .run();
      const after = await db.prepare("SELECT * FROM ponto_records WHERE id=?").bind(id).first<Record<string, unknown>>();
      await db.prepare("INSERT INTO ponto_audit_events (entity,entity_id,action,before_json,after_json,actor) VALUES ('record',?,'manual_update',?,?,?)")
        .bind(id, JSON.stringify(before || {}), JSON.stringify(after || {}), user.email).run();
    } else if (entity === "profile") {
      const role = clean(body.role, 30);
      if (!new Set(["Administrador", "Fiscal", "Colaborador", "Cliente"]).has(role)) return bad("Perfil inválido.");
      await db.prepare("UPDATE ponto_access_profiles SET role=?,employee_id=?,site_id=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(role, Number(body.employeeId) || null, Number(body.siteId) || null, clean(body.status, 20) === "inactive" ? "inactive" : "active", id).run();
      if (body.password !== undefined && String(body.password || "")) {
        const profile = await db.prepare("SELECT email FROM ponto_access_profiles WHERE id=?").bind(id).first<{ email: string }>();
        if (!profile) return bad("Perfil não encontrado.", 404);
        await upsertCredential(db, id, profile.email, String(body.password), true);
        await db.prepare("DELETE FROM ponto_sessions WHERE credential_id IN (SELECT id FROM ponto_credentials WHERE profile_id=?)").bind(id).run();
      }
    } else if (entity === "asset") {
      await db.prepare("UPDATE ponto_assets SET site_id=?,employee_id=?,quantity=?,status=?,notes=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(Number(body.siteId) || null, Number(body.employeeId) || null, Math.max(1, Number(body.quantity) || 1), clean(body.status, 30) || "available", clean(body.notes, 500), id).run();
    } else if (entity === "occurrenceType") {
      await db.prepare("UPDATE ponto_occurrence_types SET name=coalesce(nullif(?,''),name),category=coalesce(nullif(?,''),category),effect=coalesce(nullif(?,''),effect),requires_related_employee=coalesce(?,requires_related_employee),status=coalesce(nullif(?,''),status),sort_order=coalesce(?,sort_order) WHERE id=?")
        .bind(clean(body.name, 100), clean(body.category, 80), clean(body.effect, 40), body.requiresRelatedEmployee === undefined ? null : body.requiresRelatedEmployee === true || body.requiresRelatedEmployee === "true" ? 1 : 0, clean(body.status, 20), body.sortOrder === undefined ? null : Number(body.sortOrder), id).run();
    } else return bad("Operação desconhecida.");
    return Response.json({ ok: true });
  } catch (error) {
    return bad(
      error instanceof Error ? error.message : "Falha ao atualizar.",
      500,
    );
  }
}

export async function DELETE(request: Request) {
  const user = await authorized(request);
  if (!user) return bad("Faça login para continuar.", 401);
  try {
    const url = new URL(request.url);
    const entity = url.searchParams.get("entity") || "";
    const id = Number(url.searchParams.get("id"));
    if (!id) return bad("Registro inválido.");
    const db = await database();
    const appUser = await ensureProfile(db, user);
    if (appUser?.status === "inactive") return bad("Acesso inativo.", 403);
    const role = String(appUser?.role || "Colaborador");
    if (!["Administrador", "Fiscal"].includes(role)) return bad("Apenas a gestão pode excluir registros.", 403);
    if (entity === "asset" && role !== "Administrador") return bad("Apenas administradores podem excluir patrimônios.", 403);
    const tables: Record<string, string> = {
      record: "ponto_records",
      schedule: "ponto_schedules",
      justification: "ponto_justifications",
      document: "ponto_documents",
      asset: "ponto_assets",
    };
    if (!tables[entity])
      return bad("Somente registros operacionais podem ser excluídos.");
    if (entity === "document") {
      const row = await db.prepare("SELECT object_key FROM ponto_documents WHERE id=?").bind(id).first<{ object_key: string }>();
      if (row?.object_key) await (await storage()).delete(row.object_key);
    }
    if (entity === "justification") {
      const row = await db.prepare("SELECT attachment_key FROM ponto_justifications WHERE id=?").bind(id).first<{ attachment_key: string | null }>();
      if (row?.attachment_key) await (await storage()).delete(row.attachment_key);
    }
    await db.prepare(`DELETE FROM ${tables[entity]} WHERE id=?`).bind(id).run();
    return Response.json({ ok: true });
  } catch (error) {
    return bad(
      error instanceof Error ? error.message : "Falha ao excluir.",
      500,
    );
  }
}
