import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, openSync, closeSync, symlinkSync, existsSync, copyFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

export async function sequential(total:number, task:(id:number)=>Promise<boolean|void>) {
  for(let id=1;id<=total;id++)if(await task(id)===false)break;
}

export async function main() {
  const args=process.argv.slice(2);
  if(args.includes('--help')) {console.log('npm run playtest:loop -- [--total 10] [--timeout-minutes 90]');return;}
  function option(name:string,fallback:number) {
    const i=args.indexOf(name), value=i<0?fallback:Number(args[i+1]);
    if(!Number.isInteger(value)||value<1)throw new Error(`Invalid ${name}`);
    return value;
  }
  for(let i=0;i<args.length;i+=2)if(!['--total','--timeout-minutes'].includes(args[i]))throw new Error(`Unknown option ${args[i]}`);
  const total=option('--total',10), concurrency=1, timeout=option('--timeout-minutes',90)*60000;
  const root=process.cwd();
  function git(cwd:string,...args:string[]) {
    const result=spawnSync('git',['-c','user.name=Playtest Automation','-c','user.email=playtest@localhost',...args],{cwd,encoding:'utf8'});
    if(result.status!==0)throw new Error(result.stderr||result.stdout||String(result.error));
    return result.stdout.trim();
  }
  if(git(root,'status','--porcelain'))throw new Error('Commit or stash changes before starting the loop.');
  if(spawnSync('codex',['exec','--help']).status!==0)throw new Error('Codex CLI is required. Run codex login first.');
  const output=resolve('test-results',`agent-loop-${Date.now()}`);
  mkdirSync(output,{recursive:true});
  const results:any[]=[];
  let interrupted=false;
  const interrupt=()=>{interrupted=true;process.exitCode=130;};
  process.on('SIGINT',interrupt);process.on('SIGTERM',interrupt);
  const save=()=>writeFileSync(join(output,'summary.json'),JSON.stringify({total,concurrency,results},null,2));
  function run(command:string,args:string[],cwd:string,log:string,input?:string):Promise<void> {
    return new Promise((ok,fail)=>{
      const fd=openSync(log,'a');
      const child=spawn(command,args,{cwd,stdio:['pipe',fd,fd],detached:true});
      closeSync(fd);
      const kill=()=>{try{process.kill(-child.pid!,'SIGKILL');}catch{}};
      const timer=setTimeout(kill,timeout);
      const stop=()=>kill();
      process.once('SIGINT',stop);process.once('SIGTERM',stop);
      child.stdin.on('error',()=>{});child.stdin.end(input);
      const cleanup=()=>{clearTimeout(timer);process.off('SIGINT',stop);process.off('SIGTERM',stop);};
      child.once('error',error=>{cleanup();fail(error);});
      child.once('exit',(code,signal)=>{cleanup();kill();code===0?ok():fail(new Error(`${command} exited ${code??signal}; see ${log}`));});
    });
  }
  console.log(`Running ${total} agents, ${concurrency} at a time. Reports: ${output}`);
  await sequential(total,async id=>{
    if(interrupted)return false;
    const directory=join(output,`agent-${id}`), workspace=join(directory,'workspace');
    mkdirSync(directory,{recursive:true});
    const result:any={id,status:'running',directory};results.push(result);save();
    try {
      git(root,'worktree','add','--detach',workspace,'HEAD');
      if(existsSync(join(root,'node_modules')))symlinkSync(join(root,'node_modules'),join(workspace,'node_modules'),'dir');
      if(existsSync(join(root,'.env')))copyFileSync(join(root,'.env'),join(workspace,'.env'));
      const focus=['private/public separation and automatic login','voting, deaths, ties and rule correctness','layout, controls, tutorial and accessibility'][(id-1)%3];
      const prompt=`You are playtesting agent ${id} of ${total}. Read docs/PLAYTEST.md and docs/RULES.md. Use the interactive npm run --silent playtest Playwright harness in a persistent PTY. Personally play a complete normal game as all players and assistant, inspect screenshots of the laptop, projector, and each phone, and exercise the guide's coverage checklist. Use ${7+(id-1)%4} players. Focus especially on ${focus}. Verify simultaneous shared night choices and results, including dead-player confirmations, locked choices, and conditional Ravenkeeper targets. Never rely on closed eyes, individual calls, laptop visits, or visit countdowns. Exercise phone conceal/reveal, reload persistence, automatic login using the identifier in local storage, private Q&A, and the phone tutorial. Check public/private separation and 320px/390px phone layouts. Register each player from an isolated phone1–phone10 browser using their name and clockwise seat, select only the assistant on the laptop, and leave Proberunde unchecked. Keep real Storyteller AI enabled; do not substitute the scripted smoke test or inspect secret state to choose gameplay. Fix reproducible bugs and incorrect behavior you find in this worktree. Add meaningful regression tests and replay affected browser steps after fixes. Run npm test. Finish the harness with honest findings and save a final report of reproduction steps, fixes, checks, winner or blockers, player count, phone coverage, unreached checks, and artifact paths. Do not claim a complete game if blocked. Do not change .env, dependencies, supplied PDFs, or this loop. Do not create commits, merge, switch branches, or spawn more agents. Your controller collects changes. Do not modify files outside this worktree. If blocked by credentials or infrastructure, report the blocker rather than inventing results.`;
      writeFileSync(join(directory,'prompt.txt'),prompt);
      console.log(`Agent ${id} started`);
      await run('codex',['exec','-c','approval_policy="never"','--skip-git-repo-check','--sandbox','danger-full-access','--json','-C',workspace,'-o',join(directory,'report.md'),'-'],workspace,join(directory,'events.jsonl'),prompt);
      await run('npm',['test'],workspace,join(directory,'tests.log'));
      const files=git(workspace,'ls-files','-z','--cached','--others','--exclude-standard').split('\0')
        .filter(file=>file&&!['node_modules','.env','data','test-results'].includes(file.split('/')[0]));
      if(files.length)git(workspace,'add','--all','--',...files);
      if(!git(workspace,'diff','--cached','--name-only'))result.status='no-changes';
      else {
        git(workspace,'commit','-m',`Playtest agent ${id}: fix observed issues`);
        result.commit=git(workspace,'rev-parse','HEAD');
        const integrate=async()=>{
          const check=join(directory,'integration');
          git(root,'worktree','add','--detach',check,'HEAD');
          symlinkSync(join(root,'node_modules'),join(check,'node_modules'),'dir');
          git(check,'cherry-pick',result.commit);
          await run('npm',['test'],check,join(directory,'integration-tests.log'));
          if(git(root,'status','--porcelain'))throw new Error('Main workspace changed; retaining fix for manual integration.');
          git(root,'merge','--ff-only',git(check,'rev-parse','HEAD'));
          result.status='merged';
        };
        await integrate();
      }
    } catch(error) {result.status='failed';result.error=String(error);}
    result.finishedAt=new Date().toISOString();save();
    console.log(`Agent ${id}: ${result.status}${result.error?` (${result.error})`:''}`);
    return !interrupted&&result.status!=='failed';
  });
  process.off('SIGINT',interrupt);process.off('SIGTERM',interrupt);
  if(results.some(r=>r.status==='failed'))process.exitCode=1;
  console.log(`Finished. Summary: ${join(output,'summary.json')}`);
}
if(process.argv[1]&&resolve(process.argv[1])===resolve(import.meta.filename))main().catch(error=>{console.error(error);process.exitCode=1;});
