-- Oakcraft Universal Master SKU CRM — initial schema
-- PostgreSQL 13+. Requires the pg_trgm extension (bundled with PostgreSQL).

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- Users, sessions
-- ---------------------------------------------------------------------------
CREATE TABLE users (
  id             BIGSERIAL PRIMARY KEY,
  name           TEXT NOT NULL,
  email          TEXT NOT NULL,
  password_hash  TEXT NOT NULL,
  role           TEXT NOT NULL CHECK (role IN ('ADMIN', 'STAFF', 'VIEWER')),
  status         TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
  -- Set for the seeded admin, new users and admin password resets: the app asks for a new password at next sign-in.
  must_change_password BOOLEAN NOT NULL DEFAULT false,
  failed_logins  INT NOT NULL DEFAULT 0,
  locked_until   TIMESTAMPTZ,
  last_login_at  TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_key ON users (lower(email));
CREATE TRIGGER users_updated BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE sessions (
  id          BIGSERIAL PRIMARY KEY,
  token_hash  TEXT NOT NULL UNIQUE,
  user_id     BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  ip          TEXT,
  user_agent  TEXT,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX sessions_user_idx ON sessions (user_id);

-- ---------------------------------------------------------------------------
-- Settings and uploaded media (product images, platform logos)
-- ---------------------------------------------------------------------------
CREATE TABLE settings (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL,
  updated_by  BIGINT REFERENCES users (id),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE media (
  id           BIGSERIAL PRIMARY KEY,
  file_name    TEXT NOT NULL,
  mime_type    TEXT NOT NULL,
  size_bytes   INT NOT NULL,
  data         BYTEA NOT NULL,
  uploaded_by  BIGINT REFERENCES users (id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Master SKUs: one row per real Oakcraft product
-- ---------------------------------------------------------------------------
CREATE TABLE master_products (
  id             BIGSERIAL PRIMARY KEY,
  master_sku     TEXT NOT NULL,
  product_name   TEXT NOT NULL,
  model          TEXT,
  category       TEXT,
  brand          TEXT,
  product_type   TEXT,
  color          TEXT,
  material       TEXT,
  size           TEXT,
  variant        TEXT,
  internal_code  TEXT,
  image          TEXT,
  status         TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE', 'DISCONTINUED')),
  remarks        TEXT,
  is_deleted     BOOLEAN NOT NULL DEFAULT false,
  deleted_at     TIMESTAMPTZ,
  deleted_by     BIGINT REFERENCES users (id),
  created_by     BIGINT REFERENCES users (id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  search_text    TEXT GENERATED ALWAYS AS (
    lower(master_sku || ' ' || product_name || ' ' || coalesce(model, '') || ' ' || coalesce(internal_code, ''))
  ) STORED
);
-- Master SKU is unique for ever, including soft-deleted rows, so a code is never reused by accident.
CREATE UNIQUE INDEX master_products_sku_key ON master_products (upper(master_sku));
CREATE INDEX master_products_search_trgm ON master_products USING gin (search_text gin_trgm_ops);
CREATE INDEX master_products_internal_code_idx ON master_products (upper(internal_code)) WHERE internal_code IS NOT NULL;
CREATE INDEX master_products_live_idx ON master_products (status, category) WHERE NOT is_deleted;
CREATE INDEX master_products_model_idx ON master_products (lower(model)) WHERE NOT is_deleted;
CREATE TRIGGER master_products_updated BEFORE UPDATE ON master_products FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE master_product_images (
  id                 BIGSERIAL PRIMARY KEY,
  master_product_id  BIGINT NOT NULL REFERENCES master_products (id) ON DELETE CASCADE,
  image              TEXT NOT NULL,
  sort_order         INT NOT NULL DEFAULT 0,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX master_product_images_master_idx ON master_product_images (master_product_id);

-- ---------------------------------------------------------------------------
-- Platforms are data, not code. Nothing below names a marketplace.
-- ---------------------------------------------------------------------------
CREATE TABLE platforms (
  id                    BIGSERIAL PRIMARY KEY,
  platform_name         TEXT NOT NULL,
  platform_code         TEXT NOT NULL,
  platform_type         TEXT NOT NULL DEFAULT 'Marketplace',
  website_url           TEXT,
  logo                  TEXT,
  brand_color           TEXT,
  description           TEXT,
  listing_url_template  TEXT,
  status                TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE', 'ARCHIVED')),
  sort_order            INT NOT NULL DEFAULT 0,
  created_by            BIGINT REFERENCES users (id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX platforms_name_key ON platforms (lower(platform_name));
CREATE UNIQUE INDEX platforms_code_key ON platforms (upper(platform_code));
CREATE TRIGGER platforms_updated BEFORE UPDATE ON platforms FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE platform_fields (
  id                     BIGSERIAL PRIMARY KEY,
  platform_id            BIGINT NOT NULL REFERENCES platforms (id) ON DELETE CASCADE,
  field_name             TEXT NOT NULL,
  field_label            TEXT NOT NULL,
  field_type             TEXT NOT NULL DEFAULT 'text' CHECK (field_type IN ('text', 'number', 'date', 'url', 'boolean', 'select')),
  options                JSONB,
  required               BOOLEAN NOT NULL DEFAULT false,
  searchable             BOOLEAN NOT NULL DEFAULT true,
  sortable               BOOLEAN NOT NULL DEFAULT false,
  -- The platform's main product identifier (ASIN, FSN, Style ID…). Its value is mirrored into
  -- platform_listings.product_id so every platform has a comparable "Product ID".
  is_primary_identifier  BOOLEAN NOT NULL DEFAULT false,
  -- Value uniquely identifies one product, so it is safe to use for automatic matching.
  use_for_matching       BOOLEAN NOT NULL DEFAULT false,
  sort_order             INT NOT NULL DEFAULT 0,
  is_deleted             BOOLEAN NOT NULL DEFAULT false,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX platform_fields_id_platform_key ON platform_fields (id, platform_id);
CREATE UNIQUE INDEX platform_fields_name_key ON platform_fields (platform_id, lower(field_name)) WHERE NOT is_deleted;
CREATE UNIQUE INDEX platform_fields_primary_key ON platform_fields (platform_id) WHERE is_primary_identifier AND NOT is_deleted;
CREATE TRIGGER platform_fields_updated BEFORE UPDATE ON platform_fields FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE platform_import_templates (
  id              BIGSERIAL PRIMARY KEY,
  platform_id     BIGINT NOT NULL REFERENCES platforms (id) ON DELETE CASCADE,
  template_name   TEXT NOT NULL,
  sheet_name      TEXT,
  header_row      INT NOT NULL DEFAULT 1,
  data_start_row  INT NOT NULL DEFAULT 2,
  column_map      JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_default      BOOLEAN NOT NULL DEFAULT true,
  updated_by      BIGINT REFERENCES users (id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX platform_import_templates_name_key ON platform_import_templates (platform_id, lower(template_name));
CREATE TRIGGER platform_import_templates_updated BEFORE UPDATE ON platform_import_templates FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Imports: the original file, the run, and every row's outcome
-- ---------------------------------------------------------------------------
CREATE TABLE import_files (
  id           BIGSERIAL PRIMARY KEY,
  file_name    TEXT NOT NULL,
  mime_type    TEXT,
  size_bytes   INT NOT NULL,
  sha256       TEXT NOT NULL,
  data         BYTEA NOT NULL,
  uploaded_by  BIGINT REFERENCES users (id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE import_logs (
  id                 BIGSERIAL PRIMARY KEY,
  file_id            BIGINT REFERENCES import_files (id),
  file_name          TEXT NOT NULL,
  platform_id        BIGINT NOT NULL REFERENCES platforms (id),
  imported_by        BIGINT REFERENCES users (id),
  status             TEXT NOT NULL DEFAULT 'UPLOADED' CHECK (status IN ('UPLOADED', 'PREVIEWED', 'COMPLETED', 'FAILED', 'CANCELLED')),
  sheet_name         TEXT,
  header_row         INT,
  data_start_row     INT,
  column_map         JSONB,
  total_records      INT NOT NULL DEFAULT 0,
  new_records        INT NOT NULL DEFAULT 0,
  updated_records    INT NOT NULL DEFAULT 0,
  mapped_records     INT NOT NULL DEFAULT 0,
  unmapped_records   INT NOT NULL DEFAULT 0,
  review_records     INT NOT NULL DEFAULT 0,
  duplicate_records  INT NOT NULL DEFAULT 0,
  error_records      INT NOT NULL DEFAULT 0,
  error_message      TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at       TIMESTAMPTZ
);
CREATE INDEX import_logs_created_idx ON import_logs (created_at DESC);
CREATE INDEX import_logs_platform_idx ON import_logs (platform_id);

-- ---------------------------------------------------------------------------
-- Platform listings: one row per marketplace Child SKU
-- ---------------------------------------------------------------------------
CREATE TABLE platform_listings (
  id                   BIGSERIAL PRIMARY KEY,
  master_product_id    BIGINT REFERENCES master_products (id),
  platform_id          BIGINT NOT NULL REFERENCES platforms (id),
  child_sku            TEXT NOT NULL CHECK (btrim(child_sku) <> ''),
  seller_sku           TEXT,
  listing_name         TEXT,
  product_title        TEXT,
  product_id           TEXT,
  listing_id           TEXT,
  listing_url          TEXT,
  variant              TEXT,
  color                TEXT,
  size                 TEXT,
  remarks              TEXT,
  listing_status       TEXT NOT NULL DEFAULT 'ACTIVE'
                         CHECK (listing_status IN ('ACTIVE', 'INACTIVE', 'INCOMPLETE', 'ARCHIVED', 'UNKNOWN')),
  platform_status_raw  TEXT,
  mapping_status       TEXT NOT NULL DEFAULT 'UNMAPPED'
                         CHECK (mapping_status IN ('MAPPED', 'UNMAPPED', 'NEEDS_REVIEW', 'REMAPPING_REQUIRED')),
  mapping_confidence   SMALLINT CHECK (mapping_confidence BETWEEN 0 AND 100),
  mapping_method       TEXT,
  match_reason         TEXT,
  remap_reason         TEXT,
  suggested_master_id  BIGINT REFERENCES master_products (id),
  -- Master SKUs a person unmapped or rejected for this listing. Automatic matching never proposes them again.
  rejected_master_ids  BIGINT[] NOT NULL DEFAULT '{}',
  mapped_by            BIGINT REFERENCES users (id),
  mapped_at            TIMESTAMPTZ,
  import_id            BIGINT REFERENCES import_logs (id),
  last_import_id       BIGINT REFERENCES import_logs (id),
  imported_at          TIMESTAMPTZ,
  raw_data             JSONB,
  search_text          TEXT,
  is_deleted           BOOLEAN NOT NULL DEFAULT false,
  deleted_at           TIMESTAMPTZ,
  deleted_by           BIGINT REFERENCES users (id),
  created_by           BIGINT REFERENCES users (id),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- A listing without a Master SKU is legal: that is what "unmapped" means.
  CONSTRAINT platform_listings_mapping_consistent CHECK (
       (mapping_status = 'MAPPED' AND master_product_id IS NOT NULL)
    OR (mapping_status IN ('UNMAPPED', 'NEEDS_REVIEW') AND master_product_id IS NULL)
    OR (mapping_status = 'REMAPPING_REQUIRED')
  )
);
-- Child SKU is unique per platform, exactly as the marketplace wrote it (case-sensitive:
-- Flipkart really does carry both "2-15-Black" and "2-15-BLACK"). Soft-deleted rows keep
-- their SKU so a re-import restores the record instead of creating a second one.
CREATE UNIQUE INDEX platform_listings_platform_sku_key ON platform_listings (platform_id, child_sku);
CREATE UNIQUE INDEX platform_listings_id_platform_key ON platform_listings (id, platform_id);
CREATE INDEX platform_listings_master_idx ON platform_listings (master_product_id) WHERE NOT is_deleted;
CREATE INDEX platform_listings_platform_status_idx ON platform_listings (platform_id, mapping_status) WHERE NOT is_deleted;
CREATE INDEX platform_listings_mapping_created_idx ON platform_listings (mapping_status, created_at) WHERE NOT is_deleted;
CREATE INDEX platform_listings_listing_status_idx ON platform_listings (listing_status) WHERE NOT is_deleted;
CREATE INDEX platform_listings_child_sku_ci_idx ON platform_listings (lower(child_sku));
CREATE INDEX platform_listings_seller_sku_ci_idx ON platform_listings (lower(seller_sku)) WHERE seller_sku IS NOT NULL;
CREATE INDEX platform_listings_product_id_ci_idx ON platform_listings (lower(product_id)) WHERE product_id IS NOT NULL;
CREATE INDEX platform_listings_listing_id_ci_idx ON platform_listings (lower(listing_id)) WHERE listing_id IS NOT NULL;
CREATE INDEX platform_listings_import_idx ON platform_listings (last_import_id);
CREATE INDEX platform_listings_suggested_idx ON platform_listings (suggested_master_id) WHERE suggested_master_id IS NOT NULL;
CREATE INDEX platform_listings_search_trgm ON platform_listings USING gin (search_text gin_trgm_ops);
CREATE TRIGGER platform_listings_updated BEFORE UPDATE ON platform_listings FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Custom field values. platform_id is repeated here so that two composite foreign keys can
-- guarantee, in the database itself, that a value always belongs to a field of the listing's own platform.
CREATE TABLE platform_listing_custom_values (
  id                 BIGSERIAL PRIMARY KEY,
  listing_id         BIGINT NOT NULL,
  platform_field_id  BIGINT NOT NULL,
  platform_id        BIGINT NOT NULL,
  field_value        TEXT,
  FOREIGN KEY (listing_id, platform_id) REFERENCES platform_listings (id, platform_id) ON DELETE CASCADE,
  FOREIGN KEY (platform_field_id, platform_id) REFERENCES platform_fields (id, platform_id)
);
CREATE UNIQUE INDEX platform_listing_custom_values_key ON platform_listing_custom_values (listing_id, platform_field_id);
CREATE INDEX platform_listing_custom_values_lookup_idx ON platform_listing_custom_values (platform_field_id, lower(field_value));

-- Rebuilds the denormalised search text (common fields + searchable custom values).
CREATE OR REPLACE FUNCTION refresh_listing_search(listing_ids BIGINT[]) RETURNS void AS $$
  UPDATE platform_listings l
     SET search_text = t.txt
    FROM (
      SELECT x.id,
             lower(concat_ws(' ', x.child_sku, x.seller_sku, x.listing_name, x.product_title, x.product_id, x.listing_id,
               (SELECT string_agg(v.field_value, ' ')
                  FROM platform_listing_custom_values v
                  JOIN platform_fields f ON f.id = v.platform_field_id
                 WHERE v.listing_id = x.id AND f.searchable AND NOT f.is_deleted))) AS txt
        FROM platform_listings x
       WHERE x.id = ANY (listing_ids)
    ) t
   WHERE l.id = t.id AND l.search_text IS DISTINCT FROM t.txt;
$$ LANGUAGE sql;

CREATE TABLE import_rows (
  id                 BIGSERIAL PRIMARY KEY,
  import_id          BIGINT NOT NULL REFERENCES import_logs (id) ON DELETE CASCADE,
  row_number         INT NOT NULL,
  child_sku          TEXT,
  outcome            TEXT NOT NULL CHECK (outcome IN ('CREATED', 'UPDATED', 'RESTORED', 'DUPLICATE', 'ERROR')),
  mapping_status     TEXT,
  listing_id         BIGINT REFERENCES platform_listings (id),
  master_product_id  BIGINT REFERENCES master_products (id),
  confidence         SMALLINT,
  message            TEXT,
  raw_data           JSONB
);
CREATE INDEX import_rows_import_idx ON import_rows (import_id, row_number);
CREATE INDEX import_rows_outcome_idx ON import_rows (import_id, outcome);

-- ---------------------------------------------------------------------------
-- History and audit
-- ---------------------------------------------------------------------------
CREATE TABLE mapping_history (
  id             BIGSERIAL PRIMARY KEY,
  listing_id     BIGINT NOT NULL REFERENCES platform_listings (id),
  old_master_id  BIGINT REFERENCES master_products (id),
  new_master_id  BIGINT REFERENCES master_products (id),
  old_status     TEXT,
  new_status     TEXT NOT NULL,
  method         TEXT NOT NULL,
  confidence     SMALLINT,
  note           TEXT,
  user_id        BIGINT REFERENCES users (id),
  import_id      BIGINT REFERENCES import_logs (id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX mapping_history_listing_idx ON mapping_history (listing_id, created_at DESC);
CREATE INDEX mapping_history_created_idx ON mapping_history (created_at DESC);
CREATE INDEX mapping_history_new_master_idx ON mapping_history (new_master_id);

CREATE TABLE audit_logs (
  id            BIGSERIAL PRIMARY KEY,
  user_id       BIGINT REFERENCES users (id),
  user_name     TEXT,
  action        TEXT NOT NULL,
  entity_type   TEXT NOT NULL,
  entity_id     BIGINT,
  entity_label  TEXT,
  platform_id   BIGINT REFERENCES platforms (id),
  old_value     JSONB,
  new_value     JSONB,
  ip            TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX audit_logs_created_idx ON audit_logs (created_at DESC);
CREATE INDEX audit_logs_entity_idx ON audit_logs (entity_type, entity_id);
CREATE INDEX audit_logs_action_idx ON audit_logs (action, created_at DESC);
CREATE INDEX audit_logs_user_idx ON audit_logs (user_id, created_at DESC);
