'use strict';
const geo = require('./geo');
const IFACE='de.bmw.infotainment.navigation.positioning.Positioning';
const SPEED='de.bmw.infotainment.vehicle.Vehicle2';
const mono=()=>{const t=process.hrtime();return t[0]*1000+t[1]/1e6;};
// currentLocation schema corroborated by nhocleopro/hud-widgets/position.js.
// No CAN scaling guess, no implicit simulation, no writes to the vehicle.
class Position {
    constructor(clock) { this.clock=clock||mono;this.fix=null;this.at=null;this.speed=null;this.speedAt=null;this.events=0;this.error=null;this.subs=[]; }
    accept(v) {
        this.events++;
        if(!v || (v.coordinatesValid!==true && v.coordinatesValid!==1) || !geo.valid({lat:v.latitude,lon:v.longitude})) {
            this.fix=null;this.at=null;return false;
        }
        this.fix={lat:v.latitude,lon:v.longitude};this.at=this.clock();return true;
    }
    acceptSpeed(v) {
        const n=v && v.speedVehicleCentreOfGravity;
        if(!geo.number(n)||n<0||n>=65535) {this.speed=null;this.speedAt=null;return;}
        this.speed=n/64;this.speedAt=this.clock();
    }
    get() {
        if(!this.fix||this.clock()-this.at>10000||this.clock()<this.at) return null;
        return {lat:this.fix.lat,lon:this.fix.lon};
    }
    stopped() {return this.speed!==null && this.speedAt!==null && this.clock()-this.speedAt<5000 && this.speed<1;}
    status() {return this.get()?'GPS автомобиля':this.fix?'GPS устарел':this.events?'Нет достоверного GPS':'Ожидание GPS автомобиля';}
    async start(signals,log) {
        for(const row of [[IFACE,'Main_Instance',{currentLocation:v=>this.accept(v)}],[SPEED,'1',{statusCarSpeed2:v=>this.acceptSpeed(v)}]]) {
            try {
                const sub=await signals.watch(row[0],row[1],row[2],log,{pollMs:2000});
                this.subs.push(sub);
                if(sub.error) this.error='Сервис '+row[0].split('.').pop()+' недоступен';
            } catch(e) { this.error='GPS: интерфейс недоступен'; }
        }
    }
    close() {return Promise.all(this.subs.map(s=>s.shutdown()));}
}
module.exports={Position,IFACE,SPEED,mono};
