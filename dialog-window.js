export function dialogPosition({width,height,viewportWidth,viewportHeight},requested=null) {
    const limit=(size,viewport,value)=>{
        const room=Math.max(0,viewport-size),edge=Math.min(12,room/2);
        return Math.max(edge,Math.min(Number.isFinite(value)?value:room/2,room-edge));
    };
    return {x:limit(width,viewportWidth,requested?.x),y:limit(height,viewportHeight,requested?.y)};
}

// Position belongs to the window, independently of each form's state and saves.
export function mountDialogWindow({dialog,handle=dialog.querySelector('header'),window=dialog.ownerDocument.defaultView}={}) {
    const document=dialog.ownerDocument;
    let drag=null,position=null,frame=null,moved=false,disposed=false;
    const opened=()=>dialog.hasAttribute('open');
    const size=()=>{
        const rect=dialog.getBoundingClientRect?.()||{width:0,height:0};
        return {width:rect.width,height:rect.height,viewportWidth:window.innerWidth||document.documentElement.clientWidth||0,viewportHeight:window.innerHeight||document.documentElement.clientHeight||0};
    };
    function place(requested){
        if(disposed||!opened())return;
        position=dialogPosition(size(),requested);
        dialog.style.left=position.x+'px';dialog.style.top=position.y+'px';
    }
    function paint(){frame=null;place(position)}
    function stop(){
        if(frame!==null){window.cancelAnimationFrame?.(frame);frame=null;place(position)}
        const previous=drag;drag=null;dialog.classList.remove('dialog-window-dragging');
        if(previous)try{handle.releasePointerCapture?.(previous.id)}catch{}
    }
    function reset(){
        stop();moved=false;
        Object.assign(dialog.style,{position:'fixed',inset:'auto',margin:'0',transform:'none'});
        place(null);
    }
    function down(event){
        if(disposed||!opened()||drag||event.button!==0||!Number.isFinite(event.clientX)||!Number.isFinite(event.clientY)||event.target.closest('button,a,input,select,textarea,[contenteditable="true"]'))return;
        const rect=dialog.getBoundingClientRect?.();if(!rect)return;
        event.preventDefault();moved=true;
        drag={id:event.pointerId,x:event.clientX-rect.left,y:event.clientY-rect.top};
        position={x:rect.left,y:rect.top};dialog.classList.add('dialog-window-dragging');
        try{handle.setPointerCapture?.(event.pointerId)}catch{}
    }
    function move(event){
        if(!drag||event.pointerId!==drag.id)return;
        event.preventDefault();position={x:event.clientX-drag.x,y:event.clientY-drag.y};
        if(window.requestAnimationFrame){if(frame===null)frame=window.requestAnimationFrame(paint)}else paint();
    }
    function up(event){if(drag&&event.pointerId===drag.id){move(event);stop()}}
    function cancel(event){if(drag&&event.pointerId===drag.id)stop()}
    function resize(){if(opened())place(moved?position:null)}
    function key(event){
        if(event.target!==handle||event.altKey||event.ctrlKey||event.metaKey||!opened())return;
        const delta={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[event.key];
        if(event.key==='Home'){event.preventDefault();reset();return}
        if(!delta)return;
        event.preventDefault();stop();moved=true;
        const rect=dialog.getBoundingClientRect?.()||{left:0,top:0},step=event.shiftKey?40:10;
        place({x:rect.left+delta[0]*step,y:rect.top+delta[1]*step});
    }
    dialog.classList.add('dialog-window');handle.classList.add('dialog-window-handle');handle.tabIndex=0;
    handle.setAttribute('aria-label','Move window');handle.title='Drag to move. Arrow keys move the window; Home centres it.';
    handle.addEventListener('pointerdown',down);handle.addEventListener('lostpointercapture',cancel);handle.addEventListener('keydown',key);
    document.addEventListener('pointermove',move);document.addEventListener('pointerup',up);document.addEventListener('pointercancel',cancel);window.addEventListener('resize',resize);window.addEventListener('blur',stop);dialog.addEventListener('close',stop);
    const observer=window.ResizeObserver?new window.ResizeObserver(resize):null;observer?.observe(dialog);
    return {reset,stop,dispose(){stop();disposed=true;observer?.disconnect();handle.removeEventListener('pointerdown',down);handle.removeEventListener('lostpointercapture',cancel);handle.removeEventListener('keydown',key);document.removeEventListener('pointermove',move);document.removeEventListener('pointerup',up);document.removeEventListener('pointercancel',cancel);window.removeEventListener('resize',resize);window.removeEventListener('blur',stop);dialog.removeEventListener('close',stop)}};
}
