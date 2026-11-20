import Database from 'better-sqlite3';
import {mkdirSync} from 'node:fs';
import path from 'node:path';
import {z} from 'zod';
import {runtimeConfig} from '../../config/runtimeConfig';
import type {WorkspaceContext} from '../../context/workspaceContext';
let db:Database.Database|undefined;
function database(){
 if(db)return db;
 mkdirSync(runtimeConfig.systemDirectory,{recursive:true,mode:0o700});
 db=new Database(path.join(runtimeConfig.systemDirectory,'harness-trace.sqlite'));db.pragma('journal_mode = WAL');db.pragma('busy_timeout = 5000');
 db.exec('CREATE TABLE IF NOT EXISTS harness_events(seq INTEGER PRIMARY KEY AUTOINCREMENT,workspace_id TEXT NOT NULL,user_id TEXT NOT NULL,run_id TEXT NOT NULL,at TEXT NOT NULL,payload TEXT NOT NULL);CREATE INDEX IF NOT EXISTS harness_events_run ON harness_events(workspace_id,run_id,seq);');
 return db;
}
const eventSchema=z.object({runId:z.string().min(1).max(200),sessionId:z.string().max(160),turn:z.number().int().nonnegative(),node:z.enum(['orchestrator','context','agent','router','skills','tools','memory','guard','verify','output']),title:z.string().max(200),revision:z.number().int().nonnegative(),status:z.enum(['running','ok','error','unverified']),callId:z.string().max(200).optional(),data:z.unknown()}).strict();
export function recordHarnessEvent(context:WorkspaceContext,input:unknown){
 const event=eventSchema.parse(input),payload=JSON.stringify(event);if(Buffer.byteLength(payload)>240000)throw Error('TRACE_EVENT_TOO_LARGE');
 const d=database();d.prepare('INSERT INTO harness_events(workspace_id,user_id,run_id,at,payload) VALUES(?,?,?,?,?)').run(context.workspaceId,context.userId,event.runId,new Date().toISOString(),payload);
 // Bounded retention by run; keep complete runs rather than trimming their first events.
 d.prepare("DELETE FROM harness_events WHERE workspace_id=? AND run_id NOT IN (SELECT run_id FROM harness_events WHERE workspace_id=? GROUP BY run_id ORDER BY MAX(seq) DESC LIMIT 100)").run(context.workspaceId,context.workspaceId);
}
export function listHarnessRuns(context:WorkspaceContext){return database().prepare('SELECT run_id AS id,MIN(at) AS startedAt,MAX(at) AS updatedAt,COUNT(*) AS eventCount FROM harness_events WHERE workspace_id=? GROUP BY run_id ORDER BY MAX(seq) DESC LIMIT 100').all(context.workspaceId);}
export function readHarnessRun(context:WorkspaceContext,id:string){return (database().prepare('SELECT seq,at,payload FROM harness_events WHERE workspace_id=? AND run_id=? ORDER BY seq').all(context.workspaceId,id) as {seq:number;at:string;payload:string}[]).map(r=>({...JSON.parse(r.payload),seq:r.seq,at:r.at}));}
