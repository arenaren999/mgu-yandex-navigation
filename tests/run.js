'use strict';
// All tests use explicit fixtures. No provider credentials or car connection.
const assert=require('assert'),fs=require('fs'),path=require('path'),os=require('os'),zlib=require('zlib');
const base=path.resolve(__dirname,'../apps/aren_yandex');
const geo=require(base+'/geo'),{Position}=require(base+'/gps'),api=require(base+'/provider'),{Model}=require(base+'/model'),png=require(base+'/png'),{Keys}=require(base+'/config');
const tests=[];function test(name,fn){tests.push({name,fn});}
const key='00000000-0000-0000-0000-000000000000';
const a={lat:55.75,lon:37.61},b={lat:55.76,lon:37.63},c={lat:55.77,lon:37.65};
const routeFixture=()=>({traffic_type:'realtime',route:{legs:[{status:'OK',steps:[{length:1800,duration:250,polyline:{points:[[a.lat,a.lon],[b.lat,b.lon]]}},{length:1500,duration:300,polyline:{points:[[b.lat,b.lon],[c.lat,c.lon]]}}]}]}});
function deferred(){let resolve,reject;const promise=new Promise((ok,no)=>{resolve=ok;reject=no;});return {promise,resolve,reject};}
function chunk(type,bytes){const b=Buffer.alloc(bytes.length+12);b.writeUInt32BE(bytes.length,0);b.write(type,4);bytes.copy(b,8);b.writeUInt32BE(png.crc(b.slice(4,b.length-4)),b.length-4);return b;}
function pngFixture(type,depth,raw,w,h,extra){const hdr=Buffer.alloc(13);hdr.writeUInt32BE(w||1,0);hdr.writeUInt32BE(h||1,4);hdr[8]=depth;hdr[9]=type;return Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',hdr)].concat(extra||[],[chunk('IDAT',zlib.deflateSync(Buffer.from(raw))),chunk('IEND',Buffer.alloc(0))]));}
async function rejects(p,code){try{await p;}catch(e){if(code)assert.strictEqual(e.code||e.message,code);return;}throw new Error('Expected rejection '+code);}
function model(p){let now=10000;const m=new Model(p||{}, {get:()=>a,status:()=>'',stopped:()=>true}, {clock:()=>now,decode:async()=>({w:1,h:1,data:Buffer.alloc(4)})});m.active=true;return {m,advance:ms=>{now+=ms;}};}

test('coordinates: explicit lat/lon, invalid values rejected',()=>{assert.deepEqual(geo.parse('55.75, 37.61'),a);assert(!geo.parse('91,0'));assert(!geo.parse('55,75,37,61'));assert(!geo.valid({lat:NaN,lon:0}));assert(geo.valid({lat:0,lon:0}));});
test('geodesic distance and route progress',()=>{assert(Math.abs(geo.distance({lat:0,lon:0},{lat:0,lon:1})-111195)<5);assert(geo.routeProgress([a,b,c],b).remaining>0);assert(geo.routeProgress([a,b],c).offRoute);});
test('static map uses lon,lat; routing uses lat,lon',()=>{const m=api.mapURL(key,a,{fix:a,points:[a,b]});assert(m.includes('ll=37.610000%2C55.750000'));assert(decodeURIComponent(m).includes('pl=c:308BFFFF,w:4,37.610000,55.750000'));assert(decodeURIComponent(api.routeURL(key,a,b)).includes('waypoints=55.750000,37.610000|55.760000,37.630000'));});
test('search text is URL encoded and key mandatory',()=>{assert(api.geocodeURL(key,'Москва & тест').includes('%26'));assert.throws(()=>api.mapURL('',a,{}),/KEY_MISSING/);});
test('overview pads bounds; dateline not silently inverted',()=>{assert(geo.overview([a,b])[0]<a.lon);assert.throws(()=>geo.overview([{lat:0,lon:-179},{lat:0,lon:179}]),/DATELINE/);});
test('route simplification retains endpoints within URL budget',()=>{const pts=Array.from({length:5000},(_,i)=>({lat:55+i/100000,lon:37+Math.sin(i/20)/100}));const out=geo.simplify(pts,100);assert(out.length<=100);assert.deepEqual(out[0],pts[0]);assert.deepEqual(out[out.length-1],pts[4999]);assert(api.mapURL(key,a,{points:pts}).length<5000);});
test('GPS requires affirmative validity; invalid update clears previous fix',()=>{let t=0;const p=new Position(()=>t);assert(!p.accept({latitude:55,longitude:37}));assert(p.accept({coordinatesValid:true,latitude:55,longitude:37}));assert(p.get());p.accept({coordinatesValid:false,latitude:55,longitude:37});assert.strictEqual(p.get(),null);});
test('GPS rejects out of range, numeric strings and stale samples',()=>{let t=0;const p=new Position(()=>t);assert(!p.accept({coordinatesValid:true,latitude:'55',longitude:37}));assert(!p.accept({coordinatesValid:true,latitude:65535,longitude:0}));p.accept({coordinatesValid:1,latitude:0,longitude:0});assert.deepEqual(p.get(),{lat:0,lon:0});t=10001;assert.strictEqual(p.get(),null);});
test('GPS stale clock and vehicle speed have separate freshness',()=>{let t=100;const p=new Position(()=>t);p.accept({coordinatesValid:true,latitude:55,longitude:37});p.acceptSpeed({speedVehicleCentreOfGravity:0});assert(p.stopped());t=6000;assert(!p.stopped());assert(p.get());t=99;assert.strictEqual(p.get(),null);});
test('GPS subscribes only to documented read fields/instances',async()=>{const rows=[];const p=new Position();await p.start({watch:async(i,n,h,l,o)=>{rows.push([i,n,Object.keys(h),o.pollMs]);return {shutdown:async()=>{}};}},{});assert.strictEqual(rows[0][1],'Main_Instance');assert.deepEqual(rows[0][2],['currentLocation']);assert.strictEqual(rows[0][3],2000);await p.close();});
test('route parses all legs and deduplicates join coordinate',()=>{const r=api.parseRoute(routeFixture());assert.strictEqual(r.points.length,3);assert.strictEqual(r.length,3300);assert.strictEqual(r.duration,550);assert.strictEqual(r.traffic,'realtime');});
test('route refuses failed legs, malformed coordinates and missing geometry',()=>{const f=routeFixture();f.route.legs[0].status='FAIL';assert.throws(()=>api.parseRoute(f),/NO_ROUTE/);const g=routeFixture();g.route.legs[0].steps[0].polyline.points=[null];assert.throws(()=>api.parseRoute(g),/BAD_RESPONSE/);assert.throws(()=>api.parseRoute({}),/NO_ROUTE/);});
test('geocoder retains precise addresses and swaps lon/lat response',()=>{const places=api.parsePlaces({response:{GeoObjectCollection:{featureMember:[{GeoObject:{Point:{pos:'37.61 55.75'},metaDataProperty:{GeocoderMetaData:{text:'Москва, адрес'}}}}]}}});assert.deepEqual(places[0],{lat:55.75,lon:37.61,title:'Москва, адрес'});});
test('PNG decodes truecolour and RGBA with proper alpha compositing',async()=>{const rgb=await png.decode(pngFixture(2,8,[0,10,20,30]));assert.deepEqual(Array.from(rgb.data),[10,20,30,255]);const rgba=await png.decode(pngFixture(6,8,[0,0,0,0,0]));assert.deepEqual(Array.from(rgba.data),[255,255,255,255]);});
test('PNG supports indexed colours at 1/2/4/8 bits',async()=>{for(const depth of [1,2,4,8]){const value=1<<(8-depth),p=await png.decode(pngFixture(3,depth,[0,value],1,1,[chunk('PLTE',Buffer.from([1,2,3,10,20,30]))]));assert.deepEqual(Array.from(p.data),[10,20,30,255]);}});
test('PNG supports grayscale and grayscale+alpha',async()=>{const p=await png.decode(pngFixture(0,4,[0,0xf0]));assert.strictEqual(p.data[0],255);const q=await png.decode(pngFixture(4,8,[0,21,255]));assert.strictEqual(q.data[0],21);});
test('PNG filters: sub, up, average, Paeth',async()=>{for(let filter=1;filter<=4;filter++){const p=await png.decode(pngFixture(2,8,[filter,10,20,30]));assert.deepEqual(Array.from(p.data),[10,20,30,255]);}});
test('PNG rejects CRC corruption, truncation, bad filter and oversize',async()=>{const p=pngFixture(2,8,[0,10,20,30]);p[40]^=1;await rejects(png.decode(p),'BAD_PNG');await rejects(png.decode(Buffer.alloc(60)),'BAD_PNG');await rejects(png.decode(pngFixture(2,8,[5,10,20,30])),'BAD_PNG');await rejects(png.decode(pngFixture(2,8,[0,1,2,3],651,1)),'BAD_PNG');});
test('PNG rejects decompression bomb beyond declared dimensions',async()=>{await rejects(png.decode(pngFixture(2,8,Buffer.alloc(1000000))),'BAD_PNG');});
test('no map request without position or explicit destination',async()=>{let calls=0;const x=model({map:async()=>{calls++;}});x.m.position.get=()=>null;await x.m.refreshMap();assert.strictEqual(calls,0);assert.strictEqual(x.m.origin(),null);});
test('coordinate destination works with no geocoder key or network',async()=>{const x=model();await x.m.search('55.75,37.61');x.m.select(x.m.places[0]);assert.strictEqual(x.m.destination.lat,55.75);assert.strictEqual(x.m.mode,'destination');});
test('map requests stop while hidden or paused',async()=>{let calls=0;const x=model({map:async()=>{calls++;return Buffer.alloc(0);}});x.m.active=false;await x.m.refreshMap();x.m.active=true;x.m.enabled=false;await x.m.refreshMap();assert.strictEqual(calls,0);});
test('map throttle and stationary cache reduce network calls',async()=>{let calls=0;const x=model({map:async()=>{calls++;return Buffer.alloc(0);}});assert(await x.m.refreshMap());x.advance(16000);await x.m.refreshMap();assert.strictEqual(calls,1);x.advance(61000);await x.m.refreshMap();assert.strictEqual(calls,2);});
test('zoom change fetches a fresh map immediately without waiting for throttle',async()=>{
    let calls=0;
    const x=model({map:async()=>{calls++;return Buffer.alloc(0);}});
    assert(await x.m.refreshMap());
    assert.strictEqual(calls,1);
    x.m.setZoom(1);
    assert.strictEqual(x.m.mapDue,0);
    assert(await x.m.refreshMap());
    assert.strictEqual(calls,2);
});
test('static map selects documented driving map style',()=>{
    const link=api.mapURL(key,a,{zoom:15});
    assert.strictEqual(new URL(link).searchParams.get('maptype'),'driving');
});
test('old map response cannot overwrite a changed destination',async()=>{const d=deferred(),x=model({map:()=>d.promise});const pending=x.m.refreshMap();x.m.select(c);d.resolve(Buffer.alloc(0));await pending;assert.strictEqual(x.m.image,null);assert(!x.m.mapBusy);});
test('map failure clears busy state and enforces 429 cooldown',async()=>{const x=model({map:async()=>{const e=new Error();e.code='HTTP_429';throw e;}});await x.m.refreshMap();assert(!x.m.mapBusy);assert.strictEqual(x.m.mapDue,70000);assert(/минуту/.test(x.m.status));});
test('route refuses missing GPS; manual origin is explicit',async()=>{const x=model({route:async()=>api.parseRoute(routeFixture())});x.m.position.get=()=>null;x.m.select(c);assert.strictEqual(await x.m.buildRoute(),false);x.m.setManual(a);assert(await x.m.buildRoute());assert.strictEqual(x.m.progress(),null);});
test('discard route response for previous destination',async()=>{const d=deferred(),x=model({route:()=>d.promise});x.m.select(b);const pending=x.m.buildRoute();x.m.select(c);d.resolve(api.parseRoute(routeFixture()));await pending;assert.strictEqual(x.m.route,null);assert(!x.m.routeBusy);});
test('cancelled route cannot resurrect after clear',async()=>{const d=deferred(),x=model({route:()=>d.promise});x.m.select(b);const pending=x.m.buildRoute();x.m.clearRoute();d.resolve(api.parseRoute(routeFixture()));await pending;assert.strictEqual(x.m.route,null);});
test('direct coordinate search invalidates old network search',async()=>{const d=deferred(),x=model({search:()=>d.promise});const pending=x.m.search('Москва');await x.m.search('1,2');d.resolve([a]);await pending;assert.strictEqual(x.m.places[0].lat,1);assert(!x.m.searchBusy);});
test('per-session budget stops requests',async()=>{const x=model({map:async()=>Buffer.alloc(0)});x.m.calls.map=240;await x.m.refreshMap();assert(/Лимит/.test(x.m.status));assert.strictEqual(x.m.calls.map,240);x.m.resetBudget();assert.strictEqual(x.m.calls.map,0);});
test('secrets stored with mode 0600, survive restart and can be erased',()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'yandex-test-'));try{const k=new Keys(dir);k.set('staticKey',key);assert.strictEqual(fs.statSync(k.file).mode&0o777,0o600);assert.strictEqual(new Keys(dir).values.staticKey,key);assert.throws(()=>k.set('staticKey','a\nsecret'),/KEY_FORMAT/);k.clear();assert.deepEqual(new Keys(dir).values,{});}finally{fs.unlinkSync(path.join(dir,'yandex-keys.json'));fs.rmdirSync(dir);}});
test('network endpoint allowlist refuses redirects to arbitrary hosts',async()=>{const http=require(base+'/http');await rejects(http.get('http://static-maps.yandex.ru/v1'),'ENDPOINT_REFUSED');await rejects(http.get('https://evil.example/v1'),'ENDPOINT_REFUSED');await rejects(http.get('https://user:pass@static-maps.yandex.ru/v1'),'ENDPOINT_REFUSED');});

(async()=>{
    let passed=0;const failed=[];
    for(const t of tests){try{await t.fn();passed++;console.log('PASS '+t.name);}catch(e){failed.push(t.name);console.error('FAIL '+t.name+'\n'+e.stack);}}
    console.log(JSON.stringify({suite:'core',node:process.version,passed,failed,total:tests.length,vehicleTested:false}));
    if(failed.length)process.exitCode=1;
})();
