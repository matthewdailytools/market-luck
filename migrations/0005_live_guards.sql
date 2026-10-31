ALTER TABLE anchors ADD COLUMN verified_hash TEXT;
ALTER TABLE anchors ADD COLUMN verified_at INTEGER;
CREATE TABLE collection_attempts(id INTEGER PRIMARY KEY AUTOINCREMENT,round_id TEXT NOT NULL REFERENCES rounds(id),attempted INTEGER NOT NULL,ok INTEGER NOT NULL,reason TEXT NOT NULL);
DROP TRIGGER buy;
CREATE TRIGGER buy BEFORE INSERT ON tickets BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM rounds WHERE id=NEW.round_id AND status='open' AND cutoff>CAST(ROUND(unixepoch('subsec')*1000) AS INTEGER)) THEN RAISE(ABORT,'已停售') END;
 SELECT CASE WHEN (SELECT balance FROM users WHERE id=NEW.user_id)<10 THEN RAISE(ABORT,'积分不足') END;
 UPDATE users SET balance=balance-10 WHERE id=NEW.user_id;
 UPDATE pool SET balance=balance+10 WHERE id=1;
 INSERT INTO ledger(user_id,round_id,kind,delta,created) VALUES(NEW.user_id,NEW.round_id,'purchase',-10,NEW.created);
END;
CREATE TRIGGER live_insert BEFORE INSERT ON rounds WHEN json_extract(NEW.manifest,'$.mode')='LIVE' BEGIN
 SELECT CASE WHEN NEW.status!='draft' OR NEW.cutoff!=json_extract(NEW.manifest,'$.cutoff') OR NEW.ready!=json_extract(NEW.manifest,'$.ready') OR NEW.cutoff<CAST(ROUND(unixepoch('subsec')*1000) AS INTEGER)+3600000 THEN RAISE(ABORT,'INVALID_LIVE_TIMING') END;
END;
CREATE TRIGGER live_immutable BEFORE UPDATE ON rounds WHEN json_extract(OLD.manifest,'$.mode')='LIVE' OR json_extract(NEW.manifest,'$.mode')='LIVE' BEGIN
 SELECT CASE WHEN OLD.manifest!=NEW.manifest OR OLD.id!=NEW.id OR OLD.commitment!=NEW.commitment OR OLD.cutoff!=NEW.cutoff OR OLD.ready!=NEW.ready THEN RAISE(ABORT,'LIVE_MANIFEST_IMMUTABLE') END;
 SELECT CASE WHEN NEW.status='open' AND OLD.status!='open' AND (OLD.status!='draft' OR NEW.cutoff<=CAST(ROUND(unixepoch('subsec')*1000) AS INTEGER) OR NOT EXISTS(SELECT 1 FROM anchors WHERE round_id=NEW.id AND verified_hash=NEW.commitment AND verified_at IS NOT NULL)) THEN RAISE(ABORT,'LIVE_PUBLICATION_REQUIRED') END;
 SELECT CASE WHEN OLD.status IN ('settled','paused') AND NEW.status!=OLD.status THEN RAISE(ABORT,'LIVE_STATE_IMMUTABLE') END;
END;
CREATE TRIGGER settlement_guard BEFORE INSERT ON settlements BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM rounds WHERE id=NEW.round_id AND status='open' AND ready<=CAST(ROUND(unixepoch('subsec')*1000) AS INTEGER) AND cutoff<=CAST(ROUND(unixepoch('subsec')*1000) AS INTEGER)) THEN RAISE(ABORT,'MARKETS_NOT_FINAL') END;
END;
