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

  // 2) Počítání čísel v přehledech (+ karta ČLENOVÉ s limitem)
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

  // 6) Indikátor ztráty připojení
  var pill=document.createElement('div');pill.className='net-pill';pill.textContent='⚠ OFFLINE — změny se uloží po připojení';
  document.body.appendChild(pill);
  addEventListener('offline',function(){pill.classList.add('on');});
  addEventListener('online',function(){pill.classList.remove('on');toast('Připojeno ✓','success');if(window.DB)DB.flush();});
  if(!navigator.onLine)pill.classList.add('on');

  // 7) Vlastní okna ve stylu webu (nahrazují confirm / prompt / alert prohlížeče)
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
    // nebezpečné akce mají výchozí focus na Zrušit, aby se nespustily omylem
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

  // Funkce z app.js volají confirm() synchronně. Zavoláme je nanečisto (confirm vrátí false a zachytí text),
  // ukážeme vlastní okno a po potvrzení je zavoláme znovu, tentokrát s confirm = true.
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

  // totéž pro prompt()
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

  // 8) Limit členů frakce (server dovoluje max 16 lidí)
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
