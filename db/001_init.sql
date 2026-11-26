CREATE TABLE IF NOT EXISTS staff_accounts(username text PRIMARY KEY,name text NOT NULL,role text NOT NULL CHECK(role IN ('staff','manager')),password_hash text NOT NULL,active boolean NOT NULL DEFAULT true);
CREATE TABLE IF NOT EXISTS staff_sessions(token_hash text PRIMARY KEY,username text NOT NULL REFERENCES staff_accounts(username),expires_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS staff_login_limits(key text PRIMARY KEY,attempts int NOT NULL,window_start timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS reports(id text PRIMARY KEY,type text NOT NULL CHECK(type IN ('daily','requisition','incident')),username text NOT NULL REFERENCES staff_accounts(username),staff text NOT NULL,data jsonb NOT NULL,status text NOT NULL CHECK(status IN ('Pending','Submitted','Approved','Declined')),notification text NOT NULL DEFAULT 'Pending notification',created_at timestamptz NOT NULL DEFAULT now(),decided_by text REFERENCES staff_accounts(username),decided_at timestamptz,wa_id text UNIQUE);
CREATE INDEX IF NOT EXISTS reports_owner_created ON reports(username,created_at DESC);
CREATE INDEX IF NOT EXISTS sessions_expiration ON staff_sessions(expires_at);
