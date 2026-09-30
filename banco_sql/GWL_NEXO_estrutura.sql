-- GWL NEXO 2.0 - versão 80 - esquema MySQL/MariaDB para instalação nova.

-- Não inclui registros ou anexos do ambiente Sites. Não contém DROP TABLE.
-- Tabelas referenciadas são criadas antes das tabelas que dependem delas.
-- A importação não precisa desativar a validação de chaves estrangeiras.

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS `contract_catalog` (
  `id` INTEGER PRIMARY KEY AUTO_INCREMENT,
  `name` VARCHAR(191) NOT NULL,
  `responsible` VARCHAR(191) NOT NULL,
  `notes` LONGTEXT NOT NULL DEFAULT (''),
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY `contract_catalog_responsible_idx` (`responsible`),
  UNIQUE KEY `contract_catalog_name_unique` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS `contract_activity` (
  `id` INTEGER PRIMARY KEY AUTO_INCREMENT,
  `contract_id` INTEGER NOT NULL,
  `reference_month` LONGTEXT,
  `actor` LONGTEXT NOT NULL,
  `description` LONGTEXT NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY `contract_activity_contract_idx` (`contract_id`),
  FOREIGN KEY (`contract_id`) REFERENCES `contract_catalog` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS `contract_competencies` (
  `id` INTEGER PRIMARY KEY AUTO_INCREMENT,
  `contract_id` INTEGER NOT NULL,
  `reference_month` VARCHAR(191) NOT NULL,
  `cc_status` LONGTEXT NOT NULL DEFAULT ('pending'),
  `va_status` LONGTEXT NOT NULL DEFAULT ('pending'),
  `fgts_status` LONGTEXT NOT NULL DEFAULT ('pending'),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `timesheet_status` LONGTEXT NOT NULL DEFAULT ('pending'),
  KEY `contract_competency_month_idx` (`reference_month`),
  UNIQUE KEY `contract_competency_unique` (`contract_id`,`reference_month`),
  FOREIGN KEY (`contract_id`) REFERENCES `contract_catalog` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS `contracts` (
  `id` INTEGER PRIMARY KEY AUTO_INCREMENT,
  `name` VARCHAR(191) NOT NULL,
  `responsible` VARCHAR(191) NOT NULL,
  `reference_month` VARCHAR(191) NOT NULL,
  `cc_status` LONGTEXT NOT NULL DEFAULT ('pending'),
  `va_status` LONGTEXT NOT NULL DEFAULT ('pending'),
  `fgts_status` LONGTEXT NOT NULL DEFAULT ('pending'),
  `notes` LONGTEXT NOT NULL DEFAULT (''),
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY `contracts_month_idx` (`reference_month`),
  KEY `contracts_responsible_idx` (`responsible`),
  UNIQUE KEY `contracts_name_month_unique` (`name`,`reference_month`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS `contract_events` (
  `id` INTEGER PRIMARY KEY AUTO_INCREMENT,
  `contract_id` INTEGER NOT NULL,
  `actor` LONGTEXT NOT NULL,
  `description` LONGTEXT NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY `events_contract_idx` (`contract_id`),
  FOREIGN KEY (`contract_id`) REFERENCES `contracts` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS `planner_boards` (
  `id` VARCHAR(191) PRIMARY KEY,
  `title` LONGTEXT NOT NULL,
  `owner_email` VARCHAR(191) NOT NULL,
  `allowed_emails` LONGTEXT NOT NULL DEFAULT ('[]'),
  `payload` LONGTEXT NOT NULL DEFAULT ('[]'),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY `planner_boards_owner_idx` (`owner_email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS `planner_captcha_challenges` (
  `id` VARCHAR(191) PRIMARY KEY,
  `answer_hash` LONGTEXT NOT NULL,
  `requester_hash` VARCHAR(191) NOT NULL,
  `expires_at` VARCHAR(191) NOT NULL,
  `used` INTEGER NOT NULL DEFAULT false,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY `planner_captcha_requester_idx` (`requester_hash`),
  KEY `planner_captcha_expiry_idx` (`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS `planner_documents` (
  `id` INTEGER PRIMARY KEY AUTO_INCREMENT,
  `owner_email` VARCHAR(191) NOT NULL,
  `file_name` LONGTEXT NOT NULL,
  `object_key` VARCHAR(191) NOT NULL,
  `content_type` LONGTEXT NOT NULL DEFAULT ('application/octet-stream'),
  `size` INTEGER NOT NULL DEFAULT 0,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY `planner_documents_owner_idx` (`owner_email`),
  UNIQUE KEY `planner_documents_object_key_unique` (`object_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS `planner_events` (
  `id` INTEGER PRIMARY KEY AUTO_INCREMENT,
  `owner_email` VARCHAR(191) NOT NULL,
  `title` LONGTEXT NOT NULL,
  `event_date` VARCHAR(191) NOT NULL,
  `event_time` LONGTEXT NOT NULL DEFAULT (''),
  `emoji` LONGTEXT NOT NULL DEFAULT ('📌'),
  `color` LONGTEXT NOT NULL DEFAULT ('#4f7cff'),
  `notes` LONGTEXT NOT NULL DEFAULT (''),
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY `planner_events_owner_date_idx` (`owner_email`,`event_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS `planner_links` (
  `id` INTEGER PRIMARY KEY AUTO_INCREMENT,
  `owner_email` VARCHAR(191) NOT NULL,
  `title` LONGTEXT NOT NULL,
  `url` LONGTEXT NOT NULL,
  `kind` LONGTEXT NOT NULL DEFAULT ('site'),
  `color` LONGTEXT NOT NULL DEFAULT ('#4f7cff'),
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY `planner_links_owner_idx` (`owner_email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS `planner_threads` (
  `id` VARCHAR(191) PRIMARY KEY,
  `title` LONGTEXT NOT NULL,
  `kind` LONGTEXT NOT NULL DEFAULT ('group'),
  `created_by` LONGTEXT NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS `planner_messages` (
  `id` INTEGER PRIMARY KEY AUTO_INCREMENT,
  `thread_id` VARCHAR(191) NOT NULL,
  `sender_email` LONGTEXT NOT NULL,
  `sender_name` LONGTEXT NOT NULL,
  `body` LONGTEXT NOT NULL,
  `created_at` VARCHAR(191) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY `planner_messages_thread_id_idx` (`thread_id`,`id`),
  KEY `planner_messages_thread_date_idx` (`thread_id`,`created_at`),
  FOREIGN KEY (`thread_id`) REFERENCES `planner_threads` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS `planner_message_attachments` (
  `id` INTEGER PRIMARY KEY AUTO_INCREMENT,
  `message_id` INTEGER NOT NULL,
  `file_name` LONGTEXT NOT NULL,
  `object_key` VARCHAR(191) NOT NULL,
  `content_type` LONGTEXT NOT NULL DEFAULT ('application/octet-stream'),
  `size` INTEGER NOT NULL DEFAULT 0,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY `planner_message_attachments_message_idx` (`message_id`),
  UNIQUE KEY `planner_message_attachments_object_key_unique` (`object_key`),
  FOREIGN KEY (`message_id`) REFERENCES `planner_messages` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS `planner_tasks` (
  `id` INTEGER PRIMARY KEY AUTO_INCREMENT,
  `owner_email` VARCHAR(191) NOT NULL,
  `title` LONGTEXT NOT NULL,
  `notes` LONGTEXT NOT NULL DEFAULT (''),
  `due_date` VARCHAR(191) NOT NULL DEFAULT '',
  `priority` LONGTEXT NOT NULL DEFAULT ('media'),
  `status` VARCHAR(191) NOT NULL DEFAULT 'pendente',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `visibility` VARCHAR(191) NOT NULL DEFAULT 'personal',
  `assignee_email` VARCHAR(191) NOT NULL DEFAULT '',
  `assignee_name` LONGTEXT NOT NULL DEFAULT (''),
  `creator_name` LONGTEXT NOT NULL DEFAULT (''),
  `due_time` LONGTEXT NOT NULL DEFAULT (''),
  `estimated_minutes` INTEGER NOT NULL DEFAULT 0,
  `claimed_at` LONGTEXT NOT NULL DEFAULT (''),
  KEY `planner_tasks_visibility_assignee_idx` (`visibility`,`assignee_email`),
  KEY `planner_tasks_due_idx` (`due_date`),
  KEY `planner_tasks_owner_status_idx` (`owner_email`,`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS `planner_thread_members` (
  `id` INTEGER PRIMARY KEY AUTO_INCREMENT,
  `thread_id` VARCHAR(191) NOT NULL,
  `member_email` VARCHAR(191) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY `planner_thread_member_email_idx` (`member_email`),
  UNIQUE KEY `planner_thread_member_unique` (`thread_id`,`member_email`),
  FOREIGN KEY (`thread_id`) REFERENCES `planner_threads` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS `planner_thread_reads` (
  `id` INTEGER PRIMARY KEY AUTO_INCREMENT,
  `thread_id` VARCHAR(191) NOT NULL,
  `member_email` VARCHAR(191) NOT NULL,
  `last_read_message_id` INTEGER NOT NULL DEFAULT 0,
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY `planner_thread_reads_member_idx` (`member_email`),
  UNIQUE KEY `planner_thread_reads_member_unique` (`thread_id`,`member_email`),
  FOREIGN KEY (`thread_id`) REFERENCES `planner_threads` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS `ponto_sites` (
  `id` INTEGER PRIMARY KEY AUTO_INCREMENT,
  `name` LONGTEXT NOT NULL,
  `contract` LONGTEXT NOT NULL DEFAULT (''),
  `city` LONGTEXT NOT NULL DEFAULT (''),
  `responsible` LONGTEXT NOT NULL DEFAULT (''),
  `latitude` LONGTEXT NOT NULL DEFAULT (''),
  `longitude` LONGTEXT NOT NULL DEFAULT (''),
  `radius_meters` INTEGER NOT NULL DEFAULT 300,
  `status` VARCHAR(191) NOT NULL DEFAULT 'active',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `company` LONGTEXT NOT NULL DEFAULT ('Dimivig Segurança'),
  `cnpj` LONGTEXT NOT NULL DEFAULT (''),
  `site_type` LONGTEXT NOT NULL DEFAULT ('Armado'),
  `phone` LONGTEXT NOT NULL DEFAULT (''),
  `email` LONGTEXT NOT NULL DEFAULT (''),
  `address` LONGTEXT NOT NULL DEFAULT (''),
  `address_number` LONGTEXT NOT NULL DEFAULT (''),
  `zip_code` LONGTEXT NOT NULL DEFAULT (''),
  `rotating` INTEGER NOT NULL DEFAULT false,
  `require_photo` INTEGER NOT NULL DEFAULT true,
  `require_geo` INTEGER NOT NULL DEFAULT true,
  `notes` LONGTEXT NOT NULL DEFAULT (''),
  `source_system` VARCHAR(191),
  `source_id` VARCHAR(191),
  UNIQUE KEY `ponto_sites_source_unique` (`source_system`,`source_id`),
  KEY `ponto_sites_status_idx` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS `ponto_employees` (
  `id` INTEGER PRIMARY KEY AUTO_INCREMENT,
  `name` LONGTEXT NOT NULL,
  `registration` VARCHAR(191) NOT NULL,
  `cpf` LONGTEXT NOT NULL DEFAULT (''),
  `job_title` LONGTEXT NOT NULL DEFAULT ('Vigilante'),
  `site_id` INTEGER,
  `schedule` LONGTEXT NOT NULL DEFAULT ('12x36'),
  `email` LONGTEXT NOT NULL DEFAULT (''),
  `phone` LONGTEXT NOT NULL DEFAULT (''),
  `status` VARCHAR(191) NOT NULL DEFAULT 'active',
  `require_photo` INTEGER NOT NULL DEFAULT true,
  `require_geo` INTEGER NOT NULL DEFAULT true,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `admission_date` LONGTEXT NOT NULL DEFAULT (''),
  `journey_start_date` LONGTEXT NOT NULL DEFAULT (''),
  `ctps_number` LONGTEXT NOT NULL DEFAULT (''),
  `ctps_series` LONGTEXT NOT NULL DEFAULT (''),
  `pis_pasep` LONGTEXT NOT NULL DEFAULT (''),
  `expected_start` LONGTEXT NOT NULL DEFAULT ('06:00'),
  `expected_break_start` LONGTEXT NOT NULL DEFAULT ('12:00'),
  `expected_break_end` LONGTEXT NOT NULL DEFAULT ('13:00'),
  `expected_end` LONGTEXT NOT NULL DEFAULT ('18:00'),
  `registers_point` INTEGER NOT NULL DEFAULT true,
  `source_system` VARCHAR(191),
  `source_id` VARCHAR(191),
  KEY `ponto_employee_registration_idx` (`registration`),
  UNIQUE KEY `ponto_employee_source_unique` (`source_system`,`source_id`),
  KEY `ponto_employee_status_idx` (`status`),
  KEY `ponto_employee_site_idx` (`site_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS `ponto_access_profiles` (
  `id` INTEGER PRIMARY KEY AUTO_INCREMENT,
  `email` VARCHAR(191) NOT NULL,
  `name` LONGTEXT NOT NULL DEFAULT (''),
  `role` LONGTEXT NOT NULL DEFAULT ('Colaborador'),
  `employee_id` INTEGER,
  `site_id` INTEGER,
  `status` LONGTEXT NOT NULL DEFAULT ('active'),
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `phone` LONGTEXT NOT NULL DEFAULT (''),
  `planner_role` LONGTEXT NOT NULL DEFAULT (''),
  UNIQUE KEY `ponto_access_profiles_email_unique` (`email`),
  FOREIGN KEY (`site_id`) REFERENCES `ponto_sites` (`id`) ON DELETE SET NULL,
  FOREIGN KEY (`employee_id`) REFERENCES `ponto_employees` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS `ponto_assets` (
  `id` INTEGER PRIMARY KEY AUTO_INCREMENT,
  `code` VARCHAR(191) NOT NULL,
  `name` LONGTEXT NOT NULL,
  `category` LONGTEXT NOT NULL DEFAULT ('Equipamento'),
  `site_id` INTEGER,
  `employee_id` INTEGER,
  `quantity` INTEGER NOT NULL DEFAULT 1,
  `status` LONGTEXT NOT NULL DEFAULT ('available'),
  `notes` LONGTEXT NOT NULL DEFAULT (''),
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY `ponto_assets_site_idx` (`site_id`),
  UNIQUE KEY `ponto_assets_code_unique` (`code`),
  FOREIGN KEY (`employee_id`) REFERENCES `ponto_employees` (`id`) ON DELETE SET NULL,
  FOREIGN KEY (`site_id`) REFERENCES `ponto_sites` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS `ponto_audit_events` (
  `id` INTEGER PRIMARY KEY AUTO_INCREMENT,
  `entity` VARCHAR(191) NOT NULL,
  `entity_id` INTEGER NOT NULL,
  `action` LONGTEXT NOT NULL,
  `before_json` LONGTEXT NOT NULL DEFAULT (''),
  `after_json` LONGTEXT NOT NULL DEFAULT (''),
  `actor` LONGTEXT NOT NULL,
  `created_at` VARCHAR(191) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY `ponto_audit_created_idx` (`created_at`),
  KEY `ponto_audit_entity_idx` (`entity`,`entity_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS `ponto_credentials` (
  `id` INTEGER PRIMARY KEY AUTO_INCREMENT,
  `profile_id` INTEGER NOT NULL,
  `email` VARCHAR(191) NOT NULL,
  `password_hash` LONGTEXT NOT NULL,
  `password_salt` LONGTEXT NOT NULL,
  `iterations` INTEGER NOT NULL DEFAULT 210000,
  `must_change_password` INTEGER NOT NULL DEFAULT false,
  `failed_attempts` INTEGER NOT NULL DEFAULT 0,
  `locked_until` DATETIME(3),
  `last_login_at` LONGTEXT,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY `ponto_credentials_email_unique` (`email`),
  UNIQUE KEY `ponto_credentials_profile_unique` (`profile_id`),
  FOREIGN KEY (`profile_id`) REFERENCES `ponto_access_profiles` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS `ponto_documents` (
  `id` INTEGER PRIMARY KEY AUTO_INCREMENT,
  `employee_id` INTEGER,
  `site_id` INTEGER,
  `kind` LONGTEXT NOT NULL,
  `file_name` LONGTEXT NOT NULL,
  `object_key` VARCHAR(191) NOT NULL,
  `content_type` LONGTEXT NOT NULL DEFAULT ('application/pdf'),
  `size` INTEGER NOT NULL DEFAULT 0,
  `signed` INTEGER NOT NULL DEFAULT false,
  `competence` VARCHAR(191) NOT NULL,
  `created_by` LONGTEXT NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `signed_by` LONGTEXT NOT NULL DEFAULT (''),
  KEY `ponto_documents_competence_idx` (`competence`),
  KEY `ponto_documents_employee_idx` (`employee_id`),
  UNIQUE KEY `ponto_documents_object_key_unique` (`object_key`),
  FOREIGN KEY (`site_id`) REFERENCES `ponto_sites` (`id`) ON DELETE SET NULL,
  FOREIGN KEY (`employee_id`) REFERENCES `ponto_employees` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS `ponto_justifications` (
  `id` INTEGER PRIMARY KEY AUTO_INCREMENT,
  `employee_id` INTEGER NOT NULL,
  `occurrence_date` LONGTEXT NOT NULL,
  `kind` LONGTEXT NOT NULL,
  `reason` LONGTEXT NOT NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'pending',
  `reviewed_by` LONGTEXT,
  `reviewed_at` LONGTEXT,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `end_date` LONGTEXT NOT NULL DEFAULT (''),
  `start_time` LONGTEXT NOT NULL DEFAULT (''),
  `end_time` LONGTEXT NOT NULL DEFAULT (''),
  `related_employee_id` INTEGER,
  `related_date` LONGTEXT NOT NULL DEFAULT (''),
  `attachment_key` LONGTEXT,
  `attachment_name` LONGTEXT NOT NULL DEFAULT (''),
  `attachment_content_type` LONGTEXT NOT NULL DEFAULT (''),
  KEY `ponto_justification_status_idx` (`status`),
  KEY `ponto_justification_employee_idx` (`employee_id`),
  FOREIGN KEY (`employee_id`) REFERENCES `ponto_employees` (`id`) ON DELETE CASCADE,
  FOREIGN KEY (`related_employee_id`) REFERENCES `ponto_employees` (`id`) ON DELETE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS `ponto_occurrence_types` (
  `id` INTEGER PRIMARY KEY AUTO_INCREMENT,
  `code` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `category` LONGTEXT NOT NULL DEFAULT ('Outros'),
  `effect` LONGTEXT NOT NULL DEFAULT ('informativo'),
  `requires_related_employee` INTEGER NOT NULL DEFAULT false,
  `status` VARCHAR(191) NOT NULL DEFAULT 'active',
  `sort_order` INTEGER NOT NULL DEFAULT 0,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY `ponto_occurrence_types_status_idx` (`status`),
  UNIQUE KEY `ponto_occurrence_types_name_unique` (`name`),
  UNIQUE KEY `ponto_occurrence_types_code_unique` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS `ponto_records` (
  `id` INTEGER PRIMARY KEY AUTO_INCREMENT,
  `employee_id` INTEGER NOT NULL,
  `kind` LONGTEXT NOT NULL,
  `recorded_at` VARCHAR(191) NOT NULL,
  `latitude` LONGTEXT NOT NULL DEFAULT (''),
  `longitude` LONGTEXT NOT NULL DEFAULT (''),
  `accuracy` INTEGER NOT NULL DEFAULT 0,
  `photo_key` LONGTEXT,
  `source` LONGTEXT NOT NULL DEFAULT ('web'),
  `status` LONGTEXT NOT NULL DEFAULT ('valid'),
  `notes` LONGTEXT NOT NULL DEFAULT (''),
  `created_by` LONGTEXT NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY `ponto_records_date_idx` (`recorded_at`),
  KEY `ponto_records_employee_idx` (`employee_id`),
  FOREIGN KEY (`employee_id`) REFERENCES `ponto_employees` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS `ponto_schedules` (
  `id` INTEGER PRIMARY KEY AUTO_INCREMENT,
  `employee_id` INTEGER NOT NULL,
  `work_date` VARCHAR(191) NOT NULL,
  `shift` LONGTEXT NOT NULL DEFAULT ('12x36'),
  `expected_start` LONGTEXT NOT NULL DEFAULT ('07:00'),
  `expected_break_start` LONGTEXT NOT NULL DEFAULT ('12:00'),
  `expected_break_end` LONGTEXT NOT NULL DEFAULT ('13:00'),
  `expected_end` LONGTEXT NOT NULL DEFAULT ('19:00'),
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `required` INTEGER NOT NULL DEFAULT true,
  `notes` LONGTEXT NOT NULL DEFAULT (''),
  KEY `ponto_schedule_date_idx` (`work_date`),
  UNIQUE KEY `ponto_schedule_employee_date_unique` (`employee_id`,`work_date`),
  FOREIGN KEY (`employee_id`) REFERENCES `ponto_employees` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS `ponto_sessions` (
  `id` VARCHAR(191) PRIMARY KEY,
  `credential_id` INTEGER NOT NULL,
  `token_hash` VARCHAR(191) NOT NULL,
  `expires_at` VARCHAR(191) NOT NULL,
  `user_agent` LONGTEXT NOT NULL DEFAULT (''),
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `last_seen_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY `ponto_sessions_expiry_idx` (`expires_at`),
  KEY `ponto_sessions_credential_idx` (`credential_id`),
  UNIQUE KEY `ponto_sessions_token_unique` (`token_hash`),
  FOREIGN KEY (`credential_id`) REFERENCES `ponto_credentials` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS `ponto_timesheet_signatures` (
  `id` INTEGER PRIMARY KEY AUTO_INCREMENT,
  `employee_id` INTEGER NOT NULL,
  `start_date` VARCHAR(191) NOT NULL,
  `end_date` VARCHAR(191) NOT NULL,
  `signature_key` LONGTEXT NOT NULL,
  `signed_name` LONGTEXT NOT NULL,
  `signed_by` LONGTEXT NOT NULL,
  `signed_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `status` LONGTEXT NOT NULL DEFAULT ('signed'),
  KEY `ponto_signature_period_idx` (`start_date`,`end_date`),
  UNIQUE KEY `ponto_signature_employee_period_unique` (`employee_id`,`start_date`,`end_date`),
  FOREIGN KEY (`employee_id`) REFERENCES `ponto_employees` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS `result_archives` (
  `id` INTEGER PRIMARY KEY AUTO_INCREMENT,
  `contract_id` INTEGER,
  `module` LONGTEXT NOT NULL,
  `reference_month` VARCHAR(191) NOT NULL,
  `actor` LONGTEXT NOT NULL,
  `file_name` LONGTEXT NOT NULL,
  `object_key` VARCHAR(191) NOT NULL,
  `size` INTEGER NOT NULL,
  `content_type` LONGTEXT NOT NULL DEFAULT ('application/zip'),
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY `result_archives_month_idx` (`reference_month`),
  KEY `result_archives_contract_idx` (`contract_id`),
  UNIQUE KEY `result_archives_object_key_unique` (`object_key`),
  FOREIGN KEY (`contract_id`) REFERENCES `contract_catalog` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS `result_archive_contracts` (
  `id` INTEGER PRIMARY KEY AUTO_INCREMENT,
  `result_id` INTEGER NOT NULL,
  `contract_id` INTEGER NOT NULL,
  KEY `result_archive_contract_result_idx` (`result_id`),
  UNIQUE KEY `result_archive_contract_unique` (`result_id`,`contract_id`),
  FOREIGN KEY (`contract_id`) REFERENCES `contract_catalog` (`id`) ON DELETE CASCADE,
  FOREIGN KEY (`result_id`) REFERENCES `result_archives` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS hostinger_install_state (id INTEGER PRIMARY KEY, installed INTEGER NOT NULL DEFAULT 0) ENGINE=InnoDB;

INSERT IGNORE INTO hostinger_install_state (id,installed) VALUES (1,0);

CREATE TABLE IF NOT EXISTS hostinger_email_verifications (token_hash CHAR(64) PRIMARY KEY, email VARCHAR(191) NOT NULL, confirmed INTEGER NOT NULL DEFAULT 0, used INTEGER NOT NULL DEFAULT 0, created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), expires_at DATETIME(3) NOT NULL, KEY verification_email (email), KEY verification_expiry (expires_at)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS hostinger_objects (id CHAR(64) PRIMARY KEY, object_key LONGTEXT NOT NULL, version_id CHAR(36) NOT NULL, size BIGINT NOT NULL, etag CHAR(64) NOT NULL, http_metadata LONGTEXT NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS hostinger_object_chunks (version_id CHAR(36) NOT NULL, chunk_index INTEGER NOT NULL, data LONGBLOB NOT NULL, PRIMARY KEY(version_id,chunk_index)) ENGINE=InnoDB;
