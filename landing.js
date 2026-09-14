document.addEventListener('DOMContentLoaded',()=>{const spotlight=document.createElement('div');spotlight.className='cursor-spotlight';document.body.appendChild(spotlight);window.addEventListener('pointermove',e=>{spotlight.style.left=e.clientX+'px';spotlight.style.top=e.clientY+'px'},{passive:true});const nav=document.getElementById('navbar'),menu=document.querySelector('.menu-toggle'),links=document.querySelector('.nav-links');window.addEventListener('scroll',()=>nav.classList.toggle('scrolled',scrollY>30),{passive:true});menu?.addEventListener('click',()=>{const open=links.classList.toggle('open');menu.setAttribute('aria-expanded',open)});links?.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>links.classList.remove('open')));const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('visible');io.unobserve(e.target)}}),{threshold:.12});document.querySelectorAll('.reveal').forEach(e=>io.observe(e));const featureObserver=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting)entry.target.classList.add('active');else entry.target.classList.remove('active')}),{threshold:.65,rootMargin:'-5% 0px -5% 0px'});document.querySelectorAll('.feature-card').forEach(e=>featureObserver.observe(e));const co=new IntersectionObserver(es=>es.forEach(e=>{if(!e.isIntersecting)return;const el=e.target,end=Number(el.dataset.target);let n=0;const tick=()=>{n=Math.min(end,n+Math.max(1,Math.ceil(end/35)));el.textContent=n;if(n<end)requestAnimationFrame(tick)};tick();co.unobserve(el)}),{threshold:.7});document.querySelectorAll('[data-target]').forEach(e=>co.observe(e));});
// Keep testimonials in a true continuous loop. Add/edit only the original cards in index.html.
(function(){const track=document.getElementById('testimonial-track');if(!track)return;const originals=[...track.children];if(originals.length<2)return;originals.forEach(card=>{const clone=card.cloneNode(true);clone.setAttribute('aria-hidden','true');track.appendChild(clone)});})();

(function(){
  const track=document.getElementById('testimonial-track');
  if(!track) return;
  const cards=Array.from(track.children);
  if(!cards.length) return;

  const originalWidth=cards.reduce((sum,card)=>sum+card.getBoundingClientRect().width,0)+(cards.length-1)*16;
  const copies=Math.max(3,Math.ceil(window.innerWidth/originalWidth)+2);
  for(let i=1;i<copies;i++) cards.forEach(card=>{
    const clone=card.cloneNode(true);
    clone.setAttribute('aria-hidden','true');
    track.appendChild(clone);
  });

  let offset=0;
  let last=performance.now();
  const speed=38;
  function loop(now){
    const dt=(now-last)/1000; last=now;
    offset-=speed*dt;
    if(-offset>=originalWidth) offset+=originalWidth;
    track.style.transform='translate3d('+offset+'px,0,0)';
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();

// Launch CTA: rename the old action and add the early-supporter waitlist offer.
(function(){
  document.querySelectorAll('a.btn-primary').forEach(link=>{
    if(link.textContent.trim().replace('↗','').trim()==='Open Kairos'){
      const arrow=link.querySelector('span');
      link.childNodes.forEach(node=>{if(node.nodeType===Node.TEXT_NODE)node.textContent='Try Kairos ';});
      if(!arrow) link.insertAdjacentHTML('beforeend','<span>↗</span>');
    }
  });

  const style=document.createElement('style');
  style.textContent='.final-cta-buttons{display:flex;justify-content:center;align-items:center;gap:12px;flex-wrap:wrap}.waitlist-cta{border-color:rgba(192,132,252,.3);background:rgba(168,85,247,.07)}@media(max-width:650px){.final-cta-buttons{flex-direction:column}.final-cta-buttons a{width:100%;max-width:340px}}';
  document.head.appendChild(style);

  const finalCta=document.querySelector('.final-cta');
  const primary=finalCta?.querySelector('a.btn-primary');
  if(finalCta && primary && !finalCta.querySelector('.waitlist-cta')){
    const waitlist=document.createElement('a');
    waitlist.href='waitlist.html';
    waitlist.className='btn-secondary large waitlist-cta';
    waitlist.innerHTML='<span>Get 1 month free</span><span aria-hidden="true">✦</span>';
    primary.insertAdjacentElement('afterend',waitlist);
    primary.parentElement?.classList.add('final-cta-buttons');
  }
})();