import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Game } from '../shared/types.ts';

export class Store {
  db:DatabaseSync;
  constructor(path:string) {
    if(path!==':memory:')mkdirSync(dirname(path),{recursive:true});
    this.db=new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS games(id TEXT PRIMARY KEY, state TEXT NOT NULL, updated INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS commands(id TEXT PRIMARY KEY, game_id TEXT NOT NULL, version INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS audit(seq INTEGER PRIMARY KEY, game_id TEXT NOT NULL, command TEXT NOT NULL, state TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS chat(seq INTEGER PRIMARY KEY, game_id TEXT NOT NULL, player_id TEXT NOT NULL, role TEXT NOT NULL, text TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS usage(id TEXT PRIMARY KEY, game_id TEXT NOT NULL, amount REAL NOT NULL, status TEXT NOT NULL);
    `);
  }
  load():Game|null {const r=this.db.prepare('SELECT state FROM games ORDER BY updated DESC, rowid DESC LIMIT 1').get() as {state:string}|undefined;return r?JSON.parse(r.state):null;}
  save(g:Game,commandId?:string,command?:unknown) {
    this.db.exec('BEGIN IMMEDIATE');
    try{
      this.db.prepare('INSERT INTO games VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET state=excluded.state, updated=excluded.updated').run(g.id,JSON.stringify(g),Date.now());
      if(commandId)this.db.prepare('INSERT INTO commands VALUES (?,?,?)').run(commandId,g.id,g.version);
      this.db.prepare('INSERT INTO audit(game_id,command,state) VALUES (?,?,?)').run(g.id,JSON.stringify(command??{type:'create'}),JSON.stringify(g));
      this.db.exec('COMMIT');
    }catch(e){this.db.exec('ROLLBACK');throw e;}
  }
  hasCommand(id:string) {return !!this.db.prepare('SELECT 1 FROM commands WHERE id=?').get(id);}
  history(gameId:string,playerId:string):{role:string;text:string}[] {return this.db.prepare('SELECT role,text FROM (SELECT seq,role,text FROM chat WHERE game_id=? AND player_id=? ORDER BY seq DESC LIMIT 30) ORDER BY seq').all(gameId,playerId) as {role:string;text:string}[];}
  addChat(gameId:string,playerId:string,question:string,answer:string) {
    this.db.exec('BEGIN IMMEDIATE');try{const q=this.db.prepare('INSERT INTO chat(game_id,player_id,role,text) VALUES (?,?,?,?)');q.run(gameId,playerId,'user',question);q.run(gameId,playerId,'assistant',answer);this.db.exec('COMMIT');}catch(e){this.db.exec('ROLLBACK');throw e;}
  }
  spent(gameId:string):number {return (this.db.prepare('SELECT COALESCE(SUM(amount),0) AS total FROM usage WHERE game_id=?').get(gameId) as {total:number}).total;}
  reserve(gameId:string,id:string,amount:number) {
    this.db.exec('BEGIN IMMEDIATE');try{this.db.prepare('INSERT INTO usage VALUES (?,?,?,?)').run(id,gameId,amount,'reserved');this.db.exec('COMMIT');return true;}catch(e){this.db.exec('ROLLBACK');throw e;}
  }
  settle(id:string,amount:number) {this.db.prepare("UPDATE usage SET amount=?,status='settled' WHERE id=?").run(amount,id);}
  close(){this.db.close();}
}
