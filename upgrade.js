// ── UPGRADE: doplňky nad app.js ──
(function(){
  // 1) Oprava plateb (jména s apostrofem rozbíjela onclick)
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

  // 2) Počítání čísel v přehledech
  var _rd=window.renderDash;
  window.renderDash=function(){
    _rd();
    document.querySelectorAll('.dc-val').forEach(function(el){
      var n=el.firstChild&&el.firstChild.nodeType===3?parseInt(el.firstChild.nodeValue,10):NaN;
      if(isNaN(n)||n<1||n>9999||el.dataset.v==String(n))return;
      el.dataset.v=n;var t0=performance.now();
      (function f(t){var k=Math.min(1,(t-t0)/600);el.firstChild.nodeValue=Math.round(n*(1-Math.pow(1-k,3)));if(k<1)requestAnimationFrame(f);})(t0);
    });
  };

  // 3) Hledání v logu
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

  // 4) Záloha dat (jen Mastermind) v Nastavení
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

  // 5) Barevné motivy (pamatuje si prohlížeč)
  var TH=[['Zlatá','#c49a14','#7a6010'],['Červená','#d44a3a','#8a2a20'],['Modrá','#4a90d9','#2a5a8a'],['Zelená','#27ae60','#1a5e30'],['Fialová','#b070d9','#6a3a8a']];
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

  // 6) Indikátor ztráty připojení
  var pill=document.createElement('div');pill.className='net-pill';pill.textContent='⚠ OFFLINE — změny se uloží po připojení';
  document.body.appendChild(pill);
  addEventListener('offline',function(){pill.classList.add('on');});
  addEventListener('online',function(){pill.classList.remove('on');toast('Připojeno ✓','success');if(window.DB)DB.flush();});
  if(!navigator.onLine)pill.classList.add('on');
})();
