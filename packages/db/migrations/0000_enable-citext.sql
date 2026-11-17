-- Case-insensitive text type for emails (users.email). A trusted extension: the database owner can enable
-- it without superuser rights, which is all Render grants.
CREATE EXTENSION IF NOT EXISTS citext;
