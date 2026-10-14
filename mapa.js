// ── MAPA LOKACÍ (boosting / úkryty / heisty) ──
// Data: DB klíč 'mapPins' = [{id,type,name,note,x,y,by,byId,time,ts}]   (x,y = 0..1 poměr šířky/výšky mapy)
// Podkladová mapa: images/mapa.jpg (nebo .png/.webp). Bez ní se zobrazí schematická mapa.
(function(){
  var TYPES={
    boost:{ic:'🚗',lb:'BOOSTING',c:'#e67e22'},
    hide:{ic:'🏚️',lb:'ÚKRYT',c:'#27ae60'},
    heist:{ic:'💎',lb:'HEIST',c:'#4a90d9'}
  };
  var IMGS=['images/mapa.jpg','images/mapa.png','images/mapa.webp'];
  var W=1000,H=1300;
  var built=false,vp,world,pinLayer,popEl,hintEl,wrapEl,listEl;
  var s=1,tx=0,ty=0,fitS=1,minS=.5,maxS=8;
  var filt={boost:true,hide:true,heist:true},q='',addMode=false,selId=null,ghost=null;

  // log + ikona
  if(typeof SECTIONS!=='undefined'&&!SECTIONS.some(function(x){return x.key==='map';}))SECTIONS.push({key:'map',label:'Mapa lokací'});
  if(typeof LOG_ICONS!=='undefined')LOG_ICONS.map='📍';
  if(typeof MENU_GROUPS!=='undefined')MENU_GROUPS.mapa='B';

  function pins(){return DB.get('mapPins')||[];}
  function find(id){return pins().filter(function(p){return p.id===id;})[0]||null;}
  function canEdit(p){var m=getMember();return !!m&&(isAdmin()||p.byId===m.id);}

  // ── stavba rozhraní ──
  function build(){
    var root=document.getElementById('mapaRoot');if(!root||built)return;
    built=true;
    var chips=Object.keys(TYPES).map(function(k){return '<button class="wf on" data-f="'+k+'">'+TYPES[k].ic+' '+TYPES[k].lb+'<span class="cnt" id="mc-'+k+'"></span></button>';}).join('');
    root.innerHTML=
      '<div class="map-bar">'+chips+
      '<div class="iw" style="flex:1;min-width:150px;max-width:260px"><span class="ip">🔍</span><input type="text" id="mapQ" placeholder="Hledat lokaci…"/></div>'+
      '<span class="spacer"></span><button class="btn-acc small" id="mapAddBtn">＋ PŘIDAT PIN</button></div>'+
      '<div class="map-hint" id="mapHint">📍 Klikni na mapu tam, kde má pin být. (Esc = zrušit)</div>'+
      '<div class="map-wrap" id="mapWrap"><div class="map-vp" id="mapVp"><div class="map-world" id="mapWorld"><div id="mapPins"></div></div></div>'+
      '<div class="map-attrib">KOLEČKO / PINCH = ZOOM · TÁHNI = POSUN</div>'+
      '<div class="map-zoom"><button data-z="in" title="Přiblížit">+</button><button data-z="out" title="Oddálit">−</button><button data-z="fit" title="Celá mapa">⤢</button></div>'+
      '<div class="map-pop" id="mapPop"></div></div>'+
      '<div class="sh">// SEZNAM LOKACÍ</div><div class="map-list" id="mapList"></div>';
    vp=document.getElementById('mapVp');world=document.getElementById('mapWorld');pinLayer=document.getElementById('mapPins');
    popEl=document.getElementById('mapPop');hintEl=document.getElementById('mapHint');wrapEl=document.getElementById('mapWrap');listEl=document.getElementById('mapList');
    loadBase();
    bindEvents(root);
  }

  function setWorld(w,h){W=w;H=h;world.style.width=W+'px';world.style.height=H+'px';}
  function loadBase(){
    var i=0;
    setWorld(W,H);
    placeholder();
    (function tryNext(){
      if(i>=IMGS.length)return;
      var im=new Image(),src=IMGS[i++];
      im.onload=function(){
        var old=world.querySelector(':scope>img,:scope>svg');
        setWorld(im.naturalWidth,im.naturalHeight);
        im.draggable=false;world.insertBefore(im,world.firstChild);
        if(old)old.remove();
        fit();render();
      };
      im.onerror=tryNext;
      im.src=src;
    })();
  }
  // schematická mapa, dokud není nahraný images/mapa.jpg
  function placeholder(){
    var g='';for(var i=1;i<10;i++){g+='<line x1="'+i*100+'" y1="0" x2="'+i*100+'" y2="1300" /><line x1="0" y1="'+i*130+'" x2="1000" y2="'+i*130+'"/>';}
    var d=document.createElement('div');
    d.innerHTML='<svg viewBox="0 0 1000 1300" xmlns="http://www.w3.org/2000/svg"><rect width="1000" height="1300" fill="#0d1b24"/>'+
      '<g stroke="#15283a" stroke-width="1">'+g+'</g>'+
      '<path d="M120 60 L420 40 L700 120 L900 230 L880 420 L800 560 L700 700 L640 900 L560 1000 L420 980 L300 930 L220 820 L120 700 L70 520 L90 300 Z" fill="#1c2a1f" stroke="#2e4a35" stroke-width="3"/>'+
      '<path d="M250 640 L650 600 L700 760 L560 960 L330 920 Z" fill="#22252b" stroke="#3a3f48" stroke-width="2"/>'+
      '</svg>';
    world.insertBefore(d.firstChild,world.firstChild);
  }

  // ── pohled (zoom / posun) ──
  function clampS(v){return Math.max(minS,Math.min(maxS,v));}
  function apply(){
    var vw=vp.clientWidth,vh=vp.clientHeight,m=80;
    tx=Math.max(m-W*s,Math.min(vw-m,tx));ty=Math.max(m-H*s,Math.min(vh-m,ty));
    world.style.transform='translate('+tx+'px,'+ty+'px) scale('+s+')';
    world.style.setProperty('--inv',(1/s).toFixed(4));
  }
  function fit(){
    var vw=vp.clientWidth,vh=vp.clientHeight;if(!vw||!vh)return;
    fitS=Math.min(vw/W,vh/H);minS=fitS*.8;maxS=fitS*10;s=fitS;
    tx=(vw-W*s)/2;ty=(vh-H*s)/2;apply();
  }
  function zoomAt(cx,cy,f){var ns=clampS(s*f);tx=cx-(cx-tx)*(ns/s);ty=cy-(cy-ty)*(ns/s);s=ns;apply();}
  function focusOn(p){
    var vw=vp.clientWidth,vh=vp.clientHeight;
    s=clampS(Math.max(s,fitS*3));tx=vw/2-p.x*W*s;ty=vh/2-p.y*H*s;apply();
  }
  function toWorld(e){var r=vp.getBoundingClientRect();return {x:Math.max(0,Math.min(1,(e.clientX-r.left-tx)/s/W)),y:Math.max(0,Math.min(1,(e.clientY-r.top-ty)/s/H))};}

  // ── události ──
  function bindEvents(root){
    var ptrs={},start=null,pinch=null;
    function cnt(){return Object.keys(ptrs).length;}
    vp.addEventListener('pointerdown',function(e){
      ptrs[e.pointerId]={x:e.clientX,y:e.clientY};
      if(cnt()===1)start={x:e.clientX,y:e.clientY,tx:tx,ty:ty,moved:false,target:e.target};
      else if(cnt()===2){
        var a=Object.keys(ptrs).map(function(k){return ptrs[k];});
        pinch={d:Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y)||1};if(start)start.moved=true;
      }
    });
    vp.addEventListener('pointermove',function(e){
      if(!ptrs[e.pointerId])return;
      ptrs[e.pointerId]={x:e.clientX,y:e.clientY};
      if(cnt()>=2&&pinch){
        var a=Object.keys(ptrs).map(function(k){return ptrs[k];}),d=Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y)||1,r=vp.getBoundingClientRect();
        zoomAt((a[0].x+a[1].x)/2-r.left,(a[0].y+a[1].y)/2-r.top,d/pinch.d);pinch.d=d;return;
      }
      if(!start)return;
      var dx=e.clientX-start.x,dy=e.clientY-start.y;
      if(!start.moved&&Math.hypot(dx,dy)>5){start.moved=true;try{vp.setPointerCapture(e.pointerId);}catch(x){}vp.classList.add('drag');}
      if(start.moved){tx=start.tx+dx;ty=start.ty+dy;apply();}
    });
    function up(e){
      if(!ptrs[e.pointerId])return;
      delete ptrs[e.pointerId];
      if(cnt()===0){
        var wasClick=start&&!start.moved;
        vp.classList.remove('drag');
        if(wasClick&&e.type==='pointerup')clicked(start.target,e);
        start=null;pinch=null;
      }else if(cnt()===1){
        var k=Object.keys(ptrs)[0];start={x:ptrs[k].x,y:ptrs[k].y,tx:tx,ty:ty,moved:true,target:null};pinch=null;
      }
    }
    vp.addEventListener('pointerup',up);vp.addEventListener('pointercancel',up);
    vp.addEventListener('wheel',function(e){
      e.preventDefault();var r=vp.getBoundingClientRect();
      zoomAt(e.clientX-r.left,e.clientY-r.top,Math.exp(-e.deltaY*.0015));
    },{passive:false});
    root.querySelector('.map-zoom').addEventListener('click',function(e){
      var z=e.target.getAttribute&&e.target.getAttribute('data-z');if(!z)return;
      var cx=vp.clientWidth/2,cy=vp.clientHeight/2;
      if(z==='in')zoomAt(cx,cy,1.5);else if(z==='out')zoomAt(cx,cy,1/1.5);else fit();
    });
    root.querySelector('.map-bar').addEventListener('click',function(e){
      var b=e.target.closest('[data-f]');
      if(b){var k=b.getAttribute('data-f');filt[k]=!filt[k];render();}
    });
    document.getElementById('mapQ').addEventListener('input',function(){q=normS(this.value);render();});
    document.getElementById('mapAddBtn').onclick=function(){setAdd(!addMode);};
    listEl.addEventListener('click',function(e){
      var li=e.target.closest('[data-id]');if(!li)return;
      var p=find(li.getAttribute('data-id'));if(!p)return;
      filt[p.type]=true;focusOn(p);openPop(p.id);render();
      wrapEl.scrollIntoView({behavior:'smooth',block:'nearest'});
    });
    popEl.addEventListener('click',function(e){
      var a=e.target.getAttribute&&e.target.getAttribute('data-a');if(!a)return;
      var p=find(selId);
      if(a==='close')closePop();
      else if(p&&a==='edit')openForm(p);
      else if(p&&a==='del')delPin(p);
    });
    window.addEventListener('resize',function(){if(built&&vp.clientWidth)apply();});
    document.addEventListener('keydown',function(e){
      if(e.key==='Escape'&&built){if(addMode)setAdd(false);else closePop();}
    });
  }
  function clicked(target,e){
    var pe=target&&target.closest?target.closest('.map-pin'):null;
    if(pe&&!pe.classList.contains('ghost')){openPop(pe.getAttribute('data-id'));return;}
    if(addMode){var w=toWorld(e);setAdd(false);showGhost(w);openForm(null,w);return;}
    closePop();
  }
  function setAdd(on){
    addMode=on;wrapEl.classList.toggle('adding',on);hintEl.classList.toggle('on',on);
    var b=document.getElementById('mapAddBtn');if(b)b.textContent=on?'✕ ZRUŠIT':'＋ PŘIDAT PIN';
    if(on)closePop();
  }
  function showGhost(w){
    hideGhost();ghost=document.createElement('div');ghost.className='map-pin ghost';
    ghost.style.cssText='left:'+w.x*W+'px;top:'+w.y*H+'px;--pc:var(--acc)';
    ghost.innerHTML='<div class="pb"><span>📍</span></div>';pinLayer.appendChild(ghost);
  }
  function hideGhost(){if(ghost&&ghost.parentNode)ghost.parentNode.removeChild(ghost);ghost=null;}

  // ── vykreslení pinů + seznamu ──
  function render(){
    if(!built)return;
    var all=pins(),vis=all.filter(function(p){
      if(!TYPES[p.type]||!filt[p.type])return false;
      return !q||normS(p.name+' '+(p.note||'')+' '+(p.by||'')).indexOf(q)!==-1;
    });
    Object.keys(TYPES).forEach(function(k){
      var c=document.getElementById('mc-'+k);if(c)c.textContent=all.filter(function(p){return p.type===k;}).length;
      var b=document.querySelector('.map-bar [data-f="'+k+'"]');if(b)b.classList.toggle('on',filt[k]);
    });
    pinLayer.querySelectorAll('.map-pin:not(.ghost)').forEach(function(n){n.remove();});
    vis.forEach(function(p){
      var t=TYPES[p.type],d=document.createElement('div');
      d.className='map-pin'+(p.id===selId?' sel':'');d.setAttribute('data-id',p.id);
      d.style.cssText='left:'+p.x*W+'px;top:'+p.y*H+'px;--pc:'+t.c;
      d.innerHTML='<div class="pb"><span>'+t.ic+'</span></div><div class="pl">'+esc(p.name)+'</div>';
      pinLayer.appendChild(d);
    });
    var sorted=vis.slice().sort(function(a,b){return (b.ts||0)-(a.ts||0);});
    listEl.innerHTML=sorted.length?sorted.map(function(p){
      var t=TYPES[p.type];
      return '<div class="map-li" data-id="'+esc(p.id)+'" style="--pc:'+t.c+'"><span class="ic">'+t.ic+'</span><div class="tx"><b>'+esc(p.name)+'</b><small>'+t.lb+' · '+esc(p.by||'?')+' · '+esc(p.time||'')+'</small></div></div>';
    }).join(''):'<div class="map-empty">// ZATÍM ŽÁDNÉ LOKACE — přidej první pin</div>';
    if(selId){var cur=find(selId);if(!cur||!filt[cur.type])closePop();else openPop(selId,true);}
  }

  // ── detail pinu ──
  function openPop(id,keep){
    var p=find(id);if(!p){closePop();return;}
    selId=id;var t=TYPES[p.type]||TYPES.boost;
    popEl.style.setProperty('--pc',t.c);
    popEl.innerHTML='<div class="mp-t">'+t.ic+' '+t.lb+'</div><div class="mp-n">'+esc(p.name)+'</div>'+
      (p.note?'<div class="mp-d">'+esc(p.note)+'</div>':'')+
      '<div class="mp-m">PŘIDAL: '+esc(p.by||'?')+' · '+esc(p.time||'')+'</div>'+
      '<div class="mp-b">'+(canEdit(p)?'<button class="btn-acc small" data-a="edit">✎ UPRAVIT</button><button class="btn-danger" data-a="del">SMAZAT</button>':'')+'<button class="btn-ghost small" data-a="close">ZAVŘÍT</button></div>';
    popEl.classList.add('on');
    if(!keep)pinLayer.querySelectorAll('.map-pin').forEach(function(n){n.classList.toggle('sel',n.getAttribute('data-id')===id);});
  }
  function closePop(){
    selId=null;if(popEl)popEl.classList.remove('on');
    if(pinLayer)pinLayer.querySelectorAll('.map-pin.sel').forEach(function(n){n.classList.remove('sel');});
  }

  // ── formulář (nový / úprava) ──
  function openForm(p,pos){
    var old=document.querySelector('.map-form-ov');if(old)old.remove();
    var type=p?p.type:'boost';
    var ov=document.createElement('div');ov.className='modal-ov map-form-ov';
    ov.setAttribute('role','dialog');ov.setAttribute('aria-modal','true');
    ov.innerHTML='<div class="modal-box map-form"><div class="modal-title">'+(p?'✎ UPRAVIT LOKACI':'📍 NOVÁ LOKACE')+'</div>'+
      '<div class="field-group"><label class="fl">TYP</label><div class="map-types">'+
        Object.keys(TYPES).map(function(k){return '<button type="button" class="wf'+(k===type?' on':'')+'" data-t="'+k+'">'+TYPES[k].ic+' '+TYPES[k].lb+'</button>';}).join('')+'</div></div>'+
      '<div class="field-group" style="margin-top:.7rem"><label class="fl">NÁZEV *</label><div class="iw"><span class="ip">&gt;_</span><input type="text" id="mfName" maxlength="60" placeholder="např. Garáž u přístavu, Fleeca Route 68…"/></div></div>'+
      '<div class="field-group" style="margin-top:.7rem"><label class="fl">POZNÁMKA</label><textarea id="mfNote" class="adm-ta" maxlength="400" placeholder="Co tu je, jak se tam dostat, na co si dát pozor…"></textarea></div>'+
      '<div class="modal-ftr"><button class="btn-acc small" id="mfOk">ULOŽIT</button><button class="btn-ghost small" id="mfNo">ZRUŠIT</button></div></div>';
    document.body.appendChild(ov);
    var nm=ov.querySelector('#mfName'),nt=ov.querySelector('#mfNote');
    if(p){nm.value=p.name;nt.value=p.note||'';}
    ov.querySelectorAll('[data-t]').forEach(function(b){b.onclick=function(){
      type=b.getAttribute('data-t');ov.querySelectorAll('[data-t]').forEach(function(x){x.classList.toggle('on',x===b);});};});
    function close(){hideGhost();document.removeEventListener('keydown',key,true);ov.remove();}
    function key(e){if(e.key==='Escape'){e.stopPropagation();close();}}
    document.addEventListener('keydown',key,true);
    ov.querySelector('#mfNo').onclick=close;
    ov.addEventListener('mousedown',function(e){if(e.target===ov)close();});
    ov.querySelector('#mfOk').onclick=function(){
      var name=nm.value.trim(),note=nt.value.trim();
      if(!name){toast('Zadej název lokace','error');nm.focus();return;}
      save(p,pos,type,name,note);close();
    };
    nm.focus();
  }
  function save(p,pos,type,name,note){
    var m=getMember();if(!m)return;
    var arr=pins();
    if(p){
      var cur=arr.filter(function(x){return x.id===p.id;})[0];if(!cur){toast('Pin už neexistuje','error');return;}
      cur.type=type;cur.name=name;cur.note=note;
      DB.set('mapPins',arr);
      addLog('map','Upravil lokaci „'+name+'" ('+TYPES[type].lb+').',{noDiscord:true});
      toast('Lokace upravena','success');render();openPop(cur.id);
    }else{
      var np={id:uid(),type:type,name:name,note:note,x:pos.x,y:pos.y,by:m.displayName,byId:m.id,time:nowStr(),ts:Date.now()};
      arr.push(np);DB.set('mapPins',arr);
      addLog('map','Přidal lokaci „'+name+'" ('+TYPES[type].lb+').',{noDiscord:true});
      filt[type]=true;toast('Lokace přidána','success');render();openPop(np.id);
    }
  }
  function delPin(p){
    function go(){
      var arr=pins().filter(function(x){return x.id!==p.id;});
      DB.set('mapPins',arr);
      addLog('map','Smazal lokaci „'+p.name+'" ('+(TYPES[p.type]||{}).lb+').',{noDiscord:true});
      closePop();toast('Lokace smazána','success');render();
    }
    if(window.tscDialog)tscDialog({title:'⚠ SMAZAT LOKACI?',text:'<b>'+esc(p.name)+'</b><div class="tsc-sub">Tuto akci nelze vrátit.</div>',ok:'SMAZAT',danger:true,cancel:'ZRUŠIT'},go);
    else if(confirm('Smazat lokaci „'+p.name+'"?'))go();
  }

  // ── napojení na app.js ──
  function show(){
    build();if(!built)return;
    requestAnimationFrame(function(){
      if(!vp.clientWidth)return;
      if(!vp.dataset.fitted){fit();vp.dataset.fitted='1';}
      render();
    });
  }
  var _mt=window.mTab;
  window.mTab=function(tab){var r=_mt.apply(this,arguments);if(tab==='mapa')show();return r;};
  if(typeof M_RENDER!=='undefined')M_RENDER.mapa=function(){render();};
})();
