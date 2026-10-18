import type { Role, Team, Character } from './characters.ts';
export type Phase = 'distribution' | 'night_choices' | 'night_results' | 'dawn' | 'discussion' | 'nominations' | 'ended';
export type CueKind = 'night' | 'player' | 'assistant' | 'attention' | 'timer';
export type Information = { night: number; text: string; grimoire?: GrimoireEntry[] };
export type GrimoireEntry = { id:string; name:string; seat:number; character:Role; team:Team; alive:boolean; markers:string[] };
export type Player = { id:string; name:string; seat:number; role:Role; apparent:Role; team:Team; alive:boolean; ghostVote:boolean; usedSlayer:boolean; usedVirgin:boolean; info:Information[]; notifiedRole:Role; master?:string };
export type DecisionRecord = { key:string; kind:string; choice:string; reason:string };
export type DecisionRequest = { key:string; kind:string; prompt:string; options:{id:string;label:string}[]; fallback:string; context?:unknown };
export type Decider = (request:DecisionRequest) => Promise<{choice:string;reason:string}>;
export type Command = { type:string; [key:string]:unknown };
export type Game = {
  id:string; version:number; seed:number; demo:boolean; createdAt:number; phase:Phase; night:number; day:number;
  players:Player[]; assistantId:string; queueIndex:number; choices:Record<string,string[]>; resultDone:string[];
  redHerring:string; bluffs:Role[]; poison?:{source:string;target:string}; protection?:{source:string;target:string};
  nightDeaths:string[]; publicDead:string[]; ravenPending:string[]; ravenPoisoned:Record<string,boolean>;
  executed?:{playerId:string;role:Role}; nightExecuted?:{playerId:string;role:Role}; nightStartAlive:string[];
  nominated:string[]; nominators:string[]; ballots:{nominee:string;voters:string[];total:number}[];
  nomination?:{nominator:string;nominee:string}; voteDraft:string[];
  announcement?:{id:string;title:string;text:string}; cue:{id:number;kind:CueKind};
  timer:{remainingMs:number;deadline:number|null}; paused:boolean; winner?:Team; endReason?:string;
  events:{day:number;night:number;text:string}[]; decisions:DecisionRecord[];  minimumVisitMs:number;
  infoMarkers:Record<string,string[]>;
  story:{day:number;night:number;text:string}[];resumeTimer?:boolean;
};
export type PublicPlayer = { id:string;name:string;seat:number;alive:boolean;ghostVote:boolean };
export type PublicGameView = {
  id:string; version:number; demo:boolean; phase:Phase; night:number;day:number;players:PublicPlayer[];assistantId:string;
  nextPlayer:PublicPlayer|null; announcement:Game['announcement']; cue:Game['cue'];timer:Game['timer'];paused:boolean;
  nomination:Game['nomination'];ballots:Game['ballots'];voteDraft:string[];nominators:string[];nominated:string[];
  executionCandidate:string|null; tied:boolean; threshold:number; events:Game['events'];winner?:Team;endReason?:string;
  reveal?:GrimoireEntry[];minimumVisitMs:number;
  debrief?:Game['story'];
};
export type AssistantView = PublicGameView & {service:{mode:string;status:string;spent:number;model:string}};
export type PlayerPrivateView = { id:string;name:string;character:Character;team:Team;info:Information[];opening:string[];
  action:{kind:string;count:number;excludeSelf:boolean;prompt:string}|null;targets:PublicPlayer[];phase:Phase;night:number;
  history:{role:string;text:string}[];minimumVisitMs:number };

/** Capabilities are separate: narration never receives the secret decision context. */
export type DecisionContext = {
  schemaVersion:1; gameId:string; phase:Phase; night:number; day:number;
  grimoire:GrimoireEntry[]; choices:Record<string,string[]>;
  information:{playerId:string;apparent:Role;history:Information[]}[];
  redHerring:string; bluffs:Role[]; recentDecisions:DecisionRecord[]; request:unknown;
};
export type NarrationRequest = {
  schemaVersion:1; audience:'public'; language:'de';
  state:PublicGameView; announcement:{id:string;title:string;text:string};
};
export type Narrator = (request:NarrationRequest)=>Promise<string>;
export type GameMasterServices = { decide:Decider; narrate?:Narrator };
