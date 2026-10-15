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

// ── DOPLNKY 2: generátor hesel + hotová zpráva s přihlašovacími údaji ──
(function(){
  var g=function(id){return document.getElementById(id);};

  /*GEN_START*/
  var UP='ABCDEFGHJKLMNPQRSTUVWXYZ',LO='abcdefghijkmnopqrstuvwxyz',DG='23456789'; // bez 0/O/1/l/I, ať se nespletou
  function rnd(n){ // rovnoměrné náhodné číslo 0..n-1 (bez zkreslení)
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
  /*GEN_END*/

  function copyText(txt,okMsg){
    function ok(){if(typeof toast==='function')toast(okMsg,'success');}
    function fb(){
      var t=document.createElement('textarea');t.value=txt;t.style.cssText='position:fixed;opacity:0';
      document.body.appendChild(t);t.select();try{document.execCommand('copy');ok();}catch(e){}t.remove();
    }
    if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(txt).then(ok,fb);else fb();
  }

  // řádek tlačítek pod polem s heslem
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

  // nový člen: zachytit údaje dřív, než je formulář po úspěchu vymaže
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
  // admin změna hesla existujícímu členovi
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

// ── DOPLNKY 3: omluvenky — od/do → délka; dovolená = týdenní příspěvek se nepočítá ──
(function(){
  var MIN_DAYS=4; // týden se neplatí, když dovolená pokrývá aspoň tolik jeho dní (Ne–So)

  /* A) Je člen ten týden na (schválené) dovolené? */
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

  /* B) Formulář: pole Od/Do + automatická délka */
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
        if(arr.length>n0){ // omluvenka se opravdu odeslala → uložit i datum Do
          if(toVal){arr[arr.length-1].dateTo=toVal;DB.set('excuses',arr);}
          to.value='';
        }
        return r;
      };
    }
  }

  /* C) V kartách omluvenek ukázat rozsah Od–Do */
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

// ── DOPLNKY 4: bankovní účet frakce + předepsaný text do poznámky (mění jen Mastermind) ──
(function(){
  var DEF_TPL='Příspěvek – {jmeno}';
  function acc(){return DB.get('bankacc')||{};}
  function boss(){var m=getMember();return !!m&&m.position==='Mastermind';}
  function tplOf(a){return a.tpl===undefined?DEF_TPL:String(a.tpl||'');}
  // {jmeno} = IC jméno, {prezdivka} = přezdívka (jinak IC jméno), {tyden} = aktuální týden
  function fill(tpl,m){
    var n=(typeof rosterNames==='function')?rosterNames(m):{nick:''};
    return String(tpl||'').replace(/\{jmeno\}/gi,m.displayName).replace(/\{prezdivka\}/gi,n.nick||m.displayName).replace(/\{tyden\}/gi,getWeekKey()).trim();
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
      (a.holder?'<div class="bank-meta"><span>MAJITEL</span><b>'+esc(a.holder)+'</b></div>':'');
    var mine=(me&&tpl)?fill(tpl,me):'';
    if(mine)h+='<div class="bank-ref"><span>TVŮJ TEXT DO POZNÁMKY PLATBY</span><div class="bank-refrow"><code>'+esc(mine)+'</code><button class="btn-micro" data-bank="copyref" data-ref="'+esc(mine)+'">📋 KOPÍROVAT</button></div></div>';
    if(a.note)h+='<div class="bank-note">'+esc(a.note)+'</div>';
    if(admin&&tpl){
      var ms=(DB.get('members')||[]).filter(function(x){return !x.hidden;});
      h+='<details class="bank-all"><summary>👥 TEXTY VŠECH ČLENŮ ('+ms.length+')</summary>'+ms.map(function(x){
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
      '<div class="field-group" style="margin-top:.7rem"><label class="fl">TEXT DO POZNÁMKY PLATBY (šablona pro každého člena)</label><div class="iw"><span class="ip">&gt;_</span><input type="text" id="bkTpl" maxlength="100"/></div>'+
        '<div class="bank-hint">Zástupné znaky: <b>{jmeno}</b> = IC jméno, <b>{prezdivka}</b> = přezdívka, <b>{tyden}</b> = aktuální týden. Prázdné = bez předepsaného textu.</div>'+
        '<div class="bank-prev" id="bkPrev"></div></div>'+
      '<div class="field-group" style="margin-top:.7rem"><label class="fl">POZNÁMKA PRO ČLENY</label><textarea id="bkNote" class="adm-ta" maxlength="300" style="min-height:70px" placeholder="např. Platbu pošli do 24 hodin."></textarea></div>'+
      '<label style="display:flex;gap:.4rem;align-items:center;margin-top:.6rem;font:.6rem \'Share Tech Mono\',monospace;color:var(--text);cursor:pointer"><input type="checkbox" id="bkDc" checked/> OZNÁMIT ZMĚNU NA DISCORDU</label>'+
      '<div id="bkMsg" class="smsg" style="margin-top:.4rem;min-height:1em;color:#e05555"></div>'+
      '<div class="modal-ftr"><button class="btn-acc small" id="bkOk">ULOŽIT</button><button class="btn-ghost small" id="bkNo">ZRUŠIT</button></div></div>';
    document.body.appendChild(ov);
    var N=ov.querySelector('#bkNum'),H=ov.querySelector('#bkHolder'),T=ov.querySelector('#bkNote'),P=ov.querySelector('#bkTpl'),V=ov.querySelector('#bkPrev');
    N.value=a.number||'';H.value=a.holder||'';T.value=a.note||'';P.value=tplOf(a);
    function prev(){var me=getMember(),t=me?fill(P.value,me):'';V.innerHTML=t?'Náhled pro tebe: <code>'+esc(t)+'</code>':'Náhled: bez předepsaného textu';}
    P.oninput=prev;prev();
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
      var data={number:num,holder:H.value.trim(),tpl:P.value.trim(),note:T.value.trim(),by:me.displayName,date:nowStr()};
      DB.set('bankacc',data);
      var dc=ov.querySelector('#bkDc').checked;
      addLog('fin',me.displayName+' změnil bankovní účet frakce'+(prevNum&&prevNum!==num?' ('+prevNum+' → '+num+')':'')+'.',dc?{
        embed:rich(C_YELLOW,'🏦 BANKOVNÍ ÚČET FRAKCE',data.note||null,[['🔢 Číslo účtu','`'+num+'`'],['👤 Majitel',data.holder||'—'],['📝 Text do poznámky',data.tpl?'`'+data.tpl+'`':'—'],['🧑 Změnil',me.displayName]],{by:me.displayName})
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
