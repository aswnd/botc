import type { Game, Phase, Command } from '../shared/types.ts';

/** Persistent phases remain compatible with saved games. Substates are derived,
 * so announcements and in-progress ballots cannot drift out of sync. */
export type MachineState = Phase | 'announcement' | 'voting' | 'paused';
export function machineState(g:Game):MachineState {
  if(g.paused)return 'paused';
  if(g.announcement)return 'announcement';
  if(g.phase==='nominations'&&g.nomination)return 'voting';
  return g.phase;
}
export const transitions:Record<Phase,readonly Phase[]> = {
  distribution:['night_choices'], night_choices:['night_results','ended'],
  night_results:['dawn','ended'], dawn:['discussion'],
  discussion:['nominations','ended'], nominations:['night_choices','ended'], ended:[],
};
export function transition(g:Game,target:Phase) {
  if(!transitions[g.phase].includes(target))throw new Error(`Illegal engine transition: ${g.phase} -> ${target}`);
  g.phase=target;
}
const commands:Record<MachineState,readonly string[]> = {
  distribution:['visit'],night_choices:['visit'],night_results:['visit'],dawn:[],
  discussion:['timer','nominations','slayer'],
  nominations:['nominate','close_day','slayer'],voting:['vote_draft','vote_confirm'],
  announcement:['ack','timer'],ended:[],paused:[],
};
export function accepts(g:Game,event:Command):boolean {
  if(event.type==='pause'||event.type==='timer_elapsed')return true;
  if(g.paused)return false;
  if(event.type==='attention'||event.type==='replay')return true;
  return commands[machineState(g)].includes(event.type);
}
