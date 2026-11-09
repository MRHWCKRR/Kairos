// Exercise the production stylesheet cascade on both timer surfaces.
export function runTimerAppearanceJourney({document,window,check}) {
 const fixture=document.createElement('section');
 fixture.innerHTML='<div id="focus-timer-container"></div><aside class="task-focus-bar"></aside>';
 document.body.appendChild(fixture);
 const themes={violet:'#7d45f5',cyan:'#007c91',green:'#16794b',amber:'#9a5700',rose:'#b4235a'};
 try {
  for(const type of ['digital','watch','nuclear'])for(const [theme,accent] of Object.entries(themes))for(const element of fixture.children){
   element.dataset.timerType=type;element.dataset.timerTheme=theme;
   const actual=window.getComputedStyle(element).getPropertyValue('--timer-accent').trim();
   check(actual===accent,`${element.id||'compact'} ${type}/${theme} accent ${actual}; expected ${accent}`);
  }
 } finally {fixture.remove();}
}
