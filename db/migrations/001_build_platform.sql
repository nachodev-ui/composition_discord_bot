CREATE TABLE builds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number integer NOT NULL UNIQUE CHECK (number > 0 AND number <= 999),
  name text NOT NULL,
  category text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'ready', 'published', 'archived')),
  enabled boolean NOT NULL DEFAULT true,
  discord_role_id text,
  discord_role_name text NOT NULL,
  equipment jsonb NOT NULL,
  consumables jsonb NOT NULL,
  item_ids jsonb NOT NULL DEFAULT '{}'::jsonb,
  alternatives text,
  source_url text,
  image_url text,
  image_version integer NOT NULL DEFAULT 0,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX builds_discord_role_id_uq ON builds (discord_role_id)
  WHERE discord_role_id IS NOT NULL AND discord_role_id <> '';
CREATE INDEX builds_status_number_idx ON builds (status, enabled, number);

CREATE TABLE build_images (
  build_id uuid PRIMARY KEY REFERENCES builds(id) ON DELETE CASCADE,
  content_type text NOT NULL DEFAULT 'image/png',
  data bytea NOT NULL,
  width integer NOT NULL CHECK (width > 0),
  height integer NOT NULL CHECK (height > 0),
  byte_size integer NOT NULL CHECK (byte_size > 0),
  sha256 text NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE build_versions (
  build_id uuid NOT NULL REFERENCES builds(id) ON DELETE CASCADE,
  version integer NOT NULL CHECK (version > 0),
  snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (build_id, version)
);

CREATE TABLE compositions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  category text NOT NULL DEFAULT 'General',
  description text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'ready', 'published', 'archived')),
  discord_channel_id text,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE composition_slots (
  composition_id uuid NOT NULL REFERENCES compositions(id) ON DELETE CASCADE,
  position integer NOT NULL CHECK (position > 0),
  build_id uuid NOT NULL REFERENCES builds(id) ON DELETE RESTRICT,
  label text,
  required_count integer NOT NULL DEFAULT 1 CHECK (required_count > 0),
  PRIMARY KEY (composition_id, position)
);
CREATE INDEX composition_slots_build_idx ON composition_slots (build_id);

CREATE TABLE build_publications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  build_id uuid REFERENCES builds(id) ON DELETE CASCADE,
  composition_id uuid REFERENCES compositions(id) ON DELETE CASCADE,
  guild_id text NOT NULL,
  channel_id text NOT NULL,
  message_id text NOT NULL,
  publication_type text NOT NULL DEFAULT 'build' CHECK (publication_type IN ('build', 'composition')),
  published_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (guild_id, channel_id, message_id),
  CHECK (build_id IS NOT NULL OR composition_id IS NOT NULL)
);

CREATE TABLE signup_assignments (
  guild_id text NOT NULL,
  user_id text NOT NULL,
  build_id uuid NOT NULL REFERENCES builds(id) ON DELETE RESTRICT,
  role_id text NOT NULL,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (guild_id, user_id),
  UNIQUE (guild_id, build_id)
);

CREATE TABLE bot_runtime_state (
  guild_id text PRIMARY KEY,
  panel_message_id text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE admin_audit_log (
  id bigserial PRIMARY KEY,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX admin_audit_log_created_idx ON admin_audit_log (created_at DESC);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS 'BEGIN NEW.updated_at = now(); RETURN NEW; END;';

CREATE TRIGGER builds_set_updated_at BEFORE UPDATE ON builds
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER compositions_set_updated_at BEFORE UPDATE ON compositions
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER build_publications_set_updated_at BEFORE UPDATE ON build_publications
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER bot_runtime_state_set_updated_at BEFORE UPDATE ON bot_runtime_state
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
