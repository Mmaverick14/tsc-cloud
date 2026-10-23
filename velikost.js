(function(){
  var KEY='tsc_ui_scale',MIN=80,MAX=150,STEP=5,DEF=100;
  function get(){var v=NaN;try{v=parseInt(localStorage.getItem(KEY),10);}catch(e){}return isNaN(v)?DEF:Math.min(MAX,Math.max(MIN,v));}
  function apply(v){document.documentElement.style.setProperty('--ui',v+'%');try{localStorage.setItem(KEY,String(v));}catch(e){}}
  apply(get());

  function pop(e){
    e.stopPropagation();
    var old=document.querySelector('.size-pop');if(old){old.remove();return;}
    var r=e.currentTarget.getBoundingClientRect(),p=document.createElement('div');p.className='size-pop';
    p.innerHTML='<div class="sp-t">Velikost webu</div>'+
      '<div class="sp-row"><button class="sp-b" data-d="-1" aria-label="Zmenšit">A−</button>'+
      '<input type="range" min="'+MIN+'" max="'+MAX+'" step="'+STEP+'" aria-label="Velikost webu"/>'+
      '<button class="sp-b" data-d="1" aria-label="Zvětšit">A+</button></div>'+
      '<div class="sp-v"></div>'+
      '<div class="sp-h">Změní velikost písma i ovládacích prvků. Nastavení platí jen pro tebe a v tomto prohlížeči.</div>'+
      '<button class="sp-r">Výchozí velikost</button>';
    document.body.appendChild(p);
    var rg=p.querySelector('input'),val=p.querySelector('.sp-v');
    function show(v){rg.value=v;val.textContent=v+' %';}
    function set(v){v=Math.min(MAX,Math.max(MIN,v));apply(v);show(v);}
    show(get());
    rg.oninput=function(){set(parseInt(rg.value,10));};
    p.querySelectorAll('.sp-b').forEach(function(b){b.onclick=function(){set(get()+STEP*parseInt(b.dataset.d,10));};});
    p.querySelector('.sp-r').onclick=function(){set(DEF);};
    function place(){
      var w=p.offsetWidth,h=p.offsetHeight;
      p.style.left=Math.max(8,Math.min(r.left,innerWidth-w-8))+'px';
      p.style.top=(r.bottom+6+h>innerHeight?Math.max(8,r.top-h-6):r.bottom+6)+'px';
    }
    place();
    p.addEventListener('click',function(ev){ev.stopPropagation();});
    setTimeout(function(){document.addEventListener('click',function f(){p.remove();document.removeEventListener('click',f);});},0);
  }
  setInterval(function(){
    document.querySelectorAll('.sb-tools').forEach(function(w){
      if(w.querySelector('.tb.size'))return;
      var b=document.createElement('button');b.className='tb size';b.title='Velikost webu';b.textContent='Aa';b.style.fontWeight='700';
      b.onclick=pop;w.appendChild(b);
    });
  },1000);
  document.addEventListener('keydown',function(e){
    if(!(e.ctrlKey&&e.altKey))return;
    if(e.key==='+'||e.key==='='){e.preventDefault();apply(Math.min(MAX,get()+STEP));}
    else if(e.key==='-'){e.preventDefault();apply(Math.max(MIN,get()-STEP));}
    else if(e.key==='0'){e.preventDefault();apply(DEF);}
  });
})();
