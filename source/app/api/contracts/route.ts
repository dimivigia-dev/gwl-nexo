import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "../../../db";
import { contractActivity, contractCatalog, contractCompetencies } from "../../../db/schema";
import { getChatGPTUser } from "../../chatgpt-auth";

const people = new Set(["Gustavo"]);
const statuses = new Set(["pending", "progress", "done"]);
const deliveryLabels = {
  ccStatus: "Contracheque + Comprovante",
  vaStatus: "Vale-Alimentação",
  fgtsStatus: "FGTS",
  timesheetStatus: "Folha de Ponto",
} as const;
const validMonth = (value: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
const unauthorized = () => Response.json({ error: "Faça login no GWL Flow para continuar." }, { status: 401 });

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Erro inesperado";
  const friendly = message.includes("no such table") ? "O banco de contratos ainda está sendo preparado." : message;
  return Response.json({ error: friendly }, { status: 500 });
}

async function ensureCompetency(db: Awaited<ReturnType<typeof getDb>>, month: string) {
  await db.run(sql`INSERT OR IGNORE INTO contract_competencies (contract_id, reference_month)
    SELECT id, ${month} FROM contract_catalog`);
}

export async function GET(request: Request) {
  if (!(await getChatGPTUser())) return unauthorized();
  try {
    const month = new URL(request.url).searchParams.get("month") || "";
    if (!validMonth(month)) return Response.json({ error: "Selecione uma competência válida." }, { status: 400 });
    const db = await getDb();
    await ensureCompetency(db, month);
    const rows = await db.select({
      id: contractCatalog.id, name: contractCatalog.name, responsible: contractCatalog.responsible,
      notes: contractCatalog.notes, referenceMonth: contractCompetencies.referenceMonth,
      ccStatus: contractCompetencies.ccStatus, vaStatus: contractCompetencies.vaStatus,
      fgtsStatus: contractCompetencies.fgtsStatus, timesheetStatus: contractCompetencies.timesheetStatus,
      updatedAt: contractCompetencies.updatedAt,
    }).from(contractCatalog).innerJoin(contractCompetencies, and(
      eq(contractCompetencies.contractId, contractCatalog.id),
      eq(contractCompetencies.referenceMonth, month),
    )).orderBy(contractCatalog.name);
    const events = await db.select({
      id: contractActivity.id, contractId: contractActivity.contractId, actor: contractActivity.actor,
      description: contractActivity.description, createdAt: contractActivity.createdAt,
      referenceMonth: contractActivity.referenceMonth, contractName: contractCatalog.name,
    }).from(contractActivity).leftJoin(contractCatalog, eq(contractActivity.contractId, contractCatalog.id))
      .orderBy(desc(contractActivity.id)).limit(20);
    return Response.json({ contracts: rows, events });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  if (!(await getChatGPTUser())) return unauthorized();
  try {
    const body = await request.json() as { name?: string; responsible?: string; notes?: string; actor?: string };
    const name = body.name?.trim() || ""; const responsible = body.responsible || "";
    if (!name || !people.has(responsible)) return Response.json({ error: "Preencha o contrato e o responsável." }, { status: 400 });
    const db = await getDb();
    const existing = await db.select({ id: contractCatalog.id }).from(contractCatalog).where(eq(contractCatalog.name, name)).limit(1);
    if (existing.length) return Response.json({ error: "Este contrato já está cadastrado e aparece automaticamente em todas as competências." }, { status: 409 });
    const [created] = await db.insert(contractCatalog).values({ name, responsible, notes: body.notes?.trim() || "" }).returning();
    await db.insert(contractActivity).values({ contractId: created.id, actor: people.has(body.actor || "") ? body.actor! : responsible, description: `Contrato cadastrado e atribuído a ${responsible}. Disponível em todas as competências.` });
    return Response.json({ contract: created }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}

export async function PATCH(request: Request) {
  if (!(await getChatGPTUser())) return unauthorized();
  try {
    const body = await request.json() as { id?: number; month?: string; actor?: string; responsible?: string; field?: keyof typeof deliveryLabels; status?: string; notes?: string };
    if (!body.id || !people.has(body.actor || "")) return Response.json({ error: "Atualização inválida." }, { status: 400 });
    if (body.field && (!Object.hasOwn(deliveryLabels, body.field) || !statuses.has(body.status || ""))) {
      return Response.json({ error: "Etapa ou situação inválida." }, { status: 400 });
    }
    if (body.responsible && !people.has(body.responsible)) return Response.json({ error: "Responsável inválido." }, { status: 400 });
    const db = await getDb();
    const current = await db.select().from(contractCatalog).where(eq(contractCatalog.id, body.id)).limit(1);
    if (!current.length) return Response.json({ error: "Contrato não encontrado." }, { status: 404 });
    let description = "Contrato atualizado.";
    if (body.field && statuses.has(body.status || "")) {
      if (!body.month || !validMonth(body.month)) return Response.json({ error: "Competência inválida." }, { status: 400 });
      await ensureCompetency(db, body.month);
      const statusLabels: Record<string,string> = { pending: "Pendente", progress: "Em andamento", done: "Concluído" };
      await db.update(contractCompetencies).set({ [body.field]: body.status, updatedAt: new Date().toISOString() })
        .where(and(eq(contractCompetencies.contractId, body.id), eq(contractCompetencies.referenceMonth, body.month)));
      description = `${deliveryLabels[body.field]} alterado para ${statusLabels[body.status!]}.`;
    }
    if (body.responsible && people.has(body.responsible)) {
      await db.update(contractCatalog).set({ responsible: body.responsible, updatedAt: new Date().toISOString() }).where(eq(contractCatalog.id, body.id));
      description = `Responsável alterado para ${body.responsible}.`;
    }
    if (typeof body.notes === "string") {
      await db.update(contractCatalog).set({ notes: body.notes.trim(), updatedAt: new Date().toISOString() }).where(eq(contractCatalog.id, body.id));
      description = "Observações atualizadas.";
    }
    await db.insert(contractActivity).values({ contractId: body.id, referenceMonth: body.month || null, actor: body.actor!, description });
    return Response.json({ ok: true });
  } catch (error) { return errorResponse(error); }
}

export async function DELETE(request: Request) {
  if (!(await getChatGPTUser())) return unauthorized();
  try {
    const id = Number(new URL(request.url).searchParams.get("id"));
    if (!id) return Response.json({ error: "Contrato inválido." }, { status: 400 });
    const db = await getDb(); await db.delete(contractCatalog).where(eq(contractCatalog.id, id));
    return Response.json({ ok: true });
  } catch (error) { return errorResponse(error); }
}
