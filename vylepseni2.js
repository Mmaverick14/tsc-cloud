/* ══ VYLEPŠENÍ 2 — načíst PŘED tsc.js ══
   1) úspora procesoru: časovače se nepouštějí, když je karta skrytá, a rychlé se zpomalí na 2 s
   2) blok „Dnes“ na Oznámeních
   3) světlý/tmavý režim
   4) připomínka zálohy pro Mastermind                                                        */

/* 1) ÚSPORA VÝKONU — musí běžet dřív než tsc.js */
(function(){
  var _si=window.setInterval;
  window.setInterval=function(fn,ms){
    var rest=[].slice.call(arguments,2);
    if(typeof fn==='function'&&ms<5000){
      if(ms>1000&&ms<2000)ms=2000;          // 800–1500 ms smyčky → 2 s (1000 ms hodiny zůstanou)
      var f=fn;
      fn=function(){if(document.hidden)return;return f.apply(this,arguments);};
    }
    return _si.apply(window,[fn,ms].concat(rest));
  };
})();

/* 3) SVĚTLÝ REŽIM — aplikuje se hned, ať neprobliká */
(function(){
  var K='tsc_mode';
  function get(){try{return localStorage.getItem(K)==='light'?'light':'dark';}catch(e){return 'dark';}}
  function apply(m){
    if(m==='light')document.documentElement.setAttribute('data-mode','light');
    else document.documentElement.removeAttribute('data-mode');
    var tc=document.querySelector('meta[name=theme-color]');if(tc)tc.content=m==='light'?'#f4f1e8':'#080808';
  }
  apply(get());
  function toggle(){
    var n=get()==='light'?'dark':'light';
    try{localStorage.setItem(K,n);}catch(e){}
    apply(n);
  }
  setInterval(function(){
    document.querySelectorAll('.sb-tools').forEach(function(w){
      if(w.querySelector('.tb.mode'))return;
      var b=document.createElement('button');b.className='tb mode';b.title='Světlý / tmavý režim';
      b.setAttribute('aria-label','Světlý nebo tmavý režim');b.textContent='🌓';b.onclick=toggle;w.appendChild(b);
    });
  },2000);
})();

/* 2) BLOK „DNES“ */
(function(){
  function $(id){return document.getElementById(id);}
  function build(){
    if(typeof getMember!=='function')return null;
    var m=getMember();if(!m)return null;
    var it=[];
    var tasks=((DB.get('tasks')||{})[m.id]||[]).filter(function(t){return !t.done;});
    it.push({i:'📋',t:tasks.length?tasks.length+' otevřených úkolů':'Žádné úkoly',s:tasks.length?tasks[0].title:'Máš splněno',c:tasks.length?'warn':'ok',go:'tasks'});

    var fs=DB.get('finsettings')||{weeklyFee:0},fin=DB.get('finance')||{payments:[]},wk=getWeekKey(),fee=Number(fs.weeklyFee)||0;
    if(fee>0&&!m.hidden){
      var vac=window.onVacation&&window.onVacation(m.id,wk);
      var paid=(fin.payments||[]).some(function(p){return p.memberId===m.id&&p.weekKey===wk&&(p.expenseId==='weekly'||!p.expenseId);});
      if(vac)it.push({i:'🌴',t:'Dovolená',s:'Příspěvek tento týden neplatíš',c:'ok',go:'finance'});
      else it.push({i:paid?'✅':'⏰',t:paid?'Příspěvek zaplacen':'Zbývá zaplatit '+money(fee),s:paid?'Tento týden hotovo':'Klikni a zaplať',c:paid?'ok':'warn',go:'finance'});
    }

    var now=Date.now(),next=(DB.get('events')||[]).map(function(e){return {e:e,d:evStart(e)};})
      .filter(function(x){return x.d&&x.d.getTime()>now-2*3600000;}).sort(function(a,b){return a.d-b.d;})[0];
    if(next){
      var mine=(next.e.rsvp||{})[m.id];
      it.push({i:'📅',t:next.e.title,s:fmtEv(next.d)+' · '+untilStr(next.d)+(mine?'':' · bez odpovědi'),c:mine?'':'warn',go:'calendar'});
    }else it.push({i:'📅',t:'Žádná akce',s:'Kalendář je prázdný',c:'',go:'calendar'});

    var conf=DB.get('boardConfirmed')||{};
    var need=(DB.get('board')||[]).filter(function(p){return p.type==='confirm'&&!(conf[p.id]&&conf[p.id].indexOf(m.id)!==-1);});
    if(need.length)it.push({i:'✓',t:need.length+' k potvrzení',s:need[0].title,c:'warn',go:'board'});

    return '<h3>// DNES PRO TEBE</h3><div class="today-list">'+it.map(function(x){
      return '<button type="button" class="today-it '+x.c+'" data-go="'+x.go+'"><span class="i">'+x.i+'</span><span><b>'+esc(x.t)+'</b><small>'+esc(x.s)+'</small></span></button>';
    }).join('')+'</div>';
  }
  function paint(){
    var tab=$('mt-board');if(!tab||!tab.classList.contains('active'))return;
    var h;try{h=build();}catch(e){return;}
    if(h===null)return;
    var box=$('todayBox');
    if(!box){box=document.createElement('div');box.id='todayBox';box.className='dnes-box';
      var anchor=$('dashM');if(!anchor)return;anchor.before(box);
      box.addEventListener('click',function(e){var b=e.target.closest('[data-go]');if(b&&typeof goNav==='function')goNav('m',b.getAttribute('data-go'));});}
    if(box.dataset.h!==h){box.dataset.h=h;box.innerHTML=h;}
  }
  setInterval(paint,2000);
})();

/* 4) PŘIPOMÍNKA ZÁLOHY (Mastermind, max. 1× za 7 dní) */
(function(){
  var K='tsc_backup_nag';
  setInterval(function(){
    if(typeof getMember!=='function'||typeof toast!=='function')return;
    var m=getMember();if(!m||m.position!=='Mastermind')return;
    var last=0;try{last=+localStorage.getItem(K)||0;}catch(e){}
    if(Date.now()-last<7*864e5)return;
    try{localStorage.setItem(K,String(Date.now()));}catch(e){}
    toast('💾 Tip: stáhni si zálohu dat (Administrace → Nastavení → Záloha)','info',8000);
  },20000);
})();
