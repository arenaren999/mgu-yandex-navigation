'use strict';
const mgu=require('./kit/mgu'),record=require('./kit/record');
const {Position}=require('./gps'),{Provider}=require('./provider'),{Model,message}=require('./model');
const {Keys}=require('./config'),{spell}=require('./speller'),geo=require('./geo'),view=require('./view');
async function start(ctx) {
    const keys=new Keys(ctx.dataDir),position=new Position(),provider=new Provider(keys.values),m=new Model(provider,position);
    const ui=ctx.ui,log=ctx.log;let inputBusy=false;
    const open=async(name)=>{
        if(ctx.display&&ctx.display.navigateTo)ctx.display.navigateTo(name);
        try{return await ui.open(name);}
        catch(e){if(ctx.display&&ctx.display.navigateTo)ctx.display.navigateTo('MAIN');throw e;}
    };
    const show=()=>open('MAIN');
    const updateMenu=()=>Promise.all([
        ui.text('KEY_STATIC','Карта: '+(keys.values.staticKey?'ключ сохранён':'ввести ключ')),
        ui.text('KEY_GEOCODER','Поиск: '+(keys.values.geocoderKey?'ключ сохранён':'ввести ключ')),
        ui.text('KEY_ROUTER','Маршруты: '+(keys.values.routerKey?'ключ сохранён':'ввести ключ')),
        ui.text('INFO',position.status()+'; попыток API за сеанс: '+(m.calls.map+m.calls.search+m.calls.route))
    ]);
    async function input(title,fn){
        if(inputBusy)return;inputBusy=true;
        try{const text=await spell(ctx.app,title);if(text!==null&&text.trim())await fn(text.trim());}
        catch(e){m.status='Клавиатура недоступна или ввод не сохранён';log.warn('input failed');}
        finally{inputBusy=false;}
    }
    function bind(name,fn){ui.onClick(name,async()=>{try{await fn();}catch(e){m.status=message(e);log.warn('operation failed');}});}
    bind('BTN_SEARCH',()=>input('Адрес или широта,долгота',async text=>{
        const results=await m.search(text);if(!results||!results.length){await show();return;}
        for(let i=0;i<5;i++){await ui.text('RESULT_'+i,results[i]?results[i].title:'');await ui.visible('RESULT_'+i,!!results[i]);}
        await open('RESULTS');
    }));
    for(let i=0;i<5;i++)bind('RESULT_'+i,()=>{if(m.places[i])m.select(m.places[i]);return show();});
    bind('BTN_ROUTE',()=>m.buildRoute());
    bind('BTN_LOCATE',()=>m.locate());
    bind('BTN_PLUS',()=>m.setZoom(1));bind('BTN_MINUS',()=>m.setZoom(-1));
    bind('BTN_MENU',async()=>{await updateMenu();await open('MENU');});
    const keyRows=[['KEY_STATIC','staticKey','Ключ Static API'],['KEY_GEOCODER','geocoderKey','Ключ Геокодера'],['KEY_ROUTER','routerKey','Ключ маршрутов']];
    keyRows.forEach(row=>bind(row[0],()=>input(row[2],async text=>{
        keys.set(row[1],text);provider.keys=keys.values;m.invalidate();m.mapDue=0;m.status='Ключ сохранён на MGU';await updateMenu();await show();
    })));
    bind('MANUAL',()=>input('Начало: широта,долгота',async text=>{const p=geo.parse(text);if(!p){m.status='Формат: 55.751,37.618';await show();return;}m.setManual(p);await show();}));
    bind('FOLLOW',()=>{m.mode='follow';m.invalidate();return show();});
    bind('OVERVIEW',()=>{if(m.route){m.mode='overview';m.invalidate();}else m.status='Сначала постройте маршрут';return show();});
    bind('CLEAR_ROUTE',()=>{m.clearRoute();return show();});
    bind('PAUSE',()=>{m.enabled=!m.enabled;m.invalidate();m.status=m.enabled?'Загрузка карт включена':'Загрузка карт на паузе';return show();});
    bind('BUDGET',()=>{m.resetBudget();return show();});
    bind('ERASE_KEYS',()=>open('CONFIRM_ERASE'));
    bind('ERASE_YES',()=>{keys.clear();provider.keys=keys.values;m.clearRoute();m.searchEpoch++;m.searchBusy=false;m.places=[];m.destination=null;m.manual=null;m.status='Ключи удалены';return show();});
    bind('ERASE_NO',()=>show());
    const options=()=>{m.theme=ctx.settings.get('mapTheme');m.interval=ctx.settings.get('refreshSeconds')*1000;m.invalidate();};
    ctx.settings.onChange(options);options();
    ui.onVisible((name,on)=>{if(name==='MAIN'){m.active=on;if(!on)m.mapEpoch++;}});
    ui.onFocus((name,on)=>{if(name==='MAIN'){m.active=on&&ui.isVisible('MAIN');if(!on)m.mapEpoch++;}});
    m.active=ui.isVisible('MAIN');
    position.start(ctx.signals,log).catch(()=>{m.status='GPS недоступен';});
    m.status=keys.values.staticKey?'Ожидание GPS или выбор адреса':'Откройте меню и введите ключи Яндекса';
    let lastFrame=0,canvas=ctx.canvas(view.W,view.H),lastImage=null;
    ctx.loop('MAIN',2,async()=>{
        const now=m.now();if(now-lastFrame<450)return;lastFrame=now;
        m.active=ui.hasFocus('MAIN');
        // Fetch independently of painting so a slow connection cannot freeze BACK or the UI.
        m.refreshMap().catch(()=>{m.status='Не удалось обновить карту';});
        if(canvas.reset)canvas.reset();
        // Avoid uploading unchanged pixels to the renderer on every frame.
        const images={setImage:(id,w,h,data)=>{if(lastImage!==data){record.setImage(id,w,h,data);lastImage=data;}}};
        view.draw(canvas,m,now,images);await ui.image('MAIN_GFX',canvas);
    });
    // Exposed only to the host harness by return value; no local network server.
    return {model:m,position,keys};
}
module.exports={start};
mgu.run({start});
