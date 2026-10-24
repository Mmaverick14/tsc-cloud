
/* ===== app.js ===== */
var SUPABASE_URL='https://cufbeahjechwpyvldztr.supabase.co';
var SUPABASE_ANON_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN1ZmJlYWhqZWNod3B5dmxkenRyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE2NjYwNjAsImV4cCI6MjEwNzI0MjA2MH0.CdFElIVzjhz6SRF__vypI8v9m3jghjtciWx62YkYCn4';
var TABLE='frakce_kv';
var sb=null;
var rtChannel=null;
var refreshTimer=null;

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
var BASE_CAT_KEYS=Object.keys(CAT);
function customCats(){return DB.get('whcats')||[];}
function syncCats(){
  var list=customCats();
  Object.keys(CAT).forEach(function(k){if(BASE_CAT_KEYS.indexOf(k)===-1)delete CAT[k];});
  list.forEach(function(c){CAT[c.key]=String(c.name).toUpperCase();});
  function has(k){return k==='all'||CAT[k]!==undefined;}
  if(!has(mWhCat))mWhCat='all';
  if(!has(aWhCat))aWhCat='all';
  if(typeof logCat!=='undefined'&&!has(logCat))logCat='all';
  // tlačítka filtrů
  [['#mt-warehouse .wh-filters','mWhFilter',function(){return mWhCat;},false,''],
   ['#at-warehouse .wh-filters','aWhFilter',function(){return aWhCat;},true,''],
   ['#logFilters','logFilter',function(){return typeof logCat!=='undefined'?logCat:'all';},false,'SKLAD: ']
  ].forEach(function(f){
    var host=document.querySelector(f[0]);if(!host)return;
    host.querySelectorAll('.wf-custom,.wf-add').forEach(function(n){n.remove();});
    list.forEach(function(c){
      var b=document.createElement('button');b.className='wf wf-custom'+(f[2]()===c.key?' active':'');
      b.appendChild(document.createTextNode(f[4]+CAT[c.key]));
      b.onclick=function(){window[f[1]](c.key,b);};
      if(f[3]){
        var x=document.createElement('span');x.className='wf-del';x.textContent=' ✕';x.title='Smazat kategorii';
        x.onclick=function(e){e.stopPropagation();delWhCat(c.key);};b.appendChild(x);
      }
      host.appendChild(b);
    });
    if(f[3]){
      var add=document.createElement('button');add.className='wf wf-add';add.textContent='+ KATEGORIE';
      add.onclick=addWhCat;host.appendChild(add);
    }
  });

  var sel=document.getElementById('wi-cat');
  if(sel){
    var cur=sel.value;
    sel.querySelectorAll('option.opt-custom').forEach(function(o){o.remove();});
    list.forEach(function(c){var o=document.createElement('option');o.className='opt-custom';o.value=c.key;o.textContent=c.name;sel.appendChild(o);});
    if(cur&&CAT[cur]!==undefined)sel.value=cur;
  }
}
function addWhCat(){
  var v=prompt('Název nové kategorie skladu:','');
  if(v===null)return;
  v=v.trim().replace(/\s+/g,' ');
  if(!v){toast('Název nesmí být prázdný','error');return;}
  if(v.length>24){toast('Název je příliš dlouhý (max. 24 znaků)','error');return;}
  var up=v.toUpperCase();
  if(Object.keys(CAT).some(function(k){return CAT[k]===up;})){toast('Taková kategorie už existuje','error');return;}
  var list=customCats().slice();var key='c_'+uid();
  list.push({key:key,name:v});DB.set('whcats',list);
  addLog('wh',rosterWho()+' vytvořil novou kategorii skladu: '+v,{plain:true,icon:'🗂'});
  toast('Kategorie "'+v+'" vytvořena','success');
  renderAdminWarehouse();renderMemberWarehouse();
}
function delWhCat(key){
  var list=customCats(),c=list.find(function(x){return x.key===key;});if(!c)return;
  var used=(DB.get('warehouse')||[]).filter(function(i){return i.cat===key;}).length;
  if(used){toast('Kategorie "'+c.name+'" obsahuje '+used+' položek — nejdřív je přesuň jinam','error',4000);return;}
  if(!confirm('Smazat kategorii "'+c.name+'"?'))return;
  DB.set('whcats',list.filter(function(x){return x.key!==key;}));
  addLog('wh',rosterWho()+' smazal kategorii skladu: '+c.name,{plain:true,icon:'🗂'});
  toast('Kategorie smazána','info');renderAdminWarehouse();renderMemberWarehouse();
}
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
  {key:'member_adm',label:'Správa členů (registrace, jména, pozice) — jen vlastní webhook, bez něj se neposílá'},
  {key:'roster',label:'Crew List (strike, povýšení)'},
  {key:'panic',label:'Panic'}
];
function sectionLabel(k){var s=SECTIONS.find(function(x){return x.key===k;});return s?s.label:k;}

var CAT_PINGS=[
  {key:'weapons',label:'Sklad — Zbraně'},{key:'ammo',label:'Sklad — Munice'},{key:'drugs',label:'Sklad — Drogy'},
  {key:'equipment',label:'Sklad — Vybavení'},{key:'vehicles',label:'Sklad — Vozidla'},{key:'other',label:'Sklad — Ostatní'}
];
function absImg(v){var s=imgSrc(v);if(!s)return '';try{return new URL(s,location.href).href;}catch(e){return '';}}

function pingTag(v){
  v=String(v||'').trim();if(!v)return '';
  if(/^@?(everyone|here)$/i.test(v))return '@'+v.replace('@','').toLowerCase();
  var m=v.match(/\d{5,}/);return m?'<@&'+m[0]+'>':'';
}

function whoName(jmeno,m){return String(jmeno).toLowerCase()===String(m.displayName).toLowerCase()?jmeno:jmeno+' ('+m.displayName+')';}
var LOG_ICONS={sys:'🔑',board:'📌',task:'✅',msg:'💬',wh:'📦',ev:'📤',boost:'🚗',heist:'💎',cloth:'👕',fin:'💰',excuse:'📝',excuse_dec:'📝',report:'📄',radio:'📻',member:'👤',roster:'🪪',panic:'🚨'};
// ── GRAFICKÉ ZÁPISY (embed) ──
function money(n){return '$'+Number(n||0).toLocaleString('cs-CZ');}
function clip(s,n){s=String(s==null?'':s);return s.length>n?s.slice(0,n-1)+'…':s;}

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
var LOG_COLORS={sys:0x95a5a6,board:0x3498db,task:0x2ecc71,msg:0x1abc9c,wh:0xe67e22,ev:0xe67e22,boost:0xe67e22,heist:0x27ae60,cloth:0xe91e63,fin:0xf1c40f,excuse:0xf1c40f,excuse_dec:0xf1c40f,report:0x9b59b6,radio:0x1abc9c,member:0x3498db,roster:0x3498db,panic:0xe74c3c,cal:0x3498db};
function memTag(m){return '**'+m.displayName+'**'+(m.discordId?' (<@'+m.discordId+'>)':'');}
var C_BLUE=0x3498db,C_ORANGE=0xe67e22,C_RED=0xe74c3c,C_GREEN=0x2ecc71,C_PURPLE=0x9b59b6,C_PINK=0xe91e63,C_YELLOW=0xf1c40f,C_TEAL=0x1abc9c,C_GREY=0x95a5a6;
function addLog(type,text,opts){
  var m=getMember();var actor=m?m.displayName:'Systém';
  var log=DB.get('syslog')||[];
  log.unshift({time:nowFull(),type:type,actor:actor,text:text,cat:(opts&&opts.pingCat)||''});
  if(log.length>500)log=log.slice(0,500);
  DB.set('syslog',log);
  if(opts&&opts.noDiscord)return;
  if(opts&&(opts.embedTitle||opts.embed)){sendToDiscord(type,opts.discordText||text,opts);return;}

  var o=opts||{};
  var ic=o.icon||LOG_ICONS[type]||'';
  var clean=String(text).replace(/Člen "([^"]+)"/g,'$1');
  var lab=(typeof LOG_LABELS!=='undefined'&&LOG_LABELS[type])||String(type).toUpperCase();
  var em={author:{name:(ic?ic+' ':'')+lab+(o.pingCat?' · '+(CAT[o.pingCat]||o.pingCat):'')},description:clean,color:LOG_COLORS[type]||C_GREY,footer:{text:nowStr()}};
  var th=o.img?absImg(o.img):'';if(th)em.thumbnail={url:th};
  var o2={};Object.keys(o).forEach(function(k){o2[k]=o[k];});o2.embed=em;
  sendToDiscord(o.hook?o.hook:type,(ic?ic+' ':'')+clean,o2);
}
function sendToDiscord(type,msg,opts){
  opts=opts||{};
  // logy správy členů mají vlastní sekci a nikdy nespadnou do hlavního webhooku
  if(type==='member'){type='member_adm';opts.private=true;}
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

  (function(){
    var oldCfg=DB.get('radioauto'),nw=DB.get('radioauto2');
    if(nw===null){
      if(oldCfg){nw=JSON.parse(JSON.stringify(oldCfg));delete nw.hold;nw.lastSlot=radioSlot(null,nw);nw.lastAt=Date.now();DB.set('radioauto2',nw);}
      else DB.setDefault('radioauto2',{on:true,salt:uid()+uid(),lastSlot:''});
    }
    if(oldCfg&&oldCfg.on!==false){oldCfg.on=false;DB.set('radioauto',oldCfg);} 
  })();
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

    m=members.find(function(x){return x.email&&x.email.toLowerCase()===(user.email||'').toLowerCase();});
    if(m){m.authId=user.id;DB.set('members',members);}
  }
  if(!m&&members.length===0){

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
  if(isFreshLogin&&!m.hidden)addLog('sys','Člen "'+m.displayName+'" se přihlásil.');
  document.getElementById('panicBtn').classList.remove('hidden');
  var adminBtn=document.getElementById('adminNavBtn');
  if(adminBtn)adminBtn.classList.toggle('hidden',!m.adminAccess);
  showScreen('memberScreen');
  mTab('board',document.querySelector('#memberScreen .nb'));
  startRealtime();
  setTimeout(radioTick,1500);
  return true;
}

// ── REALTIME (změny od ostatních členů se propíšou hned)
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
  if(ae&&/^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName))return;
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
  if(!m.hidden)addLog('sys','Člen "'+m.displayName+'" vstoupil do Administrace.');
  showScreen('adminScreen');
  aTab('board',document.querySelector('#adminScreen .nb'));
}

var PRESENCE_MS=5*60*1000,presenceTimer=null;
function scrollNavTo(btn){
  try{if(window.matchMedia('(max-width:700px)').matches){var sb=btn.closest('.sidebar');
    if(sb){sb.scrollTo({left:btn.offsetLeft-(sb.clientWidth-btn.offsetWidth)/2,behavior:'smooth'});}}}catch(e){}
}
function pingPresence(){var m=getMember();if(!m||m.hidden)return;DB.set('seen_'+m.id,Date.now());}
function startPresence(){pingPresence();clearInterval(presenceTimer);presenceTimer=setInterval(function(){pingPresence();notifSync();},120000);}
function stopPresence(){clearInterval(presenceTimer);presenceTimer=null;}
function onlineMembers(){
  var now=Date.now();
  return (DB.get('members')||[]).filter(function(x){
    if(x.hidden)return false;if(x.id===currentMemberId)return true;
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
  var members=(DB.get('members')||[]).filter(function(x){return !x.hidden;});
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
  var m=getMember();if(!m||m.hidden)return;
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
  if(fs.weeklyFee>0&&!m.hidden){
    var wk=getWeekKey();
    var payments=((DB.get('finance')||{}).payments||[]);
    var paid=payments.some(function(p){return p.memberId===m.id&&p.weekKey===wk;});
    var fb=document.getElementById('financeBadge');
    if(fb){if(!paid){fb.textContent='!';fb.classList.add('visible');}else fb.classList.remove('visible');}
  }
}

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

function renderMemberMessages(){
  var m=getMember();var msgs=DB.get('messages')||{};var myMsgs=msgs[m.id]||[];
  var el=document.getElementById('mMsgList');
  if(!myMsgs.length){el.innerHTML='<div class="empty-s">// Žádné zprávy</div>';return;}
  el.innerHTML=myMsgs.slice().reverse().map(function(msg){
    return '<div class="msg-card"><div class="msg-subject">'+esc(msg.subject)+'</div><div class="msg-body">'+esc(msg.body)+'</div><div class="msg-from">// OD: VEDENÍ'+(msg.from?' — '+esc(msg.from):'')+' — '+msg.date+'</div></div>';
  }).join('');
}

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
  syncCats();
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
  var members=(DB.get('members')||[]).filter(function(x){return !x.hidden;});
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

function renderMyFinance(){
  var m=getMember();if(!m)return;
  var fin=DB.get('finance')||{payments:[],expenses:[]};
  var fs=DB.get('finsettings')||{weeklyFee:5000};
  var wk=getWeekKey();
  var el=document.getElementById('myFinance');if(!el)return;
  var html='';
  if(fs.weeklyFee>0&&!m.hidden){
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

function renderAdminReports(){
  var reports=DB.get('reports')||[];
  var el=document.getElementById('aReports');
  if(!reports.length){el.innerHTML='<div class="empty-s">// Žádná hlášení</div>';return;}
  el.innerHTML=reports.slice().reverse().map(function(r){
    return '<div class="rep-card"><div class="rep-from">// OD: '+esc(r.memberName)+' — '+r.date+'<button class="btn-micro del" style="float:right" onclick="delReport(\''+r.id+'\')">✕</button></div><div class="rep-body">'+esc(r.body)+'</div></div>';
  }).join('');
}

function radioCardsHtml(f,withVedeni){
  var rows=[
    {label:'PRIMÁRNÍ',val:f.primary,color:'var(--acc)'},
    {label:'SEKUNDÁRNÍ',val:f.secondary,color:'#38bdd8'},
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
  var cfg=DB.get('radioauto2')||{};
  document.getElementById('rPrimary').value=radios.primary||'';
  document.getElementById('rSecondary').value=radios.secondary||'';
  document.getElementById('rAction').value=radios.action||'';
  document.getElementById('rVedeni').value=radios.vedeni||'';
  var rb=document.getElementById('rRegenBtn');if(rb)rb.style.display=canRegenRadios()?'':'none';
  var a=document.getElementById('rAuto');if(a)a.checked=!!cfg.on;
  var cur=currentRadios();
  var rc=document.getElementById('rCurrent');
  if(rc)rc.innerHTML='<div class="fa-exp-title">// AKTUÁLNĚ PLATÍ '+(cfg.on?'(AUTOMATICKY — slot '+radioSlotLabel(radioSlot())+')':'(RUČNĚ NASTAVENO)')+'</div>'+radioCardsHtml(cur,true);
  renderRadioTimes();
  var info=document.getElementById('rAutoInfo');
  if(info)info.textContent=cfg.on?'// AUTO je zapnuté pole níže se nepoužívají, platí frekvence z přehledu nahoře.':'';
}
function saveRadios(){
  var radios={
    primary:document.getElementById('rPrimary').value.trim(),
    secondary:document.getElementById('rSecondary').value.trim(),
    action:document.getElementById('rAction').value.trim(),
    vedeni:document.getElementById('rVedeni').value.trim()
  };
  DB.set('radios',radios);
  var cfg=DB.get('radioauto2')||{};
  if(!cfg.salt)cfg.salt=uid()+uid();
  var was=!!cfg.on;
  cfg.on=!!document.getElementById('rAuto').checked;
  if(cfg.on&&!was)cfg.lastSlot='';
  DB.set('radioauto2',cfg);
  var mm=getMember();var who=mm?mm.displayName:'Admin';
  addLog('radio','Admin aktualizoval frekvence vysílaček'+(cfg.on?' (automatická změna zapnuta: '+radioTimesText()+').':'.'),{embed:
    cfg.on?{title:'📻 Automatická změna frekvencí zapnuta',description:'Frekvence se budou měnit každý den v **'+radioTimesText()+'**.\nNastavil: **'+who+'**',color:0xc49a14,footer:{text:'Vysílačka'},timestamp:new Date().toISOString()}
          :radioEmbed('📻 Frekvence upraveny','Nové frekvence nastavil **'+who+'**.',radios)});
  setText('radioSaveStatus','// ULOŽENO');setTimeout(function(){setText('radioSaveStatus','');},2000);
  toast('Frekvence uloženy','success');
  renderAdminRadio();
  if(cfg.on)radioTick();
}

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

function genNewRadios(){
  var cfg=DB.get('radioauto2')||{};
  var f;
  if(cfg.on){
    cfg.salt=uid()+uid();cfg.lastSlot=radioSlot();
    DB.set('radioauto2',cfg);
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

var RADIO_DEF_TIMES=['15:00','17:00'];
function rtFmt(m){return String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');}
function rtParse(s){var p=/^(\d{1,2}):(\d{2})$/.exec(String(s||'').trim());if(!p)return null;var h=+p[1],m=+p[2];return(h>23||m>59)?null:h*60+m;}

function radioTimes(cfg){
  cfg=cfg||DB.get('radioauto2')||{};
  var src=(cfg.times&&cfg.times.length)?cfg.times:RADIO_DEF_TIMES,seen={},out=[];
  src.forEach(function(s){var m=rtParse(s);if(m!==null&&!seen[m]){seen[m]=1;out.push(m);}});
  if(!out.length)out=RADIO_DEF_TIMES.map(rtParse);
  return out.sort(function(x,y){return x-y;});
}
function radioTimesText(cfg){
  var t=radioTimes(cfg).map(rtFmt);
  return t.length>1?t.slice(0,-1).join(', ')+' a '+t[t.length-1]:t[0];
}

function radioTag(m){return m%60===0?String(m/60):rtFmt(m);}
function radioTagMin(tag){tag=String(tag);return tag.indexOf(':')>-1?rtParse(tag):(+tag)*60;}
function radioSlotLabel(slot){return rtFmt(radioTagMin(String(slot).split('-')[3]));}
function radioSlotStart(slot){var sp=String(slot).split('-');return new Date(+sp[0],+sp[1]-1,+sp[2],0,radioTagMin(sp[3]),0);}
function radioSlot(d,cfg){
  d=d||new Date();cfg=cfg||DB.get('radioauto2')||{};
  var ts=radioTimes(cfg),nowM=d.getHours()*60+d.getMinutes(),pick=-1;
  var base=new Date(d.getFullYear(),d.getMonth(),d.getDate());
  ts.forEach(function(t){if(t<=nowM)pick=t;});
  if(pick<0){base.setDate(base.getDate()-1);pick=ts[ts.length-1];}
  var s=base.getFullYear()+'-'+(base.getMonth()+1)+'-'+base.getDate()+'-'+radioTag(pick);

  if(cfg.hold&&cfg.hold.bad===s)s=cfg.hold.keep;
  return s;
}
function radioNextChange(){
  var ts=radioTimes(),n=new Date(),nm=n.getHours()*60+n.getMinutes(),t=null,day='dnes';
  for(var i=0;i<ts.length;i++){if(ts[i]>nm){t=ts[i];break;}}
  if(t===null){t=ts[0];day='zítra';}
  var at=new Date(n.getFullYear(),n.getMonth(),n.getDate()+(day==='zítra'?1:0),0,t,0);
  return {at:at,text:day+' v '+rtFmt(t)};
}
function hashStr(str){var h=1779033703^str.length;for(var i=0;i<str.length;i++){h=Math.imul(h^str.charCodeAt(i),3432918353);h=(h<<13)|(h>>>19);}return h>>>0;}
function rngFrom(seed){return function(){seed|=0;seed=seed+0x6D2B79F5|0;var t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
function autoRadios(cfg,slot){
  var r=rngFrom(hashStr((cfg.salt||'x')+'|'+slot));var used={},out=[];
  while(out.length<4){var n=((1000+Math.floor(r()*8991))/10).toFixed(1).replace('.',',');if(!used[n]){used[n]=1;out.push(n);}}
  return {primary:out[0],secondary:out[1],action:out[2],vedeni:out[3]};
}
function currentRadios(){
  var cfg=DB.get('radioauto2')||{};
  if(cfg.on)return autoRadios(cfg,radioSlot());
  return DB.get('radios')||{primary:'',secondary:'',action:'',vedeni:''};
}


var RADIO_MAX_TIMES=12;
function renderRadioTimes(){
  var host=document.getElementById('rTimes');if(!host)return;
  var ts=radioTimes();
  host.innerHTML='<div class="rt-lbl">ČASY ZMĚNY (každý den)</div><div class="rt-list">'+
    ts.map(function(t){return '<span class="rt-chip">'+rtFmt(t)+(ts.length>1?'<button type="button" title="Odebrat čas" onclick="delRadioTime('+t+')">✕</button>':'')+'</span>';}).join('')+
    '</div><div class="rt-add"><input type="time" id="rtNew" class="rt-in" step="60"/><button type="button" class="btn-acc small" onclick="addRadioTime()">+ PŘIDAT ČAS</button></div>'+
    '<div class="rt-hint">Čas se ukládá hned. Přidáš-li čas, který dnes už uběhl, začne platit až od zítřka aktuální frekvence se nezmění.</div>';
}
function changeRadioTimes(arr,msg){
  var cfg=DB.get('radioauto2')||{};
  var oldSlot=radioSlot(null,cfg);
  var next=JSON.parse(JSON.stringify(cfg));
  next.times=arr.map(rtFmt);delete next.hold;
  var newSlot=radioSlot(null,next);
  if(newSlot!==oldSlot)next.hold={bad:newSlot,keep:oldSlot};
  if(!next.salt)next.salt=uid()+uid();
  DB.set('radioauto2',next);
  addLog('radio',msg+' Časy změny: '+radioTimesText(next)+'.',{noDiscord:true});
  renderAdminRadio();
  var act=document.querySelector('#memberScreen.active .mt.active');
  if(act&&act.id==='mt-radio')renderMyRadio();
}
function addRadioTime(){
  var inp=document.getElementById('rtNew');var m=inp?rtParse(inp.value):null;
  if(m===null){toast('Zadej čas ve tvaru HH:MM','error');return;}
  var ts=radioTimes();
  if(ts.indexOf(m)!==-1){toast('Tenhle čas už tam je','error');return;}
  if(ts.length>=RADIO_MAX_TIMES){toast('Maximum je '+RADIO_MAX_TIMES+' časů denně','error');return;}
  ts.push(m);ts.sort(function(x,y){return x-y;});
  changeRadioTimes(ts,'Přidán čas automatické změny frekvencí '+rtFmt(m)+'.');
  toast('Čas '+rtFmt(m)+' přidán','success');
}
function delRadioTime(m){
  var ts=radioTimes();
  if(ts.length<=1){toast('Musí zůstat aspoň jeden čas','error');return;}
  ts=ts.filter(function(x){return x!==m;});
  changeRadioTimes(ts,'Odebrán čas automatické změny frekvencí '+rtFmt(m)+'.');
  toast('Čas '+rtFmt(m)+' odebrán','success');
}
var radioBusy=false;
async function radioTick(){
  if(!currentMemberId||!sb)return;
  var act=document.querySelector('#memberScreen.active .mt.active');
  if(act&&act.id==='mt-radio')renderMyRadio();
  var cfg=DB.get('radioauto2')||{};
  if(!cfg.on||radioBusy)return;
  var slot=radioSlot();
  if(cfg.lastSlot===slot)return;
  radioBusy=true;
  try{
    var r=await sb.from(TABLE).select('value').eq('key','radioauto2').maybeSingle();
    var fresh=(r.data&&r.data.value)||cfg;
    slot=radioSlot(null,fresh);
    if(fresh.lastSlot===slot){DB.cache.radioauto2=fresh;}
    else if(fresh.lastAt&&Date.now()-fresh.lastAt<600000){
      DB.cache.radioauto2=fresh;
      console.warn('radioTick: přebíjení slotu potlačeno',fresh.lastSlot,'vs',slot);
    }
    else{
      fresh.lastSlot=slot;fresh.lastAt=Date.now();DB.set('radioauto2',fresh);
      var f=autoRadios(fresh,slot);
      var hh=radioSlotLabel(slot);
      var start=radioSlotStart(slot);
      var lateMin=Math.round((Date.now()-start.getTime())/60000);
      var nowHM=new Date().toTimeString().slice(0,5);
      var note=lateMin>5?' (oznámeno až v **'+nowHM+'**, nikdo nebyl online)':'';
      addLog('radio','Automatická změna frekvencí ('+hh+(lateMin>5?', oznámeno v '+nowHM:'')+', build 20261019c) — Primární: '+f.primary+', Sekundární: '+f.secondary+', Akce: '+f.action+'.',
        {embed:radioEmbed('📻 Automatická změna frekvencí','Platí od **'+hh+'**'+note+' — předchozí frekvence už nefungují.',f)});
    }
  }catch(e){console.error(e);}
  radioBusy=false;
}

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
  addLog('member','Admin změnil heslo člena "'+m.displayName+'".',{embed:rich(C_ORANGE,'🔑 HESLO ZMĚNĚNO',memTag(m),[['🎖️ Hodnost',m.position]],{by:rosterWho()})});
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
  var hidden=!!document.getElementById('nm-hidden').checked;
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
  if(hidden&&!(me1&&me1.position==='Mastermind')){st.textContent='// SKRYTÝ ÚČET MŮŽE VYTVOŘIT JEN MASTERMIND';return;}
  if(members.find(function(m){return (m.email||'').toLowerCase()===email;})){st.textContent='// E-MAIL JIŽ EXISTUJE';return;}
  st.textContent='// VYTVÁŘÍM ÚČET...';
  var res;
  try{res=await adminApi({action:'create',email:email,password:pass,hidden:hidden});}
  catch(e){st.textContent='// CHYBA: '+e.message;return;}
  members=DB.get('members')||[];
  members.push({id:uid(),authId:res.authId,email:email,displayName:name,position:pos,adminAccess:admin||ADMIN_POS.indexOf(pos)!==-1,note:note,discordId:discordId,firstName:firstName,lastName:lastName,nick:nick,strikes:0,panic:false,hidden:hidden});
  DB.set('members',members);
  addLog('member','Admin registroval nového člena: "'+name+'" ('+pos+').',{embed:rich(C_GREEN,'🆕 NOVÝ ČLEN','**'+name+'**'+(discordId?' (<@'+discordId+'>)':''),[['🎖️ Hodnost',pos],['🛡 Admin přístup',(admin||ADMIN_POS.indexOf(pos)!==-1)?'Ano':'Ne'],['🏷 Přezdívka',nick||'—']],{by:rosterWho()})});
  st.textContent='// ČLEN REGISTROVÁN';
  setTimeout(function(){st.textContent='';},3000);
  ['nm-email','nm-name','nm-pass','nm-note','nm-discord','nm-first','nm-last','nm-nick'].forEach(function(i){document.getElementById(i).value='';});
  document.getElementById('nm-admin').checked=false;document.getElementById('nm-hidden').checked=false;
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
  addLog('member','Admin změnil jméno "'+old+'" na "'+name+'".',{embed:rich(C_BLUE,'✏️ ZMĚNA JMÉNA','**'+old+'** → **'+name+'**'+(m.discordId?' (<@'+m.discordId+'>)':''),[['🎖️ Hodnost',m.position]],{by:rosterWho()})});
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
  addLog('member','Admin změnil pozici "'+m.displayName+'" na "'+m.position+'".',{embed:rich(C_PURPLE,'🎖️ ZMĚNA POZICE',memTag(m),[['Původní',oldPos0],['➡️ Nová',m.position]],{by:rosterWho()})});
  toast('Pozice aktualizována','success');renderMemberGrid();
}
function toggleAdminAccess(id){
  var members=DB.get('members')||[];var m=members.find(function(x){return x.id===id;});if(!m)return;
  if(!canManage(m)){toast('Mastermind může spravovat jen Mastermind','error');return;}
  if(ADMIN_POS.indexOf(m.position)!==-1){toast('Mastermind, Overseer a Counselor mají admin napevno','error');return;}
  m.adminAccess=!m.adminAccess;DB.set('members',members);
  addLog('member','Admin '+(m.adminAccess?'přidělil':'odebral')+' admin přístup "'+m.displayName+'".',{embed:rich(m.adminAccess?C_GREEN:C_RED,m.adminAccess?'🛡 ADMIN PŘÍSTUP PŘIDĚLEN':'🛡 ADMIN PŘÍSTUP ODEBRÁN',memTag(m),[['🎖️ Hodnost',m.position]],{by:rosterWho()})});
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

function pingBox(id){
  var b=document.getElementById(id);
  if(!b||!b.checked)return '';
  b.checked=false;
  var s=DB.get('settings')||{};
  if(!s.memberRoleId){toast('V Nastavení chybí ID role Member','error',4000);return '';}
  return '<@&'+s.memberRoleId+'>';
}

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
  var mid=uid();var targets=target==='all'?members.filter(function(m){return !m.hidden;}).map(function(m){return m.id;}):[target];
  var fromName=getMember()?getMember().displayName:'';
  targets.forEach(function(tid){if(!msgs[tid])msgs[tid]=[];msgs[tid].push({id:mid,subject:subject,body:body,date:nowStr(),from:fromName});});
  DB.set('messages',msgs);
  addLog('msg','Admin odeslal zprávu "'+subject+'" — '+(target==='all'?'všem':'jednomu členovi')+'.'+(target==='all'?'\n'+body:''),{noPing:target!=='all',extraPing:joinPings(pingBox('ping-msg'),pickPing('pick-msg')),embed:rich(C_TEAL,'💬 NOVÁ ZPRÁVA','**'+subject+'**'+(target==='all'?'\n'+body:''),[['Komu',target==='all'?'Všichni členové':'Jeden člen']],{by:(getMember()?getMember().displayName:'Admin')})});
  document.getElementById('msgSubject').value='';document.getElementById('msgBody').value='';
  st.textContent='// ZPRÁVA ODESLÁNA';setTimeout(function(){st.textContent='';},2000);
  toast('Zpráva odeslána','success');renderAdminMessages();
}

var aWhCat='all';
function aWhFilter(cat,btn){
  aWhCat=cat;document.querySelectorAll('#at-warehouse .wf').forEach(function(b){b.classList.remove('active');});btn.classList.add('active');renderAdminWarehouse();
}
function renderAdminWarehouse(){
  syncCats();
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
        '<button class="btn-micro" title="Přejmenovat položku" onclick="renameItem(\''+item.id+'\')">✏️</button>'+
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
function renameItem(id){
  var items=DB.get('warehouse')||[];var item=items.find(function(i){return i.id===id;});if(!item)return;
  var v=prompt('Nový název položky:',item.name||'');
  if(v===null)return;
  v=v.trim();
  if(!v){toast('Název nesmí být prázdný','error');return;}
  if(v===item.name)return;
  var old=item.name;item.name=v;DB.set('warehouse',items);
  addLog('wh',rosterWho()+' přejmenoval položku: '+old+' → '+v,{img:item.img,pingCat:item.cat,plain:true,icon:'✏️'});
  toast('Položka přejmenována','success');renderAdminWarehouse();renderMemberWarehouse();
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

function cut(s,n){
  s=String(s);if(s.length<=n)return s;
  var c=s.slice(0,n),sp=c.lastIndexOf(' ');
  if(sp>n*0.6)c=c.slice(0,sp);
  return c.replace(/\s+$/,'')+'…';
}

function splitText(s,n){
  var out=[];s=String(s);
  while(s.length>n){
    var c=s.slice(0,n),sp=Math.max(c.lastIndexOf('\n'),c.lastIndexOf(' '));
    if(sp<n*0.6)sp=n;
    out.push(s.slice(0,sp));s=s.slice(sp).replace(/^\s+/,'');
  }
  out.push(s);return out;
}

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

var LOG_LABELS={roster:'CREW LIST',ev:'VÝDEJ',wh:'SKLAD',task:'ÚKOL',msg:'ZPRÁVA',member:'ČLEN',board:'NÁSTĚNKA',sys:'SYSTÉM',fin:'FINANCE',panic:'PANIC',boost:'BOOSTING',heist:'HEIST',cloth:'OBLEČENÍ',excuse:'OMLUVENKA',report:'HLÁŠENÍ',radio:'VYSÍLAČKA'};
var logCat='all';
function logFilter(cat,btn){
  logCat=cat;document.querySelectorAll('#logFilters .wf').forEach(function(b){b.classList.remove('active');});
  if(btn)btn.classList.add('active');renderLog();
}
function renderLog(){
  syncCats();
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

function radioInfoHtml(){
  var next=radioNextChange().text;
  return '<div class="radio-info"><b>⚠ ZMĚNA VYSÍLAČEK</b> Každý den v <b>'+radioTimesText()+'</b> proběhne změna vysílaček (frekvence 100,0–999,0). Nové frekvence se zobrazí tady.<div class="radio-info-next">// PŘÍŠTÍ ZMĚNA: '+next+'</div></div>';
}
function renderMyRadio(){
  var radios=currentRadios();
  var m=getMember();
  var vedeni=m&&isVedeni(m.position);
  var el=document.getElementById('radioDisplay');if(!el)return;
  var rows=[
    {label:'PRIMÁRNÍ',val:radios.primary,color:'var(--acc)'},
    {label:'SEKUNDÁRNÍ',val:radios.secondary,color:'#38bdd8'},
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

function renderAdminIncomes(){
  var incomes=DB.get('incomes')||[];
  var members=DB.get('members')||[];
  var el=document.getElementById('adminIncomePanel');if(!el)return;
  var confirmed=incomes.filter(function(i){return i.status==='confirmed';});
  var pending=incomes.filter(function(i){return i.status==='pending';});
  var totalKasa=confirmed.reduce(function(s,i){return s+i.amount;},0);
  var summary='<div class="inc-summary">'+
    '<div class="inc-sum-card"><div class="inc-sum-title">CELKEM V KASE</div><div class="inc-sum-val green">$'+totalKasa.toLocaleString('cs-CZ')+'</div></div>'+
    '<div class="inc-sum-card"><div class="inc-sum-title">ČEKÁ NA SCHVÁLENÍ</div><div class="inc-sum-val acc">'+pending.length+' záznamů</div></div>'+
  '</div>';

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
      '<div class="msg-body">'+esc(m.body)+'</div><div class="msg-from">// OD: '+esc(m.from||'VEDENÍ')+' · KOMU: '+esc(to)+' — '+m.date+'</div></div>';
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

function rosterNames(m){
  var f=(m.firstName||'').trim(),l=(m.lastName||'').trim();
  if(!f&&!l){var p=String(m.displayName||'').trim().split(/\s+/);f=p[0]||'';l=p.slice(1).join(' ');}
  return {first:f,last:l,nick:(m.nick||'').trim()};
}
var ROSTER_POS=['Mastermind','Overseer','Advisor'];
function canRoster(){var m=getMember();return !!m&&ROSTER_POS.indexOf(m.position)!==-1;}
function renderRoster(admin){
  var el=document.getElementById(admin?'rosterAdmin':'rosterMember');if(!el)return;
  var ctl=admin&&canRoster();
  var bar=ctl?'<div class="fp-ftr" style="margin-bottom:.8rem;"><button class="btn-acc small" onclick="sendRosterToDiscord()">📤 POSLAT NA DISCORD</button><span id="rosterSendStatus" class="smsg"></span></div>':'';
  var note=(admin&&!ctl)?'<div class="radio-info" style="margin-bottom:.8rem;">Strike a návrhy povýšení mohou spravovat jen <b>Mastermind, Overseer a Advisor</b>. Ty ostatní vidí přehled jen pro čtení.</div>':'';
  var members=(DB.get('members')||[]).filter(function(x){return !x.hidden;}).sort(function(a,b){
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

function sendRosterToDiscord(){
  if(!canRoster()){toast('Odeslat Crew List smí jen Mastermind, Overseer a Advisor','error');return;}
  var members=(DB.get('members')||[]).filter(function(x){return !x.hidden;}).sort(function(a,b){
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

SECTIONS.push({key:'cal',label:'Kalendář akcí'});
LOG_ICONS.cal='📅';LOG_LABELS.cal='KALENDÁŘ';

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
  var m=getMember();if(!m||m.panic||m.hidden)return;
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
  var hm=getMember();document.querySelectorAll('.bell').forEach(function(b){b.style.display=(hm&&hm.hidden)?'none':'';});
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

;

/* ===== upgrade.js ===== */
(function(){
window.recordPayment=function(id){
    var m=(DB.get('members')||[]).find(function(x){return x.id===id;});
    var fs=DB.get('finsettings')||{weeklyFee:5000},fin=DB.get('finance')||{payments:[],expenses:[]},wk=getWeekKey();
    if(!m)return;
    fin.payments.push({id:uid(),memberId:id,memberName:m.displayName,weekKey:wk,amount:fs.weeklyFee,date:nowStr(),note:'Týdenní příspěvek',expenseId:'weekly'});
    DB.set('finance',fin);
    addLog('fin','Admin evidoval platbu od "'+m.displayName+'" — $'+fs.weeklyFee+' ('+wk+').',{embed:rich(C_GREEN,'💰 PLATBA EVIDOVÁNA',null,[['👤 Člen',m.displayName],['💵 Částka',money(fs.weeklyFee)],['📅 Týden',wk]],{by:rosterWho()})});
    toast('Platba evidována','success');renderAdminFinance();
  };
  window.recordOptionalPayment2=function(mid,eid){
    var m=(DB.get('members')||[]).find(function(x){return x.id===mid;});
    var e=((DB.get('finance')||{}).expenses||[]).find(function(x){return x.id===eid;});
    if(m&&e)recordOptionalPayment(mid,m.displayName,eid,e.name,e.amount);
  };

  var MAX_MEMBERS=16;
  function memCount(){return (DB.get('members')||[]).filter(function(m){return !m.hidden;}).length;}
  var _rd=window.renderDash;
  window.renderDash=function(){
    _rd();
    var ea=document.getElementById('dashA');
    if(ea)ea.querySelectorAll('.dc').forEach(function(c){
      var lb=c.querySelector('.dc-lb');
      if(!lb||lb.textContent!=='ČLENOVÉ')return;
      var n=memCount(),v=c.querySelector('.dc-val'),s=c.querySelector('.dc-sub');
      if(v)v.innerHTML=n+'<small>/'+MAX_MEMBERS+'</small>';
      if(s)s.textContent=n>=MAX_MEMBERS?'frakce je plná':'max '+MAX_MEMBERS+' lidí';
      c.classList.toggle('warn',n>=MAX_MEMBERS);
    });
    document.querySelectorAll('.dc-val').forEach(function(el){
      var n=el.firstChild&&el.firstChild.nodeType===3?parseInt(el.firstChild.nodeValue,10):NaN;
      if(isNaN(n)||n<1||n>9999||el.dataset.v==String(n))return;
      el.dataset.v=n;var t0=performance.now();
      (function f(t){var k=Math.min(1,(t-t0)/600);el.firstChild.nodeValue=Math.round(n*(1-Math.pow(1-k,3)));if(k<1)requestAnimationFrame(f);})(t0);
    });
  };

  var _rl=window.renderLog;
  window.renderLog=function(){
    _rl();
    var box=document.getElementById('at-log');
    if(box&&!document.getElementById('logQ')){
      var i=document.createElement('input');i.id='logQ';i.className='wh-search log-search';i.placeholder='🔍 Hledat v logu (jméno, text)…';
      i.oninput=filterLog;box.querySelector('#logFilters').before(i);
    }
    filterLog();
  };
  function filterLog(){
    var q=normS((document.getElementById('logQ')||{}).value||'');
    document.querySelectorAll('#aLog .log-entry').forEach(function(e){e.style.display=!q||normS(e.textContent).indexOf(q)!==-1?'':'none';});
  }

  var _rs=window.renderSettings;
  window.renderSettings=function(){
    _rs();
    var m=getMember(),host=document.getElementById('panicList');
    if(!host||!m||m.position!=='Mastermind'||document.getElementById('bkBtn'))return;
    var p=document.createElement('div');p.className='form-panel';p.style.margin='0 1.2rem 1rem';
    p.innerHTML='<div class="fp-title">// ZÁLOHA DAT</div><div class="fp-ftr"><button id="bkBtn" class="btn-acc small">⬇ STÁHNOUT ZÁLOHU (JSON)</button></div>';
    host.parentNode.after(p);
    p.querySelector('button').onclick=function(){
      var out={};Object.keys(DB.cache).forEach(function(k){if(!/^(seen|notif)_/.test(k))out[k]=DB.cache[k];});
      var a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(out,null,1)],{type:'application/json'}));
      a.download='frakce-zaloha-'+new Date().toISOString().slice(0,10)+'.json';a.click();
      toast('Záloha stažena','success');
    };
  };

  var TH=[['Indigo','#5b7cfa','#4a62c8'],['Tyrkys','#14a38b','#0f7d6b'],['Zelená','#2f9e63','#237a4c'],['Růžová','#e2557f','#b53f64'],['Jantar','#d98a1f','#a96a12'],['Grafit','#7d8594','#5d6471']];
  function applyTheme(i){
    var t=TH[i]||TH[0],r=document.documentElement.style;
    r.setProperty('--acc',t[1]);r.setProperty('--acc-dim',t[2]);
    r.setProperty('--acc-glow',t[1]+'22');r.setProperty('--acc-dark',t[1]+'0d');
    lsSet('tsc_theme',String(i));
  }
  applyTheme(parseInt(lsGet('tsc_theme'))||0);
  function themePop(e){
    e.stopPropagation();
    var old=document.querySelector('.theme-pop');if(old){old.remove();return;}
    var r=e.currentTarget.getBoundingClientRect(),p=document.createElement('div');p.className='theme-pop';
    p.style.left=Math.max(8,Math.min(r.left,innerWidth-190))+'px';p.style.top=(r.bottom+6>innerHeight-60?r.top-50:r.bottom+6)+'px';
    var cur=parseInt(lsGet('tsc_theme'))||0;
    TH.forEach(function(t,i){var d=document.createElement('div');d.className='theme-dot'+(i===cur?' on':'');d.title=t[0];d.style.background=t[1];
      d.onclick=function(){applyTheme(i);p.remove();};p.appendChild(d);});
    document.body.appendChild(p);
    setTimeout(function(){document.addEventListener('click',function f(){p.remove();document.removeEventListener('click',f);});},0);
  }
  setInterval(function(){
    document.querySelectorAll('.sb-tools').forEach(function(w){
      if(w.querySelector('.theme'))return;
      var b=document.createElement('button');b.className='tb theme';b.title='Barevný motiv';b.textContent='🎨';b.onclick=themePop;w.appendChild(b);
    });
  },1000);

  var pill=document.createElement('div');pill.className='net-pill';pill.textContent='⚠ OFFLINE — změny se uloží po připojení';
  document.body.appendChild(pill);
  addEventListener('offline',function(){pill.classList.add('on');});
  addEventListener('online',function(){pill.classList.remove('on');toast('Připojeno ✓','success');if(window.DB)DB.flush();});
  if(!navigator.onLine)pill.classList.add('on');

  function tscDialog(o,onOk){
    var old=document.querySelector('.tsc-confirm');if(old)old.remove();
    var ov=document.createElement('div');ov.className='modal-ov tsc-confirm';
    ov.setAttribute('role','dialog');ov.setAttribute('aria-modal','true');
    ov.innerHTML='<div class="modal-box tsc-cbox'+(o.danger?' danger':'')+'">'+
      '<div class="modal-title">'+o.title+'</div>'+
      '<div class="tsc-ctext">'+o.text+'</div>'+
      (o.input?'<div class="iw tsc-iw"><span class="ip">&gt;_</span><input type="text" class="tsc-in"/></div>':'')+
      '<div class="modal-ftr"><button class="'+(o.danger?'btn-danger':'btn-acc small')+' tsc-ok">'+o.ok+'</button>'+
      (o.single?'':'<button class="btn-ghost small tsc-no">'+(o.cancel||'ZRUŠIT')+'</button>')+'</div></div>';
    document.body.appendChild(ov);
    var inp=ov.querySelector('.tsc-in'),okb=ov.querySelector('.tsc-ok'),nob=ov.querySelector('.tsc-no');
    if(inp)inp.value=o.value==null?'':String(o.value);
    function close(){document.removeEventListener('keydown',key,true);if(ov.parentNode)ov.parentNode.removeChild(ov);}
    function ok(){var v=inp?inp.value:undefined;close();if(onOk)onOk(v);}
    function key(e){
      if(e.key==='Escape'){e.stopPropagation();close();}
      else if(e.key==='Enter'&&inp&&e.target===inp){e.preventDefault();ok();}
    }
    okb.onclick=ok;
    if(nob)nob.onclick=close;
    ov.addEventListener('mousedown',function(e){if(e.target===ov&&!o.single)close();});
    document.addEventListener('keydown',key,true);
    (inp||(o.danger&&nob)||okb).focus();
    if(inp)inp.select();
  }
  window.tscDialog=tscDialog;

  function describe(msg){
    var m=String(msg||'');
    if(/PANIC/i.test(m))return {title:'⚠ AKTIVOVAT PANIC?',text:'Váš přístup bude <b>okamžitě zablokován</b> a změní se frekvence vysílaček.<br>Odemknout vás může jen Vedení.',ok:'AKTIVOVAT PANIC',danger:true};
    var del=/^(Smazat|Vymazat)/i.test(m),rem=/^Odebrat/i.test(m);
    if(del||rem)return {title:'⚠ '+(del?'SMAZAT?':'ODEBRAT?'),text:esc(m)+(del?'<div class="tsc-sub">Tuto akci nelze vrátit.</div>':''),ok:del?'SMAZAT':'ODEBRAT',danger:true};
    if(/^Povýšit/i.test(m))return {title:'🏅 POVÝŠENÍ',text:esc(m),ok:'POVÝŠIT'};
    if(/frekvence/i.test(m))return {title:'📻 NOVÉ FREKVENCE',text:esc(m),ok:'VYGENEROVAT'};
    return {title:'// POTVRZENÍ',text:esc(m),ok:'POTVRDIT'};
  }

  function wrapConfirm(name){
    var orig=window[name];if(typeof orig!=='function')return;
    window[name]=function(){
      var self=this,args=arguments,oc=window.confirm,asked=null,res;
      window.confirm=function(m){asked=m;return false;};
      try{res=orig.apply(self,args);}finally{window.confirm=oc;}
      if(asked===null)return res;
      var d=describe(asked);d.cancel='ZRUŠIT';
      tscDialog(d,function(){
        window.confirm=function(){return true;};
        try{orig.apply(self,args);}finally{window.confirm=oc;}
      });
    };
  }
  ['triggerPanic','delCloth','delExpense','delPayment','delPost','deleteItem','delBoost','delHeistTarget','delHeist','clearLog',
   'delTaskAdmin','delMsgAdmin','delExcuse','delReport','delIncome','deleteMember','regenRadios','approvePromo','delEvent','delWhCat'].forEach(wrapConfirm);

  function wrapPrompt(name,title){
    var orig=window[name];if(typeof orig!=='function')return;
    window[name]=function(){
      var self=this,args=arguments,op=window.prompt,asked=null;
      window.prompt=function(m,d){asked={m:m,d:d};return null;};
      try{orig.apply(self,args);}finally{window.prompt=op;}
      if(!asked)return;
      tscDialog({title:title,text:esc(asked.m),input:true,value:asked.d,ok:'ULOŽIT',cancel:'ZRUŠIT'},function(val){
        window.prompt=function(){return val;};
        try{orig.apply(self,args);}finally{window.prompt=op;}
      });
    };
  }
  wrapPrompt('setItemMin','🔔 LIMIT NÍZKÉ ZÁSOBY');
  wrapPrompt('changeItemImg','🖼 ZMĚNIT FOTO');
  wrapPrompt('renameItem','✏️ PŘEJMENOVAT POLOŽKU');
  wrapPrompt('addWhCat','🗂 NOVÁ KATEGORIE');

  window.alert=function(m){tscDialog({title:'// UPOZORNĚNÍ',text:esc(m),ok:'OK',single:true});};

  function fullDialog(){
    tscDialog({title:'⚠ FRAKCE JE PLNÁ',
      text:'Máme maximální počet lidí ve frakci — <b>'+memCount()+'/'+MAX_MEMBERS+'</b>.<br>Server dovoluje maximálně '+MAX_MEMBERS+' členů. Nového člena jde přidat, až někoho odebereš.',
      ok:'ROZUMÍM',single:true,danger:true});
  }
  var _cm=window.createMember;
  window.createMember=function(){
    if(!(document.getElementById('nm-hidden')||{}).checked&&memCount()>=MAX_MEMBERS){setText('createStatus','// FRAKCE JE PLNÁ ('+MAX_MEMBERS+'/'+MAX_MEMBERS+')');fullDialog();return;}
    return _cm.apply(this,arguments);
  };
  var _tn=window.toggleNewMember;
  window.toggleNewMember=function(){
    var p=document.getElementById('newMemberPanel');
    return _tn.apply(this,arguments);
  };
  var _rmg=window.renderMemberGrid;
  window.renderMemberGrid=function(){
    _rmg();
    var host=document.getElementById('memberGrid');if(!host)return;
    var bar=document.getElementById('capBar');
    if(!bar){bar=document.createElement('div');bar.id='capBar';host.parentNode.insertBefore(bar,host);}
    var n=memCount(),left=MAX_MEMBERS-n,cls=left<=0?'full':(left<=2?'warn':'ok'),msg;
    if(left<=0)msg='🚫 <b>Frakce je plná — '+n+'/'+MAX_MEMBERS+'.</b> Server dovoluje maximálně '+MAX_MEMBERS+' lidí ve frakci. Nového člena jde přidat, až někoho odebereš.';
    else if(left<=2)msg='⚠ <b>Skoro plno — '+n+'/'+MAX_MEMBERS+'.</b> Server dovoluje maximálně '+MAX_MEMBERS+' lidí ve frakci, '+(left===1?'zbývá 1 volné místo.':'zbývají '+left+' volná místa.');
    else msg='👥 <b>Členů: '+n+'/'+MAX_MEMBERS+'</b> · server dovoluje maximálně '+MAX_MEMBERS+' lidí ve frakci.';
    var pips='';for(var i=0;i<MAX_MEMBERS;i++)pips+='<i'+(i<n?' class="on"':'')+'></i>';
    bar.className='cap-bar '+cls;
    bar.innerHTML=msg+'<div class="cap-pips">'+pips+'</div>';
  };
})();

;

/* ===== heslo.js ===== */
(function(){
  var MIN=6;

  function close(){var o=document.querySelector('.pw-self-ov');if(o)o.remove();}

  function openPw(first){
    close();
    var ov=document.createElement('div');ov.className='modal-ov pw-self-ov';
    ov.setAttribute('role','dialog');ov.setAttribute('aria-modal','true');
    ov.innerHTML='<div class="modal-box" style="max-width:400px;width:92vw">'+
      '<div class="modal-title">🔑 '+(first?'NASTAV SI SVOJE HESLO':'ZMĚNA HESLA')+'</div>'+
      (first?'<div style="font-size:.95rem;line-height:1.5;color:var(--textb);margin-bottom:.8rem">Dostal jsi od vedení jen dočasné heslo. Změň si ho na vlastní, které nikdo jiný nezná.</div>':'')+
      '<div class="field-group"><label class="fl">NOVÉ HESLO (min. '+MIN+' znaků)</label><div class="iw"><span class="ip">&gt;_</span><input type="password" id="pwsNew" autocomplete="new-password"/></div></div>'+
      '<div class="field-group" style="margin-top:.7rem"><label class="fl">NOVÉ HESLO ZNOVU</label><div class="iw"><span class="ip">&gt;_</span><input type="password" id="pwsConf" autocomplete="new-password"/></div></div>'+
      '<label style="display:flex;gap:.4rem;align-items:center;margin-top:.6rem;font:.6rem \'Share Tech Mono\',monospace;color:var(--text);cursor:pointer"><input type="checkbox" id="pwsShow"/> ZOBRAZIT HESLO</label>'+
      '<div id="pwsMsg" class="smsg" style="margin-top:.5rem;min-height:1em"></div>'+
      '<div class="modal-ftr"><button class="btn-acc small" id="pwsOk">ZMĚNIT HESLO</button><button class="btn-ghost small" id="pwsNo">'+(first?'POZDĚJI':'ZRUŠIT')+'</button></div></div>';
    document.body.appendChild(ov);
    var a=ov.querySelector('#pwsNew'),b=ov.querySelector('#pwsConf'),msg=ov.querySelector('#pwsMsg'),ok=ov.querySelector('#pwsOk');
    function err(t){msg.style.color='#e05555';msg.textContent=t;}
    ov.querySelector('#pwsShow').onchange=function(){a.type=b.type=this.checked?'text':'password';};
    ov.querySelector('#pwsNo').onclick=close;
    ov.addEventListener('mousedown',function(e){if(e.target===ov)close();});
    function key(e){
      if(!document.body.contains(ov)){document.removeEventListener('keydown',key,true);return;}
      if(e.key==='Escape'){e.stopPropagation();close();}
      else if(e.key==='Enter')submit();
    }
    document.addEventListener('keydown',key,true);
    var busy=false;
    async function submit(){
      if(busy)return;
      var p=a.value;
      if(p.length<MIN)return err('// HESLO MUSÍ MÍT ALESPOŇ '+MIN+' ZNAKŮ');
      if(p!==b.value)return err('// HESLA SE NESHODUJÍ');
      busy=true;ok.disabled=true;msg.style.color='var(--acc)';msg.textContent='// UKLÁDÁM...';
      try{
        var r=await sb.auth.updateUser({password:p});
        if(r.error)throw r.error;
      }catch(e){
        busy=false;ok.disabled=false;
        var t=String(e.message||e);
        if(/same|different/i.test(t))t='NOVÉ HESLO MUSÍ BÝT JINÉ NEŽ DOSAVADNÍ';
        else if(/weak|short|least/i.test(t))t='HESLO JE PŘÍLIŠ SLABÉ / KRÁTKÉ';
        else if(/reauth|recent/i.test(t))t='ODHLASTE SE, PŘIHLASTE ZNOVU A ZKUSTE TO HNED';
        return err('// '+t.toUpperCase());
      }
      var arr=DB.get('members')||[],m=arr.find(function(x){return x.id===currentMemberId;});
      if(m){m.pwChanged=true;DB.set('members',arr);}
      addLog('member','Člen si změnil vlastní heslo.',{noDiscord:true});
      toast('Heslo změněno ✓','success');
      close();
    }
    ok.onclick=submit;
    a.focus();
  }
  window.openPwSelf=openPw;

  setInterval(function(){
    var f=document.querySelector('#memberScreen .sb-foot');
    if(!f||f.querySelector('.pw-self-btn'))return;
    var bt=document.createElement('button');bt.className='btn-back pw-self-btn';bt.textContent='🔑 ZMĚNIT HESLO';
    bt.style.marginBottom='.4rem';bt.onclick=function(){openPw(false);};
    f.insertBefore(bt,f.querySelector('.btn-back'));
  },1000);

  var _ep=window.enterPortal;
  if(typeof _ep==='function'){
    window.enterPortal=async function(){
      var r=await _ep.apply(this,arguments);
      if(r){
        setTimeout(function(){
          var m=getMember();
          if(m&&!m.hidden&&!m.pwChanged&&!document.querySelector('.pw-self-ov'))openPw(true);
        },900);
      }
      return r;
    };
  }
})();

;

/* ===== vylepseni.js ===== */
(function(){
  function wkKey(d){var yr=d.getFullYear(),st=new Date(yr,0,1);return yr+'-W'+Math.ceil(((d-st)/86400000+st.getDay()+1)/7);}
  function weeksList(n){var out=[],seen={};for(var i=0;out.length<n&&i<n*2;i++){var d=new Date();d.setDate(d.getDate()-7*i);var k=wkKey(d);if(!seen[k]){seen[k]=1;out.push({key:k,date:d});}}return out;}
  function fin(){var f=DB.get('finance')||{payments:[],expenses:[]};f.payments=f.payments||[];return f;}
  function fee(){return Number((DB.get('finsettings')||{}).weeklyFee)||5000;}
  function isPaid(f,mid,wk){return f.payments.some(function(p){return p.memberId===mid&&p.weekKey===wk&&(p.expenseId==='weekly'||!p.expenseId);});}
  function members(){return DB.get('members')||[];}
  function players(){return members().filter(function(m){return !m.hidden;});}
  function memById(id){return members().filter(function(m){return m.id===id;})[0]||null;}
  function joinIdx(m,ws){if(!m.joined)return -1;var d=new Date(m.joined+'T12:00:00');if(isNaN(d))return -1;var k=wkKey(d);for(var i=0;i<ws.length;i++)if(ws[i].key===k)return i;return -1;}
  function liable(m,idx,ws){
    if(window.onVacation&&ws[idx]&&window.onVacation(m.id,ws[idx].key))return false; // dovolená
    var j=joinIdx(m,ws);return j===-1||idx<=j;
  }
  function mention(m){var id=String(m.discordId||'').replace(/\D/g,'');return id?'<@'+id+'>':'';}
  var DAYS=['neděli','pondělí','úterý','středu','čtvrtek','pátek','sobotu'];

  var upSel=0;
  function recordPaymentWeek(mid,wk){
    var m=memById(mid);if(!m)return;
    var f=fin();if(isPaid(f,mid,wk))return;
    f.payments.push({id:uid(),memberId:mid,memberName:m.displayName,weekKey:wk,amount:fee(),date:nowStr(),note:'Týdenní příspěvek',expenseId:'weekly'});
    DB.set('finance',f);
    addLog('fin','Admin evidoval platbu od "'+m.displayName+'" — $'+fee()+' ('+wk+').',{embed:rich(C_GREEN,'💰 PLATBA EVIDOVÁNA',null,[['👤 Člen',m.displayName],['💵 Částka',money(fee())],['📅 Týden',wk]],{by:rosterWho()})});
    toast('Platba evidována','success');renderAdminFinance();
  }
  function unpaidFor(wk,ws){
    var f=fin(),idx=0;for(var i=0;i<ws.length;i++)if(ws[i].key===wk)idx=i;
    return players().filter(function(m){return liable(m,idx,ws)&&!isPaid(f,m.id,wk);});
  }
  function sendReminder(wk,manual){
    var ws=weeksList(8),list=unpaidFor(wk,ws);
    if(!list.length){if(manual)toast('Všichni mají zaplaceno ✓','success');return false;}
    var amt=fee(),lines=list.map(function(m){return '• '+m.displayName+(mention(m)?' '+mention(m):'');}).join('\n');
    var pings=list.map(mention).filter(Boolean).join(' ');if(pings.length>1800)pings=pings.slice(0,1800);
    addLog('fin','Připomínka příspěvku — nezaplatili: '+list.map(function(m){return m.displayName;}).join(', ')+' ('+wk+').',{
      embed:rich(C_ORANGE,'⏰ PŘIPOMÍNKA TÝDENNÍHO PŘÍSPĚVKU','Příspěvek **'+money(amt)+'** za týden **'+wk+'** zatím nezaplatili:\n\n'+lines,
        [['📅 Týden',wk],['👥 Nezaplatilo',String(list.length)],['💵 Celkem chybí',money(list.length*amt)]],{by:manual?rosterWho():'Automatická připomínka'}),
      extraPing:pings});
    if(manual)toast('Připomínka odeslána na Discord','success');
    return true;
  }
  function remCfg(){var c=DB.get('finremind')||{};return {on:c.on!==false,hour:c.hour==null?18:c.hour,last:c.last||''};}
  function renderUnpaid(){
    var el=document.getElementById('financeAdminPanel');if(!el)return;
    var old=document.getElementById('unpaidBox');if(old)old.remove();
    var ws=weeksList(8);if(upSel>=ws.length)upSel=0;
    var wk=ws[upSel].key,f=fin(),all=players(),list=unpaidFor(wk,ws),amt=fee(),cfg=remCfg();
    var fs=DB.get('finsettings')||{},due=DAYS[parseInt(fs.feeDay)||0];
    var opts=ws.map(function(w,i){return '<option value="'+i+'"'+(i===upSel?' selected':'')+'>'+(i===0?'Tento týden':i===1?'Minulý týden':'Před '+i+' týdny')+' · '+w.key+'</option>';}).join('');
    var rows=list.length?list.map(function(m){
      return '<div class="fa-pay-row unpaid"><span class="fa-pay-name">'+esc(m.displayName)+'</span><div style="display:flex;gap:.5rem;align-items:center"><span class="fa-pay-status unpaid">✗ '+money(amt)+'</span><button class="btn-record-pay" data-pay="'+esc(m.id)+'">EVIDOVAT</button></div></div>';
    }).join(''):'<div class="empty-s">// Za tento týden mají všichni zaplaceno ✓</div>';
    var cols=ws.slice(0,6),mx='<div class="mx-wrap"><table class="mx"><thead><tr><th>ČLEN</th>'+cols.map(function(w,i){return '<th>'+(i===0?'TENTO':w.key.split('-')[1])+'</th>';}).join('')+'<th>DLUH</th></tr></thead><tbody>'+
      all.map(function(m){
        var n=0,c=cols.map(function(w,i){
          if(!liable(m,i,ws))return '<td class="na">–</td>';
          var p=isPaid(f,m.id,w.key);if(!p)n++;return '<td class="'+(p?'ok':'no')+'">'+(p?'✓':'✗')+'</td>';
        }).join('');
        return '<tr><td>'+esc(m.displayName)+'</td>'+c+'<td class="'+(n?'no':'ok')+'">'+(n?money(n*amt):'—')+'</td></tr>';
      }).join('')+'</tbody></table></div>';
    var hours='';for(var h=0;h<24;h++)hours+='<option value="'+h+'"'+(cfg.hour===h?' selected':'')+'>'+(h<10?'0':'')+h+':00</option>';
    var box=document.createElement('div');box.id='unpaidBox';
    box.innerHTML='<div class="fa-exp-title">// PŘEHLED NEPLATIČŮ</div>'+
      '<div class="up-bar"><select id="upWeek">'+opts+'</select>'+
        '<span class="up-sum'+(list.length?'':' ok')+'">NEZAPLATILO <b>'+list.length+'</b> Z '+all.length+' · CHYBÍ <b>'+money(list.length*amt)+'</b></span>'+
        (list.length?'<button class="btn-acc small" data-remind="1" style="margin-left:auto">📣 PŘIPOMENOUT NA DISCORD</button>':'')+'</div>'+
      rows+
      '<div class="fa-exp-title" style="margin-top:1rem">// POSLEDNÍCH 6 TÝDNŮ</div>'+mx+
      '<div class="up-set"><label><input type="checkbox" id="frOn"'+(cfg.on?' checked':'')+'/> AUTOMATICKÁ PŘIPOMÍNKA V DEN SPLATNOSTI ('+due+') OD</label><select id="frHour">'+hours+'</select>'+
        '<span>// odešle se, když je v ten čas někdo přihlášený, a jen jednou za den</span></div>';
    el.insertBefore(box,el.firstChild);
    box.onclick=function(e){
      var p=e.target.closest('[data-pay]');if(p){recordPaymentWeek(p.getAttribute('data-pay'),wk);return;}
      if(e.target.closest('[data-remind]'))sendReminder(wk,true);
    };
    box.onchange=function(e){
      if(e.target.id==='upWeek'){upSel=parseInt(e.target.value)||0;renderUnpaid();}
      else if(e.target.id==='frOn'||e.target.id==='frHour'){
        var c=remCfg();c.on=document.getElementById('frOn').checked;c.hour=parseInt(document.getElementById('frHour').value)||0;
        DB.set('finremind',c);toast('Nastavení připomínky uloženo','success');
      }
    };
  }
  var _raf=window.renderAdminFinance;
  window.renderAdminFinance=function(){_raf.apply(this,arguments);renderUnpaid();};

  var remBusy=false;
  async function remindTick(){
    if(remBusy||!currentMemberId||!sb||!DB.cache||DB.cache.members===undefined)return;
    var cfg=remCfg();if(!cfg.on)return;
    var now=new Date(),fs=DB.get('finsettings')||{};
    if(now.getDay()!==(parseInt(fs.feeDay)||0)||now.getHours()<cfg.hour)return;
    var today=ymd(now);if(cfg.last===today)return;
    remBusy=true;
    try{
      var r=await sb.from(TABLE).select('value').eq('key','finremind').maybeSingle();
      var fresh=(r.data&&r.data.value)||{on:cfg.on,hour:cfg.hour,last:''};
      if(fresh.last===today){DB.cache.finremind=fresh;}
      else{
        fresh.last=today;if(fresh.on===undefined)fresh.on=true;if(fresh.hour==null)fresh.hour=cfg.hour;
        DB.set('finremind',fresh);await DB.flush();
        sendReminder(wkKey(now),false);
      }
    }catch(e){console.error(e);}
    remBusy=false;
  }
  setInterval(remindTick,60000);setTimeout(remindTick,8000);

var AT={came:'✓ PŘIŠEL',absent:'✕ NEPŘIŠEL',exc:'○ OMLUVEN'},openAtt={};
  function started(e){var d=evStart(e);return !!d&&d.getTime()<=Date.now();}
  window.setAtt=function(evId,mid,val){
    if(!isAdmin())return;
    var evs=DB.get('events')||[],e=evs.filter(function(x){return x.id===evId;})[0];if(!e)return;
    e.att=e.att||{};if(e.att[mid]===val)delete e.att[mid];else e.att[mid]=val;
    DB.set('events',evs);renderCalendar('a');
  };
  window.attPrefill=function(evId){
    if(!isAdmin())return;
    var evs=DB.get('events')||[],e=evs.filter(function(x){return x.id===evId;})[0];if(!e)return;
    e.att=e.att||{};var n=0;
    Object.keys(e.rsvp||{}).forEach(function(mid){if(e.rsvp[mid]==='yes'&&!e.att[mid]){e.att[mid]='came';n++;}});
    DB.set('events',evs);toast(n?'Předvyplněno '+n+' členů podle přihlášek':'Není co předvyplnit','success');renderCalendar('a');
  };
  var _ec=window.evCard;
  window.evCard=function(e,scope,m,mems){
    var h=_ec.apply(this,arguments);
    if(!started(e))return h;
    var att=e.att||{},c={came:0,absent:0,exc:0};Object.keys(att).forEach(function(k){if(c[att[k]]!==undefined)c[att[k]]++;});
    var recorded=c.came+c.absent+c.exc>0;
    if(scope==='a'&&isAdmin()){
      var rows=mems.map(function(x){
        return '<div class="att-row"><span class="nm">'+esc(x.displayName)+'</span><span class="bt">'+
          Object.keys(AT).map(function(k){return '<button class="att-b '+k+(att[x.id]===k?' on':'')+'" onclick="setAtt(\''+e.id+'\',\''+x.id+'\',\''+k+'\')">'+AT[k]+'</button>';}).join('')+'</span></div>';
      }).join('');
      var panel='<details class="att-box" data-ev="'+e.id+'"'+(openAtt[e.id]?' open':'')+'><summary>📋 DOCHÁZKA — přišlo '+c.came+' · nepřišlo '+c.absent+' · omluveno '+c.exc+'</summary>'+
        '<div class="att-tools"><button class="btn-micro" onclick="attPrefill(\''+e.id+'\')">PŘEDVYPLNIT Z PŘIHLÁŠEK</button></div>'+rows+'</details>';
      return h.replace(/<\/div>$/,panel+'</div>');
    }
    if(recorded)return h.replace(/<\/div>$/,'<div class="att-sum">📋 DOCHÁZKA: přišlo '+c.came+' · nepřišlo '+c.absent+' · omluveno '+c.exc+'</div></div>');
    return h;
  };
  document.addEventListener('toggle',function(e){
    var d=e.target;if(d&&d.classList&&d.classList.contains('att-box'))openAtt[d.getAttribute('data-ev')]=d.open;
  },true);

  function attStats(mid){
    var c=0,a=0,x=0,last=[];
    (DB.get('events')||[]).filter(function(e){return e.att&&e.att[mid]&&evStart(e);}).sort(function(p,q){return evStart(q)-evStart(p);}).forEach(function(e){
      var v=e.att[mid];if(v==='came')c++;else if(v==='absent')a++;else x++;
      if(last.length<6)last.push({title:e.title,date:evStart(e),v:v});
    });
    return {came:c,absent:a,exc:x,total:c+a,pct:(c+a)?Math.round(c/(c+a)*100):null,last:last};
  }
  function pctCls(p){return p===null?'':(p>=75?'good':(p>=50?'mid':'bad'));}
  function renderAttOverview(){
    var host=document.getElementById('calBodyA');if(!host||!isAdmin())return;
    var old=document.getElementById('attOverview');if(old)old.remove();
    var rows=players().map(function(m){return {m:m,s:attStats(m.id)};}).sort(function(a,b){
      if(a.s.pct===null&&b.s.pct===null)return 0;if(a.s.pct===null)return 1;if(b.s.pct===null)return -1;return a.s.pct-b.s.pct;});
    var box=document.createElement('div');box.id='attOverview';
    box.innerHTML='<div class="fa-exp-title">// DOCHÁZKA ČLENŮ</div>'+
      '<div class="att-sum" style="margin:.3rem 0 .6rem">Počítá se jen z akcí, kde je docházka zaznamenaná. Omluvení se do procent nepočítají. Pod 50 % = červeně.</div>'+
      '<div class="mx-wrap"><table class="mx"><thead><tr><th>ČLEN</th><th>PŘIŠEL</th><th>NEPŘIŠEL</th><th>OMLUVEN</th><th>ÚČAST</th></tr></thead><tbody>'+
      rows.map(function(r){
        var s=r.s;
        return '<tr><td><span class="prof-link" data-prof="'+esc(r.m.id)+'">'+esc(r.m.displayName)+'</span></td><td class="ok">'+s.came+'</td><td class="'+(s.absent?'no':'na')+'">'+s.absent+'</td><td>'+s.exc+'</td>'+
          '<td>'+(s.pct===null?'<span class="na">—</span>':'<span class="att-pct '+pctCls(s.pct)+'">'+s.pct+' %</span><span class="att-bar"><i style="width:'+s.pct+'%"></i></span>')+'</td></tr>';
      }).join('')+'</tbody></table></div>';
    host.appendChild(box);
  }
  var _rc=window.renderCalendar;
  window.renderCalendar=function(scope){_rc.apply(this,arguments);if(scope==='a')renderAttOverview();};

  function calcLoot(amount,facPct,bonusPct,names,leaderIdx){
    amount=Math.max(0,Math.floor(amount)||0);facPct=Math.min(100,Math.max(0,+facPct||0));bonusPct=Math.min(100,Math.max(0,+bonusPct||0));
    var n=Math.max(1,names.length);
    var fac=Math.round(amount*facPct/100),pool=amount-fac,bonus=Math.floor(pool*bonusPct/100),rest=pool-bonus,per=Math.floor(rest/n),rem=rest-per*n;
    var shares=names.map(function(nm,i){return {name:nm,amt:per+(i===leaderIdx?bonus:0)};});
    if(leaderIdx<0)fac+=bonus; // bez vedoucího propadne bonus frakci
    fac+=rem;
    return {fac:fac,bonus:bonus,per:per,shares:shares,rem:rem,amount:amount};
  }
  window.__calcLoot=calcLoot;
  function parseAmount(txt){
    var m=/\d[\d\s.,\u00a0]*/.exec(String(txt||''));if(!m)return 0;
    var s=m[0].replace(/[\s\u00a0]/g,'');
    if(/^\d{1,3}([.,]\d{3})+$/.test(s))s=s.replace(/[.,]/g,'');
    else s=s.replace(',','.');
    return Math.floor(parseFloat(s))||0;
  }
  function lootFac(){var c=DB.get('lootcfg')||{};var v=parseFloat(c.fac);return isNaN(v)?10:Math.min(100,Math.max(0,v));}
  function isBoss(){var m=getMember();return !!m&&m.position==='Mastermind';}
  window.__lootCalc=null;
  function lootField(){return document.getElementById('hs-loot');}
  function lootValid(){
    var c=window.__lootCalc,f=lootField();
    return !!c&&!!f&&f.value===c.txt&&c.crew===heistCrewIds().join(',');
  }
  function syncLootBtn(){
    var f=lootField();if(!f)return;
    if(window.__lootCalc&&!lootValid()){window.__lootCalc=null;f.value='';} // změnila se parta nebo se report odeslal
    var b=document.querySelector('#mt-heist .fp-ftr button[onclick="submitHeist()"]');
    if(b){var ok=lootValid();b.disabled=!ok;b.title=ok?'':'Nejdřív vyplň loot přes „ROZDĚLIT LOOT“';}
  }
  setInterval(syncLootBtn,400);
  var _sh=window.submitHeist;
  window.submitHeist=function(){
    syncLootBtn();
    if(!lootValid()){toast('Nejdřív vyplň loot přes „ROZDĚLIT LOOT“','error',4000);return;}
    var lc=window.__lootCalc,me=getMember(),n0=(DB.get('heists')||[]).length;
    var r=_sh.apply(this,arguments);
    var arr=DB.get('heists')||[];
    if(lc&&me&&arr.length>n0){ 
      var h=arr[arr.length-1];
      if(h&&h.memberId===me.id){h.lootTotal=lc.amount;h.lootFac=lc.fac;h.lootFacPct=lc.facPct;DB.set('heists',arr);}
    }
    return r;
  };

  function openLoot(){
    var old=document.querySelector('.loot-ov');if(old)old.remove();
    var me=getMember(),ids=heistCrewIds(),mems=ids.map(memById).filter(Boolean);
    if(!mems.length){toast('Nejdřív vyber účastníky heistu','error');return;}
    var names=mems.map(function(x){return memberLabel(x);});
    var leaderIdx=me?ids.indexOf(me.id):-1,boss=isBoss();
    var ov=document.createElement('div');ov.className='modal-ov loot-ov';ov.setAttribute('role','dialog');ov.setAttribute('aria-modal','true');
    ov.innerHTML='<div class="modal-box loot-box"><div class="modal-title">🧮 ROZDĚLENÍ LOOTU</div>'+
      '<div class="loot-grid">'+
        '<div class="field-group"><label class="fl">CELKOVÁ ČÁSTKA ($)</label><div class="iw"><span class="ip">$</span><input type="number" id="lcAmt" min="0" step="1"/></div></div>'+
        '<div class="field-group"><label class="fl">PODÍL FRAKCE (%)'+(boss?'':' 🔒')+'</label><div class="iw"><span class="ip">%</span><input type="number" id="lcFac" min="0" max="100" step="1"'+(boss?'':' disabled')+'/></div></div>'+
        '<div class="field-group"><label class="fl">BONUS PRO VEDOUCÍHO (% ze zbytku)</label><div class="iw"><span class="ip">%</span><input type="number" id="lcBon" min="0" max="100" step="1"/></div></div>'+
        '<div class="field-group"><label class="fl">POČET LIDÍ (podle výběru)</label><div class="iw"><span class="ip">#</span><input type="number" id="lcN" value="'+names.length+'" disabled/></div></div>'+
      '</div>'+(boss?'<div class="loot-warn" style="color:var(--acc)">// Jako Mastermind měníš podíl frakce pro všechny.</div>':'<div class="loot-warn" style="color:var(--text)">// Podíl frakce nastavuje Mastermind — nyní '+lootFac()+' %'+((DB.get('lootcfg')||{}).by?' (nastavil '+esc((DB.get('lootcfg')||{}).by)+', '+esc((DB.get('lootcfg')||{}).date||'')+')':'')+'.</div>')+
      '<div id="lcRes"></div>'+
      '<div class="modal-ftr"><button class="btn-acc small" id="lcPut">VLOŽIT DO LOOTU</button><button class="btn-ghost small" id="lcNo">ZAVŘÍT</button></div></div>';
    document.body.appendChild(ov);
    var A=ov.querySelector('#lcAmt'),F=ov.querySelector('#lcFac'),B=ov.querySelector('#lcBon'),R=ov.querySelector('#lcRes');
    var prev=window.__lootCalc;
    A.value=prev?prev.amount:parseAmount((lootField()||{}).value)||'';
    F.value=lootFac();B.value=lsGet('tsc_loot_bon')||0;
    var last=null;
    function calc(){
      var fac=boss?F.value:lootFac();
      last=calcLoot(parseFloat(A.value),fac,B.value,names,leaderIdx);
      last.facPct=Math.min(100,Math.max(0,+fac||0));last.bonPct=Math.min(100,Math.max(0,+B.value||0));
      lsSet('tsc_loot_bon',B.value||0);
      var pc=function(v){return last.amount?' <small style="color:var(--text)">'+(Math.round(v/last.amount*1000)/10)+' %</small>':'';};
      R.innerHTML='<div class="loot-res">'+
        last.shares.map(function(s,i){return '<div class="r"><span>'+esc(s.name)+(i===leaderIdx&&last.bonus?' ⭐ vedoucí':'')+pc(s.amt)+'</span><b>'+money(s.amt)+'</b></div>';}).join('')+
        '<div class="r fac"><span>🏛 Frakce'+(last.rem?' (vč. zbytku '+money(last.rem)+')':'')+pc(last.fac)+'</span><b>'+money(last.fac)+'</b></div>'+
        '<div class="r tot"><span>CELKEM</span><b>'+money(last.amount)+'</b></div></div>'+
        (leaderIdx!==-1?'':'<div class="loot-warn">// Nejsi v partě, bonus vedoucího propadá frakci.</div>');
    }
    [A,F,B].forEach(function(i){i.oninput=calc;});calc();
    [A,F,B].forEach(function(i){i.addEventListener('keydown',function(e){
      if(e.key!=='Enter')return;e.preventDefault();
      if(i===F&&boss)F.dispatchEvent(new Event('change'));
      ov.querySelector('#lcPut').click();
    });});
    if(boss)F.onchange=function(){
      var v=Math.min(100,Math.max(0,parseFloat(F.value)||0));F.value=v;
      DB.set('lootcfg',{fac:v,by:me.displayName,date:nowStr()});
      addLog('heist','Mastermind '+me.displayName+' nastavil podíl frakce z lootu na '+v+' %.',{noDiscord:true});
      toast('Podíl frakce nastaven na '+v+' %','success');calc();
    };
    function close(){document.removeEventListener('keydown',key,true);ov.remove();}
    function key(e){if(e.key==='Escape'){e.stopPropagation();close();}}
    document.addEventListener('keydown',key,true);
    ov.querySelector('#lcNo').onclick=close;
    ov.addEventListener('mousedown',function(e){if(e.target===ov)close();});
    ov.querySelector('#lcPut').onclick=function(){
      if(!last||isNaN(parseFloat(A.value))){toast('Zadej částku (i 0, když nic nebylo)','error');return;}
      var per=last.shares.map(function(s){return s.amt;}),same=per.every(function(x){return x===per[0];});
      var txt=last.amount===0?'nic ($0)':
        money(last.amount)+' — rozdělení: '+(same?money(per[0])+' na hlavu':last.shares.map(function(s){return s.name+' '+money(s.amt);}).join(', '))+', frakce '+money(last.fac)+' ('+last.facPct+' %)';
      var f=lootField();if(f)f.value=txt;
      window.__lootCalc={txt:txt,amount:last.amount,crew:ids.join(','),fac:last.fac,facPct:last.facPct,bonPct:last.bonPct};
      toast('Loot vyplněn — report jde odeslat','success');close();syncLootBtn();
    };
    A.focus();
  }
  (function addLootBtn(){
    var ftr=document.querySelector('#mt-heist .fp-ftr');if(!ftr||ftr.querySelector('.loot-btn'))return;
    var b=document.createElement('button');b.type='button';b.className='btn-ghost small loot-btn';b.textContent='🧮 ROZDĚLIT LOOT';b.onclick=openLoot;
    ftr.insertBefore(b,ftr.querySelector('.ping-chk')||ftr.lastElementChild);
    var f=lootField();
    if(f){f.readOnly=true;f.placeholder='Klikni na „🧮 ROZDĚLIT LOOT“ a vyplň rozdělení…';f.style.cursor='pointer';f.onclick=openLoot;}
    syncLootBtn();
  })();
  var _rah=window.renderAdminHeists;
  window.renderAdminHeists=function(){
    _rah.apply(this,arguments);
    var st=document.querySelector('#aHeists .heist-stats');if(!st)return;
    var tot=0,fac=0;
    (DB.get('heists')||[]).forEach(function(h){if(typeof h.lootTotal==='number'){tot+=h.lootTotal;fac+=(h.lootFac||0);}});
    st.insertAdjacentHTML('beforeend','<div class="inc-sum-card"><div class="inc-sum-title">LOOT CELKEM <small>(nové reporty)</small></div><div class="inc-sum-val acc">'+money(tot)+'</div></div>'+
      '<div class="inc-sum-card"><div class="inc-sum-title">FRAKCI PŘIPADLO</div><div class="inc-sum-val green">'+money(fac)+'</div></div>');
  };

  // ═════════ 4) PROFIL ČLENA ═════════
  function tile(k,v,cls){return '<div class="prof-tile"><div class="k">'+k+'</div><div class="v '+(cls||'')+'">'+v+'</div></div>';}
  function fmtDate(d){return d.getDate()+'. '+(d.getMonth()+1)+'. '+d.getFullYear();}
  function openProfile(id){
    var m=memById(id);if(!m)return;
    var me=getMember(),self=!!me&&me.id===id,adm=isAdmin(),full=self||adm;
    var old=document.querySelector('.prof-ov');if(old)old.remove();
    var n=rosterNames(m),strikes=Math.max(0,Math.min(3,parseInt(m.strikes)||0));
    var hs=(DB.get('heists')||[]),part=hs.filter(function(h){return heistParticipated(h,id);}),led=hs.filter(function(h){return h.memberId===id;}),esk=part.filter(function(h){return h.escaped;}).length;
    var hp=part.length?Math.round(esk/part.length*100):null,at=attStats(id);
    var tiles=tile('HEISTY',part.length+(led.length?' <small>('+led.length+'× vedl)</small>':''))+
      tile('ÚSPĚŠNOST',hp===null?'—':hp+' <small>%</small>',hp===null?'':(hp>=60?'g':(hp>=35?'o':'r')))+
      tile('DOCHÁZKA',at.pct===null?'—':at.pct+' <small>%</small>',pctCls(at.pct)==='good'?'g':pctCls(at.pct)==='mid'?'o':pctCls(at.pct)==='bad'?'r':'')+
      tile('STRIKE',strikes+'<small>/3</small>',strikes>=3?'r':(strikes?'o':'g'));
    var pr=praises().filter(function(x){return x.memberId===id;}),canDelP=function(x){var q=getMember();return !!q&&(isAdmin()||x.byId===q.id);};
    tiles+=tile('POCHVALY',String(pr.length),pr.length?'g':'');
    var sec='';
    if(pr.length)sec+='<div class="prof-sec">// POCHVALY</div>'+pr.slice(-5).reverse().map(function(x){
      return '<div class="prof-li"><span>⭐ '+esc(x.text)+'</span><span>'+esc(x.byName||'')+' · '+esc((x.time||'').split(',')[0])+(canDelP(x)?' <button class="btn-micro del" data-pdel="'+esc(x.id)+'">✕</button>':'')+'</span></div>';}).join('');
    if(at.last.length)sec+='<div class="prof-sec">// POSLEDNÍ AKCE</div>'+at.last.map(function(x){return '<div class="prof-li"><span>'+esc(x.title)+'</span><span>'+fmtDate(x.date)+' · '+AT[x.v]+'</span></div>';}).join('');
    if(full){
      var f=fin(),ws=weeksList(8),owed=0,paidN=0,cnt=0;
      ws.forEach(function(w,i){if(!liable(m,i,ws))return;cnt++;if(isPaid(f,id,w.key))paidN++;else owed++;});
      var now=isPaid(f,id,ws[0].key);
      tiles+=tile('PŘÍSPĚVEK (TÝDEN)',now?'✓':'✗',now?'g':'r')+tile('ZAPLACENO (8 T.)',paidN+'<small>/'+cnt+'</small>',owed?'o':'g');
      var ex=(DB.get('excuses')||[]).filter(function(x){return x.memberId===id;});
      tiles+=tile('OMLUVENKY',String(ex.length));
      if(ex.length)sec+='<div class="prof-sec">// POSLEDNÍ OMLUVENKY</div>'+ex.slice(-3).reverse().map(function(x){
        var st=x.status==='pending'?'čeká':x.status==='approved'?'schváleno':(/rej|den|decl/.test(x.status||'')?'zamítnuto':(x.status||''));
        return '<div class="prof-li"><span>'+esc(x.event)+'</span><span>'+esc(x.date)+' · '+st+'</span></div>';}).join('');
    }
    var joined=m.joined?fmtDate(new Date(m.joined+'T12:00:00')):'neuvedeno';
    var ov=document.createElement('div');ov.className='modal-ov prof-ov';ov.setAttribute('role','dialog');ov.setAttribute('aria-modal','true');
    ov.innerHTML='<div class="modal-box prof-box"><div class="prof-head"><div class="prof-hex">'+esc(m.displayName.charAt(0).toUpperCase())+'</div><div>'+
      '<div class="prof-name">'+esc(m.displayName)+'</div>'+
      '<div class="prof-sub">'+esc(m.position)+(n.nick?' · „'+esc(n.nick)+'“':'')+' · ČLEN OD: <span id="profJoined">'+joined+'</span></div></div></div>'+
      '<div class="prof-tiles">'+tiles+'</div>'+
      (m.promo?'<div class="prof-sec">// NÁVRH NA POVÝŠENÍ</div><div class="prof-li"><span>→ '+esc(m.promo.to)+'</span><span>'+esc(m.promo.note||'')+'</span></div>':'')+
      sec+
      (adm?'<div class="prof-sec">// ADMIN</div><div style="display:flex;gap:.5rem;align-items:center;flex-wrap:wrap"><span class="fl" style="margin:0">DATUM VSTUPU</span><input type="date" id="profJ" value="'+esc(m.joined||'')+'" style="background:var(--surf);border:1px solid var(--brite);color:var(--textb);padding:.3rem .5rem"/><button class="btn-acc small" id="profJs">ULOŽIT</button></div>':'')+
      '<div class="modal-ftr">'+(canPraise()&&!self?'<button class="btn-acc small" id="profPraise">⭐ DÁT POCHVALU</button>':'')+'<button class="btn-ghost small" id="profNo">ZAVŘÍT</button></div></div>';
    document.body.appendChild(ov);
    function close(){document.removeEventListener('keydown',key,true);ov.remove();}
    function key(e){if(e.key==='Escape'){e.stopPropagation();close();}}
    document.addEventListener('keydown',key,true);
    ov.querySelector('#profNo').onclick=close;
    var pb=ov.querySelector('#profPraise');if(pb)pb.onclick=function(){close();openPraise(id);};
    ov.addEventListener('click',function(e){
      var d=e.target.closest&&e.target.closest('[data-pdel]');if(!d)return;
      delPraise(d.getAttribute('data-pdel'));close();openProfile(id);
    });
    ov.addEventListener('mousedown',function(e){if(e.target===ov)close();});
    var js=ov.querySelector('#profJs');
    if(js)js.onclick=function(){
      var v=ov.querySelector('#profJ').value,arr=members(),t=arr.filter(function(x){return x.id===id;})[0];if(!t)return;
      if(v)t.joined=v;else delete t.joined;DB.set('members',arr);
      ov.querySelector('#profJoined').textContent=v?fmtDate(new Date(v+'T12:00:00')):'neuvedeno';
      toast('Datum vstupu uloženo','success');
    };
  }
  window.openProfile=openProfile;
  document.addEventListener('click',function(e){
    var t=e.target.closest&&e.target.closest('[data-prof]');
    if(t){e.preventDefault();openProfile(t.getAttribute('data-prof'));}
  });

  var _rmg=window.renderMemberGrid;
  window.renderMemberGrid=function(){
    _rmg.apply(this,arguments);
    var host=document.getElementById('memberGrid');if(!host)return;
    var cards=host.querySelectorAll('.member-card'),ms=members();
    Array.prototype.forEach.call(cards,function(c,i){
      if(!ms[i]||c.querySelector('.prof-btn'))return;
      var b=document.createElement('button');b.className='btn-micro prof-btn';b.setAttribute('data-prof',ms[i].id);b.textContent='👤 PROFIL';
      (c.querySelector('.mc-info')||c).appendChild(b);
    });
  };
  var _rr=window.renderRoster;
  window.renderRoster=function(admin){
    _rr.apply(this,arguments);
    var el=document.getElementById(admin?'rosterAdmin':'rosterMember');if(!el)return;
    var ms=players().slice().sort(function(a,b){var d=POSITIONS.indexOf(a.position)-POSITIONS.indexOf(b.position);return d!==0?d:String(a.displayName).localeCompare(String(b.displayName),'cs');});
    Array.prototype.forEach.call(el.querySelectorAll('tbody tr'),function(tr,i){
      if(!ms[i])return;var td=tr.firstElementChild;if(td){td.setAttribute('data-prof',ms[i].id);td.classList.add('prof-link');td.title='Zobrazit profil';var pn=praises().filter(function(x){return x.memberId===ms[i].id;}).length;if(pn)td.insertAdjacentHTML('beforeend',' <span title="Pochvaly" style="color:var(--acc)">⭐'+pn+'</span>');}
    });
  };
  var _cm=window.createMember;
  if(typeof _cm==='function')window.createMember=async function(){
    var before=members().map(function(x){return x.id;});
    var r=await _cm.apply(this,arguments);
    var arr=members(),ch=false;
    arr.forEach(function(x){if(before.indexOf(x.id)===-1&&!x.joined){x.joined=ymd(new Date());ch=true;}});
    if(ch)DB.set('members',arr);
    return r;
  };
  setInterval(function(){
    var f=document.querySelector('#memberScreen .sb-foot');
    if(!f||f.querySelector('.prof-self-btn'))return;
    var b=document.createElement('button');b.className='btn-back prof-self-btn';b.textContent='👤 MŮJ PROFIL';b.style.marginBottom='.4rem';
    b.onclick=function(){if(currentMemberId)openProfile(currentMemberId);};
    f.insertBefore(b,f.querySelector('.btn-back'));
  },1000);

  if(typeof SECTIONS!=='undefined'){
    if(!SECTIONS.some(function(x){return x.key==='praise';}))SECTIONS.push({key:'praise',label:'Pochvaly'});
    if(!SECTIONS.some(function(x){return x.key==='weekly';}))SECTIONS.push({key:'weekly',label:'Týdenní souhrn'});
  }
  if(typeof LOG_ICONS!=='undefined'){LOG_ICONS.praise='⭐';LOG_ICONS.weekly='📊';}
  function praises(){return DB.get('praises')||[];}
  function canPraise(){var m=getMember();return !!m&&(isVedeni(m.position)||isAdmin());}
  function givePraise(id,text,ping){
    var me=getMember(),m=memById(id);if(!me||!m||!canPraise()||me.id===id)return;
    var arr=praises();
    arr.push({id:uid(),memberId:id,memberName:m.displayName,text:text,byId:me.id,byName:me.displayName,time:nowStr(),ts:Date.now()});
    if(arr.length>1000)arr=arr.slice(-1000);
    DB.set('praises',arr);
    addLog('praise',me.displayName+' pochválil člena '+m.displayName+': '+text,{
      embed:rich(C_YELLOW,'⭐ POCHVALA',text,[['👤 Člen',m.displayName],['🧑 Pochválil',me.displayName],['⭐ Celkem pochval',String(arr.filter(function(x){return x.memberId===id;}).length)]],{by:me.displayName}),
      icon:'⭐',extraPing:ping?mention(m):''});
    toast('Pochvala odeslána ⭐','success');
  }
  function delPraise(pid){
    var arr=praises(),p=arr.filter(function(x){return x.id===pid;})[0],me=getMember();
    if(!p||!me||!(isAdmin()||p.byId===me.id))return;
    DB.set('praises',arr.filter(function(x){return x.id!==pid;}));
    addLog('praise','Smazána pochvala pro '+p.memberName+'.',{noDiscord:true});
    toast('Pochvala smazána','success');
  }
  function openPraise(id){
    var m=memById(id);if(!m||!canPraise())return;
    var old=document.querySelector('.praise-ov');if(old)old.remove();
    var ov=document.createElement('div');ov.className='modal-ov praise-ov';ov.setAttribute('role','dialog');ov.setAttribute('aria-modal','true');
    ov.innerHTML='<div class="modal-box" style="max-width:440px;width:94vw"><div class="modal-title">⭐ POCHVALA — '+esc(m.displayName)+'</div>'+
      '<div class="field-group"><label class="fl">ZA CO? *</label><textarea id="prTxt" class="adm-ta" maxlength="300" style="min-height:90px" placeholder="např. Skvěle vedl heist, pomohl s doplněním skladu…"></textarea></div>'+
      '<label style="display:flex;gap:.4rem;align-items:center;margin-top:.6rem;font:.6rem \'Share Tech Mono\',monospace;color:var(--text);cursor:pointer"><input type="checkbox" id="prPing" checked/> OZNAČIT ČLENA NA DISCORDU'+(m.discordId?'':' (nemá vyplněné Discord ID)')+'</label>'+
      '<div class="modal-ftr"><button class="btn-acc small" id="prOk">ODESLAT POCHVALU</button><button class="btn-ghost small" id="prNo">ZRUŠIT</button></div></div>';
    document.body.appendChild(ov);
    var T=ov.querySelector('#prTxt');
    function close(){document.removeEventListener('keydown',key,true);ov.remove();}
    function key(e){if(e.key==='Escape'){e.stopPropagation();close();}}
    document.addEventListener('keydown',key,true);
    ov.querySelector('#prNo').onclick=close;
    ov.addEventListener('mousedown',function(e){if(e.target===ov)close();});
    ov.querySelector('#prOk').onclick=function(){
      var tx=T.value.trim();if(!tx){toast('Napiš, za co pochvala je','error');T.focus();return;}
      givePraise(id,tx,ov.querySelector('#prPing').checked);close();openProfile(id);
    };
    T.focus();
  }

  function wcfg(){var c=DB.get('weeklycfg')||{};return {on:c.on!==false,day:c.day==null?0:c.day,hour:c.hour==null?20:c.hour,last:c.last||''};}
  function lootSum(txt){
    var s=String(txt||''),tot=0,re=/\$\s*(\d[\d\s.,\u00a0]*)/g,m,found=false;
    if((m=re.exec(s))){found=true;tot=parseAmount(m[1]);}
    if(!found){var n=parseAmount(s);if(n>=1000)tot=n;}
    return tot;
  }
  function buildWeekly(){
    var now=new Date(),from=now.getTime()-7*864e5,ms=members();
    var hs=(DB.get('heists')||[]).filter(function(h){var d=parseCz(h.date);return d&&d.getTime()>=from;});
    var esc_=hs.filter(function(h){return h.escaped;}).length,loot=0,facSum=0,cnt={};
    hs.forEach(function(h){loot+=(typeof h.lootTotal==='number'?h.lootTotal:lootSum(h.loot));facSum+=(typeof h.lootFac==='number'?h.lootFac:0);((h.crew&&h.crew.length)?h.crew:[h.memberId]).forEach(function(id){cnt[id]=(cnt[id]||0)+1;});});
    var top=Object.keys(cnt).sort(function(a,b){return cnt[b]-cnt[a];}).slice(0,3).map(function(id){var m=memById(id);return m?memberLabel(m)+' ('+cnt[id]+'×)':null;}).filter(Boolean);
    var ws=weeksList(8),wk=wkKey(now),un=unpaidFor(wk,ws);
    var evs=(DB.get('events')||[]).filter(function(e){var d=evStart(e);return d&&d.getTime()>=from&&d.getTime()<=now.getTime()&&e.att&&Object.keys(e.att).length;});
    var came=0,abs=0,absBy={};
    evs.forEach(function(e){Object.keys(e.att).forEach(function(id){if(e.att[id]==='came')came++;else if(e.att[id]==='absent'){abs++;absBy[id]=(absBy[id]||0)+1;}});});
    var absTxt=Object.keys(absBy).map(function(id){var m=memById(id);return m?memberLabel(m)+(absBy[id]>1?' ('+absBy[id]+'×)':''):null;}).filter(Boolean).join(', ');
    var pr=praises().filter(function(x){return x.ts>=from;});
    var fields=[
      ['💎 Heisty',hs.length?hs.length+' (ujeli '+esc_+', neujeli '+(hs.length-esc_)+')':'žádné'],
      ['💰 Loot',loot?money(loot):'—'],
      ['🏛 Frakci připadlo',facSum?money(facSum):'—'],
      ['⭐ Pochvaly',String(pr.length)],
      ['📋 Docházka',evs.length?(came+abs?Math.round(came/(came+abs)*100)+' % na '+evs.length+' '+(evs.length===1?'akci':'akcích'):'zapsána bez údajů'):'žádná zapsaná'],
      ['🏆 Nejaktivnější',top.join(', ')||'—',false],
      ['💵 Příspěvek '+wk+' — nezaplatili ('+un.length+')',un.length?un.map(function(m){return m.displayName;}).join(', '):'všichni zaplatili ✓',false]
    ];
    if(absTxt)fields.splice(5,0,['❌ Nepřišli na akce',absTxt,false]);
    var f0=new Date(from);
    return {desc:'Období: **'+f0.getDate()+'. '+(f0.getMonth()+1)+'.** – **'+now.getDate()+'. '+(now.getMonth()+1)+'. '+now.getFullYear()+'**\n*Loot je odhad z částek v $ uvedených v reportech.*',fields:fields,hs:hs.length,un:un.length};
  }
  function sendWeekly(manual){
    var w=buildWeekly();
    addLog('weekly','Týdenní souhrn — heistů: '+w.hs+', nezaplatilo: '+w.un+'.',{
      embed:rich(C_BLUE,'📊 TÝDENNÍ SOUHRN FRAKCE',w.desc,w.fields,{by:manual?rosterWho():'Automaticky'}),icon:'📊'});
    if(manual)toast('Týdenní souhrn odeslán na Discord','success');
  }
  var wkBusy=false;
  async function weeklyTick(){
    if(wkBusy||!currentMemberId||!sb||!DB.cache||DB.cache.members===undefined)return;
    var cfg=wcfg();if(!cfg.on)return;
    var now=new Date();if(now.getDay()!==cfg.day||now.getHours()<cfg.hour)return;
    var today=ymd(now);if(cfg.last===today)return;
    wkBusy=true;
    try{
      var r=await sb.from(TABLE).select('value').eq('key','weeklycfg').maybeSingle();
      var fresh=(r.data&&r.data.value)||{on:cfg.on,day:cfg.day,hour:cfg.hour,last:''};
      if(fresh.last===today){DB.cache.weeklycfg=fresh;}
      else{
        fresh.last=today;if(fresh.on===undefined)fresh.on=true;if(fresh.day==null)fresh.day=cfg.day;if(fresh.hour==null)fresh.hour=cfg.hour;
        DB.set('weeklycfg',fresh);await DB.flush();sendWeekly(false);
      }
    }catch(e){console.error(e);}
    wkBusy=false;
  }
  setInterval(weeklyTick,60000);setTimeout(weeklyTick,10000);

  var _rset=window.renderSettings;
  window.renderSettings=function(){
    _rset.apply(this,arguments);
    var host=document.getElementById('at-settings');if(!host)return;
    var cfg=wcfg(),p=document.getElementById('weeklyPanel');
    if(!p){
      p=document.createElement('div');p.id='weeklyPanel';p.className='form-panel';p.style.margin='0 1.2rem 1rem';
      var dn=['Neděle','Pondělí','Úterý','Středa','Čtvrtek','Pátek','Sobota'],h='';
      for(var i=0;i<24;i++)h+='<option value="'+i+'">'+(i<10?'0':'')+i+':00</option>';
      p.innerHTML='<div class="fp-title">// TÝDENNÍ SOUHRN NA DISCORD</div>'+
        '<div class="up-set" style="margin:0 0 .7rem;padding:0;border:none"><label><input type="checkbox" id="wkOn"/> POSÍLAT AUTOMATICKY</label>'+
        '<select id="wkDay" class="mc-pos-sel">'+dn.map(function(d,i){return '<option value="'+i+'">'+d+'</option>';}).join('')+'</select>'+
        '<select id="wkHour" class="mc-pos-sel">'+h+'</select></div>'+
        '<div class="att-sum">Souhrn za posledních 7 dní: heisty, odhad lootu, pochvaly, docházka, nejaktivnější a neplatiči. Posílá se do sekce „Týdenní souhrn“ (webhook jde nastavit níže). Odešle se, když je v zadaný čas někdo přihlášený.</div>'+
        '<div class="fp-ftr"><button class="btn-acc small" id="wkNow">📤 POSLAT TEĎ</button></div>';
      host.appendChild(p);
      p.addEventListener('change',function(){
        var c=wcfg();c.on=p.querySelector('#wkOn').checked;c.day=parseInt(p.querySelector('#wkDay').value)||0;c.hour=parseInt(p.querySelector('#wkHour').value)||0;
        DB.set('weeklycfg',c);toast('Nastavení souhrnu uloženo','success');
      });
      p.querySelector('#wkNow').onclick=function(){sendWeekly(true);};
    }
    p.querySelector('#wkOn').checked=cfg.on;p.querySelector('#wkDay').value=String(cfg.day);p.querySelector('#wkHour').value=String(cfg.hour);
  };

  if(typeof MENU_GROUPS!=='undefined')MENU_GROUPS.pochvaly='D';
  function renderPraiseTab(){
    var el=document.getElementById('praiseRoot');if(!el)return;
    var me=getMember();if(!me)return;
    var all=praises(),ms=members();
    var form='';
    if(canPraise()){
      form='<div class="form-panel" style="margin:1.2rem"><div class="fp-title">// NOVÁ POCHVALA (jen vedení)</div><div class="form-grid">'+
        '<div class="field-group"><label class="fl">KOHO POCHVÁLIT *</label><div class="iw"><span class="ip">&gt;_</span><select id="ptMem">'+
          ms.filter(function(x){return x.id!==me.id;}).sort(function(a,b){return String(a.displayName).localeCompare(String(b.displayName),'cs');}).map(function(x){return '<option value="'+esc(x.id)+'">'+esc(x.displayName)+'</option>';}).join('')+'</select></div></div>'+
        '<div class="field-group fg-full"><label class="fl">ZA CO? *</label><textarea id="ptTxt" class="adm-ta" maxlength="300" style="min-height:80px" placeholder="např. Skvěle vedl heist, pomohl s doplněním skladu…"></textarea></div></div>'+
        '<div class="fp-ftr"><button class="btn-acc small" id="ptSend">⭐ ODESLAT POCHVALU</button><label class="ping-chk"><input type="checkbox" id="ptPing" checked/><span>🔔 Označit člena na Discordu</span></label></div></div>';
    }
    var cnt={};all.forEach(function(x){cnt[x.memberId]=(cnt[x.memberId]||0)+1;});
    var top=Object.keys(cnt).sort(function(a,b){return cnt[b]-cnt[a];}).slice(0,5).map(function(id,i){
      var m=memById(id);if(!m)return '';
      return '<div class="prof-li"><span>'+['🥇','🥈','🥉','4.','5.'][i]+' <span class="prof-link" data-prof="'+esc(id)+'">'+esc(m.displayName)+'</span></span><span>⭐ '+cnt[id]+'</span></div>';
    }).join('');
    var feed=all.slice().sort(function(a,b){return (b.ts||0)-(a.ts||0);}).slice(0,50).map(function(x){
      var del=isAdmin()||x.byId===me.id;
      var m=memById(x.memberId);
      return '<div class="map-li" style="display:block;padding:.7rem .9rem;margin:0 1.2rem .5rem;background:var(--card);border:1px solid var(--border);border-left:3px solid var(--acc)">'+
        '<div style="color:var(--textb);font-size:1rem;line-height:1.45">⭐ '+esc(x.text)+'</div>'+
        '<div class="prof-sub" style="margin-top:.35rem"><span class="prof-link" data-prof="'+esc(x.memberId)+'">'+esc(m?m.displayName:x.memberName)+'</span> ← '+esc(x.byName||'?')+' · '+esc(x.time||'')+
        (del?' <button class="btn-micro del" data-pdel="'+esc(x.id)+'" style="margin-left:.4rem">✕</button>':'')+'</div></div>';
    }).join('');
    el.innerHTML=form+
      (top?'<div class="sh">// NEJVÍC POCHVALOVANÍ</div><div style="margin:0 1.2rem 1rem;padding:.5rem .9rem;background:var(--card);border:1px solid var(--border)">'+top+'</div>':'')+
      '<div class="sh">// POSLEDNÍ POCHVALY ('+all.length+')</div>'+(feed||'<div class="empty-s">// Zatím žádné pochvaly</div>');
    var b=el.querySelector('#ptSend');
    if(b)b.onclick=function(){
      var id=el.querySelector('#ptMem').value,tx=el.querySelector('#ptTxt').value.trim();
      if(!id)return;if(!tx){toast('Napiš, za co pochvala je','error');return;}
      givePraise(id,tx,el.querySelector('#ptPing').checked);renderPraiseTab();
    };
  }
  document.addEventListener('click',function(e){
    var d=e.target.closest&&e.target.closest('#praiseRoot [data-pdel]');
    if(d){delPraise(d.getAttribute('data-pdel'));renderPraiseTab();}
  });
  var _mtab=window.mTab;
  window.mTab=function(tab){var r=_mtab.apply(this,arguments);if(tab==='pochvaly')renderPraiseTab();return r;};
  if(typeof M_RENDER!=='undefined')M_RENDER.pochvaly=renderPraiseTab;

  var TRASH_KEYS={
    heists:['💎 Heist',function(x){return x.target+' — '+(x.memberName||'');}],
    warehouse:['📦 Sklad',function(x){return x.name+' ('+x.qty+' ks)';}],
    boosting:['🚗 Vozidlo',function(x){return x.name+' (Tier '+x.tier+')';}],
    excuses:['📝 Omluvenka',function(x){return (x.memberName||'')+' — '+(x.event||'');}],
    reports:['📢 Hlášení',function(x){return (x.memberName||'')+': '+String(x.body||'').slice(0,60);}],
    board:['📣 Oznámení',function(x){return x.title;}],
    clothing:['👕 Oblečení',function(x){return x.name;}],
    events:['📅 Akce',function(x){return x.title;}],
    incomes:['💰 Příjem',function(x){return (x.memberName||'')+' — $'+x.amount+' ('+(x.source||'')+')';}],
    praises:['⭐ Pochvala',function(x){return (x.memberName||'')+': '+String(x.text||'').slice(0,60);}]
  };
  var TRASH_DAYS=30,TRASH_MAX=150;
  function trashLive(){
    var a=DB.get('trash');a=Array.isArray(a)?a:[];
    var lim=Date.now()-TRASH_DAYS*864e5;
    return a.filter(function(e){return e&&e.ts>=lim;});
  }
  function trashAdd(key,items){
    var me=getMember(),by=me?me.displayName:'?',list=trashLive();
    items.forEach(function(it){list.unshift({id:uid(),key:key,item:it,by:by,ts:Date.now()});});
    if(list.length>TRASH_MAX)list=list.slice(0,TRASH_MAX);
    DB.set('trash',list);
  }
  var _dbset=DB.set;
  DB.set=function(k,v){
    try{
      if(TRASH_KEYS[k]&&Array.isArray(v)&&Array.isArray(DB.cache[k])){
        var keep={};v.forEach(function(x){if(x&&x.id)keep[x.id]=1;});
        var gone=DB.cache[k].filter(function(x){return x&&x.id&&!keep[x.id];});
        if(gone.length)trashAdd(k,gone);
      }
    }catch(e){console.error('trash',e);}
    return _dbset.apply(DB,arguments);
  };
  function trashLabel(e){var d=TRASH_KEYS[e.key];if(!d)return e.key;try{return d[1](e.item)||'(bez názvu)';}catch(x){return '(bez názvu)';}}
  function trashRestore(tid){
    var t=trashLive(),e=t.filter(function(x){return x.id===tid;})[0];if(!e)return;
    var arr=DB.get(e.key)||[];
    if(!arr.some(function(x){return x&&x.id===e.item.id;}))arr.push(e.item);
    DB.set(e.key,arr);
    DB.set('trash',t.filter(function(x){return x.id!==tid;}));
    addLog('sys',rosterWho()+' obnovil z koše: '+TRASH_KEYS[e.key][0]+' — '+trashLabel(e),{noDiscord:true});
    toast('Obnoveno ✓','success');
    renderTrash();try{refreshView();}catch(x){}
  }
  function trashPurge(tid){
    DB.set('trash',trashLive().filter(function(x){return x.id!==tid;}));
    toast('Trvale smazáno','info');renderTrash();
  }
  function trashEmpty(){DB.set('trash',[]);toast('Koš vysypán','info');renderTrash();}
  function trashAsk(title,text,ok,fn){
    if(typeof window.tscDialog==='function')window.tscDialog({title:title,text:text,ok:ok,danger:true,cancel:'ZRUŠIT'},fn);
    else if(confirm(title))fn();
  }
  function renderTrash(){
    var host=document.getElementById('at-settings');if(!host)return;
    var p=document.getElementById('trashPanel');
    if(!p){
      p=document.createElement('div');p.id='trashPanel';p.className='form-panel';p.style.margin='0 1.2rem 1rem';host.appendChild(p);
      p.addEventListener('click',function(e){
        var b=e.target.closest('[data-tr]');if(!b)return;
        var a=b.getAttribute('data-tr'),id=b.getAttribute('data-id');
        if(a==='restore')trashRestore(id);
        else if(a==='purge')trashAsk('⚠ SMAZAT NAVŽDY?','Tuto položku už nepůjde vrátit.','SMAZAT',function(){trashPurge(id);});
        else if(a==='empty')trashAsk('⚠ VYSYPAT KOŠ?','Všechny položky v koši se smažou navždy.','VYSYPAT',trashEmpty);
      });
    }
    var list=trashLive();
    p.innerHTML='<div class="fp-title">// KOŠ — SMAZANÉ POLOŽKY ('+list.length+') · uchovává se '+TRASH_DAYS+' dní</div>'+
      (list.length?list.slice(0,60).map(function(e){
        var d=new Date(e.ts);
        return '<div class="tr-row"><span class="tr-type">'+esc(TRASH_KEYS[e.key]?TRASH_KEYS[e.key][0]:e.key)+'</span>'+
          '<span class="tr-name">'+esc(trashLabel(e))+'<small>smazal '+esc(e.by||'?')+' · '+d.toLocaleString('cs-CZ',{day:'numeric',month:'numeric',hour:'2-digit',minute:'2-digit'})+'</small></span>'+
          '<span class="tr-act"><button class="btn-acc small" data-tr="restore" data-id="'+esc(e.id)+'">↩ OBNOVIT</button>'+
          '<button class="btn-micro del" title="Smazat navždy" data-tr="purge" data-id="'+esc(e.id)+'">✕</button></span></div>';
      }).join('')+'<div class="fp-ftr" style="margin-top:.7rem"><button class="btn-ghost small" data-tr="empty">🗑 VYSYPAT KOŠ</button></div>'
      :'<div class="empty-s">// Koš je prázdný</div>');
  }
  var _rset2=window.renderSettings;
  window.renderSettings=function(){_rset2.apply(this,arguments);renderTrash();};
})();

;

/* ===== luxus.js ===== */
(function(){
  var reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
  function norm(s){return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();}
  var SEL='.dc,.board-post,.heist-card,.task-card,.ev-card,.member-card,.wh-item,.form-panel',raf=0,px,py,pt;
  document.addEventListener('pointermove',function(e){
    if(e.pointerType==='touch')return;
    px=e.clientX;py=e.clientY;pt=e.target;
    if(raf)return;
    raf=requestAnimationFrame(function(){
      raf=0;var c=pt&&pt.closest&&pt.closest(SEL);if(!c)return;
      var r=c.getBoundingClientRect();
      c.style.setProperty('--mx',(px-r.left)+'px');c.style.setProperty('--my',(py-r.top)+'px');
    });
  },{passive:true});

  var pal=null,prevFocus=null;
  function items(){
    var ms=[].slice.call(document.querySelectorAll('#memberScreen,#adminScreen')).filter(function(x){return !x.classList.contains('hidden');})[0];
    if(!ms)return [];
    var out=[].slice.call(ms.querySelectorAll('.sb-nav .nb')).filter(function(b){return !b.classList.contains('hidden');}).map(function(b){
      var i=b.querySelector('.ni'),l=b.querySelector('.nl');
      return {ic:i?i.textContent:'•',label:l?l.textContent:b.textContent,run:function(){b.click();}};
    });
    if(ms.id==='adminScreen'&&typeof window.goBackToMember==='function')out.push({ic:'←',label:'ZPĚT NA PORTÁL',run:function(){window.goBackToMember();}});
    if(typeof window.openPwSelf==='function')out.push({ic:'🔑',label:'ZMĚNIT HESLO',run:function(){window.openPwSelf(false);}});
    return out;
  }
  function closePal(){
    if(!pal)return;pal.remove();pal=null;
    if(prevFocus&&prevFocus.focus)prevFocus.focus();
  }
  function openPal(){
    var all=items();if(!all.length||pal)return;
    prevFocus=document.activeElement;
    pal=document.createElement('div');pal.className='lux-pal';pal.setAttribute('role','dialog');pal.setAttribute('aria-modal','true');
    pal.innerHTML='<div class="lux-pal-box"><input class="lux-pal-in" placeholder="Kam chceš skočit…" aria-label="Hledat záložku"/><div class="lux-pal-list"></div><div class="lux-pal-foot">↑↓ vybrat · Enter otevřít · Esc zavřít</div></div>';
    document.body.appendChild(pal);
    var inp=pal.querySelector('input'),list=pal.querySelector('.lux-pal-list'),cur=0,shown=[];
    function draw(){
      var q=norm(inp.value);
      shown=all.filter(function(x){return !q||norm(x.label).indexOf(q)!==-1;});
      if(cur>=shown.length)cur=Math.max(0,shown.length-1);
      list.innerHTML='';
      if(!shown.length){list.innerHTML='<div class="lux-pal-none">Nic nenalezeno</div>';return;}
      shown.forEach(function(x,i){
        var b=document.createElement('button');b.className='lux-pal-it'+(i===cur?' on':'');
        b.innerHTML='<span>'+x.ic+'</span><span></span>';b.lastChild.textContent=x.label;
        b.onclick=function(){closePal();x.run();};
        b.onmouseenter=function(){cur=i;draw();};
        list.appendChild(b);
      });
      var on=list.querySelector('.on');if(on&&on.scrollIntoView)on.scrollIntoView({block:'nearest'});
    }
    inp.oninput=function(){cur=0;draw();};
    inp.onkeydown=function(e){
      if(e.key==='ArrowDown'){e.preventDefault();cur=Math.min(shown.length-1,cur+1);draw();}
      else if(e.key==='ArrowUp'){e.preventDefault();cur=Math.max(0,cur-1);draw();}
      else if(e.key==='Enter'&&shown[cur]){e.preventDefault();var x=shown[cur];closePal();x.run();}
      else if(e.key==='Escape'){e.stopPropagation();closePal();}
    };
    pal.addEventListener('mousedown',function(e){if(e.target===pal)closePal();});
    draw();inp.focus();
  }
  document.addEventListener('keydown',function(e){
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();pal?closePal():openPal();}
  },true);

  setInterval(function(){
    document.querySelectorAll('#memberScreen .sb-foot,#adminScreen .sb-foot').forEach(function(f){
      if(f.querySelector('.lux-k'))return;
      var b=document.createElement('button');b.className='lux-k';b.innerHTML='<span>⌕ HLEDAT</span><kbd>Ctrl K</kbd>';
      b.onclick=openPal;f.insertBefore(b,f.firstChild);});
  },1000);

  var scr=document.getElementById('selectScreen');
  if(scr&&!reduce){
    var cv=document.createElement('canvas');cv.id='luxDust';scr.insertBefore(cv,scr.firstChild);
    var cx=cv.getContext('2d'),W=0,H=0,P=[],N=46;
    function size(){var d=Math.min(2,devicePixelRatio||1);W=cv.width=innerWidth*d;H=cv.height=innerHeight*d;}
    function rgb(){var h=(getComputedStyle(document.documentElement).getPropertyValue('--acc')||'#c49a14').trim().replace('#','');
      if(h.length===3)h=h.replace(/(.)/g,'$1$1');var n=parseInt(h,16);return isNaN(n)?'196,154,20':((n>>16)&255)+','+((n>>8)&255)+','+(n&255);}
    size();addEventListener('resize',size);
    for(var i=0;i<N;i++)P.push({x:Math.random(),y:Math.random(),r:Math.random()*1.6+.4,v:Math.random()*.00014+.00004,a:Math.random()*.5+.15,p:Math.random()*6.28});
    var col=rgb(),fr=0;
    (function loop(t){
      if(!scr.classList.contains('active')||document.hidden){setTimeout(function(){requestAnimationFrame(loop);},400);return;}
      if(++fr%90===0)col=rgb();
      cx.clearRect(0,0,W,H);
      P.forEach(function(q){
        q.y-=q.v*16;q.x+=Math.sin(t/3000+q.p)*.0003;
        if(q.y<-.02){q.y=1.02;q.x=Math.random();}
        cx.beginPath();cx.fillStyle='rgba('+col+','+(q.a*(.6+.4*Math.sin(t/900+q.p)))+')';
        cx.arc(q.x*W,q.y*H,q.r*(W/innerWidth),0,6.283);cx.fill();
      });
      requestAnimationFrame(loop);
    })(0);
  }
})();

(function(){
  function indicator(){document.querySelectorAll('#memberScreen .sb-nav,#adminScreen .sb-nav').forEach(indicatorFor);}
  function indicatorFor(nav){
    var ind=nav.querySelector('.lux-ind');
    if(!ind){
      ind=document.createElement('i');ind.className='lux-ind';nav.appendChild(ind);
      ind._mv=function(){
        var a=nav.querySelector('.nb.active');
        if(!a||!a.offsetHeight){ind.style.opacity=0;return;}
        ind.style.opacity=1;ind.style.height=a.offsetHeight+'px';ind.style.transform='translateY('+a.offsetTop+'px)';
      };
      new MutationObserver(ind._mv).observe(nav,{subtree:true,attributes:true,attributeFilter:['class']});
      addEventListener('resize',ind._mv);
    }
    ind._mv();
  }
  function hello(){
    var ph=document.querySelector('#mt-board .ph'),nm=document.getElementById('sbName');
    if(!ph||!nm||!nm.textContent.trim())return;
    var h=new Date().getHours(),g=h<5?'Zdravím Vás':h<10?'Zdravím Vás':h<18?'Zdravím Vás':'Zdravím Vás';
    var el=document.querySelector('.lux-hello');
    if(!el){el=document.createElement('div');el.className='lux-hello';ph.after(el);}
    var t=g+', '+nm.textContent.trim();
    if(el.dataset.t!==t){el.dataset.t=t;el.innerHTML='';
      var b=document.createElement('b');b.textContent=nm.textContent.trim();
      el.appendChild(document.createTextNode(g+', '));el.appendChild(b);
      var s=document.createElement('small');s.textContent='ALT + 1–9 PŘEPÍNÁ ZÁLOŽKY · CTRL + K HLEDÁ';el.appendChild(s);}
  }
  setInterval(function(){indicator();hello();},800);
  // Alt + číslo = záložka podle pořadí v menu
  document.addEventListener('keydown',function(e){
    if(!e.altKey||e.ctrlKey||e.metaKey||!/^[1-9]$/.test(e.key))return;
    var ms=[].slice.call(document.querySelectorAll('#memberScreen,#adminScreen')).filter(function(x){return !x.classList.contains('hidden');})[0];if(!ms)return;
    var b=[].slice.call(ms.querySelectorAll('.sb-nav .nb')).filter(function(x){return !x.classList.contains('hidden');})[+e.key-1];
    if(b){e.preventDefault();b.click();}
  });
})();

(function(){
  var prev=null;
  function nextChange(){
    if(typeof window.radioNextChange==='function')return window.radioNextChange();
    var n=new Date(),h=n.getHours(),t=new Date(n),day='dnes',hh=15;
    t.setMinutes(0,0,0);
    if(h<15)hh=15;else if(h<17)hh=17;else{t.setDate(t.getDate()+1);day='zítra';hh=15;}
    t.setHours(hh);
    return {at:t,text:day+' v '+hh+':00'};
  }
  function left(ms){
    var m=Math.max(1,Math.ceil(ms/60000));
    return m>=60?Math.floor(m/60)+' h '+(m%60)+' min':m+' min';
  }
  function tickCountdown(){
    var el=document.querySelector('#radioDisplay .radio-info-next');
    if(!el)return;
    var n=nextChange(),ms=n.at-new Date();
    el.textContent='// PŘÍŠTÍ ZMĚNA: '+n.text+' · za '+left(ms);
    el.classList.toggle('soon',ms<=5*60000);
  }

  function copy(val){
    function ok(){if(typeof toast==='function')toast('Frekvence '+val+' zkopírována ✓','success');}
    if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(val).then(ok,fallback);}else fallback();
    function fallback(){
      var t=document.createElement('textarea');t.value=val;t.style.cssText='position:fixed;opacity:0';
      document.body.appendChild(t);t.select();
      try{document.execCommand('copy');ok();}catch(e){}
      t.remove();
    }
  }

  function enhance(){
    var host=document.getElementById('radioDisplay');if(!host)return;
    var now={};
    host.querySelectorAll('.radio-card').forEach(function(c){
      var lb=c.querySelector('.radio-label'),fr=c.querySelector('.radio-freq');
      if(!lb||!fr)return;
      var key=lb.textContent.trim(),val=fr.textContent.trim();
      now[key]=val;
      // barevný pruh podle frekvence
      c.style.borderLeftColor=getComputedStyle(fr).color;
      // zvýraznění změněné frekvence
      if(prev&&prev[key]!==undefined&&prev[key]!==val)c.classList.add('radio-flash');
      // kliknutí = zkopírovat
      if(val&&val!=='—'){
        c.classList.add('radio-copy');c.tabIndex=0;c.setAttribute('role','button');
        c.title='Klikni pro zkopírování';
        c.onclick=function(){copy(val);};
        c.onkeydown=function(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();copy(val);}};
      }
    });
    prev=now;
    tickCountdown();
  }

  var orig=window.renderMyRadio;
  if(typeof orig==='function'){
    window.renderMyRadio=function(){
      var r=orig.apply(this,arguments);
      enhance();
      return r;
    };
  }
  setInterval(tickCountdown,15000);
})();

;

/* ===== doplnky.js ===== */
(function(){
  function norm(s){return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();}
  var BASE_TITLE=document.title||'THE STRIKERS CREW';

  function unreadCounts(){
    var m=getMember();if(!m||m.hidden)return null;
    var cur=currentIds(m),s=loadSeen(m)||cur;
    function unseen(t){return (cur[t]||[]).filter(function(id){return (s[t]||[]).indexOf(id)===-1;});}
    var board=unseen('board');
    // oznámení k potvrzení se počítá, dokud ho člen nepotvrdí
    var conf=DB.get('boardConfirmed')||{};
    (DB.get('board')||[]).forEach(function(p){
      if(p.type==='confirm'&&!(conf[p.id]&&conf[p.id].indexOf(m.id)!==-1)&&board.indexOf(p.id)===-1)board.push(p.id);
    });
    return {board:board.length,tasks:unseen('tasks').length,messages:unseen('messages').length};
  }
  function setBadge(el,n){
    if(!el)return;
    el.textContent=n>99?'99+':String(n);
    el.classList.toggle('visible',n>0);
    el.classList.add('unread');
  }
  function paintBadges(){
    var c=unreadCounts();if(!c)return;
    var bb=document.getElementById('boardBadge');
    if(!bb){
      var btn=document.querySelector('#memberScreen .nb[onclick*="mTab(\'board\'"]');
      if(btn){bb=document.createElement('span');bb.className='nbadge';bb.id='boardBadge';btn.appendChild(bb);}
    }
    setBadge(bb,c.board);
    setBadge(document.getElementById('taskBadge'),c.tasks);
    setBadge(document.getElementById('msgBadge'),c.messages);
    var total=c.board+c.tasks+c.messages;
    document.title=(total?'('+total+') ':'')+BASE_TITLE;
  }
  var _ub=window.updateBadges;
  if(typeof _ub==='function'){
    window.updateBadges=function(){var r=_ub.apply(this,arguments);try{paintBadges();}catch(e){}return r;};
  }
  setInterval(function(){try{if(typeof getMember==='function'&&getMember()&&window.updateBadges)window.updateBadges();}catch(e){}},4000);

  function p2(n){return (n<10?'0':'')+n;}
  function icsLocal(d){return d.getFullYear()+p2(d.getMonth()+1)+p2(d.getDate())+'T'+p2(d.getHours())+p2(d.getMinutes())+'00';}
  function icsEsc(s){return String(s||'').replace(/\\/g,'\\\\').replace(/\r?\n/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,');}
  function fold(l){var o='';while(l.length>74){o+=l.slice(0,74)+'\r\n ';l=l.slice(74);}return o+l;}
  window.addToCalendar=function(id){
    var e=(DB.get('events')||[]).find(function(x){return x.id===id;});
    var d=e&&evStart(e);
    if(!e||!d){toast('Akci se nepodařilo najít','error');return;}
    var end=new Date(d.getTime()+2*3600000);
    var tp=(EV_TYPES[e.type]||EV_TYPES.other)[0];
    var stamp=new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d+/,'');
    var desc=tp+(e.note?'\n'+e.note:'');
    var L=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//TSC//Frakce//CS','CALSCALE:GREGORIAN','BEGIN:VEVENT',
      'UID:'+e.id+'@tsc-frakce','DTSTAMP:'+stamp,'DTSTART:'+icsLocal(d),'DTEND:'+icsLocal(end),
      'SUMMARY:'+icsEsc(e.title)];
    if(e.place)L.push('LOCATION:'+icsEsc(e.place));
    L.push('DESCRIPTION:'+icsEsc(desc),
      'BEGIN:VALARM','TRIGGER:-PT30M','ACTION:DISPLAY','DESCRIPTION:'+icsEsc(e.title),'END:VALARM',
      'END:VEVENT','END:VCALENDAR');
    var txt=L.map(fold).join('\r\n')+'\r\n';
    var a=document.createElement('a');
    a.href=URL.createObjectURL(new Blob([txt],{type:'text/calendar;charset=utf-8'}));
    a.download=(String(e.title).replace(/[^\w\u00C0-\u017F-]+/g,'_').slice(0,40)||'akce')+'.ics';
    document.body.appendChild(a);a.click();a.remove();
    setTimeout(function(){URL.revokeObjectURL(a.href);},4000);
    toast('Událost stažena — otevři ji a ulož do kalendáře','success');
  };
  var _ev=window.evCard;
  if(typeof _ev==='function'){
    window.evCard=function(e){
      var h=_ev.apply(this,arguments);
      if(!e||!e.id||typeof h!=='string')return h;
      var btn='<div class="ev-ics"><button class="btn-micro" onclick="addToCalendar(\''+e.id+'\')">📅 PŘIDAT DO KALENDÁŘE</button></div>';
      var i=h.lastIndexOf('</div>');
      return i<0?h:h.slice(0,i)+btn+h.slice(i);
    };
  }

  function makeFilter(host,id,placeholder,itemSel){
    if(!host||document.getElementById(id))return;
    var i=document.createElement('input');
    i.id=id;i.type='search';i.className='wh-search lux-find';i.placeholder=placeholder;i.setAttribute('aria-label',placeholder);
    host.parentNode.insertBefore(i,host);
    var none=document.createElement('div');none.className='empty-s lux-find-none';none.style.display='none';none.textContent='// Nic nenalezeno';
    host.parentNode.insertBefore(none,host.nextSibling);
    function apply(){
      var q=norm(i.value.trim()),n=0,tot=0;
      host.querySelectorAll(itemSel).forEach(function(el){
        tot++;var ok=!q||norm(el.textContent).indexOf(q)!==-1;
        el.style.display=ok?'':'none';if(ok)n++;
      });
      none.style.display=(q&&tot&&!n)?'':'none';
    }
    i.oninput=apply;i._apply=apply;
  }
  function reapply(id){var i=document.getElementById(id);if(i&&i._apply)i._apply();}
  makeFilter(document.getElementById('contactsList'),'contactQ','🔍 Hledat kontakt (přezdívka, jméno, číslo)…','.contact-card');
  makeFilter(document.getElementById('rosterMember'),'rosterQ','🔍 Hledat v crew listu (jméno, přezdívka, hodnost)…','tbody tr');
  makeFilter(document.getElementById('rosterAdmin'),'rosterQA','🔍 Hledat v crew listu (jméno, přezdívka, hodnost)…','tbody tr');
  var _rc=window.renderContacts;
  if(typeof _rc==='function')window.renderContacts=function(){var r=_rc.apply(this,arguments);reapply('contactQ');return r;};
  var _rr=window.renderRoster;
  if(typeof _rr==='function')window.renderRoster=function(admin){var r=_rr.apply(this,arguments);reapply(admin?'rosterQA':'rosterQ');return r;};

  var lowOnly={m:false,a:false},ctx=null;
  function isLow(i){return i.qty===0||(i.min>0&&i.qty<=i.min);}
  var _wv=window.whView;
  if(typeof _wv==='function'){
    window.whView=function(items){
      var out=_wv.apply(this,arguments);
      return (ctx&&lowOnly[ctx])?out.filter(isLow):out;
    };
  }
  function wrapWh(name,scope){
    var o=window[name];if(typeof o!=='function')return;
    window[name]=function(){
      ctx=scope;
      try{var r=o.apply(this,arguments);}finally{ctx=null;}
      var b=document.querySelector('.wh-lowbtn[data-s="'+scope+'"]');
      if(b){var n=(DB.get('warehouse')||[]).filter(isLow).length;b.firstChild.nodeValue='⚠ JEN MÁLO ZÁSOB ('+n+')';b.classList.toggle('on',lowOnly[scope]);}
      return r;
    };
  }
  wrapWh('renderMemberWarehouse','m');
  wrapWh('renderAdminWarehouse','a');
  document.querySelectorAll('.wh-tools').forEach(function(t){
    if(t.querySelector('.wh-lowbtn'))return;
    var scope=t.closest('#mt-warehouse')?'m':'a';
    var b=document.createElement('button');
    b.className='wh-lowbtn';b.type='button';b.dataset.s=scope;b.appendChild(document.createTextNode('⚠ JEN MÁLO ZÁSOB'));
    b.onclick=function(){
      lowOnly[scope]=!lowOnly[scope];
      var f=window[scope==='m'?'renderMemberWarehouse':'renderAdminWarehouse'];if(f)f();
    };
    t.appendChild(b);
  });

  var KEY='tsc_custom_color';
  function parseHex(s){
    s=String(s||'').trim().replace(/^#/,'');
    if(/^[0-9a-f]{3}$/i.test(s))s=s.replace(/(.)/g,'$1$1');
    if(!/^[0-9a-f]{6}$/i.test(s))return null;
    var n=parseInt(s,16);return [(n>>16)&255,(n>>8)&255,n&255];
  }
  function toHex(c){return '#'+c.map(function(v){return ('0'+Math.max(0,Math.min(255,Math.round(v))).toString(16)).slice(-2);}).join('');}
  function lum(c){return (0.2126*c[0]+0.7152*c[1]+0.0722*c[2])/255;}
  // příliš tmavá barva by na černém pozadí nebyla vidět → ztlumit k bílé
  function readable(c){var k=0;while(lum(c)<0.28&&k++<20)c=c.map(function(v){return v+(255-v)*0.1;});return c.map(Math.round);}
  function applyCustom(rgb,save){
    var c=readable(rgb),hex=toHex(c),dim=toHex(c.map(function(v){return v*0.55;}));
    var r=document.documentElement.style;
    r.setProperty('--acc',hex);r.setProperty('--acc-dim',dim);
    r.setProperty('--acc-glow',hex+'22');r.setProperty('--acc-dark',hex+'0d');
    if(save)lsSet(KEY,toHex(rgb));
  }
  var saved=parseHex(lsGet(KEY));
  if(saved)applyCustom(saved,false);
  function enhancePop(pop){
    if(pop.querySelector('.theme-custom'))return;
    pop.classList.add('has-custom');
    var cur=parseHex(lsGet(KEY))||parseHex(getComputedStyle(document.documentElement).getPropertyValue('--acc'))||[196,154,20];
    var w=document.createElement('div');w.className='theme-custom';
    w.innerHTML='<div class="tc-lbl">VLASTNÍ BARVA</div>'+
      '<div class="tc-row"><input type="color" class="tc-pick" aria-label="Výběr barvy"/><input type="text" class="tc-hex" maxlength="7" placeholder="#c49a14" aria-label="HEX"/></div>'+
      '<div class="tc-row tc-rgb"><label>R<input type="number" min="0" max="255" class="tc-r"/></label><label>G<input type="number" min="0" max="255" class="tc-g"/></label><label>B<input type="number" min="0" max="255" class="tc-b"/></label></div>'+
      '<button type="button" class="tc-reset">↺ VRÁTIT ZLATOU</button>';
    pop.appendChild(w);
    w.addEventListener('click',function(e){e.stopPropagation();}); // jinak by klik zavřel okno
    var pick=w.querySelector('.tc-pick'),hex=w.querySelector('.tc-hex'),
        R=w.querySelector('.tc-r'),G=w.querySelector('.tc-g'),B=w.querySelector('.tc-b');
    function fill(c,except){
      if(except!=='pick')pick.value=toHex(c);
      if(except!=='hex')hex.value=toHex(c);
      if(except!=='rgb'){R.value=c[0];G.value=c[1];B.value=c[2];}
    }
    function set(c,except){fill(c,except);applyCustom(c,true);pop.querySelectorAll('.theme-dot').forEach(function(d){d.classList.remove('on');});}
    fill(cur);
    pick.oninput=function(){var c=parseHex(pick.value);if(c)set(c,'pick');};
    hex.oninput=function(){var c=parseHex(hex.value);if(c)set(c,'hex');};
    function fromRgb(){
      var c=[R,G,B].map(function(x){var v=parseInt(x.value,10);return isNaN(v)?0:Math.max(0,Math.min(255,v));});
      set(c,'rgb');
    }
    R.oninput=G.oninput=B.oninput=fromRgb;
    w.querySelector('.tc-reset').onclick=function(){
      try{localStorage.removeItem(KEY);}catch(e){}
      var r=document.documentElement.style;
      r.setProperty('--acc','#c49a14');r.setProperty('--acc-dim','#7a6010');r.setProperty('--acc-glow','#c49a1422');r.setProperty('--acc-dark','#c49a140d');
      lsSet('tsc_theme','0');fill([196,154,20]);
    };
    // výběr hotového motivu zruší vlastní barvu
    pop.querySelectorAll('.theme-dot').forEach(function(d){
      d.addEventListener('click',function(){try{localStorage.removeItem(KEY);}catch(e){}});
    });
    var rc=pop.getBoundingClientRect();
    if(rc.right>innerWidth-8)pop.style.left=Math.max(8,innerWidth-rc.width-8)+'px';
    if(rc.bottom>innerHeight-8)pop.style.top=Math.max(8,innerHeight-rc.height-8)+'px';
  }
  new MutationObserver(function(list){
    list.forEach(function(m){m.addedNodes.forEach(function(n){
      if(n.nodeType===1&&n.classList&&n.classList.contains('theme-pop'))enhancePop(n);
    });});
  }).observe(document.body,{childList:true});
})();

(function(){
  var g=function(id){return document.getElementById(id);};

  /*GEN_START*/
  var UP='ABCDEFGHJKLMNPQRSTUVWXYZ',LO='abcdefghijkmnopqrstuvwxyz',DG='23456789'; 
  function rnd(n){ 
    var a=new Uint32Array(1),lim=Math.floor(4294967296/n)*n;
    do{crypto.getRandomValues(a);}while(a[0]>=lim);
    return a[0]%n;
  }
  function genPass(){
    var all=UP+LO+DG,c=[UP[rnd(UP.length)],LO[rnd(LO.length)],DG[rnd(DG.length)]];
    while(c.length<12)c.push(all[rnd(all.length)]);
    for(var i=c.length-1;i>0;i--){var j=rnd(i+1),t=c[i];c[i]=c[j];c[j]=t;}
    return c.slice(0,4).join('')+'-'+c.slice(4,8).join('')+'-'+c.slice(8).join('');
  }

  function copyText(txt,okMsg){
    function ok(){if(typeof toast==='function')toast(okMsg,'success');}
    function fb(){
      var t=document.createElement('textarea');t.value=txt;t.style.cssText='position:fixed;opacity:0';
      document.body.appendChild(t);t.select();try{document.execCommand('copy');ok();}catch(e){}t.remove();
    }
    if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(txt).then(ok,fb);else fb();
  }

  function addGenRow(inputIds){
    var first=g(inputIds[0]);if(!first||first.dataset.gen)return;
    first.dataset.gen='1';
    var fg=first.closest('.field-group');if(!fg)return;
    var row=document.createElement('div');row.className='gen-row';
    row.innerHTML='<button type="button" class="gen-b gen-go">🎲 GENEROVAT</button><button type="button" class="gen-b gen-eye">👁 ZOBRAZIT</button><button type="button" class="gen-b gen-cp">📋 KOPÍROVAT</button>';
    fg.appendChild(row);
    function els(){return inputIds.map(g).filter(Boolean);}
    function show(v){els().forEach(function(e){e.type=v?'text':'password';});row.querySelector('.gen-eye').firstChild.nodeValue=v?'🙈 SKRÝT':'👁 ZOBRAZIT';}
    row.querySelector('.gen-go').onclick=function(){var p=genPass();els().forEach(function(e){e.value=p;});show(true);};
    row.querySelector('.gen-eye').onclick=function(){show(first.type==='password');};
    row.querySelector('.gen-cp').onclick=function(){if(!first.value){toast('Nejdřív vygeneruj heslo','error');return;}copyText(first.value,'Heslo zkopírováno ✓');};
  }
  addGenRow(['nm-pass']);
  addGenRow(['pw-new','pw-confirm']);

  // okno s hotovou zprávou pro nového člena
  function showCredentials(o){
    var old=document.querySelector('.cred-ov');if(old)old.remove();
    var msg='Ahoj'+(o.name?' '+o.name:'')+', tady jsou tvoje přihlašovací údaje do portálu:\n\n'+
      '🌐 Web: '+location.origin+'\n📧 E-mail: '+o.email+'\n🔑 Heslo: '+o.pass+'\n\n'+
      'Heslo je dočasné — po prvním přihlášení si ho změň na vlastní (okno se nabídne samo, jde i přes 🔑 v menu).';
    var ov=document.createElement('div');ov.className='modal-ov cred-ov';ov.setAttribute('role','dialog');ov.setAttribute('aria-modal','true');
    ov.innerHTML='<div class="modal-box" style="max-width:460px;width:94vw">'+
      '<div class="modal-title">'+(o.reset?'🔑 HESLO ZMĚNĚNO':'✅ ÚČET VYTVOŘEN')+'</div>'+
      '<div style="font-size:.9rem;line-height:1.5;color:var(--textb);margin-bottom:.6rem">Zkopíruj zprávu a pošli ji člověku <b>v soukromé zprávě</b>. Po zavření okna se heslo už nezobrazí.</div>'+
      '<textarea class="cred-ta" readonly rows="9"></textarea>'+
      '<div class="modal-ftr"><button class="btn-acc small cred-cp">📋 KOPÍROVAT ZPRÁVU</button><button class="btn-ghost small cred-x">ZAVŘÍT</button></div></div>';
    document.body.appendChild(ov);
    var ta=ov.querySelector('.cred-ta');ta.value=msg;
    function close(){document.removeEventListener('keydown',key,true);ov.remove();}
    function key(e){if(e.key==='Escape'){e.stopPropagation();close();}}
    document.addEventListener('keydown',key,true);
    ov.querySelector('.cred-x').onclick=close;
    ov.addEventListener('mousedown',function(e){if(e.target===ov)close();});
    ov.querySelector('.cred-cp').onclick=function(){copyText(msg,'Zpráva zkopírována ✓');};
    ta.focus();ta.select();
  }

  var _cm=window.createMember;
  if(typeof _cm==='function'){
    window.createMember=async function(){
      var email=((g('nm-email')||{}).value||'').trim().toLowerCase(),pass=(g('nm-pass')||{}).value||'',name=((g('nm-name')||{}).value||'').trim();
      var had=(DB.get('members')||[]).some(function(m){return (m.email||'').toLowerCase()===email;});
      var r=await _cm.apply(this,arguments);
      try{
        var ok=!had&&email&&(DB.get('members')||[]).some(function(m){return (m.email||'').toLowerCase()===email;});
        if(ok&&pass)showCredentials({email:email,pass:pass,name:name});
      }catch(e){}
      return r;
    };
  }

  var _cp=window.changePassword;
  if(typeof _cp==='function'){
    window.changePassword=async function(){
      var id=(g('pw-member')||{}).value,pass=(g('pw-new')||{}).value||'';
      var r=await _cp.apply(this,arguments);
      try{
        var st=(g('pwStatus')||{}).textContent||'';
        if(/^\/\/ HESLO ZMĚNĚNO/.test(st)){
          var m=(DB.get('members')||[]).find(function(x){return x.id===id;});
          if(m&&pass)showCredentials({email:m.email||'',pass:pass,name:m.displayName,reset:true});
        }
      }catch(e){}
      return r;
    };
  }
})();

(function(){
  var MIN_DAYS=4;
  window.onVacation=function(mid,wk){
    var days=0;
    (DB.get('excuses')||[]).forEach(function(e){
      if(e.memberId!==mid||e.status!=='accepted'||!e.date)return;
      var a=new Date(e.date+'T12:00:00'),b=new Date((e.dateTo||e.date)+'T12:00:00');
      if(isNaN(a)||isNaN(b)||b<a||(b-a)/864e5>366)return;
      for(var x=new Date(a);x<=b;x.setDate(x.getDate()+1))if(weekKeyOf(x)===wk)days++;
    });
    return days>=MIN_DAYS;
  };

  var from=document.getElementById('excDate'),len=document.getElementById('excLength');
  if(from&&len&&!document.getElementById('excDateTo')){
    var fg=from.closest('.field-group');
    fg.querySelector('.fl').textContent='DATUM — OD';
    var g=document.createElement('div');g.className='field-group';
    g.innerHTML='<label class="fl">DATUM — DO (poslední den nepřítomnosti)</label><div class="iw"><span class="ip">&gt;_</span><input type="date" id="excDateTo"/></div>';
    fg.after(g);
    var evG=document.getElementById('excEvent').closest('.field-group');if(evG)evG.classList.add('fg-full');
    var to=document.getElementById('excDateTo');
    len.placeholder='doplní se samo z dat Od–Do (jde i přepsat ručně)';

    var d=function(v){return v?new Date(v+'T12:00:00'):null;};
    var fmt=function(x){return x.getDate()+'. '+(x.getMonth()+1)+'.';};
    var word=function(n){return n===1?'den':(n>=2&&n<=4?'dny':'dní');};
    var calc=function(){
      to.min=from.value||'';
      var a=d(from.value),b=d(to.value);
      if(!a||!b)return;
      if(b<a){len.value='';return;}
      var days=Math.round((b-a)/864e5)+1;
      len.value=days===1?'1 den ('+fmt(a)+' '+a.getFullYear()+')'
        :days+' '+word(days)+' ('+fmt(a)+' – '+fmt(b)+' '+b.getFullYear()+')';
    };
    ['input','change'].forEach(function(ev){from.addEventListener(ev,calc);to.addEventListener(ev,calc);});

    var _se=window.submitExcuse;
    if(typeof _se==='function'){
      window.submitExcuse=function(){
        var a=d(from.value),b=d(to.value),toVal=to.value,n0=(DB.get('excuses')||[]).length;
        if(a&&b&&b<a){
          var st=document.getElementById('excStatus');
          if(st)st.textContent='// "DO" NESMÍ BÝT PŘED "OD"';
          toast('Datum „Do“ je dřív než „Od“','error');return;
        }
        var r=_se.apply(this,arguments);
        var arr=DB.get('excuses')||[];
        if(arr.length>n0){ 
          if(toVal){arr[arr.length-1].dateTo=toVal;DB.set('excuses',arr);}
          to.value='';
        }
        return r;
      };
    }
  }

  function paintRange(hostId,list){
    var cards=document.querySelectorAll('#'+hostId+' .excuse-card');
    list.slice().reverse().forEach(function(e,i){
      var c=cards[i];if(!c||!e.dateTo||e.dateTo===e.date||c.querySelector('.exc-range'))return;
      var det=c.querySelector('.excuse-detail');
      if(det)det.insertAdjacentHTML('afterend','<div class="excuse-detail exc-range">🌴 Nepřítomnost do: <strong>'+esc(e.dateTo)+'</strong>'+(e.length?' · '+esc(e.length):'')+'</div>');
    });
  }
  var _rae=window.renderAdminExcuses;
  if(typeof _rae==='function')window.renderAdminExcuses=function(){
    var r=_rae.apply(this,arguments);paintRange('allExcuses',DB.get('excuses')||[]);return r;
  };
  var _rme=window.renderMyExcuses;
  if(typeof _rme==='function')window.renderMyExcuses=function(){
    var r=_rme.apply(this,arguments),m=getMember();
    if(m)paintRange('myExcuses',(DB.get('excuses')||[]).filter(function(e){return e.memberId===m.id;}));
    return r;
  };

  /* D) Finance: dovolená = příspěvek se nepočítá */
  var _rmf=window.renderMyFinance;
  if(typeof _rmf==='function')window.renderMyFinance=function(){
    var r=_rmf.apply(this,arguments),m=getMember();
    if(m&&onVacation(m.id,getWeekKey())){
      var row=document.querySelector('#myFinance .fa-pay-row');
      if(row&&/Povinný týdenní/.test(row.textContent)){
        row.className='fa-pay-row paid';
        row.innerHTML='<span class="fa-pay-name">Povinný týdenní příspěvek</span><span class="fa-pay-status paid">🌴 DOVOLENÁ — NEPLATÍŠ</span>';
      }
    }
    return r;
  };
  var _ub=window.updateBadges;
  if(typeof _ub==='function')window.updateBadges=function(){
    var r=_ub.apply(this,arguments),m=getMember();
    if(m&&onVacation(m.id,getWeekKey())){var fb=document.getElementById('financeBadge');if(fb)fb.classList.remove('visible');}
    return r;
  };
  var _raf=window.renderAdminFinance;
  if(typeof _raf==='function')window.renderAdminFinance=function(){
    var r=_raf.apply(this,arguments),wk=getWeekKey();
    var box=[].slice.call(document.querySelectorAll('#financeAdminPanel .fa-member-payments')).filter(function(b){
      var t=b.querySelector('.fa-exp-title');return t&&t.textContent.indexOf('// TÝDENNÍ PŘÍSPĚVEK')===0;})[0];
    if(box)(DB.get('members')||[]).forEach(function(m){
      if(!onVacation(m.id,wk))return;
      [].forEach.call(box.querySelectorAll('.fa-pay-row.unpaid'),function(row){
        var n=row.querySelector('.fa-pay-name');
        if(n&&n.textContent===m.displayName){
          row.className='fa-pay-row paid';
          row.lastElementChild.innerHTML='<span class="fa-pay-status paid">🌴 DOVOLENÁ</span>';
        }
      });
    });
    return r;
  };
})();

(function(){
  var DEF_TPL='{prezdivka} - {tyden}';
  function acc(){return DB.get('bankacc')||{};}
  function boss(){var m=getMember();return !!m&&m.position==='Mastermind';}
  function tplOf(){return DEF_TPL;} 
  function feeRow(){
    var fs=DB.get('finsettings')||{},f=Number(fs.weeklyFee)||0;if(f<=0)return '';
    var D=['neděle','pondělí','úterý','středa','čtvrtek','pátek','sobota'];
    return '<div class="bank-meta"><span>TÝDENNÍ PŘÍSPĚVEK</span><b>'+money(f)+' · splatnost: '+D[parseInt(fs.feeDay)||0]+'</b></div>';
  }
  function wk(){var w=(getWeekKey().split('W')[1]||'');return 'W'+(w.length<2?'0'+w:w);}
  function fill(tpl,m){
    var n=(typeof rosterNames==='function')?rosterNames(m):{nick:''};
    return String(tpl||'').replace(/\{jmeno\}/gi,m.displayName).replace(/\{prezdivka\}/gi,n.nick||m.displayName).replace(/\{tyden\}/gi,wk()).trim();
  }
  function copyTxt(txt,msg){
    function ok(){toast(msg,'success');}
    function fb(){var t=document.createElement('textarea');t.value=txt;t.style.cssText='position:fixed;opacity:0';document.body.appendChild(t);t.select();try{document.execCommand('copy');ok();}catch(e){}t.remove();}
    if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(txt).then(ok,fb);else fb();
  }

  function cardHtml(admin){
    var a=acc(),num=String(a.number||'').trim(),me=getMember(),tpl=tplOf(a);
    var head='<div class="bank-head"><span class="bank-t">🏦 // BANKOVNÍ ÚČET FRAKCE</span>'+
      (boss()?'<button class="btn-acc small" data-bank="edit">✎ UPRAVIT</button>':'')+'</div>';
    if(!num)return head+'<div class="bank-empty">'+(boss()?'Účet zatím není nastavený — klikni na „UPRAVIT“.':'Vedení zatím nenastavilo číslo účtu.')+'</div>';
    var h=head+
      '<div class="bank-row"><div class="bank-num">'+esc(num)+'</div><button class="btn-micro" data-bank="copy">📋 KOPÍROVAT</button></div>'+
      (a.holder?'<div class="bank-meta"><span>MAJITEL</span><b>'+esc(a.holder)+'</b></div>':'')+feeRow();
    var mine=(me&&tpl)?fill(tpl,me):'';
    if(mine)h+='<div class="bank-ref"><span>POZNÁMKA PRO PLATBU — NAPIŠ PŘESNĚ TAKTO</span><div class="bank-refrow"><code>'+esc(mine)+'</code><button class="btn-micro" data-bank="copyref" data-ref="'+esc(mine)+'">📋 KOPÍROVAT</button></div></div>';
    if(a.note)h+='<div class="bank-note">'+esc(a.note)+'</div>';
    if(admin&&tpl){
      var ms=(DB.get('members')||[]).filter(function(x){return !x.hidden;});
      h+='<details class="bank-all"><summary>👥 POZNÁMKY PLATEB VŠECH ČLENŮ ('+ms.length+')</summary>'+ms.map(function(x){
        var t=fill(tpl,x);
        return '<div class="bank-li"><span class="n">'+esc(x.displayName)+'</span><code>'+esc(t)+'</code><button class="btn-micro" data-bank="copyref" data-ref="'+esc(t)+'">📋</button></div>';
      }).join('')+'</details>';
    }
    if(a.by)h+='<div class="bank-by">// naposledy upravil '+esc(a.by)+(a.date?' — '+esc(a.date):'')+'</div>';
    return h;
  }
  var openAll=false;
  function paint(id,beforeId,admin){
    var before=document.getElementById(beforeId);if(!before)return;
    var c=document.getElementById(id);
    if(!c){c=document.createElement('div');c.id=id;c.className='bank-card';before.parentNode.insertBefore(c,before);}
    var d=c.querySelector('.bank-all');if(d)openAll=d.open;
    c.innerHTML=cardHtml(admin);
    d=c.querySelector('.bank-all');if(d&&openAll)d.open=true;
  }
  function paintAll(){paint('bankCardM','myFinance',false);paint('bankCardA','financeAdminPanel',true);}

  var _rmf=window.renderMyFinance;
  if(typeof _rmf==='function')window.renderMyFinance=function(){var r=_rmf.apply(this,arguments);paint('bankCardM','myFinance',false);return r;};
  var _raf=window.renderAdminFinance;
  if(typeof _raf==='function')window.renderAdminFinance=function(){var r=_raf.apply(this,arguments);paint('bankCardA','financeAdminPanel',true);return r;};

  function openEdit(){
    if(!boss()){toast('Číslo účtu může měnit jen Mastermind','error');return;}
    var a=acc(),old=document.querySelector('.bank-ov');if(old)old.remove();
    var ov=document.createElement('div');ov.className='modal-ov bank-ov';ov.setAttribute('role','dialog');ov.setAttribute('aria-modal','true');
    ov.innerHTML='<div class="modal-box" style="max-width:460px;width:94vw;max-height:92vh;overflow-y:auto"><div class="modal-title">🏦 BANKOVNÍ ÚČET FRAKCE</div>'+
      '<div class="field-group"><label class="fl">ČÍSLO ÚČTU *</label><div class="iw"><span class="ip">#</span><input type="text" id="bkNum" maxlength="60"/></div></div>'+
      '<div class="field-group" style="margin-top:.7rem"><label class="fl">MAJITEL / NÁZEV ÚČTU</label><div class="iw"><span class="ip">&gt;_</span><input type="text" id="bkHolder" maxlength="80"/></div></div>'+
      '<div class="field-group" style="margin-top:.7rem"><label class="fl">POZNÁMKA PRO PLATBY (pevná)</label>'+
        '<div class="bank-hint">Každý člen píše do poznámky platby: <b>Přezdívka - WXX</b> (jeho přezdívka a číslo aktuálního týdne). Nastavuje se samo, nejde měnit.</div>'+
        '<div class="bank-prev" id="bkPrev"></div></div>'+
      '<div class="field-group" style="margin-top:.7rem"><label class="fl">DODATEČNÁ INFO PRO ČLENY (nepovinné)</label><textarea id="bkNote" class="adm-ta" maxlength="300" style="min-height:70px" placeholder="např. Částku neměň, platbu pošli nejpozději v neděli."></textarea></div>'+
      '<label style="display:flex;gap:.4rem;align-items:center;margin-top:.6rem;font:.6rem \'Share Tech Mono\',monospace;color:var(--text);cursor:pointer"><input type="checkbox" id="bkDc" checked/> OZNÁMIT ZMĚNU NA DISCORDU</label>'+
      '<div id="bkMsg" class="smsg" style="margin-top:.4rem;min-height:1em;color:#e05555"></div>'+
      '<div class="modal-ftr"><button class="btn-acc small" id="bkOk">ULOŽIT</button><button class="btn-ghost small" id="bkNo">ZRUŠIT</button></div></div>';
    document.body.appendChild(ov);
    var N=ov.querySelector('#bkNum'),H=ov.querySelector('#bkHolder'),T=ov.querySelector('#bkNote'),V=ov.querySelector('#bkPrev');
    N.value=a.number||'';H.value=a.holder||'';T.value=a.note||'';
    function prev(){var me=getMember(),t=me?fill(DEF_TPL,me):'';V.innerHTML='Náhled pro tebe: <code>'+esc(t)+'</code>';}
    prev();
    function close(){document.removeEventListener('keydown',key,true);ov.remove();}
    function key(e){if(e.key==='Escape'){e.stopPropagation();close();}}
    document.addEventListener('keydown',key,true);
    ov.querySelector('#bkNo').onclick=close;
    ov.addEventListener('mousedown',function(e){if(e.target===ov)close();});
    ov.querySelector('#bkOk').onclick=function(){
      if(!boss()){toast('Číslo účtu může měnit jen Mastermind','error');return;}
      var num=N.value.trim();
      if(!num){ov.querySelector('#bkMsg').textContent='// ZADEJ ČÍSLO ÚČTU';N.focus();return;}
      var me=getMember(),prevNum=acc().number||'';
      var data={number:num,holder:H.value.trim(),note:T.value.trim(),by:me.displayName,date:nowStr()};
      DB.set('bankacc',data);
      var dc=ov.querySelector('#bkDc').checked;
      addLog('fin',me.displayName+' změnil bankovní účet frakce'+(prevNum&&prevNum!==num?' ('+prevNum+' → '+num+')':'')+'.',dc?{
        embed:rich(C_YELLOW,'🏦 BANKOVNÍ ÚČET FRAKCE',data.note||null,[['🔢 Číslo účtu','`'+num+'`'],['👤 Majitel',data.holder||'—'],['📝 Poznámka k platbě','`Přezdívka - WXX`'],['🧑 Změnil',me.displayName]],{by:me.displayName})
      }:{noDiscord:true});
      toast('Bankovní účet uložen ✓','success');
      close();paintAll();
    };
    N.focus();
  }

  document.addEventListener('click',function(e){
    var b=e.target.closest&&e.target.closest('[data-bank]');if(!b)return;
    var k=b.getAttribute('data-bank');
    if(k==='edit')openEdit();
    else if(k==='copy'){var n=String(acc().number||'').trim();if(n)copyTxt(n,'Číslo účtu zkopírováno ✓');}
    else if(k==='copyref'){var t=b.getAttribute('data-ref');if(t)copyTxt(t,'Text do poznámky zkopírován ✓');}
  });
})();

;

/* ===== wow.js ===== */
(function(){
  var reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
  function holo(box){
    if(box.dataset.holo)return;box.dataset.holo='1';
    box.addEventListener('pointermove',function(e){
      if(e.pointerType==='touch')return;
      var r=box.getBoundingClientRect(),x=(e.clientX-r.left)/r.width,y=(e.clientY-r.top)/r.height;
      box.style.setProperty('--hx',(x*100)+'%');box.style.setProperty('--hy',(y*100)+'%');
      box.style.setProperty('--fx',(x*100)+'%');
      if(!reduce){box.style.setProperty('--rx',((.5-y)*7).toFixed(2)+'deg');box.style.setProperty('--ry',((x-.5)*9).toFixed(2)+'deg');}
    });
    box.addEventListener('pointerleave',function(){
      box.style.setProperty('--rx','0deg');box.style.setProperty('--ry','0deg');box.style.setProperty('--fx','-30%');
    });
  }
  new MutationObserver(function(list){
    list.forEach(function(m){m.addedNodes.forEach(function(n){
      if(n.nodeType===1&&n.classList&&n.classList.contains('prof-ov')){var b=n.querySelector('.prof-box');if(b)holo(b);}
    });});
  }).observe(document.body,{childList:true});

  var cv=null,cx=null,parts=[],run=false,W=0,H=0,D=1;
  function rgb(){
    var h=(getComputedStyle(document.documentElement).getPropertyValue('--acc')||'#c49a14').trim().replace('#','');
    if(h.length===3)h=h.replace(/(.)/g,'$1$1');var n=parseInt(h,16);
    return isNaN(n)?[196,154,20]:[(n>>16)&255,(n>>8)&255,n&255];
  }
  function palette(){
    var c=rgb(),lt=c.map(function(v){return Math.round(v+(255-v)*.55);}),dk=c.map(function(v){return Math.round(v*.7);});
    return [c,lt,dk,[255,248,225]].map(function(a){return 'rgb('+a.join(',')+')';});
  }
  function size(){D=Math.min(2,devicePixelRatio||1);W=innerWidth;H=innerHeight;cv.width=W*D;cv.height=H*D;cx.setTransform(D,0,0,D,0,0);}
  function mk(x,y,vx,vy,g,cols,rain){
    return {x:x,y:y,vx:vx,vy:vy,g:g,w:5+Math.random()*7,h:4+Math.random()*6,r:Math.random()*6.28,vr:(Math.random()-.5)*.3,
      c:cols[Math.floor(Math.random()*cols.length)],coin:Math.random()<.35,ph:Math.random()*6.28,vp:.08+Math.random()*.12,rain:rain};
  }
  function burst(){
    if(reduce)return;
    if(!cv){cv=document.createElement('canvas');cv.id='wowConfetti';document.body.appendChild(cv);cx=cv.getContext('2d');size();}
    var cols=palette(),i;
    for(i=0;i<150;i++)parts.push(mk(Math.random()*W,-20-Math.random()*H*.5,(Math.random()-.5)*2.4,1.5+Math.random()*3.5,.045,cols,true));
    for(i=0;i<55;i++){
      parts.push(mk(0,H,3+Math.random()*7,-(11+Math.random()*9),.26,cols,false));
      parts.push(mk(W,H,-(3+Math.random()*7),-(11+Math.random()*9),.26,cols,false));
    }
    if(!run){run=true;requestAnimationFrame(loop);}
  }
  function loop(){
    if(!cv)return;
    cx.clearRect(0,0,W,H);
    parts=parts.filter(function(p){return p.y<H+30;});
    parts.forEach(function(p){
      p.vy+=p.g;p.vx*=p.rain?.998:.985;if(!p.rain)p.vy*=.99;
      p.x+=p.vx+Math.sin(p.ph)*(p.rain?.6:0);p.y+=p.vy;p.r+=p.vr;p.ph+=p.vp;
      cx.fillStyle=p.c;
      if(p.coin){cx.beginPath();cx.ellipse(p.x,p.y,Math.max(.6,Math.abs(Math.cos(p.ph))*p.w/1.5),p.w/1.5,0,0,6.283);cx.fill();}
      else{cx.save();cx.translate(p.x,p.y);cx.rotate(p.r);cx.scale(1,Math.abs(Math.cos(p.ph))*.9+.1);cx.fillRect(-p.w/2,-p.h/2,p.w,p.h);cx.restore();}
    });
    if(!parts.length){run=false;cv.remove();cv=null;cx=null;return;}
    requestAnimationFrame(loop);
  }
  window.tscBurst=burst;
  addEventListener('resize',function(){if(cv)size();});
  var _t=window.toast;
  if(typeof _t==='function'){
    window.toast=function(msg){
      var r=_t.apply(this,arguments);
      try{
        var s=String(msg||'');
        if(/^Pochvala odeslána/.test(s)||/^Povýšeno na/.test(s))burst();
        else if(/^Heist report odeslán/.test(s)){var a=DB.get('heists')||[],h=a[a.length-1];if(h&&h.escaped)burst();}
      }catch(e){}
      return r;
    };
  }

  var prev={},C=251.33;
  function pct(a,b){return b?Math.round(a/b*100):null;}
  function data(){
    var heists=DB.get('heists')||[],ok=heists.filter(function(h){return h.escaped;}).length;
    var ms=(DB.get('members')||[]).filter(function(m){return !m.hidden;});
    var fin=DB.get('finance')||{payments:[]},wk=getWeekKey();
    ms=ms.filter(function(m){return !(window.onVacation&&onVacation(m.id,wk));});
    var paid=ms.filter(function(m){return (fin.payments||[]).some(function(p){return p.memberId===m.id&&p.weekKey===wk&&(p.expenseId==='weekly'||!p.expenseId);});}).length;
    var wh=DB.get('warehouse')||[],good=wh.filter(function(i){return !(i.qty===0||(i.min>0&&i.qty<=i.min));}).length;
    var came=0,abs=0;
    (DB.get('events')||[]).forEach(function(e){Object.keys(e.att||{}).forEach(function(k){if(e.att[k]==='came')came++;else if(e.att[k]==='absent')abs++;});});
    return [
      {k:'heist',ic:'💎',l:'ÚSPĚŠNOST HEISTŮ',p:pct(ok,heists.length),s:ok+' z '+heists.length+' ujelo'},
      {k:'pay',ic:'💵',l:'PŘÍSPĚVKY TENTO TÝDEN',p:pct(paid,ms.length),s:paid+' z '+ms.length+' zaplatilo'},
      {k:'wh',ic:'📦',l:'SKLAD V POŘÁDKU',p:pct(good,wh.length),s:good+' z '+wh.length+' položek'},
      {k:'att',ic:'📋',l:'DOCHÁZKA NA AKCÍCH',p:pct(came,came+abs),s:came+' příchodů · '+abs+' absencí'}
    ];
  }
  function countTo(el,from,to){
    if(reduce||from===to){el.textContent=to+'%';return;}
    var t0=performance.now();
    (function f(t){
      var k=Math.min(1,(t-t0)/1000),e=1-Math.pow(1-k,3);
      el.textContent=Math.round(from+(to-from)*e)+'%';
      if(k<1&&document.body.contains(el))requestAnimationFrame(f);
    })(t0);
  }
  function renderPulse(){
    var host=document.getElementById('statsBody');if(!host||typeof DB==='undefined'||!getMember())return;
    var old=document.getElementById('pulse');if(old)old.remove();
    var d=data(),box=document.createElement('div');box.id='pulse';box.className='pulse';
    box.innerHTML='<div class="pulse-t">// PULS FRAKCE</div>'+d.map(function(x){
      var p=x.p==null?0:x.p,from=prev[x.k]==null?0:prev[x.k];
      var cls=x.p==null?'na':(p>=75?'good':(p>=50?'mid':'bad'));
      return '<div class="pr '+cls+'" data-k="'+x.k+'"><svg viewBox="0 0 100 100"><circle class="t" cx="50" cy="50" r="40"/>'+
        '<circle class="g" cx="50" cy="50" r="40" transform="rotate(-90 50 50)" style="stroke-dashoffset:'+(C*(1-from/100))+'"/></svg>'+
        '<div class="pr-in"><div class="pr-l">'+x.ic+' '+x.l+'</div><b class="pr-v">'+(x.p==null?'—':from+'%')+'</b><div class="pr-s">'+x.s+'</div></div></div>';
    }).join('');
    host.insertBefore(box,host.firstChild);
    void box.offsetWidth;
    d.forEach(function(x){
      var p=x.p==null?0:x.p,from=prev[x.k]==null?0:prev[x.k];
      var card=box.querySelector('[data-k="'+x.k+'"]');if(!card)return;
      card.querySelector('.g').style.strokeDashoffset=C*(1-p/100);
      if(x.p!=null)countTo(card.querySelector('.pr-v'),from,p);
      prev[x.k]=p;
    });
  }

  function intro(){
    if(reduce||document.getElementById('wowIntro'))return;
    var m=getMember();if(!m)return;
    var h=new Date().getHours(),g=h<10?'Dobré ráno':(h<18?'Dobrý den':'Dobrý večer');
    var ov=document.createElement('div');ov.id='wowIntro';
    ov.innerHTML='<div class="wi-in"><div class="wi-logo">T<span class="acc">S</span>C</div><div class="wi-line"></div><div class="wi-hi"></div><div class="wi-name"></div><div class="wi-pos"></div><div class="wi-st">// PŘÍSTUP POVOLEN</div></div>';
    ov.querySelector('.wi-hi').textContent=g+',';
    ov.querySelector('.wi-name').textContent=m.displayName;
    ov.querySelector('.wi-pos').textContent=String(m.position||'').toUpperCase();
    document.body.appendChild(ov);
    var done=false;
    function close(){if(done)return;done=true;ov.classList.add('out');setTimeout(function(){if(ov.parentNode)ov.parentNode.removeChild(ov);},650);}
    ov.addEventListener('click',close);
    setTimeout(close,3100);
  }
  var _ep=window.enterPortal;
  if(typeof _ep==='function'){
    window.enterPortal=async function(session,fresh){
      var r=await _ep.apply(this,arguments);
      if(r&&fresh){try{intro();}catch(e){}}
      return r;
    };
  }

var WEEKS=16;
  function heatmap(){
    var cnt={},tot=0;
    (DB.get('heists')||[]).forEach(function(h){var d=parseCz(h.date);if(d){var k=ymd(d);cnt[k]=(cnt[k]||0)+1;}});
    (DB.get('events')||[]).forEach(function(e){var d=evStart(e);if(d){var k=ymd(d);cnt[k]=(cnt[k]||0)+1;}});
    var now=new Date(),today=new Date(now.getFullYear(),now.getMonth(),now.getDate());
    var mon=new Date(today);mon.setDate(mon.getDate()-((today.getDay()+6)%7)-(WEEKS-1)*7);
    var cells='',DN=['po','út','st','čt','pá','so','ne'];
    for(var w=0;w<WEEKS;w++)for(var r=0;r<7;r++){
      var d=new Date(mon);d.setDate(mon.getDate()+w*7+r);
      if(d>today){cells+='<i class="n"></i>';continue;}
      var k=ymd(d),c=cnt[k]||0,l=c===0?0:(c===1?1:(c===2?2:(c<5?3:4)));tot+=c;
      cells+='<i class="l'+l+(k===ymd(today)?' today':'')+'" title="'+DN[r]+' '+d.getDate()+'. '+(d.getMonth()+1)+'. — '+c+(c===1?' záznam':(c>1&&c<5?' záznamy':' záznamů'))+'"></i>';
    }
    return '<div class="hm">'+cells+'</div><div class="hm-leg">méně <i style="background:var(--surf)"></i><i style="background:color-mix(in srgb,var(--acc) 25%,var(--surf))"></i><i style="background:color-mix(in srgb,var(--acc) 48%,var(--surf))"></i><i style="background:color-mix(in srgb,var(--acc) 72%,var(--surf))"></i><i style="background:var(--acc)"></i> více<b>'+tot+' záznamů za '+WEEKS+' týdnů</b></div>';
  }
  function podium(){
    var hs=(DB.get('heists')||[]).filter(function(h){return inRange(parseCz(h.date));});
    var rows=(DB.get('members')||[]).filter(function(m){return !m.hidden;}).map(function(m){
      return {n:m.displayName,v:hs.filter(function(h){return heistParticipated(h,m.id);}).length};
    }).filter(function(r){return r.v>0;}).sort(function(a,b){return b.v-a.v;}).slice(0,3);
    if(!rows.length)return '<div class="empty-s">// Zatím žádné heisty v tomto období</div>';
    var max=rows[0].v,medals=['🥇','🥈','🥉'],order=rows.length===3?[1,0,2]:(rows.length===2?[1,0]:[0]);
    return '<div class="pod">'+order.map(function(i){
      var r=rows[i],hgt=i===0?100:Math.max(38,Math.round(r.v/max*85));
      return '<div class="pod-c p'+(i+1)+'"><div class="pod-n" title="'+esc(r.n)+'">'+esc(r.n)+'</div><div class="pod-v">'+r.v+' heistů</div><div class="pod-b" style="--h:'+Math.round(hgt*.62)+'%">'+medals[i]+'</div></div>';
    }).join('')+'</div>';
  }
  function renderExtras(){
    var host=document.getElementById('statsBody');if(!host||typeof DB==='undefined'||!getMember())return;
    var old=document.getElementById('wowrow');if(old)old.remove();
    var row=document.createElement('div');row.id='wowrow';row.className='st-grid wowrow';
    row.innerHTML='<div class="st-box"><div class="st-bt-title">// MAPA AKTIVITY <small>(heisty + akce, posledních '+WEEKS+' týdnů)</small></div>'+heatmap()+'</div>'+
      '<div class="st-box"><div class="st-bt-title">// PÓDIUM — NEJVÍC HEISTŮ</div>'+podium()+'</div>';
    var pulse=document.getElementById('pulse');
    host.insertBefore(row,pulse?pulse.nextSibling:host.firstChild);
  }

  var _rs=window.renderStats;
  if(typeof _rs==='function'){
    window.renderStats=function(){var r=_rs.apply(this,arguments);try{renderPulse();renderExtras();}catch(e){console.error('wow',e);}return r;};
  }
})();

;

/* ===== velikost.js ===== */
(function(){
  var KEY='tsc_ui_scale',MIN=80,MAX=150,STEP=5,DEF=100;
  function get(){var v=NaN;try{v=parseInt(localStorage.getItem(KEY),10);}catch(e){}return isNaN(v)?DEF:Math.min(MAX,Math.max(MIN,v));}
  function apply(v){document.documentElement.style.setProperty('--ui',v+'%');try{localStorage.setItem(KEY,String(v));}catch(e){}}
  apply(get());

  function pop(e){
    e.stopPropagation();
    var old=document.querySelector('.size-pop');if(old){old.remove();return;}
    var r=e.currentTarget.getBoundingClientRect(),p=document.createElement('div');p.className='size-pop';
    p.innerHTML='<div class="sp-t">Velikost webu</div>'+
      '<div class="sp-row"><button class="sp-b" data-d="-1" aria-label="Zmenšit">A−</button>'+
      '<input type="range" min="'+MIN+'" max="'+MAX+'" step="'+STEP+'" aria-label="Velikost webu"/>'+
      '<button class="sp-b" data-d="1" aria-label="Zvětšit">A+</button></div>'+
      '<div class="sp-v"></div>'+
      '<div class="sp-h">Změní velikost písma i ovládacích prvků. Nastavení platí jen pro tebe a v tomto prohlížeči.</div>'+
      '<button class="sp-r">Výchozí velikost</button>';
    document.body.appendChild(p);
    var rg=p.querySelector('input'),val=p.querySelector('.sp-v');
    function show(v){rg.value=v;val.textContent=v+' %';}
    function set(v){v=Math.min(MAX,Math.max(MIN,v));apply(v);show(v);}
    show(get());
    rg.oninput=function(){set(parseInt(rg.value,10));};
    p.querySelectorAll('.sp-b').forEach(function(b){b.onclick=function(){set(get()+STEP*parseInt(b.dataset.d,10));};});
    p.querySelector('.sp-r').onclick=function(){set(DEF);};
    function place(){
      var w=p.offsetWidth,h=p.offsetHeight;
      p.style.left=Math.max(8,Math.min(r.left,innerWidth-w-8))+'px';
      p.style.top=(r.bottom+6+h>innerHeight?Math.max(8,r.top-h-6):r.bottom+6)+'px';
    }
    place();
    p.addEventListener('click',function(ev){ev.stopPropagation();});
    setTimeout(function(){document.addEventListener('click',function f(){p.remove();document.removeEventListener('click',f);});},0);
  }
  setInterval(function(){
    document.querySelectorAll('.sb-tools').forEach(function(w){
      if(w.querySelector('.tb.size'))return;
      var b=document.createElement('button');b.className='tb size';b.title='Velikost webu';b.textContent='Aa';b.style.fontWeight='700';
      b.onclick=pop;w.appendChild(b);
    });
  },1000);
  document.addEventListener('keydown',function(e){
    if(!(e.ctrlKey&&e.altKey))return;
    if(e.key==='+'||e.key==='='){e.preventDefault();apply(Math.min(MAX,get()+STEP));}
    else if(e.key==='-'){e.preventDefault();apply(Math.max(MIN,get()-STEP));}
    else if(e.key==='0'){e.preventDefault();apply(DEF);}
  });
})();

;

/* ===== novinky.js: Co je nového, Podnik / Dílna, Rychlé akce ===== */
(function(){
  var VER='2.0',DATE='24. 10. 2026',KEY='tsc_whatsnew';
  var NEWS=[
    ['🔧','Podnik / Dílna','Nová záložka a karta na Oznámeních. Jakmile podnik získáme, vedení přepne stav a objeví se tu odkaz na jeho portál.','NOVÉ'],
    ['⚡','Rychlé akce','Lišta na Oznámeních: heist, příjem do kasy, omluvenka, hlášení a kalendář na jedno kliknutí.','NOVÉ'],
    ['🚀','Rychlejší načítání','Web běží z jednoho skriptu a jednoho stylu, fotky a ikony jsou ve složce images.','NOVÉ'],
    ['⭐','Pochvaly a profil člena','Vedení může chválit členy. V profilu najdeš heisty, docházku, strike i příspěvky.'],
    ['🧮','Rozdělení lootu','Heist report se vyplňuje přes kalkulačku podílů pro členy, vedoucího i frakci.'],
    ['📊','Týdenní souhrn','Každý týden automaticky na Discord: heisty, loot, docházka a neplatiči.'],
    ['🗑','Koš','Smazané položky jde 30 dní vrátit (Administrace → Nastavení).'],
    ['🎨','Vzhled na míru','Barevné motivy, vlastní barva, velikost webu (tlačítko Aa) a hledání přes Ctrl + K.']
  ];
  function $(id){return document.getElementById(id);}
  function safeUrl(u){u=String(u||'').trim();return /^https?:\/\/[^\s"'<>]+$/i.test(u)?u:'';}
  function biz(){
    var b=DB.get('business')||{};
    return {state:b.state==='open'?'open':'soon',name:String(b.name||'Podnik / Dílna'),url:safeUrl(b.url),desc:String(b.desc||''),eta:String(b.eta||'')};
  }
  function canBiz(){var m=getMember();return !!m&&ADMIN_POS.indexOf(m.position)!==-1;}

  /* ── záložka PODNIK (vložení do menu a obsahu) ── */
  (function inject(){
    var nav=document.querySelector('#memberScreen .sb-nav');
    var main=document.querySelector('#memberScreen .main');
    if(!nav||!main||$('mt-business'))return;
    var btn=document.createElement('button');
    btn.className='nb';btn.setAttribute('onclick',"mTab('business',this)");
    btn.innerHTML='<span class="ni">🔧</span><span class="nl">PODNIK</span><span class="biz-tag soon" id="bizTag">BRZY</span>';
    var after=nav.querySelector('.nb[onclick*="\'clothing\'"]');
    if(after)after.insertAdjacentElement('afterend',btn);else nav.appendChild(btn);
    main.insertAdjacentHTML('beforeend','<div id="mt-business" class="mt"><div class="ph"><div class="pt">🔧 // PODNIK / DÍLNA</div></div><div id="bizRoot"></div></div>');
    if(typeof MENU_GROUPS!=='undefined')MENU_GROUPS.business='B';
    if(typeof M_RENDER!=='undefined')M_RENDER.business=renderBiz;
    var gk=document.querySelector('#mt-board .gk-card');
    if(gk)gk.insertAdjacentHTML('afterend',
      '<div class="quick-bar" id="quickBar">'+
        [['💎','NAHLÁSIT HEIST','heist'],['💵','PŘÍJEM DO KASY','finance'],['📝','OMLUVENKA','excuse'],['📢','HLÁŠENÍ','report'],['📅','KALENDÁŘ','calendar']].map(function(q){
          return '<button type="button" class="quick-btn" onclick="goNav(\'m\',\''+q[2]+'\')"><span>'+q[0]+'</span>'+q[1]+'</button>';
        }).join('')+
      '</div><div id="bizCard" class="biz-card soon" onclick="goNav(\'m\',\'business\')"></div>');
  })();

  function renderBiz(){
    var el=$('bizRoot');if(!el)return;
    var b=biz(),open=b.state==='open',pt=document.querySelector('#mt-business .pt');
    if(pt)pt.textContent='🔧 // '+b.name.toUpperCase();
    var h;
    if(open){
      h='<div class="biz-hero open"><div class="biz-ic">🔧</div><div class="biz-t">'+esc(b.name)+'</div><div class="biz-badge open">● OTEVŘENO</div>'+
        '<div class="biz-d">'+esc(b.desc||'Podnik frakce je v provozu.')+'</div>'+
        (b.url?'<a class="btn-acc biz-go-btn" href="'+esc(b.url)+'" target="_blank" rel="noopener noreferrer">OTEVŘÍT PORTÁL ↗</a><div class="biz-url">'+esc(b.url)+'</div>'
              :'<div class="biz-eta">// Odkaz na portál zatím není nastaven — doplní ho vedení.</div>')+'</div>';
    }else{
      h='<div class="biz-hero soon"><div class="biz-ic">🔒</div><div class="biz-t">'+esc(b.name)+'</div><div class="biz-badge soon">PŘIPRAVUJEME</div>'+
        '<div class="biz-d">'+esc(b.desc||'Vlastní podnik frakce. Jakmile ho získáme, objeví se tady odkaz na jeho portál.')+'</div>'+
        (b.eta?'<div class="biz-eta">// '+esc(b.eta)+'</div>':'')+'</div>';
    }
    if(canBiz())h+='<div class="biz-adm">// Stav, název a odkaz se nastavují v Administraci → Nastavení → Podnik / Dílna.</div>';
    el.innerHTML=h;
  }
  var _mt=window.mTab;
  if(typeof _mt==='function')window.mTab=function(tab){var r=_mt.apply(this,arguments);if(tab==='business')renderBiz();return r;};

  function paintBiz(){
    if(!getMember())return;
    var b=biz(),open=b.state==='open',t=$('bizTag'),c=$('bizCard');
    if(t){t.textContent=open?'OPEN':'BRZY';t.className='biz-tag '+(open?'open':'soon');}
    if(c){
      var key=b.state+'|'+b.name;
      if(c.dataset.k!==key){
        c.dataset.k=key;c.className='biz-card '+(open?'open':'soon');
        c.innerHTML='<span class="biz-ci">'+(open?'🔧':'🔒')+'</span><div class="biz-ct"><b>'+esc(b.name)+'</b><small>'+
          (open?'Podnik je otevřený — klikni pro odkaz na portál':'Připravujeme — odkaz se zpřístupní, jakmile podnik získáme')+'</small></div><span class="biz-cg">'+(open?'OTEVŘÍT ↗':'BRZY')+'</span>';
      }
    }
  }
  var _rb=window.renderBoard;
  if(typeof _rb==='function')window.renderBoard=function(){var r=_rb.apply(this,arguments);paintBiz();return r;};

  /* ── nastavení podniku v Administraci ── */
  function renderBizPanel(){
    var host=$('at-settings');if(!host||!canBiz())return;
    var p=$('bizPanel'),b=biz();
    if(!p){
      p=document.createElement('div');p.id='bizPanel';p.className='form-panel';p.style.margin='0 1.2rem 1rem';
      p.innerHTML='<div class="fp-title">// PODNIK / DÍLNA</div><div class="form-grid">'+
        '<div class="field-group"><label class="fl">STAV</label><div class="iw"><span class="ip">&gt;_</span><select id="biz-state"><option value="soon">Připravujeme (zamčeno)</option><option value="open">Otevřeno (máme podnik)</option></select></div></div>'+
        '<div class="field-group"><label class="fl">NÁZEV</label><div class="iw"><span class="ip">&gt;_</span><input type="text" id="biz-name" maxlength="40" placeholder="Podnik / Dílna"/></div></div>'+
        '<div class="field-group fg-full"><label class="fl">ODKAZ NA PORTÁL PODNIKU (https://…)</label><div class="iw"><span class="ip">&gt;_</span><input type="text" id="biz-url" placeholder="https://…"/></div></div>'+
        '<div class="field-group fg-full"><label class="fl">POPIS PRO ČLENY</label><textarea id="biz-desc" class="adm-ta" maxlength="300" style="min-height:70px"></textarea></div>'+
        '<div class="field-group fg-full"><label class="fl">POZNÁMKA „KDY“ (jen když je zamčeno, např. „po zakoupení licence“)</label><div class="iw"><span class="ip">&gt;_</span><input type="text" id="biz-eta" maxlength="60"/></div></div>'+
        '</div><div class="fp-ftr"><button class="btn-acc small" id="bizSave">ULOŽIT</button><span id="bizStatus" class="smsg"></span></div>';
      host.appendChild(p);
      p.querySelector('#bizSave').onclick=saveBiz;
    }
    if(p.contains(document.activeElement))return;
    p.querySelector('#biz-state').value=b.state;p.querySelector('#biz-name').value=b.name;
    p.querySelector('#biz-url').value=b.url;p.querySelector('#biz-desc').value=b.desc;p.querySelector('#biz-eta').value=b.eta;
  }
  function saveBiz(){
    if(!canBiz()){toast('Podnik smí nastavit jen Mastermind, Overseer a Counselor','error');return;}
    var st=$('bizStatus'),raw=$('biz-url').value.trim(),url=safeUrl(raw);
    if(raw&&!url){st.style.color='var(--red)';st.textContent='// ODKAZ MUSÍ ZAČÍNAT https://';return;}
    var prev=biz(),me=getMember();
    var nb={state:$('biz-state').value==='open'?'open':'soon',name:($('biz-name').value.trim()||'Podnik / Dílna').slice(0,40),url:url,desc:$('biz-desc').value.trim().slice(0,300),eta:$('biz-eta').value.trim().slice(0,60)};
    DB.set('business',nb);
    var opened=nb.state==='open'&&prev.state!=='open';
    addLog('sys',me.displayName+' upravil nastavení podniku „'+nb.name+'“ ('+(nb.state==='open'?'otevřeno':'zamčeno')+').',
      opened?{embed:rich(C_GREEN,'🔧 '+nb.name.toUpperCase()+' — OTEVŘENO',nb.desc||'Podnik frakce je v provozu.',[['🔗 Portál',nb.url||'odkaz zatím nenastaven',false]],{by:me.displayName})}:{noDiscord:true});
    st.style.color='';st.textContent='// ULOŽENO';setTimeout(function(){st.textContent='';},2000);
    toast('Podnik uložen','success');paintBiz();renderBiz();
  }
  var _rs=window.renderSettings;
  if(typeof _rs==='function')window.renderSettings=function(){var r=_rs.apply(this,arguments);try{renderBizPanel();}catch(e){console.error(e);}return r;};

  /* ── CO JE NOVÉHO ── */
  function openNews(){
    var old=document.querySelector('.news-ov');if(old)old.remove();
    var ov=document.createElement('div');ov.className='modal-ov news-ov';ov.setAttribute('role','dialog');ov.setAttribute('aria-modal','true');
    ov.innerHTML='<div class="modal-box news-box"><div class="news-head"><span class="news-ver">v'+VER+'</span><div><div class="modal-title" style="margin:0">CO JE NOVÉHO</div><div class="news-date">UPDATE · '+DATE+'</div></div></div>'+
      '<div class="news-list">'+NEWS.map(function(n){
        return '<div class="news-it"><span class="news-ic">'+n[0]+'</span><div class="news-tx"><b>'+esc(n[1])+(n[3]?' <i class="news-new">'+n[3]+'</i>':'')+'</b><span>'+esc(n[2])+'</span></div></div>';
      }).join('')+'</div><div class="modal-ftr"><button class="btn-acc small" id="newsOk">ROZUMÍM</button></div></div>';
    document.body.appendChild(ov);
    function close(){document.removeEventListener('keydown',key,true);ov.remove();lsSet(KEY,VER);}
    function key(e){if(e.key==='Escape'){e.stopPropagation();close();}}
    document.addEventListener('keydown',key,true);
    ov.querySelector('#newsOk').onclick=close;
    ov.addEventListener('mousedown',function(e){if(e.target===ov)close();});
    ov.querySelector('#newsOk').focus();
    if(lsGet(KEY)!==VER&&typeof window.tscBurst==='function'&&getMember())window.tscBurst();
  }
  window.openNews=openNews;

  var _ep=window.enterPortal;
  if(typeof _ep==='function')window.enterPortal=async function(){
    var r=await _ep.apply(this,arguments);
    if(r&&lsGet(KEY)!==VER){
      var tries=0;
      (function wait(){
        if(lsGet(KEY)===VER||document.querySelector('.news-ov'))return;
        if(document.querySelector('#wowIntro,.pw-self-ov')&&tries++<12){setTimeout(wait,1500);return;}
        openNews();
      })();
    }
    return r;
  };

  /* ── tlačítko v menu + štítek verze na přihlášení ── */
  setInterval(function(){
    document.querySelectorAll('#memberScreen .sb-foot,#adminScreen .sb-foot').forEach(function(f){
      var b=f.querySelector('.news-btn');
      if(!b){b=document.createElement('button');b.className='btn-back news-btn';b.textContent='🆕 CO JE NOVÉHO';b.onclick=openNews;f.insertBefore(b,f.querySelector('.btn-back'));}
      b.classList.toggle('unseen',lsGet(KEY)!==VER);
    });
    paintBiz();
    if($('bizPanel')&&canBiz())renderBizPanel();
  },1500);
  var sub=document.querySelector('#selectScreen .sel-sub');
  if(sub&&!document.querySelector('.ver-pill')){
    sub.insertAdjacentHTML('afterend','<button type="button" class="ver-pill"><i></i>v'+VER+' · NOVÁ VERZE — CO JE NOVÉHO</button>');
    document.querySelector('.ver-pill').onclick=openNews;
  }
})();

;

/* ===== novinky2.js: Cíl kasy na podnik, Ankety, Kodex =====
   Vložit na KONEC tsc.js (za blok novinky.js). Používá jen existující funkce webu.
   Nové klíče v databázi: bizgoal, polls, pv_<anketa>_<člen>, codex, cx_<člen>. */
(function(){
  function $(id){return document.getElementById(id);}
  function players(){return (DB.get('members')||[]).filter(function(m){return !m.hidden;});}
  function memById(id){return (DB.get('members')||[]).filter(function(x){return x.id===id;})[0]||null;}
  function lead(){var m=getMember();return !!m&&ADMIN_POS.indexOf(m.position)!==-1;}
  function who(){var m=getMember();return m?m.displayName:'Admin';}
  function ready(){return !!currentMemberId&&!!sb&&DB.cache&&DB.cache.members!==undefined;}
  function mention(m){var id=String(m.discordId||'').replace(/\D/g,'');return id?'<@'+id+'>':'';}
  function ask(title,text,ok,fn){
    if(typeof window.tscDialog==='function')window.tscDialog({title:title,text:text,ok:ok,danger:true,cancel:'ZRUŠIT'},fn);
    else if(confirm(title))fn();
  }
  function bar(p){var n=Math.round(p/10);return new Array(n+1).join('█')+new Array(11-n).join('░');}

  [['poll','Ankety'],['codex','Kodex frakce']].forEach(function(s){
    if(typeof SECTIONS!=='undefined'&&!SECTIONS.some(function(x){return x.key===s[0];}))SECTIONS.push({key:s[0],label:s[1]});
  });
  LOG_ICONS.poll='🗳';LOG_ICONS.codex='📜';LOG_LABELS.poll='ANKETA';LOG_LABELS.codex='KODEX';
  LOG_COLORS.poll=0x3498db;LOG_COLORS.codex=0xc49a14;

  /* ═════════ VLOŽENÍ DO ROZHRANÍ ═════════ */
  (function inject(){
    var nav=document.querySelector('#memberScreen .sb-nav'),main=document.querySelector('#memberScreen .main');
    if(!nav||!main||$('mt-ankety'))return;
    function mk(key,ic,label,badge,cls){
      var b=document.createElement('button');b.className='nb';b.setAttribute('onclick',"mTab('"+key+"',this)");
      b.innerHTML='<span class="ni">'+ic+'</span><span class="nl">'+label+'</span><span class="nbadge'+(cls?' '+cls:'')+'" id="'+badge+'"></span>';
      return b;
    }
    var anchor=nav.querySelector('.nb[onclick*="\'pochvaly\'"]')||nav.querySelector('.nb[onclick*="\'radio\'"]');
    var b1=mk('ankety','🗳','ANKETY','pollBadge',''),b2=mk('kodex','📜','KODEX','codexBadge','red');
    if(anchor){anchor.insertAdjacentElement('afterend',b1);b1.insertAdjacentElement('afterend',b2);}
    else{nav.appendChild(b1);nav.appendChild(b2);}
    if(typeof MENU_GROUPS!=='undefined'){MENU_GROUPS.ankety='D';MENU_GROUPS.kodex='D';}
    if(typeof M_RENDER!=='undefined'){M_RENDER.ankety=renderPolls;M_RENDER.kodex=renderCodex;}
    main.insertAdjacentHTML('beforeend',
      '<div id="mt-ankety" class="mt"><div class="ph"><div class="pt">🗳 // ANKETY</div></div>'+
        '<div id="pollFormWrap" class="hidden"><div class="form-panel" style="margin:1.2rem">'+
          '<div class="fp-title">// NOVÁ ANKETA (jen vedení)</div><div class="form-grid">'+
            '<div class="field-group fg-full"><label class="fl">OTÁZKA *</label><div class="iw"><span class="ip">&gt;_</span><input type="text" id="pl-q" maxlength="160" placeholder="např. Kam pojedeme na sobotní akci?"/></div></div>'+
            '<div class="field-group fg-full"><label class="fl">UPŘESNĚNÍ (nepovinné)</label><div class="iw"><span class="ip">&gt;_</span><input type="text" id="pl-note" maxlength="240"/></div></div>'+
            '<div class="field-group fg-full"><label class="fl">MOŽNOSTI * (každá na nový řádek, 2–10)</label><textarea id="pl-opts" class="adm-ta" style="min-height:100px" placeholder="Ano&#10;Ne&#10;Zdržuji se"></textarea></div>'+
            '<div class="field-group"><label class="fl">KONČÍ ZA</label><div class="iw"><span class="ip">&gt;_</span><select id="pl-dur"><option value="0">Bez limitu (ukončí vedení)</option><option value="1">1 hodinu</option><option value="12">12 hodin</option><option value="24" selected>24 hodin</option><option value="72">3 dny</option><option value="168">7 dní</option></select></div></div>'+
            '<div class="field-group"><label class="fl">POČET ODPOVĚDÍ</label><div class="iw" style="padding:.4rem .8rem;"><label style="display:flex;align-items:center;gap:.5rem;cursor:pointer;"><input type="checkbox" id="pl-multi" style="accent-color:var(--acc)"/><span style="font-size:.9rem;color:var(--textb)">Jde vybrat víc možností</span></label></div></div>'+
          '</div><div class="fp-ftr"><button class="btn-acc small" id="plCreate">🗳 VYPSAT ANKETU</button><label class="ping-chk"><input type="checkbox" id="ping-poll"/><span>🔔 Označit Member</span></label><span id="plStatus" class="smsg"></span></div>'+
        '</div></div><div id="pollList"></div></div>'+
      '<div id="mt-kodex" class="mt"><div class="ph"><div class="pt">📜 // KODEX FRAKCE</div></div><div id="codexRoot"></div></div>');
    $('plCreate').onclick=createPoll;
    $('mt-ankety').addEventListener('click',pollClick);
    $('mt-kodex').addEventListener('click',codexClick);
    var host=$('bizCard')||$('quickBar')||document.querySelector('#mt-board .gk-card');
    if(host)host.insertAdjacentHTML('afterend','<div id="goalBarM"></div><div id="codexBanner"></div>');
    var da=$('dashA');if(da)da.insertAdjacentHTML('afterend','<div id="goalBarA"></div>');
  })();

  /* ═════════ 1) CÍL KASY NA PODNIK ═════════ */
  function goal(){
    var g=DB.get('bizgoal')||{};
    return {on:g.on===true,name:String(g.name||'dílnu'),target:Math.max(0,parseInt(g.target,10)||0),since:+g.since||0,unlocked:!!g.unlocked,unlockedAt:g.unlockedAt||''};
  }
  function goalSaved(g){
    var s=0,p=0;
    (DB.get('incomes')||[]).forEach(function(i){
      var d=parseCz(i.date),ts=d?d.getTime():0;
      if(g.since&&ts<g.since)return;
      if(i.status==='confirmed')s+=+i.amount||0;else if(i.status==='pending')p+=+i.amount||0;
    });
    return {saved:s,pending:p};
  }
  function goalHtml(sc){
    var g=goal();if(!g.on||!g.target)return '';
    var s=goalSaved(g),done=g.unlocked||s.saved>=g.target,pct=done?100:Math.min(99,Math.floor(s.saved/g.target*100));
    var go=sc==='a'?"goNav('a','incomes')":(done?"goNav('m','business')":"goNav('m','finance')");
    return '<div class="goal-bar'+(done?' done':'')+'" onclick="'+go+'" role="button" tabindex="0" onkeydown="if(event.key===\'Enter\')this.click()">'+
      '<div class="goal-top"><span class="goal-t">'+(done?'🎉 Cíl kasy splněn — <b>Podnik je odemčený</b>':'🎯 Našetřeno <b>'+money(s.saved)+'</b> z <b>'+money(g.target)+'</b> na '+esc(g.name))+'</span><span class="goal-pct">'+pct+' %</span></div>'+
      '<div class="goal-track"><i data-w="'+pct+'%"></i></div>'+
      '<div class="goal-sub"><span>'+(done?'Klikni a otevři záložku Podnik.':'Chybí ještě '+money(Math.max(0,g.target-s.saved))+'. Každý příjem do kasy se počítá.')+'</span>'+
      (!done&&s.pending>0?'<span>Čeká na schválení: '+money(s.pending)+'</span>':'')+'</div></div>';
  }
  function paintGoal(){
    [['goalBarM','m'],['goalBarA','a']].forEach(function(x){
      var el=$(x[0]);if(!el)return;
      var h=goalHtml(x[1]);if(el.dataset.h===h)return;
      el.dataset.h=h;el.innerHTML=h;
      var f=el.querySelector('.goal-track i');
      if(f)requestAnimationFrame(function(){requestAnimationFrame(function(){f.style.width=f.getAttribute('data-w');});});
    });
  }
  var gbusy=false;
  async function goalTick(){
    if(gbusy||!ready())return;
    var g=goal();if(!g.on||g.unlocked||!g.target||goalSaved(g).saved<g.target)return;
    gbusy=true;
    try{
      var r=await sb.from(TABLE).select('value').eq('key','bizgoal').maybeSingle();
      var fresh=(r.data&&r.data.value)||DB.get('bizgoal')||{};
      if(fresh.unlocked){DB.cache.bizgoal=fresh;}
      else{
        var saved=goalSaved(g).saved,b=DB.get('business')||{},wasOpen=b.state==='open';
        fresh.unlocked=true;fresh.unlockedAt=nowStr();DB.set('bizgoal',fresh);
        if(!wasOpen){b.state='open';DB.set('business',b);}
        await DB.flush();
        if(!wasOpen){
          addLog('fin','Cíl kasy splněn ('+money(saved)+') — Podnik byl automaticky odemčen.',{embed:rich(C_GREEN,'🎉 CÍL KASY SPLNĚN','Našetřeno **'+money(saved)+'** z **'+money(g.target)+'** na '+g.name+'. **Podnik je odemčený.**',[['🔗 Portál podniku',(biz2().url||'odkaz doplní vedení'),false]],{by:'Automaticky'})});
          toast('🎉 Cíl kasy splněn — Podnik odemčen!','success',6000);
          if(typeof window.tscBurst==='function')window.tscBurst();
        }
        paintAll();
      }
    }catch(e){console.error(e);}
    gbusy=false;
  }
  function biz2(){var b=DB.get('business')||{};return {url:/^https?:\/\//i.test(b.url||'')?b.url:''};}

  function renderGoalPanel(){
    var host=$('at-settings');if(!host||!lead())return;
    var p=$('goalPanel'),g=goal();
    if(!p){
      p=document.createElement('div');p.id='goalPanel';p.className='form-panel';p.style.margin='0 1.2rem 1rem';
      p.innerHTML='<div class="fp-title">// CÍL KASY NA PODNIK</div><div class="form-grid">'+
        '<div class="field-group fg-full"><div class="iw" style="padding:.4rem .8rem;"><label style="display:flex;align-items:center;gap:.5rem;cursor:pointer;"><input type="checkbox" id="gl-on" style="accent-color:var(--acc)"/><span style="font-size:.9rem;color:var(--textb)">Zobrazovat pruh s cílem na Oznámeních</span></label></div></div>'+
        '<div class="field-group"><label class="fl">CÍLOVÁ ČÁSTKA ($)</label><div class="iw"><span class="ip">$</span><input type="number" id="gl-target" min="1"/></div></div>'+
        '<div class="field-group"><label class="fl">NA CO ŠETŘÍME (4. pád, např. „dílnu“)</label><div class="iw"><span class="ip">&gt;_</span><input type="text" id="gl-name" maxlength="30" placeholder="dílnu"/></div></div>'+
        '<div class="field-group fg-full"><div class="iw" style="padding:.4rem .8rem;"><label style="display:flex;align-items:center;gap:.5rem;cursor:pointer;"><input type="checkbox" id="gl-since" style="accent-color:var(--acc)"/><span style="font-size:.9rem;color:var(--textb)">Počítat jen příjmy nahlášené od uložení cíle (jinak se počítají všechny potvrzené)</span></label></div></div>'+
        '<div class="field-group fg-full"><div class="iw" style="padding:.4rem .8rem;"><label style="display:flex;align-items:center;gap:.5rem;cursor:pointer;"><input type="checkbox" id="gl-dc" checked style="accent-color:var(--acc)"/><span style="font-size:.9rem;color:var(--textb)">Oznámit nový cíl na Discordu</span></label></div></div>'+
        '</div><div id="glInfo" class="att-sum" style="margin-bottom:.6rem"></div><div class="fp-ftr"><button class="btn-acc small" id="glSave">ULOŽIT CÍL</button><span id="glStatus" class="smsg"></span></div>';
      host.appendChild(p);
      p.querySelector('#glSave').onclick=saveGoal;
    }
    var s=goalSaved(g);
    p.querySelector('#glInfo').textContent='// Teď: '+money(s.saved)+(g.target?' z '+money(g.target):'')+(g.unlocked?' · cíl splněn '+g.unlockedAt:'')+'. Po splnění se Podnik odemkne sám (stejně jako ruční přepnutí v panelu Podnik / Dílna).';
    if(p.contains(document.activeElement))return;
    p.querySelector('#gl-on').checked=g.on;p.querySelector('#gl-target').value=g.target||'';
    p.querySelector('#gl-name').value=(DB.get('bizgoal')||{}).name||'';p.querySelector('#gl-since').checked=!!g.since;
  }
  function saveGoal(){
    if(!lead()){toast('Cíl smí nastavit jen Mastermind, Overseer a Counselor','error');return;}
    var st=$('glStatus'),t=parseInt($('gl-target').value,10)||0,on=$('gl-on').checked;
    if(on&&t<=0){st.style.color='var(--red)';st.textContent='// ZADEJ CÍLOVOU ČÁSTKU';return;}
    var prev=goal(),name=($('gl-name').value.trim()||'dílnu').slice(0,30);
    var since=$('gl-since').checked?(prev.since||Math.floor(Date.now()/60000)*60000):0;
    var keep=t===prev.target&&prev.unlocked;
    DB.set('bizgoal',{on:on,name:name,target:t,since:since,unlocked:keep,unlockedAt:keep?prev.unlockedAt:'',by:who(),date:nowStr()});
    if(on&&$('gl-dc').checked&&(t!==prev.target||!prev.on)){
      var s=goalSaved(goal());
      addLog('fin','Nastaven cíl kasy: '+money(t)+' na '+name+'.',{embed:rich(C_YELLOW,'🎯 NOVÝ CÍL KASY','Šetříme na **'+name+'**. Každý příjem do kasy se počítá!',[['🎯 Cíl',money(t)],['💰 Už našetřeno',money(s.saved)]],{by:who()})});
    }
    st.style.color='';st.textContent='// ULOŽENO';setTimeout(function(){st.textContent='';},2000);
    toast('Cíl kasy uložen','success');paintAll();
  }

  /* ═════════ 2) ANKETY ═════════ */
  function polls(){var a=DB.get('polls');return Array.isArray(a)?a:[];}
  function pollOpen(p){return !p.closed&&!(p.ends&&p.ends<=Date.now());}
  function votesOf(pid){
    var out={},pre='pv_'+pid+'_';
    Object.keys(DB.cache).forEach(function(k){
      if(k.indexOf(pre)!==0)return;var v=DB.cache[k];
      if(v&&v.o&&v.o.length)out[k.slice(pre.length)]=v;
    });
    return out;
  }
  function tally(p){
    var vs=votesOf(p.id),valid={},counts={},voters=[];
    players().forEach(function(m){valid[m.id]=1;});
    p.opts.forEach(function(o){counts[o.id]=0;});
    Object.keys(vs).forEach(function(mid){
      if(!valid[mid])return;var any=false;
      vs[mid].o.forEach(function(oid){if(counts[oid]!==undefined){counts[oid]++;any=true;}});
      if(any)voters.push(mid);
    });
    return {counts:counts,voters:voters,votes:vs,total:voters.length,eligible:Object.keys(valid).length};
  }
  function myVote(p){var m=getMember(),v=m&&DB.cache['pv_'+p.id+'_'+m.id];return (v&&v.o)||[];}
  function unvoted(){
    var m=getMember();if(!m||m.hidden)return 0;
    return polls().filter(function(p){return pollOpen(p)&&!myVote(p).length;}).length;
  }

  function pollCard(p){
    var t=tally(p),open=pollOpen(p),mine=myVote(p),adm=isAdmin();
    var max=Math.max.apply(null,p.opts.map(function(o){return t.counts[o.id];}).concat([0]));
    var opts=p.opts.map(function(o){
      var c=t.counts[o.id],pc=t.total?Math.round(c/t.total*100):0,isMine=mine.indexOf(o.id)>-1,lead=!open&&c>0&&c===max;
      return '<button type="button" class="pl-opt'+(isMine?' mine':'')+(lead?' lead':'')+'"'+(open?' data-pl="vote" data-pid="'+p.id+'" data-oid="'+o.id+'"':' disabled')+'>'+
        '<i style="width:'+pc+'%"></i><span class="pl-ot">'+(isMine?'✓ ':'')+(lead?'🏆 ':'')+esc(o.t)+'</span><span class="pl-oc">'+c+' · '+pc+' %</span></button>';
    }).join('');
    var when=open?(p.ends?'končí '+fmtEv(new Date(p.ends))+' ('+untilStr(new Date(p.ends))+')':'bez časového limitu'):'ukončeno '+esc(p.closedAt||'')+(p.closedBy?' ('+esc(p.closedBy)+')':'');
    var det='';
    if(adm){
      var nm=function(ids){return ids.map(function(id){var m=memById(id);return m?esc(m.displayName):'?';}).join(', ')||'—';};
      var rows=p.opts.map(function(o){
        return '<div><b>'+esc(o.t)+':</b> '+nm(t.voters.filter(function(mid){return (t.votes[mid].o||[]).indexOf(o.id)>-1;}))+'</div>';
      }).join('');
      var not=players().filter(function(m){return t.voters.indexOf(m.id)===-1;});
      det='<details class="pl-det"><summary>👁 KDO HLASOVAL</summary>'+rows+'<div class="pl-not">Nehlasovali ('+not.length+'): '+(not.map(function(m){return esc(m.displayName);}).join(', ')||'—')+'</div></details>';
    }
    var acts=adm?'<div class="pl-acts">'+(open?'<button class="btn-micro" data-pl="close" data-pid="'+p.id+'">⏹ UKONČIT</button>':'')+
      '<button class="btn-micro" data-pl="send" data-pid="'+p.id+'">📤 VÝSLEDKY NA DISCORD</button><button class="btn-micro del" data-pl="del" data-pid="'+p.id+'">✕ SMAZAT</button></div>':'';
    return '<div class="pl-card'+(open?'':' closed')+'"><div class="pl-top"><div class="pl-q">'+esc(p.q)+'</div><span class="pl-chip'+(open?' open':'')+'">'+(open?'OTEVŘENÁ':'UKONČENÁ')+'</span></div>'+
      (p.note?'<div class="pl-note">'+esc(p.note)+'</div>':'')+
      '<div class="pl-hint">'+(p.multi?'Jde vybrat víc možností — klikni znovu pro zrušení hlasu.':'Jedna odpověď — hlas jde změnit, dokud anketa běží.')+'</div>'+
      '<div class="pl-opts">'+opts+'</div>'+
      '<div class="pl-foot"><span>Hlasovalo <b>'+t.total+'</b> z '+t.eligible+'</span><span>'+when+' · vypsal '+esc(p.byName||'')+'</span></div>'+det+acts+'</div>';
  }
  function renderPolls(){
    var el=$('pollList');if(!el)return;
    var wrap=$('pollFormWrap');if(wrap)wrap.classList.toggle('hidden',!isAdmin());
    var all=polls().slice().sort(function(a,b){return (b.ts||0)-(a.ts||0);});
    var open=all.filter(pollOpen),closed=all.filter(function(p){return !pollOpen(p);}).slice(0,10);
    el.innerHTML=(open.length?'<div class="sh">// PRÁVĚ SE HLASUJE ('+open.length+')</div>'+open.map(pollCard).join(''):'<div class="empty-s">// Žádná otevřená anketa</div>')+
      (closed.length?'<div class="sh">// UKONČENÉ</div>'+closed.map(pollCard).join(''):'');
    paintAll();
  }
  function vote(pid,oid){
    var m=getMember(),p=polls().filter(function(x){return x.id===pid;})[0];if(!m||!p)return;
    if(!pollOpen(p)){toast('Anketa už je ukončená','error');renderPolls();return;}
    var key='pv_'+pid+'_'+m.id,cur=(DB.cache[key]&&DB.cache[key].o)||[],next;
    if(p.multi)next=cur.indexOf(oid)>-1?cur.filter(function(x){return x!==oid;}):cur.concat([oid]);
    else next=cur[0]===oid?[]:[oid];
    DB.set(key,{o:next,t:Date.now()});
    toast(next.length?'Hlas uložen ✓':'Hlas stažen','success');renderPolls();
  }
  function createPoll(){
    if(!isAdmin())return;
    var st=$('plStatus');function err(t){st.style.color='var(--red)';st.textContent=t;}
    var q=$('pl-q').value.trim(),note=$('pl-note').value.trim(),seen={};
    var opts=$('pl-opts').value.split(/\r?\n/).map(function(s){return s.trim().slice(0,80);}).filter(function(s){var k=s.toLowerCase();if(!s||seen[k])return false;seen[k]=1;return true;});
    if(!q)return err('// ZADEJ OTÁZKU');
    if(opts.length<2)return err('// POTŘEBUJEŠ ALESPOŇ 2 RŮZNÉ MOŽNOSTI');
    if(opts.length>10)return err('// MAXIMUM JE 10 MOŽNOSTÍ');
    var dur=parseInt($('pl-dur').value,10)||0,multi=$('pl-multi').checked,me=getMember(),ex=pingBox('ping-poll');
    var p={id:uid(),q:q,note:note,opts:opts.map(function(t,i){return {id:'o'+(i+1),t:t};}),multi:multi,ends:dur?Date.now()+dur*36e5:0,closed:false,by:me.id,byName:me.displayName,date:nowStr(),ts:Date.now()};
    var list=polls();list.push(p);DB.set('polls',list.slice(-60));
    addLog('poll',me.displayName+' vypsal anketu: '+q,{extraPing:ex,embed:rich(C_BLUE,'🗳 NOVÁ ANKETA','**'+q+'**'+(note?'\n'+note:''),[
      ['📋 Možnosti',opts.map(function(t){return '▫️ '+t;}).join('\n'),false],['🔢 Odpovědi',multi?'Víc možností':'Jedna možnost'],
      ['⏰ Končí',p.ends?fmtEv(new Date(p.ends)):'bez limitu'],['🔗 Hlasuj','Portál → 🗳 Ankety',false]],{by:me.displayName})});
    ['pl-q','pl-note','pl-opts'].forEach(function(i){$(i).value='';});$('pl-multi').checked=false;
    st.style.color='';st.textContent='// ANKETA VYPSÁNA';setTimeout(function(){st.textContent='';},2500);
    toast('Anketa vypsána','success');renderPolls();
  }
  function resultsEmbed(p,title,by){
    var t=tally(p),max=Math.max.apply(null,p.opts.map(function(o){return t.counts[o.id];}).concat([0]));
    var f=p.opts.map(function(o){
      var c=t.counts[o.id],pc=t.total?Math.round(c/t.total*100):0;
      return [(c>0&&c===max?'🏆 ':'')+o.t,bar(pc)+'  **'+c+'** ('+pc+' %)',false];
    });
    f.push(['👥 Hlasovalo',t.total+' z '+t.eligible,true]);
    return rich(C_GREEN,title,'**'+p.q+'**',f,{by:by});
  }
  function closePoll(id){
    var list=polls(),p=list.filter(function(x){return x.id===id;})[0];if(!p||p.closed||!isAdmin())return;
    p.closed=true;p.closedAt=nowStr();p.closedBy=who();DB.set('polls',list);
    addLog('poll',who()+' ukončil anketu: '+p.q,{embed:resultsEmbed(p,'📊 ANKETA UKONČENA',who())});
    toast('Anketa ukončena, výsledky odeslány','success');renderPolls();
  }
  function sendResults(id){
    var p=polls().filter(function(x){return x.id===id;})[0];if(!p||!isAdmin())return;
    addLog('poll',who()+' poslal výsledky ankety: '+p.q,{embed:resultsEmbed(p,pollOpen(p)?'📊 PRŮBĚŽNÉ VÝSLEDKY ANKETY':'📊 VÝSLEDKY ANKETY',who())});
    toast('Výsledky odeslány na Discord','success');
  }
  function delPoll(id){
    var list=polls(),p=list.filter(function(x){return x.id===id;})[0];if(!p||!isAdmin())return;
    var pre='pv_'+id+'_';
    Object.keys(DB.cache).forEach(function(k){if(k.indexOf(pre)===0)DB.set(k,null);});
    DB.set('polls',list.filter(function(x){return x.id!==id;}));
    addLog('poll',who()+' smazal anketu: '+p.q,{noDiscord:true});
    toast('Anketa smazána','info');renderPolls();
  }
  function pollClick(e){
    var b=e.target.closest&&e.target.closest('[data-pl]');if(!b||b.disabled)return;
    var a=b.getAttribute('data-pl'),id=b.getAttribute('data-pid');
    if(a==='vote')vote(id,b.getAttribute('data-oid'));
    else if(a==='close')ask('⏹ UKONČIT ANKETU?','Hlasování se uzavře a výsledky půjdou na Discord.','UKONČIT',function(){closePoll(id);});
    else if(a==='send')sendResults(id);
    else if(a==='del')ask('⚠ SMAZAT ANKETU?','Smažou se i všechny odevzdané hlasy. Tuto akci nelze vrátit.','SMAZAT',function(){delPoll(id);});
  }
  var pbusy=false;
  async function pollTick(){
    if(pbusy||!ready())return;
    if(!polls().some(function(p){return !p.closed&&p.ends&&p.ends<=Date.now();}))return;
    pbusy=true;
    try{
      var r=await sb.from(TABLE).select('value').eq('key','polls').maybeSingle();
      var list=(r.data&&r.data.value)||polls(),done=[];
      list.forEach(function(p){if(!p.closed&&p.ends&&p.ends<=Date.now()){p.closed=true;p.closedAt=nowStr();p.closedBy='automaticky';done.push(p);}});
      DB.cache.polls=list;
      if(done.length){
        DB.set('polls',list);await DB.flush();
        done.forEach(function(p){addLog('poll','Anketa skončila: '+p.q,{embed:resultsEmbed(p,'📊 ANKETA SKONČILA','Automaticky')});});
        paintAll();
        var act=document.querySelector('#memberScreen .mt.active');if(act&&act.id==='mt-ankety')renderPolls();
      }
    }catch(e){console.error(e);}
    pbusy=false;
  }

  /* ═════════ 3) KODEX FRAKCE ═════════ */
  function codex(){var c=DB.get('codex');return (c&&c.text)?c:null;}
  function cxState(mid,c){var r=DB.cache['cx_'+mid];return (r&&r.v>=c.v)?r:null;}
  function fmtRules(t){
    var out='',list=false;
    String(t||'').split(/\r?\n/).forEach(function(l){
      var s=l.trim(),li=/^[-•*]\s+(.*)$/.exec(s),h=/^#{1,3}\s+(.*)$/.exec(s);
      function inline(x){return esc(x).replace(/\*\*(.+?)\*\*/g,'<b>$1</b>');}
      if(li){if(!list){out+='<ul>';list=true;}out+='<li>'+inline(li[1])+'</li>';return;}
      if(list){out+='</ul>';list=false;}
      if(!s)return;
      out+=h?'<h3>'+inline(h[1])+'</h3>':'<p>'+inline(s)+'</p>';
    });
    return out+(list?'</ul>':'');
  }
  function cxOverview(c){
    var ps=players().map(function(m){return {m:m,r:cxState(m.id,c),old:DB.cache['cx_'+m.id]};}).sort(function(a,b){
      return (a.r?1:0)-(b.r?1:0)||String(a.m.displayName).localeCompare(String(b.m.displayName),'cs');});
    var n=ps.length,ok=ps.filter(function(x){return x.r;}).length;
    return '<div class="sh" style="margin:1.6rem 0 .7rem;padding-left:0">// KDO POTVRDIL ('+ok+' z '+n+')</div>'+
      '<div class="goal-track"><i data-w="'+(n?Math.round(ok/n*100):0)+'%" style="width:'+(n?Math.round(ok/n*100):0)+'%"></i></div>'+
      ps.map(function(x){
        return '<div class="cx-row '+(x.r?'ok':'no')+'"><span>'+(x.r?'✓':'✗')+' <span class="prof-link" data-prof="'+esc(x.m.id)+'">'+esc(x.m.displayName)+'</span></span><span>'+
          (x.r?esc(x.r.date||''):(x.old?'potvrdil jen verzi '+x.old.v:'nepotvrzeno'))+'</span></div>';
      }).join('')+
      (ok<n?'<div class="fp-ftr" style="margin-top:.8rem"><button class="btn-acc small" data-cx="remind">📣 PŘIPOMENOUT NEPOTVRZENÝM NA DISCORDU</button></div>':'');
  }
  function renderCodex(){
    var el=$('codexRoot'),me=getMember();if(!el||!me)return;
    var c=codex(),ed=lead();
    var editBtn=ed?'<button class="btn-acc small" data-cx="edit">✎ '+(c?'UPRAVIT KODEX':'VYTVOŘIT KODEX')+'</button>':'';
    if(!c){el.innerHTML='<div class="cx-wrap"><div class="empty-s">// Vedení zatím nezveřejnilo kodex</div>'+(ed?'<div style="text-align:center">'+editBtn+'</div>':'')+'</div>';paintAll();return;}
    var mine=cxState(me.id,c),prev=DB.cache['cx_'+me.id];
    var h='<div class="cx-wrap"><div class="cx-head"><div class="cx-title">'+esc(c.title||'Kodex frakce')+'</div><div class="cx-meta">Verze '+c.v+' · aktualizováno '+esc(c.date||'')+(c.byName?' · '+esc(c.byName):'')+'</div></div>';
    if(prev&&!mine&&c.note)h+='<div class="cx-upd"><b>Co se změnilo:</b> '+esc(c.note)+'</div>';
    h+='<div class="cx-body" id="cxBody">'+fmtRules(c.text)+'</div>';
    if(!me.hidden){
      h+=mine?'<div class="cx-ok">✓ Přečtení potvrzeno (verze '+c.v+') — '+esc(mine.date||'')+'</div>'
        :'<div class="cx-act"><button class="btn-acc" data-cx="confirm" id="cxConfirm" disabled>✓ PŘEČETL JSEM A SOUHLASÍM</button><span class="cx-hint" id="cxHint">Přečti kodex až do konce, pak půjde potvrdit.</span></div>';
    }
    if(ed)h+='<div class="fp-ftr" style="margin-top:1rem">'+editBtn+'</div>';
    if(isAdmin())h+=cxOverview(c);
    el.innerHTML=h+'</div>';
    var body=$('cxBody'),btn=$('cxConfirm');
    if(body&&btn){
      var chk=function(){
        if(body.scrollHeight-body.scrollTop-body.clientHeight<24){btn.disabled=false;var hi=$('cxHint');if(hi)hi.textContent='';}
      };
      body.onscroll=chk;chk();setTimeout(chk,150);
    }
    paintAll();
  }
  function confirmCodex(){
    var m=getMember(),c=codex();if(!m||!c)return;
    DB.set('cx_'+m.id,{v:c.v,t:Date.now(),date:nowStr()});
    var tasks=DB.get('tasks')||{};
    (tasks[m.id]||[]).forEach(function(t){if(/^cxt/.test(t.id)&&!t.done){t.done=true;t.resolution='splneno';t.resolvedDate=nowStr();}});
    DB.set('tasks',tasks);
    addLog('codex',m.displayName+' potvrdil přečtení Kodexu (verze '+c.v+').',{noDiscord:true});
    toast('Kodex potvrzen ✓','success');renderCodex();updateBadges();
  }
  function remindCodex(){
    var c=codex();if(!c||!isAdmin())return;
    var un=players().filter(function(m){return !cxState(m.id,c);});
    if(!un.length){toast('Všichni už kodex potvrdili ✓','success');return;}
    var pings=un.map(mention).filter(Boolean).join(' ');if(pings.length>1800)pings=pings.slice(0,1800);
    addLog('codex','Připomínka kodexu — nepotvrdili: '+un.map(function(m){return m.displayName;}).join(', ')+'.',{extraPing:pings,embed:rich(C_ORANGE,'📜 PŘIPOMÍNKA: POTVRĎ KODEX','Kodex frakce (verze **'+c.v+'**) zatím nepotvrdili:\n\n'+un.map(function(m){return '• '+m.displayName+(mention(m)?' '+mention(m):'');}).join('\n'),[['👥 Chybí',String(un.length)],['📍 Kde','Portál → 📜 Kodex']],{by:who()})});
    toast('Připomínka odeslána na Discord','success');
  }
  function openCodexEdit(){
    if(!lead()){toast('Kodex smí upravit jen Mastermind, Overseer a Counselor','error');return;}
    var c=codex(),old=document.querySelector('.cx-ov');if(old)old.remove();
    var ov=document.createElement('div');ov.className='modal-ov cx-ov';ov.setAttribute('role','dialog');ov.setAttribute('aria-modal','true');
    ov.innerHTML='<div class="modal-box" style="max-width:640px;width:96vw;max-height:94vh;overflow-y:auto"><div class="modal-title">📜 '+(c?'UPRAVIT KODEX':'NOVÝ KODEX')+'</div>'+
      '<div class="field-group"><label class="fl">NÁZEV</label><div class="iw"><span class="ip">&gt;_</span><input type="text" id="cxT" maxlength="60"/></div></div>'+
      '<div class="field-group" style="margin-top:.7rem"><label class="fl">PRAVIDLA *</label><textarea id="cxX" class="adm-ta" style="min-height:260px" maxlength="12000"></textarea>'+
        '<div class="bank-hint">Formátování: řádek začínající „# “ je nadpis, „- “ je odrážka, **tučně**. Prázdný řádek odděluje odstavce.</div></div>'+
      (c?'<div class="field-group" style="margin-top:.7rem"><label class="fl">CO SE ZMĚNILO (uvidí členové, kteří mají starší verzi)</label><div class="iw"><span class="ip">&gt;_</span><input type="text" id="cxN" maxlength="200"/></div></div>'+
        '<label class="ping-chk" style="margin-top:.7rem"><input type="checkbox" id="cxBump" checked/><span>Vyžadovat nové potvrzení od všech (zvýší verzi na '+(c.v+1)+')</span></label>':'')+
      '<label class="ping-chk" style="margin-top:.5rem"><input type="checkbox" id="cxDc" checked/><span>Oznámit na Discordu</span></label> '+
      '<label class="ping-chk" style="margin-top:.5rem"><input type="checkbox" id="cxPing"/><span>🔔 Označit Member</span></label>'+
      '<div id="cxMsg" class="smsg" style="margin-top:.4rem;min-height:1em;color:#e05555"></div>'+
      '<div class="modal-ftr"><button class="btn-acc small" id="cxOk">ULOŽIT A ZVEŘEJNIT</button><button class="btn-ghost small" id="cxNo">ZRUŠIT</button></div></div>';
    document.body.appendChild(ov);
    $('cxT').value=c?c.title||'':'Kodex frakce';$('cxX').value=c?c.text:'';
    function close(){document.removeEventListener('keydown',key,true);ov.remove();}
    function key(e){if(e.key==='Escape'){e.stopPropagation();close();}}
    document.addEventListener('keydown',key,true);
    $('cxNo').onclick=close;ov.addEventListener('mousedown',function(e){if(e.target===ov)close();});
    $('cxOk').onclick=function(){
      var text=$('cxX').value.trim();
      if(!text){$('cxMsg').textContent='// NAPIŠ PRAVIDLA';return;}
      var prev=codex(),changed=!prev||prev.text!==text,bump=!prev||(changed&&$('cxBump')&&$('cxBump').checked);
      var obj={v:prev?(bump?prev.v+1:prev.v):1,title:$('cxT').value.trim()||'Kodex frakce',text:text,note:$('cxN')?$('cxN').value.trim():(prev?prev.note||'':''),by:getMember().id,byName:who(),date:nowStr(),ts:Date.now()};
      var ex=pingBox('cxPing'),dc=$('cxDc').checked;
      DB.set('codex',obj);
      var short=text.length>900?text.slice(0,900).replace(/\s+\S*$/,'')+'…\n\n*Celý text najdeš na portálu.*':text;
      addLog('codex',who()+(prev?' upravil':' zveřejnil')+' Kodex (verze '+obj.v+').',dc?{extraPing:ex,embed:rich(C_YELLOW,'📜 '+(prev?(bump?'KODEX AKTUALIZOVÁN':'KODEX UPRAVEN'):'NOVÝ KODEX FRAKCE')+' — verze '+obj.v,short,[
        ['📝 Co se změnilo',prev&&bump?obj.note:''],['✅ Co udělat',bump?'Otevři portál → 📜 Kodex, přečti ho a potvrď.':'Beze změny potvrzení.',false]],{by:who()})}:{noDiscord:true});
      toast('Kodex uložen','success');close();renderCodex();
    };
    $('cxX').focus();
  }
  function codexClick(e){
    var b=e.target.closest&&e.target.closest('[data-cx]');if(!b||b.disabled)return;
    var a=b.getAttribute('data-cx');
    if(a==='confirm')confirmCodex();else if(a==='edit')openCodexEdit();else if(a==='remind')remindCodex();
  }
  function codexTaskTick(){
    var m=getMember(),c=codex();
    if(!m||m.hidden||m.panic||!c||!DB.cache||DB.cache.tasks===undefined||cxState(m.id,c))return;
    var tasks=DB.get('tasks')||{},arr=tasks[m.id]||[],tid='cxt'+c.v;
    if(arr.some(function(t){return t.id===tid;}))return;
    arr.push({id:tid,title:'Přečti a potvrď Kodex frakce',desc:'Otevři záložku 📜 Kodex, přečti pravidla až do konce a potvrď, že jim rozumíš (verze '+c.v+').',priority:'high',date:nowStr(),done:false});
    tasks[m.id]=arr;DB.set('tasks',tasks);
  }

  /* ═════════ NAPOJENÍ NA OSTATNÍ ČÁSTI WEBU ═════════ */
  function setB(id,n){var e=$(id);if(!e)return;e.textContent=n>99?'99+':String(n);e.classList.toggle('visible',n>0);e.classList.add('unread');}
  function paintHome(){
    var el=$('codexBanner'),m=getMember(),c=codex();if(!el)return;
    var h=(m&&!m.hidden&&c&&!cxState(m.id,c))?'<div class="cx-banner" onclick="goNav(\'m\',\'kodex\')" role="button" tabindex="0" onkeydown="if(event.key===\'Enter\')this.click()"><span class="cx-bi">📜</span><div><b>Kodex frakce čeká na tvé potvrzení</b><small>Přečti pravidla a potvrď je — zabere to chvíli.</small></div><span class="cx-go">OTEVŘÍT</span></div>':'';
    if(el.dataset.h!==h){el.dataset.h=h;el.innerHTML=h;}
  }
  function paintAll(){
    if(!getMember())return;
    paintGoal();paintHome();
    var m=getMember(),c=codex();
    setB('pollBadge',unvoted());
    setB('codexBadge',(m&&!m.hidden&&c&&!cxState(m.id,c))?1:0);
    var cb=$('codexBadge');if(cb&&cb.classList.contains('visible'))cb.textContent='!';
  }
  var _mt=window.mTab;
  window.mTab=function(tab){var r=_mt.apply(this,arguments);if(tab==='ankety')renderPolls();if(tab==='kodex')renderCodex();return r;};
  var _rb=window.renderBoard;
  if(typeof _rb==='function')window.renderBoard=function(){var r=_rb.apply(this,arguments);paintAll();return r;};
  var _ub=window.updateBadges;
  if(typeof _ub==='function')window.updateBadges=function(){var r=_ub.apply(this,arguments);try{paintAll();}catch(e){}return r;};
  var _rs=window.renderSettings;
  if(typeof _rs==='function')window.renderSettings=function(){var r=_rs.apply(this,arguments);try{renderGoalPanel();}catch(e){console.error(e);}return r;};

  var _ns=window.notifSources;
  if(typeof _ns==='function')window.notifSources=function(m){
    var out=_ns.apply(this,arguments);
    try{
      polls().forEach(function(p){
        if(pollOpen(p)&&!myVote(p).length&&p.by!==m.id)out.push({id:'p_'+p.id,icon:'🗳',title:'Nová anketa',text:p.q,go:['m','ankety'],ts:p.ts||Date.now()});
      });
    }catch(e){}
    return out;
  };

  var _rd=window.renderDash;
  if(typeof _rd==='function')window.renderDash=function(){
    var r=_rd.apply(this,arguments);
    try{
      var m=getMember(),c=codex();if(!m)return r;
      var openP=polls().filter(pollOpen).length;
      [['dashM',false],['dashA',true]].forEach(function(x){
        var el=$(x[0]);if(!el)return;
        el.querySelectorAll('.dc-x').forEach(function(n){n.remove();});
        var h='';
        if(x[1]){
          if(openP)h+=dashCard('🗳','OTEVŘENÉ ANKETY',openP,'právě se hlasuje','dc-x',"goTo('m','ankety')");
          if(c){var ps=players(),ok=ps.filter(function(q){return cxState(q.id,c);}).length;
            h+=dashCard('📜','KODEX',ok+'<small>/'+ps.length+'</small>',ok>=ps.length?'všichni potvrdili':'chybí '+(ps.length-ok),(ok>=ps.length?'ok':'warn')+' dc-x',"goTo('m','kodex')");}
        }else{
          var uv=unvoted();
          if(uv)h+=dashCard('🗳','ANKETY',uv,'čeká na tvůj hlas','warn dc-x',"goNav('m','ankety')");
          if(c&&!m.hidden&&!cxState(m.id,c))h+=dashCard('📜','KODEX','!','čeká na potvrzení','warn dc-x',"goNav('m','kodex')");
        }
        if(!h)return;
        var on=el.querySelector('.dash-online');
        if(on)on.insertAdjacentHTML('beforebegin',h);else el.insertAdjacentHTML('beforeend',h);
      });
    }catch(e){console.error(e);}
    return r;
  };

  setInterval(function(){try{paintAll();}catch(e){}},4000);
  setInterval(function(){try{goalTick();pollTick();}catch(e){}},15000);
  setInterval(function(){try{codexTaskTick();}catch(e){}},6000);
  setTimeout(function(){try{goalTick();pollTick();codexTaskTick();}catch(e){}},7000);
})();

;
