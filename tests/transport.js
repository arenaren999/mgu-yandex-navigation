'use strict';
// Simulated HTTPS transport events. No real request and no API credential.
const assert=require('assert'),https=require('https'),EE=require('events'),http=require('../apps/aren_yandex/http');
const original=https.request,endpoint='https://static-maps.yandex.ru/v1?apikey=not-a-real-key';
let passed=0;
async function scenario(name,respond,expected,options){
    let seen,request,response;
    https.request=(opts,cb)=>{
        seen=opts;request=new EE();request.destroy=()=>{request.destroyed=true;};
        request.end=()=>setImmediate(()=>{
            response=new EE();response.destroy=()=>{response.destroyed=true;};
            response.statusCode=200;response.headers={};respond(request,response,cb);
        });return request;
    };
    try{
        const value=await http.get(endpoint,Object.assign({timeout:100},options));
        assert.strictEqual(expected,'OK');assert.strictEqual(value.toString(),'map');
    }catch(e){assert.strictEqual(e.code,expected);assert(!e.message.includes('apikey'));}
    assert.strictEqual(seen.rejectUnauthorized,true);assert.strictEqual(seen.port,443);
    if(expected!=='OK')assert(request.destroyed);
    passed++;console.log('PASS '+name);
}
(async()=>{try{
    await scenario('successful bounded body',(q,r,cb)=>{cb(r);r.emit('data',Buffer.from('map'));r.emit('end');},'OK');
    await scenario('HTTP redirect is refused',(q,r,cb)=>{r.statusCode=302;r.headers.location='https://other.example';cb(r);},'HTTP_302');
    await scenario('large Content-Length refused',(q,r,cb)=>{r.headers['content-length']='99999999';cb(r);},'RESPONSE_TOO_LARGE');
    await scenario('stream over limit refused',(q,r,cb)=>{cb(r);r.emit('data',Buffer.alloc(20));},'RESPONSE_TOO_LARGE',{maxBytes:10});
    await scenario('stalled response hits overall deadline',(q,r,cb)=>{cb(r);},'TIMEOUT',{timeout:20});
    await scenario('certificate failure stays a TLS error',(q,r,cb)=>{q.emit('error',{code:'CERT_HAS_EXPIRED'});},'TLS_ERROR');
    await scenario('truncated response refused',(q,r,cb)=>{cb(r);r.emit('data',Buffer.from('ma'));r.emit('aborted');},'NETWORK');
    console.log(JSON.stringify({suite:'HTTPS boundary with mock transport',node:process.version,passed,liveTLSVerified:false}));
}catch(e){console.error(e.stack);process.exitCode=1;}finally{https.request=original;}})();
