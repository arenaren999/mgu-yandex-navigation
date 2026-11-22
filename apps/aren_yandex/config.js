'use strict';
const fs=require('fs'),path=require('path');
const FIELDS=['staticKey','geocoderKey','routerKey'];
class Keys {
    constructor(dir){this.file=path.join(dir,'yandex-keys.json');this.values={};try{const v=JSON.parse(fs.readFileSync(this.file,'utf8'));FIELDS.forEach(k=>{if(typeof v[k]==='string'&&/^[A-Za-z0-9_-]{12,200}$/.test(v[k]))this.values[k]=v[k];});fs.chmodSync(this.file,0o600);}catch(e){}}
    set(name,value){
        if(FIELDS.indexOf(name)<0||typeof value!=='string'||!/^[A-Za-z0-9_-]{12,200}$/.test(value.trim()))throw new Error('KEY_FORMAT');
        const v=Object.assign({},this.values);v[name]=value.trim();this.write(v);
    }
    write(v){const tmp=this.file+'.tmp';fs.writeFileSync(tmp,JSON.stringify(v),{mode:0o600});fs.chmodSync(tmp,0o600);fs.renameSync(tmp,this.file);this.values=v;}
    clear(){this.write({});}
}
module.exports={Keys,FIELDS};
