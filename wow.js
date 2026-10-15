// ── WOW: holografický průkaz · zlatý déšť · puls frakce (nic nepřepisuje, jen obaluje) ──
(function(){
  var reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ═══ 1) HOLOGRAFICKÝ PRŮKAZ ČLENA ═══ */
  function holo(box){
    if(box.dataset.holo)return;box.dataset.holo='1';
    box.addEventListener('pointermove',function(e){
      if(e.pointerType==='touch')return;
      var r=box.getBoundingClientRect(),x=(e.clientX-r.left)/r.width,y=(e.clientY-r.top)/r.height;
      box.style.setProperty('--hx',(x*100)+'%');box.style.setProperty('--hy',(y*100)+'%');
      box.style.setProperty('--fx',(x*100)+'%');
      if(!reduce){box.style.setProperty('--rx',((.5-y)*7).toFixed(2)+'deg');box.style.setProperty('--ry',((x-.5)*9).toFixed(2)+'deg');}
    });
    box.addEventListener('pointerleave',function(){
      box.style.setProperty('--rx','0deg');box.style.setProperty('--ry','0deg');box.style.setProperty('--fx','-30%');
    });
  }
  new MutationObserver(function(list){
    list.forEach(function(m){m.addedNodes.forEach(function(n){
      if(n.nodeType===1&&n.classList&&n.classList.contains('prof-ov')){var b=n.querySelector('.prof-box');if(b)holo(b);}
    });});
  }).observe(document.body,{childList:true});

  /* ═══ 2) ZLATÝ DÉŠŤ ═══ */
  var cv=null,cx=null,parts=[],run=false,W=0,H=0,D=1;
  function rgb(){
    var h=(getComputedStyle(document.documentElement).getPropertyValue('--acc')||'#c49a14').trim().replace('#','');
    if(h.length===3)h=h.replace(/(.)/g,'$1$1');var n=parseInt(h,16);
    return isNaN(n)?[196,154,20]:[(n>>16)&255,(n>>8)&255,n&255];
  }
  function palette(){
    var c=rgb(),lt=c.map(function(v){return Math.round(v+(255-v)*.55);}),dk=c.map(function(v){return Math.round(v*.7);});
    return [c,lt,dk,[255,248,225]].map(function(a){return 'rgb('+a.join(',')+')';});
  }
  function size(){D=Math.min(2,devicePixelRatio||1);W=innerWidth;H=innerHeight;cv.width=W*D;cv.height=H*D;cx.setTransform(D,0,0,D,0,0);}
  function mk(x,y,vx,vy,g,cols,rain){
    return {x:x,y:y,vx:vx,vy:vy,g:g,w:5+Math.random()*7,h:4+Math.random()*6,r:Math.random()*6.28,vr:(Math.random()-.5)*.3,
      c:cols[Math.floor(Math.random()*cols.length)],coin:Math.random()<.35,ph:Math.random()*6.28,vp:.08+Math.random()*.12,rain:rain};
  }
  function burst(){
    if(reduce)return;
    if(!cv){cv=document.createElement('canvas');cv.id='wowConfetti';document.body.appendChild(cv);cx=cv.getContext('2d');size();}
    var cols=palette(),i;
    for(i=0;i<150;i++)parts.push(mk(Math.random()*W,-20-Math.random()*H*.5,(Math.random()-.5)*2.4,1.5+Math.random()*3.5,.045,cols,true));
    for(i=0;i<55;i++){
      parts.push(mk(0,H,3+Math.random()*7,-(11+Math.random()*9),.26,cols,false));
      parts.push(mk(W,H,-(3+Math.random()*7),-(11+Math.random()*9),.26,cols,false));
    }
    if(!run){run=true;requestAnimationFrame(loop);}
  }
  function loop(){
    if(!cv)return;
    cx.clearRect(0,0,W,H);
    parts=parts.filter(function(p){return p.y<H+30;});
    parts.forEach(function(p){
      p.vy+=p.g;p.vx*=p.rain?.998:.985;if(!p.rain)p.vy*=.99;
      p.x+=p.vx+Math.sin(p.ph)*(p.rain?.6:0);p.y+=p.vy;p.r+=p.vr;p.ph+=p.vp;
      cx.fillStyle=p.c;
      if(p.coin){cx.beginPath();cx.ellipse(p.x,p.y,Math.max(.6,Math.abs(Math.cos(p.ph))*p.w/1.5),p.w/1.5,0,0,6.283);cx.fill();}
      else{cx.save();cx.translate(p.x,p.y);cx.rotate(p.r);cx.scale(1,Math.abs(Math.cos(p.ph))*.9+.1);cx.fillRect(-p.w/2,-p.h/2,p.w,p.h);cx.restore();}
    });
    if(!parts.length){run=false;cv.remove();cv=null;cx=null;return;}
    requestAnimationFrame(loop);
  }
  window.tscBurst=burst;
  addEventListener('resize',function(){if(cv)size();});
  var _t=window.toast;
  if(typeof _t==='function'){
    window.toast=function(msg){
      var r=_t.apply(this,arguments);
      try{
        var s=String(msg||'');
        if(/^Pochvala odeslána/.test(s)||/^Povýšeno na/.test(s))burst();
        else if(/^Heist report odeslán/.test(s)){var a=DB.get('heists')||[],h=a[a.length-1];if(h&&h.escaped)burst();}
      }catch(e){}
      return r;
    };
  }

  /* ═══ 3) PULS FRAKCE (kruhové ukazatele ve Statistikách) ═══ */
  var prev={},C=251.33;
  function pct(a,b){return b?Math.round(a/b*100):null;}
  function data(){
    var heists=DB.get('heists')||[],ok=heists.filter(function(h){return h.escaped;}).length;
    var ms=(DB.get('members')||[]).filter(function(m){return !m.hidden;});
    var fin=DB.get('finance')||{payments:[]},wk=getWeekKey();
    var paid=ms.filter(function(m){return (fin.payments||[]).some(function(p){return p.memberId===m.id&&p.weekKey===wk&&(p.expenseId==='weekly'||!p.expenseId);});}).length;
    var wh=DB.get('warehouse')||[],good=wh.filter(function(i){return !(i.qty===0||(i.min>0&&i.qty<=i.min));}).length;
    var came=0,abs=0;
    (DB.get('events')||[]).forEach(function(e){Object.keys(e.att||{}).forEach(function(k){if(e.att[k]==='came')came++;else if(e.att[k]==='absent')abs++;});});
    return [
      {k:'heist',ic:'💎',l:'ÚSPĚŠNOST HEISTŮ',p:pct(ok,heists.length),s:ok+' z '+heists.length+' ujelo'},
      {k:'pay',ic:'💵',l:'PŘÍSPĚVKY TENTO TÝDEN',p:pct(paid,ms.length),s:paid+' z '+ms.length+' zaplatilo'},
      {k:'wh',ic:'📦',l:'SKLAD V POŘÁDKU',p:pct(good,wh.length),s:good+' z '+wh.length+' položek'},
      {k:'att',ic:'📋',l:'DOCHÁZKA NA AKCÍCH',p:pct(came,came+abs),s:came+' příchodů · '+abs+' absencí'}
    ];
  }
  function countTo(el,from,to){
    if(reduce||from===to){el.textContent=to+'%';return;}
    var t0=performance.now();
    (function f(t){
      var k=Math.min(1,(t-t0)/1000),e=1-Math.pow(1-k,3);
      el.textContent=Math.round(from+(to-from)*e)+'%';
      if(k<1&&document.body.contains(el))requestAnimationFrame(f);
    })(t0);
  }
  function renderPulse(){
    var host=document.getElementById('statsBody');if(!host||typeof DB==='undefined'||!getMember())return;
    var old=document.getElementById('pulse');if(old)old.remove();
    var d=data(),box=document.createElement('div');box.id='pulse';box.className='pulse';
    box.innerHTML='<div class="pulse-t">// PULS FRAKCE</div>'+d.map(function(x){
      var p=x.p==null?0:x.p,from=prev[x.k]==null?0:prev[x.k];
      var cls=x.p==null?'na':(p>=75?'good':(p>=50?'mid':'bad'));
      return '<div class="pr '+cls+'" data-k="'+x.k+'"><svg viewBox="0 0 100 100"><circle class="t" cx="50" cy="50" r="40"/>'+
        '<circle class="g" cx="50" cy="50" r="40" transform="rotate(-90 50 50)" style="stroke-dashoffset:'+(C*(1-from/100))+'"/></svg>'+
        '<div class="pr-in"><div class="pr-l">'+x.ic+' '+x.l+'</div><b class="pr-v">'+(x.p==null?'—':from+'%')+'</b><div class="pr-s">'+x.s+'</div></div></div>';
    }).join('');
    host.insertBefore(box,host.firstChild);
    void box.offsetWidth; // vynutí přepočet, aby se spustila animace
    d.forEach(function(x){
      var p=x.p==null?0:x.p,from=prev[x.k]==null?0:prev[x.k];
      var card=box.querySelector('[data-k="'+x.k+'"]');if(!card)return;
      card.querySelector('.g').style.strokeDashoffset=C*(1-p/100);
      if(x.p!=null)countTo(card.querySelector('.pr-v'),from,p);
      prev[x.k]=p;
    });
  }
  var _rs=window.renderStats;
  if(typeof _rs==='function'){
    window.renderStats=function(){var r=_rs.apply(this,arguments);try{renderPulse();}catch(e){console.error('pulse',e);}return r;};
  }
})();
