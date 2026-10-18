import { applyCommand as command } from '../server/engine.ts';
import type { Decider } from '../shared/types.ts';
export const testDecider:Decider=async r=>({choice:r.fallback,reason:'Test decision'});
export function applyCommand(g:Parameters<typeof command>[0],c:Parameters<typeof command>[1],services:Parameters<typeof command>[2]=testDecider,now?:number){return command(g,c,services,now);}
