// ── VYLEPŠENÍ: přehled neplatičů + připomínka, docházka na akcích, kalkulačka lootu, profil člena ──
(function(){
  // ───────── společné pomůcky ─────────
  function wkKey(d){var yr=d.getFullYear(),st=new Date(yr,0,1);return yr+'-W'+Math.ceil(((d-st)/86400000+st.getDay()+1)/7);}
  function weeksList(n){var out=[],seen={};for(var i=0;out.length<n&&i<n*2;i++){var d=new Date();d.setDate(d.getDate()-7*i);var k=wkKey(d);if(!seen[k]){seen[k]=1;out.push({key:k,date:d});}}return out;}
  function fin(){var f=DB.get('finance')||{payments:[],expenses:[]};f.payments=f.payments||[];return f;}
  function fee(){return Number((DB.get('finsettings')||{}).weeklyFee)||5000;}
  function isPaid(f,mid,wk){return f.payments.some(function(p){return p.memberId===mid&&p.weekKey===wk&&(p.expenseId==='weekly'||!p.expenseId);});}
  function members(){return DB.get('members')||[];}
  function memById(id){return members().filter(function(m){return m.id===id;})[0]||null;}
  function joinIdx(m,ws){if(!m.joined)return -1;var d=new Date(m.joined+'T12:00:00');if(isNaN(d))return -1;var k=wkKey(d);for(var i=0;i<ws.length;i++)if(ws[i].key===k)return i;return -1;}
  // člen platí za týden, jen pokud už byl ve frakci (podle data vstupu, je-li známé)
  function liable(m,idx,ws){var j=joinIdx(m,ws);return j===-1||idx<=j;}
  function mention(m){var id=String(m.discordId||'').replace(/\D/g,'');return id?'<@'+id+'>':'';}
  var DAYS=['neděli','pondělí','úterý','středu','čtvrtek','pátek','sobotu'];

  // ═════════ 1) PŘEHLED NEPLATIČŮ + PŘIPOMÍNKA ═════════
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
    return members().filter(function(m){return liable(m,idx,ws)&&!isPaid(f,m.id,wk);});
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
    var wk=ws[upSel].key,f=fin(),all=members(),list=unpaidFor(wk,ws),amt=fee(),cfg=remCfg();
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

  // ═════════ 2) DOCHÁZKA NA AKCÍCH ═════════
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
    var rows=members().map(function(m){return {m:m,s:attStats(m.id)};}).sort(function(a,b){
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

  // ═════════ 3) KALKULAČKA LOOTU ═════════
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
  // ── pravidla lootu: podíl frakce mění jen Mastermind, report jde odeslat až po vyplnění lootu ──
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
    if(lc&&me&&arr.length>n0){ // k novému reportu přidá přesnou částku a podíl frakce (pro statistiky a týdenní souhrn)
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

  // vstupní body: karty členů (admin), Crew List, vlastní profil v panelu
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
    var ms=members().slice().sort(function(a,b){var d=POSITIONS.indexOf(a.position)-POSITIONS.indexOf(b.position);return d!==0?d:String(a.displayName).localeCompare(String(b.displayName),'cs');});
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

  // ═════════ 5) POCHVALY ═════════
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

  // ═════════ 6) TÝDENNÍ SOUHRN NA DISCORD ═════════
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

  // nastavení (Admin → Nastavení)
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

  // ═════════ 7) ZÁLOŽKA POCHVALY (menu) ═════════
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
})();
