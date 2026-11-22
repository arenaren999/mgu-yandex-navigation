'use strict';
const https=require('https'), url=require('url');
const ALLOWED=['static-maps.yandex.ru','geocode-maps.yandex.ru','api.routing.yandex.net'];
function failure(code) {const e=new Error(code);e.code=code;return e;}
// Bounded body AND overall deadline, TLS validation on; URLs never enter logs.
function get(address,options) {
    const opts=options||{}, parsed=url.parse(address);
    if(parsed.protocol!=='https:'||parsed.auth||parsed.port||ALLOWED.indexOf(parsed.hostname)<0) return Promise.reject(failure('ENDPOINT_REFUSED'));
    return new Promise((resolve,reject)=>{
        let size=0,done=false,req=null,res=null;
        const chunks=[],limit=opts.maxBytes||3*1024*1024;
        const finish=(err,value)=>{
            if(done)return;done=true;clearTimeout(timer);
            if(err){if(res)res.destroy();if(req)req.destroy();reject(err);}else resolve(value);
        };
        const timer=setTimeout(()=>finish(failure('TIMEOUT')),opts.timeout||12000);
        req=https.request({hostname:parsed.hostname,port:443,path:parsed.path,method:'GET',rejectUnauthorized:true,
            headers:{'User-Agent':'MGUYandexNavigation/0.2.0','Accept':opts.image?'image/png':'application/json','Accept-Encoding':'identity'}},r=>{
            res=r;
            if(r.statusCode!==200){finish(failure('HTTP_'+r.statusCode));return;}
            if(Number(r.headers['content-length'])>limit){finish(failure('RESPONSE_TOO_LARGE'));return;}
            r.on('data',chunk=>{size+=chunk.length;if(size>limit)finish(failure('RESPONSE_TOO_LARGE'));else chunks.push(chunk);});
            r.on('error',()=>finish(failure('NETWORK')));
            r.on('aborted',()=>finish(failure('NETWORK')));
            r.on('end',()=>finish(null,Buffer.concat(chunks)));
        });
        req.on('error',e=>finish(failure(/CERT|TLS|SSL|VERIFY/.test(String(e.code))?'TLS_ERROR':'NETWORK')));
        req.end();
    });
}
module.exports={get,failure,ALLOWED};
