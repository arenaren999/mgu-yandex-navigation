'use strict';
const query=require('querystring'), geo=require('./geo'), http=require('./http');
function key(k) {if(typeof k!=='string'||!/^[A-Za-z0-9_-]{12,200}$/.test(k))throw http.failure('KEY_MISSING');return k;}
function address(base,params) {return base+'?'+query.stringify(params);}
function coord(p) {if(!geo.valid(p))throw http.failure('INVALID_COORDINATES');return p.lon.toFixed(6)+','+p.lat.toFixed(6);}
function mapURL(k,p,options) {
    const o=options||{}, params={apikey:key(k),lang:'ru_RU',size:'650,260',maptype:'driving',theme:o.theme==='dark'?'dark':'light'};
    if(o.bbox) {if(o.bbox.length!==4||!o.bbox.every(geo.number))throw http.failure('INVALID_COORDINATES');params.bbox=o.bbox.slice(0,2).join(',')+'~'+o.bbox.slice(2).join(',');}
    else {params.ll=coord(p);params.z=Math.max(1,Math.min(19,Math.round(o.zoom||15)));}
    const pins=[];
    if(o.fix) pins.push(coord(o.fix)+',pm2blm');
    if(o.destination) pins.push(coord(o.destination)+',flag');
    if(pins.length)params.pt=pins.join('~');
    // Static API examples use longitude,latitude (the generic request table has a conflicting description).
    if(o.points&&o.points.length>1)params.pl='c:308BFFFF,w:4,'+geo.simplify(o.points,100).map(coord).join(',');
    return address('https://static-maps.yandex.ru/v1',params);
}
function geocodeURL(k,text,near) {
    if(typeof text!=='string'||!text.trim()||text.length>250)throw http.failure('INVALID_QUERY');
    const p={apikey:key(k),geocode:text.trim(),lang:'ru_RU',format:'json',results:5};
    if(near){p.ll=coord(near);p.spn='1,1';p.rspn=0;}
    return address('https://geocode-maps.yandex.ru/v1',p);
}
function routeURL(k,a,b) {
    coord(a);coord(b);
    return address('https://api.routing.yandex.net/v2/route',{apikey:key(k),waypoints:[a,b].map(p=>p.lat.toFixed(6)+','+p.lon.toFixed(6)).join('|'),mode:'driving'});
}
function json(b) {try{return JSON.parse(b.toString('utf8'));}catch(e){throw http.failure('BAD_RESPONSE');}}
function parsePlaces(data) {
    const collection=data&&data.response&&data.response.GeoObjectCollection;
    if(!collection||!Array.isArray(collection.featureMember))throw http.failure('BAD_RESPONSE');
    return collection.featureMember.slice(0,5).map(item=>{
        const g=item.GeoObject||{},pos=g.Point&&g.Point.pos;
        if(typeof pos!=='string')return null;
        const pair=pos.trim().split(/\s+/).map(Number), p={lat:pair[1],lon:pair[0]};
        if(!geo.valid(p)||pair.length!==2)return null;
        const meta=g.metaDataProperty&&g.metaDataProperty.GeocoderMetaData;
        return {lat:p.lat,lon:p.lon,title:String(meta&&meta.text||g.name||'Результат').replace(/[\x00-\x1f]/g,' ').slice(0,220)};
    }).filter(Boolean);
}
function parseRoute(data) {
    const legs=data&&data.route&&data.route.legs;
    if(!Array.isArray(legs)||!legs.length||legs.length>50)throw http.failure('NO_ROUTE');
    const points=[];let length=0,duration=0;
    for(const leg of legs) {
        if(leg.status!=='OK'||!Array.isArray(leg.steps)||!leg.steps.length)throw http.failure('NO_ROUTE');
        for(const step of leg.steps) {
            if(!geo.number(step.length)||step.length<0||!geo.number(step.duration)||step.duration<0)throw http.failure('BAD_RESPONSE');
            const pts=step.polyline&&step.polyline.points;
            if(!Array.isArray(pts))throw http.failure('BAD_RESPONSE');
            length+=step.length;duration+=step.duration;
            for(const pair of pts) {
                if(!Array.isArray(pair)||pair.length!==2)throw http.failure('BAD_RESPONSE');
                const p={lat:pair[0],lon:pair[1]};
                if(!Array.isArray(pair)||pair.length!==2||!geo.valid(p))throw http.failure('BAD_RESPONSE');
                const last=points[points.length-1];
                if(!last||last.lat!==p.lat||last.lon!==p.lon)points.push(p);
                if(points.length>30000)throw http.failure('ROUTE_TOO_LARGE');
            }
        }
    }
    if(points.length<2||!isFinite(length)||!isFinite(duration))throw http.failure('NO_ROUTE');
    return {points,length,duration,traffic:String(data.traffic_type||'unknown'),createdAt:Date.now()};
}
class Provider {
    constructor(keys,transport) {this.keys=keys;this.get=transport||http.get;}
    map(p,o) {return this.get(mapURL(this.keys.staticKey,p,o),{image:true});}
    search(text,near) {return this.get(geocodeURL(this.keys.geocoderKey,text,near)).then(json).then(parsePlaces);}
    route(a,b) {return this.get(routeURL(this.keys.routerKey,a,b)).then(json).then(parseRoute);}
}
module.exports={Provider,mapURL,geocodeURL,routeURL,parsePlaces,parseRoute};
