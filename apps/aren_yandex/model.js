'use strict';
const geo=require('./geo'),png=require('./png'),mono=require('./gps').mono;
const TEXT={KEY_MISSING:'Нужен API-ключ этого сервиса',KEY_FORMAT:'Неверный формат ключа',HTTP_400:'API: параметры запроса отклонены',HTTP_401:'API: проверьте ключ и доступ к сервису',HTTP_403:'API: ключ или ограничения доступа',HTTP_429:'Лимит Яндекса. Повтор через минуту',TIMEOUT:'Сеть: превышено время ожидания',NETWORK:'Нет соединения с Яндексом',TLS_ERROR:'TLS: проверьте дату MGU и сертификаты',BAD_RESPONSE:'Неизвестный формат ответа API',BAD_PNG:'Изображение карты не поддерживается',NO_ROUTE:'Маршрут не найден',ROUTE_TOO_LARGE:'Маршрут слишком большой',NO_GPS:'Нет достоверной позиции',SESSION_LIMIT:'Лимит запросов за сеанс. Продолжить можно в меню'};
function message(e){return TEXT[e&&e.code||e&&e.message]||'Операция не выполнена';}
class Model {
    constructor(provider,position,options){
        const o=options||{};this.provider=provider;this.position=position;this.now=o.clock||mono;this.decode=o.decode||png.decode;
        this.destination=null;this.manual=null;this.route=null;this.image=null;this.imageAt=null;this.imageSpec=null;this.places=[];
        this.zoom=15;this.theme='light';this.mode='follow';this.interval=15000;this.enabled=true;this.active=false;
        this.status='Настройте ключи в меню';this.mapEpoch=0;this.searchEpoch=0;this.routeEpoch=0;
        this.mapBusy=false;this.routeBusy=false;this.searchBusy=false;this.mapDue=0;this.searchDue=0;this.routeDue=0;this.calls={map:0,search:0,route:0};this.maxCalls=240;
    }
    origin(){return this.manual||this.position.get();}
    invalidate(){this.mapEpoch++;this.image=null;this.imageSpec=null;this.imageAt=null;this.mapDue=0;}
    select(p){if(!geo.valid(p))return;this.destination=p;this.route=null;this.routeEpoch++;this.routeBusy=false;this.mode='destination';this.status='Цель выбрана. Нажмите «Маршрут»';this.invalidate();}
    setManual(p){if(!geo.valid(p))throw new Error('INVALID_COORDINATES');this.manual=p;this.mode='follow';this.route=null;this.routeEpoch++;this.routeBusy=false;this.status='Начало задано вручную';this.invalidate();}
    locate(){this.manual=null;this.mode='follow';this.route=null;this.routeEpoch++;this.routeBusy=false;this.status=this.position.status();this.invalidate();}
    setZoom(delta){this.zoom=Math.max(1,Math.min(19,this.zoom+delta));if(this.mode==='overview')this.mode='follow';this.invalidate();}
    clearRoute(){this.route=null;this.routeEpoch++;this.routeBusy=false;this.mode='follow';this.status='Маршрут сброшен';this.invalidate();}
    resetBudget(){this.calls={map:0,search:0,route:0};this.status='Счётчик сеанса сброшен';}
    count(type){if(this.calls.map+this.calls.search+this.calls.route>=this.maxCalls)throw new Error('SESSION_LIMIT');this.calls[type]++;}
    async search(text){
        const direct=geo.parse(text);
        if(direct){this.searchEpoch++;this.searchBusy=false;this.places=[Object.assign({title:text.trim()},direct)];return this.places;}
        if(this.searchBusy||this.now()<this.searchDue)return null;
        const epoch=++this.searchEpoch;this.searchBusy=true;this.places=[];this.status='Поиск адреса…';this.searchDue=this.now()+2000;
        try{this.count('search');const places=await this.provider.search(text,this.origin());if(epoch===this.searchEpoch){this.places=places;this.status=places.length?'Выберите адрес в списке':'Адрес не найден';return places;}}
        catch(e){if(epoch===this.searchEpoch){this.status=message(e);if(e.code==='HTTP_429')this.searchDue=this.now()+60000;}}
        finally{if(epoch===this.searchEpoch)this.searchBusy=false;}
        return null;
    }
    async buildRoute(){
        const a=this.origin(),b=this.destination;
        if(!a){this.status='Нет GPS. Можно задать начало вручную';return false;}
        if(!b){this.status='Сначала выберите адрес назначения';return false;}
        if(this.routeBusy||this.now()<this.routeDue){this.status='Подождите перед повторным запросом';return false;}
        const epoch=++this.routeEpoch;this.routeBusy=true;this.routeDue=this.now()+10000;this.route=null;this.invalidate();this.status='Построение маршрута…';
        try{this.count('route');const route=await this.provider.route(a,b);
            if(epoch!==this.routeEpoch)return false;
            this.route=route;this.mode='overview';this.status='Маршрут построен';this.invalidate();return true;
        }catch(e){if(epoch===this.routeEpoch){this.status=message(e);if(e.code==='HTTP_429')this.routeDue=this.now()+60000;}return false;}
        finally{if(epoch===this.routeEpoch)this.routeBusy=false;}
    }
    snapshot(){
        const fix=this.position.get(),origin=this.origin(),d=this.destination;
        const spec={zoom:this.zoom,theme:this.theme,fix:this.manual?null:fix,destination:d,points:this.route?this.route.points:null};
        let center=origin;
        if(this.mode==='destination')center=d;
        if(this.mode==='overview'&&this.route)spec.bbox=geo.overview(this.route.points);
        if(!center&&!spec.bbox)center=d;
        if(!center&&!spec.bbox)return null;
        return {center,spec};
    }
    async refreshMap(){
        if(!this.active||!this.enabled||this.mapBusy||this.now()<this.mapDue)return false;
        const view=this.snapshot();if(!view)return false;
        // Stationary map: do not re-download it unless the view changes or a fix is lost.
        const last=this.imageSpec;
        if(this.image&&last&&this.imageAt!==null&&this.now()-this.imageAt<60000&&
            (!!last.spec.fix===!!view.spec.fix)&&(!view.spec.fix||geo.distance(last.spec.fix,view.spec.fix)<25))return false;
        const epoch=this.mapEpoch;this.mapBusy=true;this.mapDue=this.now()+this.interval;
        try{this.count('map');const body=await this.provider.map(view.center,view.spec),image=await this.decode(body);
            if(epoch!==this.mapEpoch||!this.active||!this.enabled)return false;
            this.image=image;this.imageSpec=view;this.imageAt=this.now();return true;
        }catch(e){if(epoch===this.mapEpoch){this.status=message(e);this.mapDue=this.now()+(e.code==='HTTP_429'?60000:30000);}return false;}
        finally{this.mapBusy=false;}
    }
    progress(){const p=this.position.get();return this.route&&p&&!this.manual?geo.routeProgress(this.route.points,p):null;}
}
module.exports={Model,message};
