CREATE TABLE IF NOT EXISTS exotui_kv (
  namespace TEXT NOT NULL,
  key TEXT NOT NULL,
  value BLOB NOT NULL CHECK (typeof(value) = 'blob' AND length(value) <= 1048576),
  PRIMARY KEY(namespace, key)
) WITHOUT ROWID;
