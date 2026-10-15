// ── LUXUS: jemné interakce nad app.js (nic nepřepisuje, jen přidává) ──
(function(){
  var reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
  function norm(s){return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();}

  // 1) Světlo sledující kurzor na kartách
  var SEL='.dc,.board-post,.heist-card,.task-card,.ev-card,.member-card,.wh-item,.form-panel',raf=0,px,py,pt;
  document.addEventListener('pointermove',function(e){
    if(e.pointerType==='touch')return;
    px=e.clientX;py=e.clientY;pt=e.target;
    if(raf)return;
    raf=requestAnimationFrame(function(){
      raf=0;var c=pt&&pt.closest&&pt.closest(SEL);if(!c)return;
      var r=c.getBoundingClientRect();
      c.style.setProperty('--mx',(px-r.left)+'px');c.style.setProperty('--my',(py-r.top)+'px');
    });
  },{passive:true});

  // 2) Paleta příkazů (Ctrl/Cmd + K): rychlý skok na libovolnou záložku
  var pal=null,prevFocus=null;
  function items(){
    var ms=document.getElementById('memberScreen');
    if(!ms||ms.classList.contains('hidden'))return [];
    var out=[].slice.call(ms.querySelectorAll('.sb-nav .nb')).filter(function(b){return !b.classList.contains('hidden');}).map(function(b){
      var i=b.querySelector('.ni'),l=b.querySelector('.nl');
      return {ic:i?i.textContent:'•',label:l?l.textContent:b.textContent,run:function(){b.click();}};
    });
    if(typeof window.openPwSelf==='function')out.push({ic:'🔑',label:'ZMĚNIT HESLO',run:function(){window.openPwSelf(false);}});
    return out;
  }
  function closePal(){
    if(!pal)return;pal.remove();pal=null;
    if(prevFocus&&prevFocus.focus)prevFocus.focus();
  }
  function openPal(){
    var all=items();if(!all.length||pal)return;
    prevFocus=document.activeElement;
    pal=document.createElement('div');pal.className='lux-pal';pal.setAttribute('role','dialog');pal.setAttribute('aria-modal','true');
    pal.innerHTML='<div class="lux-pal-box"><input class="lux-pal-in" placeholder="Kam chceš skočit…" aria-label="Hledat záložku"/><div class="lux-pal-list"></div><div class="lux-pal-foot">↑↓ vybrat · Enter otevřít · Esc zavřít</div></div>';
    document.body.appendChild(pal);
    var inp=pal.querySelector('input'),list=pal.querySelector('.lux-pal-list'),cur=0,shown=[];
    function draw(){
      var q=norm(inp.value);
      shown=all.filter(function(x){return !q||norm(x.label).indexOf(q)!==-1;});
      if(cur>=shown.length)cur=Math.max(0,shown.length-1);
      list.innerHTML='';
      if(!shown.length){list.innerHTML='<div class="lux-pal-none">Nic nenalezeno</div>';return;}
      shown.forEach(function(x,i){
        var b=document.createElement('button');b.className='lux-pal-it'+(i===cur?' on':'');
        b.innerHTML='<span>'+x.ic+'</span><span></span>';b.lastChild.textContent=x.label;
        b.onclick=function(){closePal();x.run();};
        b.onmouseenter=function(){cur=i;draw();};
        list.appendChild(b);
      });
      var on=list.querySelector('.on');if(on&&on.scrollIntoView)on.scrollIntoView({block:'nearest'});
    }
    inp.oninput=function(){cur=0;draw();};
    inp.onkeydown=function(e){
      if(e.key==='ArrowDown'){e.preventDefault();cur=Math.min(shown.length-1,cur+1);draw();}
      else if(e.key==='ArrowUp'){e.preventDefault();cur=Math.max(0,cur-1);draw();}
      else if(e.key==='Enter'&&shown[cur]){e.preventDefault();var x=shown[cur];closePal();x.run();}
      else if(e.key==='Escape'){e.stopPropagation();closePal();}
    };
    pal.addEventListener('mousedown',function(e){if(e.target===pal)closePal();});
    draw();inp.focus();
  }
  document.addEventListener('keydown',function(e){
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();pal?closePal():openPal();}
  },true);

  // tlačítko v postranním panelu
  setInterval(function(){
    var f=document.querySelector('#memberScreen .sb-foot');
    if(!f||f.querySelector('.lux-k'))return;
    var b=document.createElement('button');b.className='lux-k';b.innerHTML='<span>⌕ HLEDAT</span><kbd>Ctrl K</kbd>';
    b.onclick=openPal;f.insertBefore(b,f.firstChild);
  },1000);

  // 3) Zlatý prach na přihlašovací obrazovce (běží jen když je vidět)
  var scr=document.getElementById('selectScreen');
  if(scr&&!reduce){
    var cv=document.createElement('canvas');cv.id='luxDust';scr.insertBefore(cv,scr.firstChild);
    var cx=cv.getContext('2d'),W=0,H=0,P=[],N=46;
    function size(){var d=Math.min(2,devicePixelRatio||1);W=cv.width=innerWidth*d;H=cv.height=innerHeight*d;}
    function rgb(){var h=(getComputedStyle(document.documentElement).getPropertyValue('--acc')||'#c49a14').trim().replace('#','');
      if(h.length===3)h=h.replace(/(.)/g,'$1$1');var n=parseInt(h,16);return isNaN(n)?'196,154,20':((n>>16)&255)+','+((n>>8)&255)+','+(n&255);}
    size();addEventListener('resize',size);
    for(var i=0;i<N;i++)P.push({x:Math.random(),y:Math.random(),r:Math.random()*1.6+.4,v:Math.random()*.00014+.00004,a:Math.random()*.5+.15,p:Math.random()*6.28});
    var col=rgb(),fr=0;
    (function loop(t){
      if(!scr.classList.contains('active')||document.hidden){setTimeout(function(){requestAnimationFrame(loop);},400);return;}
      if(++fr%90===0)col=rgb();
      cx.clearRect(0,0,W,H);
      P.forEach(function(q){
        q.y-=q.v*16;q.x+=Math.sin(t/3000+q.p)*.0003;
        if(q.y<-.02){q.y=1.02;q.x=Math.random();}
        cx.beginPath();cx.fillStyle='rgba('+col+','+(q.a*(.6+.4*Math.sin(t/900+q.p)))+')';
        cx.arc(q.x*W,q.y*H,q.r*(W/innerWidth),0,6.283);cx.fill();
      });
      requestAnimationFrame(loop);
    })(0);
  }
})();

// ── LUXUS 2 ──
(function(){
  // plovoucí zlatý indikátor aktivní záložky
  function indicator(){
    var nav=document.querySelector('#memberScreen .sb-nav');if(!nav)return;
    var ind=nav.querySelector('.lux-ind');
    if(!ind){
      ind=document.createElement('i');ind.className='lux-ind';nav.appendChild(ind);
      ind._mv=function(){
        var a=nav.querySelector('.nb.active');
        if(!a||!a.offsetHeight){ind.style.opacity=0;return;}
        ind.style.opacity=1;ind.style.height=a.offsetHeight+'px';ind.style.transform='translateY('+a.offsetTop+'px)';
      };
      new MutationObserver(ind._mv).observe(nav,{subtree:true,attributes:true,attributeFilter:['class']});
      addEventListener('resize',ind._mv);
    }
    ind._mv();
  }
  // uvítání podle denní doby
  function hello(){
    var ph=document.querySelector('#mt-board .ph'),nm=document.getElementById('sbName');
    if(!ph||!nm||!nm.textContent.trim())return;
    var h=new Date().getHours(),g=h<5?'Dobrou noc':h<10?'Dobré ráno':h<18?'Dobrý den':'Dobrý večer';
    var el=document.querySelector('.lux-hello');
    if(!el){el=document.createElement('div');el.className='lux-hello';ph.after(el);}
    var t=g+', '+nm.textContent.trim();
    if(el.dataset.t!==t){el.dataset.t=t;el.innerHTML='';
      var b=document.createElement('b');b.textContent=nm.textContent.trim();
      el.appendChild(document.createTextNode(g+', '));el.appendChild(b);
      var s=document.createElement('small');s.textContent='ALT + 1–9 PŘEPÍNÁ ZÁLOŽKY · CTRL + K HLEDÁ';el.appendChild(s);}
  }
  setInterval(function(){indicator();hello();},800);
  // Alt + číslo = záložka podle pořadí v menu
  document.addEventListener('keydown',function(e){
    if(!e.altKey||e.ctrlKey||e.metaKey||!/^[1-9]$/.test(e.key))return;
    var ms=document.getElementById('memberScreen');if(!ms||ms.classList.contains('hidden'))return;
    var b=[].slice.call(ms.querySelectorAll('.sb-nav .nb')).filter(function(x){return !x.classList.contains('hidden');})[+e.key-1];
    if(b){e.preventDefault();b.click();}
  });
})();
