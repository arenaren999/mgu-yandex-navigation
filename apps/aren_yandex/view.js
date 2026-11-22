'use strict';
const W=1600,H=520,MAP_ID=0x59414e44;
function shorten(cv,text,width,size){
    let s=String(text||'');while(s.length&&cv.textWidth(s,size)>width)s=s.slice(0,-1);
    if(s.length<text.length){const space=s.lastIndexOf(' ');if(space>0)s=s.slice(0,space);}
    return s;
}
function draw(cv,m,now,record) {
    cv.clear('#10151c');
    cv.fillRect(0,0,1300,520,'#19222c');
    if(m.image){
        if(cv.recording){record.setImage(MAP_ID,m.image.w,m.image.h,m.image.data);cv.image(MAP_ID,0,0,1300,520);}
        else cv.drawImage(m.image.data,m.image.w,m.image.h,0,0,1300,520);
    } else {
        cv.text('MGU Yandex Navigation',650,160,40,'#edf4fc',{align:'center'});
        cv.text(m.mapBusy?'Загрузка карты…':'Карты на экране BMW',650,225,30,'#94a9bd',{align:'center'});
        cv.text(m.origin()||m.destination?'Проверьте ключ Static API в меню':'Ожидание GPS или выбор адреса',650,285,25,'#c7d6e4',{align:'center'});
        cv.text('Без CarPlay · экспериментальная версия 0.2.2',650,355,23,'#8296ac',{align:'center'});
    }
    const x=1324;
    cv.text('MGU / YANDEX',x,38,22,'#55b6ff');
    cv.text('0.2.2 · ИСПЫТАНИЯ',x,69,18,'#d7ad63');
    cv.fillRect(x,88,252,2,'#344454');
    cv.text(m.manual?'НАЧАЛО ВРУЧНУЮ':'КООРДИНАТЫ',x,124,18,'#8296ac');
    const pos=m.origin();
    cv.text(m.manual?'Ручная точка':m.position.get()?'GPS автомобиля':'GPS недоступен',x,156,22,pos?'#d5e3ef':'#e9b96f');
    if(pos){cv.text(pos.lat.toFixed(5),x,185,21,'#d5e3ef');cv.text(pos.lon.toFixed(5),x+124,185,21,'#d5e3ef');}
    const route=m.route,progress=m.progress();
    cv.text('МАРШРУТ',x,232,18,'#8296ac');
    cv.text(route?(route.length/1000).toFixed(1)+' км · '+Math.ceil(route.duration/60)+' мин':'Не построен',x,266,23,'#ffffff');
    if(route)cv.text(route.traffic==='disabled'?'Без учёта пробок':'Время при запросе',x,294,18,'#94a9bd');
    if(progress)cv.text(progress.offRoute?'Вне линии маршрута':'Осталось ≈ '+(progress.remaining/1000).toFixed(1)+' км',x,326,20,progress.offRoute?'#e9b96f':'#74daa0');
    const age=m.imageAt===null?null:Math.max(0,Math.floor((now-m.imageAt)/1000));
    cv.text(age===null?'Нет изображения':'Карта: '+age+' с назад',x,368,20,'#94a9bd');
    cv.text('Масштаб '+m.zoom,x,398,19,'#94a9bd');
    const status=String(m.status||'');
    let rest=status;
    for(let i=0;i<3&&rest;i++){
        const line=shorten(cv,rest,250,20);cv.text(line,x,437+i*25,20,'#efce8a');rest=rest.slice(line.length).trim();
    }
    // No overlays are drawn on the provider image: attribution/logo remain visible.
    return cv;
}
module.exports={draw,W,H,MAP_ID};
