// Only public phase and pause state enter this module. Private visits never change music.
export const tracks={
  village:{title:'Country Village',file:'182_Country_Village.mp3',level:.38},
  night:{title:'Dark and Stormy',file:'60_Dark_and_Stormy.mp3',level:.55},
  voting:{title:'In the Shadows',file:'10_In_The_Shadows.mp3',level:.32},
  ending:{title:'Solemn Vow',file:'4_Solemn_Vow-a.mp3',level:.45}
};
export function trackForPhase(phase){
  if(phase==='night_choices'||phase==='night_results')return 'night';
  if(phase==='nominations')return 'voting';
  if(phase==='ended')return 'ending';
  return 'village';
}
export function createMusicPlayer({makeAudio=url=>new Audio(url),schedule=fn=>setInterval(fn,50),cancel=clearInterval,storage=localStorage,onStatus=()=>{}}={}){
  let activated=false,muted=storage.getItem('ravenswood-music-muted')==='true',phase=null,paused=false,volume=.4,current=null,timer=null,status='';
  const voices=new Set();
  function report(text){status=text;onStatus(text);}
  function release(voice){voice.audio.pause();voice.audio.removeAttribute('src');voice.audio.load();}
  function fade(){
    for(const voice of voices){const target=voice===current&&!paused&&!muted?volume*tracks[voice.key].level:0;
      voice.audio.volume+=Math.max(-.025,Math.min(.025,target-voice.audio.volume));
      if(voice!==current&&voice.audio.volume<.001){release(voice);voices.delete(voice);}
    }
  }
  function sync(){
    if(!activated)return;
    if(paused||muted){for(const v of voices)v.audio.pause();return;}
    const key=trackForPhase(phase);
    if(current?.key!==key){
      const audio=makeAudio('/assets/audio/'+tracks[key].file);audio.loop=true;audio.preload='none';audio.volume=0;
      const voice={audio,key};current=voice;voices.add(voice);
      audio.onerror=()=>{if(current===voice)report('Musik fehlt oder ist nicht lesbar. Audiodateien herunterladen.');};
    }
    const voice=current;
    // play() is called directly during the activation click for browser autoplay rules.
    Promise.resolve(voice.audio.play()).then(()=>{if(current===voice)report(tracks[key].title);}).catch(()=>{if(current===voice)report('Musik konnte nicht starten. Dateien und Audiofreigabe prüfen.');});
    timer??=schedule(fade);
  }
  return {
    activate(){activated=true;sync();},
    update(nextPhase,isPaused=false){if(phase===nextPhase&&paused===isPaused)return;phase=nextPhase;paused=isPaused;sync();},
    setVolume(value){volume=Number.isFinite(value)?Math.max(0,Math.min(1,value)):.4;for(const v of voices)v.audio.volume=muted?0:volume*tracks[v.key].level;},
    toggleMute(){muted=!muted;storage.setItem('ravenswood-music-muted',String(muted));sync();},
    get muted(){return muted;},get status(){return status;},
    dispose(){if(timer!==null)cancel(timer);for(const v of voices)release(v);voices.clear();current=null;activated=false;}
  };
}
