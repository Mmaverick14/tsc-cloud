(function(){
  var root=document.documentElement;
  function mode(){return root.getAttribute('data-mode')==='light'?'light':'dark';}
  function setMode(m){
    root.setAttribute('data-mode',m);
    try{localStorage.setItem('tsc_mode',m);}catch(e){}
    paint();
  }
  function paint(){document.querySelectorAll('.tb.mode').forEach(function(b){
    b.textContent=mode()==='light'?'☾':'☀';
    b.title=mode()==='light'?'Tmavý režim':'Světlý režim';
  });}
  setInterval(function(){
    document.querySelectorAll('.sb-tools').forEach(function(w){
      if(!w.querySelector('.mode')){
        var b=document.createElement('button');b.className='tb mode';b.setAttribute('aria-label','Přepnout světlý/tmavý režim');
        b.onclick=function(){setMode(mode()==='light'?'dark':'light');};w.appendChild(b);paint();
      }
    });
    document.querySelectorAll('.pt,.fp-title,.st-bt-title,.pulse-t').forEach(function(e){
      var n=e.firstChild;
      for(var c=e.firstChild;c;c=c.nextSibling){if(c.nodeType===3&&c.nodeValue.trim()){n=c;break;}}
      if(n&&n.nodeType===3&&/^\s*\/\/\s*/.test(n.nodeValue))n.nodeValue=n.nodeValue.replace(/^\s*\/\/\s*/,'');
    });
    document.querySelectorAll('.ip:not(.ip-hide)').forEach(function(s){
      if(s.textContent.trim()==='>_')s.classList.add('ip-hide');
    });
  },1000);
  try{
    var mq=matchMedia('(prefers-color-scheme: light)');
    (mq.addEventListener?mq.addEventListener.bind(mq,'change'):mq.addListener.bind(mq))(function(e){
      if(!localStorage.getItem('tsc_mode'))setMode(e.matches?'light':'dark');
    });
  }catch(e){}
})();
