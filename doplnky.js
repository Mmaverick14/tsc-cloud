// ── DOPLNKY: odznaky novinek, export akce do kalendáře (.ics), hledání, vlastní barva ──
// Načítat jako poslední (po luxus.js). Nic nepřepisuje, jen obaluje existující funkce.
(function(){
  function norm(s){return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();}
  var BASE_TITLE=document.title||'THE STRIKERS CREW';

  /* ═══ 1) ODZNAKY S POČTEM NOVINEK (Oznámení, Úkoly, Zprávy) ═══ */
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

  /* ═══ 2) „PŘIDAT DO KALENDÁŘE" (.ics) U KAŽDÉ AKCE ═══ */
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

  /* ═══ 3) HLEDÁNÍ: kontakty a crew list ═══ */
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

  /* ═══ 4) SKLAD: filtr „jen málo zásob" ═══ */
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

  /* ═══ 5) VLASTNÍ BARVA MOTIVU (RGB / HEX / výběr) ═══ */
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
    // okno je teď větší → udržet ho na obrazovce
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
