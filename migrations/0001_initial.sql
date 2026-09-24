CREATE TABLE students (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  student_id TEXT,
  teacher INTEGER NOT NULL DEFAULT 0,
  expires_at INTEGER NOT NULL,
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
);
CREATE INDEX sessions_expiry ON sessions(expires_at);
CREATE TABLE login_attempts (
  attempt_key TEXT PRIMARY KEY,
  failures INTEGER NOT NULL,
  blocked_until INTEGER NOT NULL
);
CREATE TABLE profiles (
  profile_key TEXT PRIMARY KEY,
  progress_json TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL
);
