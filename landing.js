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