/* ══════════════════════════════════════════════════════════════════
   VYLEPŠENÍ 3 — načíst až PO tsc.js (nezávislý soubor, nic v tsc.js nemění)
   1) Kalendář 2.0 (štítky akcí, Měsíc / Týden / Agenda)
   2) Grafy ve Financích + sparkline ve Statistikách
   3) Avatary členů
   4) Živý přehled aktivity na Oznámeních
   5) Odznaky a žebříčky
   6) Lightbox s galerií (šipky, swipe, zoom)
   7) Plynulé přechody (skeletony, počítání čísel, kroužky, SVG ikony menu)
   Smazáním řádku <script> v index.html se vše vrátí.
   ══════════════════════════════════════════════════════════════════ */
(function(){
'use strict';

function $(id){return document.getElementById(id);}
function num(v){var n=parseFloat(String(v==null?'':v).replace(/\s/g,'').replace(',','.'));return isNaN(n)?0:n;}
function r2(n){return Math.round(n*100)/100;}
/* čtení přímo z cache (bez klonování) — jen pro čtení, nikdy do ní nezapisovat */
function C(k){var v=DB.cache[k];return v==null?null:v;}
function ready(){
  return typeof getMember==='function'&&typeof DB!=='undefined'&&!!DB.cache&&
    DB.cache.members!==undefined&&!!currentMemberId&&!!getMember();
}
function mems(){return C('members')||[];}
function memById(id){var l=mems();for(var i=0;i<l.length;i++)if(l[i].id===id)return l[i];return null;}
function memByName(n){var l=mems();for(var i=0;i<l.length;i++)if(l[i].displayName===n)return l[i];return null;}
var reduce=!!(window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches);
function accHex(){return (getComputedStyle(document.documentElement).getPropertyValue('--acc')||'#c49a14').trim();}
function shortDate(t){var d=new Date(t);return d.getDate()+'. '+(d.getMonth()+1)+'.';}

/* ════════════════════════════════════════════
   1) KALENDÁŘ 2.0
   ════════════════════════════════════════════ */
var calView=lsGet('tsc_cal_view');
if(['month','week','agenda'].indexOf(calView)===-1)calView='month';
var calWk=null;

function monday(d){
  var x=new Date(d.getFullYear(),d.getMonth(),d.getDate());
  x.setDate(x.getDate()-((x.getDay()+6)%7));return x;
}
function eventsByDay(){
  var by={};
  (C('events')||[]).forEach(function(e){
    var d=evStart(e);if(!d)return;
    var k=ymd(d);(by[k]=by[k]||[]).push(e);
  });
  Object.keys(by).forEach(function(k){by[k].sort(function(a,b){return evStart(a)-evStart(b);});});
  return by;
}
function calChip(e,withTime){
  var t=EV_TYPES[e.type]||EV_TYPES.other,d=evStart(e);
  return '<span class="cal-ch" style="--c:'+t[1]+'" title="'+esc(e.title)+'">'+
    (withTime?'<i>'+pad2(d.getHours())+':'+pad2(d.getMinutes())+'</i>':'')+esc(e.title)+'</span>';
}
function calTabs(scope){
  return '<div class="cal-views" role="tablist">'+[['month','Měsíc'],['week','Týden'],['agenda','Agenda']].map(function(v){
    return '<button type="button" role="tab" aria-selected="'+(calView===v[0])+'" class="'+(calView===v[0]?'on':'')+'" onclick="calSetView(\''+v[0]+'\',\''+scope+'\')">'+v[1]+'</button>';
  }).join('')+'</div>';
}
function calEnhance(scope){
  var host=$('calBody'+(scope==='a'?'A':'M'));if(!host)return;
  var wrap=host.querySelector('.cal-grid-wrap'),layout=host.querySelector('.cal-layout');
  if(!wrap||!layout)return;
  layout.classList.toggle('is-agenda',calView==='agenda');
  wrap.classList.remove('v-month','v-week','v-agenda');wrap.classList.add('v-'+calView);
  var by=eventsByDay(),legend=wrap.querySelector('.cal-legend'),legHtml=legend?legend.outerHTML:'';

  if(calView==='month'){
    var head=wrap.querySelector('.cal-head');
    if(head&&!wrap.querySelector('.cal-views'))head.insertAdjacentHTML('beforebegin',calTabs(scope));
    Array.prototype.forEach.call(wrap.querySelectorAll('.cal-d:not(.empty)'),function(c){
      if(c.querySelector('.cal-chs'))return;
      var m=/calPick\('([^']+)'/.exec(c.getAttribute('onclick')||'');if(!m)return;
      var l=by[m[1]];if(!l||!l.length)return;
      var h='<span class="cal-chs">'+l.slice(0,2).map(function(e){return calChip(e,false);}).join('')+
        (l.length>2?'<span class="cal-more">+'+(l.length-2)+' další</span>':'')+'</span>';
      var dots=c.querySelector('.cal-dots');
      if(dots)dots.insertAdjacentHTML('beforebegin',h);else c.insertAdjacentHTML('beforeend',h);
    });
    return;
  }

  if(calView==='week'){
    if(!calWk)calWk=monday(calSel?new Date(calSel+'T12:00:00'):new Date());
    var days=[],i,d;
    for(i=0;i<7;i++){d=new Date(calWk);d.setDate(calWk.getDate()+i);days.push(d);}
    var a=days[0],b=days[6],todayK=ymd(new Date());
    var label=a.getDate()+'. '+(a.getMonth()+1)+'. – '+b.getDate()+'. '+(b.getMonth()+1)+'. '+b.getFullYear();
    wrap.innerHTML=calTabs(scope)+
      '<div class="cal-head"><button class="btn-micro" onclick="calWeekNav(-1,\''+scope+'\')" aria-label="Předchozí týden">‹</button>'+
      '<span class="cal-mt">'+label+'</span>'+
      '<button class="btn-micro" onclick="calWeekNav(1,\''+scope+'\')" aria-label="Další týden">›</button>'+
      '<button class="btn-micro" onclick="calWeekToday(\''+scope+'\')">DNES</button></div>'+
      '<div class="cw">'+days.map(function(x){
        var k=ymd(x),l=by[k]||[];
        return '<div class="cw-day'+(k===todayK?' today':'')+(k===calSel?' sel':'')+'" onclick="calPick(\''+k+'\',\''+scope+'\')">'+
          '<div class="cw-d">'+DAYS_CZ[x.getDay()]+'<b>'+x.getDate()+'</b></div>'+
          '<div class="cw-evs">'+(l.length?l.map(function(e){return calChip(e,true);}).join(''):'<span class="cw-none">volno</span>')+'</div></div>';
      }).join('')+'</div>'+legHtml;
    return;
  }

  /* agenda */
  var now=Date.now(),next=(C('events')||[]).map(function(e){return {e:e,d:evStart(e)};})
    .filter(function(x){return x.d&&x.d.getTime()>=now-2*3600000;}).sort(function(p,q){return p.d-q.d;})[0];
  wrap.innerHTML=calTabs(scope)+
    (next?'<div class="cal-next"><small>NEJBLIŽŠÍ AKCE</small><b>'+esc(next.e.title)+'</b><span>'+esc(fmtEv(next.d))+' · '+esc(untilStr(next.d))+'</span></div>'
         :'<div class="cal-next"><small>NEJBLIŽŠÍ AKCE</small><span>Zatím nic naplánovaného.</span></div>')+legHtml;
}
window.calSetView=function(v,scope){
  if(['month','week','agenda'].indexOf(v)===-1)return;
  if(v==='week'){
    var n=new Date(),base=calSel?new Date(calSel+'T12:00:00'):
      ((calMonth&&(calMonth.getMonth()!==n.getMonth()||calMonth.getFullYear()!==n.getFullYear()))?new Date(calMonth):n);
    calWk=monday(base);
  }
  calView=v;lsSet('tsc_cal_view',v);
  renderCalendar(scope);
};
window.calWeekNav=function(dir,scope){
  if(!calWk)calWk=monday(new Date());
  calWk=new Date(calWk.getFullYear(),calWk.getMonth(),calWk.getDate()+7*dir);
  calSel=null;renderCalendar(scope);
};
window.calWeekToday=function(scope){calWk=monday(new Date());calSel=null;renderCalendar(scope);};

var _rcal=window.renderCalendar;
if(typeof _rcal==='function')window.renderCalendar=function(scope){
  if(calView==='agenda')calSel=null;
  var r=_rcal.apply(this,arguments);
  try{calEnhance(scope);}catch(e){console.error('cal3',e);}
  return r;
};

/* ════════════════════════════════════════════
   2) GRAFY VE FINANCÍCH + SPARKLINE
   ════════════════════════════════════════════ */
var gid=0;
var PAL=['var(--acc)','#4a90d9','#27ae60','#e056fd','#e67e22','#8a8a8a'];

function pesoSeries(){
  var b=C('acctbase'),base=(b&&typeof b.P==='number')?b.P:0,bal=base,pts=[];
  var logs=(Array.isArray(C('acctlog'))?C('acctlog'):[]).filter(function(x){return x.cur==='P';})
    .slice().sort(function(a,c){return (a.ts||0)-(c.ts||0);});
  if(!logs.length)return [];
  pts.push({t:(logs[0].ts||Date.now())-3600000,v:r2(base)});
  logs.forEach(function(x){bal+=(x.type==='out'?-1:1)*num(x.amount);pts.push({t:x.ts||0,v:r2(bal)});});
  return pts.slice(-41);
}
function lineChart(pts){
  if(pts.length<3)return '<div class="f3-empty">Graf se zobrazí po prvním zápisu.</div>';
  var W=320,H=140,L=36,R=8,T=12,B=20,id='cg'+(++gid);
  var t0=pts[0].t,t1=pts[pts.length-1].t,span=Math.max(1,t1-t0);
  var vs=pts.map(function(p){return p.v;}),mn=Math.min.apply(null,vs),mx=Math.max.apply(null,vs);
  if(mn===mx){mn-=1;mx+=1;}
  var pad=(mx-mn)*.12;mn-=pad;mx+=pad;
  function X(t){return L+(t-t0)/span*(W-L-R);}
  function Y(v){return T+(1-(v-mn)/(mx-mn))*(H-T-B);}
  var line=pts.map(function(p,i){return (i?'L':'M')+r2(X(p.t))+' '+r2(Y(p.v));}).join(' ');
  var area=line+' L'+r2(X(t1))+' '+(H-B)+' L'+r2(X(t0))+' '+(H-B)+' Z';
  var grid='',k,v,y;
  for(k=0;k<3;k++){
    v=mn+(mx-mn)*k/2;y=r2(Y(v));
    grid+='<line class="ch-gl" x1="'+L+'" x2="'+(W-R)+'" y1="'+y+'" y2="'+y+'"/><text class="ch-ax" x="'+(L-4)+'" y="'+(y+3)+'" text-anchor="end">'+stK(Math.round(v))+'</text>';
  }
  var dots=pts.length<=26?pts.map(function(p){
    return '<circle class="ch-pt" cx="'+r2(X(p.t))+'" cy="'+r2(Y(p.v))+'" r="2.6"><title>'+esc(fmtP2(p.v)+' · '+shortDate(p.t))+'</title></circle>';
  }).join(''):'';
  return '<svg class="ch-svg" viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Vývoj zůstatku pesos">'+
    '<defs><linearGradient id="'+id+'" x1="0" x2="0" y1="0" y2="1"><stop offset="0" style="stop-color:var(--acc);stop-opacity:.4"/><stop offset="1" style="stop-color:var(--acc);stop-opacity:0"/></linearGradient></defs>'+
    grid+'<path d="'+area+'" fill="url(#'+id+')"/><path class="ch-ln" d="'+line+'"/>'+dots+
    '<text class="ch-ax" x="'+L+'" y="'+(H-5)+'">'+shortDate(t0)+'</text><text class="ch-ax" x="'+(W-R)+'" y="'+(H-5)+'" text-anchor="end">'+shortDate(t1)+'</text></svg>';
}
function fmtP2(n){return Number(r2(n)).toLocaleString('cs-CZ')+' ₱';}
function donut(rows,fmtV){
  rows=rows.filter(function(r){return r.v>0;}).sort(function(a,b){return b.v-a.v;});
  var tot=rows.reduce(function(s,r){return s+r.v;},0);
  if(!tot)return '<div class="f3-empty">Zatím žádná potvrzená data.</div>';
  if(rows.length>5){var rest=rows.slice(5).reduce(function(s,r){return s+r.v;},0);rows=rows.slice(0,5);rows.push({l:'Ostatní',v:rest});}
  var C0=2*Math.PI*40,off=0;
  var circles=rows.map(function(r,i){
    var len=r.v/tot*C0,s='<circle cx="60" cy="60" r="40" fill="none" stroke-width="16" style="stroke:'+PAL[i%PAL.length]+'" stroke-dasharray="'+r2(len)+' '+r2(C0-len)+'" stroke-dashoffset="'+r2(-off)+'" transform="rotate(-90 60 60)"><title>'+esc(r.l+': '+fmtV(r.v))+'</title></circle>';
    off+=len;return s;
  }).join('');
  return '<div class="ch-dn"><svg viewBox="0 0 120 120" class="ch-dsvg" role="img" aria-label="Rozdělení"><circle cx="60" cy="60" r="40" fill="none" stroke-width="16" class="ch-dbg"/>'+circles+
    '<text x="60" y="64" text-anchor="middle" class="ch-dt">'+esc(fmtV(tot))+'</text></svg>'+
    '<div class="ch-leg">'+rows.map(function(r,i){
      return '<div><i style="background:'+PAL[i%PAL.length]+'"></i>'+esc(r.l)+' <b>'+Math.round(r.v/tot*100)+' %</b></div>';
    }).join('')+'</div></div>';
}
function incomeRows(onlyMe){
  var by={},me=getMember();
  (C('incomes')||[]).forEach(function(i){
    if(i.status!=='confirmed')return;
    if(onlyMe&&(!me||i.memberId!==me.id))return;
    var k=i.source||'Jiné';by[k]=(by[k]||0)+num(i.amount);
  });
  return Object.keys(by).map(function(k){return {l:k,v:by[k]};});
}
function cc(title,body){return '<div class="f3-cc"><div class="f3-h">'+title+'</div>'+body+'</div>';}

function paintFin(){
  var body=$('f2Body');if(!body||body.querySelector('.f3-charts'))return;
  var on=document.querySelector('#fin2Root .f3-seg button.on'),tab=on?on.getAttribute('data-t'):'';
  var hero=body.querySelector('.f3-hero');if(!hero||tab==='fee'||!tab)return;
  var h='';
  if(tab==='over'||tab==='peso')h+=cc('VÝVOJ ZŮSTATKU PESOS',lineChart(pesoSeries()));
  if(tab==='over')h+=cc('PŘÍJMY DO KASY PODLE ZDROJE',donut(incomeRows(false),function(n){return money(r2(n));}));
  if(tab==='usd'){
    h+=cc('MOJE PŘÍJMY PODLE ZDROJE',donut(incomeRows(true),function(n){return money(r2(n));}));
    var me=getMember(),ws=lastWeeks(8),by={};
    (C('incomes')||[]).forEach(function(i){
      if(i.status!=='confirmed'||i.memberId!==me.id)return;
      var d=parseCz(i.date);if(d){var k=weekKeyOf(d);by[k]=(by[k]||0)+num(i.amount);}
    });
    var cols=ws.map(function(w){var v=by[w.k]||0;return {l:w.l,a:v,b:0,t:stK(v)};});
    if(cols.some(function(c){return c.a>0;}))h+=cc('MŮJ PŘÍNOS PO TÝDNECH',stCols(cols,accHex(),accHex()));
  }
  if(h)hero.insertAdjacentHTML('afterend','<div class="f3-charts">'+h+'</div>');
}

function sparkSvg(vals){
  var n=vals.length;if(n<2)return '';
  var mx=Math.max.apply(null,vals.concat([1])),pts=vals.map(function(v,i){return r2(i/(n-1)*100)+','+r2(24-(v/mx)*20);});
  return '<svg class="dc-spark" viewBox="0 0 100 26" preserveAspectRatio="none" aria-hidden="true">'+
    '<path class="a" d="M0,26 L'+pts.join(' L')+' L100,26 Z"/><polyline points="'+pts.join(' ')+'"/></svg>';
}
function paintSparks(){
  var cards=document.querySelectorAll('.st-kpi .dc:not([data-sp])');if(!cards.length)return;
  var ws=lastWeeks(8),h={},ok={},mny={};
  (C('heists')||[]).forEach(function(x){var d=parseCz(x.date);if(!d)return;var k=weekKeyOf(d);h[k]=(h[k]||0)+1;if(x.escaped)ok[k]=(ok[k]||0)+1;});
  ((C('finance')||{}).payments||[]).forEach(function(p){if(p.weekKey)mny[p.weekKey]=(mny[p.weekKey]||0)+num(p.amount);});
  (C('incomes')||[]).forEach(function(i){if(i.status!=='confirmed')return;var d=parseCz(i.date);if(d){var k=weekKeyOf(d);mny[k]=(mny[k]||0)+num(i.amount);}});
  var rate=[],last=0;
  ws.forEach(function(w){if(h[w.k]){last=Math.round((ok[w.k]||0)/h[w.k]*100);}rate.push(last);});
  var data={'HEISTY':ws.map(function(w){return h[w.k]||0;}),'ÚSPĚŠNOST':rate,'PŘÍJMY':ws.map(function(w){return mny[w.k]||0;})};
  cards.forEach(function(c){
    c.setAttribute('data-sp','1');
    var lb=c.querySelector('.dc-lb');if(!lb)return;
    var v=data[lb.textContent.trim()];if(v)c.insertAdjacentHTML('beforeend',sparkSvg(v));
  });
}

/* ════════════════════════════════════════════
   3) AVATARY ČLENŮ
   ════════════════════════════════════════════ */
var avOk={};
function safeUrl(u){u=String(u||'').trim();return /^https?:\/\/[^\s"'<>()]+$/i.test(u)?u:'';}
function avUrl(m){return m?safeUrl(m.avatar):'';}
function probe(u){
  if(avOk[u]!==undefined)return;avOk[u]='p';
  var im=new Image();
  im.onload=function(){avOk[u]=true;schedule();};
  im.onerror=function(){avOk[u]=false;};
  im.src=u;
}
function setHex(el,m){
  if(!el)return;
  var u=avUrl(m);
  if(u&&avOk[u]===true){
    if(el.dataset.av!==u){
      if(el.dataset.l===undefined)el.dataset.l=el.textContent;
      el.dataset.av=u;el.textContent='';el.style.backgroundImage='url("'+u+'")';el.classList.add('has-av');
    }
  }else{
    if(u)probe(u);
    if(el.dataset.av){el.textContent=el.dataset.l||'';delete el.dataset.av;el.style.backgroundImage='';el.classList.remove('has-av');}
  }
}
function setInline(host,m){
  if(!host)return;
  var u=avUrl(m),cur=host.querySelector(':scope > img.av-s');
  if(u&&avOk[u]===true){
    if(!cur){cur=document.createElement('img');cur.className='av-s';cur.alt='';host.insertBefore(cur,host.firstChild);}
    if(cur.getAttribute('src')!==u)cur.src=u;
  }else{
    if(cur)cur.remove();
    if(u)probe(u);
  }
}
function paintAvatars(){
  Array.prototype.forEach.call(document.querySelectorAll('.ct-crew'),function(c){
    var l=c.querySelector('[data-prof]');setHex(c.querySelector('.ct-hex'),l?memById(l.getAttribute('data-prof')):null);
  });
  Array.prototype.forEach.call(document.querySelectorAll('#memberGrid .member-card'),function(c){
    var l=c.querySelector('[data-prof]');setHex(c.querySelector('.mc-hex'),l?memById(l.getAttribute('data-prof')):null);
  });
  Array.prototype.forEach.call(document.querySelectorAll('.rs-table tbody td[data-prof]'),function(td){
    setInline(td,memById(td.getAttribute('data-prof')));
  });
  Array.prototype.forEach.call(document.querySelectorAll('.board-post .bp-date'),function(sp){
    var p=sp.textContent.split(' — ');setInline(sp,memByName(p[p.length-1].trim()));
  });
  Array.prototype.forEach.call(document.querySelectorAll('.fd-av[data-actor]'),function(el){
    setHex(el,memByName(el.getAttribute('data-actor')));
  });
  Array.prototype.forEach.call(document.querySelectorAll('.prof-box[data-mid] .prof-hex'),function(el){
    setHex(el,memById(el.closest('.prof-box').getAttribute('data-mid')));
  });
  /* vlastní avatar v postranním panelu */
  var me=getMember(),u=avUrl(me);
  Array.prototype.forEach.call(document.querySelectorAll('#memberScreen .sb-foot'),function(f){
    var el=f.querySelector('.av-me');
    if(u&&avOk[u]===true){
      if(!el){el=document.createElement('div');el.className='av-me';el.setAttribute('role','img');el.setAttribute('aria-label','Tvoje fotka');f.insertBefore(el,f.firstChild);}
      if(el.dataset.av!==u){el.dataset.av=u;el.style.backgroundImage='url("'+u+'")';}
    }else{if(el)el.remove();if(u)probe(u);}
  });
}
function saveAvatar(id,url){
  var arr=DB.get('members')||[],t=null,i;
  for(i=0;i<arr.length;i++)if(arr[i].id===id){t=arr[i];break;}
  if(!t)return false;
  if(url)t.avatar=url;else delete t.avatar;
  DB.set('members',arr);
  return true;
}

/* ════════════════════════════════════════════
   4) ŽIVÝ PŘEHLED AKTIVITY
   ════════════════════════════════════════════ */
var FEED={ev:1,wh:1,boost:1,heist:1,cloth:1,praise:1,cal:1,escape:1,ooc:1,vyroba:1,board:1};
var feedSeen=null,feedNew={};
function feedEntries(){
  var log=C('syslog')||[],hidden={},out=[],i,e;
  mems().forEach(function(m){if(m.hidden)hidden[m.displayName]=1;});
  for(i=0;i<log.length&&out.length<18;i++){
    e=log[i];
    if(!FEED[e.type]||hidden[e.actor])continue;
    if(e.type==='board'&&/potvrdil/i.test(e.text))continue;
    out.push(e);
  }
  return out;
}
function feedHtml(list){
  if(!list.length)return '<div class="f3-empty">Zatím se nic nestalo.</div>';
  return list.map(function(e){
    var d=parseCz(e.time),ts=d?d.getTime():Date.now(),id=e.time+'|'+e.text;
    var tx=String(e.text||'').replace(/Člen "([^"]+)"/g,'$1');if(tx.length>150)tx=tx.slice(0,149)+'…';
    var ic=(typeof LOG_ICONS!=='undefined'&&LOG_ICONS[e.type])||'•';
    var actor=e.actor||'?';
    return '<div class="fd-it'+(feedNew[id]?' fresh':'')+'"><span class="fd-av" data-actor="'+esc(actor)+'" title="'+esc(actor)+'">'+esc(actor.charAt(0).toUpperCase())+'</span>'+
      '<span class="fd-tx"><span class="fd-ic">'+ic+'</span> '+esc(tx)+'</span><time>'+esc(agoStr(ts))+'</time></div>';
  }).join('');
}
function paintFeed(){
  var anchor=$('boardPosts');if(!anchor)return;
  var tab=$('mt-board');if(!tab||!tab.classList.contains('active'))return;
  var box=$('feedBox');
  if(!box){
    box=document.createElement('section');box.id='feedBox';box.className='fd-box';box.setAttribute('aria-label','Živý přehled aktivity');
    box.innerHTML='<div class="fd-h"><i class="fd-dot"></i>Živý přehled</div><div class="fd-list"></div>';
    anchor.before(box);
  }
  var list=feedEntries(),ids=list.map(function(e){return e.time+'|'+e.text;});
  if(feedSeen===null)feedSeen={};
  var first=!Object.keys(feedSeen).length&&!box.dataset.init;
  ids.forEach(function(id){
    if(!feedSeen[id]){feedSeen[id]=1;if(!first){feedNew[id]=1;setTimeout(function(){delete feedNew[id];},7000);}}
  });
  box.dataset.init='1';
  var h=feedHtml(list),lst=box.querySelector('.fd-list');
  if(lst.dataset.h!==h){var st=lst.scrollTop;lst.dataset.h=h;lst.innerHTML=h;lst.scrollTop=st;}
}

/* ════════════════════════════════════════════
   5) ODZNAKY A ŽEBŘÍČKY
   ════════════════════════════════════════════ */
var ctxC=null,ctxT=0;
function weekKeys(n){
  var out=[],seen={},i,d,k;
  for(i=0;i<n*2&&out.length<n;i++){d=new Date();d.setDate(d.getDate()-7*i);k=getWeekKey(d);if(!seen[k]){seen[k]=1;out.push(k);}}
  return out;
}
function ctx(){
  var now=Date.now();
  if(ctxC&&now-ctxT<2500)return ctxC;
  var d30=now-30*864e5;
  var hs=(C('heists')||[]).map(function(h,i){var d=parseCz(h.date);return {h:h,t:d?d.getTime():0,i:i};})
    .sort(function(a,b){return a.t-b.t||a.i-b.i;});
  var evs=(C('events')||[]).filter(function(e){var d=evStart(e);return d&&d.getTime()<=now&&d.getTime()>=d30&&e.att;});
  var inc={},topId=null,topV=0;
  (C('incomes')||[]).forEach(function(i){
    if(i.status!=='confirmed')return;var d=parseCz(i.date);
    if(d&&d.getTime()>=d30)inc[i.memberId]=(inc[i.memberId]||0)+num(i.amount);
  });
  Object.keys(inc).forEach(function(k){if(inc[k]>topV){topV=inc[k];topId=k;}});
  ctxC={d30:d30,hs:hs,evs:evs,inc:inc,topId:topId,praises:C('praises')||[],fin:C('finance')||{payments:[]},
    fee:Number((C('finsettings')||{}).weeklyFee)||0,weeks:weekKeys(18)};
  ctxT=now;return ctxC;
}
function statsFor(m){
  var c=ctx(),id=m.id,i;
  var mine=c.hs.filter(function(x){return heistParticipated(x.h,id);});
  var streak=0;for(i=mine.length-1;i>=0;i--){if(mine[i].h.escaped)streak++;else break;}
  var came=0,abs=0;
  c.evs.forEach(function(e){var v=e.att[id];if(v==='came')came++;else if(v==='absent')abs++;});
  var attN=came+abs,pay=0;
  if(c.fee>0&&!m.hidden){
    for(i=0;i<c.weeks.length;i++){
      var k=c.weeks[i];
      var ok=(window.onVacation&&window.onVacation(id,k))||(c.fin.payments||[]).some(function(p){
        return p.memberId===id&&p.weekKey===k&&(p.expenseId==='weekly'||!p.expenseId);});
      if(ok)pay++;else if(i>0)break;
    }
  }
  return {heists:mine.length,streak:streak,heists30:mine.filter(function(x){return x.t>=c.d30;}).length,
    attN:attN,attPct:attN?Math.round(came/attN*100):null,
    praise:c.praises.filter(function(p){return p.memberId===id;}).length,
    pay:pay,contrib:c.inc[id]||0,top:c.topId===id};
}
var BD=[
  {k:'streak',ic:'🔥',n:'Série heistů',t:[3,5,10],v:function(s){return s.streak;},tx:function(n){return n+' úspěšných heistů v řadě';}},
  {k:'vet',ic:'💎',n:'Veterán heistů',t:[10,25,50],v:function(s){return s.heists;},tx:function(n){return n+' heistů celkem';}},
  {k:'att',ic:'📅',n:'Spolehlivý',t:[3],v:function(s){return s.attPct===100?s.attN:0;},tx:function(){return '100% docházka za měsíc';},
    hint:function(s){return s.attN?s.attPct+' % z '+s.attN+' akcí (potřeba 100 % ze 3)':'zatím žádná docházka';}},
  {k:'top',ic:'💰',n:'Top přispěvatel',t:[1],v:function(s){return s.top?1:0;},tx:function(){return 'Nejvíc přispěl do kasy za 30 dní';},
    hint:function(s){return s.contrib?money(s.contrib)+' za 30 dní':'zatím nic nepřispěl';}},
  {k:'praise',ic:'⭐',n:'Oceněný',t:[1,3,10],v:function(s){return s.praise;},tx:function(n){return n+' pochval';}},
  {k:'pay',ic:'💵',n:'Platba bez absence',t:[4,8,16],v:function(s){return s.pay;},tx:function(n){return n+' týdnů po sobě zaplaceno';}}
];
function badgesOf(s){
  return BD.map(function(b){
    var v=b.v(s),lv=0;b.t.forEach(function(t,i){if(v>=t)lv=i+1;});
    return {b:b,v:v,lv:lv,next:b.t[lv]==null?null:b.t[lv],s:s};
  });
}
function chipHtml(x){
  var on=x.lv>0,sub;
  if(on)sub=x.b.tx(x.v)+(x.next!=null?' · další úroveň '+x.v+'/'+x.next:'');
  else sub=x.b.hint?x.b.hint(x.s):(x.v+'/'+x.next);
  return '<div class="bd'+(on?' on l'+x.lv:'')+'" title="'+esc(x.b.n)+'"><span class="bd-i">'+x.b.ic+'</span><span class="bd-t"><b>'+esc(x.b.n)+'</b><small>'+esc(sub)+'</small></span></div>';
}
function badgeWatch(){
  if(!ready())return;
  var m=getMember();if(m.hidden)return;
  var bs=badgesOf(statsFor(m)),key='tsc_bd_'+m.id,old=null,cur={},merged={};
  try{old=JSON.parse(lsGet(key)||'null');}catch(e){}
  bs.forEach(function(b){cur[b.b.k]=b.lv;});
  var gained=old?bs.filter(function(b){return b.lv>(old[b.b.k]||0);}):[];
  bs.forEach(function(b){merged[b.b.k]=Math.max(b.lv,old?(old[b.b.k]||0):0);});
  if(!old||JSON.stringify(old)!==JSON.stringify(merged))lsSet(key,JSON.stringify(merged));
  if(gained.length){
    toast('🏅 Nový odznak: '+gained.map(function(g){return g.b.n;}).join(', '),'success',6500);
    if(typeof window.tscBurst==='function')window.tscBurst();
  }
}
function medal(i){return ['🥇','🥈','🥉'][i]||String(i+1)+'.';}
function rkCard(title,rows,fmtV){
  rows=rows.filter(function(r){return r.v>0;}).sort(function(a,b){return b.v-a.v;}).slice(0,5);
  return '<div class="rk-c"><div class="rk-t">'+title+'</div>'+(rows.length?rows.map(function(r,i){
    return '<div class="rk-r"><span class="rk-k">'+medal(i)+'</span><span class="fd-av" data-actor="'+esc(r.m.displayName)+'">'+esc(r.m.displayName.charAt(0).toUpperCase())+'</span>'+
      '<span class="rk-n prof-link" data-prof="'+esc(r.m.id)+'">'+esc(r.m.displayName)+'</span><b>'+esc(fmtV(r.v))+'</b></div>';
  }).join(''):'<div class="f3-empty">Zatím žádná data.</div>')+'</div>';
}
function lbHtml(){
  var rows=mems().filter(function(m){return !m.hidden;}).map(function(m){return {m:m,s:statsFor(m)};});
  var h='<div class="sh">// ŽEBŘÍČKY (posledních 30 dní)</div><div class="rk-grid">'+
    rkCard('🏆 Heisty',rows.map(function(r){return {m:r.m,v:r.s.heists30};}),function(v){return v+'×';})+
    rkCard('📅 Docházka',rows.filter(function(r){return r.s.attN>=2;}).map(function(r){return {m:r.m,v:r.s.attPct};}),function(v){return v+' %';})+
    rkCard('⭐ Pochvaly celkem',rows.map(function(r){return {m:r.m,v:r.s.praise};}),function(v){return v+'×';})+
    rkCard('🏅 Sbírka odznaků',rows.map(function(r){return {m:r.m,v:badgesOf(r.s).reduce(function(a,b){return a+b.lv;},0)};}),function(v){return v+' úrovní';});
  if(isAdmin())h+=rkCard('💰 Příspěvky do kasy',rows.map(function(r){return {m:r.m,v:r.s.contrib};}),function(v){return money(r2(v));});
  return h+'</div>';
}
function paintLb(){
  var root=$('praiseRoot');if(!root||!root.children.length)return;
  var box=$('lbBox');
  if(box&&Date.now()-(+box.dataset.t||0)<8000)return;
  var h=lbHtml();
  if(!box){
    box=document.createElement('div');box.id='lbBox';
    var firstSh=root.querySelector('.sh');
    if(firstSh)root.insertBefore(box,firstSh);else root.appendChild(box);
  }
  if(box.dataset.h!==h){box.dataset.h=h;box.innerHTML=h;}
  box.dataset.t=String(Date.now());
}
function profEnhance(box){
  box.setAttribute('data-av3','1');
  var nm=box.querySelector('.prof-name');if(!nm)return;
  var m=memByName(nm.textContent.trim());if(!m)return;
  box.setAttribute('data-mid',m.id);
  var me=getMember(),can=!!me&&(me.id===m.id||(isAdmin()&&canManage(m)));
  var bs=badgesOf(statsFor(m)),lv=bs.reduce(function(a,b){return a+b.lv;},0);
  var tiles=box.querySelector('.prof-tiles');
  if(tiles)tiles.insertAdjacentHTML('afterend','<div class="prof-sec">// ODZNAKY <span class="bd-sum">'+lv+' úrovní</span></div><div class="bd-wrap">'+bs.map(chipHtml).join('')+'</div>');
  if(!can)return;
  var ft=box.querySelector('.modal-ftr');if(!ft)return;
  ft.insertAdjacentHTML('beforebegin','<div class="prof-sec">// FOTKA PROFILU</div>'+
    '<div class="av-edit"><div class="iw"><span class="ip">&gt;_</span><input type="text" class="av-in" placeholder="https://… odkaz na fotku" value="'+esc(m.avatar||'')+'"/></div>'+
    '<button class="btn-acc small av-save" type="button">ULOŽIT</button><button class="btn-ghost small av-rm" type="button">ODEBRAT</button></div>'+
    '<div class="att-hint">Odkaz na fotku z Fivemanage nebo Discordu (https). Ukáže se v Crew Listu, kontaktech i u příspěvků.</div>');
  var inp=box.querySelector('.av-in');
  box.querySelector('.av-save').onclick=function(){
    var raw=inp.value.trim(),u=safeUrl(raw);
    if(raw&&!u){toast('Odkaz musí začínat https:// a nesmí obsahovat mezery','error',4000);return;}
    if(!u){toast('Zadej odkaz na fotku, nebo použij Odebrat','error');return;}
    if(saveAvatar(m.id,u)){toast('Fotka uložena ✓','success');probe(u);schedule();}
  };
  box.querySelector('.av-rm').onclick=function(){
    if(saveAvatar(m.id,'')){inp.value='';toast('Fotka odebrána','info');schedule();}
  };
}
function paintProfiles(){
  Array.prototype.forEach.call(document.querySelectorAll('.prof-ov .prof-box:not([data-av3])'),profEnhance);
}

/* ════════════════════════════════════════════
   6) LIGHTBOX S GALERIÍ
   ════════════════════════════════════════════ */
var lastImg=null,lbx=null;
document.addEventListener('click',function(e){lastImg=(e.target&&e.target.tagName==='IMG')?e.target:null;},true);
function lbList(src){
  var el=lastImg,list=[];
  if(el&&el.src===src){
    var host=el.closest('.boost-item')||el.closest('.esc-card')||el.closest('.bp-att');
    if(host){
      var sel=host.classList.contains('boost-item')?'.boost-thumbs img':(host.classList.contains('esc-card')?'.esc-gal img':'.att-imgs img');
      list=Array.prototype.map.call(host.querySelectorAll(sel),function(i){return i.src;});
    }
  }
  if(!list.length)list=[src];
  var i=list.indexOf(src);if(i<0){list.unshift(src);i=0;}
  return {list:list,i:i};
}
function closeLbx(){if(lbx){lbx.close();lbx=null;}}
function openLbx(src){
  closeLbx();
  var g=lbList(src),list=g.list,n=list.length,i=g.i,s=1,x=0,y=0,ox=0,oy=0,moved=0,startX=0,startY=0,pinch0=0,s0=1,ptrs={};
  var prev=document.activeElement;
  var el=document.createElement('div');el.className='lbx';el.setAttribute('role','dialog');el.setAttribute('aria-modal','true');el.setAttribute('aria-label','Galerie fotek');
  el.innerHTML='<button type="button" class="lbx-x" aria-label="Zavřít">✕</button>'+
    (n>1?'<button type="button" class="lbx-n prev" aria-label="Předchozí fotka">‹</button><button type="button" class="lbx-n next" aria-label="Další fotka">›</button>':'')+
    '<div class="lbx-st"><img class="lbx-img" alt="" draggable="false"/></div>'+
    '<div class="lbx-bar"><span class="lbx-c"></span>'+
    (n>1?'<div class="lbx-th">'+list.map(function(u,k){return '<button type="button" data-k="'+k+'" aria-label="Fotka '+(k+1)+'"><img src="'+esc(u)+'" alt=""/></button>';}).join('')+'</div>':'')+
    '<button type="button" class="lbx-z" aria-label="Zvětšit / zmenšit">⤢</button></div>';
  document.body.appendChild(el);
  var st=el.querySelector('.lbx-st'),img=el.querySelector('.lbx-img'),cnt=el.querySelector('.lbx-c');
  function clampPan(){
    var mx=Math.max(0,(img.offsetWidth*s-st.clientWidth)/2),my=Math.max(0,(img.offsetHeight*s-st.clientHeight)/2);
    x=Math.max(-mx,Math.min(mx,x));y=Math.max(-my,Math.min(my,y));
  }
  function apply(){img.style.transform='translate('+x+'px,'+y+'px) scale('+s+')';st.classList.toggle('zoomed',s>1);}
  function setScale(ns){s=Math.max(1,Math.min(5,ns));if(s<=1.001){s=1;x=0;y=0;}else clampPan();apply();}
  function show(k){
    i=(k+n)%n;s=1;x=0;y=0;img.src=list[i];apply();
    cnt.textContent=n>1?(i+1)+' / '+n:'';
    Array.prototype.forEach.call(el.querySelectorAll('.lbx-th button'),function(b,j){b.classList.toggle('on',j===i);});
    if(n>1){new Image().src=list[(i+1)%n];new Image().src=list[(i-1+n)%n];}
  }
  function go(d){if(n>1)show(i+d);}
  function close(){
    document.removeEventListener('keydown',key,true);el.remove();
    if(prev&&prev.focus)try{prev.focus();}catch(e){}
  }
  function key(e){
    if(e.key==='Escape'){e.stopPropagation();e.preventDefault();closeLbx();}
    else if(e.key==='ArrowLeft'){e.preventDefault();go(-1);}
    else if(e.key==='ArrowRight'){e.preventDefault();go(1);}
    else if(e.key==='+'||e.key==='='){setScale(s*1.3);}
    else if(e.key==='-'){setScale(s/1.3);}
    else if(e.key==='0'){setScale(1);}
    else if(e.key==='Tab'){
      var f=el.querySelectorAll('button');if(!f.length)return;
      var a=Array.prototype.indexOf.call(f,document.activeElement);
      e.preventDefault();f[(a+(e.shiftKey?-1:1)+f.length)%f.length].focus();
    }
  }
  document.addEventListener('keydown',key,true);
  el.querySelector('.lbx-x').onclick=closeLbx;
  var pv=el.querySelector('.prev'),nx=el.querySelector('.next');
  if(pv)pv.onclick=function(){go(-1);};if(nx)nx.onclick=function(){go(1);};
  el.querySelector('.lbx-z').onclick=function(){setScale(s>1?1:2.5);};
  Array.prototype.forEach.call(el.querySelectorAll('.lbx-th button'),function(b){
    b.onclick=function(){show(+b.getAttribute('data-k'));};
  });
  st.addEventListener('wheel',function(e){e.preventDefault();setScale(s*(e.deltaY<0?1.2:1/1.2));},{passive:false});
  st.addEventListener('dblclick',function(){setScale(s>1?1:2.5);});
  st.addEventListener('pointerdown',function(e){
    try{st.setPointerCapture(e.pointerId);}catch(x2){}
    ptrs[e.pointerId]={x:e.clientX,y:e.clientY};
    var ids=Object.keys(ptrs);
    if(ids.length===2){var a=ptrs[ids[0]],b=ptrs[ids[1]];pinch0=Math.hypot(a.x-b.x,a.y-b.y);s0=s;}
    else{startX=e.clientX;startY=e.clientY;ox=x;oy=y;moved=0;}
  });
  st.addEventListener('pointermove',function(e){
    if(!ptrs[e.pointerId])return;
    ptrs[e.pointerId]={x:e.clientX,y:e.clientY};
    var ids=Object.keys(ptrs);
    if(ids.length===2){
      var a=ptrs[ids[0]],b=ptrs[ids[1]],d=Math.hypot(a.x-b.x,a.y-b.y);
      if(pinch0)setScale(s0*d/pinch0);return;
    }
    var dx=e.clientX-startX,dy=e.clientY-startY;moved=Math.max(moved,Math.abs(dx)+Math.abs(dy));
    if(s>1){x=ox+dx;y=oy+dy;clampPan();apply();}
  });
  function endPtr(e){
    if(!ptrs[e.pointerId])return;
    delete ptrs[e.pointerId];
    var ids=Object.keys(ptrs);
    if(!ids.length&&s<=1.01){
      var dx=e.clientX-startX,dy=e.clientY-startY;
      if(Math.abs(dx)>60&&Math.abs(dx)>Math.abs(dy)*1.5)go(dx<0?1:-1);
    }
    if(ids.length===1){var r=ptrs[ids[0]];startX=r.x;startY=r.y;ox=x;oy=y;}
    pinch0=0;
  }
  st.addEventListener('pointerup',endPtr);st.addEventListener('pointercancel',endPtr);
  el.addEventListener('click',function(e){if((e.target===el||e.target===st)&&moved<6)closeLbx();});
  lbx={close:close};
  show(i);
  el.querySelector('.lbx-x').focus();
}
window.boostZoom=openLbx;

/* ════════════════════════════════════════════
   7) PLYNULÉ PŘECHODY
   ════════════════════════════════════════════ */
/* 7a) SVG ikony menu (emoji zůstává v textu kvůli hledání Ctrl+K, jen se vizuálně schová) */
var ICONS={
  board:'<path d="M4 10v4h3l6 4V6L7 10H4z"/><path d="M16.5 9a4 4 0 0 1 0 6"/><path d="M19 7a7 7 0 0 1 0 10"/>',
  ooc:'<path d="M4 5h16v11h-9l-4 4v-4H4z"/><path d="M8 10h8"/>',
  tasks:'<rect x="6" y="4" width="12" height="17" rx="1.5"/><path d="M9 4V3h6v1M9 13l2 2 4-4"/>',
  messages:'<rect x="3" y="5" width="18" height="14" rx="1.5"/><path d="M3 7l9 6 9-6"/>',
  calendar:'<rect x="3.5" y="5" width="17" height="15" rx="1.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  rules:'<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 13h7M9 17h7"/>',
  warehouse:'<path d="M3 8l9-5 9 5v9l-9 5-9-5z"/><path d="M3 8l9 5 9-5M12 13v9"/>',
  boosting:'<path d="M3 16v-3l2-5h14l2 5v3z"/><path d="M3 13h18"/><circle cx="7.5" cy="16.5" r="1.8"/><circle cx="16.5" cy="16.5" r="1.8"/>',
  heist:'<path d="M6 4h12l3 5-9 11L3 9z"/><path d="M3 9h18M9 4l-2 5 5 11 5-11-2-5"/>',
  escape:'<path d="M12 3v18"/><path d="M12 5h7l2 2.5-2 2.5h-7zM12 12H5l-2 2.5L5 17h7"/>',
  clothing:'<path d="M8 3L3 6l2 4 3-1v12h8V9l3 1 2-4-5-3c-.5 1.5-2 2.5-4 2.5S8.5 4.5 8 3z"/>',
  vyroba:'<path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3"/><path d="M7.5 15h9"/>',
  prodej:'<g transform="rotate(-45 12 12)"><rect x="3" y="8" width="18" height="8" rx="4"/><path d="M12 8v8"/></g>',
  business:'<path d="M15 4a4.5 4.5 0 0 0-3.8 6.5L4 17.7 6.3 20l7.2-7.2A4.5 4.5 0 0 0 20 9l-3 3-2.5-.5L14 9l3-3a4.4 4.4 0 0 0-2-2z"/>',
  finance:'<rect x="3" y="6" width="18" height="12" rx="1.5"/><circle cx="12" cy="12" r="2.5"/><path d="M6.5 9.5h.01M17.5 14.5h.01"/>',
  excuse:'<path d="M5 4h10l4 4v12H5z"/><path d="M9 15l5-5 2 2-5 5H9z"/>',
  report:'<path d="M6 21V4M6 5h12l-2 4 2 4H6"/>',
  radio:'<rect x="3" y="9" width="18" height="11" rx="1.5"/><path d="M7 9l10-5"/><circle cx="9" cy="14.5" r="2.5"/><path d="M15 13h3M15 16h3"/>',
  roster:'<rect x="3" y="5" width="18" height="14" rx="1.5"/><circle cx="9" cy="11" r="2"/><path d="M6 16c.5-2 5.5-2 6 0M14 10h4M14 13h4"/>',
  pochvaly:'<path d="M12 3l2.7 5.6 6.1.8-4.5 4.3 1.1 6.1L12 16.9l-5.4 2.9 1.1-6.1L3.2 9.4l6.1-.8z"/>',
  contacts:'<path d="M5 4h4l1.5 4-2 1.5a11 11 0 0 0 5 5l1.5-2 4 1.5v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>',
  admin:'<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
  templates:'<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
  settings:'<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>',
  incomes:'<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v9M9.5 10c0-1 1-1.5 2.5-1.5s2.5.5 2.5 1.5-1 1.3-2.5 1.7-2.5.7-2.5 1.8 1 1.5 2.5 1.5 2.5-.5 2.5-1.5"/>',
  stats:'<path d="M4 20V10M10 20V4M16 20v-7M21 20H3"/>',
  log:'<path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r=".8"/><circle cx="4" cy="12" r=".8"/><circle cx="4" cy="18" r=".8"/>',
  members:'<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.5 2.7-6 6-6s6 2.5 6 6"/><path d="M16 5.5a3 3 0 0 1 0 5.5M18 14.5c2 .7 3 2.7 3 5.5"/>',
  nabor:'<circle cx="10" cy="8" r="3.2"/><path d="M4 20c0-3.5 2.7-6 6-6s6 2.5 6 6M18 8v6M15 11h6"/>'
};
var ALIAS={heists:'heist',excuses:'excuse',reports:'report',drugsales:'prodej'};
function paintIcons(){
  if(typeof menuKey!=='function')return;
  Array.prototype.forEach.call(document.querySelectorAll('.sidebar .nb'),function(b){
    if(b.querySelector('.ni-svg'))return;
    var k=menuKey(b);k=ALIAS[k]||k;
    var p=ICONS[k],ni=b.querySelector('.ni');
    if(!p||!ni)return;
    ni.classList.add('has-svg');
    ni.insertAdjacentHTML('beforeend','<svg class="ni-svg" viewBox="0 0 24 24" aria-hidden="true">'+p+'</svg>');
  });
}

/* 7b) skeleton fotek + plynulé zobrazení */
var IMG_SEL='.wh2-img img,.boost-main,.boost-thumbs img,.att-imgs img,.esc-gal img,.cs-img,.esc-prev img';
function paintImgs(){
  Array.prototype.forEach.call(document.querySelectorAll(IMG_SEL),function(im){
    if(im.dataset.sk)return;im.dataset.sk='1';
    if(im.complete&&im.naturalWidth)return;
    im.classList.add('sk');
    function done(){im.classList.remove('sk');im.classList.add('sk-in');}
    im.addEventListener('load',done,{once:true});im.addEventListener('error',done,{once:true});
  });
}

/* 7c) počítání čísel */
var cuPrev={};
function paintCounts(){
  if(reduce)return;
  var onb=document.querySelector('#fin2Root .f3-seg button.on');
  Array.prototype.forEach.call(document.querySelectorAll('.f3-big,.wh2-st b'),function(el,idx){
    if(el.dataset.cu)return;el.dataset.cu='1';
    var tx=el.textContent.trim(),m=/^([^\d-]*)(-?)(\d[\d\s\u00a0]*)(.*)$/.exec(tx);
    if(!m||/^,\d/.test(m[4]))return;
    var n=parseInt(m[3].replace(/[\s\u00a0]/g,''),10);if(!(n>0))return;
    var key=(el.closest('#fin2Root')?'f'+(onb?onb.getAttribute('data-t'):''):((el.closest('.wh2')||{}).id||'x'))+'|'+idx;
    var from=cuPrev[key];cuPrev[key]=n;
    if(from===undefined)from=0;if(from===n)return;
    var t0=performance.now();
    (function f(t){
      var k=Math.min(1,(t-t0)/700),e=1-Math.pow(1-k,3),v=Math.round(from+(n-from)*e);
      if(k<1&&el.isConnected){el.textContent=m[1]+m[2]+v.toLocaleString('cs-CZ')+m[4];requestAnimationFrame(f);}
      else el.textContent=tx;
    })(t0);
  });
}

/* 7d) kroužky: Cíl kasy a úkoly */
function ringSvg(p){
  var c=2*Math.PI*22;
  return '<svg class="rg" viewBox="0 0 56 56" aria-hidden="true"><circle class="rg-t" cx="28" cy="28" r="22"/>'+
    '<circle class="rg-g" cx="28" cy="28" r="22" transform="rotate(-90 28 28)" stroke-dasharray="'+r2(c)+'" stroke-dashoffset="'+r2(c)+'" data-off="'+r2(c*(1-p/100))+'"/>'+
    '<text x="28" y="32" text-anchor="middle" class="rg-x">'+p+'%</text></svg>';
}
function fillRings(root){
  requestAnimationFrame(function(){requestAnimationFrame(function(){
    Array.prototype.forEach.call(root.querySelectorAll('.rg-g'),function(g){g.style.strokeDashoffset=g.getAttribute('data-off');});
  });});
}
function paintGoals(){
  Array.prototype.forEach.call(document.querySelectorAll('.goal:not([data-ring])'),function(g){
    g.setAttribute('data-ring','1');
    var pe=g.querySelector('.goal-p'),p=Math.max(0,Math.min(100,pe?(parseInt(pe.textContent,10)||0):0));
    var w=document.createElement('div');w.className='goal-main';
    while(g.firstChild)w.appendChild(g.firstChild);
    g.insertAdjacentHTML('afterbegin',ringSvg(p));g.appendChild(w);g.classList.add('has-ring');
    fillRings(g);
  });
}
function paintTaskRing(){
  var tab=$('mt-tasks'),m=getMember();if(!tab||!m)return;
  var all=(C('tasks')||{})[m.id]||[],box=$('taskRing');
  if(!all.length){if(box)box.remove();return;}
  var ok=0,part=0,no=0,open=0;
  all.forEach(function(t){
    if(!t.done)open++;else if(t.resolution==='splneno')ok++;else if(t.resolution==='casti')part++;else if(t.resolution==='nesplneno')no++;
  });
  var tot=all.length,sig=[ok,part,no,open,tot].join('/');
  if(!box){
    box=document.createElement('div');box.id='taskRing';box.className='tr-box';
    var ph=tab.querySelector('.ph');if(!ph)return;ph.after(box);
  }
  if(box.dataset.s===sig)return;
  box.dataset.s=sig;
  var p=Math.round(ok/tot*100);
  box.innerHTML=ringSvg(p)+'<div class="tr-tx"><b>Splněno '+ok+' z '+tot+' úkolů</b><span>'+
    '<em>otevřené '+open+'</em><em>částečně '+part+'</em><em>nesplněno '+no+'</em></span></div>';
  fillRings(box);
}

/* 7e) skeleton při startu + točící se tlačítko přihlášení */
(function(){
  var lb=$('loginBox');
  if(lb&&!$('bootSk')){
    var d=document.createElement('div');d.id='bootSk';d.className='boot-sk';d.setAttribute('aria-hidden','true');
    d.innerHTML='<i></i><i></i><i class="s"></i><i class="b"></i>';lb.after(d);
  }
  var _dl=window.doLogin;
  if(typeof _dl==='function')window.doLogin=async function(){
    var b=$('loginBtn');if(b)b.classList.add('is-loading');
    try{return await _dl.apply(this,arguments);}
    finally{if(b)b.classList.remove('is-loading');}
  };
})();

/* ════════════════════════════════════════════
   ŘÍDICÍ SMYČKA (jeden MutationObserver místo desítek intervalů)
   ════════════════════════════════════════════ */
var sched=0;
function schedule(){
  if(sched)return;
  sched=setTimeout(function(){sched=0;paintAll();},90);
}
function paintAll(){
  try{paintIcons();}catch(e){console.error('v3 icons',e);}
  try{paintImgs();}catch(e){console.error('v3 imgs',e);}
  if(!ready())return;
  [paintAvatars,paintFeed,paintFin,paintSparks,paintGoals,paintTaskRing,paintLb,paintProfiles,paintCounts].forEach(function(f){
    try{f();}catch(e){console.error('v3 '+f.name,e);}
  });
}
new MutationObserver(function(recs){
  for(var i=0;i<recs.length;i++){
    var t=recs[i].target,el=t.nodeType===1?t:t.parentNode;
    if(!el)continue;
    if(el.id==='mClock'||(el.dataset&&el.dataset.cu))continue;
    if(el.closest&&el.closest('.toast-container,.lbx'))continue;
    schedule();return;
  }
}).observe(document.body,{childList:true,subtree:true});

/* časové údaje v živém přehledu + sledování nových odznaků */
setInterval(function(){if(!document.hidden&&ready())try{paintFeed();}catch(e){}},30000);
setInterval(function(){if(!document.hidden)try{badgeWatch();}catch(e){}},10000);
setTimeout(schedule,400);
})();