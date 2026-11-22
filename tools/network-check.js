'use strict';
// No keys: expected 400/401/403 proves TLS+HTTP reachability, NOT successful API use.
const http=require('../apps/aren_yandex/http');
const checks=[['static','https://static-maps.yandex.ru/v1?ll=37.61,55.75&z=12'],['geocoder','https://geocode-maps.yandex.ru/v1?geocode=Moscow&format=json'],['router','https://api.routing.yandex.net/v2/route?waypoints=55.75,37.61%7C55.76,37.63']];
Promise.all(checks.map(async c=>{
    try{await http.get(c[1],{maxBytes:100000});return {service:c[0],status:'HTTP_200',tls:true};}
    catch(e){return {service:c[0],status:e.code,tls:/^HTTP_/.test(e.code)};}
})).then(results=>console.log(JSON.stringify({node:process.version,host:'development container',keyProvided:false,results,vehicleTested:false},null,2)));
