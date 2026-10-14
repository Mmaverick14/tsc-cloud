// ── ZMĚNA VLASTNÍHO HESLA ČLENEM ──
// - tlačítko 🔑 v postranním panelu (kdykoli)
// - po přihlášení se členovi, který si heslo ještě nezměnil, ukáže okno s výzvou (jde odložit, příště se ukáže znovu)
// Heslo se mění přímo přes Supabase (sb.auth.updateUser) pro přihlášený účet; nikam se neloguje ani neukládá.
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

  // tlačítko v postranním panelu
  setInterval(function(){
    var f=document.querySelector('#memberScreen .sb-foot');
    if(!f||f.querySelector('.pw-self-btn'))return;
    var bt=document.createElement('button');bt.className='btn-back pw-self-btn';bt.textContent='🔑 ZMĚNIT HESLO';
    bt.style.marginBottom='.4rem';bt.onclick=function(){openPw(false);};
    f.insertBefore(bt,f.querySelector('.btn-back'));
  },1000);

  // výzva po přihlášení
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
