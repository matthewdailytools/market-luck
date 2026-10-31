-- Add v3 records; no existing manifest, ticket, balance or proof is rewritten.
CREATE TABLE round_secrets(round_id TEXT PRIMARY KEY REFERENCES rounds(id),envelope TEXT NOT NULL);
CREATE TRIGGER secret_insert_guard BEFORE INSERT ON round_secrets BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM rounds WHERE id=NEW.round_id AND status='draft' AND json_extract(manifest,'$.version')=3) THEN RAISE(ABORT,'SECRET_NOT_DRAFT') END;
END;
CREATE TRIGGER secret_no_update BEFORE UPDATE ON round_secrets BEGIN SELECT RAISE(ABORT,'SECRET_IMMUTABLE'); END;
CREATE TRIGGER secret_no_delete BEFORE DELETE ON round_secrets BEGIN SELECT RAISE(ABORT,'SECRET_IMMUTABLE'); END;
CREATE TABLE witness_intents(round_id TEXT NOT NULL REFERENCES rounds(id),stage TEXT NOT NULL CHECK(stage IN ('presale','freeze')),record TEXT NOT NULL,body TEXT NOT NULL,PRIMARY KEY(round_id,stage));
CREATE TABLE witness_receipts(round_id TEXT NOT NULL REFERENCES rounds(id),stage TEXT NOT NULL CHECK(stage IN ('presale','freeze')),receipt TEXT NOT NULL,witnessed_at INTEGER NOT NULL,PRIMARY KEY(round_id,stage),FOREIGN KEY(round_id,stage) REFERENCES witness_intents(round_id,stage));
CREATE TRIGGER intent_insert_guard BEFORE INSERT ON witness_intents BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM rounds WHERE id=NEW.round_id AND json_extract(manifest,'$.version')=3 AND ((NEW.stage='presale' AND status='draft' AND EXISTS(SELECT 1 FROM round_secrets WHERE round_id=NEW.round_id)) OR (NEW.stage='freeze' AND status='open' AND EXISTS(SELECT 1 FROM entropy_snapshots WHERE round_id=NEW.round_id)))) THEN RAISE(ABORT,'WITNESS_STAGE_NOT_READY') END;
END;
CREATE TRIGGER intent_no_update BEFORE UPDATE ON witness_intents BEGIN SELECT RAISE(ABORT,'WITNESS_IMMUTABLE'); END;
CREATE TRIGGER intent_no_delete BEFORE DELETE ON witness_intents BEGIN SELECT RAISE(ABORT,'WITNESS_IMMUTABLE'); END;
CREATE TRIGGER receipt_insert_guard BEFORE INSERT ON witness_receipts BEGIN
 SELECT CASE WHEN NOT json_valid(NEW.receipt) OR json_extract(NEW.receipt,'$.record') IS NOT (SELECT record FROM witness_intents WHERE round_id=NEW.round_id AND stage=NEW.stage) OR NEW.witnessed_at IS NOT json_extract(NEW.receipt,'$.entry.integratedTime')*1000+1000 THEN RAISE(ABORT,'INVALID_WITNESS_RECEIPT') END;
END;
CREATE TRIGGER receipt_no_update BEFORE UPDATE ON witness_receipts BEGIN SELECT RAISE(ABORT,'WITNESS_IMMUTABLE'); END;
CREATE TRIGGER receipt_no_delete BEFORE DELETE ON witness_receipts BEGIN SELECT RAISE(ABORT,'WITNESS_IMMUTABLE'); END;
CREATE TABLE round_reveals(round_id TEXT PRIMARY KEY REFERENCES rounds(id),payload TEXT NOT NULL,revealed_at INTEGER NOT NULL DEFAULT(CAST(ROUND(unixepoch('subsec')*1000) AS INTEGER)));
CREATE TRIGGER reveal_insert_guard BEFORE INSERT ON round_reveals BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM rounds r JOIN entropy_snapshots s ON s.round_id=r.id JOIN witness_receipts w ON w.round_id=r.id AND w.stage='freeze' WHERE r.id=NEW.round_id AND r.status='open' AND json_extract(r.manifest,'$.version')=3 AND w.witnessed_at+120000<=CAST(ROUND(unixepoch('subsec')*1000) AS INTEGER)) THEN RAISE(ABORT,'REVEAL_TOO_EARLY') END;
END;
CREATE TRIGGER reveal_no_update BEFORE UPDATE ON round_reveals BEGIN SELECT RAISE(ABORT,'REVEAL_IMMUTABLE'); END;
CREATE TRIGGER reveal_no_delete BEFORE DELETE ON round_reveals BEGIN SELECT RAISE(ABORT,'REVEAL_IMMUTABLE'); END;
DROP TRIGGER entropy_insert_guard;
CREATE TRIGGER entropy_insert_guard BEFORE INSERT ON entropy_snapshots BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM rounds WHERE id=NEW.round_id AND status='open' AND json_extract(manifest,'$.version') IN (2,3) AND json_extract(manifest,'$.mode')='LIVE' AND ready<=CAST(ROUND(unixepoch('subsec')*1000) AS INTEGER) AND cutoff<=CAST(ROUND(unixepoch('subsec')*1000) AS INTEGER) AND json_extract(NEW.payload,'$.commitment')=commitment) THEN RAISE(ABORT,'ENTROPY_NOT_READY') END;
 SELECT CASE WHEN NEW.sealed_at!=CAST(ROUND(unixepoch('subsec')*1000) AS INTEGER) THEN RAISE(ABORT,'ENTROPY_TIME_NOT_SERVER') END;
END;
DROP TRIGGER frozen_round_no_pause;
CREATE TRIGGER frozen_round_no_pause BEFORE UPDATE OF status ON rounds WHEN OLD.status='open' AND NEW.status='paused' AND json_extract(OLD.manifest,'$.version') IN (2,3) AND EXISTS(SELECT 1 FROM entropy_snapshots WHERE round_id=OLD.id) BEGIN SELECT RAISE(ABORT,'FROZEN_ROUND_CANNOT_PAUSE'); END;
CREATE TRIGGER v3_open_guard BEFORE UPDATE OF status ON rounds WHEN NEW.status='open' AND OLD.status='draft' AND json_extract(OLD.manifest,'$.version')=3 BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM witness_receipts WHERE round_id=OLD.id AND stage='presale' AND witnessed_at<=OLD.cutoff) OR NOT EXISTS(SELECT 1 FROM round_secrets WHERE round_id=OLD.id) THEN RAISE(ABORT,'PRESALE_WITNESS_REQUIRED') END;
END;
CREATE TRIGGER v3_settlement_guard BEFORE UPDATE OF proof ON rounds WHEN NEW.proof IS NOT NULL AND OLD.proof IS NULL AND json_extract(OLD.manifest,'$.version')=3 BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM round_reveals WHERE round_id=OLD.id AND payload=json_extract(NEW.proof,'$.reveal')) OR (SELECT COUNT(*) FROM witness_receipts WHERE round_id=OLD.id)!=2 THEN RAISE(ABORT,'V3_WITNESS_REVEAL_REQUIRED') END;
END;
