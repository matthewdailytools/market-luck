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
