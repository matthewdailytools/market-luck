-- ISOLATED REPLAY DATABASE ONLY. Never apply to LIVE.
CREATE TABLE test_clock(id INTEGER PRIMARY KEY,now INTEGER NOT NULL);
INSERT INTO test_clock VALUES(1,1793145600000);
PRAGMA foreign_keys = ON;
CREATE TABLE users(id TEXT PRIMARY KEY,name TEXT UNIQUE NOT NULL,password TEXT NOT NULL,salt TEXT NOT NULL,balance INTEGER NOT NULL DEFAULT 1000 CHECK(balance>=0));
CREATE TABLE sessions(token TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id),expires INTEGER NOT NULL);
CREATE TABLE pool(id INTEGER PRIMARY KEY CHECK(id=1),balance INTEGER NOT NULL CHECK(balance>=0));
INSERT INTO pool VALUES(1,100000);
CREATE TABLE rounds(id TEXT PRIMARY KEY,manifest TEXT NOT NULL,commitment TEXT NOT NULL,cutoff INTEGER NOT NULL,ready INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'open',proof TEXT);
CREATE TABLE tickets(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),round_id TEXT NOT NULL REFERENCES rounds(id),game TEXT NOT NULL,numbers TEXT NOT NULL,bonus INTEGER,request_key TEXT NOT NULL,created INTEGER NOT NULL,prize INTEGER NOT NULL DEFAULT 0,tier INTEGER NOT NULL DEFAULT 0,UNIQUE(user_id,request_key));
CREATE TABLE ledger(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id TEXT,round_id TEXT,kind TEXT NOT NULL,delta INTEGER NOT NULL,created INTEGER NOT NULL);
INSERT INTO ledger(kind,delta,created) VALUES('seed',100000,0);
CREATE TRIGGER signup AFTER INSERT ON users BEGIN INSERT INTO ledger(user_id,kind,delta,created) VALUES(NEW.id,'signup',1000,unixepoch()*1000); END;
CREATE TRIGGER buy BEFORE INSERT ON tickets BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM rounds WHERE id=NEW.round_id AND status='open' AND cutoff>NEW.created) THEN RAISE(ABORT,'已停售') END;
 SELECT CASE WHEN (SELECT balance FROM users WHERE id=NEW.user_id)<10 THEN RAISE(ABORT,'积分不足') END;
 UPDATE users SET balance=balance-10 WHERE id=NEW.user_id;
 UPDATE pool SET balance=balance+10 WHERE id=1;
 INSERT INTO ledger(user_id,round_id,kind,delta,created) VALUES(NEW.user_id,NEW.round_id,'purchase',-10,NEW.created);
END;
CREATE TRIGGER payout AFTER UPDATE OF prize ON tickets WHEN NEW.prize>0 AND OLD.prize=0 BEGIN
 UPDATE users SET balance=balance+NEW.prize WHERE id=NEW.user_id;
 UPDATE pool SET balance=balance-NEW.prize WHERE id=1;
 INSERT INTO ledger(user_id,round_id,kind,delta,created) VALUES(NEW.user_id,NEW.round_id,'prize',NEW.prize,unixepoch()*1000);
END;

CREATE TABLE settlements(round_id TEXT PRIMARY KEY REFERENCES rounds(id));

CREATE UNIQUE INDEX one_open_round ON rounds(status) WHERE status='open';

CREATE TABLE anchors(round_id TEXT PRIMARY KEY REFERENCES rounds(id),url TEXT NOT NULL,published INTEGER NOT NULL);

ALTER TABLE anchors ADD COLUMN verified_hash TEXT;
ALTER TABLE anchors ADD COLUMN verified_at INTEGER;
CREATE TABLE collection_attempts(id INTEGER PRIMARY KEY AUTOINCREMENT,round_id TEXT NOT NULL REFERENCES rounds(id),attempted INTEGER NOT NULL,ok INTEGER NOT NULL,reason TEXT NOT NULL);
DROP TRIGGER buy;
CREATE TRIGGER buy BEFORE INSERT ON tickets BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM rounds WHERE id=NEW.round_id AND status='open' AND cutoff>(SELECT now FROM test_clock WHERE id=1)) THEN RAISE(ABORT,'已停售') END;
 SELECT CASE WHEN (SELECT balance FROM users WHERE id=NEW.user_id)<10 THEN RAISE(ABORT,'积分不足') END;
 UPDATE users SET balance=balance-10 WHERE id=NEW.user_id;
 UPDATE pool SET balance=balance+10 WHERE id=1;
 INSERT INTO ledger(user_id,round_id,kind,delta,created) VALUES(NEW.user_id,NEW.round_id,'purchase',-10,NEW.created);
END;
CREATE TRIGGER live_insert BEFORE INSERT ON rounds WHEN json_extract(NEW.manifest,'$.mode')='LIVE' BEGIN
 SELECT CASE WHEN NEW.status!='draft' OR NEW.cutoff!=json_extract(NEW.manifest,'$.cutoff') OR NEW.ready!=json_extract(NEW.manifest,'$.ready') OR NEW.cutoff<(SELECT now FROM test_clock WHERE id=1)+3600000 THEN RAISE(ABORT,'INVALID_LIVE_TIMING') END;
END;
CREATE TRIGGER live_immutable BEFORE UPDATE ON rounds WHEN json_extract(OLD.manifest,'$.mode')='LIVE' OR json_extract(NEW.manifest,'$.mode')='LIVE' BEGIN
 SELECT CASE WHEN OLD.manifest!=NEW.manifest OR OLD.id!=NEW.id OR OLD.commitment!=NEW.commitment OR OLD.cutoff!=NEW.cutoff OR OLD.ready!=NEW.ready THEN RAISE(ABORT,'LIVE_MANIFEST_IMMUTABLE') END;
 SELECT CASE WHEN NEW.status='open' AND OLD.status!='open' AND (OLD.status!='draft' OR NEW.cutoff<=(SELECT now FROM test_clock WHERE id=1) OR NOT EXISTS(SELECT 1 FROM anchors WHERE round_id=NEW.id AND verified_hash=NEW.commitment AND verified_at IS NOT NULL)) THEN RAISE(ABORT,'LIVE_PUBLICATION_REQUIRED') END;
 SELECT CASE WHEN OLD.status IN ('settled','paused') AND NEW.status!=OLD.status THEN RAISE(ABORT,'LIVE_STATE_IMMUTABLE') END;
END;
CREATE TRIGGER settlement_guard BEFORE INSERT ON settlements BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM rounds WHERE id=NEW.round_id AND status='open' AND ready<=(SELECT now FROM test_clock WHERE id=1) AND cutoff<=(SELECT now FROM test_clock WHERE id=1)) THEN RAISE(ABORT,'MARKETS_NOT_FINAL') END;
END;

