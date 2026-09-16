/* Scrap Hunter — standalone, fixed 60 Hz simulation; procedural art and audio. */
(() => {
  'use strict';
  const {parts:P, text:T, slots:SLOTS, enemies:EN, recipes, quality:Q, colors:QC} = window.ScrapData;
  const $ = id => document.getElementById(id);
  const canvas = $('world');
  let ctx = canvas.getContext('2d');
  const mainContext = ctx, previewCanvas = $('robot-preview'), previewContext = previewCanvas.getContext('2d');
  const TAU = Math.PI * 2, STEP = 1/60, WIDTH = 1600, HEIGHT = 1100;
  const BASE = Object.keys(P).slice(0,15), SLOT_KEYS = Object.keys(SLOTS);
  const clamp = (n,a,b) => Math.max(a,Math.min(b,n));
  const dist = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);
  const dev = new URLSearchParams(location.search).has('dev');
  let rng = 7, uid = 0, state, viewW = 1000, viewH = 660, scale = 1, camX=0, camY=0;
  let inventoryPage=0, garagePanel='all';
  const compactGarage=()=>innerWidth<1100 || innerHeight<650;
  const inventoryPageSize=()=>innerWidth<600?4:6;
  let selected = null, forge = [null,null], keys = new Set(), touchX=0,touchY=0,touchDash=false;
  let audio, sound=true, shake=true, toastUntil=0, lastSound=0, accumulator=0, last=performance.now();
  let renderClock=0, frames=0, fps=60, fpsAt=last, uiClock=0, shakePower=0;
  const rngNext = () => { rng ^= rng<<13; rng ^= rng>>>17; rng ^= rng<<5; return (rng>>>0)/4294967296; };
  const random = (a,b) => a+(b-a)*rngNext();
  const makePart = (id,q=0) => ({uid:++uid,id,q,dur:100,cd:0});
  const power = p => 1+p.q*.5;
  const partName = p => `${Q[p.q]} · ${P[p.id].name}`;
  const heatOf = p => Math.round(P[p.id].heat*(1+p.q*.18));
  const currentPart = () => state.inventory.find(p=>p.uid===selected) || Object.values(state.equipment).find(p=>p?.uid===selected);
  const active = kind => Object.values(state.equipment).some(p=>p && p.dur>0 && P[p.id].kind===kind);
  const hasId = id => Object.values(state.equipment).some(p=>p && p.dur>0 && p.id===id);
  function reset(seed = Date.now()) {
    rng = (seed|0)||7; uid=0;
    state = {phase:'intro',wave:0,time:40,totalTime:0,kills:0,waveKills:0,scrap:0,heat:0,over:0,fault:0,warning:0,spawn:0,magnetCD:0,
      enemies:[],shots:[],drops:[],fx:[],numbers:[],mines:[],drones:[],inventory:[makePart('flame'),makePart('magnet'),makePart('battery')],
      equipment:{head:makePart('laser'),left:makePart('saw'),core:null,right:null,chassis:makePart('tracks'),module:null},
      player:{x:800,y:550,hp:100,maxHp:100,r:14,angle:0,dash:0,dashCD:0,inv:0,dx:0,dy:1,baseCD:0},rewards:[],rewardTaken:false,bossDead:false};
    selected=null;forge=[null,null];keys.clear();touchX=touchY=0;touchDash=false;shakePower=0;
    document.querySelector('.game-layout').append(document.querySelector('.sidebar'));
    document.body.classList.remove('workshop-active');
    for(const id of ['workshop','result','pause-screen']) $(id).classList.add('hidden');
    $('intro').classList.remove('hidden'); refreshStats(); updateUI(); renderLoadout();
  }
  function refreshStats() {
    const p=state.player, old=p.maxHp;
    state.heat=0;state.cooling=100;state.damage=1;state.speed=190;state.reduction=1;state.regen=0;
    for(const item of Object.values(state.equipment)) {
      if(!item || item.dur<=0) continue;
      const d=P[item.id], mult=power(item); state.heat+=heatOf(item);
      if(d.kind==='battery')state.cooling+=45*mult;
      if(d.kind==='tracks')state.speed+=48*mult;
      if(d.kind==='berserk')state.damage+=.35*mult;
      if(d.kind==='repair')state.regen+=.7*mult;
      if(d.kind==='shield')state.reduction=d.thorns?.6:.7;
    }
    p.maxHp=100+(hasId('thorn')?40:active('shield')?25:0);
    p.hp=clamp(p.hp*(p.maxHp/old),0,p.maxHp);
    state.droneCount=0;
    for(const item of Object.values(state.equipment))if(item?.dur>0 && P[item.id].kind==='drone')state.droneCount+=3+item.q+(active('battery')?2:0);
  }
  function toast(text) { $('toast').textContent=text; $('toast').classList.add('visible');toastUntil=performance.now()+3200; }
  function audioInit(){if(!audio){const AC=window.AudioContext||window.webkitAudioContext;if(AC)audio=new AC();}audio?.resume().catch(()=>{});}
  function beep(type) {
    if(!sound || !audio || audio.state!=='running')return;
    const now=audio.currentTime;if(type==='shot' && now-lastSound<.085)return;lastSound=now;
    const settings={shot:[180,70,.055,'square',.016],hit:[110,40,.12,'sawtooth',.035],pickup:[650,1100,.07,'sine',.018],explosion:[100,25,.2,'sawtooth',.04],fusion:[400,1400,.3,'triangle',.035],switch:[220,95,.035,'square',.012]};
    const [a,b,d,w,v]=settings[type],osc=audio.createOscillator(),gain=audio.createGain();
    osc.type=w;osc.frequency.setValueAtTime(a,now);osc.frequency.exponentialRampToValueAtTime(b,now+d);
    gain.gain.setValueAtTime(v,now);gain.gain.exponentialRampToValueAtTime(.0001,now+d);
    osc.connect(gain);gain.connect(audio.destination);osc.start(now);osc.stop(now+d);osc.onended=()=>{osc.disconnect();gain.disconnect();};
  }
  function startWave() {
    if(state.phase==='workshop' && !state.rewardTaken){toast(T.needReward);return;}
    state.wave++;state.phase='battle';state.time=40;state.waveKills=state.kills;state.spawn=.5;state.over=0;state.warning=0;state.fault=0;
    state.enemies=[];state.shots=[];state.drops=[];state.mines=[];state.fx=[];state.numbers=[];
    state.player.x=800;state.player.y=550;state.player.inv=1.5;state.player.dashCD=0;
    keys.clear();selected=null;forge=[null,null];refreshStats();
    document.querySelector('.game-layout').append(document.querySelector('.sidebar'));
    $('intro').classList.add('hidden');$('workshop').classList.add('hidden');document.body.classList.remove('workshop-active');

    if(state.wave===10){spawnEnemy(8);toast(T.bossIncoming);}else if(state.wave<=8)toast(`${T.wave} ${state.wave} · ${T.newEnemy}：${EN[state.wave-1].name}`);
    updateUI();renderLoadout();audioInit();
  }
  function finishWave() {
    if(state.phase!=='battle')return;
    if(state.wave===10){finishGame(true);return;}
    for(const drop of state.drops)collect(drop,false);
    state.drops=[];state.enemies=[];state.shots=[];state.mines=[];
    state.scrap+=22+state.wave*3;state.player.hp=Math.min(state.player.maxHp,state.player.hp+30);
    for(const p of Object.values(state.equipment))if(p)p.dur=Math.max(0,p.dur-3);
    state.phase='workshop';state.rewards=[];state.rewardTaken=false;inventoryPage=0;garagePanel=compactGarage()?'rewards':'all';
    const candidates=[...BASE];
    for(let n=0;n<3;n++){const i=Math.floor(rngNext()*candidates.length);state.rewards.push(makePart(candidates.splice(i,1)[0],state.wave>=6 && rngNext()<.4?1:0));}
    // Two salvaged parts ensure fusion choices are available beyond the single reward.
    for(let n=0;n<2;n++)state.inventory.push(makePart(BASE[Math.floor(rngNext()*BASE.length)]));
    state.over=0;state.warning=0;state.fault=0;
    $('wave-summary').textContent=`${T.kill} ${state.kills-state.waveKills} · ${T.summary} ${22+state.wave*3} · +2 ${T.pickups[3]}`;
    document.querySelector('.workshop-grid').prepend(document.querySelector('.sidebar'));
    $('workshop').classList.remove('hidden');document.body.classList.add('workshop-active');
    toast(T.waveClear);refreshStats();renderWorkshop();updateUI();

  }
  function finishGame(win){state.phase=win?'win':'lose';$('result').classList.remove('hidden');$('result-tag').textContent=win?T.winTag:T.loseTag;$('result-title').textContent=win?T.winTitle:T.loseTitle;$('result-copy').textContent=`${win?T.winCopy:T.loseCopy} ${T.wave} ${state.wave}/10 · ${T.kill} ${state.kills} · ${Math.floor(state.totalTime/60)}m ${Math.floor(state.totalTime%60)}s`;$('pause-screen').classList.add('hidden');beep(win?'fusion':'explosion');updateUI();}
  function togglePause(){if(state.phase==='battle'){state.phase='paused';keys.clear();touchX=touchY=0;touchDash=false;$('pause-screen').classList.remove('hidden');audio?.suspend();}else if(state.phase==='paused'){state.phase='battle';$('pause-screen').classList.add('hidden');audioInit();}updateUI();}
  function spawnEnemy(type,x,y) {
    if(state.enemies.length>=150)return;
    const boss=type===8,d=boss?{hp:4200,speed:42,r:64,damage:23,color:'#cf7252'}:EN[type];
    if(x===undefined){const angle=random(0,TAU),radius=random(470,610);x=clamp(state.player.x+Math.cos(angle)*radius,55,WIDTH-55);y=clamp(state.player.y+Math.sin(angle)*radius,55,HEIGHT-55);}
    const hp=d.hp*(boss?1:1+(state.wave-1)*.13);
    state.enemies.push({id:++uid,type,x,y,hp,maxHp:hp,r:d.r,speed:d.speed,color:d.color,damage:d.damage,cd:random(1,3),flash:0,burn:0,burnTick:0,kx:0,ky:0,charge:0,aim:0,tele:0,heal:0,dead:false});
  }
  function effect(x,y,r,color,life=.3,kind='ring',x2=0,y2=0){if(state.fx.length<260)state.fx.push({x,y,r,color,life,max:life,kind,x2,y2});}
  function number(x,y,value,color='#edf0de',target=null){
    const recent=target===null?null:state.numbers.find(n=>n.target===target && n.life>.58);
    if(recent){recent.amount+=value;recent.value=String(Math.ceil(recent.amount));return;}
    if(state.numbers.length<70)state.numbers.push({x,y,amount:value,value:String(Math.ceil(value)),life:.7,color,target});
  }
  function hurtPlayer(amount) {
    const p=state.player;if(p.inv>0||p.dash>0)return;
    p.hp-=amount*state.reduction;p.inv=.65;shakePower=6;number(p.x,p.y-30,-amount*state.reduction,'#ff8062');beep('hit');
    for(const item of Object.values(state.equipment))if(item)item.dur=Math.max(0,item.dur-1.8);
    refreshStats();if(p.hp<=0)finishGame(false);
  }
  function hit(e,damage,burn=false,kb=30,chainDepth=0) {
    if(e.dead)return;e.hp-=damage;e.flash=.075;if(burn)e.burn=2.5;
    const angle=Math.atan2(e.y-state.player.y,e.x-state.player.x);e.kx+=Math.cos(angle)*kb;e.ky+=Math.sin(angle)*kb;
    number(e.x,e.y-e.r,damage,'#edf0de',e.id);
    if(e.hp<=0){e.dead=true;state.kills++;effect(e.x,e.y,e.r*1.7,'#eba557',.25,'burst');
      const roll=rngNext(),kind=roll>.975?3:roll>.87?2:roll>.66?1:0;
      if(state.drops.length<250)state.drops.push({x:e.x,y:e.y,kind,age:0});else state.scrap+=1;
      if(active('vampire'))state.player.hp=Math.min(state.player.maxHp,state.player.hp+.8);
      if(e.type===5)for(let i=0;i<2;i++)spawnEnemy(0,e.x+random(-18,18),e.y+random(-18,18));
      if(e.type===8)state.bossDead=true;
      if(chainDepth<3 && (active('inferno') || (active('explosive') && state.kills%3===0)))blast(e.x,e.y,100,22*state.damage,'#f7a94c',chainDepth+1);
    }
  }
  function blast(x,y,r,damage,color='#f7b35b',depth=0){effect(x,y,r,color,.4,'burst');shakePower=Math.max(shakePower,3);beep('explosion');for(const e of state.enemies)if(!e.dead && Math.hypot(e.x-x,e.y-y)<r+e.r)hit(e,damage,false,65,depth);}
  function nearest(x,y,range=9999){let best=null,bestD=range;for(const e of state.enemies){if(e.dead)continue;const d=Math.hypot(e.x-x,e.y-y);if(d<bestD){bestD=d;best=e;}}return best;}
  function shoot(x,y,angle,damage,kind='bullet',enemy=false,speed=560){if(state.shots.length<360)state.shots.push({x,y,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,damage,kind,enemy,life:2,r:kind==='rocket'?6:4});}
  function lightning(x,y,target,damage){let prior=target;hit(prior,damage,false,15);effect(x,y,0,'#9ce1d9',.16,'line',prior.x,prior.y);const touched=[prior.id];for(let i=0;i<2;i++){let next=null;for(const e of state.enemies)if(!e.dead && !touched.includes(e.id) && dist(e,prior)<130){next=e;break;}if(!next)break;effect(prior.x,prior.y,0,'#9ce1d9',.16,'line',next.x,next.y);hit(next,damage*.7,false,15);touched.push(next.id);prior=next;}}
  function attacks(dt) {
    const p=state.player;
    if(state.fault>0)return;
    let weapons=0;
    for(const item of Object.values(state.equipment)) {
      if(!item||item.dur<=0)continue;const d=P[item.id];if(!d.damage)continue;weapons++;item.cd-=dt;
      if(item.cd>0)continue;
      const target=nearest(p.x,p.y,d.range);if(!target){item.cd=.08;continue;}
      const a=Math.atan2(target.y-p.y,target.x-p.x),damage=d.damage*power(item)*state.damage;
      item.cd=d.rate;p.angle=a;
      if(d.kind==='saw'){
        const moving=p.moving && active('tracks');effect(p.x,p.y,d.range,'#e8c575',.18,'arc',a);
        for(const e of state.enemies)if(!e.dead&&dist(p,e)<d.range+e.r)hit(e,damage*(moving?1.5:1),d.burn,90);
      }else if(d.kind==='flame'){
        effect(p.x,p.y,d.range,'#f5a04e',.2,'flame',a);
        for(const e of state.enemies){if(e.dead)continue;let delta=Math.atan2(e.y-p.y,e.x-p.x)-a;delta=Math.atan2(Math.sin(delta),Math.cos(delta));if(dist(p,e)<d.range+e.r && Math.abs(delta)<.65)hit(e,damage,true,8);if(d.magnetic && dist(p,e)<d.range+65){e.x+=(p.x-e.x)*.055;e.y+=(p.y-e.y)*.055;}}
      }else if(d.kind==='laser'){
        const angles=d.split?[a-.24,a,a+.24]:[a];
        for(const angle of angles){const ex=p.x+Math.cos(angle)*d.range,ey=p.y+Math.sin(angle)*d.range;effect(p.x,p.y,0,'#e5e9ab',.16,'line',ex,ey);for(const e of state.enemies){const dx=e.x-p.x,dy=e.y-p.y,along=dx*Math.cos(angle)+dy*Math.sin(angle),across=Math.abs(dx*Math.sin(angle)-dy*Math.cos(angle));if(along>0&&along<d.range&&across<e.r+5)hit(e,damage,false,30);}}
      }else if(d.kind==='rocket'){
        for(const off of active('split')?[-.18,0,.18]:[0])shoot(p.x,p.y,a+off,damage,d.magnetic?'magRocket':'rocket',false,340);
      }else if(d.kind==='drone'){
        const count=3+item.q+(active('battery')?2:0);
        for(let i=0;i<count;i++){const angle=state.totalTime*1.7+i*TAU/count,x=p.x+Math.cos(angle)*72,y=p.y+Math.sin(angle)*72;if(d.electric)lightning(x,y,target,damage*.85);else shoot(x,y,Math.atan2(target.y-y,target.x-x),damage,'drone');}
      }else if(d.kind==='electric')lightning(p.x,p.y,target,damage);
      else if(d.kind==='inferno'){effect(p.x,p.y,d.range,'#f48c46',.6);for(const e of state.enemies)if(dist(p,e)<d.range)hit(e,damage,true,45);}
      beep('shot');
    }
    // A low-power built-in pulse keeps a fully disassembled machine playable.
    p.baseCD-=dt;
    if(weapons===0 && p.baseCD<=0){const e=nearest(p.x,p.y,370);if(e){shoot(p.x,p.y,Math.atan2(e.y-p.y,e.x-p.x),10);p.baseCD=.65;}}
  }
  function collect(drop,audible=true){const values=[1,3,2,7];state.scrap+=values[drop.kind];if(drop.kind===2)state.player.hp=Math.min(state.player.maxHp,state.player.hp+3);if(audible){beep('pickup');effect(drop.x,drop.y,12,'#a2e0c8',.15);}}
  function update(dt,command) {
    if(state.phase!=='battle')return;
    state.totalTime+=dt;state.time-=dt;const p=state.player;
    p.inv=Math.max(0,p.inv-dt);p.dashCD=Math.max(0,p.dashCD-dt);p.dash=Math.max(0,p.dash-dt);state.fault=Math.max(0,state.fault-dt);
    const len=Math.hypot(command.x,command.y);let dx=len>1?command.x/len:command.x,dy=len>1?command.y/len:command.y;
    p.moving=len>.05;if(p.moving){p.dx=dx;p.dy=dy;}
    if(command.dash && p.dashCD<=0 && state.fault<=0){p.dash=.2;p.dashCD=active('tracks')?2.2:3;effect(p.x,p.y,35,'#d8e0ad',.25);}
    if(p.dash>0){dx=p.dx;dy=p.dy;effect(p.x,p.y,20,'#b7c485',.14,'trail');}
    const speed=state.speed*(p.dash>0?3.5:state.fault>0?.35:1);p.x=clamp(p.x+dx*speed*dt,28,WIDTH-28);p.y=clamp(p.y+dy*speed*dt,28,HEIGHT-28);
    p.hp=Math.min(p.maxHp,p.hp+state.regen*dt);
    if(state.heat>state.cooling)state.over+=((state.heat-state.cooling)*.14+1.5)*dt;else state.over=Math.max(0,state.over-13*dt);
    if(state.over>=100 && state.warning===0){state.warning=1.4;toast(T.warning);}
    if(state.warning>0){state.warning-=dt;if(state.warning<=0){state.warning=0;state.over=25;state.fault=1.4;p.inv=0;hurtPlayer(14);blast(p.x,p.y,165,70);toast(T.fault);if(state.phase!=='battle')return;}}
    state.spawn-=dt;
    if(state.spawn<=0 && state.time>0){state.spawn=Math.max(.18,.82-state.wave*.055);const unlocked=Math.min(8,state.wave);const type=Math.floor(rngNext()*unlocked);spawnEnemy(type);if(state.wave>5 && rngNext()<.35)spawnEnemy(0);}
    state.magnetCD-=dt;
    if(active('magnet') && state.magnetCD<=0){state.magnetCD=2.8;effect(p.x,p.y,250,'#8dcbbc',.6);for(const e of state.enemies)if(!e.dead && dist(e,p)<300 && e.type!==8){e.x+=(p.x-e.x)*.35;e.y+=(p.y-e.y)*.35;}if(active('explosive'))blast(p.x,p.y,155,26);}
    for(const e of state.enemies){
      if(e.dead)continue;e.flash=Math.max(0,e.flash-dt);e.cd-=dt;
      if(e.burn>0){e.burn-=dt;e.burnTick-=dt;if(e.burnTick<=0){e.burnTick=.35;hit(e,4*state.damage,false,0);}}
      if(e.dead)continue;
      const d=dist(e,p)||1,ax=(p.x-e.x)/d,ay=(p.y-e.y)/d;let speedE=e.speed;
      if(e.type===1 && d<330)speedE=d<210?-25:0;
      if(e.type===4){if(e.cd<=0 && e.charge===0){e.tele=.65;e.aim=Math.atan2(ay,ax);e.cd=4;}
        if(e.tele>0){e.tele-=dt;speedE=0;if(e.tele<=0)e.charge=.5;}
        if(e.charge>0){e.charge-=dt;e.x+=Math.cos(e.aim)*390*dt;e.y+=Math.sin(e.aim)*390*dt;speedE=0;}}
      if(e.type===8){if(e.cd<=0){e.tele=1.2;e.cd=4.5;effect(e.x,e.y,210,'#e87e57',1.2,'danger');}
        if(e.tele>0){e.tele-=dt;speedE=0;if(e.tele<=0){effect(e.x,e.y,210,'#f09d5d',.45,'burst');shakePower=10;if(d<210)hurtPlayer(25);for(let i=0;i<14;i++)shoot(e.x,e.y,i*TAU/14+state.totalTime*.2,13,'enemy',true,145);}}}
      e.x=clamp(e.x+(ax*speedE+e.kx)*dt,e.r,WIDTH-e.r);e.y=clamp(e.y+(ay*speedE+e.ky)*dt,e.r,HEIGHT-e.r);e.kx*=.86;e.ky*=.86;
      if(e.type===1 && e.cd<=0){shoot(e.x,e.y,Math.atan2(ay,ax),9,'enemy',true,175);e.cd=2.5;}
      if(e.type===6 && e.cd<=0){if(state.mines.length<55)state.mines.push({x:e.x,y:e.y,age:0,life:7});e.cd=3.3;}
      if(e.type===7 && e.cd<=0){for(const other of state.enemies)if(!other.dead && dist(e,other)<135)other.hp=Math.min(other.maxHp,other.hp+8);effect(e.x,e.y,135,'#8fc9a7',.5);e.cd=3;}
      if(d<e.r+p.r){hurtPlayer(e.damage);if(hasId('thorn') && e.flash<=0)hit(e,15,false,130);}
      if(state.phase!=='battle')return;
    }
    attacks(dt);
    for(let i=state.shots.length-1;i>=0;i--){const b=state.shots[i];b.life-=dt;b.x+=b.vx*dt;b.y+=b.vy*dt;let remove=b.life<=0||b.x<0||b.x>WIDTH||b.y<0||b.y>HEIGHT;
      if(b.enemy){if(Math.hypot(b.x-p.x,b.y-p.y)<p.r+b.r){hurtPlayer(b.damage);remove=true;}}
      else for(const e of state.enemies)if(!e.dead && Math.hypot(b.x-e.x,b.y-e.y)<e.r+b.r){
        if(b.kind==='rocket'||b.kind==='magRocket'){if(b.kind==='magRocket')for(const other of state.enemies)if(dist(e,other)<200 && other.type!==8){other.x+=(e.x-other.x)*.5;other.y+=(e.y-other.y)*.5;}blast(b.x,b.y,b.kind==='magRocket'?155:90,b.damage);}else {hit(e,b.damage,false,28);effect(b.x,b.y,19,b.kind==='drone'?'#a0e8dd':'#ffd487',.18,'impact',Math.atan2(b.vy,b.vx));}remove=true;break;}
      if(remove)state.shots.splice(i,1);
    }
    for(let i=state.mines.length-1;i>=0;i--){const m=state.mines[i];m.age+=dt;m.life-=dt;if(m.age>1 && dist(m,p)<55){effect(m.x,m.y,65,'#df7655',.4,'burst');hurtPlayer(16);m.life=0;}if(m.life<=0)state.mines.splice(i,1);}
    for(let i=state.drops.length-1;i>=0;i--){const d=state.drops[i];d.age+=dt;const distance=dist(d,p),range=active('magnet')?250:100;if(distance<range){const amount=Math.min(1,dt*(distance<35?22:7));d.x+=(p.x-d.x)*amount;d.y+=(p.y-d.y)*amount;}if(distance<22){collect(d);state.drops.splice(i,1);}}
    for(let i=state.fx.length-1;i>=0;i--)if((state.fx[i].life-=dt)<=0)state.fx.splice(i,1);
    for(let i=state.numbers.length-1;i>=0;i--){state.numbers[i].y-=25*dt;if((state.numbers[i].life-=dt)<=0)state.numbers.splice(i,1);}
    for(let i=state.enemies.length-1;i>=0;i--)if(state.enemies[i].dead)state.enemies.splice(i,1);
    let broke=false;for(const item of Object.values(state.equipment))if(item?.dur>0){item.dur=Math.max(0,item.dur-dt*(active('repair')?.07:.13)*(state.heat>state.cooling?1.5:1));if(item.dur===0)broke=true;}if(broke){refreshStats();renderLoadout();}
    if(state.phase!=='battle')return;
    if(state.wave===10 && state.bossDead)finishWave();else if(state.time<=0 && state.wave<10)finishWave();
  }

  // Inventory is only mutable in the safe workshop; every action is validated here.
  function getRecipe(a,b){if(!a||!b||a.uid===b.uid)return null;if(a.id===b.id && a.q===b.q && a.q<3)return {id:a.id,q:a.q+1};for(const r of recipes)if((a.id===r[0]&&b.id===r[1])||(b.id===r[0]&&a.id===r[1]))return {id:r[2],q:Math.max(a.q,b.q)};return null;}
  function install(slot,id=selected){if(state.phase!=='workshop')return;const index=state.inventory.findIndex(p=>p.uid===id);if(index<0){selected=state.equipment[slot]?.uid??null;if(compactGarage() && selected!==null)garagePanel='forge';renderWorkshop();return;}const item=state.inventory[index];if(!P[item.id].slots.includes(slot)){toast(T.wrongSlot);return;}state.inventory.splice(index,1);if(state.equipment[slot])state.inventory.push(state.equipment[slot]);state.equipment[slot]=item;forge=forge.map(x=>x===item.uid?null:x);selected=item.uid;refreshStats();renderWorkshop();document.querySelector(`[data-slot="${slot}"]`)?.classList.add('just-installed');beep('switch');toast(T.installed);}
  function removePart(item){const index=state.inventory.indexOf(item);if(index>=0)state.inventory.splice(index,1);else for(const slot of SLOT_KEYS)if(state.equipment[slot]===item)state.equipment[slot]=null;forge=forge.map(x=>x===item.uid?null:x);}
  function fuse(){if(state.phase!=='workshop')return;const a=state.inventory.find(p=>p.uid===forge[0]),b=state.inventory.find(p=>p.uid===forge[1]),recipe=getRecipe(a,b);if(!recipe)return;if(state.scrap<12){toast(T.noScrap);return;}state.scrap-=12;removePart(a);removePart(b);const result=makePart(recipe.id,recipe.q);state.inventory.push(result);selected=result.uid;forge=[null,null];renderWorkshop();const housing=document.querySelector('.forge');housing.classList.remove('just-fused');void housing.offsetWidth;housing.classList.add('just-fused');beep('fusion');toast(`${T.fused}：${partName(result)}`);}
  function repair(){if(state.phase!=='workshop')return;const item=currentPart();if(!item||item.dur>=100)return;const cost=Math.ceil((100-item.dur)*.18)+2;if(state.scrap<cost){toast(T.noScrap);return;}state.scrap-=cost;item.dur=100;refreshStats();renderWorkshop();toast(T.repaired);}
  function partIcon(kind){const shapes={saw:'<circle cx="20" cy="20" r="12"/><path d="M20 2v7m0 22v7M2 20h7m22 0h7M7 7l5 5m16 16 5 5M7 33l5-5M28 12l5-5"/><circle cx="20" cy="20" r="4"/>',flame:'<path d="M22 3C28 17 36 18 30 30S6 38 8 23c1-6 5-9 8-13-1 8 5 8 6-7Z"/>',laser:'<path d="m7 30 12-12m2-2L33 4M8 17l15 15M5 20l15 15M25 5l10 10"/>',tracks:'<rect x="4" y="9" width="32" height="22" rx="10"/><circle cx="13" cy="20" r="5"/><circle cx="27" cy="20" r="5"/>',shield:'<path d="M20 3 34 9v11c0 9-14 17-14 17S6 29 6 20V9Z"/><path d="M20 12v14m-7-7h14"/>',magnet:'<path d="M7 6v15a13 13 0 0 0 26 0V6h-9v15a4 4 0 0 1-8 0V6Z"/>',drone:'<rect x="13" y="13" width="14" height="14" rx="3"/><path d="m6 6 9 9m10 10 9 9M6 34l9-9M25 15l9-9M1 6h10M29 6h10M1 34h10m18 0h10"/>',battery:'<rect x="8" y="7" width="24" height="29" rx="3"/><path d="M15 3h10m-6 9-5 11h9l-4 9"/>',rocket:'<path d="M17 29 9 21C11 11 24 5 34 5c0 10-6 23-17 24ZM9 21l-5 9 10-3m3 2-4 8 12-7M10 31l-6 6"/><circle cx="25" cy="14" r="4"/>',chip:'<rect x="10" y="10" width="20" height="20" rx="3"/><path d="M15 3v7m10-7v7M15 30v7m10-7v7M3 15h7m-7 10h7m20-10h7m-7 10h7"/><path d="m22 14-6 7h8l-6 6"/>'};return `<svg viewBox="0 0 40 40" width="34" height="34" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${shapes[kind]||shapes.chip}</svg>`;}
  function renderLoadout(){
    $('loadout').innerHTML='';
    for(const slot of SLOT_KEYS){const item=state.equipment[slot],button=document.createElement('button');button.className=`slot ${!item?'empty':''} ${item?.uid===selected?'selected':''} ${item?.dur<=0?'broken':''}`;button.classList.toggle('compatible',state.inventory.some(p=>p.uid===selected && P[p.id].slots.includes(slot)));button.dataset.slot=slot;button.disabled=state.phase!=='workshop';button.innerHTML=`<span class="part-icon">${partIcon(item?P[item.id].kind:'chip')}</span><span><small>${SLOTS[slot]}</small><strong>${item?P[item.id].name:T.empty}</strong></span><span class="durability">${item?Math.ceil(item.dur)+'%':'＋'}</span>`;button.onclick=()=>install(slot);button.ondragover=e=>e.preventDefault();button.ondrop=e=>{e.preventDefault();install(slot,Number(e.dataTransfer.getData('text/plain')));};$('loadout').append(button);}
    $('loadout-strip').innerHTML=SLOT_KEYS.map(slot=>{const part=state.equipment[slot];return `<span title="${SLOTS[slot]} · ${part?P[part.id].name:T.empty}" style="opacity:${part?1:.45}">${partIcon(part?P[part.id].kind:'chip')}<small>${SLOTS[slot]}</small></span>`;}).join('');
    const synergies=[];if(active('saw')&&active('tracks'))synergies.push(T.synergySaw);if(active('drone')&&active('battery'))synergies.push(T.synergyDrone);if(active('magnet')&&active('explosive'))synergies.push(T.synergyMag);if(active('saw')&&active('vampire'))synergies.push(T.synergyVamp);$('synergies').textContent=synergies.join(' / ')||T.noSynergy;
  }
  function card(item,reward=false){const d=P[item.id],button=document.createElement('button');button.className='part-card'+(selected===item.uid?' selected':'');button.style.setProperty('--quality',QC[item.q]);button.dataset.part=item.id;button.dataset.uid=item.uid;button.innerHTML=`<span class="part-icon">${partIcon(d.kind)}</span><strong>${d.name}</strong><small>${Q[item.q]} · ${d.slots.map(s=>SLOTS[s]).join(' / ')}</small><p>${d.desc}</p><span class="part-stats">${T.heat} +${heatOf(item)} · ${T.durability} ${Math.ceil(item.dur)}%</span><span class="part-wear" style="--wear:${clamp(item.dur,0,100)}%" aria-hidden="true"><i></i></span>`;
    button.onclick=()=>{if(state.phase!=='workshop')return;if(reward){if(state.rewardTaken)return;state.inventory.push(item);state.rewardTaken=true;selected=item.uid;inventoryPage=Math.floor((state.inventory.length-1)/inventoryPageSize());if(compactGarage())garagePanel='inventory';beep('pickup');toast(`${T.got}：${d.name}`);}else {selected=selected===item.uid?null:item.uid;if(compactGarage() && selected!==null)garagePanel='forge';}renderWorkshop();};
    if(!reward){button.draggable=true;button.ondragstart=e=>{selected=item.uid;e.dataTransfer.setData('text/plain',String(item.uid));};}return button;}
  function renderWorkshop(){
    renderLoadout();updateUI();const pageSize=inventoryPageSize(),pageCount=Math.max(1,Math.ceil(state.inventory.length/pageSize));inventoryPage=clamp(inventoryPage,0,pageCount-1);$('inventory').innerHTML='';for(const item of state.inventory.slice(inventoryPage*pageSize,(inventoryPage+1)*pageSize))$('inventory').append(card(item));$('inventory-page').textContent=`${inventoryPage+1} / ${pageCount} · ${state.inventory.length} 件零件`;$('inventory-prev').disabled=inventoryPage===0;$('inventory-next').disabled=inventoryPage===pageCount-1;if(!state.inventory.length)$('inventory').textContent=T.emptyInventory;
    $('rewards').innerHTML='';$('rewards').classList.toggle('claimed',state.rewardTaken);if(state.rewardTaken)$('rewards').textContent=T.rewardDone;else for(const item of state.rewards)$('rewards').append(card(item,true));
    $('next-wave').disabled=!state.rewardTaken;$('next-wave').textContent=state.rewardTaken?T.next:T.needReward;
    const materials=forge.map(id=>state.inventory.find(p=>p.uid===id));
    for(let i=0;i<2;i++)$('forge-'+(i?'b':'a')).innerHTML=materials[i]?`${P[materials[i].id].name}<small>${Q[materials[i].q]}</small>`:`＋<small>${T.forgeHint}</small>`;
    const recipe=getRecipe(...materials);$('forge-preview').textContent=recipe?`${T.forgeResult}：${Q[recipe.q]} · ${P[recipe.id].name} / ${T.heat} +${Math.round(P[recipe.id].heat*(1+recipe.q*.18))}。${P[recipe.id].desc}`:materials.every(Boolean)?(materials[0].id===materials[1].id?(materials[0].q===3?T.maxQuality:T.qualityMismatch):T.noRecipe):T.forgeWait;
    $('fuse').disabled=!recipe||state.scrap<12;
    const item=currentPart(),cost=item?Math.ceil((100-item.dur)*.18)+2:0;
    $('repair').disabled=!item||item.dur>=100||state.scrap<cost;$('repair').textContent=item&&item.dur<100?`${T.repair} / ${cost}`:T.repair;
    $('sell').disabled=!item;$('sell').textContent=item?`${T.sell} / +${5+item.q*4}`:T.sell;
    $('unequip').disabled=!item||state.inventory.includes(item);
    $('install-actions').innerHTML='';
    if(item && state.inventory.includes(item))for(const slot of P[item.id].slots){
      const button=document.createElement('button'),old=state.equipment[slot];
      const projected=state.heat-(old?.dur>0?heatOf(old):0)+(item.dur>0?heatOf(item):0);
      const cap=state.cooling-(old?.dur>0&&P[old.id].kind==='battery'?45*power(old):0)+(item.dur>0&&P[item.id].kind==='battery'?45*power(item):0);
      button.textContent=`${T.installTo}${SLOTS[slot]} · ${projected}/${cap}`;
      button.title=`${T.heatPreview} ${projected}/${cap}${old?' · '+T.replace+P[old.id].name:''}`;
      button.classList.toggle('overload-choice',projected>cap);button.onclick=()=>install(slot,item.uid);$('install-actions').append(button);
    }
    $('clear-forge').disabled=!forge.some(Boolean);
    $('selection-info').textContent=item?`${partName(item)} · ${T.durability} ${Math.ceil(item.dur)}% · ${P[item.id].desc}`:T.selectHelp;
    applyGaragePanel();requestAnimationFrame(fitGarage);
  }
  function applyGaragePanel(){
    if(compactGarage() && garagePanel==='all')garagePanel=state.rewardTaken?'inventory':'rewards';
    $('workshop').dataset.panel=garagePanel;
    for(const button of document.querySelectorAll('.garage-tabs button'))button.setAttribute('aria-pressed',String(button.dataset.panel===garagePanel));
  }
  function fitGarage(){
    if(state.phase!=='workshop')return;
    const stage=document.querySelector('.workshop-stage'),grid=document.querySelector('.workshop-grid');
    grid.style.width=(garagePanel==='all'?stage.clientWidth:Math.min(stage.clientWidth,garagePanel==='machine'?1060:760))+'px';
    grid.style.setProperty('--garage-scale',1);
    grid.style.height=garagePanel==='machine'?'100%':'';
    if(garagePanel==='machine')return;
    const h=grid.scrollHeight,w=grid.scrollWidth;
    grid.style.setProperty('--garage-scale',Math.min(1,(stage.clientHeight-4)/Math.max(1,h),(stage.clientWidth-4)/Math.max(1,w)));
  }
  function updateUI(){
    document.body.dataset.phase=state.phase;
    document.body.classList.toggle('low-health',state.player.hp/state.player.maxHp<=.25);
    $('hud-scrap').textContent=state.scrap;$('hud-kills').textContent=state.kills;
    $('hud-heat').textContent=`${state.heat} / ${state.cooling}`;$('hud-heat-bar').style.width=`${Math.min(100,state.heat/state.cooling*100)}%`;
    $('hud-heat-bar').style.background=state.heat>state.cooling?'#ff8153':'#f6b34e';
    $('hud-over').textContent=state.heat>state.cooling?`${T.heat} ↑ ${Math.ceil(state.over)}%`:T.stable;
    const p=state.player;$('wave-label').textContent=state.wave?`${T.wave} ${String(state.wave).padStart(2,'0')} / 10`:T.wave+' 00 / 10';
    const time=Math.max(0,Math.ceil(state.time));$('timer').textContent=`${String(Math.floor(time/60)).padStart(2,'0')}:${String(time%60).padStart(2,'0')}`;
    $('phase-label').textContent=state.phase==='workshop'?T.workshop:state.phase==='paused'?T.pause:state.wave===10?T.bossPhase:T.combat;
    $('scrap').textContent=state.scrap;$('kills').textContent=state.kills;$('kill-count').textContent=`${T.kill} ${String(state.kills).padStart(3,'0')}`;
    $('hp-label').textContent=`${Math.ceil(p.hp)} / ${p.maxHp}`;$('hp-bar').style.width=`${clamp(p.hp/p.maxHp*100,0,100)}%`;
    $('heat-label').textContent=`${state.heat} / ${state.cooling}`;$('heat-bar').style.width=`${Math.min(100,state.heat/state.cooling*100)}%`;$('heat-bar').style.background=state.heat>state.cooling?'#ef7756':'#f3a443';$('heat-description').textContent=state.heat>state.cooling?T.hot:T.stable;$('overheat').textContent=`${Math.ceil(state.over)}%`;
    $('dash-status').textContent=p.dashCD<=0?T.ready:`${T.dashWait} ${p.dashCD.toFixed(1)}s`;
    $('pause').disabled=!['battle','paused'].includes(state.phase);$('pause').textContent=state.phase==='paused'?T.resume:T.pause+' ESC';
    if($('wave-track').dataset.wave!==String(state.wave)){$('wave-track').dataset.wave=state.wave;$('wave-track').innerHTML=Array.from({length:10},(_,i)=>`<i class="${i+1<state.wave?'done':i+1===state.wave?'current':''}"></i>`).join('');}
  }

  // Rendering uses a cached floor and batches projectiles/drops into shared paths.
  const floor=document.createElement('canvas');floor.width=WIDTH;floor.height=HEIGHT;
  function makeGround(){
    const c=floor.getContext('2d');let seed=381;const vr=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
    c.fillStyle='#68775a';c.fillRect(0,0,WIDTH,HEIGHT);
    for(let i=0;i<80;i++){c.fillStyle=i%2?'#728064':'#606e51';c.beginPath();c.ellipse(vr()*WIDTH,vr()*HEIGHT,30+vr()*100,15+vr()*50,vr()*6,0,TAU);c.fill();}
    c.strokeStyle='#809073';c.lineWidth=100;c.beginPath();c.moveTo(100,HEIGHT);c.bezierCurveTo(200,700,1200,700,1300,0);c.stroke();
    c.strokeStyle='#4d634955';c.lineWidth=4;c.setLineDash([24,15]);c.stroke();c.setLineDash([]);
    for(let i=0;i<250;i++){const x=vr()*WIDTH,y=vr()*HEIGHT;c.fillStyle=i%3?'#a3ac8277':'#384c3955';c.save();c.translate(x,y);c.rotate(vr()*TAU);c.fillRect(-2,-2,vr()*10+2,3);c.restore();}
    for(const [x,y,r] of [[150,150,65],[1370,170,92],[160,920,85],[1420,950,73]]){
      c.save();c.translate(x,y);c.fillStyle='#263f3655';c.beginPath();c.ellipse(14,28,r*1.5,r*.8,0,0,TAU);c.fill();
      for(let i=0;i<7;i++){c.save();c.rotate(i*2.1);c.fillStyle=['#8e8860','#a58c59','#6c8265'][i%3];c.strokeStyle='#354c3a';c.lineWidth=4;c.fillRect(r*.3,-18,vr()*50+25,35);c.strokeRect(r*.3,-18,40,35);c.restore();}
      c.strokeStyle='#314a3a';c.lineWidth=14;c.beginPath();c.arc(0,0,r*.65,0,TAU);c.stroke();c.strokeStyle='#91a27b';c.lineWidth=6;c.beginPath();c.arc(0,0,r*.58,0,TAU);c.stroke();
      c.fillStyle='#5c7056';c.beginPath();c.arc(0,0,r*.35,0,TAU);c.fill();c.restore();
    }
    for(let i=0;i<18;i++){const x=vr()*WIDTH,y=vr()*HEIGHT;c.save();c.translate(x,y);c.rotate(vr()*3);c.strokeStyle='#41563d';c.lineWidth=2;c.beginPath();c.moveTo(0,0);c.lineTo(18,5);c.lineTo(29,-3);c.lineTo(44,2);c.stroke();c.restore();}
    c.strokeStyle='#304a38';c.lineWidth=16;c.strokeRect(8,8,WIDTH-16,HEIGHT-16);
    for(let x=25;x<WIDTH-20;x+=45){c.fillStyle='#ceb26d';c.fillRect(x,4,23,7);c.fillRect(x,HEIGHT-11,23,7);}
  }
  function circle(x,y,r,fill,stroke){ctx.beginPath();ctx.arc(x,y,r,0,TAU);if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.stroke();}}
  function box(x,y,w,h,fill,stroke='#182018',radius=3){ctx.beginPath();ctx.roundRect(x,y,w,h,radius);ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.stroke();}}
  function drawRobot(x,y,size=1,angle=0){ctx.save();ctx.translate(x,y);ctx.scale(size,size);ctx.lineWidth=3;circle(0,14,30,'#10180f55');
    const tracks=active('tracks');box(-24,-14,14,42,tracks?'#545a40':'#485044',undefined,5);box(10,-14,14,42,tracks?'#545a40':'#485044',undefined,5);
    for(let i=0;i<5;i++){ctx.strokeStyle='#252c23';ctx.beginPath();ctx.moveTo(-24,-7+i*7);ctx.lineTo(-10,-7+i*7);ctx.moveTo(10,-7+i*7);ctx.lineTo(24,-7+i*7);ctx.stroke();}
    ctx.save();ctx.rotate(angle*.16);box(-20,-22,40,43,'#c7a15c');box(-14,-17,28,24,'#e7c77b');box(-9,-10,18,8,'#263934');circle(-4,-6,2,'#afe8d2');circle(5,-6,2,'#afe8d2');
    const core=state.equipment.core;circle(0,15,8,core?P[core.id].kind==='inferno'?'#fa7a45':P[core.id].kind==='shield'?'#b8dbd0':'#eca74c':'#555e40','#222a20');
    for(const [slot,sign] of [['left',-1],['right',1]]){const part=state.equipment[slot],kind=part?P[part.id].kind:'empty';ctx.save();ctx.translate(sign*30,0);ctx.rotate(sign*.25);box(-8,-10,16,22,'#aa874f');if(kind==='saw'){ctx.save();ctx.translate(0,-23);ctx.rotate(renderClock*10);ctx.fillStyle=part.id==='fireSaw'?'#e8a35d':'#d2d6b4';ctx.beginPath();for(let i=0;i<24;i++){const a=i*TAU/24,r=i%2?13:19;ctx.lineTo(Math.cos(a)*r,Math.sin(a)*r);}ctx.closePath();ctx.fill();ctx.stroke();circle(0,0,6,'#6f7958');ctx.restore();}else if(kind==='flame'||kind==='rocket'){box(-7,-35,14,29,kind==='flame'?'#bb7753':'#93a28d');box(-9,-37,18,9,'#353d2c');}else if(kind==='drone'){box(-12,-23,24,23,'#859e8a');for(let i=0;i<3;i++)box(-8+i*6,-19,4,13,'#263a32',null);}else{box(-6,8,12,10,'#7c8363');}ctx.restore();}
    if(state.equipment.head){box(-8,-32,16,11,'#879b7a');circle(0,-29,3,hasId('scatter')?'#ce9fde':'#dce3a6');}
    if(state.equipment.module){box(18,13,12,15,'#849b7c');circle(24,20,3,'#87d9c1');}ctx.restore();
    if(active('shield')){ctx.lineWidth=1.5;circle(0,0,42,null,'#a5cfc870');}ctx.restore();}
  function drawEnemies(){for(const e of state.enemies){if(e.x+e.r<camX||e.x-e.r>camX+viewW||e.y+e.r<camY||e.y-e.r>camY+viewH)continue;if(e.type===8){drawBoss(e);continue;}ctx.save();ctx.translate(e.x,e.y);ctx.lineWidth=2.5;const color=e.flash>0?'#fff0c7':e.color;circle(0,e.r*.6,e.r,'#11181055');
      if(e.type===0){const t=Math.sin(renderClock*13+e.id)*3;for(let i=0;i<3;i++)circle(-i*7,t*i*.4,9-i,color,'#24281d');box(-5,-6,11,6,'#544734');circle(4,-2,2,'#f4b170');}
      else if(e.type===1){ctx.rotate(renderClock*.7);box(-10,-10,20,20,color);for(let i=0;i<4;i++){ctx.rotate(Math.PI/2);ctx.strokeStyle='#bdc9a7';ctx.beginPath();ctx.moveTo(8,8);ctx.lineTo(21,21);ctx.stroke();circle(20,20,7,null,'#859b7860');}circle(0,0,4,'#d8694b');}
      else if(e.type===3){box(-27,-25,54,50,color);box(-21,-19,42,36,'#5a5b41');for(let i=0;i<4;i++)box(-18+i*10,-16,6,31,'#a5a079');box(-26,-4,52,8,'#c29251');}
      else if(e.type===4){ctx.rotate(Math.atan2(state.player.y-e.y,state.player.x-e.x)+Math.PI/2);box(-16,-19,32,36,color);ctx.fillStyle='#d6c798';ctx.beginPath();ctx.moveTo(-18,-12);ctx.lineTo(-25,-30);ctx.lineTo(-7,-19);ctx.moveTo(18,-12);ctx.lineTo(25,-30);ctx.lineTo(7,-19);ctx.fill();box(-9,-14,18,6,'#592d22');}
      else if(e.type===5){for(let i=0;i<4;i++){const a=i*TAU/4+renderClock;circle(Math.cos(a)*13,Math.sin(a)*13,9,color,'#283120');}circle(0,0,10,'#5a6644');}
      else if(e.type===6){circle(0,0,17,color,'#272e22');for(let i=0;i<4;i++){ctx.rotate(Math.PI/2);box(13,-3,10,5,'#909879');}circle(0,0,6,'#5a3c29');}
      else if(e.type===7){box(-20,-20,40,40,color);ctx.fillStyle='#d9e3bd';ctx.fillRect(-3,-13,6,26);ctx.fillRect(-13,-3,26,6);}
      else{box(-18,-20,36,39,color);box(-13,-14,26,10,'#3d3c2c');circle(-5,-9,3,'#e78960');circle(5,-9,3,'#e78960');box(-23,10,12,14,'#6d7050');box(11,10,12,14,'#6d7050');}
      if(e.burn>0){circle(-5,-e.r,4+Math.sin(renderClock*24)*2,'#f6a24a');circle(6,-e.r-3,3,'#f5d587');}
      if(e.hp<e.maxHp){ctx.fillStyle='#171e16';ctx.fillRect(-e.r,-e.r-10,e.r*2,3);ctx.fillStyle='#cd9870';ctx.fillRect(-e.r,-e.r-10,e.r*2*e.hp/e.maxHp,3);}ctx.restore();
      if(e.tele>0&&e.type===4){ctx.strokeStyle='#f49d6277';ctx.lineWidth=20;ctx.beginPath();ctx.moveTo(e.x,e.y);ctx.lineTo(e.x+Math.cos(e.aim)*210,e.y+Math.sin(e.aim)*210);ctx.stroke();}}
  }
  function drawBoss(e){ctx.save();ctx.translate(e.x,e.y);ctx.lineWidth=5;circle(0,25,75,'#141b1255');box(-72,-36,30,88,'#616749');box(42,-36,30,88,'#616749');box(-53,-54,106,109,e.flash?'#ffe4b6':'#ad7751',undefined,12);box(-40,-39,80,68,'#353e2d');for(let i=0;i<5;i++)box(-32+i*14,-35,9,60,'#beb78a');box(-50,-8,100,20,'#cda55c');for(let i=0;i<5;i++){ctx.fillStyle='#4f4c32';ctx.fillRect(-40+i*20,-7,8,17);}circle(-23,-48,7,'#f0844f');circle(23,-48,7,'#f0844f');ctx.restore();}
  function drawMenuScene(){
    const w=viewW,h=viewH,mobile=canvas.clientWidth<650;
    const sky=ctx.createLinearGradient(0,0,0,h);sky.addColorStop(0,'#153c37');sky.addColorStop(.6,'#54775a');sky.addColorStop(1,'#183d2e');ctx.fillStyle=sky;ctx.fillRect(0,0,w,h);
    // A hazy ringed planet and distant salvage cranes anchor the world.
    const px=w*.76,py=h*.27,pr=Math.min(w,h)*.15;
    circle(px,py,pr,'#b9c494');ctx.save();ctx.translate(px,py);ctx.rotate(-.4);ctx.strokeStyle='#aebd8677';ctx.lineWidth=16;ctx.beginPath();ctx.ellipse(0,0,pr*1.65,pr*.25,0,0,TAU);ctx.stroke();ctx.restore();
    for(let i=0;i<30;i++){const x=((i*173+41)%997)/997*w,y=((i*83+17)%541)/541*h*.6;circle(x,y,i%3===0?2:1,'#c6d8ad66');}
    for(let layer=0;layer<3;layer++){ctx.fillStyle=['#365c4d','#2b503f','#204332'][layer];ctx.beginPath();ctx.moveTo(0,h);for(let i=0;i<=18;i++){const x=i*w/18,y=h*(.58+layer*.105)-Math.sin(i*1.8+layer)*h*.04-(i%3)*12;ctx.lineTo(x,y);}ctx.lineTo(w,h);ctx.closePath();ctx.fill();}
    const crane=(x,y,s)=>{ctx.save();ctx.translate(x,y);ctx.scale(s,s);ctx.strokeStyle='#25493b';ctx.lineWidth=10;ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(0,-150);ctx.lineTo(105,-210);ctx.lineTo(145,-170);ctx.stroke();ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(18,0);ctx.lineTo(0,-150);ctx.lineTo(145,-170);ctx.lineTo(145,-50);ctx.stroke();box(125,-60,40,25,'#244735',null);ctx.restore();};crane(w*.95,h*.7,1.2);crane(w*.53,h*.67,.7);
    const x=mobile?w*.62:w*.75,y=mobile?h*.76:h*.66,s=mobile?2.9:4.8;
    ctx.save();ctx.translate(x,y+70*s/3);ctx.scale(mobile?.65:1, mobile?.65:1);ctx.lineWidth=5;ctx.fillStyle='#132d22';ctx.beginPath();ctx.ellipse(0,10,210,65,0,0,TAU);ctx.fill();ctx.fillStyle='#52654a';ctx.beginPath();ctx.ellipse(0,0,205,58,0,0,TAU);ctx.fill();ctx.strokeStyle='#203c2c';ctx.stroke();ctx.strokeStyle='#94a078';ctx.lineWidth=3;ctx.beginPath();ctx.ellipse(0,-6,174,43,0,0,TAU);ctx.stroke();for(let i=0;i<9;i++){ctx.fillStyle=i%2?'#d8b267':'#314936';ctx.fillRect(-155+i*36,33,23,14);}ctx.restore();
    // Spare parts make the hero feel assembled in a physical salvage yard.
    ctx.save();ctx.translate(x+140*(mobile?.6:1),y+75);ctx.rotate(.25);ctx.lineWidth=5;box(-22,-20,55,45,'#8f8256');box(-15,-38,40,25,'#a8925e');circle(7,-25,7,'#273f2e');ctx.restore();
    drawRobot(x,y+Math.sin(renderClock*1.8)*4,s,-.5+Math.sin(renderClock*.65)*.2);
    for(let i=0;i<12;i++){const a=i*2.2+renderClock*.07,dx=x+Math.cos(a)*(140+i*12),dy=y+Math.sin(a)*(100+i*9);circle(dx,dy,1.5,'#ead69b77');}
    const vignette=ctx.createRadialGradient(w*.55,h*.5,h*.1,w*.55,h*.5,Math.max(w,h)*.75);vignette.addColorStop(0,'#0d2d2200');vignette.addColorStop(1,'#08292388');ctx.fillStyle=vignette;ctx.fillRect(0,0,w,h);
  }
  function render(){
    if(!state)return;const dpr=Math.min(devicePixelRatio||1,1.5);ctx.setTransform(dpr*scale,0,0,dpr*scale,0,0);ctx.clearRect(0,0,viewW,viewH);
    camX=clamp(state.player.x-viewW/2,0,Math.max(0,WIDTH-viewW));camY=clamp(state.player.y-viewH/2,0,Math.max(0,HEIGHT-viewH));
    ctx.save();if(shake && shakePower>.1){ctx.translate(Math.sin(renderClock*110)*shakePower,Math.cos(renderClock*137)*shakePower);shakePower*=.88;}ctx.translate(-camX,-camY);ctx.drawImage(floor,0,0);
    if(state.phase==='intro'||state.phase==='workshop'){
      ctx.restore();drawMenuScene();
      if(state.phase==='workshop'){
        ctx=previewContext;ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,400,360);
        ctx.strokeStyle='#88a77c55';ctx.lineWidth=2;circle(200,185,133,null,'#88a77c55');
        drawRobot(200,175,2.8,Math.sin(renderClock*.7)*.3);ctx=mainContext;
      }
      return;
    }
    for(let kind=0;kind<4;kind++){ctx.fillStyle=['#8ecbb5','#a8d7d0','#d7da84','#e9b86c'][kind];ctx.beginPath();for(const d of state.drops)if(d.kind===kind){const r=kind===3?6:4,y=d.y+Math.sin(d.age*5)*2;ctx.moveTo(d.x,y-r);ctx.lineTo(d.x+r,y);ctx.lineTo(d.x,y+r);ctx.lineTo(d.x-r,y);ctx.closePath();}ctx.fill();}
    for(const m of state.mines){circle(m.x,m.y,9,'#514330','#c2945d');circle(m.x,m.y,3,m.age>1?'#ec7858':'#e2c785');if(m.age>1)circle(m.x,m.y,20+Math.sin(renderClock*7)*3,null,'#d5824d55');}
    drawEnemies();
    // Trails are drawn analytically: no per-frame particle allocations.
    for(const b of state.shots){
      const rocket=b.kind==='rocket'||b.kind==='magRocket',mint=b.kind==='drone'||b.kind==='magRocket';
      const color=b.enemy?'#fa876a':mint?'#8ee5dc':'#ffcf69';
      const length=Math.min((2-b.life)*Math.hypot(b.vx,b.vy),rocket?34:b.enemy?13:24);
      ctx.save();ctx.translate(b.x,b.y);ctx.rotate(Math.atan2(b.vy,b.vx));ctx.lineCap='round';
      ctx.globalAlpha=.2;ctx.strokeStyle=color;ctx.lineWidth=rocket?12:b.enemy?10:7;
      ctx.beginPath();ctx.moveTo(-length,0);ctx.lineTo(0,0);ctx.stroke();
      ctx.globalAlpha=.65;ctx.lineWidth=rocket?5:2;ctx.beginPath();ctx.moveTo(-length*.75,0);ctx.lineTo(0,0);ctx.stroke();ctx.globalAlpha=1;
      if(rocket){
        ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(-7,-3);ctx.lineTo(-16-4*Math.sin(renderClock*35),0);ctx.lineTo(-7,3);ctx.fill();
        ctx.fillStyle='#e8edcd';ctx.strokeStyle='#193d32';ctx.lineWidth=2;
        ctx.beginPath();ctx.moveTo(9,0);ctx.lineTo(2,-5);ctx.lineTo(-7,-5);ctx.lineTo(-7,5);ctx.lineTo(2,5);ctx.closePath();ctx.fill();ctx.stroke();
        ctx.fillStyle=color;ctx.fillRect(-3,-3,4,6);
      }else if(b.enemy){
        ctx.strokeStyle='#502c28';ctx.lineWidth=2;ctx.fillStyle=color;
        ctx.beginPath();ctx.arc(0,0,5.5,0,TAU);ctx.fill();ctx.stroke();
        ctx.fillStyle='#ffe6bd';ctx.fillRect(-1.5,-1.5,3,3);
      }else{
        ctx.strokeStyle='#25483b';ctx.lineWidth=6;ctx.beginPath();ctx.moveTo(-6,0);ctx.lineTo(3,0);ctx.stroke();
        ctx.strokeStyle=color;ctx.lineWidth=4;ctx.stroke();ctx.strokeStyle='#ffffdc';ctx.lineWidth=1.5;ctx.stroke();
      }
      ctx.restore();
    }
    for(const f of state.fx){ctx.save();ctx.globalAlpha=clamp(f.life/f.max,0,1);ctx.strokeStyle=f.color;ctx.fillStyle=f.color;ctx.lineWidth=3;const progress=1-f.life/f.max;
      if(f.kind==='line'){
        ctx.lineCap='round';ctx.beginPath();ctx.moveTo(f.x,f.y);ctx.lineTo(f.x2,f.y2);
        ctx.globalAlpha*=.2;ctx.lineWidth=12;ctx.stroke();ctx.globalAlpha=Math.min(1,f.life/f.max);ctx.lineWidth=4;ctx.stroke();ctx.strokeStyle='#fffde5';ctx.lineWidth=1.4;ctx.stroke();ctx.lineCap='butt';
      }else if(f.kind==='impact'){
        const age=1-f.life/f.max;ctx.lineWidth=2;ctx.lineCap='round';ctx.beginPath();
        for(let i=0;i<5;i++){const a=f.x2+(i-2)*.7,r=4+age*f.r;ctx.moveTo(f.x+Math.cos(a)*r*.45,f.y+Math.sin(a)*r*.45);ctx.lineTo(f.x+Math.cos(a)*r,f.y+Math.sin(a)*r);}ctx.stroke();ctx.lineCap='butt';
      }
      else if(f.kind==='flame'){ctx.globalAlpha*=.24;ctx.beginPath();ctx.moveTo(f.x,f.y);ctx.arc(f.x,f.y,f.r*(.75+progress*.25),f.x2-.6,f.x2+.6);ctx.closePath();ctx.fill();}
      else if(f.kind==='arc'){ctx.lineWidth=6;ctx.beginPath();ctx.arc(f.x,f.y,f.r*.8,f.x2+progress*TAU,f.x2+progress*TAU+Math.PI);ctx.stroke();}
      else if(f.kind==='trail'){ctx.globalAlpha*=.25;circle(f.x,f.y,f.r,f.color);}
      else if(f.kind==='danger'){ctx.globalAlpha=.2+Math.sin(renderClock*18)*.1;circle(f.x,f.y,f.r,f.color);ctx.globalAlpha=.8;circle(f.x,f.y,f.r*(1-progress),null,f.color);}
      else {circle(f.x,f.y,f.r*(.25+progress*.75),null,f.color);if(f.kind==='burst'){ctx.globalAlpha*=.25;circle(f.x,f.y,f.r*(1-progress),f.color);for(let i=0;i<8;i++){const a=i*TAU/8;circle(f.x+Math.cos(a)*f.r*progress,f.y+Math.sin(a)*f.r*progress,3,f.color);}}}ctx.restore();}
    for(let i=0;i<state.droneCount;i++){const a=state.totalTime*1.7+i*TAU/state.droneCount,x=state.player.x+Math.cos(a)*72,y=state.player.y+Math.sin(a)*72;ctx.lineWidth=2;box(x-7,y-6,14,12,'#9cba98');ctx.strokeStyle='#b7c89c';ctx.beginPath();ctx.moveTo(x-12,y);ctx.lineTo(x+12,y);ctx.stroke();}
    if(state.player.inv>0 && Math.floor(renderClock*20)%2)ctx.globalAlpha=.55;
    drawRobot(state.player.x,state.player.y,1,state.player.angle);ctx.globalAlpha=1;
    ctx.font='bold 14px monospace';ctx.textAlign='center';for(const n of state.numbers){ctx.globalAlpha=Math.min(1,n.life*3);ctx.fillStyle=n.color;ctx.fillText(n.value,n.x,n.y);}ctx.globalAlpha=1;ctx.restore();
    const boss=state.enemies.find(e=>e.type===8);if(boss){const w=Math.min(400,viewW*.55),x=(viewW-w)/2;ctx.fillStyle='#171d14';ctx.fillRect(x,110,w,8);ctx.fillStyle='#e3a067';ctx.fillRect(x,110,w*boss.hp/boss.maxHp,8);ctx.font='11px sans-serif';ctx.textAlign='center';ctx.fillStyle='#e5c496';ctx.fillText(T.boss,viewW/2,138);}
    if(state.warning>0){ctx.strokeStyle='#eb8d56';ctx.lineWidth=10;ctx.strokeRect(5,5,viewW-10,viewH-10);}
    if(dev){ctx.font='12px monospace';ctx.textAlign='left';ctx.fillStyle='#ddf0b8';ctx.fillText(`${fps} fps | ${state.enemies.length} enemies | ${state.shots.length} shots | ${state.fx.length} fx`,12,viewH-65);}
  }
  function resize(){const rect=canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,1.5);canvas.width=Math.round(rect.width*dpr);canvas.height=Math.round(rect.height*dpr);scale=Math.max(.88,rect.width/1350,rect.height/900);viewW=rect.width/scale;viewH=rect.height/scale;}
  const BIND={KeyW:'up',ArrowUp:'up',KeyS:'down',ArrowDown:'down',KeyA:'left',ArrowLeft:'left',KeyD:'right',ArrowRight:'right',Space:'dash'};
  function input(){let x=0,y=0,dash=touchDash;for(const code of keys){const c=BIND[code];if(c==='left')x=-1;if(c==='right')x+=1;if(c==='up')y=-1;if(c==='down')y+=1;if(c==='dash')dash=true;}
    // Opposite physical bindings resolve to zero, independent of key press order.
    x=Number(keys.has('KeyD')||keys.has('ArrowRight'))-Number(keys.has('KeyA')||keys.has('ArrowLeft'));
    y=Number(keys.has('KeyS')||keys.has('ArrowDown'))-Number(keys.has('KeyW')||keys.has('ArrowUp'));
    if(touchX||touchY){x=touchX;y=touchY;}return {x,y,dash};}
  addEventListener('keydown',e=>{if(e.code==='Escape'&&!e.repeat)togglePause();if(state.phase==='battle' && BIND[e.code]){keys.add(e.code);e.preventDefault();}});
  addEventListener('keyup',e=>keys.delete(e.code));
  addEventListener('blur',()=>{keys.clear();touchX=touchY=0;touchDash=false;if(state.phase==='battle')togglePause();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden && state.phase==='battle')togglePause();});
  const stick=$('joystick');let stickId=null;
  function moveStick(e){if(e.pointerId!==stickId)return;const r=stick.getBoundingClientRect(),x=(e.clientX-r.left-r.width/2)/35,y=(e.clientY-r.top-r.height/2)/35,m=Math.max(1,Math.hypot(x,y));touchX=x/m;touchY=y/m;stick.firstElementChild.style.transform=`translate(${touchX*27}px,${touchY*27}px)`;}
  stick.onpointerdown=e=>{if(stickId!==null)return;stickId=e.pointerId;stick.setPointerCapture(e.pointerId);moveStick(e);};stick.onpointermove=moveStick;
  const releaseStick=e=>{if(e.pointerId!==stickId)return;stickId=null;touchX=touchY=0;stick.firstElementChild.style.transform='';};stick.onpointerup=releaseStick;stick.onpointercancel=releaseStick;stick.onlostpointercapture=releaseStick;
  $('dash-touch').onpointerdown=e=>{touchDash=true;e.currentTarget.setPointerCapture(e.pointerId);};$('dash-touch').onpointerup=$('dash-touch').onpointercancel=$('dash-touch').onlostpointercapture=()=>touchDash=false;
  $('start').onclick=startWave;$('restart').onclick=()=>{reset();startWave();};$('next-wave').onclick=startWave;$('pause').onclick=togglePause;$('resume').onclick=togglePause;
  $('sound').onclick=()=>{sound=!sound;$('sound').textContent=sound?T.soundOn:T.soundOff;$('sound').setAttribute('aria-pressed',String(sound));if(sound)audioInit();};
  $('shake').onclick=()=>{shake=!shake;$('shake').textContent=shake?T.shakeOn:T.shakeOff;$('shake').setAttribute('aria-pressed',String(shake));};
  for(let i=0;i<2;i++){const button=$('forge-'+(i?'b':'a'));const setForge=id=>{if(state.phase!=='workshop')return;if(!state.inventory.some(p=>p.uid===id)){if(forge[i]){forge[i]=null;renderWorkshop();}else toast(T.needSelect);return;}if(forge[i]===id){forge[i]=null;renderWorkshop();return;}forge=forge.map(x=>x===id?null:x);forge[i]=id;renderWorkshop();};button.onclick=()=>setForge(selected);button.ondragover=e=>e.preventDefault();button.ondrop=e=>{e.preventDefault();setForge(Number(e.dataTransfer.getData('text/plain')));};}
  $('clear-forge').onclick=()=>{if(state.phase!=='workshop')return;forge=[null,null];renderWorkshop();};$('fuse').onclick=fuse;$('repair').onclick=repair;
  $('sell').onclick=()=>{if(state.phase!=='workshop')return;const item=currentPart();if(!item)return;state.scrap+=5+item.q*4;removePart(item);selected=null;refreshStats();renderWorkshop();toast(T.sold);};
  $('unequip').onclick=()=>{if(state.phase!=='workshop')return;const item=currentPart();if(!item||state.inventory.includes(item))return;removePart(item);state.inventory.push(item);refreshStats();renderWorkshop();toast(T.removed);};
  for(const button of document.querySelectorAll('.garage-tabs button'))button.onclick=()=>{garagePanel=button.dataset.panel;beep('switch');applyGaragePanel();fitGarage();};
  $('inventory-prev').onclick=()=>{inventoryPage--;renderWorkshop();};
  $('inventory-next').onclick=()=>{inventoryPage++;renderWorkshop();};
  document.querySelector('.forge details').addEventListener('toggle',fitGarage);
  addEventListener('resize',()=>{if(state.phase==='workshop'){applyGaragePanel();renderWorkshop();}});
  new ResizeObserver(resize).observe($('arena'));addEventListener('orientationchange',resize);
  makeGround();reset();resize();
  // Explicit developer-only hooks for deterministic loop and inventory verification.
  if(dev)window.scrapDebug={get state(){return state;},reset,step:(seconds,command={x:0,y:0,dash:false})=>{for(let i=0;i<Math.round(seconds/STEP);i++)update(STEP,command);updateUI();render();},startWave,finishWave,spawnEnemy,hit,refresh:()=>{refreshStats();renderWorkshop();},give:(id,q=0)=>{const item=makePart(id,q);state.inventory.push(item);return item;},install,getRecipe,fuse,select:id=>{selected=id;renderWorkshop();},setForge:(a,b)=>{forge=[a,b];renderWorkshop();},hurtPlayer,render};
  function frame(now){requestAnimationFrame(frame);const elapsed=Math.min((now-last)/1000,.1);last=now;renderClock+=elapsed;if(state.phase==='battle'){accumulator+=elapsed;const command=input();while(accumulator>=STEP){update(STEP,command);accumulator-=STEP;}}else accumulator=0;render();uiClock+=elapsed;if(uiClock>.12){updateUI();uiClock=0;}if(now>toastUntil)$('toast').classList.remove('visible');frames++;if(now-fpsAt>500){fps=Math.round(frames*1000/(now-fpsAt));frames=0;fpsAt=now;}}
  requestAnimationFrame(frame);
})();
