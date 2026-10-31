-- Additive guards: existing manifests, tickets, balances and proof bytes are not rewritten.
CREATE TABLE entropy_snapshots(
 round_id TEXT PRIMARY KEY REFERENCES rounds(id),payload TEXT NOT NULL,digest TEXT NOT NULL,
 sealed_at INTEGER NOT NULL DEFAULT(CAST(ROUND(unixepoch('subsec')*1000) AS INTEGER))
);
CREATE TRIGGER entropy_insert_guard BEFORE INSERT ON entropy_snapshots BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM rounds WHERE id=NEW.round_id AND status='open' AND json_extract(manifest,'$.version')=2 AND json_extract(manifest,'$.mode')='LIVE' AND ready<=CAST(ROUND(unixepoch('subsec')*1000) AS INTEGER) AND cutoff<=CAST(ROUND(unixepoch('subsec')*1000) AS INTEGER) AND json_extract(NEW.payload,'$.commitment')=commitment) THEN RAISE(ABORT,'ENTROPY_NOT_READY') END;
 SELECT CASE WHEN NEW.sealed_at!=CAST(ROUND(unixepoch('subsec')*1000) AS INTEGER) THEN RAISE(ABORT,'ENTROPY_TIME_NOT_SERVER') END;
END;
CREATE TRIGGER entropy_no_update BEFORE UPDATE ON entropy_snapshots BEGIN SELECT RAISE(ABORT,'ENTROPY_IMMUTABLE'); END;
CREATE TRIGGER entropy_no_delete BEFORE DELETE ON entropy_snapshots BEGIN SELECT RAISE(ABORT,'ENTROPY_IMMUTABLE'); END;
CREATE TRIGGER frozen_round_no_pause BEFORE UPDATE OF status ON rounds WHEN OLD.status='open' AND NEW.status='paused' AND json_extract(OLD.manifest,'$.version')=2 AND EXISTS(SELECT 1 FROM entropy_snapshots WHERE round_id=OLD.id) BEGIN SELECT RAISE(ABORT,'FROZEN_ROUND_CANNOT_PAUSE'); END;
CREATE TABLE settlement_payments(ticket_id TEXT PRIMARY KEY REFERENCES tickets(id),round_id TEXT NOT NULL REFERENCES rounds(id),tier INTEGER NOT NULL CHECK(tier BETWEEN 0 AND 3),prize INTEGER NOT NULL CHECK(prize>=0));
CREATE TRIGGER payment_insert_guard BEFORE INSERT ON settlement_payments BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM tickets t JOIN rounds r ON r.id=t.round_id JOIN settlements s ON s.round_id=r.id WHERE t.id=NEW.ticket_id AND t.round_id=NEW.round_id AND r.status='open') THEN RAISE(ABORT,'PAYMENT_NOT_AUTHORIZED') END;
END;
CREATE TRIGGER payment_no_update BEFORE UPDATE ON settlement_payments BEGIN SELECT RAISE(ABORT,'PAYMENT_IMMUTABLE'); END;
CREATE TRIGGER payment_no_delete BEFORE DELETE ON settlement_payments BEGIN SELECT RAISE(ABORT,'PAYMENT_IMMUTABLE'); END;
CREATE TRIGGER ticket_terms_immutable BEFORE UPDATE ON tickets WHEN OLD.id IS NOT NEW.id OR OLD.user_id IS NOT NEW.user_id OR OLD.round_id IS NOT NEW.round_id OR OLD.game IS NOT NEW.game OR OLD.numbers IS NOT NEW.numbers OR OLD.bonus IS NOT NEW.bonus OR OLD.request_key IS NOT NEW.request_key OR OLD.created IS NOT NEW.created BEGIN SELECT RAISE(ABORT,'TICKET_TERMS_IMMUTABLE'); END;
CREATE TRIGGER ticket_no_delete BEFORE DELETE ON tickets BEGIN SELECT RAISE(ABORT,'TICKET_IMMUTABLE'); END;
CREATE TRIGGER ticket_initial_grade BEFORE INSERT ON tickets WHEN NEW.prize!=0 OR NEW.tier!=0 BEGIN SELECT RAISE(ABORT,'INVALID_INITIAL_GRADE'); END;
CREATE TRIGGER payout_authorized BEFORE UPDATE OF prize,tier ON tickets BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM settlement_payments p JOIN rounds r ON r.id=p.round_id WHERE p.ticket_id=OLD.id AND p.round_id=OLD.round_id AND p.prize=NEW.prize AND p.tier=NEW.tier AND r.status='settled') THEN RAISE(ABORT,'PAYMENT_NOT_AUTHORIZED') END;
END;
CREATE TRIGGER ledger_no_update BEFORE UPDATE ON ledger BEGIN SELECT RAISE(ABORT,'LEDGER_IMMUTABLE'); END;
CREATE TRIGGER ledger_no_delete BEFORE DELETE ON ledger BEGIN SELECT RAISE(ABORT,'LEDGER_IMMUTABLE'); END;
CREATE TRIGGER anchor_no_update BEFORE UPDATE ON anchors BEGIN SELECT RAISE(ABORT,'ANCHOR_IMMUTABLE'); END;
CREATE TRIGGER anchor_no_delete BEFORE DELETE ON anchors BEGIN SELECT RAISE(ABORT,'ANCHOR_IMMUTABLE'); END;
CREATE TRIGGER proof_immutable BEFORE UPDATE ON rounds WHEN OLD.proof IS NOT NULL AND OLD.proof IS NOT NEW.proof BEGIN SELECT RAISE(ABORT,'PROOF_IMMUTABLE'); END;
CREATE TRIGGER settlement_proof_guard BEFORE UPDATE OF proof ON rounds WHEN OLD.proof IS NULL AND NEW.proof IS NOT NULL BEGIN
 SELECT CASE WHEN OLD.status!='open' OR NEW.status!='settled' OR NOT EXISTS(SELECT 1 FROM settlements WHERE round_id=OLD.id) OR NOT json_valid(NEW.proof) OR json_extract(NEW.proof,'$.commitment') IS NOT OLD.commitment OR json_extract(NEW.proof,'$.manifest.id') IS NOT OLD.id OR json_extract(NEW.proof,'$.version') IS NOT json_extract(OLD.manifest,'$.version') OR json_extract(NEW.proof,'$.mode') IS NOT json_extract(OLD.manifest,'$.mode') OR json_type(NEW.proof,'$.poolBefore') IS NOT 'integer' OR json_type(NEW.proof,'$.payout') IS NOT 'integer' OR json_type(NEW.proof,'$.poolAfter') IS NOT 'integer' OR json_extract(NEW.proof,'$.poolBefore') IS NOT (SELECT balance FROM pool WHERE id=1) OR json_extract(NEW.proof,'$.payout') IS NOT (SELECT COALESCE(SUM(prize),0) FROM settlement_payments WHERE round_id=OLD.id) OR json_extract(NEW.proof,'$.poolAfter') IS NOT json_extract(NEW.proof,'$.poolBefore')-json_extract(NEW.proof,'$.payout') OR (SELECT COUNT(*) FROM settlement_payments WHERE round_id=OLD.id)!=(SELECT COUNT(*) FROM tickets WHERE round_id=OLD.id) THEN RAISE(ABORT,'SETTLEMENT_SNAPSHOT_MISMATCH') END;
END;
CREATE TRIGGER public_round_no_delete BEFORE DELETE ON rounds WHEN OLD.status!='draft' OR EXISTS(SELECT 1 FROM tickets WHERE round_id=OLD.id) BEGIN SELECT RAISE(ABORT,'ROUND_IMMUTABLE'); END;
CREATE TRIGGER settlement_no_update BEFORE UPDATE ON settlements BEGIN SELECT RAISE(ABORT,'SETTLEMENT_IMMUTABLE'); END;
CREATE TRIGGER settlement_no_delete BEFORE DELETE ON settlements BEGIN SELECT RAISE(ABORT,'SETTLEMENT_IMMUTABLE'); END;
CREATE TABLE abuse_limits(bucket TEXT PRIMARY KEY,hits INTEGER NOT NULL,expires INTEGER NOT NULL);
CREATE INDEX abuse_expiry ON abuse_limits(expires);
CREATE TRIGGER attempts_no_update BEFORE UPDATE ON collection_attempts BEGIN SELECT RAISE(ABORT,'ATTEMPT_IMMUTABLE'); END;
CREATE TRIGGER attempts_no_delete BEFORE DELETE ON collection_attempts BEGIN SELECT RAISE(ABORT,'ATTEMPT_IMMUTABLE'); END;
