'use strict';
// Render the actual application drawing code; no HTML/CarPlay proxy.
const fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..'),{Canvas}=require(root+'/vendor/kit/runtime/canvas');
const {Position}=require(root+'/apps/aren_yandex/gps'),{Model}=require(root+'/apps/aren_yandex/model'),view=require(root+'/apps/aren_yandex/view');
const m=new Model({},new Position());m.status='Откройте меню и введите ключи Яндекса';
const out=path.join(root,'docs/preview-unconfigured.png'),cv=new Canvas(view.W,view.H);
view.draw(cv,m,m.now());fs.writeFileSync(out,cv.png());console.log(out);
