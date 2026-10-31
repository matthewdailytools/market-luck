-- Published LIVE rounds may never be hidden again by moving back to draft.
CREATE TRIGGER live_state_machine BEFORE UPDATE OF status ON rounds WHEN json_extract(OLD.manifest,'$.mode')='LIVE' BEGIN
 SELECT CASE WHEN NEW.status NOT IN ('draft','open','paused','settled') OR (OLD.status='draft' AND NEW.status NOT IN ('draft','open')) OR (OLD.status='open' AND NEW.status NOT IN ('open','paused','settled')) OR (OLD.status IN ('paused','settled') AND NEW.status!=OLD.status) THEN RAISE(ABORT,'LIVE_STATE_TRANSITION_FORBIDDEN') END;
 SELECT CASE WHEN OLD.status!='settled' AND NEW.status='settled' AND (NEW.proof IS NULL OR NOT EXISTS(SELECT 1 FROM settlements WHERE round_id=OLD.id)) THEN RAISE(ABORT,'LIVE_SETTLEMENT_REQUIRED') END;
END;
