/* ===== rozsireni.js =====
   Načítat PO tsc.js. Obsahuje:
   1) Plánovač akcí (role + výbava napojená na sklad + předvyplněný heist report)
   5) Dluhy a půjčky
   7) Nepřátelé a spojenci
   9) Šablony úkolů a hlášení (i opakované)
  10) Oprávnění po sekcích (Nastavení → jen Mastermind)
*/
(function(){
'use strict';

/* ───────── pomocné ───────── */
function $(id){return document.getElementById(id);}
function me(){return getMember();}
function members(){return DB.get('members')||[];}
function players(){return members().filter(function(m){return !m.hidden;});}
function memById(id){return members().filter(function(m){return m.id===id;})[0]||null;}
function lbl(m){return m?(typeof memberLabel==='function'?memberLabel(m):m.displayName):'(smazaný člen)';}
function mention(m){var id=String((m&&m.discordId)||'').replace(/\D/g,'');return id?'<@'+id+'>':'';}
function usd(n){return '$'+Number(n||0).toLocaleString('cs-CZ');}
function fmtD(s){if(!s)return '—';var p=String(s).split('-');return p.length===3?(+p[2])+'. '+(+p[1])+'. '+p[0]:s;}
function today(){return ymd(new Date());}
function memberPing(){var s=DB.get('settings')||{};return s.memberRoleId?'<@&'+s.memberRoleId+'>':'';}
function confirmDanger(title,text,ok,fn){
  if(typeof window.tscDialog==='function')window.tscDialog({title:title,text:text,ok:ok,danger:true,cancel:'ZRUŠIT'},fn);
  else if(window.confirm(title))fn();
}
var busy={};
function ready(){return !!currentMemberId&&!!sb&&!!DB.cache&&DB.cache.members!==undefined;}
/* jednou denně (po zadané hodině), bez duplicit mezi více přihlášenými */
async function dailyOnce(key,hour,fn){
  if(busy[key]||!ready())return;
  var now=new Date();if(now.getHours()<hour)return;
  var t=ymd(now),cur=DB.get(key)||{};if(cur.last===t)return;
  busy[key]=1;
  try{
    var r=await sb.from(TABLE).select('value').eq('key',key).maybeSingle();
    var fresh=(r.data&&r.data.value)||{};
    if(fresh.last===t){DB.cache[key]=fresh;}
    else{fresh.last=t;DB.set(key,fresh);await DB.flush();fn(now);}
  }catch(e){console.error(key,e);}
  busy[key]=0;
}

/* sekce Discord logu + popisky */
[['plan','Plánovač akcí (role, výbava)'],['debt','Dluhy a půjčky'],['foe','Nepřátelé a spojenci'],['tpl','Šablony úkolů'],['perm','Oprávnění po sekcích']].forEach(function(s){
  if(!SECTIONS.some(function(x){return x.key===s[0];}))SECTIONS.push({key:s[0],label:s[1]});
});
LOG_ICONS.plan='🗓';LOG_ICONS.debt='💸';LOG_ICONS.foe='⚔️';LOG_ICONS.tpl='📋';LOG_ICONS.perm='🛡';
LOG_LABELS.plan='PLÁN AKCE';LOG_LABELS.debt='DLUHY';LOG_LABELS.foe='NEPŘÁTELÉ';LOG_LABELS.tpl='ŠABLONY';LOG_LABELS.perm='OPRÁVNĚNÍ';
if(typeof MENU_GROUPS!=='undefined'){MENU_GROUPS.debts='C';MENU_GROUPS.foes='D';MENU_GROUPS.templates='E';}

/* ═══════════════════════════════════════════
   10) OPRÁVNĚNÍ PO SEKCÍCH
   Mastermind / Overseer / Counselor mají vždy vše.
   Ostatní pozice s admin přístupem: ve výchozím stavu vše, Mastermind může sekce odebrat.
   Ukládá se seznam ZAKÁZANÝCH sekcí → nově přidané sekce jsou ve výchozím stavu povolené.
   ═══════════════════════════════════════════ */
var ADM_SECTIONS=[['board','Oznámení'],['tasks','Úkoly'],['templates','Šablony'],['messages','Zprávy'],['calendar','Kalendář'],['warehouse','Sklad'],['boosting','Boosting'],['heists','Heisty'],['clothing','Oblečení'],['finance','Finance'],['debts','Dluhy'],['incomes','Příjmy'],['excuses','Omluvenky'],['reports','Hlášení'],['radio','Vysílačka'],['members','Členové'],['roster','Crew List'],['stats','Statistiky'],['log','Log'],['settings','Nastavení']];
var PERM_POS=POSITIONS.filter(function(p){return ADMIN_POS.indexOf(p)===-1;});
function deniedOf(pos){var p=DB.get('perms')||{};return Array.isArray(p[pos])?p[pos]:[];}
window.canSection=function(key){
  var m=me();if(!m||!m.adminAccess)return false;
  if(ADMIN_POS.indexOf(m.position)!==-1)return true;
  return deniedOf(m.position).indexOf(key)===-1;
};
function applyPerms(){
  var m=me(),nav=document.querySelector('#adminScreen .sb-nav');if(!m||!nav)return;
  [].slice.call(nav.querySelectorAll(':scope > .nb')).forEach(function(b){
    var k=menuKey(b);if(!k)return;var no=!canSection(k);
    b.classList.toggle('perm-hide',no);b.classList.toggle('hidden',no);
  });
  var hd=null,vis=0;
  function fin(){if(hd)hd.classList.toggle('perm-hide',vis===0);}
  [].slice.call(nav.children).forEach(function(el){
    if(el.classList.contains('nav-grp')){fin();hd=el;vis=0;}
    else if(el.classList.contains('nb')&&!el.classList.contains('perm-hide'))vis++;
  });
  fin();
  var act=nav.querySelector(':scope > .nb.active');
  if(act&&act.classList.contains('perm-hide')){
    var first=nav.querySelector(':scope > .nb:not(.perm-hide)');if(first)first.click();
  }
}
function renderPermPanel(){
  var host=$('at-settings'),m=me();if(!host||!m||m.position!=='Mastermind')return;
  var p=$('permPanel');
  if(!p){
    p=document.createElement('div');p.id='permPanel';p.className='form-panel';p.style.margin='0 1.2rem 1rem';host.appendChild(p);
    p.addEventListener('click',function(e){
      if(e.target.id==='permSave')savePerms();
      else if(e.target.id==='permAll')p.querySelectorAll('input[type=checkbox]').forEach(function(c){c.checked=true;});
    });
  }
  if(p.contains(document.activeElement))return;
  p.innerHTML='<div class="fp-title">// OPRÁVNĚNÍ PO SEKCÍCH (administrace)</div>'+
    '<div class="rx-hint">Zaškrtnuto = pozice sekci v Administraci vidí a smí ji používat. Mastermind, Overseer a Counselor mají vždy vše. Ochrana platí v rozhraní portálu (viz poznámka u RLS v Supabase).</div>'+
    '<div class="rx-scroll"><table class="rx-perm"><thead><tr><th>SEKCE</th>'+PERM_POS.map(function(x){return '<th>'+esc(x)+'</th>';}).join('')+'</tr></thead><tbody>'+
    ADM_SECTIONS.map(function(s){
      return '<tr><td>'+esc(s[1])+'</td>'+PERM_POS.map(function(pos){
        return '<td><input type="checkbox" data-pos="'+esc(pos)+'" data-sec="'+s[0]+'"'+(deniedOf(pos).indexOf(s[0])===-1?' checked':'')+'/></td>';
      }).join('')+'</tr>';
    }).join('')+'</tbody></table></div>'+
    '<div class="fp-ftr"><button class="btn-acc small" id="permSave">ULOŽIT OPRÁVNĚNÍ</button><button class="btn-ghost small" id="permAll">ZAŠKRTNOUT VŠE</button><span id="permSt" class="smsg"></span></div>';
}
function savePerms(){
  var m=me();if(!m||m.position!=='Mastermind'){toast('Oprávnění smí měnit jen Mastermind','error');return;}
  var out={};
  document.querySelectorAll('#permPanel input[type=checkbox]').forEach(function(c){
    if(c.checked)return;var pos=c.getAttribute('data-pos');(out[pos]=out[pos]||[]).push(c.getAttribute('data-sec'));
  });
  DB.set('perms',out);
  addLog('perm',m.displayName+' upravil oprávnění po sekcích.',{noDiscord:true});
  var st=$('permSt');if(st){st.textContent='// ULOŽENO';setTimeout(function(){st.textContent='';},2000);}
  toast('Oprávnění uložena','success');applyPerms();
}

/* ═══════════════════════════════════════════
   1) PLÁNOVAČ AKCÍ — role, výbava ze skladu, heist report
   ═══════════════════════════════════════════ */
var openPl={};
var DEF_ROLES=[['Vedoucí',1],['Řidič',1],['Hacker',1],['Střelec',2],['Backup',1]];
function started(e){var d=evStart(e);return !!d&&d.getTime()<=Date.now();}
function evById(id){return (DB.get('events')||[]).filter(function(x){return x.id===id;})[0]||null;}
function rerenderCal(){try{renderCalendar('m');}catch(x){}try{renderCalendar('a');}catch(x){}}
function withEv(id,fn){
  var evs=DB.get('events')||[],e=evs.filter(function(x){return x.id===id;})[0];if(!e)return false;
  if(fn(e)===false)return false;
  DB.set('events',evs);rerenderCal();return true;
}
function canPlan(e){var m=me();return !!m&&(canSection('calendar')||e.by===m.id);}
function gearState(g,wh){var it=wh.filter(function(i){return i.id===g.itemId;})[0];var have=it?it.qty:0;return {it:it,have:have,miss:Math.max(0,g.need-have)};}
function gearMiss(e){var wh=DB.get('warehouse')||[];return (e.gear||[]).filter(function(g){return gearState(g,wh).miss>0;}).length;}
function assignedTo(e,rid){var a=e.assign||{};return Object.keys(a).filter(function(k){return a[k]===rid;}).map(memById).filter(Boolean);}

function planHtml(e,m){
  var roles=e.roles||[],assign=e.assign||{},gear=e.gear||[],wh=DB.get('warehouse')||[],edit=canPlan(e),id=e.id;
  var slots=roles.reduce(function(s,r){return s+r.slots;},0);
  var filled=roles.reduce(function(s,r){return s+Math.min(r.slots,assignedTo(e,r.id).length);},0);
  var miss=gearMiss(e);
  var sum='🗓 PLÁN AKCE'+(roles.length?' — role '+filled+'/'+slots:'')+(gear.length?(miss?' · <span class="pl-bad">⚠ chybí výbava ('+miss+')</span>':' · výbava OK'):'');
  var rh=roles.map(function(r){
    var who=assignedTo(e,r.id),mine=assign[m.id]===r.id,full=who.length>=r.slots;
    return '<div class="pl-role'+(full?' full':'')+(mine?' mine':'')+'"><div class="pl-rn"><b>'+esc(r.name)+'</b><span class="pl-sl">'+who.length+'/'+r.slots+'</span></div>'+
      '<div class="pl-rw">'+(who.length?who.map(function(x){return esc(lbl(x));}).join(', '):'<em>volné</em>')+'</div>'+
      '<div class="pl-ra">'+(mine?'<button class="btn-micro" onclick="plRole(\''+id+'\',\''+r.id+'\',0)">✕ ZRUŠIT</button>':(full?'':'<button class="btn-micro on" onclick="plRole(\''+id+'\',\''+r.id+'\',1)">VZÍT ROLI</button>'))+
      (edit?'<button class="btn-micro del" title="Smazat roli" onclick="plRoleDel(\''+id+'\',\''+r.id+'\')">🗑</button>':'')+'</div></div>';
  }).join('')||'<div class="empty-s">// Zatím žádné role</div>';
  var radd=edit?'<div class="pl-add"><input type="text" id="plRn-'+id+'" class="rx-in" maxlength="24" placeholder="název role (např. Řidič)"/><input type="number" id="plRs-'+id+'" class="rx-in rx-num" value="1" min="1" max="9"/><button class="btn-micro" onclick="plRoleAdd(\''+id+'\')">+ ROLE</button>'+
    (roles.length?'':'<button class="btn-micro" onclick="plRolesDefault(\''+id+'\')">+ STANDARDNÍ ROLE</button>')+'</div>':'';
  var gh=gear.map(function(g){
    var s=gearState(g,wh);
    return '<div class="pl-gear '+(s.miss?'bad':'ok')+'"><span class="pl-gn">'+esc(s.it?s.it.name:g.name)+'</span><span class="pl-gs">'+(s.miss?'⚠ chybí '+s.miss+' · sklad '+s.have+' / potřeba '+g.need:'✓ '+s.have+' ve skladu / potřeba '+g.need)+'</span>'+
      (edit?'<button class="btn-micro del" onclick="plGearDel(\''+id+'\',\''+g.id+'\')">✕</button>':'')+'</div>';
  }).join('')||'<div class="empty-s">// Výbava není zadaná</div>';
  var gadd=edit?'<div class="pl-add"><select id="plGi-'+id+'" class="rx-sel">'+wh.slice().sort(function(a,b){return String(a.name).localeCompare(String(b.name),'cs');}).map(function(i){return '<option value="'+esc(i.id)+'">'+esc(i.name)+' (sklad '+i.qty+')</option>';}).join('')+'</select>'+
    '<input type="number" id="plGq-'+id+'" class="rx-in rx-num" value="1" min="1"/><button class="btn-micro" onclick="plGearAdd(\''+id+'\')">+ VÝBAVA</button></div>':'';
  var acts='<div class="pl-acts">'+(edit?'<button class="btn-acc small" onclick="plSend(\''+id+'\')">📣 ODESLAT PLÁN NA DISCORD</button>':'')+
    (started(e)?'<button class="btn-acc small" onclick="plReport(\''+id+'\')">💎 VYTVOŘIT HEIST REPORT</button>':'')+'</div>';
  return '<details class="pl-box" data-pl="'+id+'"'+(openPl[id]?' open':'')+'><summary>'+sum+'</summary>'+
    '<div class="pl-sec">// ROLE</div>'+rh+radd+'<div class="pl-sec">// VÝBAVA (porovnáno se skladem)</div>'+gh+gadd+acts+'</details>';
}
document.addEventListener('toggle',function(e){var d=e.target;if(d&&d.classList&&d.classList.contains('pl-box'))openPl[d.getAttribute('data-pl')]=d.open;},true);

var _ec=window.evCard;
window.evCard=function(e,scope,m){
  var h=_ec.apply(this,arguments);
  try{
    if(!e||!e.id||typeof h!=='string'||!m)return h;
    var i=h.lastIndexOf('</div>');return i<0?h:h.slice(0,i)+planHtml(e,m)+h.slice(i);
  }catch(x){console.error(x);return h;}
};

window.plRole=function(id,rid,take){
  var m=me();if(!m)return;
  withEv(id,function(e){
    e.assign=e.assign||{};
    var r=(e.roles||[]).filter(function(x){return x.id===rid;})[0];if(!r)return false;
    if(take){
      var n=Object.keys(e.assign).filter(function(k){return e.assign[k]===rid&&k!==m.id;}).length;
      if(n>=r.slots){toast('Role je už obsazená','error');return false;}
      e.assign[m.id]=rid;e.rsvp=e.rsvp||{};if(e.rsvp[m.id]!=='yes')e.rsvp[m.id]='yes';
      toast('Role „'+r.name+'“ je tvoje','success');
    }else if(e.assign[m.id]===rid){delete e.assign[m.id];toast('Role uvolněna','info');}
  });
};
window.plRoleAdd=function(id){
  var n=$('plRn-'+id),s=$('plRs-'+id);var name=n?n.value.trim():'',slots=Math.max(1,Math.min(9,parseInt(s?s.value:1,10)||1));
  if(!name){toast('Zadej název role','error');return;}
  withEv(id,function(e){if(!canPlan(e))return false;e.roles=e.roles||[];e.roles.push({id:uid(),name:name.slice(0,24),slots:slots});});
};
window.plRolesDefault=function(id){
  withEv(id,function(e){if(!canPlan(e))return false;e.roles=e.roles||[];
    DEF_ROLES.forEach(function(r){if(!e.roles.some(function(x){return x.name===r[0];}))e.roles.push({id:uid(),name:r[0],slots:r[1]});});});
};
window.plRoleDel=function(id,rid){
  withEv(id,function(e){if(!canPlan(e))return false;
    e.roles=(e.roles||[]).filter(function(r){return r.id!==rid;});
    Object.keys(e.assign||{}).forEach(function(k){if(e.assign[k]===rid)delete e.assign[k];});});
};
window.plGearAdd=function(id){
  var s=$('plGi-'+id),q=$('plGq-'+id);var itemId=s?s.value:'',need=Math.max(1,parseInt(q?q.value:1,10)||1);
  var it=(DB.get('warehouse')||[]).filter(function(i){return i.id===itemId;})[0];
  if(!it){toast('Vyber položku ze skladu','error');return;}
  withEv(id,function(e){if(!canPlan(e))return false;e.gear=e.gear||[];
    var ex=e.gear.filter(function(g){return g.itemId===itemId;})[0];
    if(ex)ex.need+=need;else e.gear.push({id:uid(),itemId:itemId,name:it.name,need:need});});
};
window.plGearDel=function(id,gid){
  withEv(id,function(e){if(!canPlan(e))return false;e.gear=(e.gear||[]).filter(function(g){return g.id!==gid;});});
};
window.plSend=function(id){
  var e=evById(id),m=me();if(!e||!m||!canPlan(e))return;
  var d=evStart(e),wh=DB.get('warehouse')||[];
  var rl=(e.roles||[]).map(function(r){var w=assignedTo(e,r.id);
    return '**'+r.name+'**: '+(w.length?w.map(lbl).join(', '):'_volné_')+(w.length<r.slots?' ('+(r.slots-w.length)+' volné)':'');}).join('\n');
  var gl=(e.gear||[]).map(function(g){var s=gearState(g,wh);
    return (s.miss?'⚠️ ':'✅ ')+g.need+'× '+(s.it?s.it.name:g.name)+' — sklad '+s.have+(s.miss?' (chybí '+s.miss+')':'');}).join('\n');
  var pings=Object.keys(e.assign||{}).map(function(k){return mention(memById(k));}).filter(Boolean).join(' ');
  addLog('plan',m.displayName+' odeslal plán akce "'+e.title+'".',{extraPing:pings,embed:rich(C_BLUE,'🗓 PLÁN AKCE — '+e.title,e.note||null,[
    ['🕒 Kdy',d?fmtEv(d):'—'],['📍 Místo',e.place||'neuvedeno'],['🎭 Role',rl||'zatím žádné',false],['🎒 Výbava',gl||'bez požadavků',false]],{by:m.displayName})});
  toast('Plán odeslán na Discord','success');
};
window.plReport=function(id){
  var e=evById(id),m=me();if(!e||!m)return;
  var att=e.att||{},came=Object.keys(att).filter(function(k){return att[k]==='came';}),ids;
  if(came.length)ids=came.slice();
  else ids=Object.keys(e.assign||{}).concat(Object.keys(e.rsvp||{}).filter(function(k){return e.rsvp[k]==='yes';}));
  if(ids.indexOf(m.id)===-1)ids.push(m.id);
  ids=ids.filter(function(x,i){return ids.indexOf(x)===i&&memById(x);});
  goTo('m','heist');
  setTimeout(function(){
    var box=$('hs-crew');
    if(box){
      box.dataset.init='1';
      box.querySelectorAll('input[type=checkbox]').forEach(function(c){c.checked=ids.indexOf(c.value)!==-1;});
      var det=box.querySelector('details');if(det)det.open=true;
      if(typeof heistCrewUpdate==='function')heistCrewUpdate();
    }
    var sel=$('hs-target'),nt=normS(e.title);
    if(sel&&e.type==='heist')for(var i=0;i<sel.options.length;i++){var o=sel.options[i].text;if(o!=='Jiné'&&nt.indexOf(normS(o))!==-1){sel.value=o;break;}}
    var det2=$('hs-detail');if(det2)det2.value=e.place?e.title+' — '+e.place:e.title;
    var ds=$('hs-desc');
    if(ds&&!ds.value.trim()){
      var d=evStart(e),rl=(e.roles||[]).map(function(r){var w=assignedTo(e,r.id);return w.length?r.name+': '+w.map(lbl).join(', '):'';}).filter(Boolean).join('; ');
      ds.value='Akce: '+e.title+(d?' ('+fmtEv(d)+')':'')+'.'+(rl?'\nRole: '+rl+'.':'')+'\n\n';
    }
    toast('Report předvyplněn z akce — doplň loot a popis','success',4500);
  },80);
};

/* ═══════════════════════════════════════════
   5) DLUHY A PŮJČKY
   ═══════════════════════════════════════════ */
var dbtF={m:'open',a:'open'};
function debts(){var a=DB.get('debts');return Array.isArray(a)?a:[];}
function dPaid(d){return (d.pay||[]).reduce(function(s,p){return s+(+p.amt||0);},0);}
function dLeft(d){return Math.max(0,(+d.amount||0)-dPaid(d));}
function dOver(d){return dLeft(d)>0&&!!d.due&&d.due<today();}
function dMine(d,m){return d.borrowerId===m.id||d.lenderId===m.id;}
function dCanPay(d,m){return d.kind==='faction'?canSection('debts'):(d.lenderId===m.id||canSection('debts'));}
function dCanDel(d,m){return d.by===m.id||canSection('debts');}
function dWho(d){
  var b=memById(d.borrowerId),l=d.kind==='faction'?null:memById(d.lenderId);
  return {b:b,l:l,bn:b?b.displayName:'(smazaný člen)',ln:d.kind==='faction'?'KASA FRAKCE':(l?l.displayName:'(smazaný člen)')};
}
function withDebt(id,fn){
  var a=debts(),d=a.filter(function(x){return x.id===id;})[0];if(!d)return false;
  if(fn(d)===false)return false;DB.set('debts',a);return true;
}
function dbtFormHtml(s){
  var fac=canSection('debts');
  return '<div class="form-panel" style="margin:1.1rem 0"><div class="fp-title">// NOVÝ ZÁZNAM</div><div class="form-grid">'+
    '<div class="field-group"><label class="fl">TYP *</label><div class="iw"><span class="ip">&gt;_</span><select id="dbt-'+s+'-type"><option value="lend">Půjčil jsem členovi</option><option value="borrow">Půjčil jsem si od člena</option>'+(fac?'<option value="faction">Půjčka z kasy frakce (vedení)</option>':'')+'</select></div></div>'+
    '<div class="field-group"><label class="fl">ČLEN (druhá strana / dlužník) *</label><div class="iw"><span class="ip">&gt;_</span><select id="dbt-'+s+'-party"></select></div></div>'+
    '<div class="field-group"><label class="fl">ČÁSTKA ($) *</label><div class="iw"><span class="ip">$</span><input type="number" id="dbt-'+s+'-amt" min="1"/></div></div>'+
    '<div class="field-group"><label class="fl">SPLATNOST</label><div class="iw"><span class="ip">&gt;_</span><input type="date" id="dbt-'+s+'-due"/></div></div>'+
    '<div class="field-group fg-full"><label class="fl">POZNÁMKA</label><div class="iw"><span class="ip">&gt;_</span><input type="text" id="dbt-'+s+'-note" maxlength="160" placeholder="za co, podmínky…"/></div></div></div>'+
    '<div class="fp-ftr"><button class="btn-acc small" onclick="dbtAdd(\''+s+'\')">💸 ZAPSAT</button><span id="dbt-'+s+'-st" class="smsg"></span></div></div>';
}
function fillParty(s){
  var sel=$('dbt-'+s+'-party');if(!sel||document.activeElement===sel)return;
  var cur=sel.value,h='<option value="">— vyber —</option>'+players().map(function(x){return '<option value="'+esc(x.id)+'">'+esc(x.displayName)+'</option>';}).join('');
  if(sel.dataset.h!==h){sel.dataset.h=h;sel.innerHTML=h;sel.value=cur;}
}
window.dbtAdd=function(s){
  var m=me();if(!m)return;
  var t=$('dbt-'+s+'-type').value,p=$('dbt-'+s+'-party').value,amt=Math.floor(Number($('dbt-'+s+'-amt').value)||0),
      due=$('dbt-'+s+'-due').value,note=$('dbt-'+s+'-note').value.trim(),st=$('dbt-'+s+'-st');
  function err(x){st.style.color='var(--red)';st.textContent=x;}
  if(!p)return err('// VYBER ČLENA');
  if(amt<=0)return err('// ZADEJ ČÁSTKU');
  if(t==='faction'&&!canSection('debts'))return err('// POUZE VEDENÍ');
  if(t!=='faction'&&p===m.id)return err('// NEMŮŽEŠ SI PŮJČIT SÁM OD SEBE');
  var d={id:uid(),kind:t==='faction'?'faction':'member',borrowerId:t==='borrow'?m.id:p,lenderId:t==='lend'?m.id:(t==='borrow'?p:null),
    amount:amt,due:due||'',note:note,created:nowStr(),by:m.id,pay:[]};
  var a=debts();a.push(d);DB.set('debts',a);
  var w=dWho(d);
  if(d.kind==='faction')addLog('debt',m.displayName+' půjčil z kasy '+usd(amt)+' členovi '+w.bn+'.',{extraPing:mention(w.b),embed:rich(C_ORANGE,'💸 PŮJČKA Z KASY FRAKCE',note||null,[['👤 Dlužník',w.bn],['💵 Částka',usd(amt)],['📅 Splatnost',fmtD(due)],['🧑 Zadal',m.displayName]],{by:m.displayName})});
  else addLog('debt',w.ln+' půjčil '+usd(amt)+' členovi '+w.bn+'.',{noDiscord:true});
  ['amt','due','note'].forEach(function(k){$('dbt-'+s+'-'+k).value='';});
  st.style.color='';st.textContent='// ZAPSÁNO';setTimeout(function(){st.textContent='';},2000);
  toast('Záznam uložen','success');renderDebts('m');renderDebts('a');
};
window.dbtPay=function(id){
  var m=me(),d=debts().filter(function(x){return x.id===id;})[0];if(!m||!d||!dCanPay(d,m))return;
  var w=dWho(d);
  window.tscDialog({title:'💵 ZAPSAT SPLÁTKU',text:esc(w.bn+' → '+w.ln)+'<div class="tsc-sub">Zbývá zaplatit '+usd(dLeft(d))+'. Kolik bylo právě splaceno?</div>',input:true,value:dLeft(d),ok:'ZAPSAT',cancel:'ZRUŠIT'},function(v){
    var a=Math.floor(parseFloat(String(v).replace(/[^\d.,]/g,'').replace(',','.'))||0);
    if(a<=0){toast('Neplatná částka','error');return;}
    var done=false,paidAmt=0;
    withDebt(id,function(x){
      a=Math.min(a,dLeft(x));if(a<=0)return false;paidAmt=a;
      x.pay=x.pay||[];x.pay.push({amt:a,date:nowStr(),by:m.displayName});done=dLeft(x)===0;
    });
    if(!paidAmt)return;
    if(d.kind==='faction'){
      var inc=DB.get('incomes')||[];
      inc.push({id:uid(),memberId:d.borrowerId,memberName:w.bn,amount:paidAmt,source:'Splátka půjčky',note:'Půjčka z kasy',date:nowStr(),status:'confirmed'});
      DB.set('incomes',inc);
      addLog('debt','Splátka '+usd(paidAmt)+' od '+w.bn+(done?' — půjčka splacena.':'.'),{embed:rich(C_GREEN,done?'✅ PŮJČKA SPLACENA':'💵 SPLÁTKA PŮJČKY',null,[['👤 Dlužník',w.bn],['💵 Zaplaceno',usd(paidAmt)],['📉 Zbývá',usd(Math.max(0,dLeft(d)-paidAmt))]],{by:m.displayName})});
    }else addLog('debt','Splátka '+usd(paidAmt)+': '+w.bn+' → '+w.ln+(done?' (splaceno).':'.'),{noDiscord:true});
    toast(done?'Dluh splacen ✓':'Splátka zapsána','success');renderDebts('m');renderDebts('a');
  });
};
window.dbtRemind=function(id){
  var m=me(),d=debts().filter(function(x){return x.id===id;})[0];if(!m||!d||!dCanPay(d,m))return;
  var w=dWho(d);
  addLog('debt',m.displayName+' připomněl dluh: '+w.bn+' → '+w.ln+' ('+usd(dLeft(d))+').',{extraPing:mention(w.b),embed:rich(dOver(d)?C_RED:C_ORANGE,'⏰ PŘIPOMÍNKA DLUHU',d.note||null,[['👤 Dlužník',w.bn],['🏦 Komu',w.ln],['💵 Zbývá',usd(dLeft(d))],['📅 Splatnost',fmtD(d.due)]],{by:m.displayName})});
  toast('Připomínka odeslána na Discord','success');
};
window.dbtDel=function(id){
  var m=me(),d=debts().filter(function(x){return x.id===id;})[0];if(!m||!d||!dCanDel(d,m))return;
  var w=dWho(d);
  confirmDanger('⚠ SMAZAT ZÁZNAM?',esc(w.bn+' → '+w.ln+' ('+usd(dLeft(d))+')'),'SMAZAT',function(){
    DB.set('debts',debts().filter(function(x){return x.id!==id;}));
    addLog('debt',m.displayName+' smazal záznam dluhu '+w.bn+' → '+w.ln+'.',{noDiscord:true});
    toast('Záznam smazán','info');renderDebts('m');renderDebts('a');
  });
};
window.dbtFilter=function(s,f){dbtF[s]=f;renderDebts(s);};
function dCard(d,m){
  var w=dWho(d),left=dLeft(d),p=dPaid(d),pct=d.amount?Math.min(100,Math.round(p/d.amount*100)):0,over=dOver(d),done=left===0;
  var can=dCanPay(d,m);
  return '<div class="dbt-card'+(done?' done':over?' over':'')+(d.kind==='faction'?' fac':'')+'">'+
    '<div class="dbt-top"><div class="dbt-who"><b>'+esc(w.bn)+'</b> <span class="dbt-ar">dluží</span> <b>'+esc(w.ln)+'</b></div>'+
    (done?'<span class="dbt-st ok">✓ SPLACENO</span>':over?'<span class="dbt-st bad">⏰ PO SPLATNOSTI</span>':'<span class="dbt-st">OTEVŘENO</span>')+'</div>'+
    '<div class="dbt-am"><b>'+usd(left)+'</b><small> z '+usd(d.amount)+'</small></div>'+
    '<div class="dbt-bar"><i style="width:'+pct+'%"></i></div>'+
    '<div class="dbt-meta">'+(d.due?'Splatnost: <b>'+esc(fmtD(d.due))+'</b>':'bez termínu')+' · '+(d.kind==='faction'?'půjčka z kasy':'mezi členy')+' · zadáno '+esc(d.created||'')+'</div>'+
    (d.note?'<div class="dbt-note">'+esc(d.note)+'</div>':'')+
    ((d.pay||[]).length?'<div class="dbt-pay">'+d.pay.slice(-4).map(function(x){return '<span>'+usd(x.amt)+' · '+esc(String(x.date||'').split(',')[0])+'</span>';}).join('')+'</div>':'')+
    '<div class="dbt-act">'+(!done&&can?'<button class="btn-acc small" onclick="dbtPay(\''+d.id+'\')">💵 ZAPSAT SPLÁTKU</button><button class="btn-micro" onclick="dbtRemind(\''+d.id+'\')">📣 PŘIPOMENOUT</button>':'')+
    (dCanDel(d,m)?'<button class="btn-micro del" onclick="dbtDel(\''+d.id+'\')">✕</button>':'')+'</div></div>';
}
function renderDebts(s){
  var root=$(s==='a'?'debtsA':'debtsM'),m=me();if(!root||!m)return;
  var fac=canSection('debts')?'1':'0';
  if(!root.dataset.built||root.dataset.fac!==fac){root.dataset.built='1';root.dataset.fac=fac;root.innerHTML='<div id="dbtForm-'+s+'">'+dbtFormHtml(s)+'</div><div id="dbtList-'+s+'"></div>';}
  fillParty(s);
  var all=debts(),list=(s==='a'&&canSection('debts'))?all:all.filter(function(d){return dMine(d,m);});
  var open=list.filter(function(d){return dLeft(d)>0;}),ov=open.filter(dOver);
  var sumL=function(a){return a.reduce(function(t,d){return t+dLeft(d);},0);};
  var tiles;
  if(s==='a')tiles=[['OTEVŘENO CELKEM',usd(sumL(open)),'acc'],['Z KASY PŮJČENO',usd(sumL(open.filter(function(d){return d.kind==='faction';}))),'acc'],['PO SPLATNOSTI',ov.length+' · '+usd(sumL(ov)),ov.length?'red':'green']];
  else tiles=[['DLUŽÍM',usd(sumL(open.filter(function(d){return d.borrowerId===m.id;}))),'acc'],['DLUŽÍ MI',usd(sumL(open.filter(function(d){return d.lenderId===m.id;}))),'green'],['PO SPLATNOSTI',String(ov.length),ov.length?'red':'green']];
  var f=dbtF[s],show=list.filter(function(d){return f==='all'||(f==='open'&&dLeft(d)>0)||(f==='over'&&dOver(d))||(f==='paid'&&dLeft(d)===0);});
  show.sort(function(a,b){
    if(f==='open'||f==='over'){var ao=dOver(a)?0:1,bo=dOver(b)?0:1;if(ao!==bo)return ao-bo;return String(a.due||'9999').localeCompare(String(b.due||'9999'));}
    return 0;
  });
  if(f!=='open'&&f!=='over')show.reverse();
  var chips=[['open','OTEVŘENÉ'],['over','PO SPLATNOSTI'],['paid','SPLACENÉ'],['all','VŠE']].map(function(c){return '<button class="wf'+(f===c[0]?' active':'')+'" onclick="dbtFilter(\''+s+'\',\''+c[0]+'\')">'+c[1]+'</button>';}).join('');
  $('dbtList-'+s).innerHTML='<div class="rx-tiles">'+tiles.map(function(t){return '<div class="inc-sum-card"><div class="inc-sum-title">'+t[0]+'</div><div class="inc-sum-val '+t[2]+'" style="'+(t[2]==='red'?'color:var(--red)':'')+'">'+t[1]+'</div></div>';}).join('')+'</div>'+
    '<div class="wh-filters" style="padding-left:0">'+chips+'</div>'+
    '<div class="rx-grid">'+(show.length?show.map(function(d){return dCard(d,m);}).join(''):'<div class="empty-s" style="grid-column:1/-1">// Žádné záznamy</div>')+'</div>';
}
/* denní připomínka dluhů z kasy (jen faction; dluhy mezi členy se do Discordu samy neposílají) */
function debtDaily(){
  dailyOnce('debtremind',18,function(){
    var lim=ymd(new Date(Date.now()+2*864e5));
    var l=debts().filter(function(d){return d.kind==='faction'&&dLeft(d)>0&&d.due&&d.due<=lim;});
    if(!l.length)return;
    var lines=l.map(function(d){var w=dWho(d);return (dOver(d)?'🔴 ':'🟡 ')+'**'+w.bn+'** — '+usd(dLeft(d))+' · splatnost '+fmtD(d.due)+(dOver(d)?' (po splatnosti)':'');}).join('\n');
    var pings=l.map(function(d){return mention(dWho(d).b);}).filter(Boolean).join(' ');
    addLog('debt','Připomínka dluhů z kasy ('+l.length+').',{extraPing:pings,embed:rich(C_ORANGE,'⏰ DLUHY Z KASY — SPLATNOST',lines,[['📋 Záznamů',String(l.length)],['💵 Celkem zbývá',usd(l.reduce(function(t,d){return t+dLeft(d);},0))]],{by:'Automatická připomínka'})});
  });
}

/* ═══════════════════════════════════════════
   7) NEPŘÁTELÉ A SPOJENCI
   ═══════════════════════════════════════════ */
var FR={war:['⚔ VÁLKA','#c0392b',C_RED],neutral:['◐ NEUTRÁL','#8a8a8a',C_GREY],ally:['🤝 SPOJENEC','#27ae60',C_GREEN]};
var foeF='all',foeQ='',foeEdit=null,openFoe={};
function foes(){var a=DB.get('foes');return Array.isArray(a)?a:[];}
function canFoe(){var m=me();return !!m&&(isVedeni(m.position)||!!m.adminAccess);}
function foeFormHtml(){
  return '<details class="pick-det" id="foeDet" style="margin:1.1rem 1.2rem"><summary>➕ NOVÝ / UPRAVIT ZÁZNAM</summary><div class="form-panel" style="margin:0;border:0"><div class="form-grid">'+
    '<div class="field-group"><label class="fl">NÁZEV / JMÉNO *</label><div class="iw"><span class="ip">&gt;_</span><input type="text" id="fo-name" maxlength="50"/></div></div>'+
    '<div class="field-group"><label class="fl">TYP</label><div class="iw"><span class="ip">&gt;_</span><select id="fo-kind"><option value="gang">Frakce / gang</option><option value="person">Jednotlivec</option></select></div></div>'+
    '<div class="field-group"><label class="fl">VZTAH</label><div class="iw"><span class="ip">&gt;_</span><select id="fo-rel"><option value="war">⚔ Válka</option><option value="neutral" selected>◐ Neutrál</option><option value="ally">🤝 Spojenec</option></select></div></div>'+
    '<div class="field-group"><label class="fl">HROZBA</label><div class="iw"><span class="ip">&gt;_</span><select id="fo-thr"><option value="1">1 – nízká</option><option value="2" selected>2 – střední</option><option value="3">3 – vysoká</option></select></div></div>'+
    '<div class="field-group fg-full"><label class="fl">ČLENOVÉ / VOZIDLA / ZNAKY</label><div class="iw"><span class="ip">&gt;_</span><input type="text" id="fo-ppl" maxlength="200" placeholder="jména, barvy, auta, SPZ…"/></div></div>'+
    '<div class="field-group fg-full"><label class="fl">TERITORIUM / KDE SE VYSKYTUJÍ</label><div class="iw"><span class="ip">&gt;_</span><input type="text" id="fo-area" maxlength="120"/></div></div>'+
    '<div class="field-group fg-full"><label class="fl">POZNÁMKY</label><textarea id="fo-note" class="adm-ta" maxlength="500" style="min-height:70px"></textarea></div></div>'+
    '<div class="fp-ftr"><button class="btn-acc small" id="foSave" onclick="foeSave()">ULOŽIT</button><button class="btn-ghost small" onclick="foeCancel()">ZRUŠIT</button><span id="foSt" class="smsg"></span></div></div></details>';
}
window.foeFilter=function(f){foeF=f;renderFoes();};
window.foeSearch=function(v){foeQ=v;renderFoes();};
window.foeCancel=function(){
  foeEdit=null;['fo-name','fo-ppl','fo-area','fo-note'].forEach(function(i){var e=$(i);if(e)e.value='';});
  if($('fo-kind'))$('fo-kind').value='gang';if($('fo-rel'))$('fo-rel').value='neutral';if($('fo-thr'))$('fo-thr').value='2';
  if($('foSave'))$('foSave').textContent='ULOŽIT';var d=$('foeDet');if(d)d.open=false;
};
window.foeEditOpen=function(id){
  var f=foes().filter(function(x){return x.id===id;})[0];if(!f||!canFoe())return;
  foeEdit=id;$('fo-name').value=f.name;$('fo-kind').value=f.kind||'gang';$('fo-rel').value=f.rel||'neutral';$('fo-thr').value=String(f.thr||2);
  $('fo-ppl').value=f.ppl||'';$('fo-area').value=f.area||'';$('fo-note').value=f.note||'';$('foSave').textContent='ULOŽIT ZMĚNY';
  var d=$('foeDet');if(d){d.open=true;d.scrollIntoView({behavior:'smooth',block:'center'});}
};
window.foeSave=function(){
  var m=me();if(!m||!canFoe())return;
  var name=$('fo-name').value.trim(),st=$('foSt');
  if(!name){st.style.color='var(--red)';st.textContent='// ZADEJ NÁZEV';return;}
  var a=foes(),f=foeEdit?a.filter(function(x){return x.id===foeEdit;})[0]:null,isNew=!f,oldRel=f?f.rel:null;
  if(!f){f={id:uid(),inc:[],created:nowStr(),by:m.displayName};a.push(f);}
  f.name=name;f.kind=$('fo-kind').value;f.rel=$('fo-rel').value;f.thr=parseInt($('fo-thr').value,10)||2;
  f.ppl=$('fo-ppl').value.trim();f.area=$('fo-area').value.trim();f.note=$('fo-note').value.trim();
  DB.set('foes',a);
  var r=FR[f.rel]||FR.neutral;
  if(isNew||oldRel!==f.rel)addLog('foe',m.displayName+(isNew?' přidal ':' změnil vztah u ')+'„'+name+'“: '+r[0]+'.',{embed:rich(r[2],(isNew?'🆕 NOVÝ ZÁZNAM: ':'🔁 ZMĚNA VZTAHU: ')+name,f.note||null,[
    ['Vztah',r[0]],['Typ',f.kind==='person'?'Jednotlivec':'Frakce / gang'],['Hrozba',f.thr+'/3'],['📍 Území',f.area||'—'],['👥 Znaky',f.ppl||'—',false]],{by:m.displayName})});
  else addLog('foe',m.displayName+' upravil záznam „'+name+'“.',{noDiscord:true});
  foeCancel();toast('Záznam uložen','success');renderFoes();
};
window.foeDel=function(id){
  var f=foes().filter(function(x){return x.id===id;})[0];if(!f||!canFoe())return;
  confirmDanger('⚠ SMAZAT ZÁZNAM?',esc(f.name)+'<div class="tsc-sub">Smaže se i historie incidentů.</div>','SMAZAT',function(){
    DB.set('foes',foes().filter(function(x){return x.id!==id;}));
    addLog('foe',me().displayName+' smazal záznam „'+f.name+'“.',{noDiscord:true});toast('Záznam smazán','info');renderFoes();
  });
};
window.foeInc=function(id){
  var m=me(),inp=$('foe-i-'+id),tx=inp?inp.value.trim():'';if(!m||!tx){toast('Napiš, co se stalo','error');return;}
  var a=foes(),f=a.filter(function(x){return x.id===id;})[0];if(!f)return;
  f.inc=f.inc||[];f.inc.push({id:uid(),text:tx.slice(0,300),date:nowStr(),byId:m.id,byName:m.displayName});
  if(f.inc.length>100)f.inc=f.inc.slice(-100);
  DB.set('foes',a);
  var r=FR[f.rel]||FR.neutral;
  if(f.rel==='war')addLog('foe',m.displayName+' nahlásil incident: '+f.name+' — '+tx,{embed:rich(C_RED,'⚔ INCIDENT — '+f.name,tx,[['Vztah',r[0]],['Hrozba',(f.thr||2)+'/3']],{by:m.displayName})});
  else addLog('foe',m.displayName+' nahlásil incident: '+f.name+' — '+tx,{noDiscord:true});
  toast('Incident zapsán','success');openFoe[id]=true;renderFoes();
};
window.foeIncDel=function(id,iid){
  var m=me(),a=foes(),f=a.filter(function(x){return x.id===id;})[0];if(!f||!m)return;
  var i=(f.inc||[]).filter(function(x){return x.id===iid;})[0];if(!i||!(canFoe()||i.byId===m.id))return;
  f.inc=f.inc.filter(function(x){return x.id!==iid;});DB.set('foes',a);openFoe[id]=true;renderFoes();
};
document.addEventListener('toggle',function(e){var d=e.target;if(d&&d.classList&&d.classList.contains('foe-inc'))openFoe[d.getAttribute('data-f')]=d.open;},true);
function foeCard(f,m){
  var r=FR[f.rel]||FR.neutral,inc=(f.inc||[]).slice().reverse(),thr=f.thr||2,edit=canFoe();
  return '<div class="foe-card" style="border-left-color:'+r[1]+'"><div class="foe-top"><div><div class="foe-n">'+esc(f.name)+'</div><div class="foe-k">'+(f.kind==='person'?'JEDNOTLIVEC':'FRAKCE / GANG')+'</div></div>'+
    '<span class="foe-rel" style="color:'+r[1]+';border-color:'+r[1]+'">'+r[0]+'</span></div>'+
    '<div class="foe-thr" title="Hrozba '+thr+'/3">HROZBA '+[1,2,3].map(function(i){return '<i'+(i<=thr?' class="on" style="background:'+r[1]+'"':'')+'></i>';}).join('')+'</div>'+
    (f.area?'<div class="foe-l">📍 '+esc(f.area)+'</div>':'')+(f.ppl?'<div class="foe-l">👥 '+esc(f.ppl)+'</div>':'')+(f.note?'<div class="foe-note">'+esc(f.note)+'</div>':'')+
    '<details class="foe-inc" data-f="'+f.id+'"'+(openFoe[f.id]?' open':'')+'><summary>📜 INCIDENTY ('+inc.length+')</summary>'+
    inc.slice(0,10).map(function(i){return '<div class="foe-i"><div>'+esc(i.text)+'</div><small>'+esc(i.byName||'?')+' · '+esc(i.date||'')+((edit||i.byId===m.id)?' <button class="btn-micro del" onclick="foeIncDel(\''+f.id+'\',\''+i.id+'\')">✕</button>':'')+'</small></div>';}).join('')+
    '<div class="pl-add"><input type="text" id="foe-i-'+f.id+'" class="rx-in" maxlength="300" placeholder="Co se stalo? (kdo, kde, kdy)" onkeydown="if(event.key===\'Enter\')foeInc(\''+f.id+'\')"/><button class="btn-micro" onclick="foeInc(\''+f.id+'\')">+ INCIDENT</button></div></details>'+
    (edit?'<div class="dbt-act"><button class="btn-micro" onclick="foeEditOpen(\''+f.id+'\')">✎ UPRAVIT</button><button class="btn-micro del" onclick="foeDel(\''+f.id+'\')">✕ SMAZAT</button></div>':'')+'<div class="foe-by">// zapsal '+esc(f.by||'?')+' — '+esc(f.created||'')+'</div></div>';
}
function renderFoes(){
  var root=$('foesRoot'),m=me();if(!root||!m)return;
  var edit=canFoe();
  if(!root.dataset.built||root.dataset.edit!==(edit?'1':'0')){
    root.dataset.built='1';root.dataset.edit=edit?'1':'0';
    root.innerHTML=(edit?foeFormHtml():'<div class="rx-hint" style="margin:1.1rem 1.2rem 0">Záznamy přidává vedení. Incident může nahlásit kterýkoli člen.</div>')+
      '<div id="foeChips" class="wh-filters"></div><div class="wh-tools"><input type="text" class="wh-search" id="foeQ" placeholder="🔍 Hledat (název, znaky, území, incidenty)…" oninput="foeSearch(this.value)"/></div><div id="foeList" class="rx-grid" style="margin:.8rem 1.1rem"></div>';
  }
  var all=foes(),cnt=function(r){return all.filter(function(f){return f.rel===r;}).length;};
  $('foeChips').innerHTML=[['all','VŠE ('+all.length+')'],['war','⚔ VÁLKA ('+cnt('war')+')'],['neutral','◐ NEUTRÁL ('+cnt('neutral')+')'],['ally','🤝 SPOJENCI ('+cnt('ally')+')']].map(function(c){
    return '<button class="wf'+(foeF===c[0]?' active':'')+'" onclick="foeFilter(\''+c[0]+'\')">'+c[1]+'</button>';}).join('');
  var q=normS(foeQ.trim()),ord={war:0,neutral:1,ally:2};
  var list=all.filter(function(f){
    if(foeF!=='all'&&f.rel!==foeF)return false;
    if(!q)return true;
    return normS([f.name,f.ppl,f.area,f.note].concat((f.inc||[]).map(function(i){return i.text;})).join(' ')).indexOf(q)!==-1;
  }).sort(function(a,b){return (ord[a.rel]-ord[b.rel])||(b.thr||0)-(a.thr||0)||String(a.name).localeCompare(String(b.name),'cs');});
  $('foeList').innerHTML=list.length?list.map(function(f){return foeCard(f,m);}).join(''):'<div class="empty-s" style="grid-column:1/-1">// Žádné záznamy</div>';
}

/* ═══════════════════════════════════════════
   9) ŠABLONY ÚKOLŮ A HLÁŠENÍ
   ═══════════════════════════════════════════ */
var TDAYS=['neděle','pondělí','úterý','středa','čtvrtek','pátek','sobota'];
var tplEdit=null,rpEdit=null;
function tpls(){var a=DB.get('tasktpl');return Array.isArray(a)?a:[];}
function rtpls(){var a=DB.get('reptpl');return Array.isArray(a)?a:[];}
function canTpl(){return canSection('templates');}
function assignFromTpl(t,auto){
  var targets=(!t.target||t.target==='all')?players():[memById(t.target)].filter(Boolean);
  var tasks=DB.get('tasks')||{},n=0,names=[];
  targets.forEach(function(x){
    var arr=tasks[x.id]=tasks[x.id]||[];
    if(arr.some(function(k){return !k.done&&k.title===t.title;}))return;
    arr.push({id:uid(),title:t.title,desc:t.desc||'',priority:t.priority||'normal',date:nowStr(),done:false});n++;names.push(x.displayName);
  });
  if(!n)return 0;
  DB.set('tasks',tasks);
  var pr={low:['LOW',C_GREY],normal:['NORMAL',C_GREEN],high:['HIGH',C_ORANGE],urgent:['URGENT',C_RED]}[t.priority]||['NORMAL',C_GREEN];
  var who=(!t.target||t.target==='all')?'Všichni členové ('+n+')':names.join(', ');
  var m=me();
  addLog('task',(auto?'Automaticky':(m?m.displayName:'Admin'))+' zadal úkol ze šablony "'+t.name+'": "'+t.title+'" ('+n+' členů).',{
    extraPing:t.ping?memberPing():'',
    embed:rich(pr[1],'✅ NOVÝ ÚKOL'+(auto?' (opakovaný)':' (šablona)'),'**'+t.title+'**'+(t.desc?'\n'+t.desc:''),[['👥 Komu',who],['⚡ Priorita',pr[0]]],{by:auto?'Automatika':(m?m.displayName:'Admin')})});
  return n;
}
function tplFormHtml(){
  var hrs='';for(var h=0;h<24;h++)hrs+='<option value="'+h+'">'+(h<10?'0':'')+h+':00</option>';
  return '<div class="form-panel" style="margin:1.1rem 1.2rem"><div class="fp-title" id="tpTitle">// NOVÁ ŠABLONA ÚKOLU</div><div class="form-grid">'+
    '<div class="field-group"><label class="fl">NÁZEV ŠABLONY *</label><div class="iw"><span class="ip">&gt;_</span><input type="text" id="tp-name" maxlength="40" placeholder="např. Týdenní sběr"/></div></div>'+
    '<div class="field-group"><label class="fl">PRIORITA</label><div class="iw"><span class="ip">&gt;_</span><select id="tp-prio"><option value="low">LOW</option><option value="normal" selected>NORMAL</option><option value="high">HIGH</option><option value="urgent">URGENT</option></select></div></div>'+
    '<div class="field-group fg-full"><label class="fl">NÁZEV ÚKOLU *</label><div class="iw"><span class="ip">&gt;_</span><input type="text" id="tp-title" maxlength="80"/></div></div>'+
    '<div class="field-group fg-full"><label class="fl">BRIEFING</label><textarea id="tp-desc" class="adm-ta" maxlength="600"></textarea></div>'+
    '<div class="field-group"><label class="fl">KOMU</label><div class="iw"><span class="ip">&gt;_</span><select id="tp-target"></select></div></div>'+
    '<div class="field-group"><label class="fl">DISCORD</label><div class="iw" style="padding:.4rem .8rem"><label class="ping-chk"><input type="checkbox" id="tp-ping"/><span>🔔 Označit Member při zadání</span></label></div></div>'+
    '<div class="field-group"><label class="fl">OPAKOVÁNÍ</label><div class="iw" style="padding:.4rem .8rem"><label class="ping-chk"><input type="checkbox" id="tp-rep"/><span>Zadávat automaticky každý týden</span></label></div></div>'+
    '<div class="field-group"><label class="fl">DEN A HODINA</label><div class="rx-two"><div class="iw"><select id="tp-day">'+TDAYS.map(function(d,i){return '<option value="'+i+'">'+d+'</option>';}).join('')+'</select></div><div class="iw"><select id="tp-hour">'+hrs+'</select></div></div></div></div>'+
    '<div class="rx-hint">Úkol se nezadá členovi, který už má úkol se stejným názvem otevřený. Automatika se spustí, když je v daný čas někdo přihlášený.</div>'+
    '<div class="fp-ftr"><button class="btn-acc small" id="tpSave" onclick="tplSave()">ULOŽIT ŠABLONU</button><button class="btn-ghost small" onclick="tplCancel()">ZRUŠIT</button><span id="tpSt" class="smsg"></span></div></div>'+
    '<div class="sh">// ŠABLONY ÚKOLŮ</div><div id="tplList" class="stream"></div>'+
    '<div class="form-panel" style="margin:1.1rem 1.2rem"><div class="fp-title" id="rpTitle">// ŠABLONA HLÁŠENÍ (člen ji vloží v záložce Hlášení)</div><div class="form-grid">'+
    '<div class="field-group fg-full"><label class="fl">NÁZEV *</label><div class="iw"><span class="ip">&gt;_</span><input type="text" id="rp-name" maxlength="40" placeholder="např. Hlášení po akci"/></div></div>'+
    '<div class="field-group fg-full"><label class="fl">TEXT *</label><textarea id="rp-text" class="adm-ta" maxlength="1200" placeholder="Co se dělalo:\nCo se povedlo:\nCo se nepovedlo:"></textarea></div></div>'+
    '<div class="fp-ftr"><button class="btn-acc small" onclick="rpSave()">ULOŽIT</button><button class="btn-ghost small" onclick="rpCancel()">ZRUŠIT</button><span id="rpSt" class="smsg"></span></div></div>'+
    '<div class="sh">// ŠABLONY HLÁŠENÍ</div><div id="rpList" class="stream"></div>';
}
function renderTpl(){
  var root=$('templatesRoot');if(!root||!me())return;
  if(!root.dataset.built){root.dataset.built='1';root.innerHTML=tplFormHtml();}
  var sel=$('tp-target');
  if(sel&&document.activeElement!==sel){
    var cur=sel.value,h='<option value="all">— všichni členové —</option>'+players().map(function(x){return '<option value="'+esc(x.id)+'">'+esc(x.displayName)+'</option>';}).join('');
    if(sel.dataset.h!==h){sel.dataset.h=h;sel.innerHTML=h;sel.value=cur||'all';}
  }
  var L=tpls();
  $('tplList').innerHTML=L.length?L.map(function(t){
    var tg=(!t.target||t.target==='all')?'všichni':(memById(t.target)?memById(t.target).displayName:'(smazaný člen)');
    return '<div class="task-card '+(t.priority||'normal')+'"><div class="task-top"><span class="task-name">'+esc(t.name)+'</span><span class="pchip '+(t.priority||'normal')+'">'+(PRIO[t.priority]||'NORMAL')+'</span></div>'+
      '<div class="task-desc"><b>'+esc(t.title)+'</b>'+(t.desc?'<br>'+esc(t.desc):'')+'</div>'+
      '<div class="task-meta"><span class="task-date">Komu: '+esc(tg)+(t.repeat&&t.repeat.on?' · 🔁 každý týden: '+TDAYS[t.repeat.day]+' v '+(t.repeat.hour<10?'0':'')+t.repeat.hour+':00'+(t.last?' (naposledy '+esc(fmtD(t.last))+')':''):' · bez opakování')+'</span>'+
      '<div class="task-resolve"><button class="btn-acc small" onclick="tplRun(\''+t.id+'\')">▶ ZADAT TEĎ</button><button class="btn-micro" onclick="tplEditOpen(\''+t.id+'\')">✎</button><button class="btn-micro del" onclick="tplDel(\''+t.id+'\')">✕</button></div></div></div>';
  }).join(''):'<div class="empty-s">// Zatím žádné šablony úkolů</div>';
  var R=rtpls();
  $('rpList').innerHTML=R.length?R.map(function(r){
    return '<div class="rep-card"><div class="rep-from">// '+esc(r.name)+'<span style="float:right"><button class="btn-micro" onclick="rpEditOpen(\''+r.id+'\')">✎</button> <button class="btn-micro del" onclick="rpDel(\''+r.id+'\')">✕</button></span></div><div class="rep-body">'+esc(r.text)+'</div></div>';
  }).join(''):'<div class="empty-s">// Zatím žádné šablony hlášení</div>';
}
window.tplCancel=function(){
  tplEdit=null;['tp-name','tp-title','tp-desc'].forEach(function(i){$(i).value='';});
  $('tp-prio').value='normal';$('tp-target').value='all';$('tp-ping').checked=false;$('tp-rep').checked=false;$('tp-day').value='0';$('tp-hour').value='18';
  $('tpSave').textContent='ULOŽIT ŠABLONU';$('tpTitle').textContent='// NOVÁ ŠABLONA ÚKOLU';
};
window.tplEditOpen=function(id){
  var t=tpls().filter(function(x){return x.id===id;})[0];if(!t)return;tplEdit=id;
  $('tp-name').value=t.name;$('tp-title').value=t.title;$('tp-desc').value=t.desc||'';$('tp-prio').value=t.priority||'normal';
  $('tp-target').value=t.target||'all';$('tp-ping').checked=!!t.ping;$('tp-rep').checked=!!(t.repeat&&t.repeat.on);
  $('tp-day').value=String(t.repeat?t.repeat.day:0);$('tp-hour').value=String(t.repeat?t.repeat.hour:18);
  $('tpSave').textContent='ULOŽIT ZMĚNY';$('tpTitle').textContent='// UPRAVIT ŠABLONU';$('tp-name').scrollIntoView({behavior:'smooth',block:'center'});
};
window.tplSave=function(){
  if(!canTpl())return;var st=$('tpSt');
  var name=$('tp-name').value.trim(),title=$('tp-title').value.trim();
  if(!name||!title){st.style.color='var(--red)';st.textContent='// VYPLŇ NÁZEV ŠABLONY A ÚKOLU';return;}
  var a=tpls(),t=tplEdit?a.filter(function(x){return x.id===tplEdit;})[0]:null;
  if(!t){t={id:uid(),last:''};a.push(t);}
  t.name=name;t.title=title;t.desc=$('tp-desc').value.trim();t.priority=$('tp-prio').value;t.target=$('tp-target').value;t.ping=$('tp-ping').checked;
  t.repeat={on:$('tp-rep').checked,day:parseInt($('tp-day').value,10)||0,hour:parseInt($('tp-hour').value,10)||0};
  DB.set('tasktpl',a);addLog('tpl',me().displayName+' uložil šablonu úkolu "'+name+'".',{noDiscord:true});
  tplCancel();st.style.color='';st.textContent='// ULOŽENO';setTimeout(function(){st.textContent='';},2000);toast('Šablona uložena','success');renderTpl();
};
window.tplRun=function(id){
  if(!canTpl())return;var t=tpls().filter(function(x){return x.id===id;})[0];if(!t)return;
  var n=assignFromTpl(t,false);
  toast(n?'Úkol zadán ('+n+' členů)':'Nikomu nebyl zadán — stejný úkol už mají otevřený',n?'success':'info',3500);
};
window.tplDel=function(id){
  var t=tpls().filter(function(x){return x.id===id;})[0];if(!t||!canTpl())return;
  confirmDanger('⚠ SMAZAT ŠABLONU?',esc(t.name),'SMAZAT',function(){DB.set('tasktpl',tpls().filter(function(x){return x.id!==id;}));toast('Šablona smazána','info');renderTpl();});
};
window.rpCancel=function(){rpEdit=null;$('rp-name').value='';$('rp-text').value='';$('rpTitle').textContent='// ŠABLONA HLÁŠENÍ (člen ji vloží v záložce Hlášení)';};
window.rpEditOpen=function(id){var r=rtpls().filter(function(x){return x.id===id;})[0];if(!r)return;rpEdit=id;$('rp-name').value=r.name;$('rp-text').value=r.text;$('rpTitle').textContent='// UPRAVIT ŠABLONU HLÁŠENÍ';$('rp-name').scrollIntoView({behavior:'smooth',block:'center'});};
window.rpSave=function(){
  if(!canTpl())return;var name=$('rp-name').value.trim(),text=$('rp-text').value.trim(),st=$('rpSt');
  if(!name||!text){st.style.color='var(--red)';st.textContent='// VYPLŇ NÁZEV I TEXT';return;}
  var a=rtpls(),r=rpEdit?a.filter(function(x){return x.id===rpEdit;})[0]:null;
  if(!r){r={id:uid()};a.push(r);}r.name=name;r.text=text;DB.set('reptpl',a);
  rpCancel();st.style.color='';st.textContent='// ULOŽENO';setTimeout(function(){st.textContent='';},2000);toast('Šablona hlášení uložena','success');renderTpl();
};
window.rpDel=function(id){
  var r=rtpls().filter(function(x){return x.id===id;})[0];if(!r||!canTpl())return;
  confirmDanger('⚠ SMAZAT ŠABLONU?',esc(r.name),'SMAZAT',function(){DB.set('reptpl',rtpls().filter(function(x){return x.id!==id;}));toast('Šablona smazána','info');renderTpl();});
};
/* výběr šablony v záložce Hlášení */
function repTplInit(){
  var ta=$('reportText');if(!ta)return;var fg=ta.closest('.field-group');if(!fg)return;
  var list=rtpls(),w=$('repTplWrap'),key=list.map(function(x){return x.id+x.name;}).join('|');
  if(!w){w=document.createElement('div');w.id='repTplWrap';w.className='rx-tpl-row';fg.insertBefore(w,ta);}
  if(w.dataset.k===key)return;w.dataset.k=key;
  if(!list.length){w.innerHTML='';return;}
  w.innerHTML='<select id="repTplSel" class="rx-sel"><option value="">📄 Vložit šablonu hlášení…</option>'+list.map(function(r){return '<option value="'+esc(r.id)+'">'+esc(r.name)+'</option>';}).join('')+'</select>';
  $('repTplSel').onchange=function(){
    var r=rtpls().filter(function(x){return x.id===this.value;}.bind(this))[0];
    if(r){ta.value=ta.value.trim()?ta.value.replace(/\s+$/,'')+'\n\n'+r.text:r.text;ta.focus();}
    this.value='';
  };
}
/* automatické zadávání opakovaných úkolů */
async function tplTick(){
  if(busy.tpl||!ready())return;
  var now=new Date(),t0=ymd(now);
  function due(t){return t.repeat&&t.repeat.on&&now.getDay()===t.repeat.day&&now.getHours()>=t.repeat.hour&&t.last!==t0;}
  if(!tpls().some(due))return;
  busy.tpl=1;
  try{
    var r=await sb.from(TABLE).select('value').eq('key','tasktpl').maybeSingle();
    var fresh=(r.data&&Array.isArray(r.data.value))?r.data.value:tpls(),run=[];
    fresh.forEach(function(t){if(due(t)){t.last=t0;run.push(t);}});
    if(run.length){DB.set('tasktpl',fresh);await DB.flush();run.forEach(function(t){assignFromTpl(t,true);});}
    else DB.cache.tasktpl=fresh;
  }catch(e){console.error('tplTick',e);}
  busy.tpl=0;
}

/* ═══════════════════════════════════════════
   VLOŽENÍ ZÁLOŽEK A NAPOJENÍ
   ═══════════════════════════════════════════ */
function mkBtn(scope,key,ic,label){
  var b=document.createElement('button');b.className='nb';b.setAttribute('onclick',(scope==='a'?'aTab':'mTab')+"('"+key+"',this)");
  b.innerHTML='<span class="ni">'+ic+'</span><span class="nl">'+label+'</span>';return b;
}
function put(nav,btn,afterKey,scope){
  var after=nav.querySelector('.nb[onclick*="\''+afterKey+'\'"]');
  if(after)after.insertAdjacentElement('afterend',btn);else nav.appendChild(btn);
}
(function inject(){
  var mn=document.querySelector('#memberScreen .sb-nav'),mm=document.querySelector('#memberScreen .main'),
      an=document.querySelector('#adminScreen .sb-nav'),am=document.querySelector('#adminScreen .main');
  if(!mn||!mm||!an||!am||$('mt-debts'))return;
  put(mn,mkBtn('m','debts','💸','DLUHY'),'finance','m');
  put(mn,mkBtn('m','foes','⚔️','NEPŘÁTELÉ'),'roster','m');
  put(an,mkBtn('a','debts','💸','DLUHY'),'finance','a');
  put(an,mkBtn('a','templates','📋','ŠABLONY'),'tasks','a');
  mm.insertAdjacentHTML('beforeend',
    '<div id="mt-debts" class="mt"><div class="ph"><div class="pt">💸 // DLUHY A PŮJČKY</div></div><div id="debtsM" class="rx-wrap"></div></div>'+
    '<div id="mt-foes" class="mt"><div class="ph"><div class="pt">⚔️ // NEPŘÁTELÉ A SPOJENCI</div></div><div id="foesRoot"></div></div>');
  am.insertAdjacentHTML('beforeend',
    '<div id="at-debts" class="at"><div class="ph"><div class="pt">💸 // DLUHY A PŮJČKY — PŘEHLED</div></div><div id="debtsA" class="rx-wrap"></div></div>'+
    '<div id="at-templates" class="at"><div class="ph"><div class="pt">📋 // ŠABLONY ÚKOLŮ A HLÁŠENÍ</div></div><div id="templatesRoot"></div></div>');
})();
A_RENDER.debts=function(){renderDebts('a');};A_RENDER.templates=renderTpl;
M_RENDER.debts=function(){renderDebts('m');};M_RENDER.foes=renderFoes;

var _mt=window.mTab;
window.mTab=function(tab){
  var r=_mt.apply(this,arguments);
  if(tab==='debts')renderDebts('m');else if(tab==='foes')renderFoes();else if(tab==='report')repTplInit();
  return r;
};
var _at=window.aTab;
window.aTab=function(tab,btn){
  if(!canSection(tab)){
    toast('K téhle sekci nemáš oprávnění','error');
    var first=document.querySelector('#adminScreen .sb-nav > .nb:not(.perm-hide)');
    if(first&&menuKey(first)!==tab)first.click();
    return;
  }
  var r=_at.apply(this,arguments);
  if(tab==='debts')renderDebts('a');else if(tab==='templates')renderTpl();
  return r;
};
var _rs=window.renderSettings;
window.renderSettings=function(){var r=_rs.apply(this,arguments);try{renderPermPanel();}catch(e){console.error(e);}return r;};
var _rsr=window.renderSentReports;
if(typeof _rsr==='function')window.renderSentReports=function(){var r=_rsr.apply(this,arguments);try{repTplInit();}catch(e){}return r;};

/* odznak „po splatnosti“ u Dluhů (člen jako dlužník) */
function debtBadge(){
  var m=me();if(!m)return;
  var btn=document.querySelector('#memberScreen .nb[onclick*="\'debts\'"]');if(!btn)return;
  var n=debts().filter(function(d){return d.borrowerId===m.id&&dOver(d);}).length;
  var b=btn.querySelector('.nbadge');
  if(!b){b=document.createElement('span');b.className='nbadge red';btn.appendChild(b);}
  b.textContent=n>9?'9+':String(n);b.classList.toggle('visible',n>0);
}

setInterval(function(){
  if(!me())return;
  try{applyPerms();debtBadge();repTplInit();}catch(e){}
},800);
setInterval(function(){try{debtDaily();tplTick();}catch(e){console.error(e);}},60000);
setTimeout(function(){try{debtDaily();tplTick();}catch(e){}},12000);
})();
