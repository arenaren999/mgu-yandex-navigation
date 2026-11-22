'use strict';
const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path'),Module=require('module');
const root=path.resolve(__dirname,'..'),source=path.join(root,'dist/aren_yandex/source/javascript');
const spec=require(source+'/kit/app-spec.json'),{Canvas}=require(source+'/kit/canvas'),record=require(source+'/kit/record');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mgu-ui-'));
const handlers={},fields={},texts={},loops={},visible=[],focus=[];let shown='MAIN',impl=null,now=20000,frames=0,spelling=null;
const defaults={};spec.settings.forEach(s=>{defaults[s.key]=s.default;});
const log={info:()=>{},warn:()=>{},error:()=>{},debug:()=>{}};
const names=new Set();
const desc=require(path.join(root,'dist/aren_yandex/source/rhmiData/uiDescriptions/ID7/uiDescription.json'));
Object.keys(desc.containers).forEach(id=>Object.keys(desc.containers[id].components).forEach(cid=>names.add(desc.containers[id].components[cid].name)));
function named(n){assert(names.has(n),'undeclared RHMI component '+n);}
const ctx={app:{},dataDir:dir,log,
    settings:{get:k=>defaults[k],onChange:()=>{}},
    canvas:(w,h)=>new record.Recorder(w,h),
    signals:{watch:async(i,n,h)=>{fields[i]=h;return {shutdown:async()=>{}};}},
    loop:(s,f,fn)=>{loops[s]=fn;},
    ui:{
        onClick:(n,fn)=>{named(n);handlers[n]=fn;},onVisible:fn=>visible.push(fn),onFocus:fn=>focus.push(fn),
        isVisible:n=>shown===n,hasFocus:()=>true,
        text:async(n,t)=>{named(n);texts[n]=t;},visible:async(n)=>named(n),
        open:async(n)=>{assert(spec.stateIds[n],'unknown state '+n);visible.forEach(fn=>fn(shown,false));shown=n;visible.forEach(fn=>fn(shown,true));},
        image:async(n,r)=>{named(n);assert(r.words().length>50);const cv=new Canvas(r.w,r.h);record.play(r,cv);const data=cv.png();assert(data.length>1000);frames++;}
    }};
const original=Module._load;
Module._load=function(request,parent,isMain){
    if(parent&&parent.filename===path.join(source,'app.js')&&request==='./kit/mgu')return {run:x=>{impl=x;}};
    if(parent&&parent.filename===path.join(source,'app.js')&&request==='./speller')return {spell:async()=>spelling};
    return original.apply(this,arguments);
};
require(source+'/app.js');Module._load=original;
(async()=>{try{
    assert(impl&&impl.start);const app=await impl.start(ctx);await new Promise(r=>setImmediate(r));
    const m=app.model;m.now=()=>now;m.provider.get=async()=>{throw new Error('NETWORK');};
    assert(!m.destination&&!m.origin());await loops.MAIN();assert.strictEqual(frames,1);
    await handlers.BTN_MENU();assert.strictEqual(shown,'MENU');assert(texts.KEY_STATIC.includes('ввести'));
    spelling='00000000-0000-0000-0000-000000000000';await handlers.KEY_STATIC();assert.strictEqual(app.keys.values.staticKey,spelling);
    assert(!JSON.stringify(texts).includes(spelling),'key leaked into status');
    spelling='55.75,37.61';await handlers.BTN_SEARCH();assert.strictEqual(shown,'RESULTS');await handlers.RESULT_0();assert.strictEqual(shown,'MAIN');assert.strictEqual(m.destination.lat,55.75);
    await handlers.BTN_ROUTE();assert.strictEqual(m.route,null);assert(/GPS/.test(m.status));
    spelling='55.74,37.60';await handlers.MANUAL();assert(m.manual);assert.strictEqual(shown,'MAIN');
    await handlers.BTN_LOCATE();assert.strictEqual(m.manual,null);
    fields['de.bmw.infotainment.navigation.positioning.Positioning'].currentLocation({coordinatesValid:true,latitude:55.74,longitude:37.60});assert(m.origin());
    await handlers.BTN_PLUS();assert.strictEqual(m.zoom,16);await handlers.BTN_MINUS();assert.strictEqual(m.zoom,15);
    await handlers.PAUSE();assert.strictEqual(m.enabled,false);await handlers.PAUSE();assert.strictEqual(m.enabled,true);
    await handlers.ERASE_KEYS();assert.strictEqual(shown,'CONFIRM_ERASE');await handlers.ERASE_NO();assert(app.keys.values.staticKey);
    await handlers.ERASE_KEYS();await handlers.ERASE_YES();assert.deepEqual(app.keys.values,{});assert.strictEqual(m.destination,null);
    now+=1000;await loops.MAIN();assert.strictEqual(frames,2);
    console.log(JSON.stringify({suite:'UI with mock BMW SDK/signals',node:process.version,smokePassed:true,frames,handlers:Object.keys(handlers).length,vehicleTested:false}));
}catch(e){console.error(e.stack);process.exitCode=1;}finally{
    fs.readdirSync(dir).forEach(f=>fs.unlinkSync(path.join(dir,f)));fs.rmdirSync(dir);
}})();
