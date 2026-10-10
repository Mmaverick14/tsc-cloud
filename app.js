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

var POSITIONS=['Boss','Right hand','Counselor',"Devil's Advocate",'Chief of Arms','Advisor','Intelligence Chief','Keeper of secrets','Member'];
var VEDENI_POS=['Boss','Right hand','Counselor',"Devil's Advocate"];
var CAT={weapons:'ZBRANĚ',ammo:'MUNICE',drugs:'DROGY',equipment:'VYBAVENÍ',other:'OSTATNÍ'};
var PRIO={low:'LOW',normal:'NORMAL',high:'HIGH',urgent:'URGENT'};
var CLOTH_CAT={masks:'Masky & Vousy',jackets:'Bundy & Trička',pants:'Kalhoty & Boty',acc:'Doplňky',sets:'Sety'};

var currentMemberId=null;
var pendingLoginId=null;

function getMember(id){var members=DB.get('members')||[];return members.find(function(m){return m.id===(id||currentMemberId);})||null;}
function isAdmin(){var m=getMember();return m&&m.adminAccess;}
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

// ── LOG ──────────────────────────────────────
function addLog(type,text){
  var m=getMember();var actor=m?m.displayName:'Systém';
  var log=DB.get('syslog')||[];
  log.unshift({time:nowFull(),type:type,actor:actor,text:text});
  if(log.length>500)log=log.slice(0,500);
  DB.set('syslog',log);
  sendToDiscord('['+type.toUpperCase()+'] ['+actor+'] '+text);
}
function sendToDiscord(msg){
  var s=DB.get('settings')||{};if(!s.webhook)return;
  fetch(s.webhook,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:s.webhookName||'Frakce LOG',content:'`'+nowStr()+'` '+msg})}).catch(function(){});
}

// ── INIT ─────────────────────────────────────
function initData(){
  DB.setDefault('members',[]);
  DB.setDefault('tasks',{});
  DB.setDefault('messages',{});
  DB.setDefault('reports',[]);
  DB.setDefault('warehouse',defaultWarehouse());
  DB.setDefault('clothing',[]);
  DB.setDefault('board',[]);
  DB.setDefault('boardConfirmed',{});
  DB.setDefault('excuses',[]);
  DB.setDefault('syslog',[]);
  DB.setDefault('finance',{payments:[],expenses:[{id:uid(),name:'Týdenní příspěvek',amount:5000,type:'weekly',note:'Povinný příspěvek'}]});
  DB.setDefault('finsettings',{weeklyFee:5000,feeDay:0});
  DB.setDefault('panicList',[]);
  DB.setDefault('settings',{webhook:'',webhookName:'Frakce LOG'});
  DB.setDefault('radios',{primary:'',secondary:'',action:'',vedeni:''});
  DB.setDefault('contacts',{});
  DB.setDefault('incomes',[]);
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
  tick();setInterval(tick,1000);
}

// ── SCREENS ──────────────────────────────────
function showScreen(id){
  ['selectScreen','memberScreen','adminScreen'].forEach(function(s){
    var e=document.getElementById(s);e.classList.remove('active');e.classList.add('hidden');
  });
  var t=document.getElementById(id);t.classList.remove('hidden');t.classList.add('active');
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
  addLog('panic','Člen "'+m.displayName+'" aktivoval PANIC.');
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
    m={id:uid(),authId:user.id,email:user.email,displayName:(user.email||'Boss').split('@')[0],position:'Boss',adminAccess:true,note:'',panic:false};
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
  return true;
}

// ── REALTIME (změny od ostatních členů se propíšou hned) ──
function startRealtime(){
  if(rtChannel||!sb)return;
  rtChannel=sb.channel('frakce-kv').on('postgres_changes',{event:'*',schema:'public',table:TABLE},function(p){
    var row=p.new;if(!row||!row.key)return;
    if(Date.now()-(DB.lastWrite[row.key]||0)<2000)return; // vlastní zápis
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
  if(rtChannel&&sb){try{sb.removeChannel(rtChannel);}catch(e){}}
  rtChannel=null;
}
function scheduleRefresh(){clearTimeout(refreshTimer);refreshTimer=setTimeout(refreshView,400);}

var M_RENDER={
  board:function(){renderBoard();},tasks:function(){renderMemberTasks();},messages:function(){renderMemberMessages();},
  warehouse:function(){renderMemberWarehouse();},clothing:function(){renderClothing();},
  finance:function(){renderMyFinance();renderMyIncomes();},excuse:function(){renderMyExcuses();},
  report:function(){renderSentReports();},radio:function(){renderMyRadio();},contacts:function(){renderContacts();}
};
var A_RENDER={
  members:function(){renderMemberGrid();},board:function(){renderAdminBoard();},warehouse:function(){renderAdminWarehouse();},
  clothing:function(){renderAdminClothing();},finance:function(){renderAdminFinance();},excuses:function(){renderAdminExcuses();},
  reports:function(){renderAdminReports();},incomes:function(){renderAdminIncomes();},log:function(){renderLog();}
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
  aTab('members',document.querySelector('#adminScreen .nb'));
}

// ════════════════════════════════
//  ADMIN TABS
// ════════════════════════════════
function aTab(tab,btn){
  document.querySelectorAll('.at').forEach(function(t){t.classList.remove('active');});
  document.querySelectorAll('#adminScreen .nb').forEach(function(b){b.classList.remove('active');});
  var el=document.getElementById('at-'+tab);if(el)el.classList.add('active');
  if(btn)btn.classList.add('active');
  if(tab==='members')    renderMemberGrid();
  if(tab==='board')      renderAdminBoard();
  if(tab==='tasks')      populateTaskTarget();
  if(tab==='messages')   populateMsgTarget();
  if(tab==='warehouse')  renderAdminWarehouse();
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
  if(btn)btn.classList.add('active');
  var m=getMember();
  if(m){setText('sbName',m.displayName);setText('sbPos',m.position);}
  if(tab==='board')     renderBoard();
  if(tab==='tasks')     renderMemberTasks();
  if(tab==='messages')  renderMemberMessages();
  if(tab==='warehouse'){renderMemberWarehouse();populateDepositSelect();}
  if(tab==='clothing')  renderClothing();
  if(tab==='finance')   {renderMyFinance();populateIncSource();}
  if(tab==='excuse')    renderMyExcuses();
  if(tab==='report')    renderSentReports();
  if(tab==='radio')     renderMyRadio();
  if(tab==='contacts')  renderContacts();
  if(tab==='incomes')   {renderMyIncomes();}
  updateBadges();
}

function updateBadges(){
  var m=getMember();if(!m)return;
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
      '<div class="bp-body">'+esc(p.body)+'</div>'+
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
function renderMemberWarehouse(){
  var items=DB.get('warehouse')||[];
  var filtered=mWhCat==='all'?items:items.filter(function(i){return i.cat===mWhCat;});
  var el=document.getElementById('mWhGrid');
  if(!filtered.length){el.innerHTML='<div class="empty-s" style="grid-column:1/-1">// Žádné položky</div>';return;}
  el.innerHTML=filtered.map(function(item){
    var qc=item.qty===0?'empty':(item.min>0&&item.qty<=item.min?'low':'');
    var imgH=item.img?'<div class="wh-img"><img src="images/'+esc(item.img)+'" onerror="this.parentElement.innerHTML=\'<span class=wh-icon>?</span>\'"/></div>':'<div class="wh-img"><span class="wh-icon">?</span></div>';
    return '<div class="wh-item">'+imgH+
      '<div class="wh-cat">'+(CAT[item.cat]||item.cat)+'</div>'+
      '<div class="wh-name">'+esc(item.name)+'</div>'+
      (item.note?'<div class="wh-note-text">'+esc(item.note)+'</div>':'')+
      '<div class="wh-qty-row"><span class="wh-qty '+qc+'">'+item.qty+'</span><span class="wh-unit"> KS</span></div>'+
      (item.qty===0?'<div class="wh-alert critical">Ve skladu nic není. Je potřeba doplnit.</div>':'')+
      (item.min>0&&item.qty>0&&item.qty<=item.min?'<div class="wh-alert">NÍZKÁ ZÁSOBA</div>':'')+
      '<div class="wh-pickup"><input class="wh-ev-input" type="text" placeholder="Vaše jméno..." id="pn-'+item.id+'"/>'+
      '<div class="wh-pickup-row"><input class="wh-ev-input small" type="number" value="1" min="1" max="'+item.qty+'" id="pa-'+item.id+'"/>'+
      '<button class="btn-pickup'+(item.qty===0?' btn-pickup-disabled':'')+'" onclick="pickupItem(\''+item.id+'\')"'+(item.qty===0?' disabled':'')+'>⬇ VYZVEDL</button>'+
      '</div></div></div>';
  }).join('');
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
  addLog('ev','VÝDEJ: "'+jmeno+'" vyzvedl '+amt+'x "'+item.name+'" — zásoba: '+before+' → '+item.qty+' ks. Člen: '+m.displayName+'.');
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
  addLog('wh','VLOŽENÍ: "'+jmeno+'" vložil '+amt+'x "'+item.name+'" do skladu — zásoba: '+before+' → '+item.qty+' ks. Člen: '+m.displayName+'.');
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
    var imgSrc=s.imgIsUrl?esc(s.img):'images/'+esc(s.img);
    var imgH=s.img
    ? '<div class="cs-img-wrap"><img src="'+imgSrc+'" class="cs-img" onerror="this.style.display=\'none\'"></div>'
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
function previewClothImg(val){
  var el=document.getElementById('cl-img-preview');if(!el)return;
  if(!val||!val.trim()){el.innerHTML='—';return;}
var src3=(val.startsWith('http')||val.startsWith('//'))?esc(val):'images/'+esc(val);
  el.innerHTML='<img src="'+src3+'";max-height:110px;object-fit:contain;filter:drop-shadow(0 0 6px rgba(196,154,20,.3));" onerror="this.parentElement.innerHTML=\'<span style=\\\'color:var(--red);font-family:Share Tech Mono,monospace;font-size:.65rem\\\'>nenalezeno</span>\'"/>';
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
  addLog('wh','Admin přidal outfit set: "'+name+'".');
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
    var imgSrc=s.imgIsUrl?esc(s.img):'images/'+esc(s.img);
    var imgH=s.img
      ? '<div class="cs-img-wrap"><img src="'+imgSrc+'" class="cs-img" onerror="this.style.display=\'none\'"/></div>'
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
  addLog('wh','Admin smazal outfit set.');
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
  addLog('fin','Admin přidal '+(optional?'nepovinnou ':'')+'výdajovou položku: "'+name+'" $'+amount+'.');
  st.textContent='// PŘIDÁNO';setTimeout(function(){st.textContent='';},3000);
  ['exp-name','exp-note'].forEach(function(i){document.getElementById(i).value='';});document.getElementById('exp-amount').value='';
  if(optEl)optEl.checked=false;
  toast('Položka přidána','success');renderAdminFinance();
}
function delExpense(id){
  if(!confirm('Smazat položku?'))return;
  var fin=DB.get('finance')||{payments:[],expenses:[]};
  fin.expenses=fin.expenses.filter(function(e){return e.id!==id;});DB.set('finance',fin);
  addLog('fin','Admin smazal výdajovou položku.');renderAdminFinance();
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
          (!paid?'<button class="btn-record-pay" onclick="recordPayment(\''+m.id+'\',\''+m.displayName+'\')">EVIDOVAT</button>':'')+
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
            (!paid?'<button class="btn-record-pay" onclick="recordOptionalPayment(\''+m.id+'\',\''+m.displayName+'\',\''+e.id+'\',\''+esc(e.name)+'\','+e.amount+')">EVIDOVAT</button>':'')+
          '</div></div>';
      }).join('')+
    '</div>';
  }).join('');
  el.innerHTML=summary+expenses+payments+optSections;
}
function recordPayment(memberId,memberName){
  var fs=DB.get('finsettings')||{weeklyFee:5000};
  var fin=DB.get('finance')||{payments:[],expenses:[]};
  var wk=getWeekKey();
  fin.payments.push({id:uid(),memberId:memberId,memberName:memberName,weekKey:wk,amount:fs.weeklyFee,date:nowStr(),note:'Týdenní příspěvek',expenseId:'weekly'});
  DB.set('finance',fin);
  addLog('fin','Admin evidoval platbu od "'+memberName+'" — $'+fs.weeklyFee+' ('+wk+').');
  toast('Platba evidována','success');renderAdminFinance();
}
function recordOptionalPayment(memberId,memberName,expenseId,expenseName,amount){
  var fin=DB.get('finance')||{payments:[],expenses:[]};
  var wk=getWeekKey();
  var already=fin.payments.some(function(p){return p.memberId===memberId&&p.expenseId===expenseId&&p.weekKey===wk;});
  if(already){toast('Platba již evidována','info');return;}
  fin.payments.push({id:uid(),memberId:memberId,memberName:memberName,weekKey:wk,amount:amount,date:nowStr(),note:expenseName,expenseId:expenseId});
  DB.set('finance',fin);
  addLog('fin','Admin evidoval platbu od "'+memberName+'" za "'+expenseName+'" — $'+amount+' ('+wk+').');
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
      var safeName=String(e.name||'').replace(/"/g,'&quot;');
      html+='<div class="fa-pay-row '+(paid?'paid':'unpaid')+'" style="border-radius:4px;margin-top:.3rem;">'+
        '<div>'+
          '<span class="fa-pay-name">'+esc(e.name)+'</span>'+
          (e.note?'<div style="font-size:.65rem;color:var(--muted);font-family:Share Tech Mono,monospace;margin-top:.15rem;">'+esc(e.note)+'</div>':'')+
          '<div style="font-size:.65rem;color:var(--muted);font-family:Share Tech Mono,monospace;margin-top:.1rem;">$'+e.amount+' / '+(e.type==='weekly'?'týden':'jednorázově')+'</div>'+
        '</div>'+
        '<div style="display:flex;gap:.6rem;align-items:center;">'+
          '<span class="fa-pay-status '+(paid?'paid':'unpaid')+'">'+(paid?'✓ ZAPLACENO':'✗ NEZAPLACENO')+'</span>'+
          (!paid?'<button class="btn-record-pay" onclick="memberPayOptional(\"'+e.id+'\",\"'+safeName+'\",'+e.amount+')">ZAPLATIL JSEM</button>':'')+
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
  addLog('fin','Člen "'+m.displayName+'" evidoval týdenní příspěvek $'+fs.weeklyFee+' ('+wk+').');
  toast('Platba evidována ✓','success');renderMyFinance();updateBadges();
}

function memberPayOptional(expenseId,name,amount){
  var m=getMember();if(!m)return;
  var fin=DB.get('finance')||{payments:[],expenses:[]};
  var wk=getWeekKey();
  var already=fin.payments.some(function(p){return p.memberId===m.id&&p.expenseId===expenseId&&p.weekKey===wk;});
  if(already){toast('Platba již evidována','info');return;}
  fin.payments.push({id:uid(),memberId:m.id,memberName:m.displayName,weekKey:wk,amount:amount,date:nowStr(),note:name,expenseId:expenseId});
  DB.set('finance',fin);
  addLog('fin','Člen "'+m.displayName+'" přispěl na "'+name+'" — $'+amount+' ('+wk+').');
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
      '<span class="excuse-chip '+e.status+'">'+(e.status==='pending'?'ČEKÁ':e.status==='accepted'?'PŘIJATO':'ZAMÍTNUTO')+'</span></div>'+
      '<div class="excuse-detail">Datum: <strong>'+esc(e.date)+'</strong> — '+esc(e.reason)+'</div>'+
      (e.note?'<div class="excuse-detail" style="color:var(--muted)">'+esc(e.note)+'</div>':'')+
      '<div class="excuse-date-info">Odesláno: '+e.submitted+'</div>'+
      (e.status==='pending'?'<div class="excuse-actions"><button class="btn-acc small" onclick="resolveExcuse(\''+e.id+'\',\'accepted\')">PŘIJMOUT</button><button class="btn-danger" onclick="resolveExcuse(\''+e.id+'\',\'denied\')">ZAMÍTNOUT</button></div>':'')+
    '</div>';
  }).join('');
}
function resolveExcuse(id,decision){
  var excuses=DB.get('excuses')||[];var e=excuses.find(function(x){return x.id===id;});
  if(!e)return;e.status=decision;DB.set('excuses',excuses);
  addLog('sys','Admin '+(decision==='accepted'?'přijal':'zamítl')+' omluvenku od "'+e.memberName+'".');
  toast('Omluvenka '+(decision==='accepted'?'přijata':'zamítnuta'),'success');renderAdminExcuses();
}

// ── REPORTS ADMIN ────────────────────────────
function renderAdminReports(){
  var reports=DB.get('reports')||[];
  var el=document.getElementById('aReports');
  if(!reports.length){el.innerHTML='<div class="empty-s">// Žádná hlášení</div>';return;}
  el.innerHTML=reports.slice().reverse().map(function(r){
    return '<div class="rep-card"><div class="rep-from">// OD: '+esc(r.memberName)+' — '+r.date+'</div><div class="rep-body">'+esc(r.body)+'</div></div>';
  }).join('');
}

// ── RADIO ADMIN ──────────────────────────────
function renderAdminRadio(){
  var radios=DB.get('radios')||{primary:'',secondary:'',action:'',vedeni:''};
  document.getElementById('rPrimary').value=radios.primary||'';
  document.getElementById('rSecondary').value=radios.secondary||'';
  document.getElementById('rAction').value=radios.action||'';
  document.getElementById('rVedeni').value=radios.vedeni||'';
}
function saveRadios(){
  var radios={
    primary:document.getElementById('rPrimary').value.trim(),
    secondary:document.getElementById('rSecondary').value.trim(),
    action:document.getElementById('rAction').value.trim(),
    vedeni:document.getElementById('rVedeni').value.trim()
  };
  DB.set('radios',radios);
  addLog('sys','Admin aktualizoval frekvence vysílaček.');
  setText('radioSaveStatus','// ULOŽENO');setTimeout(function(){setText('radioSaveStatus','');},2000);
  toast('Frekvence uloženy','success');
}

// ── SETTINGS ─────────────────────────────────
function renderSettings(){
  var s=DB.get('settings')||{webhook:'',webhookName:'Frakce LOG'};
  var fs=DB.get('finsettings')||{weeklyFee:5000,feeDay:0};
  document.getElementById('discordWebhook').value=s.webhook||'';
  document.getElementById('discordName').value=s.webhookName||'Frakce LOG';
  document.getElementById('weeklyFee').value=fs.weeklyFee||5000;
  document.getElementById('feeDay').value=fs.feeDay||0;
  renderPanicList();
}
function saveWebhook(){
  var s=DB.get('settings')||{};
  s.webhook=document.getElementById('discordWebhook').value.trim();
  s.webhookName=document.getElementById('discordName').value.trim()||'Frakce LOG';
  DB.set('settings',s);setText('webhookStatus','// ULOŽENO');setTimeout(function(){setText('webhookStatus','');},2000);toast('Webhook uložen','success');
}
function testWebhook(){
  var s=DB.get('settings')||{};
  if(!s.webhook){toast('Zadejte webhook URL','error');return;}
  fetch(s.webhook,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:s.webhookName||'Frakce LOG',content:'✅ Test z Frakce LOG portálu — '+nowStr()})})
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
    var vedeni=isVedeni(m.position);
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
        '<div style="display:flex;gap:.4rem;flex-wrap:wrap;margin-top:.4rem;">'+
          '<div style="display:flex;gap:.4rem;width:100%;margin-bottom:.2rem;"><input type="text" class="mc-pos-sel" style="flex:1;min-width:0;" id="nm2-'+m.id+'" value="'+esc(m.displayName)+'" placeholder="IC jméno"/><button class="btn-acc small" onclick="changeName(\''+m.id+'\')">JMÉNO</button></div>'+
          '<select class="mc-pos-sel" id="pos-'+m.id+'">'+POSITIONS.map(function(p){return '<option value="'+p+'"'+(m.position===p?' selected':'')+'>'+p+'</option>';}).join('')+'</select>'+
          '<button class="btn-acc small" onclick="changePosition(\''+m.id+'\')">POZICE</button>'+
          '<button class="btn-acc small" onclick="toggleAdminAccess(\''+m.id+'\')">'+(!m.adminAccess?'DÁT ADMIN':'ODEBRAT ADMIN')+'</button>'+
          (m.panic?'<button class="btn-acc small" onclick="liftPanic(\''+m.id+'\')">ODEMKNOUT</button>':'')+
          '<button class="btn-danger small" onclick="deleteMember(\''+m.id+'\')">✕ SMAZAT</button>'+
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
  var st=document.getElementById('createStatus');
  if(!email||!name||!pass){st.textContent='// VYPLŇTE POVINNÁ POLE';return;}
  if(email.indexOf('@')<1){st.textContent='// NEPLATNÝ E-MAIL';return;}
  if(pass.length<6){st.textContent='// HESLO MIN. 6 ZNAKŮ';return;}
  var members=DB.get('members')||[];
  if(members.find(function(m){return (m.email||'').toLowerCase()===email;})){st.textContent='// E-MAIL JIŽ EXISTUJE';return;}
  st.textContent='// VYTVÁŘÍM ÚČET...';
  var res;
  try{res=await adminApi({action:'create',email:email,password:pass});}
  catch(e){st.textContent='// CHYBA: '+e.message;return;}
  members=DB.get('members')||[];
  members.push({id:uid(),authId:res.authId,email:email,displayName:name,position:pos,adminAccess:admin,note:note,panic:false});
  DB.set('members',members);
  addLog('member','Admin registroval nového člena: "'+name+'" ('+pos+').');
  st.textContent='// ČLEN REGISTROVÁN';
  setTimeout(function(){st.textContent='';},3000);
  ['nm-email','nm-name','nm-pass','nm-note'].forEach(function(i){document.getElementById(i).value='';});
  document.getElementById('nm-admin').checked=false;
  toast(name+' registrován','success');renderMemberGrid();populatePwMember();
}
function changeName(id){
  var members=DB.get('members')||[];var m=members.find(function(x){return x.id===id;});if(!m)return;
  var el=document.getElementById('nm2-'+id);var name=el?el.value.trim():'';
  if(!name){toast('Zadejte IC jméno','error');return;}
  var old=m.displayName;m.displayName=name;DB.set('members',members);
  addLog('member','Admin změnil jméno "'+old+'" na "'+name+'".');
  toast('Jméno změněno','success');renderMemberGrid();populatePwMember();
}
function changePosition(id){
  var members=DB.get('members')||[];var m=members.find(function(x){return x.id===id;});if(!m)return;
  var sel=document.getElementById('pos-'+id);if(!sel)return;
  m.position=sel.value;DB.set('members',members);
  addLog('member','Admin změnil pozici "'+m.displayName+'" na "'+m.position+'".');
  toast('Pozice aktualizována','success');renderMemberGrid();
}
function toggleAdminAccess(id){
  var members=DB.get('members')||[];var m=members.find(function(x){return x.id===id;});if(!m)return;
  m.adminAccess=!m.adminAccess;DB.set('members',members);
  addLog('member','Admin '+(m.adminAccess?'přidělil':'odebral')+' admin přístup "'+m.displayName+'".');
  toast('Admin přístup '+(m.adminAccess?'přidělen':'odebrán'),'info');renderMemberGrid();
}
async function deleteMember(id){
  var members=DB.get('members')||[];var m=members.find(function(x){return x.id===id;});
  if(!m)return;
  if(id===currentMemberId){toast('Nemůžeš smazat sám sebe','error');return;}
  if(!confirm('Smazat člena "'+m.displayName+'"? Smaže se i jeho přihlašovací účet.'))return;
  if(m.authId){
    try{await adminApi({action:'delete',authId:m.authId});}
    catch(e){toast('Chyba mazání účtu: '+e.message,'error',5000);return;}
  }
  DB.set('members',(DB.get('members')||[]).filter(function(x){return x.id!==id;}));
  addLog('member','Admin smazal člena "'+m.displayName+'".');
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
      '<div class="bp-body">'+esc(p.body)+'</div>'+
      '<div class="bp-footer"><span class="bp-date">'+p.date+' — '+esc(p.author)+'</span></div>'+
    '</div>';
  }).join('');
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
  addLog('board','Admin přidal příspěvek na nástěnku: "'+title+'".');
  document.getElementById('boardTitle').value='';document.getElementById('boardBody').value='';
  st.textContent='// ZVEŘEJNĚNO';setTimeout(function(){st.textContent='';},2000);
  toast('Příspěvek zveřejněn','success');renderAdminBoard();renderBoard();
}
function delPost(id){
  if(!confirm('Smazat příspěvek?'))return;
  DB.set('board',(DB.get('board')||[]).filter(function(p){return p.id!==id;}));
  var conf=DB.get('boardConfirmed')||{};delete conf[id];DB.set('boardConfirmed',conf);
  addLog('board','Admin smazal příspěvek z nástěnky.');
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
  addLog('task','Admin přiřadil úkol "'+title+'" členovi "'+(tm?tm.displayName:target)+'".');
  document.getElementById('taskTitle').value='';document.getElementById('taskDesc').value='';
  st.textContent='// ROZKAZ ODESLÁN';setTimeout(function(){st.textContent='';},2000);
  toast('Úkol přiřazen','success');
}
function sendMsg(){
  var target=document.getElementById('msgTarget').value;
  var subject=document.getElementById('msgSubject').value.trim();
  var body=document.getElementById('msgBody').value.trim();
  var st=document.getElementById('msgStatus');
  if(!subject||!body){st.textContent='// VYPLŇTE POLE';return;}
  var msgs=DB.get('messages')||{};
  var members=DB.get('members')||[];
  var targets=target==='all'?members.map(function(m){return m.id;}):[target];
  targets.forEach(function(tid){if(!msgs[tid])msgs[tid]=[];msgs[tid].push({id:uid(),subject:subject,body:body,date:nowStr()});});
  DB.set('messages',msgs);
  addLog('msg','Admin odeslal zprávu "'+subject+'" — '+(target==='all'?'všem':'jednomu členovi')+'.');
  document.getElementById('msgSubject').value='';document.getElementById('msgBody').value='';
  st.textContent='// ZPRÁVA ODESLÁNA';setTimeout(function(){st.textContent='';},2000);
  toast('Zpráva odeslána','success');
}

// ── WAREHOUSE ADMIN ───────────────────────────
var aWhCat='all';
function aWhFilter(cat,btn){
  aWhCat=cat;document.querySelectorAll('#at-warehouse .wf').forEach(function(b){b.classList.remove('active');});btn.classList.add('active');renderAdminWarehouse();
}
function renderAdminWarehouse(){
  var items=DB.get('warehouse')||[];
  var filtered=aWhCat==='all'?items:items.filter(function(i){return i.cat===aWhCat;});
  var el=document.getElementById('aWhGrid');if(!el)return;
  if(!filtered.length){el.innerHTML='<div class="empty-s" style="grid-column:1/-1">// Žádné položky</div>';return;}
  el.innerHTML=filtered.map(function(item){
    var qc=item.qty===0?'empty':(item.min>0&&item.qty<=item.min?'low':'');
    var imgH=item.img?'<div class="wh-img"><img src="images/'+esc(item.img)+'" onerror="this.parentElement.innerHTML=\'<span class=wh-icon>?</span>\'"/></div>':'<div class="wh-img"><span class="wh-icon">?</span></div>';
    return '<div class="wh-item">'+imgH+
      '<div class="wh-cat">'+(CAT[item.cat]||item.cat)+'</div>'+
      '<div class="wh-name">'+esc(item.name)+'</div>'+
      (item.note?'<div class="wh-note-text">'+esc(item.note)+'</div>':'')+
      '<div class="wh-qty-row"><span class="wh-qty '+qc+'">'+item.qty+'</span><span class="wh-unit"> KS</span></div>'+
      (item.qty===0?'<div class="wh-alert critical">VYPRODÁNO</div>':'')+
      (item.min>0&&item.qty>0&&item.qty<=item.min?'<div class="wh-alert">NÍZKÁ ZÁSOBA</div>':'')+
      '<div style="display:flex;gap:.4rem;margin-top:.5rem;flex-wrap:wrap;">'+
        '<input class="wh-ev-input small" type="number" value="1" min="1" id="aqty-'+item.id+'"/>'+
        '<button class="btn-pickup" onclick="adminAddQty(\''+item.id+'\')">+ PŘIDAT</button>'+
        '<button class="btn-pickup" onclick="adminSubQty(\''+item.id+'\')" style="background:rgba(220,60,60,.15);border-color:var(--red)">− UBRAT</button>'+
        '<button class="btn-micro del" onclick="deleteItem(\''+item.id+'\')">✕</button>'+
      '</div></div>';
  }).join('');
}
function toggleAddItem(){document.getElementById('addItemPanel').classList.toggle('hidden');}
function previewImg(val){var el=document.getElementById('wi-preview');if(!el)return;el.innerHTML=val?'<img src="images/'+esc(val)+'" style="max-height:60px;max-width:100%;object-fit:contain;" onerror="this.parentElement.innerHTML=\'nenalezeno\'"/>':'—';}
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
  addLog('wh','Admin přidal položku do skladu: "'+name+'" ('+qty+' ks).');
  ['wi-name','wi-img','wi-note'].forEach(function(i){document.getElementById(i).value='';});
  document.getElementById('wi-qty').value='1';document.getElementById('wi-min').value='0';
  st.textContent='// PŘIDÁNO';setTimeout(function(){st.textContent='';},2000);
  toast(name+' přidán','success');renderAdminWarehouse();renderMemberWarehouse();
}
function adminAddQty(id){
  var items=DB.get('warehouse')||[];var item=items.find(function(i){return i.id===id;});if(!item)return;
  var el=document.getElementById('aqty-'+id);var amt=parseInt(el?el.value:1)||1;
  item.qty+=amt;DB.set('warehouse',items);
  addLog('wh','Admin přidal '+amt+'x "'+item.name+'" do skladu.');
  toast('+'+amt+' přidáno','success');renderAdminWarehouse();renderMemberWarehouse();
}
function adminSubQty(id){
  var items=DB.get('warehouse')||[];var item=items.find(function(i){return i.id===id;});if(!item)return;
  var el=document.getElementById('aqty-'+id);var amt=parseInt(el?el.value:1)||1;
  item.qty=Math.max(0,item.qty-amt);DB.set('warehouse',items);
  addLog('wh','Admin odebral '+amt+'x "'+item.name+'" ze skladu.');
  toast('-'+amt+' odebráno','info');renderAdminWarehouse();renderMemberWarehouse();
}
function deleteItem(id){
  var items=DB.get('warehouse')||[];var item=items.find(function(i){return i.id===id;});
  if(!item||!confirm('Smazat položku "'+item.name+'"?'))return;
  DB.set('warehouse',items.filter(function(i){return i.id!==id;}));
  addLog('wh','Admin smazal položku "'+item.name+'" ze skladu.');
  toast('Položka smazána','info');renderAdminWarehouse();renderMemberWarehouse();
}

// ── LOG ──────────────────────────────────────
var LOG_LABELS={ev:'VÝDEJ',wh:'SKLAD',task:'ÚKOL',msg:'ZPRÁVA',member:'ČLEN',board:'NÁSTĚNKA',sys:'SYSTÉM',fin:'FINANCE',panic:'PANIC'};
function renderLog(){
  var log=DB.get('syslog')||[];var el=document.getElementById('aLog');
  if(!log.length){el.innerHTML='<div class="empty-s">// Log je prázdný</div>';return;}
  el.innerHTML=log.map(function(e){
    return '<div class="log-entry">'+
      '<span class="log-time">'+e.time+'</span>'+
      '<span class="log-type '+e.type+'">'+(LOG_LABELS[e.type]||e.type)+'</span>'+
      '<span class="log-actor">'+esc(e.actor||'?')+'</span>'+
      '<span class="log-text">'+esc(e.text)+'</span></div>';
  }).join('');
}
function clearLog(){if(!confirm('Vymazat celý log?'))return;DB.set('syslog',[]);renderLog();toast('Log vymazán','info');}


// ── OMLUVENKY (MEMBER) ───────────────────────
function submitExcuse(){
  var m=getMember();if(!m)return;
  var date=document.getElementById('excDate').value;
  var event=document.getElementById('excEvent').value.trim();
  var reason=document.getElementById('excReason').value.trim();
  var note=document.getElementById('excNote').value.trim();
  var st=document.getElementById('excStatus');
  if(!date||!event||!reason){st.textContent='// VYPLŇTE POVINNÁ POLE';return;}
  var excuses=DB.get('excuses')||[];
  excuses.push({id:uid(),memberId:m.id,memberName:m.displayName,date:date,event:event,reason:reason,note:note,status:'pending',submitted:nowStr()});
  DB.set('excuses',excuses);
  addLog('sys','Člen "'+m.displayName+'" odeslal omluvenku na "'+event+'".');
  ['excDate','excEvent','excReason','excNote'].forEach(function(i){document.getElementById(i).value='';});
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
      '<span class="excuse-chip '+e.status+'">'+(e.status==='pending'?'ČEKÁ':e.status==='accepted'?'PŘIJATO':'ZAMÍTNUTO')+'</span></div>'+
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
  addLog('sys','Člen "'+m.displayName+'" odeslal hlášení.');
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
function renderMyRadio(){
  var radios=DB.get('radios')||{primary:'',secondary:'',action:'',vedeni:''};
  var m=getMember();
  var vedeni=m&&isVedeni(m.position);
  var el=document.getElementById('radioDisplay');if(!el)return;
  var rows=[
    {label:'PRIMÁRNÍ',val:radios.primary,color:'var(--acc)'},
    {label:'SEKUNDÁRNÍ',val:radios.secondary,color:'var(--acc)'},
    {label:'AKCE',val:radios.action,color:'var(--green)'}
  ];
  if(vedeni)rows.push({label:'VEDENÍ',val:radios.vedeni,color:'var(--red)'});
  el.innerHTML='<div class="radio-grid">'+rows.map(function(r){
    return '<div class="radio-card">'+
      '<div class="radio-label">'+r.label+'</div>'+
      '<div class="radio-freq" style="color:'+r.color+';">'+(r.val||'—')+'</div>'+
      (r.desc?'<div class="radio-desc">'+r.desc+'</div>':'')+
    '</div>';
  }).join('')+'</div>';
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
  addLog('fin','Člen "'+m.displayName+'" nahlásil příjem $'+amount+' ('+source+').');
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
        '<div class="inc-card-bot"><span class="inc-date">'+i.date+'</span><span class="inc-status confirmed">✓ POTVRZENO</span></div>'+
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
  addLog('fin','Admin '+(decision==='confirmed'?'potvrdil':'zamítl')+' příjem $'+item.amount+' od "'+item.memberName+'" ('+item.source+').');
  toast(decision==='confirmed'?'Příjem potvrzen ✓':'Zamítnuto','info');
  renderAdminIncomes();
  renderAdminFinance();
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
