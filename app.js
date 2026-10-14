// ════════════════════════════════
//  SUPABASE CONFIG
// ════════════════════════════════
var SUPABASE_URL='https://cufbeahjechwpyvldztr.supabase.co';
var SUPABASE_ANON_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN1ZmJlYWhqZWNod3B5dmxkenRyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE2NjYwNjAsImV4cCI6MjEwNzI0MjA2MH0.CdFElIVzjhz6SRF__vypI8v9m3jghjtciWx62YkYCn4';
var TABLE='frakce_kv';
var sb=null;
var rtChannel=null;
var refreshTimer=null;

// DB má stejné API jako dřív (get/set), ale data žijí v Supabase.
// get() čte z paměti (rychlé, synchronní), set() ukládá do paměti a dávkově do databáze.
var DB={
  cache:{},pending:{},defaults:{},lastWrite:{},timer:null,
  get:function(k){var v=this.cache[k];return v===undefined?null:JSON.parse(JSON.stringify(v));},
  set:function(k,v){
    var c=JSON.parse(JSON.stringify(v));
    this.cache[k]=c;this.pending[k]=c;delete this.defaults[k];
    this.lastWrite[k]=Date.now();this.schedule(300);
  },
  setDefault:function(k,v){
    if(this.cache[k]!==undefined)return;
    var c=JSON.parse(JSON.stringify(v));
    this.cache[k]=c;this.defaults[k]=c;this.schedule(300);
  },
  schedule:function(ms){var self=this;clearTimeout(this.timer);this.timer=setTimeout(function(){self.flush();},ms);},
  flush:async function(){
    clearTimeout(this.timer);
    var p=this.pending,d=this.defaults;this.pending={};this.defaults={};
    var now=new Date().toISOString();
    var rows=Object.keys(p).map(function(k){return {key:k,value:p[k],updated_at:now};});
    var drows=Object.keys(d).map(function(k){return {key:k,value:d[k],updated_at:now};});
    if(!sb||(!rows.length&&!drows.length))return;
    try{
      if(rows.length){var r=await sb.from(TABLE).upsert(rows,{onConflict:'key'});if(r.error)throw r.error;}
      if(drows.length){var r2=await sb.from(TABLE).upsert(drows,{onConflict:'key',ignoreDuplicates:true});if(r2.error)throw r2.error;}
    }catch(e){
      console.error('DB flush',e);
      var self=this;
      Object.keys(p).forEach(function(k){if(!(k in self.pending))self.pending[k]=p[k];});
      Object.keys(d).forEach(function(k){if(!(k in self.defaults)&&!(k in self.pending))self.defaults[k]=d[k];});
      this.schedule(5000);
      toast('Chyba ukládání do databáze — zkouším znovu','error',4000);
    }
  },
  load:async function(){
    var r=await sb.from(TABLE).select('key,value');
    if(r.error)throw r.error;
    var c={};(r.data||[]).forEach(function(row){c[row.key]=row.value;});
    this.cache=c;this.pending={};this.defaults={};
  }
};

var POSITIONS=['Mastermind','Overseer','Counselor',"Devil's Advocate",'Advisor','Captain','Enforcer','Associate'];
// Mastermind, Overseer a Counselor mají admin přístup automaticky
var ADMIN_POS=['Mastermind','Overseer','Counselor'];
// převod starých názvů pozic (už uložených u členů) na nové
var OLD_POS_MAP={'Boss':'Mastermind','Right hand':'Overseer','Consul':'Advisor',"Devil's Advocate":"Devil's Advocate",'Chief of Arms':'Captain','Intelligence Chief':'Enforcer','Keeper of secrets':'Enforcer','Member':'Associate'};
function migratePositions(){
  var members=DB.get('members');if(!members)return;
  var ch=false;
  members.forEach(function(m){
    if(OLD_POS_MAP[m.position]&&OLD_POS_MAP[m.position]!==m.position){m.position=OLD_POS_MAP[m.position];ch=true;}
    if(m.promo&&OLD_POS_MAP[m.promo.to]&&OLD_POS_MAP[m.promo.to]!==m.promo.to){m.promo.to=OLD_POS_MAP[m.promo.to];ch=true;}
    if(ADMIN_POS.indexOf(m.position)!==-1&&!m.adminAccess){m.adminAccess=true;ch=true;}
  });
  if(ch)DB.set('members',members);
}
// po změně pozice srovná admin přístup (Mastermind/Overseer = vždy admin; při degradaci z nich se admin odebere)
function syncAdminForPos(m,oldPos){
  if(ADMIN_POS.indexOf(m.position)!==-1)m.adminAccess=true;
  else if(oldPos&&ADMIN_POS.indexOf(oldPos)!==-1)m.adminAccess=false;
}
var VEDENI_POS=['Mastermind','Overseer','Counselor',"Devil's Advocate",'Advisor'];
var CAT={weapons:'ZBRANĚ',ammo:'MUNICE',drugs:'DROGY',equipment:'VYBAVENÍ',vehicles:'VOZIDLA',other:'OSTATNÍ'};
var PRIO={low:'LOW',normal:'NORMAL',high:'HIGH',urgent:'URGENT'};
var CLOTH_CAT={masks:'Masky & Vousy',jackets:'Bundy & Trička',pants:'Kalhoty & Boty',acc:'Doplňky',sets:'Sety'};

var currentMemberId=null;
var pendingLoginId=null;

function getMember(id){var members=DB.get('members')||[];return members.find(function(m){return m.id===(id||currentMemberId);})||null;}
function isAdmin(){var m=getMember();return m&&m.adminAccess;}
function isBossPos(m){return !!m&&m.position==='Mastermind';}
// Mastermind smí spravovat jen Mastermind; ostatní (i Overseer) ne
function canManage(target){
  if(!target)return false;
  if(target.position!=='Mastermind')return true;
  var me=getMember();return !!me&&me.position==='Mastermind';
}
var RADIO_GEN_POS=['Mastermind','Overseer','Counselor',"Devil's Advocate",'Advisor','Captain'];
function canRegenRadios(){var m=getMember();return !!m&&RADIO_GEN_POS.indexOf(m.position)!==-1;}
function isVedeni(pos){return VEDENI_POS.indexOf(pos)!==-1;}
function getWeekKey(){var d=new Date();var yr=d.getFullYear();var start=new Date(yr,0,1);var wk=Math.ceil(((d-start)/86400000+start.getDay()+1)/7);return yr+'-W'+wk;}

// ── TOAST ────────────────────────────────────
function toast(msg,type,dur){
  type=type||'info';dur=dur||3000;
  var c=document.getElementById('toastContainer');
  var d=document.createElement('div');d.className='toast '+type;d.textContent=msg;c.appendChild(d);
  setTimeout(function(){d.style.animation='toastOut .3s ease forwards';setTimeout(function(){if(d.parentNode)d.parentNode.removeChild(d);},300);},dur);
}

// ── UTILS ────────────────────────────────────
function uid(){return Math.random().toString(36).slice(2,9)+Date.now().toString(36).slice(-4);}
function esc(s){if(!s)return '';return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/\n/g,'<br>');}
function nowStr(){return new Date().toLocaleString('cs-CZ',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});}
function nowFull(){return new Date().toLocaleString('cs-CZ',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit'});}
function setText(id,v){var e=document.getElementById(id);if(e)e.textContent=v;}
function setHtml(id,v){var e=document.getElementById(id);if(e)e.innerHTML=v;}
// Fotka: plná URL (Fivemanage apod.) se použije přímo, jinak se bere jako soubor ve složce images/
function imgSrc(v){
  v=String(v||'').trim();
  if(!v)return '';
  return /^https?:\/\//i.test(v)?v:'images/'+v;
}

// ── LOG ──────────────────────────────────────
// Každá sekce (typ logu) může mít vlastní Discord webhook a jde ji vypnout (Admin → Nastavení).
var SECTIONS=[
  {key:'sys',label:'Systém / přihlášení'},
  {key:'board',label:'Nástěnka'},
  {key:'task',label:'Úkoly'},
  {key:'msg',label:'Zprávy (ping při „všichni členové“)'},
  {key:'wh',label:'Sklad (vkládání, správa)'},
  {key:'ev',label:'Sklad (výdej)'},
  {key:'boost',label:'Boosting'},
  {key:'heist',label:'Heisty (reporty o provedených pracích)'},
  {key:'cloth',label:'Oblečení'},
  {key:'fin',label:'Finance a příjmy'},
  {key:'excuse',label:'Omluvenky'},
  {key:'excuse_dec',label:'Omluvenky — rozhodnutí (jen vedení, bez webhooku se neposílá)'},
  {key:'report',label:'Hlášení'},
  {key:'radio',label:'Vysílačka'},
  {key:'member',label:'Členové'},
  {key:'roster',label:'Crew List (strike, povýšení)'},
  {key:'panic',label:'Panic'}
];
function sectionLabel(k){var s=SECTIONS.find(function(x){return x.key===k;});return s?s.label:k;}

var CAT_PINGS=[
  {key:'weapons',label:'Sklad — Zbraně'},{key:'ammo',label:'Sklad — Munice'},{key:'drugs',label:'Sklad — Drogy'},
  {key:'equipment',label:'Sklad — Vybavení'},{key:'vehicles',label:'Sklad — Vozidla'},{key:'other',label:'Sklad — Ostatní'}
];
function absImg(v){var s=imgSrc(v);if(!s)return '';try{return new URL(s,location.href).href;}catch(e){return '';}}
// Ping: ID role (nebo <@&ID>), případně "everyone" / "here"
function pingTag(v){
  v=String(v||'').trim();if(!v)return '';
  if(/^@?(everyone|here)$/i.test(v))return '@'+v.replace('@','').toLowerCase();
  var m=v.match(/\d{5,}/);return m?'<@&'+m[0]+'>':'';
}
// opts: {img:'url/soubor', pingCat:'weapons', noPing:true}
// jméno zadané ve formuláři; pokud se liší od přihlášeného člena, přidá se v závorce
function whoName(jmeno,m){return String(jmeno).toLowerCase()===String(m.displayName).toLowerCase()?jmeno:jmeno+' ('+m.displayName+')';}
var LOG_ICONS={sys:'🔑',board:'📌',task:'✅',msg:'💬',wh:'📦',ev:'📤',boost:'🚗',heist:'💎',cloth:'👕',fin:'💰',excuse:'📝',excuse_dec:'📝',report:'📄',radio:'📻',member:'👤',roster:'🪪',panic:'🚨'};
// ── GRAFICKÉ ZÁPISY (embed) ──
function money(n){return '$'+Number(n||0).toLocaleString('cs-CZ');}
function clip(s,n){s=String(s==null?'':s);return s.length>n?s.slice(0,n-1)+'…':s;}
// rich(barva, nadpis, popis, [[název,hodnota,inline?],...], {img, big, by})
function rich(color,title,desc,fields,o){
  o=o||{};
  var e={title:title,color:color,footer:{text:(o.by?o.by+' • ':'')+nowStr()}};
  if(desc)e.description=clip(desc,3500);
  var fl=(fields||[]).filter(function(f){return f&&f[1]!==undefined&&f[1]!==null&&String(f[1]).trim()!=='';});
  if(fl.length)e.fields=fl.map(function(f){return {name:f[0],value:clip(f[1],1000),inline:f[2]!==false};});
  var img=o.img?absImg(o.img):'';
  if(img){if(o.big)e.image={url:img};else e.thumbnail={url:img};}
  return e;
}
var C_BLUE=0x3498db,C_ORANGE=0xe67e22,C_RED=0xe74c3c,C_GREEN=0x2ecc71,C_PURPLE=0x9b59b6,C_PINK=0xe91e63,C_YELLOW=0xf1c40f,C_TEAL=0x1abc9c,C_GREY=0x95a5a6;
function addLog(type,text,opts){
  var m=getMember();var actor=m?m.displayName:'Systém';
  var log=DB.get('syslog')||[];
  log.unshift({time:nowFull(),type:type,actor:actor,text:text,cat:(opts&&opts.pingCat)||''});
  if(log.length>500)log=log.slice(0,500);
  DB.set('syslog',log);
  if(opts&&opts.noDiscord)return;
  if(opts&&(opts.embedTitle||opts.embed)){sendToDiscord(type,opts.discordText||text,opts);return;}
  // Lehký zápis pro všechno ostatní: ikona + věta (bez [SEKCE] [jméno] prefixu a bez uvozovek kolem jmen)
  var o=opts||{};
  var ic=o.icon||LOG_ICONS[type]||'';
  var clean=String(text).replace(/Člen "([^"]+)"/g,'$1');
  sendToDiscord(o.hook?o.hook:type,(ic?ic+' ':'')+(o.pingCat?(CAT[o.pingCat]||o.pingCat)+' · ':'')+clean,o);
}
function sendToDiscord(type,msg,opts){
  opts=opts||{};
  var s=DB.get('settings')||{};
  var secs=s.sections||{};
  var sec=secs[type]||{};
  if(sec.on===false)return;
  var csec=opts.pingCat?(secs['cat_'+opts.pingCat]||{}):{};
  if(csec.on===false)return;
  var url=(csec.url||'').trim()||(sec.url||'').trim()||s.webhook;
  if(opts.private)url=(sec.url||'').trim();
  if(!url)return;
  var ping='';
  if(!opts.noPing){
    var cp=opts.pingCat?((secs['cat_'+opts.pingCat]||{}).ping||''):'';
    ping=pingTag(cp||sec.ping);
  }
  if(opts.extraPing)ping=(ping?ping+' ':'')+opts.extraPing;
  var text='`'+nowStr()+'` '+msg;
  var body={username:s.webhookName||'Frakce LOG',allowed_mentions:{parse:['roles','everyone','users']}};
  var img=opts.img?absImg(opts.img):'';
  if(opts.embed){
    if(ping)body.content=ping;
    body.embeds=[opts.embed].concat(opts.extraEmbeds||[]);
  }else if(opts.embedTitle){
    if(ping)body.content=ping;
    var em={title:opts.embedTitle,description:msg,color:0xc49a14,footer:{text:nowStr()}};
    if(img)em.image={url:img};
    body.embeds=[em];
  }else if(img){
    if(ping)body.content=ping;
    body.embeds=[{description:text,color:0xc49a14,image:{url:img}}];
  }else{
    body.content=(ping?ping+' ':'')+text;
  }
  fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}).catch(function(){});
}

// ── INIT ─────────────────────────────────────
function initData(){
  DB.setDefault('members',[]);
  DB.setDefault('tasks',{});
  DB.setDefault('messages',{});
  DB.setDefault('reports',[]);
  DB.setDefault('warehouse',defaultWarehouse());
  DB.setDefault('boosting',[]);
  DB.setDefault('heists',[]);
  DB.setDefault('heistTargets',['Banka','Klenotnictví','Obchod','Bobcat']);
  DB.setDefault('clothing',[]);
  DB.setDefault('board',[]);
  DB.setDefault('boardConfirmed',{});
  DB.setDefault('excuses',[]);
  DB.setDefault('syslog',[]);
  DB.setDefault('finance',{payments:[],expenses:[{id:uid(),name:'Týdenní příspěvek',amount:5000,type:'weekly',note:'Povinný příspěvek'}]});
  DB.setDefault('finsettings',{weeklyFee:5000,feeDay:0});
  DB.setDefault('panicList',[]);
  DB.setDefault('settings',{webhook:'',webhookName:'Frakce LOG',sections:{}});
  DB.setDefault('radios',{primary:'',secondary:'',action:'',vedeni:''});
  DB.setDefault('contacts',{});
  DB.setDefault('incomes',[]);
  DB.setDefault('radioauto',{on:true,salt:uid()+uid(),lastSlot:''});
}

function defaultWarehouse(){
  return [
    {id:uid(),name:'Náboje dlouhe',cat:'ammo',qty:0,min:0,note:'Dlouhé náboje',img:'nabojdlouhy.png'},
    {id:uid(),name:'Náboje krátké',cat:'ammo',qty:0,min:0,note:'Pistolové náboje',img:'nabojpistol.png'},
    {id:uid(),name:'Baterka',cat:'equipment',qty:0,min:0,note:'Taktická svítilna',img:'baterka.png'},
    {id:uid(),name:'Tlumič',cat:'weapons',qty:0,min:0,note:'Pro pistoli i SMG',img:'tlumic.png'},
    {id:uid(),name:'Zaměřovač',cat:'weapons',qty:0,min:0,note:'Optický zaměřovač',img:'zamerovac.png'},
    {id:uid(),name:'Velký zásobník',cat:'weapons',qty:0,min:0,note:'Extended mag',img:'velkyzasobnik.png'},
    {id:uid(),name:'Žlutá Tráva',cat:'drugs',qty:0,min:0,note:'Speciální item',img:'zlutatrava.png'},
    {id:uid(),name:'Červena Tráva',cat:'drugs',qty:0,min:0,note:'Speciální item',img:'cervenatrava.png'},
    {id:uid(),name:'Modrá Tráva',cat:'drugs',qty:0,min:0,note:'Speciální item',img:'modratrava.png'},
    {id:uid(),name:'Fialová Tráva',cat:'drugs',qty:0,min:0,note:'Speciální item',img:'fialovatrava.png'},
    {id:uid(),name:'Extáze',cat:'drugs',qty:0,min:0,note:'Speciální item',img:'extaze.png'},
    {id:uid(),name:'Sáček s Extází',cat:'drugs',qty:0,min:0,note:'Speciální item',img:'balicekextaze.png'},
    {id:uid(),name:'Metamfetamin',cat:'drugs',qty:0,min:0,note:'Speciální item',img:'metak.png'},
    {id:uid(),name:'Sáček s Metamfetaminem',cat:'drugs',qty:0,min:0,note:'Speciální item',img:'sacekmetak.png'},
    {id:uid(),name:'Modrý Kanabis',cat:'drugs',qty:0,min:0,note:'Speciální item',img:'modrykanabis.png'},
    {id:uid(),name:'Žlutý Kanabis',cat:'drugs',qty:0,min:0,note:'Speciální item',img:'zlutykanabis.png'},
    {id:uid(),name:'Červený Kanabis',cat:'drugs',qty:0,min:0,note:'Speciální item',img:'cervenykanabis.png'},
    {id:uid(),name:'Fialový Kanabis',cat:'drugs',qty:0,min:0,note:'Speciální item',img:'fialovykanabis.png'},
    {id:uid(),name:'Joy',cat:'drugs',qty:0,min:0,note:'Speciální item',img:'joy.png'},
    {id:uid(),name:'Prášky na bolest',cat:'drugs',qty:0,min:0,note:'Speciální item',img:'praskynabolest.png'},
    {id:uid(),name:'Prazdný sáček',cat:'other',qty:0,min:0,note:'Speciální item',img:'prazdnysacek.png'}
  ];
}

// ── CLOCK ────────────────────────────────────
function startClock(){
  function tick(){var s=new Date().toLocaleString('cs-CZ',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit'});setText('mClock',s);}
  tick();setInterval(tick,1000);setInterval(radioTick,20000);
}

// ── SCREENS ──────────────────────────────────
function showScreen(id){
  ['selectScreen','memberScreen','adminScreen'].forEach(function(s){
    var e=document.getElementById(s);e.classList.remove('active');e.classList.add('hidden');
  });
  var t=document.getElementById(id);t.classList.remove('hidden');t.classList.add('active');
  applyMenuCfg();
}

async function goBack(){
  currentMemberId=null;pendingLoginId=null;
  stopRealtime();
  document.getElementById('panicBtn').classList.add('hidden');
  try{await DB.flush();}catch(e){}
  try{await sb.auth.signOut();}catch(e){}
  DB.cache={};
  document.getElementById('loginPass').value='';
  setText('loginErr','');
  showScreen('selectScreen');showLoginBox();
}

function goBackToMember(){
  // From admin back to member screen (if logged in as member with admin access)
  var m=getMember();
  if(m){
    showScreen('memberScreen');
    mTab('board',document.querySelector('#memberScreen .nb'));
  } else {
    goBack();
  }
}

// ── PANIC ────────────────────────────────────
function triggerPanic(){
  var m=getMember();if(!m)return;
  if(!confirm('Aktivovat PANIC? Váš přístup bude zablokován.'))return;
  var members=DB.get('members')||[];
  var mem=members.find(function(x){return x.id===currentMemberId;});
  if(mem){mem.panic=true;DB.set('members',members);}
  var pList=DB.get('panicList')||[];
  if(pList.indexOf(currentMemberId)===-1)pList.push(currentMemberId);
  DB.set('panicList',pList);
  var pf=genNewRadios();
  addLog('radio','Frekvence změněny kvůli PANICu ('+m.displayName+') — Primární: '+pf.primary+', Sekundární: '+pf.secondary+', Akce: '+pf.action+'.',{noDiscord:true});
  addLog('panic',m.displayName+' aktivoval PANIC. Proběhla změna frekvence — zjisti informaci, co se děje.',{embed:{
    title:'🚨 PANIC aktivován',
    description:'**'+m.displayName+'** aktivoval PANIC — zjisti informaci, co se děje.',
    color:0xc0392b,
    fields:[
      {name:'🎖️ Pozice',value:String(m.position||'—'),inline:true},
      {name:'🔒 Přístup',value:'Zablokován do odemčení Vedením',inline:true},
      {name:'📻 Vysílačka',value:'Frekvence byly změněny — nové najdeš ve Vysílačce.',inline:false}
    ],
    footer:{text:'Panic'},timestamp:new Date().toISOString()
  }});
  currentMemberId=null;
  stopRealtime();
  document.getElementById('panicBtn').classList.add('hidden');
  document.getElementById('panicOverlay').classList.remove('hidden');
  DB.flush().then(function(){return sb.auth.signOut();}).then(function(){DB.cache={};});
}

// ════════════════════════════════
//  PŘIHLÁŠENÍ (Supabase Auth)
// ════════════════════════════════
function showLoginBox(){
  var b=document.getElementById('loginBox');if(b)b.style.visibility='visible';
  var btn=document.getElementById('loginBtn');if(btn)btn.disabled=false;
}

async function doLogin(){
  var email=document.getElementById('loginEmail').value.trim();
  var pass=document.getElementById('loginPass').value;
  var btn=document.getElementById('loginBtn');
  if(!email||!pass){setText('loginErr','// ZADEJTE E-MAIL A HESLO');return;}
  setText('loginErr','');btn.disabled=true;
  try{
    var r=await sb.auth.signInWithPassword({email:email,password:pass});
    if(r.error){
      var em=String(r.error.message||'');
      var msg='// '+em.toUpperCase();
      if(/invalid login/i.test(em))msg='// NESPRÁVNÝ E-MAIL NEBO HESLO (nebo účet neexistuje v TOMTO projektu)';
      else if(/not confirmed/i.test(em))msg='// E-MAIL NENÍ POTVRZEN — v Supabase u účtu zvol Confirm user nebo ho vytvoř s Auto Confirm';
      else if(/invalid api key|apikey/i.test(em))msg='// ŠPATNÝ SUPABASE_ANON_KEY V app.js';
      setText('loginErr',msg);console.error('Login error',r.error);btn.disabled=false;return;
    }
    var ok=await enterPortal(r.data.session,true);
    if(!ok)btn.disabled=false;
  }catch(e){
    console.error(e);setText('loginErr','// CHYBA: '+(e.message||e)+' (zkontroluj SUPABASE_URL a klíč v app.js)');btn.disabled=false;
  }
}

// Načte data, najde člena podle přihlášeného účtu a otevře portál. Vrací true při úspěchu.
async function enterPortal(session,isFreshLogin){
  var user=session.user;
  async function reject(msg){
    try{await sb.auth.signOut();}catch(e){}
    DB.cache={};currentMemberId=null;setText('loginErr',msg);return false;
  }
  if(!(user.app_metadata&&user.app_metadata.frakce))return reject('// ÚČET NENÍ ČLENEM FRAKCE');
  try{await DB.load();}catch(e){console.error(e);return reject('// CHYBA NAČÍTÁNÍ DAT: '+(e.message||e));}
  migratePositions();
  initData();
  var members=DB.get('members')||[];
  var m=members.find(function(x){return x.authId===user.id;});
  if(!m){
    // propojení podle e-mailu (člen vytvořený dřív než účet)
    m=members.find(function(x){return x.email&&x.email.toLowerCase()===(user.email||'').toLowerCase();});
    if(m){m.authId=user.id;DB.set('members',members);}
  }
  if(!m&&members.length===0){
    // úplně první přihlášení — první účet se stává Bossem s admin přístupem
    m={id:uid(),authId:user.id,email:user.email,displayName:(user.email||'Mastermind').split('@')[0],position:'Mastermind',adminAccess:true,note:'',panic:false};
    members.push(m);DB.set('members',members);
  }
  if(!m)return reject('// ÚČET NENÍ PROPOJEN S ČLENEM — KONTAKTUJ VEDENÍ');
  if(m.panic){
    await reject('');
    document.getElementById('panicOverlay').classList.remove('hidden');
    return false;
  }
  currentMemberId=m.id;
  if(isFreshLogin)addLog('sys','Člen "'+m.displayName+'" se přihlásil.');
  document.getElementById('panicBtn').classList.remove('hidden');
  var adminBtn=document.getElementById('adminNavBtn');
  if(adminBtn)adminBtn.classList.toggle('hidden',!m.adminAccess);
  showScreen('memberScreen');
  mTab('board',document.querySelector('#memberScreen .nb'));
  startRealtime();
  setTimeout(radioTick,1500);
  return true;
}

// ── REALTIME (změny od ostatních členů se propíšou hned) ──
function startRealtime(){
  startPresence();
  setTimeout(function(){injectUX();notifSync();},700);
  if(rtChannel||!sb)return;
  rtChannel=sb.channel('frakce-kv').on('postgres_changes',{event:'*',schema:'public',table:TABLE},function(p){
    var row=p.new;if(!row||!row.key)return;
    if(Date.now()-(DB.lastWrite[row.key]||0)<2000)return; // vlastní zápis
    if(/^(seen|notif)_/.test(row.key)){if(row.value!==undefined)DB.cache[row.key]=row.value;renderDash();if(row.key==='notif_'+currentMemberId)notifRender();return;} // online stav — jen přepočítat přehled
    if(row.value===undefined){
      sb.from(TABLE).select('value').eq('key',row.key).maybeSingle().then(function(r){
        if(r.data){DB.cache[row.key]=r.data.value;scheduleRefresh();}
      });
      return;
    }
    DB.cache[row.key]=row.value;scheduleRefresh();
  }).subscribe();
}
function stopRealtime(){
  stopPresence();
  if(rtChannel&&sb){try{sb.removeChannel(rtChannel);}catch(e){}}
  rtChannel=null;
}
function scheduleRefresh(){clearTimeout(refreshTimer);refreshTimer=setTimeout(refreshView,400);}

var M_RENDER={
  board:function(){renderBoard();},tasks:function(){renderMemberTasks();},messages:function(){renderMemberMessages();},
  warehouse:function(){renderMemberWarehouse();},boosting:function(){renderMemberBoosting();},clothing:function(){renderClothing();},
  finance:function(){renderMyFinance();renderMyIncomes();},excuse:function(){renderMyExcuses();},
  report:function(){renderSentReports();},heist:function(){renderMyHeists();},radio:function(){renderMyRadio();},contacts:function(){renderContacts();},
  roster:function(){renderRoster(false);},calendar:function(){renderCalendar('m');}
};
var A_RENDER={
  members:function(){renderMemberGrid();},tasks:function(){renderAdminTasks();},messages:function(){renderAdminMessages();},board:function(){renderAdminBoard();},warehouse:function(){renderAdminWarehouse();},
  boosting:function(){renderAdminBoosting();},heists:function(){renderAdminHeists();},
  clothing:function(){renderAdminClothing();},finance:function(){renderAdminFinance();},excuses:function(){renderAdminExcuses();},
  reports:function(){renderAdminReports();},incomes:function(){renderAdminIncomes();},log:function(){renderLog();},
  roster:function(){renderRoster(true);},calendar:function(){renderCalendar('a');},stats:function(){renderStats();}
};
function forceLogout(panic){
  currentMemberId=null;stopRealtime();DB.cache={};
  document.getElementById('panicBtn').classList.add('hidden');
  try{sb.auth.signOut();}catch(e){}
  if(panic)document.getElementById('panicOverlay').classList.remove('hidden');
  else{showScreen('selectScreen');showLoginBox();setText('loginErr','// ÚČET BYL ODEBRÁN');}
}
function refreshView(){
  if(!currentMemberId)return;
  var m=getMember();
  if(!m||m.panic){forceLogout(!!(m&&m.panic));return;}
  var adminBtn=document.getElementById('adminNavBtn');
  if(adminBtn)adminBtn.classList.toggle('hidden',!m.adminAccess);
  applyMenuCfg();
  notifSync();
  var ae=document.activeElement;
  if(ae&&/^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName))return; // nepřepisovat, když uživatel píše
  var adminOpen=document.getElementById('adminScreen').classList.contains('active');
  if(adminOpen){
    if(!m.adminAccess){goBackToMember();return;}
    var ael=document.querySelector('.at.active');
    if(ael&&A_RENDER[ael.id.slice(3)])A_RENDER[ael.id.slice(3)]();
  }else if(document.getElementById('memberScreen').classList.contains('active')){
    var mel=document.querySelector('.mt.active');
    if(mel&&M_RENDER[mel.id.slice(3)])M_RENDER[mel.id.slice(3)]();
    updateBadges();
  }
}

// ── Volání serverless funkce pro správu účtů (/api/admin-users) ──
async function adminApi(body){
  var s=(await sb.auth.getSession()).data.session;
  if(!s)throw new Error('Nejsi přihlášen');
  var r=await fetch('/api/admin-users',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+s.access_token},body:JSON.stringify(body)});
  var j={};try{j=await r.json();}catch(e){}
  if(!r.ok)throw new Error(j.error||('HTTP '+r.status));
  return j;
}

function goToAdmin(){
  var m=getMember();
  if(!m||!m.adminAccess)return;
  addLog('sys','Člen "'+m.displayName+'" vstoupil do Administrace.');
  showScreen('adminScreen');
  aTab('board',document.querySelector('#adminScreen .nb'));
}



// ════════════════════════════════
//  ÚVODNÍ PŘEHLEDY (dashboard) + ONLINE STAV
// ════════════════════════════════
var PRESENCE_MS=5*60*1000,presenceTimer=null;
function scrollNavTo(btn){
  try{if(window.matchMedia('(max-width:700px)').matches){var sb=btn.closest('.sidebar');
    if(sb){sb.scrollTo({left:btn.offsetLeft-(sb.clientWidth-btn.offsetWidth)/2,behavior:'smooth'});}}}catch(e){}
}
function pingPresence(){var m=getMember();if(!m)return;DB.set('seen_'+m.id,Date.now());}
function startPresence(){pingPresence();clearInterval(presenceTimer);presenceTimer=setInterval(function(){pingPresence();notifSync();},120000);}
function stopPresence(){clearInterval(presenceTimer);presenceTimer=null;}
function onlineMembers(){
  var now=Date.now();
  return (DB.get('members')||[]).filter(function(x){
    if(x.id===currentMemberId)return true;
    var t=DB.cache['seen_'+x.id];return typeof t==='number'&&now-t<PRESENCE_MS;
  });
}
function goNav(scope,key){
  var root=scope==='a'?'#adminScreen':'#memberScreen';
  var b=document.querySelector(root+' .nb[onclick*="\''+key+'\'"]');
  (scope==='a'?aTab:mTab)(key,b);
}
function dashCard(icon,label,val,sub,cls,go){
  return '<div class="dc '+(cls||'')+'"'+(go?' onclick="'+go+'"':'')+'>'+
    '<div class="dc-top"><span class="dc-ic">'+icon+'</span><span class="dc-lb">'+label+'</span></div>'+
    '<div class="dc-val">'+val+'</div>'+(sub?'<div class="dc-sub">'+sub+'</div>':'')+'</div>';
}
function renderDash(){
  var m=getMember();if(!m)return;
  var members=DB.get('members')||[];
  var on=onlineMembers();
  var onLine='<div class="dash-online"><span class="dot"></span>ONLINE: '+(on.length?on.map(function(x){return esc(x.displayName);}).join(', '):'—')+'</div>';
  var el=document.getElementById('dashM');
  if(el){
    var tasks=DB.get('tasks')||{},msgs=DB.get('messages')||{};
    var openT=(tasks[m.id]||[]).filter(function(t){return !t.done;}).length;
    var nMsg=(msgs[m.id]||[]).length;
    var conf=DB.get('boardConfirmed')||{};
    var toConf=(DB.get('board')||[]).filter(function(p){return p.type==='confirm'&&!((conf[p.id]||[]).indexOf(m.id)!==-1);}).length;
    el.innerHTML=
      dashCard('📋','ÚKOLY',openT,openT?'otevřené':'vše hotovo',openT?'':'ok',"goNav('m','tasks')")+
      dashCard('💬','ZPRÁVY',nMsg,nMsg?'ve schránce':'žádné nové',nMsg?'':'ok',"goNav('m','messages')")+
      dashCard('✓','K POTVRZENÍ',toConf,toConf?'čeká na přečtení':'nic nečeká',toConf?'warn':'ok')+
      dashCard('🟢','ONLINE',on.length+'<small>/'+members.length+'</small>','členů v posledních 5 min','')+
      onLine;
  }
  var ea=document.getElementById('dashA');
  if(ea){
    var tAll=DB.get('tasks')||{},open=0;
    Object.keys(tAll).forEach(function(k){open+=(tAll[k]||[]).filter(function(t){return !t.done;}).length;});
    var low=(DB.get('warehouse')||[]).filter(function(i){return i.qty===0||(i.min>0&&i.qty<=i.min);}).length;
    ea.innerHTML=
      dashCard('👥','ČLENOVÉ',members.length,'v crew',"","goNav('a','members')")+
      dashCard('🟢','ONLINE',on.length+'<small>/'+members.length+'</small>','členů v posledních 5 min','')+
      dashCard('📋','OTEVŘENÉ ÚKOLY',open,'napříč členy',open?'':'ok',"goNav('a','tasks')")+
      dashCard('📦','NÍZKÁ ZÁSOBA',low,low?'položek dochází':'sklad v pořádku',low?'warn':'ok',"goNav('a','warehouse')")+
      onLine;
  }
}

// ════════════════════════════════
//  ÚPRAVA MENU (pořadí + názvy) — edituje jen Mastermind
// ════════════════════════════════
// DB klíč 'menu_cfg' = {admin:{order:[klíče],names:{klíč:'Nový název'}}, member:{...}}
var MENU_GROUPS={calendar:'A',stats:'E',board:'A',tasks:'A',messages:'A',warehouse:'B',boosting:'B',heist:'B',heists:'B',clothing:'B',finance:'C',excuse:'D',excuses:'D',report:'D',reports:'D',radio:'D',settings:'E',incomes:'E',log:'E',members:'E',roster:'E',contacts:'E',admin:'E'};
var MENU_NAVS={admin:'#adminScreen .sb-nav',member:'#memberScreen .sb-nav'};
function menuKey(btn){
  if(btn.id==='adminNavBtn')return 'admin';
  var m=/\(\s*'([^']+)'/.exec(btn.getAttribute('onclick')||'');
  return m?m[1]:null;
}
function menuItems(nav){
  var out=[];
  document.querySelectorAll(MENU_NAVS[nav]+' > .nb').forEach(function(b){
    var k=menuKey(b);if(!k)return;
    var nl=b.querySelector('.nl');
    if(nl&&b.dataset.defName===undefined)b.dataset.defName=nl.textContent;
    var ni=b.querySelector('.ni');
    out.push({key:k,btn:b,def:b.dataset.defName||'',icon:ni?ni.textContent:''});
  });
  return out;
}
function applyMenuCfg(){
  var cfg=DB.get('menu_cfg')||{};
  Object.keys(MENU_NAVS).forEach(function(nav){
    var items=menuItems(nav);if(!items.length)return;
    var c=cfg[nav]||{},order=c.order||[],names=c.names||{};
    var nv=document.querySelector(MENU_NAVS[nav]);
    var rank=function(k){var i=order.indexOf(k);return i===-1?1000+items.findIndex(function(x){return x.key===k;}):i;};
    items.slice().sort(function(x,y){return rank(x.key)-rank(y.key);}).forEach(function(it){nv.appendChild(it.btn);});
    items.forEach(function(it){
      var nl=it.btn.querySelector('.nl');
      if(nl)nl.textContent=(names[it.key]||'').trim()||it.def;
    });
    // oddělovače skupin (podle klíče záložky; funguje i po přeskládání)
    var prev=null;
    Array.prototype.forEach.call(nv.querySelectorAll(':scope > .nb'),function(b){
      var g=MENU_GROUPS[menuKey(b)]||'Z';
      b.classList.toggle('grp-start',prev!==null&&g!==prev);
      prev=g;
    });
  });
  var me=getMember();
  var eb=document.getElementById('menuEditBtn');
  if(eb)eb.classList.toggle('hidden',!isBossPos(me));
}

var mnuDraft=null,mnuNav='admin';
function mnuBuild(nav){
  var c=(DB.get('menu_cfg')||{})[nav]||{},order=c.order||[],names=c.names||{};
  var items=menuItems(nav).map(function(it){return {key:it.key,def:it.def,icon:it.icon,name:names[it.key]||''};});
  var rank=function(k){var i=order.indexOf(k);return i===-1?1000+items.findIndex(function(x){return x.key===k;}):i;};
  items.sort(function(x,y){return rank(x.key)-rank(y.key);});
  return items;
}
function openMenuEditor(){
  if(!isBossPos(getMember())){toast('Menu může upravovat jen Mastermind','error');return;}
  mnuDraft={admin:mnuBuild('admin'),member:mnuBuild('member')};
  mnuNav='admin';
  var ov=document.createElement('div');ov.className='modal-ov';ov.id='menuEditor';
  ov.innerHTML='<div class="modal-box menu-ed"><div class="modal-title">// UPRAVIT MENU</div>'+
    '<div class="menu-ed-tabs"><button class="wf active" id="mnuTabAdmin" onclick="mnuSwitch(\'admin\')">VEDENÍ</button><button class="wf" id="mnuTabMember" onclick="mnuSwitch(\'member\')">ČLENOVÉ</button></div>'+
    '<div id="mnuList" class="menu-ed-list"></div>'+
    '<div class="menu-ed-hint">Prázdný název = výchozí. Změna platí pro všechny.</div>'+
    '<div class="modal-ftr"><button class="btn-acc small" onclick="mnuSave()">ULOŽIT</button><button class="btn-ghost small" onclick="mnuReset()">VÝCHOZÍ</button><button class="btn-ghost small" onclick="mnuClose()">ZAVŘÍT</button></div></div>';
  document.body.appendChild(ov);
  mnuRender();
}
function mnuClose(){var e=document.getElementById('menuEditor');if(e)e.remove();mnuDraft=null;}
function mnuSwitch(nav){
  mnuNav=nav;
  document.getElementById('mnuTabAdmin').classList.toggle('active',nav==='admin');
  document.getElementById('mnuTabMember').classList.toggle('active',nav==='member');
  mnuRender();
}
function mnuRender(){
  var l=document.getElementById('mnuList');if(!l||!mnuDraft)return;
  l.innerHTML=mnuDraft[mnuNav].map(function(it,i){
    return '<div class="menu-ed-row"><span class="menu-ed-ic">'+esc(it.icon)+'</span>'+
      '<input type="text" maxlength="24" value="'+esc(it.name)+'" placeholder="'+esc(it.def)+'" oninput="mnuDraft[mnuNav]['+i+'].name=this.value"/>'+
      '<button class="menu-ed-mv" onclick="mnuMove('+i+',-1)" '+(i===0?'disabled':'')+'>▲</button>'+
      '<button class="menu-ed-mv" onclick="mnuMove('+i+',1)" '+(i===mnuDraft[mnuNav].length-1?'disabled':'')+'>▼</button></div>';
  }).join('');
}
function mnuMove(i,d){
  var a=mnuDraft[mnuNav],j=i+d;if(j<0||j>=a.length)return;
  var t=a[i];a[i]=a[j];a[j]=t;mnuRender();
}
function mnuReset(){
  mnuDraft[mnuNav]=menuItems(mnuNav).map(function(it){return {key:it.key,def:it.def,icon:it.icon,name:''};});
  mnuRender();
}
function mnuSave(){
  if(!isBossPos(getMember())){toast('Menu může upravovat jen Mastermind','error');return;}
  var cfg={};
  Object.keys(mnuDraft).forEach(function(nav){
    var names={};
    mnuDraft[nav].forEach(function(it){var n=(it.name||'').trim();if(n&&n!==it.def)names[it.key]=n;});
    cfg[nav]={order:mnuDraft[nav].map(function(it){return it.key;}),names:names};
  });
  DB.set('menu_cfg',cfg);
  applyMenuCfg();
  addLog('sys','Mastermind "'+getMember().displayName+'" upravil pořadí/názvy menu.');
  toast('Menu uloženo','success');
  mnuClose();
}

// ════════════════════════════════
//  ADMIN TABS
// ════════════════════════════════
function aTab(tab,btn){
  document.querySelectorAll('.at').forEach(function(t){t.classList.remove('active');});
  document.querySelectorAll('#adminScreen .nb').forEach(function(b){b.classList.remove('active');});
  var el=document.getElementById('at-'+tab);if(el)el.classList.add('active');
  if(btn){btn.classList.add('active');scrollNavTo(btn);}
  renderPickers();
  if(tab==='members')    renderMemberGrid();
  if(tab==='roster')     renderRoster(true);
  if(tab==='board')      renderAdminBoard();
  if(tab==='calendar')   renderCalendar('a');
  if(tab==='stats')      renderStats();
  if(tab==='tasks')      {populateTaskTarget();renderAdminTasks();}
  if(tab==='messages')   {populateMsgTarget();renderAdminMessages();}
  if(tab==='warehouse')  renderAdminWarehouse();
  if(tab==='boosting')   renderAdminBoosting();
  if(tab==='heists')     renderAdminHeists();
  if(tab==='clothing')   renderAdminClothing();
  if(tab==='finance')    renderAdminFinance();
  if(tab==='excuses')    renderAdminExcuses();
  if(tab==='reports')    renderAdminReports();
  if(tab==='radio')      renderAdminRadio();
  if(tab==='settings')   renderSettings();
  if(tab==='log')        renderLog();
  if(tab==='incomes')    renderAdminIncomes();
}

// ════════════════════════════════
//  MEMBER TABS
// ════════════════════════════════
function mTab(tab,btn){
  document.querySelectorAll('.mt').forEach(function(t){t.classList.remove('active');});
  document.querySelectorAll('#memberScreen .nb').forEach(function(b){b.classList.remove('active');});
  var el=document.getElementById('mt-'+tab);if(el)el.classList.add('active');
  if(btn){btn.classList.add('active');scrollNavTo(btn);}
  var m=getMember();
  if(m){setText('sbName',m.displayName);setText('sbPos',m.position);}
  renderPickers();
  if(tab==='board')     renderBoard();
  if(tab==='calendar')  renderCalendar('m');
  if(tab==='tasks')     renderMemberTasks();
  if(tab==='messages')  renderMemberMessages();
  if(tab==='warehouse'){renderMemberWarehouse();populateDepositSelect();}
  if(tab==='boosting')  renderMemberBoosting();
  if(tab==='heist')     renderMyHeists();
  if(tab==='clothing')  renderClothing();
  if(tab==='finance')   {renderMyFinance();populateIncSource();}
  if(tab==='excuse')    renderMyExcuses();
  if(tab==='report')    renderSentReports();
  if(tab==='radio')     renderMyRadio();
  if(tab==='contacts')  renderContacts();
  if(tab==='roster')    renderRoster(false);
  if(tab==='incomes')   {renderMyIncomes();}
  updateBadges();
}

// ── NOVÉ POLOŽKY (červená tečka u záložky) ──
// Pamatuje se v tomto prohlížeči, co člen už viděl (nástěnka, úkoly, zprávy).
function seenKey(m){return 'seen_'+m.id;}
function loadSeen(m){try{return JSON.parse(localStorage.getItem(seenKey(m))||'null');}catch(e){return null;}}
function saveSeen(m,s){try{localStorage.setItem(seenKey(m),JSON.stringify(s));}catch(e){}}
function currentIds(m){
  var tasks=DB.get('tasks')||{},msgs=DB.get('messages')||{};
  return {
    board:(DB.get('board')||[]).map(function(p){return p.id;}),
    tasks:(tasks[m.id]||[]).filter(function(t){return !t.done;}).map(function(t){return t.id;}),
    messages:(msgs[m.id]||[]).map(function(x){return x.id;})
  };
}
function updateNewDots(){
  var m=getMember();if(!m)return;
  var cur=currentIds(m);var s=loadSeen(m);
  if(!s){s=cur;saveSeen(m,s);} // první spuštění: nic se nepovažuje za nové
  var active=document.querySelector('#memberScreen .mt.active');
  var activeTab=active?active.id.slice(3):'';
  if(cur[activeTab]){s[activeTab]=cur[activeTab];saveSeen(m,s);} // otevřená záložka = viděno
  var conf=DB.get('boardConfirmed')||{};
  var needConfirm=(DB.get('board')||[]).some(function(p){return p.type==='confirm'&&!(conf[p.id]&&conf[p.id].indexOf(m.id)!==-1);});
  var flags={
    board:cur.board.some(function(id){return (s.board||[]).indexOf(id)===-1;})||(needConfirm&&activeTab!=='board'),
    tasks:cur.tasks.some(function(id){return (s.tasks||[]).indexOf(id)===-1;}),
    messages:cur.messages.some(function(id){return (s.messages||[]).indexOf(id)===-1;})
  };
  Object.keys(flags).forEach(function(t){
    var btn=document.querySelector('#memberScreen .nb[onclick*="mTab(\''+t+'\'"]');
    if(btn)btn.classList.toggle('has-new',!!flags[t]);
  });
}

function updateBadges(){
  var m=getMember();if(!m)return;
  updateNewDots();
  var tasks=DB.get('tasks')||{};
  var myTasks=(tasks[m.id]||[]).filter(function(t){return !t.done;});
  var tb=document.getElementById('taskBadge');
  if(tb){if(myTasks.length){tb.textContent=myTasks.length;tb.classList.add('visible');}else tb.classList.remove('visible');}
  var msgs=DB.get('messages')||{};
  var myMsgs=msgs[m.id]||[];
  var mb=document.getElementById('msgBadge');
  if(mb){if(myMsgs.length){mb.textContent=myMsgs.length;mb.classList.add('visible');}else mb.classList.remove('visible');}
  var fs=DB.get('finsettings')||{weeklyFee:0};
  if(fs.weeklyFee>0){
    var wk=getWeekKey();
    var payments=((DB.get('finance')||{}).payments||[]);
    var paid=payments.some(function(p){return p.memberId===m.id&&p.weekKey===wk;});
    var fb=document.getElementById('financeBadge');
    if(fb){if(!paid){fb.textContent='!';fb.classList.add('visible');}else fb.classList.remove('visible');}
  }
}

// ── BOARD ────────────────────────────────────
function renderBoard(){
  renderDash();
  var posts=DB.get('board')||[];
  var confirmed=DB.get('boardConfirmed')||{};
  var m=getMember();
  var el=document.getElementById('boardPosts');
  if(!posts.length){el.innerHTML='<div class="empty-s">// Nástěnka je prázdná</div>';return;}
  el.innerHTML=posts.slice().reverse().map(function(p){
    var myConf=confirmed[p.id]&&confirmed[p.id].indexOf(m.id)!==-1;
    var confCount=(confirmed[p.id]||[]).length;
    var needsConfirm=(p.type==='confirm');
    return '<div class="board-post '+p.type+'">'+
      '<div class="bp-header"><div class="bp-title">'+esc(p.title)+'</div>'+
      '<span class="bp-type '+p.type+'">'+{info:'INFO',warning:'VAROVÁNÍ',urgent:'URGENTNÍ',confirm:'POTVRDIT'}[p.type]+'</span></div>'+
      '<div class="bp-body">'+esc(mentionView(p.body))+'</div>'+
      '<div class="bp-footer"><span class="bp-date">'+p.date+' — '+esc(p.author)+'</span>'+
      '<div class="bp-reactions">'+
        (needsConfirm?'<span class="bp-confirm-count">✓ '+confCount+'</span>'+
          '<button class="bp-confirm-btn'+(myConf?' done':'')+'" onclick="confirmPost(\''+p.id+'\')"'+(myConf?' disabled':'')+'>'+
          (myConf?'✓ Přečteno':'✓ Potvrdit přečtení')+'</button>':'')+
      '</div></div></div>';
  }).join('');
}

function confirmPost(postId){
  var m=getMember();if(!m)return;
  var confirmed=DB.get('boardConfirmed')||{};
  if(!confirmed[postId])confirmed[postId]=[];
  if(confirmed[postId].indexOf(m.id)===-1){
    confirmed[postId].push(m.id);
    DB.set('boardConfirmed',confirmed);
    addLog('board','Člen "'+m.displayName+'" potvrdil přečtení příspěvku.');
    renderBoard();toast('Přečtení potvrzeno ✓','success');
  }
}

// ── TASKS ────────────────────────────────────
function switchTaskTab(which,btn){
  document.querySelectorAll('.ttab').forEach(function(b){b.classList.remove('active');});btn.classList.add('active');
  document.getElementById('mTaskActive').classList.toggle('hidden',which!=='active');
  document.getElementById('mTaskArchive').classList.toggle('hidden',which!=='archive');
}
function renderMemberTasks(){
  var m=getMember();
  var tasks=DB.get('tasks')||{};
  var all=tasks[m.id]||[];
  var active=all.filter(function(t){return !t.done;});
  var archived=all.filter(function(t){return t.done;});
  var elA=document.getElementById('mTaskActive');
  var elAr=document.getElementById('mTaskArchive');
  elA.innerHTML=active.length?active.map(function(t,i){
    return '<div class="task-card '+t.priority+'">'+
      '<div class="task-top"><span class="task-name">'+esc(t.title)+'</span><span class="pchip '+t.priority+'">'+PRIO[t.priority]+'</span></div>'+
      '<div class="task-desc">'+esc(t.desc)+'</div>'+
      '<div class="task-meta"><span class="task-date">'+t.date+'</span>'+
      '<div class="task-resolve"><select id="tres-'+i+'"><option value="splneno">Splněno</option><option value="casti">Částečně</option><option value="nesplneno">Nesplněno</option></select>'+
      '<button class="btn-done" onclick="completeTask('+i+')">ARCHIVOVAT</button></div></div></div>';
  }).join(''):'<div class="empty-s">// Žádné aktivní úkoly</div>';
  elAr.innerHTML=archived.length?archived.map(function(t){
    return '<div class="task-card archived">'+
      '<div class="task-top"><span class="task-name">'+esc(t.title)+'</span><span class="pchip '+t.priority+'">'+PRIO[t.priority]+'</span></div>'+
      '<div class="task-desc">'+esc(t.desc)+'</div>'+
      '<div class="task-meta"><span class="task-date">Zadáno: '+t.date+(t.resolvedDate?' | Vyřešeno: '+t.resolvedDate:'')+'</span>'+
      (t.resolution?'<span class="arch-result '+t.resolution+'">'+{splneno:'✓ SPLNĚNO',casti:'~ ČÁSTEČNĚ',nesplneno:'✗ NESPLNĚNO'}[t.resolution]+'</span>':'')+
      '</div></div>';
  }).join(''):'<div class="empty-s">// Archiv je prázdný</div>';
}
function completeTask(idx){
  var m=getMember();var tasks=DB.get('tasks')||{};var all=tasks[m.id]||[];
  var active=all.filter(function(t){return !t.done;});var t=active[idx];if(!t)return;
  var sel=document.getElementById('tres-'+idx);var res=sel?sel.value:'splneno';
  var ri=all.indexOf(t);all[ri].done=true;all[ri].resolution=res;all[ri].resolvedDate=nowStr();
  DB.set('tasks',tasks);
  addLog('task','Člen "'+m.displayName+'" archivoval úkol "'+t.title+'" — '+res+'.');
  toast('Úkol archivován','success');renderMemberTasks();updateBadges();
}

// ── MESSAGES ─────────────────────────────────
function renderMemberMessages(){
  var m=getMember();var msgs=DB.get('messages')||{};var myMsgs=msgs[m.id]||[];
  var el=document.getElementById('mMsgList');
  if(!myMsgs.length){el.innerHTML='<div class="empty-s">// Žádné zprávy</div>';return;}
  el.innerHTML=myMsgs.slice().reverse().map(function(msg){
    return '<div class="msg-card"><div class="msg-subject">'+esc(msg.subject)+'</div><div class="msg-body">'+esc(msg.body)+'</div><div class="msg-from">// OD: VEDENÍ — '+msg.date+'</div></div>';
  }).join('');
}

// ── WAREHOUSE ────────────────────────────────
var mWhCat='all';
function mWhFilter(cat,btn){
  mWhCat=cat;document.querySelectorAll('#mt-warehouse .wf').forEach(function(b){b.classList.remove('active');});btn.classList.add('active');renderMemberWarehouse();
}
var mWhQ='',mWhSort='default',aWhQ='',aWhSort='default';
function whView(items,cat,q,sort){
  var out=items.filter(function(i){return cat==='all'||i.cat===cat;});
  q=(q||'').trim().toLowerCase();
  if(q)out=out.filter(function(i){return (i.name||'').toLowerCase().indexOf(q)!==-1||(i.note||'').toLowerCase().indexOf(q)!==-1;});
  var low=function(i){return i.qty===0?0:(i.min>0&&i.qty<=i.min?1:2);};
  if(sort==='name')out.sort(function(x,y){return x.name.localeCompare(y.name,'cs');});
  else if(sort==='qtyAsc')out.sort(function(x,y){return x.qty-y.qty;});
  else if(sort==='qtyDesc')out.sort(function(x,y){return y.qty-x.qty;});
  else if(sort==='low')out.sort(function(x,y){return low(x)-low(y)||x.qty-y.qty;});
  return out;
}
function whSearch(scope,v){if(scope==='m'){mWhQ=v;renderMemberWarehouse();}else{aWhQ=v;renderAdminWarehouse();}}
function whSort(scope,v){if(scope==='m'){mWhSort=v;renderMemberWarehouse();}else{aWhSort=v;renderAdminWarehouse();}}
function renderMemberWarehouse(){
  var items=DB.get('warehouse')||[];
  var filtered=whView(items,mWhCat,mWhQ,mWhSort);
  var el=document.getElementById('mWhGrid');
  if(!filtered.length){el.innerHTML='<div class="empty-s" style="grid-column:1/-1">// Žádné položky</div>';return;}
  el.innerHTML=filtered.map(function(item){
    var qc=item.qty===0?'empty':(item.min>0&&item.qty<=item.min?'low':'');
    var imgH=item.img?'<div class="wh-img"><img src="'+esc(imgSrc(item.img))+'" onerror="this.parentElement.innerHTML=\'<span class=wh-icon>?</span>\'"/></div>':'<div class="wh-img"><span class="wh-icon">?</span></div>';
    return '<div class="wh-item'+(item.qty===0?' wh-empty':(item.min>0&&item.qty<=item.min?' wh-low':''))+'">'+imgH+
      '<div class="wh-cat">'+(CAT[item.cat]||item.cat)+'</div>'+
      '<div class="wh-name">'+esc(item.name)+'</div>'+
      (item.note?'<div class="wh-note-text">'+esc(item.note)+'</div>':'')+
      '<div class="wh-qty-row"><span class="wh-qty '+qc+'">'+item.qty+'</span><span class="wh-unit"> KS</span></div>'+
            (item.min>0&&item.qty>0&&item.qty<=item.min?'<div class="wh-alert">NÍZKÁ ZÁSOBA</div>':'')+
      '<div class="wh-pickup"><input class="wh-ev-input" type="text" placeholder="Vaše jméno..." id="pn-'+item.id+'"/>'+
      '<div class="wh-pickup-row"><input class="wh-ev-input small" type="number" value="1" min="1" max="'+item.qty+'" id="pa-'+item.id+'"/>'+
      '<button class="btn-pickup'+(item.qty===0?' btn-pickup-disabled':'')+'" onclick="pickupItem(\''+item.id+'\')"'+(item.qty===0?' disabled':'')+'>⬇ VYZVEDL</button>'+
      '</div><label class="ping-chk small"><input type="checkbox" id="pk-'+item.id+'"/><span>🔔 Označit Member</span></label></div></div>';
  }).join('');
}

// Upozornění do Discordu při poklesu pod limit (jen při přechodu dolů, ne při každém výdeji)
function stockAlert(item,before){
  if(!item||item.qty>=before)return;
  if(item.cat==='drugs')return; // drogy se do Discordu nehlásí
  var min=item.min||0;
  if(item.qty===0&&before>0){
    addLog('wh','Došla zásoba: '+item.name+' (0 ks) — je potřeba doplnit.',{img:item.img,pingCat:item.cat,plain:true,icon:'🚨'});
  }else if(min>0&&item.qty<=min&&before>min){
    addLog('wh','Nízká zásoba: '+item.name+' ('+item.qty+' ks, limit '+min+') — je potřeba doplnit.',{img:item.img,pingCat:item.cat,plain:true,icon:'⚠️'});
  }
}
function setItemMin(id){
  var items=DB.get('warehouse')||[];var item=items.find(function(i){return i.id===id;});if(!item)return;
  var v=prompt('Limit nízké zásoby pro "'+item.name+'" (0 = bez upozornění):',item.min||0);
  if(v===null)return;
  item.min=Math.max(0,parseInt(v)||0);DB.set('warehouse',items);
  toast('Limit nastaven na '+item.min,'success');renderAdminWarehouse();renderMemberWarehouse();
}
function pickupItem(itemId){
  var m=getMember();
  var nameEl=document.getElementById('pn-'+itemId);var amtEl=document.getElementById('pa-'+itemId);
  var jmeno=nameEl?nameEl.value.trim():'';var amt=parseInt(amtEl?amtEl.value:1)||1;
  if(!jmeno){nameEl.style.borderColor='var(--red)';nameEl.placeholder='Zadejte jméno!';setTimeout(function(){nameEl.style.borderColor='';nameEl.placeholder='Vaše jméno...';},2000);return;}
  var items=DB.get('warehouse')||[];var item=items.find(function(i){return i.id===itemId;});
  if(!item)return;
  if(amt>item.qty){amtEl.style.borderColor='var(--red)';setTimeout(function(){amtEl.style.borderColor='';},2000);toast('Nedostatek zásoby!','error');return;}
  var before=item.qty;item.qty=Math.max(0,item.qty-amt);DB.set('warehouse',items);
  addLog('ev',whoName(jmeno,m)+' vyzvedl '+amt+'× '+item.name+' ('+before+' → '+item.qty+')',{img:item.img,pingCat:item.cat,plain:true,icon:'📤',extraPing:pingBox('pk-'+itemId)});
  stockAlert(item,before);
  nameEl.value='';amtEl.value='1';toast(amt+'x '+item.name+' vydáno ✓','success');renderMemberWarehouse();
}

// ── WAREHOUSE DEPOSIT (member) ───────────────
function populateDepositSelect(){
  var items=DB.get('warehouse')||[];
  var sel=document.getElementById('depItem');
  if(!sel)return;
  sel.innerHTML=items.map(function(i){return '<option value="'+i.id+'">'+esc(i.name)+'</option>';}).join('');
}

function depositItem(){
  var m=getMember();
  var nameEl=document.getElementById('depName');
  var itemSel=document.getElementById('depItem');
  var amtEl=document.getElementById('depAmt');
  var st=document.getElementById('depStatus');
  var jmeno=nameEl?nameEl.value.trim():'';
  var itemId=itemSel?itemSel.value:'';
  var amt=parseInt(amtEl?amtEl.value:1)||1;
  if(!jmeno){nameEl.style.borderColor='var(--red)';nameEl.placeholder='Zadejte jméno!';setTimeout(function(){nameEl.style.borderColor='';nameEl.placeholder='Jméno...';},2000);return;}
  if(!itemId){st.textContent='// VYBERTE ITEM';return;}
  var items=DB.get('warehouse')||[];
  var item=items.find(function(i){return i.id===itemId;});
  if(!item){st.textContent='// ITEM NENALEZEN';return;}
  var before=item.qty;
  item.qty=item.qty+amt;
  DB.set('warehouse',items);
  addLog('wh',whoName(jmeno,m)+' vložil '+amt+'× '+item.name+' ('+before+' → '+item.qty+')',{img:item.img,pingCat:item.cat,plain:true,icon:'📥',extraPing:pingBox('ping-dep')});
  nameEl.value='';amtEl.value='1';
  st.textContent='// ✓ VLOŽENO DO SKLADU';
  setTimeout(function(){st.textContent='';},3000);
  toast(amt+'x '+item.name+' vloženo do skladu ✓','success');
  renderMemberWarehouse();
}

// ── CLOTHING ─────────────────────────────────
var CLOTH_CATS=[
  {key:'masks',  label:'Masky & Vousy'},
  {key:'chains', label:'Šály & Řetízky'},
  {key:'jackets',label:'Bundy & Trička'},
  {key:'under',  label:'Podtrička & Sukně'},
  {key:'vests',  label:'Vesty & Doplňky'},
  {key:'bags',   label:'Batohy & Padáky'},
  {key:'hands',  label:'Ruce & Rukavice'},
  {key:'pants',  label:'Kalhoty'},
  {key:'shoes',  label:'Boty'},
  {key:'decals', label:'Nášivky & Doplňky'}
];

function renderClothing(){
  var sets=DB.get('clothing')||[];
  var el=document.getElementById('clothSets');
  if(!el)return;
  if(!sets.length){
    el.innerHTML='<div class="empty-s" style="margin:2rem">// Vedení zatím nepřidalo žádné sety oblečení</div>';
    return;
  }
  var cols=sets.map(function(s){
    var src=s.imgIsUrl?s.img:imgSrc(s.img);
    var imgH=s.img
    ? '<div class="cs-img-wrap"><img src="'+esc(src)+'" class="cs-img" onerror="this.style.display=\'none\'"></div>'
    : '<div class="cs-img-wrap cs-img-ph">👕</div>';
    var rows=CLOTH_CATS.map(function(c){
      var m=s[c.key+'_m']!==undefined?s[c.key+'_m']:0;
      var d=s[c.key+'_d']!==undefined?s[c.key+'_d']:0;
      return '<tr><td class="cs-cat">'+esc(c.label)+'</td>'+
        '<td class="cs-label">Model</td><td class="cs-val">'+m+'</td>'+
        '<td class="cs-label">Design</td><td class="cs-val">'+d+'</td></tr>';
    }).join('');
    return '<div class="cloth-set-col">'+
      '<div class="cs-title">'+esc(s.name)+'</div>'+
      imgH+
      (s.desc?'<div class="cs-desc">'+esc(s.desc)+'</div>':'')+
      '<table class="cs-table">'+rows+'</table>'+
    '</div>';
  }).join('');
  el.innerHTML='<div class="cloth-sets-grid">'+cols+'</div>';
}

function filterCloth(cat,btn){
  document.querySelectorAll('#mt-clothing .wf').forEach(function(b){b.classList.remove('active');});
  if(btn)btn.classList.add('active');
  renderClothing();
}

// ── CLOTHING ADMIN ───────────────────────────
function previewClothImg(){
  var el=document.getElementById('cl-img-preview');if(!el)return;
  var url=document.getElementById('cl-img-url'),file=document.getElementById('cl-img');
  var val=((url&&url.value.trim())||(file&&file.value.trim())||'');
  var src=imgSrc(val);
  el.innerHTML=src?'<img src="'+esc(src)+'" style="max-height:110px;object-fit:contain;filter:drop-shadow(0 0 6px rgba(196,154,20,.3));" onerror="this.parentElement.innerHTML=\'<span style=color:var(--red)>nenalezeno</span>\'"/>':'—';
}

function toggleAddCloth(){
  document.getElementById('addClothPanel').classList.toggle('hidden');
}

function addCloth(){
  var name=document.getElementById('cl-name').value.trim();
  var desc=document.getElementById('cl-desc').value.trim();
  var imgFile=document.getElementById('cl-img')?document.getElementById('cl-img').value.trim():'';
  var imgUrl=document.getElementById('cl-img-url')?document.getElementById('cl-img-url').value.trim():'';
  var img=imgUrl||imgFile;
  var imgIsUrl=!!imgUrl;
  var st=document.getElementById('addClothStatus');
  if(!name){st.textContent='// ZADEJTE NÁZEV SETU';return;}
  var cats=['masks','chains','jackets','under','vests','bags','hands','pants','shoes','decals'];
  var setData={id:uid(),name:name,desc:desc,img:img,imgIsUrl:imgIsUrl};
  cats.forEach(function(c){
    var mi=document.getElementById('cl-'+c+'-m');
    var di=document.getElementById('cl-'+c+'-d');
    setData[c+'_m']=mi?parseInt(mi.value)||0:0;
    setData[c+'_d']=di?parseInt(di.value)||0:0;
  });
  var items=DB.get('clothing')||[];
  items.push(setData);
  DB.set('clothing',items);
  addLog('cloth','Admin přidal outfit set: "'+name+'".',{extraPing:pingBox('ping-cloth'),embed:rich(C_PINK,'👕 NOVÝ OUTFIT SET','**'+name+'**'+(desc?'\n'+desc:''),[],{img:img,big:true,by:(getMember()?getMember().displayName:'Admin')})});
  st.textContent='// SET PŘIDÁN';
  setTimeout(function(){st.textContent='';},3000);
  document.getElementById('cl-name').value='';
  document.getElementById('cl-desc').value='';
  if(document.getElementById('cl-img'))document.getElementById('cl-img').value='';
  if(document.getElementById('cl-img-url'))document.getElementById('cl-img-url').value='';
  if(document.getElementById('cl-img-preview'))document.getElementById('cl-img-preview').innerHTML='—';
  cats.forEach(function(c){
    var mi=document.getElementById('cl-'+c+'-m');var di=document.getElementById('cl-'+c+'-d');
    if(mi)mi.value='0';if(di)di.value='0';
  });
  toast(name+' přidán','success');
  renderAdminClothing();
  renderClothing();
}

function switchAClothTab(cat,btn){
  document.querySelectorAll('#at-clothing .ctab').forEach(function(b){b.classList.remove('active');});
  if(btn)btn.classList.add('active');
  renderAdminClothing();
}

function renderAdminClothing(){
  var sets=DB.get('clothing')||[];
  var el=document.getElementById('aClothCols');
  if(!el)return;
  if(!sets.length){
    el.innerHTML='<div class="empty-s">// Žádné sety oblečení — přidejte první set</div>';
    return;
  }
  var cols=sets.map(function(s){
    var src=s.imgIsUrl?s.img:imgSrc(s.img);
    var imgH=s.img
      ? '<div class="cs-img-wrap"><img src="'+esc(src)+'" class="cs-img" onerror="this.style.display=\'none\'"/></div>'
      : '<div class="cs-img-wrap cs-img-ph">👕</div>';
    var rows=CLOTH_CATS.map(function(c){
      var m=s[c.key+'_m']!==undefined?s[c.key+'_m']:0;
      var d=s[c.key+'_d']!==undefined?s[c.key+'_d']:0;
      return '<tr><td class="cs-cat">'+esc(c.label)+'</td>'+
        '<td class="cs-label">Model</td><td class="cs-val">'+m+'</td>'+
        '<td class="cs-label">Design</td><td class="cs-val">'+d+'</td></tr>';
    }).join('');
    return '<div class="cloth-set-col">'+
      '<div class="cs-title">'+esc(s.name)+'</div>'+
      imgH+
      (s.desc?'<div class="cs-desc">'+esc(s.desc)+'</div>':'')+
      '<table class="cs-table">'+rows+'</table>'+
      '<button class="cloth-del-btn" style="margin-top:.5rem;width:100%;" onclick="delCloth(\''+s.id+'\')">✕ SMAZAT SET</button>'+
    '</div>';
  }).join('');
  el.innerHTML='<div class="cloth-sets-grid">'+cols+'</div>';
}

function delCloth(id){
  if(!confirm('Smazat set oblečení?'))return;
  DB.set('clothing',(DB.get('clothing')||[]).filter(function(i){return i.id!==id;}));
  renderAdminClothing();
  renderClothing();
  toast('Set smazán','info');
}

// ── FINANCE ADMIN ────────────────────────────
function toggleAddExpense(){document.getElementById('addExpensePanel').classList.toggle('hidden');}
function addExpense(){
  var name=document.getElementById('exp-name').value.trim();
  var amount=parseInt(document.getElementById('exp-amount').value)||0;
  var type=document.getElementById('exp-type').value;
  var note=document.getElementById('exp-note').value.trim();
  var optEl=document.getElementById('exp-optional');
  var optional=!!(optEl&&optEl.checked);
  var st=document.getElementById('expStatus');
  if(!name||!amount){st.textContent='// VYPLŇTE POLE';return;}
  var fin=DB.get('finance')||{payments:[],expenses:[]};
  fin.expenses.push({id:uid(),name:name,amount:amount,type:type,note:note,optional:optional});
  DB.set('finance',fin);
  addLog('fin','Admin přidal '+(optional?'nepovinnou ':'')+'výdajovou položku: "'+name+'" $'+amount+'.',{extraPing:pingBox('ping-exp'),embed:rich(C_YELLOW,'🧾 NOVÁ VÝDAJOVÁ POLOŽKA','**'+name+'**',[['💵 Částka',money(amount)],['Druh',optional?'Nepovinná':'Povinná']],{by:(getMember()?getMember().displayName:'Admin')})});
  st.textContent='// PŘIDÁNO';setTimeout(function(){st.textContent='';},3000);
  ['exp-name','exp-note'].forEach(function(i){document.getElementById(i).value='';});document.getElementById('exp-amount').value='';
  if(optEl)optEl.checked=false;
  toast('Položka přidána','success');renderAdminFinance();
}
function delExpense(id){
  if(!confirm('Smazat položku?'))return;
  var fin=DB.get('finance')||{payments:[],expenses:[]};
  fin.expenses=fin.expenses.filter(function(e){return e.id!==id;});DB.set('finance',fin);
  renderAdminFinance();
}
function renderAdminFinance(){
  var fin=DB.get('finance')||{payments:[],expenses:[]};
  var fs=DB.get('finsettings')||{weeklyFee:5000};
  var members=DB.get('members')||[];
  var wk=getWeekKey();
  var incomes=DB.get('incomes')||[];
  var confirmedIncome=incomes.filter(function(i){return i.status==='confirmed';}).reduce(function(s,i){return s+i.amount;},0);
  var total=fin.payments.reduce(function(s,p){return s+p.amount;},0)+confirmedIncome;
  var totalExp=fin.expenses.reduce(function(s,e){return s+e.amount;},0);
  var el=document.getElementById('financeAdminPanel');
  var summary='<div class="fa-summary">'+
    '<div class="fa-card"><div class="fa-card-title">CELKEM PŘIJATO</div><div class="fa-card-val acc">$'+total+'</div></div>'+
    '<div class="fa-card"><div class="fa-card-title">CELKEM VÝDAJE</div><div class="fa-card-val red">$'+totalExp+'</div></div>'+
    '<div class="fa-card"><div class="fa-card-title">BILANCE</div><div class="fa-card-val '+(total-totalExp>=0?'green':'red')+'">$'+(total-totalExp)+'</div></div>'+
  '</div>';
  var expenses='<div class="fa-expenses"><div class="fa-exp-title">// VÝDAJOVÉ POLOŽKY</div>'+
    (fin.expenses.length?fin.expenses.map(function(e){
      return '<div class="fa-exp-item"><span class="fa-exp-name">'+esc(e.name)+(e.note?' — <em>'+esc(e.note)+'</em>':'')+(e.optional?' <span style="font-family:Share Tech Mono,monospace;font-size:.6rem;color:var(--acc);">[NEPOVINNÁ]</span>':'')+'</span>'+
        '<div style="display:flex;gap:.5rem;align-items:center;"><span class="fa-exp-amt">$'+e.amount+' '+(e.type==='weekly'?'/ týden':'jednorázově')+'</span>'+
        '<button class="btn-micro del" onclick="delExpense(\''+e.id+'\')">✕</button></div></div>';
    }).join(''):'<div class="empty-s">// Žádné položky</div>')+
  '</div>';
  // Weekly mandatory payments
  var payments='<div class="fa-member-payments"><div class="fa-exp-title">// TÝDENNÍ PŘÍSPĚVEK — '+wk+'</div>'+
    members.map(function(m){
      var paid=fin.payments.some(function(p){return p.memberId===m.id&&p.weekKey===wk&&(p.expenseId==='weekly'||!p.expenseId);});
      return '<div class="fa-pay-row '+(paid?'paid':'unpaid')+'">'+
        '<span class="fa-pay-name">'+esc(m.displayName)+'</span>'+
        '<div style="display:flex;gap:.5rem;align-items:center;">'+
          '<span class="fa-pay-status '+(paid?'paid':'unpaid')+'">'+(paid?'✓ ZAPLACENO':'✗ NEZAPLACENO')+'</span>'+
          (!paid?'<button class="btn-record-pay" onclick="recordPayment(\''+m.id+'\')">EVIDOVAT</button>':'')+
        '</div></div>';
    }).join('')+
  '</div>';
  // Optional expense payments per item
  var optionals=fin.expenses.filter(function(e){return e.optional;});
  var optSections=optionals.map(function(e){
    return '<div class="fa-member-payments" style="margin-top:1rem;"><div class="fa-exp-title">// NEPOVINNÁ: '+esc(e.name)+' — $'+e.amount+'</div>'+
      members.map(function(m){
        var paid=fin.payments.some(function(p){return p.memberId===m.id&&p.expenseId===e.id&&p.weekKey===wk;});
        return '<div class="fa-pay-row '+(paid?'paid':'unpaid')+'">'+
          '<span class="fa-pay-name">'+esc(m.displayName)+'</span>'+
          '<div style="display:flex;gap:.5rem;align-items:center;">'+
            '<span class="fa-pay-status '+(paid?'paid':'unpaid')+'">'+(paid?'✓ ZAPLATIL':'— NEZAPLATIL')+'</span>'+
            (!paid?'<button class="btn-record-pay" onclick="recordOptionalPayment2(\''+m.id+'\',\''+e.id+'\')">EVIDOVAT</button>':'')+
          '</div></div>';
      }).join('')+
    '</div>';
  }).join('');
  var hist='<div class="fa-member-payments"><div class="fa-exp-title">// HISTORIE PLATEB (lze smazat)</div>'+
    (fin.payments.length?fin.payments.slice().reverse().map(function(p){
      return '<div class="fa-pay-row paid"><span class="fa-pay-name">'+esc(p.memberName)+' — '+esc(p.note||'Platba')+'</span>'+
        '<div style="display:flex;gap:.6rem;align-items:center;"><span class="fa-exp-amt">$'+p.amount+' · '+esc(p.date||'')+' ('+esc(p.weekKey||'')+')</span>'+
        '<button class="btn-micro del" onclick="delPayment(\''+p.id+'\')">✕</button></div></div>';
    }).join(''):'<div class="empty-s">// Žádné platby</div>')+'</div>';
  var incHist='<div class="fa-member-payments"><div class="fa-exp-title">// POTVRZENÉ PŘÍJMY DO KASY (lze smazat)</div>'+
    (incomes.filter(function(i){return i.status==='confirmed';}).length?incomes.filter(function(i){return i.status==='confirmed';}).slice().reverse().map(function(i){
      return '<div class="fa-pay-row paid"><span class="fa-pay-name">'+esc(i.memberName)+' — '+esc(i.source)+(i.note?' ('+esc(i.note)+')':'')+'</span>'+
        '<div style="display:flex;gap:.6rem;align-items:center;"><span class="fa-exp-amt">$'+i.amount+' · '+esc(i.date||'')+'</span>'+
        '<button class="btn-micro del" onclick="delIncome(\''+i.id+'\')">✕</button></div></div>';
    }).join(''):'<div class="empty-s">// Žádné příjmy</div>')+'</div>';
  el.innerHTML=summary+expenses+payments+optSections+hist+incHist;
}
function delPayment(id){
  if(!confirm('Smazat záznam platby?'))return;
  var fin=DB.get('finance')||{payments:[],expenses:[]};
  var p=fin.payments.find(function(x){return x.id===id;});
  fin.payments=fin.payments.filter(function(x){return x.id!==id;});
  DB.set('finance',fin);
  toast('Platba smazána','info');renderAdminFinance();
}
function recordPayment(memberId,memberName){
  var fs=DB.get('finsettings')||{weeklyFee:5000};
  var fin=DB.get('finance')||{payments:[],expenses:[]};
  var wk=getWeekKey();
  fin.payments.push({id:uid(),memberId:memberId,memberName:memberName,weekKey:wk,amount:fs.weeklyFee,date:nowStr(),note:'Týdenní příspěvek',expenseId:'weekly'});
  DB.set('finance',fin);
  addLog('fin','Admin evidoval platbu od "'+memberName+'" — $'+fs.weeklyFee+' ('+wk+').',{embed:rich(C_GREEN,'💰 PLATBA EVIDOVÁNA',null,[['👤 Člen',memberName],['💵 Částka',money(fs.weeklyFee)],['📅 Týden',wk],['🧾 Za','Týdenní příspěvek',false]],{by:(getMember()?getMember().displayName:'Admin')})});
  toast('Platba evidována','success');renderAdminFinance();
}
function recordOptionalPayment(memberId,memberName,expenseId,expenseName,amount){
  var fin=DB.get('finance')||{payments:[],expenses:[]};
  var wk=getWeekKey();
  var already=fin.payments.some(function(p){return p.memberId===memberId&&p.expenseId===expenseId&&p.weekKey===wk;});
  if(already){toast('Platba již evidována','info');return;}
  fin.payments.push({id:uid(),memberId:memberId,memberName:memberName,weekKey:wk,amount:amount,date:nowStr(),note:expenseName,expenseId:expenseId});
  DB.set('finance',fin);
  addLog('fin','Admin evidoval platbu od "'+memberName+'" za "'+expenseName+'" — $'+amount+' ('+wk+').',{embed:rich(C_GREEN,'💰 PLATBA EVIDOVÁNA',null,[['👤 Člen',memberName],['💵 Částka',money(amount)],['📅 Týden',wk],['🧾 Za',expenseName,false]],{by:(getMember()?getMember().displayName:'Admin')})});
  toast('Platba evidována','success');renderAdminFinance();
}

// ── MEMBER FINANCE ───────────────────────────
function renderMyFinance(){
  var m=getMember();if(!m)return;
  var fin=DB.get('finance')||{payments:[],expenses:[]};
  var fs=DB.get('finsettings')||{weeklyFee:5000};
  var wk=getWeekKey();
  var el=document.getElementById('myFinance');if(!el)return;
  var html='';
  if(fs.weeklyFee>0){
    var weeklyPaid=fin.payments.some(function(p){return p.memberId===m.id&&p.weekKey===wk&&(p.expenseId==='weekly'||(!p.expenseId&&!p.note)||p.note==='Týdenní příspěvek');});
    html+='<div class="fa-expenses" style="margin-bottom:1rem;">'+
      '<div class="fa-exp-title">// TÝDENNÍ PŘÍSPĚVEK — '+wk+'</div>'+
      '<div class="fa-pay-row '+(weeklyPaid?'paid':'unpaid')+'" style="border-radius:4px;margin-top:.3rem;">'+
        '<span class="fa-pay-name">Povinný týdenní příspěvek</span>'+
        '<div style="display:flex;gap:.6rem;align-items:center;">'+
          '<span style="font-family:Share Tech Mono,monospace;font-size:.75rem;color:var(--muted);">$'+fs.weeklyFee+'</span>'+
          '<span class="fa-pay-status '+(weeklyPaid?'paid':'unpaid')+'">'+(weeklyPaid?'✓ ZAPLACENO':'✗ NEZAPLACENO')+'</span>'+
          (!weeklyPaid?'<button class="btn-record-pay" onclick="memberPayWeekly()">ZAPLATIL JSEM</button>':'')+
        '</div>'+
      '</div></div>';
  }
  var optionals=fin.expenses.filter(function(e){return e.optional===true||e.optional===1;});
  if(optionals.length){
    html+='<div class="fa-expenses"><div class="fa-exp-title">// NEPOVINNÉ PŘÍSPĚVKY</div>';
    optionals.forEach(function(e){
      var paid=fin.payments.some(function(p){return p.memberId===m.id&&p.expenseId===e.id;});
      html+='<div class="fa-pay-row '+(paid?'paid':'unpaid')+'" style="border-radius:4px;margin-top:.3rem;">'+
        '<div>'+
          '<span class="fa-pay-name">'+esc(e.name)+'</span>'+
          (e.note?'<div style="font-size:.65rem;color:var(--muted);font-family:Share Tech Mono,monospace;margin-top:.15rem;">'+esc(e.note)+'</div>':'')+
          '<div style="font-size:.65rem;color:var(--muted);font-family:Share Tech Mono,monospace;margin-top:.1rem;">$'+e.amount+' / '+(e.type==='weekly'?'týden':'jednorázově')+'</div>'+
        '</div>'+
        '<div style="display:flex;gap:.6rem;align-items:center;">'+
          '<span class="fa-pay-status '+(paid?'paid':'unpaid')+'">'+(paid?'✓ ZAPLACENO':'✗ NEZAPLACENO')+'</span>'+
          (!paid?'<button class="btn-record-pay" onclick="memberPayOptional(\''+e.id+'\')">ZAPLATIL JSEM</button>':'')+
        '</div>'+
      '</div>';
    });
    html+='</div>';
  }
  if(!html)html='<div class="empty-s">// Žádné aktivní příspěvky</div>';
  el.innerHTML=html;
}

function memberPayWeekly(){
  var m=getMember();if(!m)return;
  var fs=DB.get('finsettings')||{weeklyFee:5000};
  var fin=DB.get('finance')||{payments:[],expenses:[]};
  var wk=getWeekKey();
  var already=fin.payments.some(function(p){return p.memberId===m.id&&p.weekKey===wk&&p.expenseId==='weekly';});
  if(already){toast('Příspěvek již evidován','info');return;}
  fin.payments.push({id:uid(),memberId:m.id,memberName:m.displayName,weekKey:wk,amount:fs.weeklyFee,date:nowStr(),note:'Týdenní příspěvek',expenseId:'weekly'});
  DB.set('finance',fin);
  addLog('fin','Člen "'+m.displayName+'" evidoval týdenní příspěvek $'+fs.weeklyFee+' ('+wk+').',{embed:rich(C_GREEN,'💰 TÝDENNÍ PŘÍSPĚVEK',null,[['👤 Člen',m.displayName],['💵 Částka',money(fs.weeklyFee)],['📅 Týden',wk]],{by:m.displayName})});
  toast('Platba evidována ✓','success');renderMyFinance();updateBadges();
}

function memberPayOptional(expenseId){
  var m=getMember();if(!m)return;
  var fin=DB.get('finance')||{payments:[],expenses:[]};
  var exp=fin.expenses.find(function(e){return e.id===expenseId;});
  if(!exp)return;
  var wk=getWeekKey();
  var already=fin.payments.some(function(p){return p.memberId===m.id&&p.expenseId===expenseId&&p.weekKey===wk;});
  if(already){toast('Platba již evidována','info');return;}
  fin.payments.push({id:uid(),memberId:m.id,memberName:m.displayName,weekKey:wk,amount:exp.amount,date:nowStr(),note:exp.name,expenseId:expenseId});
  DB.set('finance',fin);
  addLog('fin','Člen "'+m.displayName+'" přispěl na "'+exp.name+'" — $'+exp.amount+' ('+wk+').',{embed:rich(C_GREEN,'💰 PŘÍSPĚVEK NA VÝDAJ',null,[['👤 Člen',m.displayName],['💵 Částka',money(exp.amount)],['📅 Týden',wk],['🧾 Na',exp.name,false]],{by:m.displayName})});
  toast('Platba evidována ✓','success');renderMyFinance();
}

// ── EXCUSES ADMIN ────────────────────────────
function renderAdminExcuses(){
  var excuses=DB.get('excuses')||[];
  var el=document.getElementById('allExcuses');
  if(!excuses.length){el.innerHTML='<div class="empty-s">// Žádné omluvenky</div>';return;}
  el.innerHTML=excuses.slice().reverse().map(function(e){
    return '<div class="excuse-card excuse-'+e.status+'">'+
      '<div class="excuse-head"><span class="excuse-member">'+esc(e.memberName)+' — '+esc(e.event)+'</span>'+
      '<span class="excuse-chip '+e.status+'">'+(e.status==='pending'?'ČEKÁ':e.status==='accepted'?'NA VĚDOMÍ':'ZAMÍTNUTO')+'</span></div>'+
      '<div style="text-align:right"><button class="btn-micro del" onclick="delExcuse(\''+e.id+'\')">✕ SMAZAT</button></div>'+'<div class="excuse-detail">Datum: <strong>'+esc(e.date)+'</strong> — '+esc(e.reason)+'</div>'+
      (e.note?'<div class="excuse-detail" style="color:var(--muted)">'+esc(e.note)+'</div>':'')+
      '<div class="excuse-date-info">Odesláno: '+e.submitted+'</div>'+
      (e.status==='pending'?'<div class="excuse-actions"><button class="btn-acc small" onclick="resolveExcuse(\''+e.id+'\',\'accepted\')">BERU NA VĚDOMÍ</button><button class="btn-danger" onclick="resolveExcuse(\''+e.id+'\',\'denied\')">ZAMÍTNOUT</button></div>':'')+
    '</div>';
  }).join('');
}
function resolveExcuse(id,decision){
  var excuses=DB.get('excuses')||[];var e=excuses.find(function(x){return x.id===id;});
  if(!e)return;e.status=decision;DB.set('excuses',excuses);
  var ok=decision==='accepted';
  var dm=getMember();var who=dm?dm.displayName:'Admin';
  var dp=String(e.date||'').split('-');var dstr=dp.length===3?dp[2]+'. '+dp[1]+'. '+dp[0]:(e.date||'—');
  var embed={
    title:ok?'✅ OMLUVENKA — BERE SE NA VĚDOMÍ':'❌ OMLUVENKA ZAMÍTNUTA',
    description:'**'+e.memberName+'** — '+e.event,
    color:ok?0x2ecc71:0xe74c3c,
    fields:[
      {name:'👤 Člen',value:e.memberName,inline:true},
      {name:'📅 Datum',value:dstr,inline:true},
      {name:'⏳ Délka',value:e.length||'neuvedena',inline:true},
      {name:'📝 Důvod',value:e.reason||'—',inline:false}
    ],
    footer:{text:(ok?'Vzal na vědomí: ':'Zamítl: ')+who+' • '+nowStr()}
  };
  addLog('excuse',who+' '+(ok?'bere na vědomí':'zamítl')+' omluvenku od '+e.memberName+'.',{hook:'excuse_dec',private:true,embed:embed});
  toast('Omluvenka '+(decision==='accepted'?'vzata na vědomí':'zamítnuta'),'success');renderAdminExcuses();
}

// ── REPORTS ADMIN ────────────────────────────
function renderAdminReports(){
  var reports=DB.get('reports')||[];
  var el=document.getElementById('aReports');
  if(!reports.length){el.innerHTML='<div class="empty-s">// Žádná hlášení</div>';return;}
  el.innerHTML=reports.slice().reverse().map(function(r){
    return '<div class="rep-card"><div class="rep-from">// OD: '+esc(r.memberName)+' — '+r.date+'<button class="btn-micro del" style="float:right" onclick="delReport(\''+r.id+'\')">✕</button></div><div class="rep-body">'+esc(r.body)+'</div></div>';
  }).join('');
}

// ── RADIO ADMIN ──────────────────────────────
function radioCardsHtml(f,withVedeni){
  var rows=[
    {label:'PRIMÁRNÍ',val:f.primary,color:'var(--acc)'},
    {label:'SEKUNDÁRNÍ',val:f.secondary,color:'var(--acc)'},
    {label:'AKCE',val:f.action,color:'var(--green)'}
  ];
  if(withVedeni)rows.push({label:'VEDENÍ',val:f.vedeni,color:'var(--red)'});
  return '<div class="radio-grid">'+rows.map(function(r){
    return '<div class="radio-card"><div class="radio-label">'+r.label+'</div>'+
      '<div class="radio-freq" style="color:'+r.color+';">'+(r.val||'—')+'</div></div>';
  }).join('')+'</div>';
}
function renderAdminRadio(){
  var radios=DB.get('radios')||{primary:'',secondary:'',action:'',vedeni:''};
  var cfg=DB.get('radioauto')||{};
  document.getElementById('rPrimary').value=radios.primary||'';
  document.getElementById('rSecondary').value=radios.secondary||'';
  document.getElementById('rAction').value=radios.action||'';
  document.getElementById('rVedeni').value=radios.vedeni||'';
  var rb=document.getElementById('rRegenBtn');if(rb)rb.style.display=canRegenRadios()?'':'none';
  var a=document.getElementById('rAuto');if(a)a.checked=!!cfg.on;
  var cur=currentRadios();
  var rc=document.getElementById('rCurrent');
  if(rc)rc.innerHTML='<div class="fa-exp-title">// AKTUÁLNĚ PLATÍ '+(cfg.on?'(AUTOMATICKY — slot '+radioSlot().split('-')[3]+':00)':'(RUČNĚ NASTAVENO)')+'</div>'+radioCardsHtml(cur,true);
  var info=document.getElementById('rAutoInfo');
  if(info)info.textContent=cfg.on?'// AUTO je zapnuté — pole níže se nepoužívají, platí frekvence z přehledu nahoře.':'';
}
function saveRadios(){
  var radios={
    primary:document.getElementById('rPrimary').value.trim(),
    secondary:document.getElementById('rSecondary').value.trim(),
    action:document.getElementById('rAction').value.trim(),
    vedeni:document.getElementById('rVedeni').value.trim()
  };
  DB.set('radios',radios);
  var cfg=DB.get('radioauto')||{};
  if(!cfg.salt)cfg.salt=uid()+uid();
  var was=!!cfg.on;
  cfg.on=!!document.getElementById('rAuto').checked;
  if(cfg.on&&!was)cfg.lastSlot='';
  DB.set('radioauto',cfg);
  var mm=getMember();var who=mm?mm.displayName:'Admin';
  addLog('radio','Admin aktualizoval frekvence vysílaček'+(cfg.on?' (automatická změna 15:00 a 17:00 zapnuta).':'.'),{embed:
    cfg.on?{title:'📻 Automatická změna frekvencí zapnuta',description:'Frekvence se budou měnit každý den v **15:00** a **17:00**.\nNastavil: **'+who+'**',color:0xc49a14,footer:{text:'Vysílačka'},timestamp:new Date().toISOString()}
          :radioEmbed('📻 Frekvence upraveny','Nové frekvence nastavil **'+who+'**.',radios)});
  setText('radioSaveStatus','// ULOŽENO');setTimeout(function(){setText('radioSaveStatus','');},2000);
  toast('Frekvence uloženy','success');
  renderAdminRadio();
  if(cfg.on)radioTick();
}

// Discord embed pro změnu frekvencí (frekvence Vedení se do kanálu záměrně neposílají)
function radioEmbed(title,desc,f){
  return {
    title:title,description:desc,color:0xc49a14,
    fields:[
      {name:'🟡 Primární',value:'`'+f.primary+'`',inline:true},
      {name:'🔵 Sekundární',value:'`'+f.secondary+'`',inline:true},
      {name:'🟢 Akce',value:'`'+f.action+'`',inline:true}
    ],
    footer:{text:'Vysílačka'},timestamp:new Date().toISOString()
  };
}

// Vygeneruje a uloží nové frekvence (vrací objekt s frekvencemi)
function genNewRadios(){
  var cfg=DB.get('radioauto')||{};
  var f;
  if(cfg.on){
    // nová sůl = okamžitě nové frekvence; automatická změna v 15:00 a 17:00 běží dál
    cfg.salt=uid()+uid();cfg.lastSlot=radioSlot();
    DB.set('radioauto',cfg);
    f=autoRadios(cfg,cfg.lastSlot);
  }else{
    var used={},out=[];
    while(out.length<4){var n=((1000+Math.floor(Math.random()*8991))/10).toFixed(1).replace('.',',');if(!used[n]){used[n]=1;out.push(n);}}
    f={primary:out[0],secondary:out[1],action:out[2],vedeni:out[3]};
    DB.set('radios',f);
  }
  return f;
}
function regenRadios(){
  if(!canRegenRadios()){toast('Nové frekvence smí generovat jen Mastermind, Overseer, Counselor, Devil\'s Advocate, Advisor a Captain','error');return;}
  if(!confirm('Vygenerovat nové frekvence hned teď? Staré přestanou platit.'))return;
  var m=getMember();var who=m?m.displayName:'Admin';
  var f=genNewRadios();
  addLog('radio','Nové frekvence (vygeneroval '+who+') — Primární: '+f.primary+', Sekundární: '+f.secondary+', Akce: '+f.action+'.',
    {embed:radioEmbed('📻 Nové frekvence vysílaček','Vygeneroval: **'+who+'**\nStaré frekvence přestávají platit.',f)});
  toast('Nové frekvence vygenerovány','success');
  renderAdminRadio();
  var act=document.querySelector('#memberScreen.active .mt.active');
  if(act&&act.id==='mt-radio')renderMyRadio();
}

// ── AUTOMATICKÁ ZMĚNA FREKVENCÍ (15:00 a 17:00, kanály 100–999) ──
// Frekvence se počítají z časového slotu + tajné soli v DB, takže je všichni vidí stejně.
// Do Discordu je oznámí první přihlášený klient, který nový slot zaznamená.
function radioSlot(d){
  d=d||new Date();
  var h=d.getHours();var base=new Date(d.getFullYear(),d.getMonth(),d.getDate());var tag;
  if(h>=17)tag=17;else if(h>=15)tag=15;else{base.setDate(base.getDate()-1);tag=17;}
  return base.getFullYear()+'-'+(base.getMonth()+1)+'-'+base.getDate()+'-'+tag;
}
function hashStr(str){var h=1779033703^str.length;for(var i=0;i<str.length;i++){h=Math.imul(h^str.charCodeAt(i),3432918353);h=(h<<13)|(h>>>19);}return h>>>0;}
function rngFrom(seed){return function(){seed|=0;seed=seed+0x6D2B79F5|0;var t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
function autoRadios(cfg,slot){
  var r=rngFrom(hashStr((cfg.salt||'x')+'|'+slot));var used={},out=[];
  while(out.length<4){var n=((1000+Math.floor(r()*8991))/10).toFixed(1).replace('.',',');if(!used[n]){used[n]=1;out.push(n);}}
  return {primary:out[0],secondary:out[1],action:out[2],vedeni:out[3]};
}
function currentRadios(){
  var cfg=DB.get('radioauto')||{};
  if(cfg.on)return autoRadios(cfg,radioSlot());
  return DB.get('radios')||{primary:'',secondary:'',action:'',vedeni:''};
}
var radioBusy=false;
async function radioTick(){
  if(!currentMemberId||!sb)return;
  var act=document.querySelector('#memberScreen.active .mt.active');
  if(act&&act.id==='mt-radio')renderMyRadio();
  var cfg=DB.get('radioauto')||{};
  if(!cfg.on||radioBusy)return;
  var slot=radioSlot();
  if(cfg.lastSlot===slot)return;
  radioBusy=true;
  try{
    var r=await sb.from(TABLE).select('value').eq('key','radioauto').maybeSingle();
    var fresh=(r.data&&r.data.value)||cfg;
    if(fresh.lastSlot===slot){DB.cache.radioauto=fresh;}
    else{
      fresh.lastSlot=slot;DB.set('radioauto',fresh);
      var f=autoRadios(fresh,slot);
      var sp=slot.split('-');var hh=sp[3];
      var start=new Date(+sp[0],+sp[1]-1,+sp[2],+hh,0,0);
      var lateMin=Math.round((Date.now()-start.getTime())/60000);
      var nowHM=new Date().toTimeString().slice(0,5);
      var note=lateMin>5?' (oznámeno až v **'+nowHM+'**, nikdo nebyl online)':'';
      addLog('radio','Automatická změna frekvencí ('+hh+':00'+(lateMin>5?', oznámeno v '+nowHM:'')+') — Primární: '+f.primary+', Sekundární: '+f.secondary+', Akce: '+f.action+'.',
        {embed:radioEmbed('📻 Automatická změna frekvencí','Platí od **'+hh+':00**'+note+' — předchozí frekvence už nefungují.',f)});
    }
  }catch(e){console.error(e);}
  radioBusy=false;
}

// ── SETTINGS ─────────────────────────────────
function renderSettings(){
  var s=DB.get('settings')||{webhook:'',webhookName:'Frakce LOG'};
  var fs=DB.get('finsettings')||{weeklyFee:5000,feeDay:0};
  document.getElementById('discordWebhook').value=s.webhook||'';
  document.getElementById('discordName').value=s.webhookName||'Frakce LOG';
  document.getElementById('memberRoleId').value=s.memberRoleId||'';
  document.getElementById('weeklyFee').value=fs.weeklyFee||5000;
  document.getElementById('feeDay').value=fs.feeDay||0;
  renderSectionHooks();
  renderPanicList();
}
function saveWebhook(){
  var s=DB.get('settings')||{};
  s.webhook=document.getElementById('discordWebhook').value.trim();
  s.webhookName=document.getElementById('discordName').value.trim()||'Frakce LOG';
  s.memberRoleId=(document.getElementById('memberRoleId').value||'').replace(/\D/g,'');
  DB.set('settings',s);setText('webhookStatus','// ULOŽENO');setTimeout(function(){setText('webhookStatus','');},2000);toast('Webhook uložen','success');
}
function testWebhook(){
  var s=DB.get('settings')||{};
  if(!s.webhook){toast('Zadejte webhook URL','error');return;}
  fetch(s.webhook,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:s.webhookName||'Frakce LOG',content:'✅ Test z Frakce LOG portálu — '+nowStr()})})
    .then(function(){toast('Test odeslán','success');}).catch(function(){toast('Chyba odesílání','error');});
}

// ── DISCORD PO SEKCÍCH ───────────────────────
function renderSectionHooks(){
  var s=DB.get('settings')||{};var secs=s.sections||{};
  var el=document.getElementById('sectionHooks');if(!el)return;
  el.innerHTML=SECTIONS.map(function(x){
    var c=secs[x.key]||{};
    return '<div class="sec-hook-row">'+
      '<label class="sec-hook-on"><input type="checkbox" id="sh-on-'+x.key+'"'+(c.on===false?'':' checked')+'/><span>'+esc(x.label)+'</span></label>'+
      '<div class="iw"><span class="ip">&gt;_</span><input type="text" id="sh-url-'+x.key+'" value="'+esc(c.url||'')+'" placeholder="Prázdné = hlavní webhook"/></div>'+
      '<div class="iw"><span class="ip">@</span><input type="text" id="sh-ping-'+x.key+'" value="'+esc(c.ping||'')+'" placeholder="Ping: ID role"/></div>'+
      '<button class="btn-ghost small" onclick="testSectionHook(\''+x.key+'\')">TEST</button>'+
    '</div>';
  }).join('');
  var cp=document.getElementById('catPings');
  if(cp)cp.innerHTML=CAT_PINGS.map(function(x){
    var c=secs['cat_'+x.key]||{};
    return '<div class="sec-hook-row cat">'+
      '<label class="sec-hook-on"><input type="checkbox" id="sh-on-cat_'+x.key+'"'+(c.on===false?'':' checked')+'/><span>'+esc(x.label)+'</span></label>'+
      '<div class="iw"><span class="ip">&gt;_</span><input type="text" id="sh-url-cat_'+x.key+'" value="'+esc(c.url||'')+'" placeholder="Webhook kategorie (prázdné = webhook Skladu)"/></div>'+
      '<div class="iw"><span class="ip">@</span><input type="text" id="sh-ping-cat_'+x.key+'" value="'+esc(c.ping||'')+'" placeholder="Ping: ID role"/></div>'+
      '<button class="btn-ghost small" onclick="testSectionHook(\'cat_'+x.key+'\')">TEST</button></div>';
  }).join('');
}
function saveSectionHooks(){
  var s=DB.get('settings')||{};s.sections={};
  SECTIONS.forEach(function(x){
    s.sections[x.key]={url:document.getElementById('sh-url-'+x.key).value.trim(),on:document.getElementById('sh-on-'+x.key).checked,ping:document.getElementById('sh-ping-'+x.key).value.trim()};
  });
  CAT_PINGS.forEach(function(x){
    s.sections['cat_'+x.key]={url:document.getElementById('sh-url-cat_'+x.key).value.trim(),on:document.getElementById('sh-on-cat_'+x.key).checked,ping:document.getElementById('sh-ping-cat_'+x.key).value.trim()};
  });
  DB.set('settings',s);
  addLog('sys','Admin upravil Discord nastavení sekcí.',{noPing:true});
  setText('sectionHooksStatus','// ULOŽENO');setTimeout(function(){setText('sectionHooksStatus','');},2000);
  toast('Discord sekce uloženy','success');
}
function testSectionHook(key){
  var s=DB.get('settings')||{};
  var url=document.getElementById('sh-url-'+key).value.trim()||s.webhook;
  if(!url){toast('Chybí webhook URL','error');return;}
  fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:s.webhookName||'Frakce LOG',content:'✅ Test sekce "'+sectionLabel(key)+'" — '+nowStr()})})
    .then(function(){toast('Test odeslán','success');}).catch(function(){toast('Chyba odesílání','error');});
}

function saveFinanceSettings(){
  var fs={weeklyFee:parseInt(document.getElementById('weeklyFee').value)||0,feeDay:parseInt(document.getElementById('feeDay').value)||0};
  DB.set('finsettings',fs);setText('feeStatus','// ULOŽENO');setTimeout(function(){setText('feeStatus','');},2000);toast('Nastavení uloženo','success');
}
function renderPanicList(){
  var pList=DB.get('panicList')||[];var members=DB.get('members')||[];
  var el=document.getElementById('panicList');if(!el)return;
  if(!pList.length){el.innerHTML='<div class="empty-s">// Žádní blokovaní členové</div>';return;}
  el.innerHTML=pList.map(function(id){
    var m=members.find(function(x){return x.id===id;});
    return '<div style="display:flex;align-items:center;justify-content:space-between;padding:.5rem .8rem;background:var(--card);border-left:3px solid var(--red);margin-bottom:1px;">'+
      '<span style="font-family:Rajdhani,sans-serif;color:var(--textb);">'+(m?m.displayName:id)+' <span style="font-family:\'Share Tech Mono\',monospace;font-size:.6rem;color:var(--red);">PANIC LOCK</span></span>'+
      '<button class="btn-acc small" onclick="liftPanic(\''+id+'\')">ODEMKNOUT</button></div>';
  }).join('');
}

// ── MEMBERS GRID (ADMIN) ─────────────────────
function renderMemberGrid(){
  var members=DB.get('members')||[];
  var el=document.getElementById('memberGrid');if(!el)return;
  if(!members.length){el.innerHTML='<div class="empty-s">// Žádní členové</div>';return;}
  el.innerHTML=members.map(function(m){
    var vedeni=isVedeni(m.position);var me0=getMember();var locked=m.position==='Mastermind'&&!(me0&&me0.position==='Mastermind');
    return '<div class="member-card '+(m.panic?'panic-card':'')+'">'+
      '<div class="mc-top">'+
        '<div class="mc-hex">'+esc(m.displayName.charAt(0).toUpperCase())+'</div>'+
        '<div class="mc-info">'+
          '<div class="mc-name">'+esc(m.displayName)+'</div>'+
          '<div class="mc-pos '+(vedeni?'vedeni':'other')+'">'+esc(m.position)+'</div>'+
          '<div class="mc-id" style="font-family:\'Share Tech Mono\',monospace;font-size:.6rem;color:var(--muted);">'+esc(m.email||('ID: '+m.id))+'</div>'+
        '</div>'+
        '<div class="mc-badges">'+
          (m.adminAccess?'<span class="badge-admin">ADMIN</span>':'')+
          (m.panic?'<span class="badge-panic">PANIC</span>':'')+
        '</div>'+
      '</div>'+
      '<div class="mc-meta">'+
        (m.note?'<div class="mc-note">'+esc(m.note)+'</div>':'')+
        (m.position==='Mastermind'?'<div class="mc-note">🔒 Chráněný účet — Mastermind nelze odebrat</div>':'')+
        (locked?'<div style="display:none">':'<div style="display:flex;gap:.4rem;flex-wrap:wrap;margin-top:.4rem;">')+
          '<div style="display:flex;gap:.4rem;width:100%;margin-bottom:.2rem;"><input type="text" class="mc-pos-sel" style="flex:1;min-width:0;" id="nm2-'+m.id+'" value="'+esc(m.displayName)+'" placeholder="IC jméno"/><button class="btn-acc small" onclick="changeName(\''+m.id+'\')">JMÉNO</button></div>'+
          '<div style="display:flex;gap:.4rem;width:100%;margin-bottom:.2rem;"><input type="text" class="mc-pos-sel" style="flex:1;min-width:0;" id="did-'+m.id+'" value="'+esc(m.discordId||'')+'" placeholder="Discord ID"/><button class="btn-acc small" onclick="changeDiscordId(\''+m.id+'\')">DISCORD</button></div>'+
          '<div style="display:flex;gap:.4rem;width:100%;margin-bottom:.2rem;flex-wrap:wrap;"><input type="text" class="mc-pos-sel" style="flex:1;min-width:70px;" id="fn-'+m.id+'" value="'+esc(rosterNames(m).first)+'" placeholder="Jméno"/><input type="text" class="mc-pos-sel" style="flex:1;min-width:70px;" id="ln-'+m.id+'" value="'+esc(rosterNames(m).last)+'" placeholder="Příjmení"/><input type="text" class="mc-pos-sel" style="flex:1;min-width:70px;" id="nk-'+m.id+'" value="'+esc(m.nick||'')+'" placeholder="Přezdívka"/><button class="btn-acc small" onclick="changeRosterInfo(\''+m.id+'\')">ÚDAJE</button></div>'+
          '<select class="mc-pos-sel" id="pos-'+m.id+'">'+POSITIONS.map(function(p){return '<option value="'+p+'"'+(m.position===p?' selected':'')+'>'+p+'</option>';}).join('')+'</select>'+
          '<button class="btn-acc small" onclick="changePosition(\''+m.id+'\')">POZICE</button>'+
          (ADMIN_POS.indexOf(m.position)!==-1?'':'<button class="btn-acc small" onclick="toggleAdminAccess(\''+m.id+'\')">'+(!m.adminAccess?'DÁT ADMIN':'ODEBRAT ADMIN')+'</button>')+
          (m.panic?'<button class="btn-acc small" onclick="liftPanic(\''+m.id+'\')">ODEMKNOUT</button>':'')+
          (m.position==='Mastermind'?'':'<button class="btn-danger small" onclick="deleteMember(\''+m.id+'\')">✕ SMAZAT</button>')+
        '</div>'+
      '</div>'+
    '</div>';
  }).join('');
}
function toggleNewMember(){
  document.getElementById('newMemberPanel').classList.toggle('hidden');
  document.getElementById('pwChangePanel').classList.add('hidden');
}
function togglePwPanel(){
  var panel=document.getElementById('pwChangePanel');
  panel.classList.toggle('hidden');
  document.getElementById('newMemberPanel').classList.add('hidden');
  if(!panel.classList.contains('hidden')) populatePwMember();
}
function populatePwMember(){
  var members=DB.get('members')||[];
  var sel=document.getElementById('pw-member');if(!sel)return;
  sel.innerHTML=members.map(function(m){
    return '<option value="'+m.id+'">'+esc(m.displayName)+' ('+esc(m.id)+')</option>';
  }).join('');
}
async function changePassword(){
  var memberId=document.getElementById('pw-member').value;
  var newPass=document.getElementById('pw-new').value;
  var conf=document.getElementById('pw-confirm').value;
  var st=document.getElementById('pwStatus');
  if(!newPass||newPass.length<6){st.textContent='// HESLO MUSÍ MÍT ALESPOŇ 6 ZNAKŮ';st.style.color='#e05555';return;}
  if(newPass!==conf){st.textContent='// HESLA SE NESHODUJÍ';st.style.color='#e05555';return;}
  var members=DB.get('members')||[];
  var m=members.find(function(x){return x.id===memberId;});
  if(!m){st.textContent='// ČLEN NENALEZEN';st.style.color='#e05555';return;}
  if(!canManage(m)){st.textContent='// HESLO MASTERMINDA MŮŽE MĚNIT JEN MASTERMIND';st.style.color='#e05555';return;}
  if(!m.authId){st.textContent='// ČLEN NEMÁ PROPOJENÝ ÚČET';st.style.color='#e05555';return;}
  st.style.color='var(--acc)';st.textContent='// UKLÁDÁM...';
  try{await adminApi({action:'setPassword',authId:m.authId,password:newPass});}
  catch(e){st.style.color='#e05555';st.textContent='// CHYBA: '+e.message;return;}
  addLog('member','Admin změnil heslo člena "'+m.displayName+'".');
  document.getElementById('pw-new').value='';
  document.getElementById('pw-confirm').value='';
  st.textContent='// HESLO ZMĚNĚNO PRO: '+m.displayName;
  setTimeout(function(){st.textContent='';},3000);
  toast('Heslo změněno ✓','success');
}
async function createMember(){
  var email=document.getElementById('nm-email').value.trim().toLowerCase();
  var name=document.getElementById('nm-name').value.trim();
  var pass=document.getElementById('nm-pass').value;
  var pos=document.getElementById('nm-pos').value;
  var admin=document.getElementById('nm-admin').checked;
  var note=document.getElementById('nm-note').value.trim();
  var discordId=(document.getElementById('nm-discord').value||'').replace(/\D/g,'');
  var firstName=document.getElementById('nm-first').value.trim();
  var lastName=document.getElementById('nm-last').value.trim();
  var nick=document.getElementById('nm-nick').value.trim();
  var st=document.getElementById('createStatus');
  if(!email||!name||!pass){st.textContent='// VYPLŇTE POVINNÁ POLE';return;}
  if(email.indexOf('@')<1){st.textContent='// NEPLATNÝ E-MAIL';return;}
  if(pass.length<6){st.textContent='// HESLO MIN. 6 ZNAKŮ';return;}
  var members=DB.get('members')||[];
  var me1=getMember();
  if(pos==='Mastermind'&&!(me1&&me1.position==='Mastermind')){st.textContent='// POZICI MASTERMIND MŮŽE PŘIDĚLIT JEN MASTERMIND';return;}
  if(members.find(function(m){return (m.email||'').toLowerCase()===email;})){st.textContent='// E-MAIL JIŽ EXISTUJE';return;}
  st.textContent='// VYTVÁŘÍM ÚČET...';
  var res;
  try{res=await adminApi({action:'create',email:email,password:pass});}
  catch(e){st.textContent='// CHYBA: '+e.message;return;}
  members=DB.get('members')||[];
  members.push({id:uid(),authId:res.authId,email:email,displayName:name,position:pos,adminAccess:admin||ADMIN_POS.indexOf(pos)!==-1,note:note,discordId:discordId,firstName:firstName,lastName:lastName,nick:nick,strikes:0,panic:false});
  DB.set('members',members);
  addLog('member','Admin registroval nového člena: "'+name+'" ('+pos+').');
  st.textContent='// ČLEN REGISTROVÁN';
  setTimeout(function(){st.textContent='';},3000);
  ['nm-email','nm-name','nm-pass','nm-note','nm-discord','nm-first','nm-last','nm-nick'].forEach(function(i){document.getElementById(i).value='';});
  document.getElementById('nm-admin').checked=false;
  toast(name+' registrován','success');renderMemberGrid();populatePwMember();
}
function changeDiscordId(id){
  var members=DB.get('members')||[];var m=members.find(function(x){return x.id===id;});if(!m)return;
  if(!canManage(m)){toast('Mastermind může spravovat jen Mastermind','error');return;}
  var el=document.getElementById('did-'+id);
  var v=(el?el.value:'').replace(/\D/g,'');
  m.discordId=v;DB.set('members',members);
  addLog('member','Admin nastavil Discord ID člena "'+m.displayName+'".',{noDiscord:true});
  toast('Discord ID uloženo','success');renderMemberGrid();
}
function changeName(id){
  var members=DB.get('members')||[];var m=members.find(function(x){return x.id===id;});if(!m)return;
  var el=document.getElementById('nm2-'+id);var name=el?el.value.trim():'';
  if(!name){toast('Zadejte IC jméno','error');return;}
  if(!canManage(m)){toast('Mastermind může spravovat jen Mastermind','error');return;}
  var old=m.displayName;m.displayName=name;DB.set('members',members);
  addLog('member','Admin změnil jméno "'+old+'" na "'+name+'".');
  toast('Jméno změněno','success');renderMemberGrid();populatePwMember();
}
function changePosition(id){
  var members=DB.get('members')||[];var m=members.find(function(x){return x.id===id;});if(!m)return;
  var sel=document.getElementById('pos-'+id);if(!sel)return;
  var me=getMember();
  if(m.position==='Mastermind'){toast('Roli Mastermind nelze měnit','error');return;}
  if(!canManage(m)){toast('Mastermind může spravovat jen Mastermind','error');return;}
  if(sel.value==='Mastermind'&&!(me&&me.position==='Mastermind')){toast('Pozici Mastermind může přidělit jen Mastermind','error');return;}
  if(m.position==='Mastermind'&&sel.value!=='Mastermind'&&!members.some(function(x){return x.id!==m.id&&x.position==='Mastermind';})){toast('Musí zůstat alespoň jeden Mastermind','error');return;}
  var oldPos0=m.position;m.position=sel.value;syncAdminForPos(m,oldPos0);DB.set('members',members);
  addLog('member','Admin změnil pozici "'+m.displayName+'" na "'+m.position+'".');
  toast('Pozice aktualizována','success');renderMemberGrid();
}
function toggleAdminAccess(id){
  var members=DB.get('members')||[];var m=members.find(function(x){return x.id===id;});if(!m)return;
  if(!canManage(m)){toast('Mastermind může spravovat jen Mastermind','error');return;}
  if(ADMIN_POS.indexOf(m.position)!==-1){toast('Mastermind, Overseer a Counselor mají admin napevno','error');return;}
  m.adminAccess=!m.adminAccess;DB.set('members',members);
  addLog('member','Admin '+(m.adminAccess?'přidělil':'odebral')+' admin přístup "'+m.displayName+'".');
  toast('Admin přístup '+(m.adminAccess?'přidělen':'odebrán'),'info');renderMemberGrid();
}
async function deleteMember(id){
  var members=DB.get('members')||[];var m=members.find(function(x){return x.id===id;});
  if(!m)return;
  if(id===currentMemberId){toast('Nemůžeš smazat sám sebe','error');return;}
  if(m.position==='Mastermind'){toast('Mastermind nelze smazat','error');return;}
  if(!confirm('Smazat člena "'+m.displayName+'"? Smaže se i jeho přihlašovací účet.'))return;
  if(m.authId){
    try{await adminApi({action:'delete',authId:m.authId});}
    catch(e){toast('Chyba mazání účtu: '+e.message,'error',5000);return;}
  }
  DB.set('members',(DB.get('members')||[]).filter(function(x){return x.id!==id;}));
  toast('Člen smazán','info');renderMemberGrid();populatePwMember();
}
function liftPanic(id){
  var members=DB.get('members')||[];var m=members.find(function(x){return x.id===id;});
  if(!m)return;m.panic=false;DB.set('members',members);
  var pList=(DB.get('panicList')||[]).filter(function(x){return x!==id;});DB.set('panicList',pList);
  addLog('panic','Admin odemkl PANIC pro "'+m.displayName+'".');
  toast(m.displayName+' odemknut','success');renderMemberGrid();renderPanicList();
}

// ── BOARD ADMIN ───────────────────────────────
function renderAdminBoard(){
  renderDash();
  var posts=DB.get('board')||[];
  var confirmed=DB.get('boardConfirmed')||{};
  var el=document.getElementById('adminBoardList');if(!el)return;
  if(!posts.length){el.innerHTML='<div class="empty-s">// Nástěnka je prázdná</div>';return;}
  el.innerHTML=posts.slice().reverse().map(function(p){
    var confCount=(confirmed[p.id]||[]).length;
    return '<div class="board-post '+p.type+'">'+
      '<div class="bp-header"><div class="bp-title">'+esc(p.title)+'</div>'+
      '<div style="display:flex;gap:.5rem;align-items:center;">'+
        '<span class="bp-type '+p.type+'">'+{info:'INFO',warning:'VAROVÁNÍ',urgent:'URGENTNÍ',confirm:'POTVRDIT'}[p.type]+'</span>'+
        (p.type==='confirm'?'<span style="font-size:.65rem;color:var(--muted)">✓ '+confCount+'</span>':'')+
        '<button class="btn-micro del" onclick="delPost(\''+p.id+'\')">✕</button>'+
      '</div></div>'+
      '<div class="bp-body">'+esc(mentionView(p.body))+'</div>'+
      '<div class="bp-footer"><span class="bp-date">'+p.date+' — '+esc(p.author)+'</span></div>'+
    '</div>';
  }).join('');
}
// ── VÝBĚR LIDÍ K OZNAČENÍ (nástěnka, úkoly, zprávy, hlášení) ──
var PICKERS=['pick-board','pick-task','pick-msg','pick-rep'];
function renderPickers(){
  var ms=(DB.get('members')||[]).slice().sort(function(a,b){return String(a.displayName).localeCompare(String(b.displayName),'cs');});
  PICKERS.forEach(function(id){
    var el=document.getElementById(id);if(!el)return;
    el.innerHTML='<details class="pick-det"><summary>👥 Vybrat lidi k označení <span class="pick-count" id="'+id+'-n">(0)</span></summary>'+
      '<div class="pick-tools"><button type="button" class="btn-micro" onclick="pickAll(\''+id+'\',true)">VŠICHNI</button><button type="button" class="btn-micro" onclick="pickAll(\''+id+'\',false)">ŽÁDNÝ</button></div>'+
      '<div class="pick-list">'+(ms.length?ms.map(function(m){
        return m.discordId
          ?'<label class="pick-item"><input type="checkbox" value="'+esc(m.discordId)+'" onchange="pickUpdate(\''+id+'\')"/><span>'+esc(m.displayName)+'</span></label>'
          :'<label class="pick-item off" title="Člen nemá vyplněné Discord ID"><input type="checkbox" disabled/><span>'+esc(m.displayName)+' <em>(chybí Discord ID)</em></span></label>';
      }).join(''):'<span class="pick-item off">Žádní členové</span>')+'</div></details>';
  });
}
function pickUpdate(id){
  var el=document.getElementById(id);if(!el)return;
  setText(id+'-n','('+el.querySelectorAll('input[type=checkbox]:checked').length+')');
}
function pickAll(id,on){
  var el=document.getElementById(id);if(!el)return;
  el.querySelectorAll('input[type=checkbox]:not(:disabled)').forEach(function(c){c.checked=on;});
  pickUpdate(id);
}
// vrátí '<@id> <@id>' pro vybrané lidi a výběr vymaže
function pickPing(id){
  var el=document.getElementById(id);if(!el)return '';
  var out=[];
  el.querySelectorAll('input[type=checkbox]:checked').forEach(function(c){
    if(c.value)out.push('<@'+c.value+'>');c.checked=false;
  });
  pickUpdate(id);
  return out.join(' ');
}
function joinPings(){
  return Array.prototype.slice.call(arguments).filter(function(x){return x;}).join(' ');
}
// Zaškrtnutá volba „Označit Member“ -> ping role Member (ID v Nastavení). Po použití se odškrtne.
function pingBox(id){
  var b=document.getElementById(id);
  if(!b||!b.checked)return '';
  b.checked=false;
  var s=DB.get('settings')||{};
  if(!s.memberRoleId){toast('V Nastavení chybí ID role Member','error',4000);return '';}
  return '<@&'+s.memberRoleId+'>';
}
// @jméno člena -> <@DiscordID> (jen členové s vyplněným Discord ID)
function resolveMentions(t){
  t=String(t||'');
  var ms=(DB.get('members')||[]).filter(function(m){return m.discordId&&m.displayName;})
    .sort(function(a,b){return b.displayName.length-a.displayName.length;});
  ms.forEach(function(m){
    var re=new RegExp('@'+m.displayName.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?![\\w\u00C0-\u017F])','gi');
    t=t.replace(re,'<@'+m.discordId+'>');
  });
  return t;
}
// <@ID> -> @jméno (zobrazení na webu)
function mentionView(t){
  var ms=DB.get('members')||[];
  return String(t||'').replace(/<@!?(\d{5,})>/g,function(x,id){
    var m=ms.find(function(y){return y.discordId===id;});return m?'@'+m.displayName:x;
  });
}
function postBoard(){
  var title=document.getElementById('boardTitle').value.trim();
  var body=document.getElementById('boardBody').value.trim();
  var type=document.getElementById('boardType').value;
  var st=document.getElementById('boardStatus');
  if(!title||!body){st.textContent='// VYPLŇTE POLE';return;}
  var posts=DB.get('board')||[];
  var author=getMember()?getMember().displayName:'Admin';
  posts.push({id:uid(),title:title,body:body,type:type,date:nowStr(),author:author});
  DB.set('board',posts);
  var bt={info:['ℹ️ INFO',C_BLUE],warning:['⚠️ VAROVÁNÍ',C_ORANGE],urgent:['🚨 URGENTNÍ',C_RED],confirm:['✅ POTVRĎTE PŘEČTENÍ',C_PURPLE]}[type]||['',C_BLUE];
  // Discord: @jméno / <@ID> v textu pingne hráče, checkbox pingne roli Member (ID v Nastavení)
  var dTitle=resolveMentions(title),dBody=resolveMentions(body);
  var mentions=[];var rx=/<@!?(\d{5,})>/g,mm;
  while((mm=rx.exec(dTitle+' '+dBody))){var tag='<@'+mm[1]+'>';if(mentions.indexOf(tag)===-1)mentions.push(tag);}
  var cfgS=DB.get('settings')||{};
  var pingBox=document.getElementById('boardPingMember');
  if(pingBox&&pingBox.checked){
    if(cfgS.memberRoleId)mentions.push('<@&'+cfgS.memberRoleId+'>');
    else toast('V Nastavení chybí ID role Member','error',4000);
  }
  pickPing('pick-board').split(' ').forEach(function(t){if(t&&mentions.indexOf(t)===-1)mentions.push(t);});
  addLog('board','Admin přidal příspěvek na nástěnku: "'+title+'".',{extraPing:mentions.join(' '),embed:rich(bt[1],'📌 NOVÝ PŘÍSPĚVEK NA NÁSTĚNCE','**'+dTitle+'**\n'+dBody,[['Typ',bt[0]],['Autor',author]],{by:author})});
  document.getElementById('boardTitle').value='';document.getElementById('boardBody').value='';
  if(pingBox)pingBox.checked=false;
  st.textContent='// ZVEŘEJNĚNO';setTimeout(function(){st.textContent='';},2000);
  toast('Příspěvek zveřejněn','success');renderAdminBoard();renderBoard();
}
function delPost(id){
  if(!confirm('Smazat příspěvek?'))return;
  DB.set('board',(DB.get('board')||[]).filter(function(p){return p.id!==id;}));
  var conf=DB.get('boardConfirmed')||{};delete conf[id];DB.set('boardConfirmed',conf);
  toast('Příspěvek smazán','info');renderAdminBoard();renderBoard();
}

// ── TASKS & MESSAGES (populate selects) ──────
function populateTaskTarget(){
  var members=DB.get('members')||[];var sel=document.getElementById('taskTarget');if(!sel)return;
  sel.innerHTML=members.map(function(m){return '<option value="'+m.id+'">'+esc(m.displayName)+'</option>';}).join('');
}
function populateMsgTarget(){
  var members=DB.get('members')||[];var sel=document.getElementById('msgTarget');if(!sel)return;
  sel.innerHTML=['<option value="all">— VŠICHNI ČLENOVÉ —</option>'].concat(members.map(function(m){return '<option value="'+m.id+'">'+esc(m.displayName)+'</option>';})).join('');
}
function assignTask(){
  var target=document.getElementById('taskTarget').value;
  var title=document.getElementById('taskTitle').value.trim();
  var desc=document.getElementById('taskDesc').value.trim();
  var prio=document.getElementById('taskPrio').value;
  var st=document.getElementById('taskStatus');
  if(!title){st.textContent='// ZADEJTE NÁZEV';return;}
  var tasks=DB.get('tasks')||{};
  if(!tasks[target])tasks[target]=[];
  tasks[target].push({id:uid(),title:title,desc:desc,priority:prio,date:nowStr(),done:false});
  DB.set('tasks',tasks);
  var m=DB.get('members')||[];var tm=m.find(function(x){return x.id===target;});
  var pr={low:['LOW',C_GREY],normal:['NORMAL',C_GREEN],high:['HIGH',C_ORANGE],urgent:['URGENT',C_RED]}[prio]||['NORMAL',C_GREEN];
  addLog('task','Admin přiřadil úkol "'+title+'" členovi "'+(tm?tm.displayName:target)+'".',{extraPing:joinPings(pingBox('ping-task'),pickPing('pick-task')),embed:rich(pr[1],'✅ NOVÝ ÚKOL','**'+title+'**',[['👤 Člen',tm?tm.displayName:target],['⚡ Priorita',pr[0]]],{by:(getMember()?getMember().displayName:'Admin')})});
  document.getElementById('taskTitle').value='';document.getElementById('taskDesc').value='';
  st.textContent='// ROZKAZ ODESLÁN';setTimeout(function(){st.textContent='';},2000);
  toast('Úkol přiřazen','success');renderAdminTasks();
}
function sendMsg(){
  var target=document.getElementById('msgTarget').value;
  var subject=document.getElementById('msgSubject').value.trim();
  var body=document.getElementById('msgBody').value.trim();
  var st=document.getElementById('msgStatus');
  if(!subject||!body){st.textContent='// VYPLŇTE POLE';return;}
  var msgs=DB.get('messages')||{};
  var members=DB.get('members')||[];
  var mid=uid();var targets=target==='all'?members.map(function(m){return m.id;}):[target];
  targets.forEach(function(tid){if(!msgs[tid])msgs[tid]=[];msgs[tid].push({id:mid,subject:subject,body:body,date:nowStr()});});
  DB.set('messages',msgs);
  addLog('msg','Admin odeslal zprávu "'+subject+'" — '+(target==='all'?'všem':'jednomu členovi')+'.'+(target==='all'?'\n'+body:''),{noPing:target!=='all',extraPing:joinPings(pingBox('ping-msg'),pickPing('pick-msg')),embed:rich(C_TEAL,'💬 NOVÁ ZPRÁVA','**'+subject+'**'+(target==='all'?'\n'+body:''),[['Komu',target==='all'?'Všichni členové':'Jeden člen']],{by:(getMember()?getMember().displayName:'Admin')})});
  document.getElementById('msgSubject').value='';document.getElementById('msgBody').value='';
  st.textContent='// ZPRÁVA ODESLÁNA';setTimeout(function(){st.textContent='';},2000);
  toast('Zpráva odeslána','success');renderAdminMessages();
}

// ── WAREHOUSE ADMIN ───────────────────────────
var aWhCat='all';
function aWhFilter(cat,btn){
  aWhCat=cat;document.querySelectorAll('#at-warehouse .wf').forEach(function(b){b.classList.remove('active');});btn.classList.add('active');renderAdminWarehouse();
}
function renderAdminWarehouse(){
  var items=DB.get('warehouse')||[];
  var filtered=whView(items,aWhCat,aWhQ,aWhSort);
  var el=document.getElementById('aWhGrid');if(!el)return;
  if(!filtered.length){el.innerHTML='<div class="empty-s" style="grid-column:1/-1">// Žádné položky</div>';return;}
  el.innerHTML=filtered.map(function(item){
    var qc=item.qty===0?'empty':(item.min>0&&item.qty<=item.min?'low':'');
    var imgH=item.img?'<div class="wh-img"><img src="'+esc(imgSrc(item.img))+'" onerror="this.parentElement.innerHTML=\'<span class=wh-icon>?</span>\'"/></div>':'<div class="wh-img"><span class="wh-icon">?</span></div>';
    return '<div class="wh-item'+(item.qty===0?' wh-empty':(item.min>0&&item.qty<=item.min?' wh-low':''))+'">'+imgH+
      '<div class="wh-cat">'+(CAT[item.cat]||item.cat)+'</div>'+
      '<div class="wh-name">'+esc(item.name)+'</div>'+
      (item.note?'<div class="wh-note-text">'+esc(item.note)+'</div>':'')+
      '<div class="wh-qty-row"><span class="wh-qty '+qc+'">'+item.qty+'</span><span class="wh-unit"> KS</span></div>'+
            (item.min>0&&item.qty>0&&item.qty<=item.min?'<div class="wh-alert">NÍZKÁ ZÁSOBA</div>':'')+
      '<div style="display:flex;gap:.4rem;margin-top:.5rem;flex-wrap:wrap;">'+
        '<input class="wh-ev-input small" type="number" value="1" min="1" id="aqty-'+item.id+'"/>'+
        '<button class="btn-pickup" onclick="adminAddQty(\''+item.id+'\')">+ PŘIDAT</button>'+
        '<button class="btn-pickup" onclick="adminSubQty(\''+item.id+'\')" style="background:rgba(220,60,60,.15);border-color:var(--red)">− UBRAT</button>'+
        '<button class="btn-micro" title="Limit nízké zásoby" onclick="setItemMin(\''+item.id+'\')">🔔</button>'+
        '<button class="btn-micro" title="Změnit foto" onclick="changeItemImg(\''+item.id+'\')">🖼</button>'+
        '<button class="btn-micro del" onclick="deleteItem(\''+item.id+'\')">✕</button>'+
      '</div></div>';
  }).join('');
}
function toggleAddItem(){document.getElementById('addItemPanel').classList.toggle('hidden');}
function previewImg(val){
  var el=document.getElementById('wi-preview');if(!el)return;
  var src=imgSrc(val);
  el.innerHTML=src?'<img src="'+esc(src)+'" style="max-height:60px;max-width:100%;object-fit:contain;" onerror="this.parentElement.innerHTML=\'nenalezeno\'"/>':'—';
}
function changeItemImg(id){
  var items=DB.get('warehouse')||[];var item=items.find(function(i){return i.id===id;});if(!item)return;
  var v=prompt('URL fotky z Fivemanage (nebo název souboru v images/):',item.img||'');
  if(v===null)return;
  item.img=v.trim();DB.set('warehouse',items);
  addLog('wh',rosterWho()+' změnil foto: '+item.name,{img:item.img,pingCat:item.cat,plain:true,icon:'🖼'});
  toast('Foto změněno','success');renderAdminWarehouse();renderMemberWarehouse();
}
function addItem(){
  var name=document.getElementById('wi-name').value.trim();
  var cat=document.getElementById('wi-cat').value;
  var qty=parseInt(document.getElementById('wi-qty').value)||0;
  var min=parseInt(document.getElementById('wi-min').value)||0;
  var img=document.getElementById('wi-img').value.trim();
  var note=document.getElementById('wi-note').value.trim();
  var st=document.getElementById('addItemStatus');
  if(!name){st.textContent='// ZADEJTE NÁZEV';return;}
  var items=DB.get('warehouse')||[];
  items.push({id:uid(),name:name,cat:cat,qty:qty,min:min,img:img,note:note});
  DB.set('warehouse',items);
  addLog('wh',rosterWho()+' přidal novou položku: '+name+' ('+qty+' ks)',{img:img,pingCat:cat,plain:true,icon:'🆕',extraPing:pingBox('ping-additem')});
  ['wi-name','wi-img','wi-note'].forEach(function(i){document.getElementById(i).value='';});
  document.getElementById('wi-qty').value='1';document.getElementById('wi-min').value='0';
  document.getElementById('wi-preview').innerHTML='—';
  st.textContent='// PŘIDÁNO';setTimeout(function(){st.textContent='';},2000);
  toast(name+' přidán','success');renderAdminWarehouse();renderMemberWarehouse();
}
function adminAddQty(id){
  var items=DB.get('warehouse')||[];var item=items.find(function(i){return i.id===id;});if(!item)return;
  var el=document.getElementById('aqty-'+id);var amt=parseInt(el?el.value:1)||1;
  var before=item.qty;item.qty+=amt;DB.set('warehouse',items);
  addLog('wh',rosterWho()+' přidal '+amt+'× '+item.name+' ('+before+' → '+item.qty+')',{img:item.img,pingCat:item.cat,plain:true,icon:'📥'});
  toast('+'+amt+' přidáno','success');renderAdminWarehouse();renderMemberWarehouse();
}
function adminSubQty(id){
  var items=DB.get('warehouse')||[];var item=items.find(function(i){return i.id===id;});if(!item)return;
  var el=document.getElementById('aqty-'+id);var amt=parseInt(el?el.value:1)||1;
  var before=item.qty;item.qty=Math.max(0,item.qty-amt);DB.set('warehouse',items);
  addLog('wh',rosterWho()+' odebral '+amt+'× '+item.name+' ('+before+' → '+item.qty+')',{img:item.img,pingCat:item.cat,plain:true,icon:'📤'});
  stockAlert(item,before);
  toast('-'+amt+' odebráno','info');renderAdminWarehouse();renderMemberWarehouse();
}
function deleteItem(id){
  var items=DB.get('warehouse')||[];var item=items.find(function(i){return i.id===id;});
  if(!item||!confirm('Smazat položku "'+item.name+'"?'))return;
  DB.set('warehouse',items.filter(function(i){return i.id!==id;}));
  toast('Položka smazána','info');renderAdminWarehouse();renderMemberWarehouse();
}

// ── BOOSTING ─────────────────────────────────
var BOOST_TIERS=['D','C','B','A','A+','S','S+'];
var mBoostTier='all',aBoostTier='all',editBoostId=null;

function boostList(tier){
  var list=(DB.get('boosting')||[]).filter(function(b){return tier==='all'||b.tier===tier;});
  return list.sort(function(a,b){
    var d=BOOST_TIERS.indexOf(b.tier)-BOOST_TIERS.indexOf(a.tier);
    return d!==0?d:String(a.name).localeCompare(String(b.name),'cs');
  });
}
function boostCard(b,admin){
  var src=imgSrc(b.img);
  var own=!admin&&b.ownerId&&b.ownerId===currentMemberId;
  var sc=admin?'':'m';
  var srcs=[b.img,b.img2,b.img3].map(imgSrc).filter(Boolean);
  var imgH='<div class="wh-img">'+(srcs.length?'<img class="boost-main" src="'+esc(srcs[0])+'" style="cursor:zoom-in" onclick="boostZoom(this.src)" onerror="this.parentElement.innerHTML=\'<span class=wh-icon>?</span>\'"/>':'<span class="wh-icon">?</span>')+'</div>'+
    (srcs.length>1?'<div class="boost-thumbs">'+srcs.map(function(s){return '<img src="'+esc(s)+'" onclick="boostSwap(this)"/>';}).join('')+'</div>':'');
  return '<div class="wh-item boost-item">'+
    '<span class="boost-tier t-'+String(b.tier).replace('+','p')+'">'+esc(b.tier)+'</span>'+
    imgH+
    '<div class="wh-name">'+esc(b.name)+'</div>'+
    '<div class="boost-stat"><span>MAX RYCHLOST</span><b>'+(b.speed?esc(b.speed)+' MP/H':'—')+'</b></div>'+
    '<div class="boost-stat"><span>HANDLING</span><b>'+(b.handling?esc(b.handling):'—')+'</b></div>'+
    '<div class="boost-stat"><span>LOKACE</span><b class="boost-loc">'+(b.loc?esc(b.loc):'—')+'</b></div>'+
    '<div class="boost-stat"><span>BACKUP</span><b class="'+(b.backup?'bk-yes':'bk-no')+'">'+(b.backup?'POTŘEBA':'NE')+'</b></div>'+
    (b.note?'<div class="boost-note">'+esc(b.note)+'</div>':'')+
    (b.addedBy?'<div class="boost-by">// PŘIDAL: '+esc(b.addedBy)+'</div>':'')+
    ((admin||own)?'<div style="display:flex;gap:.4rem;margin-top:.5rem;">'+
      '<button class="btn-pickup" onclick="editBoost(\''+b.id+'\',\''+sc+'\')">✎ UPRAVIT</button>'+
      '<button class="btn-micro del" onclick="delBoost(\''+b.id+'\')">✕</button></div>':'')+
  '</div>';
}
// klik na miniaturu = přepne hlavní fotku; klik na hlavní fotku = zvětšení
function boostSwap(t){
  var card=t.closest('.boost-item');var m=card&&card.querySelector('.boost-main');
  if(m)m.src=t.src;
}
function boostZoom(src){
  var o=document.createElement('div');o.className='modal-ov';o.style.cursor='zoom-out';
  o.innerHTML='<img src="'+esc(src)+'" style="max-width:92vw;max-height:90vh;object-fit:contain;"/>';
  o.onclick=function(){if(o.parentNode)o.parentNode.removeChild(o);};
  document.body.appendChild(o);
}
function mBoostFilter(t,btn){
  mBoostTier=t;document.querySelectorAll('#mt-boosting .wf').forEach(function(b){b.classList.remove('active');});btn.classList.add('active');renderMemberBoosting();
}
function aBoostFilter(t,btn){
  aBoostTier=t;document.querySelectorAll('#at-boosting .wf').forEach(function(b){b.classList.remove('active');});btn.classList.add('active');renderAdminBoosting();
}
function renderMemberBoosting(){
  var el=document.getElementById('mBoostGrid');if(!el)return;
  var list=boostList(mBoostTier);
  el.innerHTML=list.length?list.map(function(b){return boostCard(b,false);}).join(''):'<div class="empty-s" style="grid-column:1/-1">// Žádná vozidla</div>';
}
function renderAdminBoosting(){
  var el=document.getElementById('aBoostGrid');if(!el)return;
  var list=boostList(aBoostTier);
  el.innerHTML=list.length?list.map(function(b){return boostCard(b,true);}).join(''):'<div class="empty-s" style="grid-column:1/-1">// Žádná vozidla</div>';
}
function bEl(p,n){return document.getElementById((p||'')+n);}
function canEditBoost(b){return !!b&&(isAdmin()||(b.ownerId&&b.ownerId===currentMemberId));}
function previewBoostImg(val,p){
  var el=bEl(p,'bo-preview');if(!el)return;
  var h=['bo-img','bo-img2','bo-img3'].map(function(id){
    var inp=bEl(p,id);var src=imgSrc(inp?inp.value:'');
    return src?'<img src="'+esc(src)+'" style="max-height:76px;max-width:120px;object-fit:contain;" onerror="this.style.display=\'none\'"/>':'';
  }).join('');
  el.innerHTML=h||'—';
}
function toggleBoostForm(p){
  var pn=bEl(p,'boostFormPanel');
  if(pn.classList.contains('hidden')){pn.classList.remove('hidden');}
  else resetBoostForm(p);
}
function resetBoostForm(p){
  editBoostId=null;
  ['bo-name','bo-speed','bo-handling','bo-loc','bo-note','bo-img','bo-img2','bo-img3'].forEach(function(i){bEl(p,i).value='';});
  bEl(p,'bo-backup').checked=false;
  bEl(p,'bo-tier').value='D';
  bEl(p,'bo-preview').innerHTML='—';
  setText((p||'')+'boostFormTitle','// NOVÉ VOZIDLO');
  setText((p||'')+'boostSaveBtn','PŘIDAT');
  bEl(p,'boostFormPanel').classList.add('hidden');
}
var GALLERY_URL=(location.origin&&location.origin!=='null')?location.origin+'/':'https://discord.com/';
// další fotky jako samostatné embedy se stejným url -> Discord je spojí do galerie
function boostExtras(imgs){
  return (imgs||[]).slice(1,4).map(function(i){var u=absImg(i);return u?{url:GALLERY_URL,image:{url:u}}:null;}).filter(Boolean);
}
function boostEmbed(title,by,name,tier,speed,loc,backup,note,imgs){
  imgs=imgs||[];
  var e=rich(C_ORANGE,title,'**'+name+'**',[
    ['🏁 Tier','Tier '+tier],['⚡ Rychlost',speed?speed+' MP/H':'—'],['🛡 Backup',backup?'POTŘEBA':'NE'],
    ['📍 Lokace',loc||'neuvedena'],['📝 Poznámka',note,false]
  ],{img:imgs[0],big:true,by:by});
  if(imgs.length>1)e.url=GALLERY_URL;
  return e;
}
function saveBoost(p){
  var m=getMember();if(!m)return;
  var name=bEl(p,'bo-name').value.trim();
  var tier=bEl(p,'bo-tier').value;
  var speed=bEl(p,'bo-speed').value.trim();
  var handling=bEl(p,'bo-handling').value.trim();
  var loc=bEl(p,'bo-loc').value.trim();
  var backup=bEl(p,'bo-backup').checked;
  var note=bEl(p,'bo-note').value.trim();
  var imgs=['bo-img','bo-img2','bo-img3'].map(function(i){return bEl(p,i).value.trim();}).filter(Boolean);
  var img=imgs[0]||'',img2=imgs[1]||'',img3=imgs[2]||'';
  var st=bEl(p,'boostStatus');
  if(!name){st.textContent='// ZADEJTE NÁZEV AUTA';return;}
  var exPing=pingBox((p||'')+'ping-boost');
  var list=DB.get('boosting')||[];
  var info='"'+name+'" (Tier '+tier+', '+(speed||'?')+' MP/H) — Lokace: '+(loc||'neuvedena')+' — Backup: '+(backup?'POTŘEBA':'ne')+(note?' — Poznámka: '+note:'');
  var short=name+' (Tier '+tier+(speed?', '+speed+' MP/H':'')+') · Lokace: '+(loc||'neuvedena')+'; Backup: '+(backup?'POTŘEBA':'NE')+(note?'; Poznámka: '+note:'');
  if(editBoostId){
    var b=list.find(function(x){return x.id===editBoostId;});
    if(!canEditBoost(b)){toast('Nemáš oprávnění','error');return;}
    b.name=name;b.tier=tier;b.speed=speed;b.handling=handling;b.loc=loc;b.backup=backup;b.note=note;b.img=img;b.img2=img2;b.img3=img3;
    addLog('boost',m.displayName+' upravil vozidlo '+short,{extraPing:exPing,extraEmbeds:boostExtras(imgs),embed:boostEmbed('🚗 VOZIDLO UPRAVENO',m.displayName,name,tier,speed,loc,backup,note,imgs)});
    toast('Vozidlo upraveno','success');
  }else{
    list.push({id:uid(),name:name,tier:tier,speed:speed,handling:handling,loc:loc,backup:backup,note:note,img:img,img2:img2,img3:img3,ownerId:m.id,addedBy:m.displayName});
    addLog('boost',m.displayName+' přidal vozidlo '+short,{extraPing:exPing,extraEmbeds:boostExtras(imgs),embed:boostEmbed('🚗 NOVÉ VOZIDLO',m.displayName,name,tier,speed,loc,backup,note,imgs)});
    toast(name+' přidáno','success');
  }
  DB.set('boosting',list);
  resetBoostForm(p);
  renderAdminBoosting();renderMemberBoosting();
}
function editBoost(id,p){
  var b=(DB.get('boosting')||[]).find(function(x){return x.id===id;});
  if(!canEditBoost(b))return;
  p=p||'';editBoostId=id;
  bEl(p,'boostFormPanel').classList.remove('hidden');
  bEl(p,'bo-name').value=b.name||'';
  bEl(p,'bo-tier').value=b.tier||'D';
  bEl(p,'bo-speed').value=b.speed||'';
  bEl(p,'bo-handling').value=b.handling||'';
  bEl(p,'bo-loc').value=b.loc||'';
  bEl(p,'bo-backup').checked=!!b.backup;
  bEl(p,'bo-note').value=b.note||'';
  bEl(p,'bo-img').value=b.img||'';
  bEl(p,'bo-img2').value=b.img2||'';
  bEl(p,'bo-img3').value=b.img3||'';
  previewBoostImg('',p);
  setText(p+'boostFormTitle','// UPRAVIT VOZIDLO');
  setText(p+'boostSaveBtn','ULOŽIT ZMĚNY');
  bEl(p,'boostFormPanel').scrollIntoView({behavior:'smooth',block:'center'});
}
function delBoost(id){
  var list=DB.get('boosting')||[];var b=list.find(function(x){return x.id===id;});
  if(!canEditBoost(b)||!confirm('Smazat vozidlo "'+b.name+'"?'))return;
  DB.set('boosting',list.filter(function(x){return x.id!==id;}));
  var dm=getMember();
  addLog('boost',(dm?dm.displayName:'Někdo')+' smazal vozidlo '+b.name,{plain:true,icon:'🗑'});
  toast('Vozidlo smazáno','info');
  renderAdminBoosting();renderMemberBoosting();
}

// ── HEISTY (reporty o provedených nelegálních pracích) ──
// Report píše ten, kdo akci vedl. Do logu jde krátký záznam, na Discord (sekce "heist") hezký embed.
function heistCard(h,admin){
  var ok=!!h.escaped;
  return '<div class="heist-card '+(ok?'ok':'fail')+'">'+
    '<div class="heist-top"><span class="heist-target">'+esc(h.target)+'</span>'+
      '<span class="heist-chip '+(ok?'ok':'fail')+'">'+(ok?'✓ UJELI':'✗ NEUJELI')+'</span></div>'+
    '<div class="heist-meta"><span>👥 Lidí: <b>'+esc(h.people)+(heistCrewText(h)?' ('+esc(heistCrewText(h))+')':'')+'</b></span><span>💰 Loot: <b>'+esc(h.loot)+'</b></span></div>'+
    '<div class="heist-desc">'+esc(h.desc)+'</div>'+
    '<div class="heist-by">// '+esc(h.memberName)+' — '+esc(h.date)+
      (admin?' <button class="btn-micro del" style="float:right" onclick="delHeist(\''+h.id+'\')">✕ SMAZAT</button>':'')+'</div>'+
  '</div>';
}
// zkrátí text na max n znaků (nejraději na mezeře) a přidá „…“
function cut(s,n){
  s=String(s);if(s.length<=n)return s;
  var c=s.slice(0,n),sp=c.lastIndexOf(' ');
  if(sp>n*0.6)c=c.slice(0,sp);
  return c.replace(/\s+$/,'')+'…';
}
// rozdělí text na kusy max n znaků (nejraději na novém řádku / mezeře)
function splitText(s,n){
  var out=[];s=String(s);
  while(s.length>n){
    var c=s.slice(0,n),sp=Math.max(c.lastIndexOf('\n'),c.lastIndexOf(' '));
    if(sp<n*0.6)sp=n;
    out.push(s.slice(0,sp));s=s.slice(sp).replace(/^\s+/,'');
  }
  out.push(s);return out;
}
// ── Výběr účastníků heistu (podle přezdívek) ──
function memberLabel(m){var n=rosterNames(m);return n.nick||m.displayName;}
function heistCrewIds(){
  var el=document.getElementById('hs-crew');if(!el)return [];
  return Array.prototype.map.call(el.querySelectorAll('input[type=checkbox]:checked'),function(c){return c.value;});
}
function heistCrewUpdate(){
  var ids=heistCrewIds(),ms=DB.get('members')||[];
  setText('hs-crew-n','('+ids.length+')');
  setText('hs-crew-names',ids.map(function(id){var x=ms.find(function(y){return y.id===id;});return x?memberLabel(x):'?';}).join(', '));
}
function renderHeistCrew(){
  var el=document.getElementById('hs-crew');if(!el)return;
  var me=getMember(),sel;
  if(!el.dataset.init){sel=me?[me.id]:[];el.dataset.init='1';}else sel=heistCrewIds();
  var det=el.querySelector('details');var open=det?det.open:true;
  var ms=(DB.get('members')||[]).slice().sort(function(a,b){return memberLabel(a).localeCompare(memberLabel(b),'cs');});
  el.innerHTML='<details class="pick-det"'+(open?' open':'')+'><summary>👥 Vybrat lidi <span class="pick-count" id="hs-crew-n">(0)</span></summary>'+
    '<div class="pick-list">'+ms.map(function(m){
      var lb=memberLabel(m);
      return '<label class="pick-item"><input type="checkbox" value="'+esc(m.id)+'"'+(sel.indexOf(m.id)!==-1?' checked':'')+' onchange="heistCrewUpdate()"/><span>'+esc(lb)+(lb!==m.displayName?' <em>('+esc(m.displayName)+')</em>':'')+'</span></label>';
    }).join('')+'</div></details><div id="hs-crew-names" class="smsg" style="color:var(--textb);padding:.35rem 0 0;"></div>';
  heistCrewUpdate();
}
function heistCrewText(h){
  if(!h.crew||!h.crew.length)return '';
  var ms=DB.get('members')||[];
  return h.crew.map(function(id){var x=ms.find(function(y){return y.id===id;});return x?memberLabel(x):'(smazaný člen)';}).join(', ');
}
// účast na heistu: nové reporty = podle výběru, staré (bez výběru) = jen vedoucí
function heistParticipated(h,id){
  return (h.crew&&h.crew.length)?h.crew.indexOf(id)!==-1:h.memberId===id;
}
function submitHeist(){
  var m=getMember();if(!m)return;
  var t=document.getElementById('hs-target').value;
  var detail=document.getElementById('hs-detail').value.trim();
  var crew=heistCrewIds();var people=crew.length;
  var loot=document.getElementById('hs-loot').value.trim();
  var escaped=document.getElementById('hs-escaped').value==='yes';
  var desc=document.getElementById('hs-desc').value.trim();
  var st=document.getElementById('hsStatus');
  if(t==='Jiné'&&!detail){st.style.color='var(--red)';st.textContent='// UPŘESNĚTE, CO SE VYKRÁDALO';return;}
  if(people<1){st.style.color='var(--red)';st.textContent='// VYBERTE ALESPOŇ JEDNOHO ÚČASTNÍKA';return;}
  if(!loot){st.style.color='var(--red)';st.textContent='// ZADEJTE LOOT (nebo napište „nic“)';return;}
  if(!desc){st.style.color='var(--red)';st.textContent='// NAPIŠTE POPIS PRŮBĚHU';return;}
  var target=(t==='Jiné')?detail:(detail?(t+' — '+detail):t);
  var h={id:uid(),memberId:m.id,memberName:m.displayName,target:target,people:people,crew:crew,loot:loot,escaped:escaped,desc:desc,date:nowStr()};
  var crewTxt=heistCrewText(h);
  var list=DB.get('heists')||[];list.push(h);DB.set('heists',list);
  var story=cut(desc,1850);
  if(desc.length>1850)story+='\n*… zkráceno — celý report je na webu (Admin → Heisty)*';
  var storyFields=splitText(story,1000).map(function(part,i){
    return {name:i===0?'📝 Průběh':'\u200b',value:'>>> '+part,inline:false};
  });
  var em={
    title:cut((escaped?'✅ ':'❌ ')+'Heist: '+target,250),
    color:escaped?0x27ae60:0xc0392b,
    fields:[
      {name:'👥 Lidí',value:String(people),inline:true},
      {name:'🏃 Ujeli?',value:escaped?'**Ano**':'**Ne**',inline:true},
      {name:'🧑 Vedl',value:cut(m.displayName,200),inline:true},
      {name:'💰 Loot',value:cut(loot,1000),inline:false},
      {name:'🧑‍🤝‍🧑 Parta',value:cut(crewTxt||'—',1000),inline:false}
    ].concat(storyFields),
    footer:{text:'Heist report'},
    timestamp:new Date().toISOString()
  };
  addLog('heist',m.displayName+' nahlásil heist: '+target+' — '+(escaped?'ujeli':'neujeli')+', lidí: '+people+' ('+crewTxt+'), loot: '+loot+'.',{embed:em,icon:'💎',extraPing:pingBox('ping-heist')});
  ['hs-detail','hs-loot','hs-desc'].forEach(function(i){document.getElementById(i).value='';});
  var cel=document.getElementById('hs-crew');if(cel){cel.dataset.init='';renderHeistCrew();}
  document.getElementById('hs-target').selectedIndex=0;document.getElementById('hs-escaped').value='yes';
  st.style.color='';st.textContent='// REPORT ODESLÁN';setTimeout(function(){st.textContent='';},3000);
  toast('Heist report odeslán ✓','success');
  renderMyHeists();renderAdminHeists();
}
function renderMyHeists(){
  var m=getMember();if(!m)return;
  populateHeistTargets();renderHeistCrew();
  var el=document.getElementById('myHeists');if(!el)return;
  var list=(DB.get('heists')||[]).filter(function(h){return h.memberId===m.id||heistParticipated(h,m.id);});
  el.innerHTML=list.length?list.slice().reverse().map(function(h){return heistCard(h,false);}).join(''):'<div class="empty-s">// Zatím žádný heist</div>';
}
function renderAdminHeists(){
  renderHeistTargets();
  var el=document.getElementById('aHeists');if(!el)return;
  var list=DB.get('heists')||[];
  var ok=list.filter(function(h){return h.escaped;}).length;
  var stats='<div class="heist-stats">'+
    '<div class="inc-sum-card"><div class="inc-sum-title">CELKEM HEISTŮ</div><div class="inc-sum-val acc">'+list.length+'</div></div>'+
    '<div class="inc-sum-card"><div class="inc-sum-title">UJELI</div><div class="inc-sum-val green">'+ok+'</div></div>'+
    '<div class="inc-sum-card"><div class="inc-sum-title">NEUJELI</div><div class="inc-sum-val" style="color:var(--red)">'+(list.length-ok)+'</div></div>'+
  '</div>';
  el.innerHTML=stats+(list.length?list.slice().reverse().map(function(h){return heistCard(h,true);}).join(''):'<div class="empty-s">// Žádné reporty</div>');
}
// Kategorie „Co se vykrádalo“ — spravuje Vedení (Admin → Heisty). „Jiné“ je u členů vždy poslední volba.
function getHeistTargets(){
  var l=DB.get('heistTargets');
  return Array.isArray(l)?l:['Banka','Klenotnictví','Obchod','Bobcat'];
}
function populateHeistTargets(){
  var sel=document.getElementById('hs-target');if(!sel)return;
  var cur=sel.value;
  var opts=getHeistTargets().concat(['Jiné']);
  sel.innerHTML=opts.map(function(t){return '<option>'+esc(t)+'</option>';}).join('');
  if(opts.indexOf(cur)!==-1)sel.value=cur;
}
function renderHeistTargets(){
  var el=document.getElementById('heistTargetList');if(!el)return;
  var l=getHeistTargets();
  el.innerHTML=l.map(function(t,i){
    return '<span class="ht-chip">'+esc(t)+'<button title="Odebrat" onclick="delHeistTarget('+i+')">✕</button></span>';
  }).join('')+'<span class="ht-chip fixed">Jiné (vždy)</span>';
}
function addHeistTarget(){
  var inp=document.getElementById('ht-new');var st=document.getElementById('htStatus');
  var v=inp.value.trim();
  function err(m){st.style.color='var(--red)';st.textContent=m;}
  if(!v){err('// ZADEJTE NÁZEV');return;}
  if(v.length>40){err('// MAX. 40 ZNAKŮ');return;}
  var l=getHeistTargets();
  if(v.toLowerCase()==='jiné'||l.some(function(x){return x.toLowerCase()===v.toLowerCase();})){err('// TAKOVÁ KATEGORIE JIŽ EXISTUJE');return;}
  l.push(v);DB.set('heistTargets',l);
  addLog('heist','Admin přidal kategorii heistu: "'+v+'".',{noDiscord:true});
  inp.value='';st.style.color='';st.textContent='// PŘIDÁNO';setTimeout(function(){st.textContent='';},2000);
  toast('Kategorie přidána','success');
  renderHeistTargets();populateHeistTargets();
}
function delHeistTarget(i){
  var l=getHeistTargets();var v=l[i];if(v===undefined)return;
  if(!confirm('Odebrat kategorii "'+v+'"? Staré reporty zůstanou beze změny.'))return;
  l.splice(i,1);DB.set('heistTargets',l);
  addLog('heist','Admin odebral kategorii heistu: "'+v+'".',{noDiscord:true});
  toast('Kategorie odebrána','info');
  renderHeistTargets();populateHeistTargets();
}
function delHeist(id){
  var list=DB.get('heists')||[];var h=list.find(function(x){return x.id===id;});
  if(!h||!confirm('Smazat report "'+h.target+'" od '+h.memberName+'?'))return;
  DB.set('heists',list.filter(function(x){return x.id!==id;}));
  addLog('heist','Admin smazal heist report: '+h.target+' ('+h.memberName+').',{noDiscord:true});
  toast('Report smazán','info');renderAdminHeists();renderMyHeists();
}

// ── LOG ──────────────────────────────────────
var LOG_LABELS={roster:'CREW LIST',ev:'VÝDEJ',wh:'SKLAD',task:'ÚKOL',msg:'ZPRÁVA',member:'ČLEN',board:'NÁSTĚNKA',sys:'SYSTÉM',fin:'FINANCE',panic:'PANIC',boost:'BOOSTING',heist:'HEIST',cloth:'OBLEČENÍ',excuse:'OMLUVENKA',report:'HLÁŠENÍ',radio:'VYSÍLAČKA'};
var logCat='all';
function logFilter(cat,btn){
  logCat=cat;document.querySelectorAll('#logFilters .wf').forEach(function(b){b.classList.remove('active');});
  if(btn)btn.classList.add('active');renderLog();
}
function renderLog(){
  var log=DB.get('syslog')||[];var el=document.getElementById('aLog');
  var rows=[];
  log.forEach(function(e,idx){
    if(logCat==='all'||e.cat===logCat)rows.push({e:e,idx:idx});
  });
  if(!rows.length){el.innerHTML='<div class="empty-s">// Log je prázdný</div>';return;}
  el.innerHTML=rows.map(function(r){
    var e=r.e;
    return '<div class="log-entry">'+
      '<span class="log-time">'+e.time+'</span>'+
      '<span class="log-type '+e.type+'">'+(LOG_LABELS[e.type]||e.type)+'</span>'+
      (e.cat?'<span class="log-type cat">'+esc(CAT[e.cat]||e.cat)+'</span>':'')+
      '<span class="log-actor">'+esc(e.actor||'?')+'</span>'+
      '<span class="log-text">'+esc(e.text)+'</span><button class="btn-micro del" onclick="delLogEntry('+r.idx+')">✕</button></div>';
  }).join('');
}
function clearLog(){if(!confirm('Vymazat celý log?'))return;DB.set('syslog',[]);renderLog();toast('Log vymazán','info');}


// ── OMLUVENKY (MEMBER) ───────────────────────
function submitExcuse(){
  var m=getMember();if(!m)return;
  var date=document.getElementById('excDate').value;
  var event=document.getElementById('excEvent').value.trim();
  var reason=document.getElementById('excReason').value.trim();
  var length=document.getElementById('excLength').value.trim();
  var note=document.getElementById('excNote').value.trim();
  var st=document.getElementById('excStatus');
  if(!date||!event||!reason){st.textContent='// VYPLŇTE POVINNÁ POLE';return;}
  var excuses=DB.get('excuses')||[];
  excuses.push({id:uid(),memberId:m.id,memberName:m.displayName,date:date,event:event,reason:reason,length:length,note:note,status:'pending',submitted:nowStr()});
  DB.set('excuses',excuses);
  var dp=date.split('-');var dstr=dp.length===3?dp[2]+'. '+dp[1]+'. '+dp[0]:date;
  var tmpl='Dobrý den,\n\noznamuji, že se dne **'+dstr+'** nemohu zúčastnit **'+event+'**.\n\n'+
    'Důvod: **'+reason+'**\n\n'+
    'Předpokládaná délka nepřítomnosti: **'+(length||'neuvedena')+'**\n\n'+
    (note?'Poznámka: '+note+'\n\n':'')+
    'S pozdravem,\n**'+m.displayName+'**';
  addLog('excuse','Člen "'+m.displayName+'" odeslal omluvenku na "'+event+'".',{embedTitle:'✉ OMLUVENKA — '+m.displayName,discordText:tmpl,extraPing:pingBox('ping-exc')});
  ['excDate','excEvent','excReason','excLength','excNote'].forEach(function(i){document.getElementById(i).value='';});
  st.textContent='// ODESLÁNO';setTimeout(function(){st.textContent='';},2500);
  toast('Omluvenka odeslána','success');renderMyExcuses();renderAdminExcuses();
}
function renderMyExcuses(){
  var m=getMember();if(!m)return;
  var excuses=(DB.get('excuses')||[]).filter(function(e){return e.memberId===m.id;});
  var el=document.getElementById('myExcuses');if(!el)return;
  if(!excuses.length){el.innerHTML='<div class="empty-s">// Žádné omluvenky</div>';return;}
  el.innerHTML=excuses.slice().reverse().map(function(e){
    return '<div class="excuse-card excuse-'+e.status+'">'+
      '<div class="excuse-head"><span class="excuse-member">'+esc(e.event)+' — '+esc(e.date)+'</span>'+
      '<span class="excuse-chip '+e.status+'">'+(e.status==='pending'?'ČEKÁ':e.status==='accepted'?'NA VĚDOMÍ':'ZAMÍTNUTO')+'</span></div>'+
      '<div class="excuse-detail">'+esc(e.reason)+'</div>'+
      (e.note?'<div class="excuse-detail" style="color:var(--muted)">'+esc(e.note)+'</div>':'')+
      '<div class="excuse-date-info">Odesláno: '+e.submitted+'</div>'+
    '</div>';
  }).join('');
}

// ── HLÁŠENÍ (MEMBER) ─────────────────────────
function submitReport(){
  var m=getMember();if(!m)return;
  var body=document.getElementById('reportText').value.trim();
  var st=document.getElementById('reportStatus');
  if(!body){st.textContent='// ZADEJTE ZPRÁVU';return;}
  var reports=DB.get('reports')||[];
  reports.push({id:uid(),memberId:m.id,memberName:m.displayName,body:body,date:nowStr()});
  DB.set('reports',reports);
  addLog('report','Člen "'+m.displayName+'" odeslal hlášení.',{extraPing:joinPings(pingBox('ping-rep'),pickPing('pick-rep')),embed:rich(C_PURPLE,'📄 NOVÉ HLÁŠENÍ','**'+m.displayName+'** odeslal hlášení.',[],{by:m.displayName})});
  document.getElementById('reportText').value='';
  st.textContent='// ODESLÁNO';setTimeout(function(){st.textContent='';},2500);
  toast('Hlášení odesláno','success');renderSentReports();renderAdminReports();
}
function renderSentReports(){
  var m=getMember();if(!m)return;
  var reports=(DB.get('reports')||[]).filter(function(r){return r.memberId===m.id;});
  var el=document.getElementById('mSentReports');if(!el)return;
  if(!reports.length){el.innerHTML='<div class="empty-s">// Žádná odeslána hlášení</div>';return;}
  el.innerHTML=reports.slice().reverse().map(function(r){
    return '<div class="rep-card"><div class="rep-from">// '+r.date+'</div><div class="rep-body">'+esc(r.body)+'</div></div>';
  }).join('');
}

// ── RÁDIO (MEMBER) ───────────────────────────
function radioInfoHtml(){
  var n=new Date(),h=n.getHours(),next;
  if(h<15)next='dnes v 15:00';else if(h<17)next='dnes v 17:00';else next='zítra v 15:00';
  return '<div class="radio-info"><b>⚠ ZMĚNA VYSÍLAČEK</b> Každý den v <b>15:00</b> a v <b>17:00</b> proběhne změna vysílaček (frekvence 100,0–999,0). Nové frekvence se zobrazí tady.<div class="radio-info-next">// PŘÍŠTÍ ZMĚNA: '+next+'</div></div>';
}
function renderMyRadio(){
  var radios=currentRadios();
  var m=getMember();
  var vedeni=m&&isVedeni(m.position);
  var el=document.getElementById('radioDisplay');if(!el)return;
  var rows=[
    {label:'PRIMÁRNÍ',val:radios.primary,color:'var(--acc)'},
    {label:'SEKUNDÁRNÍ',val:radios.secondary,color:'var(--acc)'},
    {label:'AKCE',val:radios.action,color:'var(--green)'}
  ];
  if(m&&m.adminAccess)rows.push({label:'VEDENÍ',val:radios.vedeni,color:'var(--red)'});
  el.innerHTML=radioInfoHtml()+'<div class="radio-grid">'+rows.map(function(r){
    return '<div class="radio-card">'+
      '<div class="radio-label">'+r.label+'</div>'+
      '<div class="radio-freq" style="color:'+r.color+';">'+(r.val||'—')+'</div>'+
      (r.desc?'<div class="radio-desc">'+r.desc+'</div>':'')+
    '</div>';
  }).join('')+'</div>'+(canRegenRadios()?'<div style="margin-top:1rem;"><button class="btn-acc small" onclick="regenRadios()">🎲 VYGENEROVAT NOVÉ FREKVENCE</button></div>':'');
}
function renderContacts(){
  var m=getMember();if(!m)return;
  var contacts=(DB.get('contacts')||{})[m.id]||[];
  var el=document.getElementById('contactsList');if(!el)return;
  if(!contacts.length){el.innerHTML='<div class="empty-s">// Žádné kontakty</div>';return;}
  el.innerHTML=contacts.map(function(c,i){
    var fullName=((c.first||'')+' '+(c.last||'')).trim();
    return '<div class="contact-card">'+
      '<div class="contact-info">'+
        '<div class="contact-nick">'+esc(c.nick)+'</div>'+
        (fullName?'<div class="contact-name">'+esc(fullName)+'</div>':'')+
        '<div class="contact-phone">'+esc(c.phone)+'</div>'+
      '</div>'+
      '<button class="btn-micro del" onclick="deleteContact('+i+')">✕</button>'+
    '</div>';
  }).join('');
}

function addContact(){
  var m=getMember();if(!m)return;
  var nick=document.getElementById('cNick').value.trim();
  var phone=document.getElementById('cPhone').value.trim();
  var first=document.getElementById('cFirst').value.trim();
  var last=document.getElementById('cLast').value.trim();
  var st=document.getElementById('contactStatus');
  if(!nick||!phone){st.textContent='// VYPLŇTE POVINNÁ POLE';return;}
  var contacts=DB.get('contacts')||{};
  if(!contacts[m.id])contacts[m.id]=[];
  contacts[m.id].push({nick:nick,phone:phone,first:first,last:last});
  DB.set('contacts',contacts);
  ['cNick','cPhone','cFirst','cLast'].forEach(function(i){document.getElementById(i).value='';});
  st.textContent='// PŘIDÁNO';setTimeout(function(){st.textContent='';},2000);
  toast(nick+' přidán','success');renderContacts();
}
function deleteContact(idx){
  var m=getMember();if(!m)return;
  var contacts=DB.get('contacts')||{};
  if(!contacts[m.id])return;
  contacts[m.id].splice(idx,1);
  DB.set('contacts',contacts);
  toast('Kontakt smazán','info');renderContacts();
}


// ── PŘÍJMY DO KASY ───────────────────────────
function populateIncSource(){
  var items=DB.get('warehouse')||[];
  var drugs=items.filter(function(i){return i.cat==='drugs';});
  var sel=document.getElementById('incSource');if(!sel)return;
  var extra=['Zakázka','Loupež','Jiné'];
  sel.innerHTML=drugs.map(function(i){
    return '<option value="'+esc(i.name)+'">'+esc(i.name)+'</option>';
  }).join('')+extra.map(function(s){
    return '<option value="'+s+'">'+s+'</option>';
  }).join('');
}

function submitIncome(){
  var m=getMember();if(!m)return;
  var amount=parseInt(document.getElementById('incAmount').value)||0;
  var source=document.getElementById('incSource').value;
  var note=document.getElementById('incNote').value.trim();
  var st=document.getElementById('incStatus');
  if(!amount||amount<=0){st.textContent='// ZADEJTE ČÁSTKU';return;}
  var incomes=DB.get('incomes')||[];
  incomes.push({
    id:uid(),
    memberId:m.id,
    memberName:m.displayName,
    amount:amount,
    source:source,
    note:note,
    date:nowStr(),
    status:'pending'
  });
  DB.set('incomes',incomes);
  addLog('fin','Člen "'+m.displayName+'" nahlásil příjem $'+amount+' ('+source+').',{extraPing:pingBox('ping-inc'),embed:rich(C_YELLOW,'💵 NAHLÁŠEN PŘÍJEM',null,[['👤 Člen',m.displayName],['💵 Částka',money(amount)],['📦 Zdroj',source]],{by:m.displayName})});
  document.getElementById('incAmount').value='';
  document.getElementById('incNote').value='';
  st.textContent='// ODESLÁNO KE SCHVÁLENÍ';
  setTimeout(function(){st.textContent='';},3000);
  toast('Příjem nahlášen ✓','success');
  renderMyIncomes();
}

function renderMyIncomes(){
  var m=getMember();if(!m)return;
  var incomes=(DB.get('incomes')||[]).filter(function(i){return i.memberId===m.id;});
  var el=document.getElementById('myIncomeList');if(!el)return;

  // Celková statistika člena
  var confirmed=incomes.filter(function(i){return i.status==='confirmed';});
  var totalMy=confirmed.reduce(function(s,i){return s+i.amount;},0);
  var statHtml='<div class="inc-my-stat">'+
    '<div class="inc-stat-label">// TVŮJ CELKOVÝ PŘÍSPĚVEK DO KASY</div>'+
    '<div class="inc-stat-val">$'+totalMy.toLocaleString('cs-CZ')+'</div>'+
  '</div>';

  if(!incomes.length){el.innerHTML=statHtml+'<div class="empty-s">// Žádné záznamy</div>';return;}
  var rows=incomes.slice().reverse().map(function(i){
    var cls=i.status==='confirmed'?'confirmed':i.status==='rejected'?'rejected':'pending';
    var label={confirmed:'✓ POTVRZENO',rejected:'✗ ZAMÍTNUTO',pending:'⏳ ČEKÁ'}[i.status];
    return '<div class="inc-card '+cls+'">'+
      '<div class="inc-card-top">'+
        '<div>'+
          '<span class="inc-source">'+esc(i.source)+'</span>'+
          (i.note?'<span class="inc-note"> — '+esc(i.note)+'</span>':'')+
        '</div>'+
        '<div class="inc-amount">$'+i.amount.toLocaleString('cs-CZ')+'</div>'+
      '</div>'+
      '<div class="inc-card-bot">'+
        '<span class="inc-date">'+i.date+'</span>'+
        '<span class="inc-status '+cls+'">'+label+'</span>'+
      '</div>'+
    '</div>';
  }).join('');
  el.innerHTML=statHtml+rows;
}

// ── PŘÍJMY ADMIN ─────────────────────────────
function renderAdminIncomes(){
  var incomes=DB.get('incomes')||[];
  var members=DB.get('members')||[];
  var el=document.getElementById('adminIncomePanel');if(!el)return;

  var confirmed=incomes.filter(function(i){return i.status==='confirmed';});
  var pending=incomes.filter(function(i){return i.status==='pending';});
  var totalKasa=confirmed.reduce(function(s,i){return s+i.amount;},0);

  // Souhrn kasy
  var summary='<div class="inc-summary">'+
    '<div class="inc-sum-card"><div class="inc-sum-title">CELKEM V KASE</div><div class="inc-sum-val green">$'+totalKasa.toLocaleString('cs-CZ')+'</div></div>'+
    '<div class="inc-sum-card"><div class="inc-sum-title">ČEKÁ NA SCHVÁLENÍ</div><div class="inc-sum-val acc">'+pending.length+' záznamů</div></div>'+
  '</div>';

  // Žebříček členů
  var memberTotals={};
  confirmed.forEach(function(i){
    if(!memberTotals[i.memberId])memberTotals[i.memberId]={name:i.memberName,total:0};
    memberTotals[i.memberId].total+=i.amount;
  });
  var sorted=Object.values(memberTotals).sort(function(a,b){return b.total-a.total;});
  var leaderboard='<div class="inc-leaderboard"><div class="fa-exp-title">// ŽEBŘÍČEK PŘÍSPĚVKŮ</div>'+
    (sorted.length?sorted.map(function(x,idx){
      return '<div class="inc-rank-row">'+
        '<span class="inc-rank-num">#'+(idx+1)+'</span>'+
        '<span class="inc-rank-name">'+esc(x.name)+'</span>'+
        '<span class="inc-rank-val">$'+x.total.toLocaleString('cs-CZ')+'</span>'+
      '</div>';
    }).join(''):'<div class="empty-s">// Žádné potvrzené příjmy</div>')+
  '</div>';

// Čekající ke schválení
  var pendingHtml='<div class="inc-pending"><div class="fa-exp-title">// KE SCHVÁLENÍ</div>'+
    (pending.length?pending.slice().reverse().map(function(i){
      return '<div class="inc-card pending">'+
        '<div class="inc-card-top">'+
          '<div>'+
            '<span class="inc-rank-name">'+esc(i.memberName)+'</span>'+
            '<span class="inc-source" style="margin-left:.5rem;">'+esc(i.source)+'</span>'+
            (i.note?'<span class="inc-note"> — '+esc(i.note)+'</span>':'')+
          '</div>'+
          '<div class="inc-amount">$'+i.amount.toLocaleString('cs-CZ')+'</div>'+
        '</div>'+
        '<div class="inc-card-bot">'+
          '<span class="inc-date">'+i.date+'</span>'+
          '<div style="display:flex;gap:.4rem;">'+
            '<button class="btn-acc small" onclick="resolveIncome(\''+i.id+'\',\'confirmed\')">✓ POTVRDIT</button>'+
            '<button class="btn-danger" onclick="resolveIncome(\''+i.id+'\',\'rejected\')">✗ ZAMÍTNOUT</button>'+
            '<button class="btn-micro del" onclick="delIncome(\''+i.id+'\')">✕</button>'+
          '</div>'+
        '</div>'+
      '</div>';
    }).join(''):'<div class="empty-s">// Nic nečeká na schválení</div>')+
  '</div>';

  // Historie potvrzených
  var historyHtml='<div class="inc-pending" style="margin-top:1rem;"><div class="fa-exp-title">// HISTORIE PŘÍJMŮ</div>'+
    (confirmed.length?confirmed.slice().reverse().map(function(i){
      return '<div class="inc-card confirmed" style="opacity:.8;">'+
        '<div class="inc-card-top">'+
          '<div>'+
            '<span class="inc-rank-name">'+esc(i.memberName)+'</span>'+
            '<span class="inc-source" style="margin-left:.5rem;">'+esc(i.source)+'</span>'+
            (i.note?'<span class="inc-note"> — '+esc(i.note)+'</span>':'')+
          '</div>'+
          '<div class="inc-amount">$'+i.amount.toLocaleString('cs-CZ')+'</div>'+
        '</div>'+
        '<div class="inc-card-bot"><span class="inc-date">'+i.date+'</span><span class="inc-status confirmed">✓ POTVRZENO</span><button class="btn-micro del" onclick="delIncome(\''+i.id+'\')">✕</button></div>'+
      '</div>';
    }).join(''):'<div class="empty-s">// Žádné potvrzené příjmy</div>')+
  '</div>';

  el.innerHTML=summary+leaderboard+pendingHtml+historyHtml;
}

function resolveIncome(id,decision){
  var incomes=DB.get('incomes')||[];
  var item=incomes.find(function(i){return i.id===id;});
  if(!item)return;
  item.status=decision;
  DB.set('incomes',incomes);
  var okI=decision==='confirmed';
  addLog('fin','Admin '+(okI?'potvrdil':'zamítl')+' příjem $'+item.amount+' od "'+item.memberName+'" ('+item.source+').',{embed:rich(okI?C_GREEN:C_RED,okI?'✅ PŘÍJEM POTVRZEN':'❌ PŘÍJEM ZAMÍTNUT',null,[['👤 Člen',item.memberName],['💵 Částka',money(item.amount)],['📦 Zdroj',item.source]],{by:(getMember()?getMember().displayName:'Admin')})});
  toast(decision==='confirmed'?'Příjem potvrzen ✓':'Zamítnuto ✗','info');
  renderAdminIncomes();
  renderAdminFinance();
}
// ── ADMIN: MAZÁNÍ A PŘEHLEDY ZPRÁV / ÚKOLŮ ──
function renderAdminTasks(){
  var el=document.getElementById('aTaskList');if(!el)return;
  var tasks=DB.get('tasks')||{};var members=DB.get('members')||[];var rows=[];
  Object.keys(tasks).forEach(function(mid){
    var mm=members.find(function(x){return x.id===mid;});
    (tasks[mid]||[]).forEach(function(t){rows.push({mid:mid,name:mm?mm.displayName:'(smazaný člen)',t:t});});
  });
  if(!rows.length){el.innerHTML='<div class="empty-s">// Žádné úkoly</div>';return;}
  el.innerHTML=rows.slice().reverse().map(function(r){
    var t=r.t;
    return '<div class="task-card '+t.priority+(t.done?' archived':'')+'">'+
      '<div class="task-top"><span class="task-name">'+esc(t.title)+' → '+esc(r.name)+'</span>'+
      '<div style="display:flex;gap:.5rem;align-items:center;"><span class="pchip '+t.priority+'">'+PRIO[t.priority]+'</span>'+
      '<button class="btn-micro del" onclick="delTaskAdmin(\''+r.mid+'\',\''+t.id+'\')">✕</button></div></div>'+
      '<div class="task-desc">'+esc(t.desc)+'</div>'+
      '<div class="task-meta"><span class="task-date">'+t.date+(t.done?' | '+({splneno:'✓ SPLNĚNO',casti:'~ ČÁSTEČNĚ',nesplneno:'✗ NESPLNĚNO'}[t.resolution]||'ARCHIVOVÁNO'):' | AKTIVNÍ')+'</span></div></div>';
  }).join('');
}
function delTaskAdmin(mid,tid){
  if(!confirm('Smazat úkol?'))return;
  var tasks=DB.get('tasks')||{};
  tasks[mid]=(tasks[mid]||[]).filter(function(t){return t.id!==tid;});
  DB.set('tasks',tasks);
  toast('Úkol smazán','info');renderAdminTasks();
}
function renderAdminMessages(){
  var el=document.getElementById('aMsgList');if(!el)return;
  var msgs=DB.get('messages')||{};var members=DB.get('members')||[];var map={},order=[];
  Object.keys(msgs).forEach(function(mid){
    var mm=members.find(function(x){return x.id===mid;});
    (msgs[mid]||[]).forEach(function(m){
      if(!map[m.id]){map[m.id]={m:m,to:[]};order.push(m.id);}
      map[m.id].to.push(mm?mm.displayName:'?');
    });
  });
  if(!order.length){el.innerHTML='<div class="empty-s">// Žádné odeslané zprávy</div>';return;}
  el.innerHTML=order.slice().reverse().map(function(id){
    var g=map[id],m=g.m;
    var to=g.to.length>3?'VŠICHNI ('+g.to.length+')':g.to.join(', ');
    return '<div class="msg-card"><div style="display:flex;justify-content:space-between;gap:.5rem;"><div class="msg-subject">'+esc(m.subject)+'</div>'+
      '<button class="btn-micro del" onclick="delMsgAdmin(\''+id+'\')">✕</button></div>'+
      '<div class="msg-body">'+esc(m.body)+'</div><div class="msg-from">// KOMU: '+esc(to)+' — '+m.date+'</div></div>';
  }).join('');
}
function delMsgAdmin(id){
  if(!confirm('Smazat zprávu (zmizí i členům)?'))return;
  var msgs=DB.get('messages')||{};
  Object.keys(msgs).forEach(function(mid){msgs[mid]=(msgs[mid]||[]).filter(function(m){return m.id!==id;});});
  DB.set('messages',msgs);
  toast('Zpráva smazána','info');renderAdminMessages();
}
function delExcuse(id){
  if(!confirm('Smazat omluvenku?'))return;
  DB.set('excuses',(DB.get('excuses')||[]).filter(function(e){return e.id!==id;}));
  toast('Omluvenka smazána','info');renderAdminExcuses();
}
function delReport(id){
  if(!confirm('Smazat hlášení?'))return;
  DB.set('reports',(DB.get('reports')||[]).filter(function(r){return r.id!==id;}));
  toast('Hlášení smazáno','info');renderAdminReports();
}
function delIncome(id){
  if(!confirm('Smazat záznam příjmu?'))return;
  DB.set('incomes',(DB.get('incomes')||[]).filter(function(i){return i.id!==id;}));
  toast('Záznam smazán','info');renderAdminIncomes();renderAdminFinance();
}
function delLogEntry(idx){
  var log=DB.get('syslog')||[];
  if(idx<0||idx>=log.length)return;
  log.splice(idx,1);DB.set('syslog',log);renderLog();
}

// ── CREW LIST (přehled: jméno, příjmení, přezdívka, hodnost, strike, návrh na povýšení) ──
// Jméno/příjmení/přezdívku nastavuje Vedení v Admin → Členové. Když chybí, jméno se odvodí z IC jména.
function rosterNames(m){
  var f=(m.firstName||'').trim(),l=(m.lastName||'').trim();
  if(!f&&!l){var p=String(m.displayName||'').trim().split(/\s+/);f=p[0]||'';l=p.slice(1).join(' ');}
  return {first:f,last:l,nick:(m.nick||'').trim()};
}
// Strike a návrhy povýšení smí spravovat jen první tři nejvyšší role
var ROSTER_POS=['Mastermind','Overseer','Advisor'];
function canRoster(){var m=getMember();return !!m&&ROSTER_POS.indexOf(m.position)!==-1;}
function renderRoster(admin){
  var el=document.getElementById(admin?'rosterAdmin':'rosterMember');if(!el)return;
  var ctl=admin&&canRoster();
  var bar=ctl?'<div class="fp-ftr" style="margin-bottom:.8rem;"><button class="btn-acc small" onclick="sendRosterToDiscord()">📤 POSLAT NA DISCORD</button><span id="rosterSendStatus" class="smsg"></span></div>':'';
  var note=(admin&&!ctl)?'<div class="radio-info" style="margin-bottom:.8rem;">Strike a návrhy povýšení mohou spravovat jen <b>Mastermind, Overseer a Advisor</b>. Ty ostatní vidí přehled jen pro čtení.</div>':'';
  var members=(DB.get('members')||[]).slice().sort(function(a,b){
    var d=POSITIONS.indexOf(a.position)-POSITIONS.indexOf(b.position);
    return d!==0?d:String(a.displayName).localeCompare(String(b.displayName),'cs');
  });
  if(!members.length){el.innerHTML='<div class="empty-s">// Žádní členové</div>';return;}
  var rows=members.map(function(m){
    var n=rosterNames(m);var s=Math.max(0,Math.min(3,parseInt(m.strikes)||0));
    var strike='<div class="rs-strikes s'+s+'">'+[1,2,3].map(function(i){return '<span class="rs-chip'+(i<=s?' on':'')+'">'+i+'</span>';}).join('')+'</div>';
    var promo=m.promo?('<div class="rs-promo"><b>→ '+esc(m.promo.to)+'</b>'+(m.promo.note?'<div class="rs-promo-note">'+esc(m.promo.note)+'</div>':'')+(m.promo.by?'<div class="rs-promo-by">// '+esc(m.promo.by)+(m.promo.date?' — '+esc(m.promo.date):'')+'</div>':'')+'</div>'):'<span class="rs-none">—</span>';
    var act='';
    if(ctl){
      if(m.position==='Mastermind'){act='<td class="rs-act"><span class="rs-none">🔒 Mastermind — bez strike a změny role</span></td>';}
      else{
        act='<td class="rs-act">'+
          '<div class="rs-act-row"><span class="rs-lbl">STRIKE</span><button class="btn-micro" onclick="setStrike(\''+m.id+'\',-1)"'+(s<=0?' disabled':'')+'>−</button><button class="btn-micro del" onclick="setStrike(\''+m.id+'\',1)"'+(s>=3?' disabled':'')+'>+</button></div>'+
          '<div class="rs-act-row"><select class="mc-pos-sel" id="rp-sel-'+m.id+'">'+POSITIONS.filter(function(p){return p!==m.position;}).map(function(p){return '<option'+(m.promo&&m.promo.to===p?' selected':'')+'>'+esc(p)+'</option>';}).join('')+'</select></div>'+
          '<div class="rs-act-row"><input type="text" class="mc-pos-sel" id="rp-note-'+m.id+'" placeholder="Důvod / poznámka" value="'+esc(m.promo?m.promo.note||'':'')+'"/></div>'+
          '<div class="rs-act-row"><button class="btn-acc small" onclick="proposePromo(\''+m.id+'\')">'+(m.promo?'ZMĚNIT NÁVRH':'NAVRHNOUT')+'</button>'+
          (m.promo?'<button class="btn-acc small" onclick="approvePromo(\''+m.id+'\')">✓ POVÝŠIT</button><button class="btn-micro del" onclick="clearPromo(\''+m.id+'\')">✕</button>':'')+'</div></td>';
      }
    }
    return '<tr'+(s>=3?' class="rs-danger"':'')+'>'+
      '<td data-l="Jméno">'+esc(n.first)+'</td>'+
      '<td data-l="Příjmení">'+esc(n.last)+'</td>'+
      '<td data-l="Přezdívka">'+(n.nick?esc(n.nick):'<span class="rs-none">—</span>')+'</td>'+
      '<td data-l="Hodnost"><span class="rs-pos '+(isVedeni(m.position)?'vedeni':'other')+'">'+esc(m.position)+'</span></td>'+
      '<td data-l="Strike">'+strike+'</td>'+
      '<td data-l="Návrh na povýšení">'+promo+'</td>'+act+'</tr>';
  }).join('');
  el.innerHTML=note+bar+'<div class="rs-scroll"><table class="rs-table"><thead><tr><th>JMÉNO</th><th>PŘÍJMENÍ</th><th>PŘEZDÍVKA</th><th>HODNOST</th><th>STRIKE</th><th>NÁVRH NA POVÝŠENÍ</th>'+(ctl?'<th>SPRÁVA</th>':'')+'</tr></thead><tbody>'+rows+'</tbody></table></div>';
}
function rosterTarget(id,namesOnly){
  var members=DB.get('members')||[];var m=members.find(function(x){return x.id===id;});
  if(!m)return null;
  if(!namesOnly){
    if(!canRoster()){toast('Strike a povýšení spravuje jen Mastermind, Overseer a Advisor','error');return null;}
    if(m.position==='Mastermind'){toast('Mastermindovi nelze dát strike ani změnit roli','error');return null;}
  }
  if(!canManage(m)){toast('Mastermind může spravovat jen Mastermind','error');return null;}
  return {members:members,m:m};
}
// Pošle aktuální seznam členů (hodnost, jméno, přezdívka, strike, návrh povýšení) na Discord do sekce „Seznam Členů“
function sendRosterToDiscord(){
  if(!canRoster()){toast('Odeslat Crew List smí jen Mastermind, Overseer a Advisor','error');return;}
  var members=(DB.get('members')||[]).slice().sort(function(a,b){
    var d=POSITIONS.indexOf(a.position)-POSITIONS.indexOf(b.position);
    return d!==0?d:String(a.displayName).localeCompare(String(b.displayName),'cs');
  });
  if(!members.length){toast('Žádní členové','error');return;}
  var lines=members.map(function(m){
    var n=rosterNames(m);var s=Math.max(0,Math.min(3,parseInt(m.strikes)||0));
    var full=(n.first+' '+n.last).trim()||m.displayName;
    return '**'+m.position+'** — '+full+(n.nick?' „'+n.nick+'“':'')+
      '\n└ Strike: '+(s?'⚠️ **'+s+'/3**':'0/3')+(m.promo?' · ⬆️ Návrh: **'+m.promo.to+'**'+(m.promo.note?' ('+m.promo.note+')':''):'');
  });
  var chunks=[],cur='';
  lines.forEach(function(l){
    if((cur+'\n\n'+l).length>3400&&cur){chunks.push(cur);cur=l;}
    else cur=cur?cur+'\n\n'+l:l;
  });
  if(cur)chunks.push(cur);
  var who=rosterWho();
  var embeds=chunks.slice(0,10).map(function(c,i){
    return {title:i===0?'🪪 CREW LIST ('+members.length+')':'🪪 CREW LIST — pokračování',description:c,color:C_BLUE,footer:{text:who+' • '+nowStr()}};
  });
  addLog('roster',who+' odeslal seznam členů na Discord ('+members.length+' členů).',{embed:embeds[0],extraEmbeds:embeds.slice(1)});
  setText('rosterSendStatus','// ODESLÁNO');setTimeout(function(){setText('rosterSendStatus','');},2500);
  toast('Crew List odeslán na Discord','success');
}
function rosterWho(){var a=getMember();return a?a.displayName:'Admin';}
function changeRosterInfo(id){
  var t=rosterTarget(id,true);if(!t)return;
  t.m.firstName=(document.getElementById('fn-'+id).value||'').trim();
  t.m.lastName=(document.getElementById('ln-'+id).value||'').trim();
  t.m.nick=(document.getElementById('nk-'+id).value||'').trim();
  DB.set('members',t.members);
  addLog('member','Admin upravil jméno/příjmení/přezdívku člena "'+t.m.displayName+'".',{noDiscord:true});
  toast('Údaje uloženy','success');renderMemberGrid();
}
function setStrike(id,delta){
  var t=rosterTarget(id);if(!t)return;
  var old=Math.max(0,Math.min(3,parseInt(t.m.strikes)||0));
  var nu=Math.max(0,Math.min(3,old+delta));
  if(nu===old)return;
  t.m.strikes=nu;DB.set('members',t.members);
  var n=rosterNames(t.m);
  addLog('roster',rosterWho()+(delta>0?' udělil strike ':' odebral strike ')+'členovi '+t.m.displayName+' ('+old+' → '+nu+'/3).',{embed:rich(delta>0?(nu>=3?C_RED:C_ORANGE):C_GREEN,delta>0?'⚠️ STRIKE UDĚLEN':'✅ STRIKE ODEBRÁN','**'+t.m.displayName+'**',[
    ['👤 Jméno',(n.first+' '+n.last).trim()||'—'],['🏷 Přezdívka',n.nick||'—'],['🎖️ Hodnost',t.m.position],
    ['⚡ Strike',['—','1/3','2/3','3/3'][nu]+' (dříve '+old+'/3)']],{by:rosterWho()})});
  toast('Strike '+nu+'/3 — '+t.m.displayName,delta>0?'error':'success');
  renderRoster(true);
}
function proposePromo(id){
  var t=rosterTarget(id);if(!t)return;
  var to=document.getElementById('rp-sel-'+id).value;
  var note=(document.getElementById('rp-note-'+id).value||'').trim();
  t.m.promo={to:to,note:note,by:rosterWho(),date:nowStr()};
  DB.set('members',t.members);
  addLog('roster',rosterWho()+' navrhl povýšení: '+t.m.displayName+' ('+t.m.position+' → '+to+')'+(note?' — '+note:'')+'.',{embed:rich(C_BLUE,'⬆️ NÁVRH NA POVÝŠENÍ','**'+t.m.displayName+'**',[
    ['🎖️ Nyní',t.m.position],['➡️ Navrženo',to],['📝 Důvod',note||'—',false]],{by:rosterWho()})});
  toast('Návrh na povýšení uložen','success');renderRoster(true);
}
function clearPromo(id){
  var t=rosterTarget(id);if(!t||!t.m.promo)return;
  delete t.m.promo;DB.set('members',t.members);
  addLog('roster',rosterWho()+' zrušil návrh na povýšení člena '+t.m.displayName+'.',{embed:rich(C_GREY,'🚫 NÁVRH NA POVÝŠENÍ ZRUŠEN','**'+t.m.displayName+'**',[['🎖️ Hodnost',t.m.position]],{by:rosterWho()})});
  toast('Návrh zrušen','info');renderRoster(true);
}
function approvePromo(id){
  var t=rosterTarget(id);if(!t||!t.m.promo)return;
  var to=t.m.promo.to;var me=getMember();
  if(to==='Mastermind'&&!(me&&me.position==='Mastermind')){toast('Pozici Mastermind může přidělit jen Mastermind','error');return;}
  if(!confirm('Povýšit "'+t.m.displayName+'" na "'+to+'"?'))return;
  var old=t.m.position;t.m.position=to;syncAdminForPos(t.m,old);delete t.m.promo;
  DB.set('members',t.members);
  addLog('roster',rosterWho()+' povýšil '+t.m.displayName+' ('+old+' → '+to+').',{embed:rich(C_GREEN,'🏅 POVÝŠENÍ','**'+t.m.displayName+'**',[['🎖️ Původní',old],['➡️ Nová hodnost',to]],{by:rosterWho()})});
  toast('Povýšeno na '+to,'success');renderRoster(true);
}


// ════════════════════════════════════════════════════════════
//  VELKÝ UPGRADE: Ctrl+K hledání · Centrum upozornění ·
//  Statistiky (admin) · Kalendář akcí
// ════════════════════════════════════════════════════════════
SECTIONS.push({key:'cal',label:'Kalendář akcí'});
LOG_ICONS.cal='📅';LOG_LABELS.cal='KALENDÁŘ';

// ── pomocné ──────────────────────────────────
function lsGet(k){try{return localStorage.getItem(k);}catch(e){return null;}}
function lsSet(k,v){try{localStorage.setItem(k,v);}catch(e){}}
function parseCz(s){
  var r=/(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})(?:[^\d]+(\d{1,2}):(\d{2}))?/.exec(String(s||''));
  if(!r)return null;
  return new Date(+r[3],+r[2]-1,+r[1],+(r[4]||0),+(r[5]||0));
}
function weekKeyOf(d){var yr=d.getFullYear();var start=new Date(yr,0,1);var wk=Math.ceil(((d-start)/86400000+start.getDay()+1)/7);return yr+'-W'+wk;}
function agoStr(ts){
  var s=Math.max(0,(Date.now()-ts)/1000);
  if(s<60)return 'teď';
  if(s<3600)return Math.floor(s/60)+' min';
  if(s<86400)return Math.floor(s/3600)+' h';
  return Math.floor(s/86400)+' d';
}
function normS(s){return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();}
function adminActive(){return document.getElementById('adminScreen').classList.contains('active');}
function goTo(scope,key){
  var adm=adminActive();
  if(scope==='a'&&!adm){if(!isAdmin())return;goToAdmin();}
  else if(scope==='m'&&adm){goBackToMember();}
  goNav(scope,key);
}

// ── vložení tlačítek a overlayů (jednou) ─────
function injectUX(){
  if(document.getElementById('palette'))return;
  var tools='<span class="sb-tools"><button class="tb" title="Hledat (Ctrl+K)" onclick="openPalette()">🔍</button>'+
    '<button class="tb bell" title="Upozornění" onclick="toggleNotif(event)">🔔<i class="bell-n"></i></button></span>';
  document.querySelectorAll('.sidebar .sb-logo').forEach(function(l){l.insertAdjacentHTML('beforeend',tools);});
  document.querySelectorAll('.sidebar .sb-foot').forEach(function(f){f.insertAdjacentHTML('afterbegin',tools);});
  var p=document.createElement('div');p.id='palette';p.className='pal-ov';
  p.innerHTML='<div class="pal-box"><input id="palInput" class="pal-in" type="text" placeholder="Hledat záložku, člena, položku skladu, úkol…" autocomplete="off"/><div id="palList" class="pal-list"></div><div class="pal-hint">↑↓ výběr · Enter otevřít · Esc zavřít</div></div>';
  document.body.appendChild(p);
  var n=document.createElement('div');n.id='notifPanel';n.className='notif-panel';document.body.appendChild(n);
  p.addEventListener('mousedown',function(e){if(e.target===p)closePalette();});
  var inp=document.getElementById('palInput');
  inp.addEventListener('input',palRender);
  inp.addEventListener('keydown',function(e){
    if(e.key==='ArrowDown'){e.preventDefault();palMove(1);}
    else if(e.key==='ArrowUp'){e.preventDefault();palMove(-1);}
    else if(e.key==='Enter'){e.preventDefault();palRun(palSel);}
    else if(e.key==='Escape'){e.preventDefault();closePalette();}
  });
  document.addEventListener('click',function(e){
    var np=document.getElementById('notifPanel');
    if(np&&np.classList.contains('open')&&!np.contains(e.target)&&!e.target.closest('.bell'))closeNotif();
  });
}
document.addEventListener('keydown',function(e){
  if((e.ctrlKey||e.metaKey)&&String(e.key).toLowerCase()==='k'&&currentMemberId){
    e.preventDefault();
    var pal=document.getElementById('palette');
    if(pal&&pal.classList.contains('open'))closePalette();else openPalette();
  }
});

// ════════════ RYCHLÉ HLEDÁNÍ (Ctrl+K) ════════════
var palSel=0,palRes=[];
function palIndex(){
  var adm=adminActive(),scope=adm?'a':'m',out=[];
  menuItems(adm?'admin':'member').forEach(function(it){
    if(it.btn.classList.contains('hidden'))return;
    var nl=it.btn.querySelector('.nl');
    out.push({g:'ZÁLOŽKA',icon:it.icon,t:nl?nl.textContent:it.def,s:'',run:function(){it.btn.click();}});
  });
  out.push({g:'AKCE',icon:'🚪',t:'Odhlásit',s:'',run:function(){goBack();}});
  var members=DB.get('members')||[];
  members.forEach(function(x){
    var nm=[x.firstName,x.lastName].filter(Boolean).join(' ');
    out.push({g:'ČLEN',icon:'👤',t:x.displayName,s:[x.position,nm,x.nick].filter(Boolean).join(' · '),run:function(){goTo(scope,adm?'members':'roster');}});
  });
  (DB.get('warehouse')||[]).forEach(function(i){
    out.push({g:'SKLAD',icon:'📦',t:i.name,s:i.qty+' ks',run:function(){
      goTo(scope,'warehouse');
      setTimeout(function(){
        var inp=document.querySelector((scope==='a'?'#at-warehouse':'#mt-warehouse')+' .wh-search');
        if(inp)inp.value=i.name;whSearch(scope,i.name);
      },60);
    }});
  });
  (DB.get('board')||[]).slice().reverse().forEach(function(p){
    out.push({g:'OZNÁMENÍ',icon:'📣',t:p.title,s:p.author||'',run:function(){goTo(scope,'board');}});
  });
  var tasks=DB.get('tasks')||{};
  Object.keys(tasks).forEach(function(mid){
    if(!adm&&mid!==currentMemberId)return;
    var who=members.find(function(x){return x.id===mid;});
    (tasks[mid]||[]).forEach(function(t){out.push({g:'ÚKOL',icon:'📋',t:t.title,s:(adm&&who?who.displayName+' · ':'')+(t.done?'hotovo':'otevřený'),run:function(){goTo(scope,'tasks');}});});
  });
  var msgs=DB.get('messages')||{},seen={};
  Object.keys(msgs).forEach(function(mid){
    if(!adm&&mid!==currentMemberId)return;
    (msgs[mid]||[]).forEach(function(x){if(seen[x.id])return;seen[x.id]=1;out.push({g:'ZPRÁVA',icon:'💬',t:x.subject,s:x.date||'',run:function(){goTo(scope,'messages');}});});
  });
  (DB.get('events')||[]).forEach(function(e){
    var d=evStart(e);if(!d)return;
    out.push({g:'AKCE',icon:'📅',t:e.title,s:fmtEv(d),run:function(){goTo(scope,'calendar');}});
  });
  if(adm){
    (DB.get('heists')||[]).forEach(function(h){out.push({g:'HEIST',icon:'💎',t:h.target,s:(h.memberName||'')+' · '+(h.date||''),run:function(){goTo('a','heists');}});});
  }
  return out;
}
function openPalette(){
  if(!currentMemberId)return;
  injectUX();
  var ov=document.getElementById('palette');ov.classList.add('open');
  var inp=document.getElementById('palInput');inp.value='';
  palRender();setTimeout(function(){inp.focus();},30);
}
function closePalette(){var ov=document.getElementById('palette');if(ov)ov.classList.remove('open');}
function palRender(){
  var q=normS(document.getElementById('palInput').value).trim();
  var idx=palIndex(),res=[];
  if(!q){res=idx.filter(function(x){return x.g==='ZÁLOŽKA'||(x.g==='AKCE'&&x.icon==='🚪');});}
  else{
    idx.forEach(function(x){
      var tn=normS(x.t),sn=normS(x.s),sc=0;
      if(tn.indexOf(q)===0)sc=4;else if(tn.indexOf(' '+q)!==-1)sc=3;else if(tn.indexOf(q)!==-1)sc=2;else if(sn.indexOf(q)!==-1)sc=1;
      if(sc){x.sc=sc;res.push(x);}
    });
    res.sort(function(a,b){return b.sc-a.sc;});
  }
  palRes=res.slice(0,40);palSel=0;
  var l=document.getElementById('palList');
  l.innerHTML=palRes.length?palRes.map(function(x,i){
    return '<div class="pal-it'+(i===0?' sel':'')+'" onmousemove="palHover('+i+')" onclick="palRun('+i+')"><span class="pal-ic">'+esc(x.icon)+'</span><span class="pal-t">'+esc(x.t)+(x.s?'<small>'+esc(x.s)+'</small>':'')+'</span><span class="pal-g">'+x.g+'</span></div>';
  }).join(''):'<div class="empty-s">// Nic nenalezeno</div>';
}
function palHover(i){if(i===palSel)return;palSel=i;palMark();}
function palMark(){
  var its=document.querySelectorAll('#palList .pal-it');
  its.forEach(function(e,i){e.classList.toggle('sel',i===palSel);});
  if(its[palSel])its[palSel].scrollIntoView({block:'nearest'});
}
function palMove(d){if(!palRes.length)return;palSel=(palSel+d+palRes.length)%palRes.length;palMark();}
function palRun(i){var it=palRes[i];if(!it)return;closePalette();it.run();}

// ════════════ CENTRUM UPOZORNĚNÍ ════════════
var NOTIF_MAX=60;
function notifData(){var d=DB.get('notif_'+currentMemberId);return d&&d.items?d:{items:[],ids:[]};}
function notifSave(d){d.items=d.items.slice(0,NOTIF_MAX);d.ids=d.ids.slice(-800);DB.set('notif_'+currentMemberId,d);}
function notifSources(m){
  var out=[];
  var tasks=(DB.get('tasks')||{})[m.id]||[];
  tasks.forEach(function(t){out.push({id:'t_'+t.id,icon:'📋',title:'Nový úkol',text:t.title,go:['m','tasks'],ts:(parseCz(t.date)||new Date()).getTime()});});
  ((DB.get('messages')||{})[m.id]||[]).forEach(function(x){out.push({id:'m_'+x.id,icon:'💬',title:'Nová zpráva',text:x.subject,go:['m','messages'],ts:(parseCz(x.date)||new Date()).getTime()});});
  (DB.get('board')||[]).forEach(function(p){
    if(p.author===m.displayName)return;
    out.push({id:'b_'+p.id,icon:p.type==='urgent'?'🚨':'📣',title:p.type==='confirm'?'Oznámení k potvrzení':'Nové oznámení',text:p.title,go:['m','board'],ts:(parseCz(p.date)||new Date()).getTime()});
  });
  var now=Date.now();
  (DB.get('events')||[]).forEach(function(e){
    var d=evStart(e);if(!d)return;
    if(e.by!==m.id)out.push({id:'e_'+e.id,icon:'📅',title:'Nová akce',text:e.title+' — '+fmtEv(d),go:['m','calendar'],ts:now});
    var diff=d.getTime()-now;
    if(diff>-600000&&diff<3600000&&(e.rsvp||{})[m.id]!=='no')out.push({id:'rem_'+e.id,icon:'⏰',title:'Za chvíli začíná',text:e.title+' ('+untilStr(d)+')',go:['m','calendar'],ts:now});
  });
  if(m.adminAccess){
    (DB.get('heists')||[]).forEach(function(h){if(h.memberId!==m.id)out.push({id:'h_'+h.id,icon:h.escaped?'💎':'❌',title:'Nový heist report',text:(h.memberName||'')+' — '+h.target,go:['a','heists'],ts:(parseCz(h.date)||new Date()).getTime()});});
    (DB.get('excuses')||[]).forEach(function(x){if(x.memberId!==m.id&&x.status==='pending')out.push({id:'x_'+x.id,icon:'📝',title:'Nová omluvenka',text:(x.memberName||'')+(x.event?' — '+x.event:''),go:['a','excuses'],ts:(parseCz(x.submitted)||new Date()).getTime()});});
    (DB.get('reports')||[]).forEach(function(r){if(r.memberId!==m.id)out.push({id:'r_'+r.id,icon:'📢',title:'Nové hlášení',text:(r.memberName||'')+': '+String(r.body||'').slice(0,60),go:['a','reports'],ts:(parseCz(r.date)||new Date()).getTime()});});
    (DB.get('incomes')||[]).forEach(function(i){if(i.memberId!==m.id&&i.status==='pending')out.push({id:'i_'+i.id,icon:'💰',title:'Příjem ke schválení',text:(i.memberName||'')+' — $'+i.amount,go:['a','incomes'],ts:(parseCz(i.date)||new Date()).getTime()});});
  }
  return out;
}
function notifSync(){
  var m=getMember();if(!m||m.panic)return;
  var raw=DB.get('notif_'+m.id);var first=!raw;
  var d=(raw&&raw.items)?raw:{items:[],ids:[]};
  var known={};d.ids.forEach(function(i){known[i]=1;});
  var fresh=notifSources(m).filter(function(s){return !known[s.id];});
  if(fresh.length){
    fresh.forEach(function(s){
      d.ids.push(s.id);
      d.items.push({id:s.id,icon:s.icon,title:s.title,text:s.text,go:s.go,ts:s.ts,read:first});
    });
    d.items.sort(function(a,b){return b.ts-a.ts;});
    notifSave(d);
    if(!first){
      if(fresh.length<=3)fresh.forEach(function(f){toast('🔔 '+f.title+': '+f.text,'info',4500);});
      else toast('🔔 '+fresh.length+' nových upozornění','info',4500);
      notifBeep();
    }
  }
  notifRender();
}
function notifBeep(){
  if(lsGet('tsc_mute')==='1')return;
  try{
    var C=window.AudioContext||window.webkitAudioContext;if(!C)return;
    var ac=window._tscAC||(window._tscAC=new C());
    if(ac.state==='suspended')ac.resume();
    [660,880].forEach(function(f,i){
      var o=ac.createOscillator(),g=ac.createGain();o.type='sine';o.frequency.value=f;o.connect(g);g.connect(ac.destination);
      var t=ac.currentTime+i*.14;
      g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(.12,t+.02);g.gain.exponentialRampToValueAtTime(.0001,t+.2);
      o.start(t);o.stop(t+.22);
    });
  }catch(e){}
}
function notifRender(){
  if(!currentMemberId)return;
  var d=notifData();var un=d.items.filter(function(i){return !i.read;}).length;
  document.querySelectorAll('.bell-n').forEach(function(b){b.textContent=un>9?'9+':un;b.classList.toggle('on',un>0);});
  document.querySelectorAll('.bell').forEach(function(b){b.classList.toggle('ring',un>0);});
  document.title=(un?'('+un+') ':'')+'THE STRIKERS CREW';
  var p=document.getElementById('notifPanel');if(!p)return;
  var mute=lsGet('tsc_mute')==='1';
  p.innerHTML='<div class="np-head"><span>// UPOZORNĚNÍ</span><span class="np-act"><button onclick="notifToggleSound()" title="Zvuk">'+(mute?'🔇':'🔊')+'</button><button onclick="notifReadAll()">PŘEČTENO</button><button onclick="notifClear()">VYMAZAT</button></span></div>'+
    '<div class="np-list">'+(d.items.length?d.items.slice(0,40).map(function(n,i){
      return '<div class="np-it'+(n.read?'':' un')+'" onclick="notifGo('+i+')"><span class="np-ic">'+esc(n.icon)+'</span><div class="np-tx"><div class="np-t">'+esc(n.title)+'</div><div class="np-s">'+esc(n.text||'')+'</div></div><span class="np-ago">'+agoStr(n.ts)+'</span></div>';
    }).join(''):'<div class="empty-s">// Žádná upozornění</div>')+'</div>';
}
function toggleNotif(e){
  if(e)e.stopPropagation();
  injectUX();
  var p=document.getElementById('notifPanel');
  if(p.classList.contains('open'))closeNotif();
  else{notifRender();p.classList.add('open');}
}
function closeNotif(){
  var p=document.getElementById('notifPanel');if(!p||!p.classList.contains('open'))return;
  p.classList.remove('open');notifReadAll(true);
}
function notifReadAll(silent){
  var d=notifData();var ch=false;
  d.items.forEach(function(i){if(!i.read){i.read=true;ch=true;}});
  if(ch)notifSave(d);
  notifRender();
}
function notifClear(){var d=notifData();d.items=[];notifSave(d);notifRender();}
function notifToggleSound(){
  var mute=lsGet('tsc_mute')==='1';lsSet('tsc_mute',mute?'0':'1');
  if(mute)notifBeep();
  notifRender();
}
function notifGo(i){
  var d=notifData();var n=d.items[i];if(!n)return;
  if(!n.read){n.read=true;notifSave(d);}
  var p=document.getElementById('notifPanel');if(p)p.classList.remove('open');
  notifRender();
  if(n.go)goTo(n.go[0],n.go[1]);
}

// ════════════ KALENDÁŘ AKCÍ ════════════
var calMonth=null,calSel=null;
var EV_TYPES={heist:['HEIST','#c0392b'],meeting:['SCHŮZKA','#4a90d9'],training:['TRÉNINK','#27ae60'],other:['JINÉ','#c49a14']};
var DAYS_CZ=['Ne','Po','Út','St','Čt','Pá','So'];
var MONTHS_CZ=['Leden','Únor','Březen','Duben','Květen','Červen','Červenec','Srpen','Září','Říjen','Listopad','Prosinec'];
function pad2(n){return ('0'+n).slice(-2);}
function evStart(e){var r=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(e&&e.start||'');return r?new Date(+r[1],+r[2]-1,+r[3],+r[4],+r[5]):null;}
function ymd(d){return d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate());}
function fmtEv(d){return DAYS_CZ[d.getDay()]+' '+d.getDate()+'. '+(d.getMonth()+1)+'. '+d.getFullYear()+' · '+pad2(d.getHours())+':'+pad2(d.getMinutes());}
function untilStr(d){
  var ms=d.getTime()-Date.now();
  if(ms<0)return ms>-7200000?'probíhá':'proběhlo';
  var mi=Math.round(ms/60000);if(mi<60)return 'za '+mi+' min';
  var h=Math.round(mi/60);if(h<48)return 'za '+h+' h';
  return 'za '+Math.round(h/24)+' dní';
}
function evCard(e,scope,m,members){
  var t=EV_TYPES[e.type]||EV_TYPES.other,d=evStart(e),r=e.rsvp||{},mine=r[m.id];
  var names=function(v){return members.filter(function(x){return r[x.id]===v;}).map(function(x){return esc(x.displayName);});};
  var yes=names('yes'),mb=names('maybe'),no=names('no');
  var pending=members.length-yes.length-mb.length-no.length;
  var past=d.getTime()<Date.now()-2*3600000;
  return '<div class="ev-card" style="border-left-color:'+t[1]+'">'+
    '<div class="ev-top"><span class="ev-type" style="color:'+t[1]+';border-color:'+t[1]+'">'+t[0]+'</span><span class="ev-when">'+fmtEv(d)+'</span><span class="ev-until">'+untilStr(d)+'</span>'+
    (scope==='a'?'<button class="btn-micro del" style="margin-left:auto" onclick="delEvent(\''+e.id+'\')">✕</button>':'')+'</div>'+
    '<div class="ev-title">'+esc(e.title)+'</div>'+
    (e.place?'<div class="ev-meta">📍 '+esc(e.place)+'</div>':'')+
    (e.note?'<div class="ev-note">'+esc(e.note)+'</div>':'')+
    (past?'':'<div class="ev-rsvp">'+[['yes','✓ ZÚČASTNÍM SE'],['maybe','? MOŽNÁ'],['no','✕ NEMOHU']].map(function(p){
      return '<button class="rsvp '+p[0]+(mine===p[0]?' on':'')+'" onclick="rsvpEvent(\''+e.id+'\',\''+p[0]+'\')">'+p[1]+'</button>';}).join('')+'</div>')+
    '<div class="ev-who">'+
      '<div><b class="y">✓ '+yes.length+'</b> '+(yes.join(', ')||'—')+'</div>'+
      (mb.length?'<div><b class="m">? '+mb.length+'</b> '+mb.join(', ')+'</div>':'')+
      (no.length?'<div><b class="n">✕ '+no.length+'</b> '+no.join(', ')+'</div>':'')+
      '<div class="ev-pend">bez odpovědi: '+pending+'</div>'+
    '</div></div>';
}
function renderCalendar(scope){
  var el=document.getElementById('calBody'+(scope==='a'?'A':'M'));if(!el)return;
  var m=getMember();if(!m)return;
  if(scope==='a'){var ed=document.getElementById('evDate');if(ed&&!ed.value)ed.value=ymd(new Date());}
  var members=DB.get('members')||[];
  var evs=(DB.get('events')||[]).filter(function(e){return evStart(e);}).sort(function(x,y){return evStart(x)-evStart(y);});
  if(!calMonth){var n=new Date();calMonth=new Date(n.getFullYear(),n.getMonth(),1);}
  var y=calMonth.getFullYear(),mo=calMonth.getMonth();
  var offset=(new Date(y,mo,1).getDay()+6)%7,days=new Date(y,mo+1,0).getDate();
  var byDay={};evs.forEach(function(e){var k=ymd(evStart(e));(byDay[k]=byDay[k]||[]).push(e);});
  var todayK=ymd(new Date()),cells='';
  for(var i=0;i<offset;i++)cells+='<div class="cal-d empty"></div>';
  for(var d=1;d<=days;d++){
    var k=y+'-'+pad2(mo+1)+'-'+pad2(d),de=byDay[k]||[];
    cells+='<div class="cal-d'+(k===todayK?' today':'')+(k===calSel?' sel':'')+(de.length?' has':'')+'" onclick="calPick(\''+k+'\',\''+scope+'\')"><span class="cal-n">'+d+'</span><span class="cal-dots">'+
      de.slice(0,4).map(function(e){return '<i style="background:'+(EV_TYPES[e.type]||EV_TYPES.other)[1]+'"></i>';}).join('')+'</span></div>';
  }
  var grid='<div class="cal-grid-wrap"><div class="cal-head"><button class="btn-micro" onclick="calNav(-1,\''+scope+'\')">‹</button><span class="cal-mt">'+MONTHS_CZ[mo].toUpperCase()+' '+y+'</span><button class="btn-micro" onclick="calNav(1,\''+scope+'\')">›</button><button class="btn-micro" onclick="calToday(\''+scope+'\')">DNES</button></div>'+
    '<div class="cal-grid">'+['PO','ÚT','ST','ČT','PÁ','SO','NE'].map(function(x){return '<div class="cal-wd">'+x+'</div>';}).join('')+cells+'</div>'+
    '<div class="cal-legend">'+Object.keys(EV_TYPES).map(function(k){return '<span><i style="background:'+EV_TYPES[k][1]+'"></i>'+EV_TYPES[k][0]+'</span>';}).join('')+'</div></div>';
  var now=Date.now(),html='';
  if(calSel){
    var p=calSel.split('-');
    html+='<div class="sh">// AKCE — '+(+p[2])+'. '+(+p[1])+'. '+p[0]+' <a class="cal-clear" onclick="calPick(null,\''+scope+'\')">× zrušit výběr</a></div>';
    var l=byDay[calSel]||[];
    html+=l.length?l.map(function(e){return evCard(e,scope,m,members);}).join(''):'<div class="empty-s">// Tento den nic neplánujeme</div>';
  }else{
    var up=evs.filter(function(e){return evStart(e).getTime()>=now-2*3600000;});
    var pastL=evs.filter(function(e){return evStart(e).getTime()<now-2*3600000;}).slice(-5).reverse();
    html+='<div class="sh">// NADCHÁZEJÍCÍ AKCE ('+up.length+')</div>';
    html+=up.length?up.map(function(e){return evCard(e,scope,m,members);}).join(''):'<div class="empty-s">// Žádné naplánované akce</div>';
    if(pastL.length)html+='<div class="sh">// PROBĚHLÉ</div><div class="ev-past">'+pastL.map(function(e){return evCard(e,scope,m,members);}).join('')+'</div>';
  }
  el.innerHTML='<div class="cal-layout">'+grid+'<div class="ev-list">'+html+'</div></div>';
}
function calNav(dir,scope){calMonth=new Date(calMonth.getFullYear(),calMonth.getMonth()+dir,1);calSel=null;renderCalendar(scope);}
function calToday(scope){var n=new Date();calMonth=new Date(n.getFullYear(),n.getMonth(),1);calSel=null;renderCalendar(scope);}
function calPick(k,scope){calSel=(k===null||calSel===k)?null:k;renderCalendar(scope);}
function rsvpEvent(id,val){
  var m=getMember();if(!m)return;
  var evs=DB.get('events')||[];var e=evs.find(function(x){return x.id===id;});if(!e)return;
  e.rsvp=e.rsvp||{};
  if(e.rsvp[m.id]===val)delete e.rsvp[m.id];else e.rsvp[m.id]=val;
  DB.set('events',evs);
  renderCalendar('m');renderCalendar('a');
  toast(e.rsvp[m.id]?'Odpověď uložena':'Odpověď zrušena','success');
}
function addEvent(){
  var m=getMember();if(!m||!m.adminAccess)return;
  var title=document.getElementById('evTitle').value.trim();
  var type=document.getElementById('evType').value;
  var date=document.getElementById('evDate').value;
  var time=document.getElementById('evTime').value;
  var place=document.getElementById('evPlace').value.trim();
  var note=document.getElementById('evNote').value.trim();
  var st=document.getElementById('evStatus');
  if(!title||!date||!time){st.style.color='var(--red)';st.textContent='// VYPLŇTE NÁZEV, DATUM A ČAS';return;}
  var evs=DB.get('events')||[];
  evs.push({id:uid(),title:title,type:type,start:date+'T'+time,place:place,note:note,by:m.id,byName:m.displayName,rsvp:{}});
  DB.set('events',evs);
  var d=evStart(evs[evs.length-1]);
  var tp=EV_TYPES[type]||EV_TYPES.other;
  addLog('cal',m.displayName+' naplánoval akci "'+title+'" ('+fmtEv(d)+').',{embed:rich(parseInt(tp[1].slice(1),16),'📅 NOVÁ AKCE V KALENDÁŘI','**'+title+'**',[
    ['🏷 Typ',tp[0]],['🕒 Kdy',fmtEv(d)],['📍 Místo',place||'neuvedeno'],['🧑 Naplánoval',m.displayName],['📝 Poznámka',note,false]],{by:m.displayName})});
  ['evTitle','evPlace','evNote'].forEach(function(i){document.getElementById(i).value='';});
  st.style.color='';st.textContent='// AKCE NAPLÁNOVÁNA';setTimeout(function(){st.textContent='';},2500);
  toast('Akce naplánována','success');
  renderCalendar('a');renderCalendar('m');
}
function delEvent(id){
  if(!confirm('Smazat tuto akci?'))return;
  DB.set('events',(DB.get('events')||[]).filter(function(e){return e.id!==id;}));
  toast('Akce smazána','info');renderCalendar('a');renderCalendar('m');
}

// ════════════ STATISTIKY (admin) ════════════
var statsRange='all';
function inRange(d){
  if(statsRange==='all')return true;
  if(!d)return false;
  return Date.now()-d.getTime()<=(+statsRange)*86400000;
}
function stUsd(n){return '$'+Number(n||0).toLocaleString('cs-CZ');}
function stK(n){return n>=1000?(Math.round(n/100)/10)+'k':String(n);}
function stBars(rows,fmt){
  if(!rows.length)return '<div class="empty-s">// Žádná data</div>';
  var max=Math.max.apply(null,rows.map(function(r){return r.v;}).concat([1]));
  return '<div class="st-bars">'+rows.map(function(r){
    return '<div class="st-br"><span class="st-bl" title="'+esc(r.l)+'">'+esc(r.l)+'</span><div class="st-bt"><div class="st-bf '+(r.c||'')+'" style="width:'+Math.max(2,r.v/max*100)+'%"></div></div><span class="st-bv">'+(fmt?fmt(r.v):r.v)+(r.x?'<small>'+esc(r.x)+'</small>':'')+'</span></div>';
  }).join('')+'</div>';
}
function stDonut(ok,bad){
  var t=ok+bad,C=2*Math.PI*40,a=t?ok/t*C:0;
  return '<svg viewBox="0 0 120 120" class="st-donut"><circle cx="60" cy="60" r="40" fill="none" stroke="#c0392b" stroke-width="16" opacity="'+(t?1:.15)+'"/>'+
    '<circle cx="60" cy="60" r="40" fill="none" stroke="#27ae60" stroke-width="16" stroke-dasharray="'+a+' '+(C-a)+'" transform="rotate(-90 60 60)"/>'+
    '<text x="60" y="60" text-anchor="middle" class="st-dt">'+(t?Math.round(ok/t*100):0)+'%</text><text x="60" y="76" text-anchor="middle" class="st-ds">ÚSPĚCH</text></svg>';
}
function stCols(cols,c1,c2){
  var W=320,H=150,pb=22,pt=16,n=cols.length,bw=Math.min(28,(W-20)/n*.6),gap=(W-n*bw)/(n+1);
  var max=Math.max.apply(null,cols.map(function(c){return c.a+(c.b||0);}).concat([1])),sc=(H-pb-pt)/max,y0=H-pb;
  var s='<svg viewBox="0 0 '+W+' '+H+'" class="st-cols"><line x1="0" y1="'+y0+'" x2="'+W+'" y2="'+y0+'" stroke="#2e2e2e"/>';
  cols.forEach(function(c,i){
    var x=gap+i*(bw+gap),ha=c.a*sc,hb=(c.b||0)*sc,tot=c.a+(c.b||0);
    if(c.a)s+='<rect x="'+x+'" y="'+(y0-ha)+'" width="'+bw+'" height="'+ha+'" fill="'+c1+'"/>';
    if(c.b)s+='<rect x="'+x+'" y="'+(y0-ha-hb)+'" width="'+bw+'" height="'+hb+'" fill="'+c2+'"/>';
    if(tot)s+='<text x="'+(x+bw/2)+'" y="'+(y0-ha-hb-3)+'" text-anchor="middle" class="st-cv">'+(c.t!==undefined?c.t:tot)+'</text>';
    s+='<text x="'+(x+bw/2)+'" y="'+(H-6)+'" text-anchor="middle" class="st-cl">'+esc(c.l)+'</text>';
  });
  return s+'</svg>';
}
function lastWeeks(n){
  var out=[],now=Date.now();
  for(var i=n-1;i>=0;i--){var d=new Date(now-i*7*86400000),k=weekKeyOf(d);if(!out.length||out[out.length-1].k!==k)out.push({k:k,l:'T'+k.split('W')[1]});}
  return out;
}
function renderStats(){
  var el=document.getElementById('statsBody');if(!el)return;
  var members=DB.get('members')||[];
  var allHeists=DB.get('heists')||[];
  var heists=allHeists.filter(function(h){return inRange(parseCz(h.date));});
  var fin=DB.get('finance')||{payments:[],expenses:[]};
  var incAll=(DB.get('incomes')||[]).filter(function(i){return i.status==='confirmed';});
  var payAll=fin.payments||[];
  var pay=payAll.filter(function(p){return inRange(parseCz(p.date));});
  var inc=incAll.filter(function(i){return inRange(parseCz(i.date));});
  var ok=heists.filter(function(h){return h.escaped;}).length,tot=heists.length,bad=tot-ok;
  var sum=function(a){return a.reduce(function(s,x){return s+(+x.amount||0);},0);};
  var money=sum(pay)+sum(inc),expenses=sum(fin.expenses||[]);
  var kpi='<div class="dash st-kpi">'+
    dashCard('💎','HEISTY',tot,ok+' úspěšných / '+bad+' neúspěšných','')+
    dashCard('🎯','ÚSPĚŠNOST',(tot?Math.round(ok/tot*100):0)+'%',tot?'ujeli vs. neujeli':'zatím žádná data',tot&&ok/tot<.5?'warn':'ok')+
    dashCard('💰','PŘÍJMY',stUsd(money),'příspěvky + schválené příjmy','')+
    dashCard('🧾','VÝDAJOVÉ POLOŽKY',stUsd(expenses),'součet všech položek','')+'</div>';
  // týdenní grafy (vždy posledních 8 týdnů, bez ohledu na období)
  var wks=lastWeeks(8),hw={},iw={};
  allHeists.forEach(function(h){var d=parseCz(h.date);if(!d)return;var k=weekKeyOf(d);hw[k]=hw[k]||{a:0,b:0};if(h.escaped)hw[k].a++;else hw[k].b++;});
  payAll.forEach(function(p){var k=p.weekKey;if(!k)return;iw[k]=(iw[k]||0)+(+p.amount||0);});
  incAll.forEach(function(i){var d=parseCz(i.date);if(!d)return;var k=weekKeyOf(d);iw[k]=(iw[k]||0)+(+i.amount||0);});
  var heistCols=wks.map(function(w){var v=hw[w.k]||{a:0,b:0};return {l:w.l,a:v.a,b:v.b};});
  var incCols=wks.map(function(w){var v=iw[w.k]||0;return {l:w.l,a:v,b:0,t:stK(v)};});
  // cíle
  var tg={};
  heists.forEach(function(h){var k=String(h.target||'?').split(' — ')[0];tg[k]=tg[k]||{n:0,ok:0};tg[k].n++;if(h.escaped)tg[k].ok++;});
  var tRows=Object.keys(tg).map(function(k){return {l:k,v:tg[k].n,x:' · '+Math.round(tg[k].ok/tg[k].n*100)+'%'};}).sort(function(a,b){return b.v-a.v;}).slice(0,6);
  // členové
  var tasks=DB.get('tasks')||{};
  var rows=members.map(function(x){
    var hc=heists.filter(function(h){return heistParticipated(h,x.id);}).length;
    var led=heists.filter(function(h){return h.memberId===x.id;}).length;
    var tl=tasks[x.id]||[],td=tl.filter(function(t){return t.done;}).length;
    var mny=sum(pay.filter(function(p){return p.memberId===x.id;}))+sum(inc.filter(function(i){return i.memberId===x.id;}));
    var seen=DB.cache['seen_'+x.id];
    return {n:x.displayName,pos:x.position,hc:hc,led:led,td:td,tt:tl.length,mny:mny,seen:(typeof seen==='number')?seen:0};
  }).sort(function(a,b){return b.hc-a.hc||b.mny-a.mny;});
  var earners=rows.filter(function(r){return r.mny>0;}).sort(function(a,b){return b.mny-a.mny;}).slice(0,8).map(function(r){return {l:r.n,v:r.mny,c:'gold'};});
  var hLead=rows.filter(function(r){return r.hc>0;}).slice(0,8).map(function(r){return {l:r.n,v:r.hc};});
  var table='<div class="st-table-wrap"><table class="st-table"><thead><tr><th>ČLEN</th><th>HODNOST</th><th>HEISTY (ÚČAST)</th><th>VEDL</th><th>ÚKOLY</th><th>PŘÍJMY</th><th>NAPOSLED</th></tr></thead><tbody>'+
    rows.map(function(r){
      var on=r.seen&&Date.now()-r.seen<PRESENCE_MS;
      return '<tr><td data-l="Člen">'+esc(r.n)+'</td><td data-l="Hodnost">'+esc(r.pos)+'</td><td data-l="Heisty">'+r.hc+'</td><td data-l="Vedl">'+r.led+'</td><td data-l="Úkoly">'+r.td+' / '+r.tt+'</td><td data-l="Příjmy">'+stUsd(r.mny)+'</td><td data-l="Naposledy">'+(on?'<span class="st-on">● online</span>':(r.seen?agoStr(r.seen):'—'))+'</td></tr>';
    }).join('')+'</tbody></table></div>';
  var box=function(t,b){return '<div class="st-box"><div class="st-bt-title">'+t+'</div>'+b+'</div>';};
  el.innerHTML=kpi+
    '<div class="st-grid">'+
      box('// ÚSPĚŠNOST HEISTŮ',tot?'<div class="st-donut-wrap">'+stDonut(ok,bad)+'<div class="st-leg"><div><i style="background:#27ae60"></i>Ujeli: <b>'+ok+'</b></div><div><i style="background:#c0392b"></i>Neujeli: <b>'+bad+'</b></div></div></div>':'<div class="empty-s">// Žádné heisty v tomto období</div>')+
      box('// HEISTY PO TÝDNECH <small>(zelená = úspěch, červená = neúspěch)</small>',stCols(heistCols,'#27ae60','#c0392b'))+
      box('// NEJČASTĚJŠÍ CÍLE <small>(počet · úspěšnost)</small>',stBars(tRows))+
      box('// PŘÍJMY PO TÝDNECH',stCols(incCols,'#c49a14','#c49a14'))+
      box('// NEJVÍCE HEISTŮ',stBars(hLead))+
      box('// NEJVÍCE PŘISPĚLI',stBars(earners,stUsd))+
    '</div>'+
    '<div class="sh">// AKTIVITA ČLENŮ</div>'+table;
}

// ── START ──────────────────────────────────────
window.addEventListener('DOMContentLoaded',function(){
  startClock();
  if(!window.supabase||SUPABASE_ANON_KEY.indexOf('VLOŽ')===0){
    showLoginBox();
    setText('loginErr','// DOPLŇ SUPABASE_ANON_KEY NA ZAČÁTKU app.js');
    return;
  }
  sb=window.supabase.createClient(SUPABASE_URL,SUPABASE_ANON_KEY);
  sb.auth.getSession().then(function(r){
    var s=r.data&&r.data.session;
    if(s){return enterPortal(s,false).then(function(ok){if(!ok)showLoginBox();});}
    showLoginBox();
  }).catch(function(e){console.error(e);showLoginBox();});
});
