import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const contracts = sqliteTable("contracts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  responsible: text("responsible").notNull(),
  referenceMonth: text("reference_month").notNull(),
  ccStatus: text("cc_status").notNull().default("pending"),
  vaStatus: text("va_status").notNull().default("pending"),
  fgtsStatus: text("fgts_status").notNull().default("pending"),
  notes: text("notes").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("contracts_name_month_unique").on(table.name, table.referenceMonth),
  index("contracts_responsible_idx").on(table.responsible),
  index("contracts_month_idx").on(table.referenceMonth),
]);

export const contractEvents = sqliteTable("contract_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  contractId: integer("contract_id").notNull().references(() => contracts.id, { onDelete: "cascade" }),
  actor: text("actor").notNull(),
  description: text("description").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("events_contract_idx").on(table.contractId)]);

// Cadastro permanente: um contrato existe uma única vez e é projetado em todas
// as competências pelo controle mensal abaixo.
export const contractCatalog = sqliteTable("contract_catalog", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  responsible: text("responsible").notNull(),
  notes: text("notes").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("contract_catalog_name_unique").on(table.name),
  index("contract_catalog_responsible_idx").on(table.responsible),
]);

export const contractCompetencies = sqliteTable("contract_competencies", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  contractId: integer("contract_id").notNull().references(() => contractCatalog.id, { onDelete: "cascade" }),
  referenceMonth: text("reference_month").notNull(),
  ccStatus: text("cc_status").notNull().default("pending"),
  vaStatus: text("va_status").notNull().default("pending"),
  fgtsStatus: text("fgts_status").notNull().default("pending"),
  timesheetStatus: text("timesheet_status").notNull().default("pending"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("contract_competency_unique").on(table.contractId, table.referenceMonth),
  index("contract_competency_month_idx").on(table.referenceMonth),
]);

export const contractActivity = sqliteTable("contract_activity", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  contractId: integer("contract_id").notNull().references(() => contractCatalog.id, { onDelete: "cascade" }),
  referenceMonth: text("reference_month"),
  actor: text("actor").notNull(),
  description: text("description").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("contract_activity_contract_idx").on(table.contractId)]);

export const resultArchives = sqliteTable("result_archives", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  contractId: integer("contract_id").references(() => contractCatalog.id, { onDelete: "set null" }),
  module: text("module").notNull(),
  referenceMonth: text("reference_month").notNull(),
  actor: text("actor").notNull(),
  fileName: text("file_name").notNull(),
  objectKey: text("object_key").notNull(),
  size: integer("size").notNull(),
  contentType: text("content_type").notNull().default("application/zip"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("result_archives_object_key_unique").on(table.objectKey),
  index("result_archives_contract_idx").on(table.contractId),
  index("result_archives_month_idx").on(table.referenceMonth),
]);

export const resultArchiveContracts = sqliteTable("result_archive_contracts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  resultId: integer("result_id").notNull().references(() => resultArchives.id, { onDelete: "cascade" }),
  contractId: integer("contract_id").notNull().references(() => contractCatalog.id, { onDelete: "cascade" }),
}, (table) => [
  uniqueIndex("result_archive_contract_unique").on(table.resultId, table.contractId),
  index("result_archive_contract_result_idx").on(table.resultId),
]);

export const pontoEmployees = sqliteTable("ponto_employees", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sourceSystem: text("source_system"),
  sourceId: text("source_id"),
  name: text("name").notNull(),
  registration: text("registration").notNull(),
  cpf: text("cpf").notNull().default(""),
  jobTitle: text("job_title").notNull().default("Vigilante"),
  siteId: integer("site_id"),
  schedule: text("schedule").notNull().default("12x36"),
  admissionDate: text("admission_date").notNull().default(""),
  journeyStartDate: text("journey_start_date").notNull().default(""),
  ctpsNumber: text("ctps_number").notNull().default(""),
  ctpsSeries: text("ctps_series").notNull().default(""),
  pisPasep: text("pis_pasep").notNull().default(""),
  expectedStart: text("expected_start").notNull().default("06:00"),
  expectedBreakStart: text("expected_break_start").notNull().default("12:00"),
  expectedBreakEnd: text("expected_break_end").notNull().default("13:00"),
  expectedEnd: text("expected_end").notNull().default("18:00"),
  registersPoint: integer("registers_point", { mode: "boolean" }).notNull().default(true),
  email: text("email").notNull().default(""),
  phone: text("phone").notNull().default(""),
  status: text("status").notNull().default("active"),
  requirePhoto: integer("require_photo", { mode: "boolean" }).notNull().default(true),
  requireGeo: integer("require_geo", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("ponto_employee_source_unique").on(table.sourceSystem, table.sourceId),
  index("ponto_employee_registration_idx").on(table.registration),
  index("ponto_employee_site_idx").on(table.siteId),
  index("ponto_employee_status_idx").on(table.status),
]);

export const pontoSites = sqliteTable("ponto_sites", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sourceSystem: text("source_system"),
  sourceId: text("source_id"),
  name: text("name").notNull(),
  contract: text("contract").notNull().default(""),
  city: text("city").notNull().default(""),
  responsible: text("responsible").notNull().default(""),
  company: text("company").notNull().default("Dimivig Segurança"),
  cnpj: text("cnpj").notNull().default(""),
  siteType: text("site_type").notNull().default("Armado"),
  phone: text("phone").notNull().default(""),
  email: text("email").notNull().default(""),
  address: text("address").notNull().default(""),
  addressNumber: text("address_number").notNull().default(""),
  zipCode: text("zip_code").notNull().default(""),
  rotating: integer("rotating", { mode: "boolean" }).notNull().default(false),
  requirePhoto: integer("require_photo", { mode: "boolean" }).notNull().default(true),
  requireGeo: integer("require_geo", { mode: "boolean" }).notNull().default(true),
  notes: text("notes").notNull().default(""),
  latitude: text("latitude").notNull().default(""),
  longitude: text("longitude").notNull().default(""),
  radiusMeters: integer("radius_meters").notNull().default(300),
  status: text("status").notNull().default("active"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("ponto_sites_source_unique").on(table.sourceSystem, table.sourceId),
  index("ponto_sites_status_idx").on(table.status),
]);

export const pontoRecords = sqliteTable("ponto_records", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  employeeId: integer("employee_id").notNull().references(() => pontoEmployees.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  recordedAt: text("recorded_at").notNull(),
  latitude: text("latitude").notNull().default(""),
  longitude: text("longitude").notNull().default(""),
  accuracy: integer("accuracy").notNull().default(0),
  photoKey: text("photo_key"),
  source: text("source").notNull().default("web"),
  status: text("status").notNull().default("valid"),
  notes: text("notes").notNull().default(""),
  createdBy: text("created_by").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("ponto_records_employee_idx").on(table.employeeId),
  index("ponto_records_date_idx").on(table.recordedAt),
]);

export const pontoSchedules = sqliteTable("ponto_schedules", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  employeeId: integer("employee_id").notNull().references(() => pontoEmployees.id, { onDelete: "cascade" }),
  workDate: text("work_date").notNull(),
  shift: text("shift").notNull().default("12x36"),
  expectedStart: text("expected_start").notNull().default("07:00"),
  expectedBreakStart: text("expected_break_start").notNull().default("12:00"),
  expectedBreakEnd: text("expected_break_end").notNull().default("13:00"),
  expectedEnd: text("expected_end").notNull().default("19:00"),
  required: integer("required", { mode: "boolean" }).notNull().default(true),
  notes: text("notes").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("ponto_schedule_employee_date_unique").on(table.employeeId, table.workDate),
  index("ponto_schedule_date_idx").on(table.workDate),
]);

export const pontoJustifications = sqliteTable("ponto_justifications", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  employeeId: integer("employee_id").notNull().references(() => pontoEmployees.id, { onDelete: "cascade" }),
  occurrenceDate: text("occurrence_date").notNull(),
  kind: text("kind").notNull(),
  reason: text("reason").notNull(),
  endDate: text("end_date").notNull().default(""),
  startTime: text("start_time").notNull().default(""),
  endTime: text("end_time").notNull().default(""),
  relatedEmployeeId: integer("related_employee_id").references(() => pontoEmployees.id, { onDelete: "set null" }),
  relatedDate: text("related_date").notNull().default(""),
  attachmentKey: text("attachment_key"),
  attachmentName: text("attachment_name").notNull().default(""),
  attachmentContentType: text("attachment_content_type").notNull().default(""),
  status: text("status").notNull().default("pending"),
  reviewedBy: text("reviewed_by"),
  reviewedAt: text("reviewed_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("ponto_justification_employee_idx").on(table.employeeId),
  index("ponto_justification_status_idx").on(table.status),
]);

export const pontoTimesheetSignatures = sqliteTable("ponto_timesheet_signatures", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  employeeId: integer("employee_id").notNull().references(() => pontoEmployees.id, { onDelete: "cascade" }),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  signatureKey: text("signature_key").notNull(),
  signedName: text("signed_name").notNull(),
  signedBy: text("signed_by").notNull(),
  signedAt: text("signed_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  status: text("status").notNull().default("signed"),
}, (table) => [
  uniqueIndex("ponto_signature_employee_period_unique").on(table.employeeId, table.startDate, table.endDate),
  index("ponto_signature_period_idx").on(table.startDate, table.endDate),
]);

export const pontoOccurrenceTypes = sqliteTable("ponto_occurrence_types", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  code: text("code").notNull(),
  name: text("name").notNull(),
  category: text("category").notNull().default("Outros"),
  effect: text("effect").notNull().default("informativo"),
  requiresRelatedEmployee: integer("requires_related_employee", { mode: "boolean" }).notNull().default(false),
  status: text("status").notNull().default("active"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("ponto_occurrence_types_code_unique").on(table.code),
  uniqueIndex("ponto_occurrence_types_name_unique").on(table.name),
  index("ponto_occurrence_types_status_idx").on(table.status),
]);

export const pontoAuditEvents = sqliteTable("ponto_audit_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  entity: text("entity").notNull(),
  entityId: integer("entity_id").notNull(),
  action: text("action").notNull(),
  beforeJson: text("before_json").notNull().default(""),
  afterJson: text("after_json").notNull().default(""),
  actor: text("actor").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("ponto_audit_entity_idx").on(table.entity, table.entityId),
  index("ponto_audit_created_idx").on(table.createdAt),
]);

export const pontoDocuments = sqliteTable("ponto_documents", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  employeeId: integer("employee_id").references(() => pontoEmployees.id, { onDelete: "set null" }),
  siteId: integer("site_id").references(() => pontoSites.id, { onDelete: "set null" }),
  kind: text("kind").notNull(),
  fileName: text("file_name").notNull(),
  objectKey: text("object_key").notNull(),
  contentType: text("content_type").notNull().default("application/pdf"),
  size: integer("size").notNull().default(0),
  signed: integer("signed", { mode: "boolean" }).notNull().default(false),
  signedBy: text("signed_by").notNull().default(""),
  competence: text("competence").notNull(),
  createdBy: text("created_by").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("ponto_documents_object_key_unique").on(table.objectKey),
  index("ponto_documents_employee_idx").on(table.employeeId),
  index("ponto_documents_competence_idx").on(table.competence),
]);

export const pontoAccessProfiles = sqliteTable("ponto_access_profiles", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  email: text("email").notNull(),
  name: text("name").notNull().default(""),
  phone: text("phone").notNull().default(""),
  role: text("role").notNull().default("Colaborador"),
  plannerRole: text("planner_role").notNull().default(""),
  employeeId: integer("employee_id").references(() => pontoEmployees.id, { onDelete: "set null" }),
  siteId: integer("site_id").references(() => pontoSites.id, { onDelete: "set null" }),
  status: text("status").notNull().default("active"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [uniqueIndex("ponto_access_profiles_email_unique").on(table.email)]);

// Desafios visuais de curta duração usados no cadastro do GWL Planner.
// Somente o hash da resposta é persistido e cada desafio pode ser usado uma vez.
export const plannerCaptchaChallenges = sqliteTable("planner_captcha_challenges", {
  id: text("id").primaryKey(),
  answerHash: text("answer_hash").notNull(),
  requesterHash: text("requester_hash").notNull(),
  expiresAt: text("expires_at").notNull(),
  used: integer("used", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("planner_captcha_expiry_idx").on(table.expiresAt),
  index("planner_captcha_requester_idx").on(table.requesterHash),
]);

// Credenciais próprias do Ponto DIMIVIG. Senhas nunca são armazenadas: cada
// registro guarda somente PBKDF2 + salt individual. A sessão também persiste
// apenas o hash do token enviado no cookie HttpOnly.
export const pontoCredentials = sqliteTable("ponto_credentials", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  profileId: integer("profile_id").notNull().references(() => pontoAccessProfiles.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  passwordHash: text("password_hash").notNull(),
  passwordSalt: text("password_salt").notNull(),
  iterations: integer("iterations").notNull().default(210000),
  mustChangePassword: integer("must_change_password", { mode: "boolean" }).notNull().default(false),
  failedAttempts: integer("failed_attempts").notNull().default(0),
  lockedUntil: text("locked_until"),
  lastLoginAt: text("last_login_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("ponto_credentials_profile_unique").on(table.profileId),
  uniqueIndex("ponto_credentials_email_unique").on(table.email),
]);

export const pontoSessions = sqliteTable("ponto_sessions", {
  id: text("id").primaryKey(),
  credentialId: integer("credential_id").notNull().references(() => pontoCredentials.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  expiresAt: text("expires_at").notNull(),
  userAgent: text("user_agent").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  lastSeenAt: text("last_seen_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("ponto_sessions_token_unique").on(table.tokenHash),
  index("ponto_sessions_credential_idx").on(table.credentialId),
  index("ponto_sessions_expiry_idx").on(table.expiresAt),
]);

export const pontoAssets = sqliteTable("ponto_assets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  code: text("code").notNull(),
  name: text("name").notNull(),
  category: text("category").notNull().default("Equipamento"),
  siteId: integer("site_id").references(() => pontoSites.id, { onDelete: "set null" }),
  employeeId: integer("employee_id").references(() => pontoEmployees.id, { onDelete: "set null" }),
  quantity: integer("quantity").notNull().default(1),
  status: text("status").notNull().default("available"),
  notes: text("notes").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("ponto_assets_code_unique").on(table.code),
  index("ponto_assets_site_idx").on(table.siteId),
]);

// GWL Planner — colaboração, agenda e organização pessoal.
export const plannerTasks = sqliteTable("planner_tasks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ownerEmail: text("owner_email").notNull(),
  title: text("title").notNull(),
  visibility: text("visibility").notNull().default("personal"),
  assigneeEmail: text("assignee_email").notNull().default(""),
  assigneeName: text("assignee_name").notNull().default(""),
  creatorName: text("creator_name").notNull().default(""),
  dueTime: text("due_time").notNull().default(""),
  estimatedMinutes: integer("estimated_minutes").notNull().default(0),
  claimedAt: text("claimed_at").notNull().default(""),
  notes: text("notes").notNull().default(""),
  dueDate: text("due_date").notNull().default(""),
  priority: text("priority").notNull().default("media"),
  status: text("status").notNull().default("pendente"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("planner_tasks_owner_status_idx").on(table.ownerEmail, table.status),
  index("planner_tasks_visibility_assignee_idx").on(table.visibility,table.assigneeEmail),
  index("planner_tasks_due_idx").on(table.dueDate),
]);

export const plannerEvents = sqliteTable("planner_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ownerEmail: text("owner_email").notNull(),
  title: text("title").notNull(),
  eventDate: text("event_date").notNull(),
  eventTime: text("event_time").notNull().default(""),
  emoji: text("emoji").notNull().default("📌"),
  color: text("color").notNull().default("#4f7cff"),
  notes: text("notes").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("planner_events_owner_date_idx").on(table.ownerEmail, table.eventDate)]);

export const plannerThreads = sqliteTable("planner_threads", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  kind: text("kind").notNull().default("group"),
  createdBy: text("created_by").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const plannerThreadMembers = sqliteTable("planner_thread_members", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  threadId: text("thread_id").notNull().references(() => plannerThreads.id, { onDelete: "cascade" }),
  memberEmail: text("member_email").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("planner_thread_member_unique").on(table.threadId, table.memberEmail),
  index("planner_thread_member_email_idx").on(table.memberEmail),
]);

export const plannerMessages = sqliteTable("planner_messages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  threadId: text("thread_id").notNull().references(() => plannerThreads.id, { onDelete: "cascade" }),
  senderEmail: text("sender_email").notNull(),
  senderName: text("sender_name").notNull(),
  body: text("body").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("planner_messages_thread_date_idx").on(table.threadId, table.createdAt), index("planner_messages_thread_id_idx").on(table.threadId, table.id)]);

export const plannerThreadReads = sqliteTable("planner_thread_reads", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  threadId: text("thread_id").notNull().references(() => plannerThreads.id, { onDelete: "cascade" }),
  memberEmail: text("member_email").notNull(),
  lastReadMessageId: integer("last_read_message_id").notNull().default(0),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("planner_thread_reads_member_unique").on(table.threadId, table.memberEmail),
  index("planner_thread_reads_member_idx").on(table.memberEmail),
]);

export const plannerMessageAttachments = sqliteTable("planner_message_attachments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  messageId: integer("message_id").notNull().references(() => plannerMessages.id, { onDelete: "cascade" }),
  fileName: text("file_name").notNull(),
  objectKey: text("object_key").notNull(),
  contentType: text("content_type").notNull().default("application/octet-stream"),
  size: integer("size").notNull().default(0),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("planner_message_attachments_object_key_unique").on(table.objectKey),
  index("planner_message_attachments_message_idx").on(table.messageId),
]);

export const plannerDocuments = sqliteTable("planner_documents", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ownerEmail: text("owner_email").notNull(),
  fileName: text("file_name").notNull(),
  objectKey: text("object_key").notNull(),
  contentType: text("content_type").notNull().default("application/octet-stream"),
  size: integer("size").notNull().default(0),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("planner_documents_object_key_unique").on(table.objectKey),
  index("planner_documents_owner_idx").on(table.ownerEmail),
]);

export const plannerBoards = sqliteTable("planner_boards", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  ownerEmail: text("owner_email").notNull(),
  allowedEmails: text("allowed_emails").notNull().default("[]"),
  payload: text("payload").notNull().default("[]"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("planner_boards_owner_idx").on(table.ownerEmail)]);

export const plannerLinks = sqliteTable("planner_links", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ownerEmail: text("owner_email").notNull(),
  title: text("title").notNull(),
  url: text("url").notNull(),
  kind: text("kind").notNull().default("site"),
  color: text("color").notNull().default("#4f7cff"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("planner_links_owner_idx").on(table.ownerEmail)]);
