'use strict';
// Regression: BMW HMI may keep MAIN marked visible under a native menu.
// The external GPU overlay must hide immediately, and reappear after BACK.
const assert=require('assert');
const {Display}=require('../vendor/kit/runtime/display');
const state={MAIN:true,MENU:false,RESULTS:false,CONFIRM_ERASE:false,SETTINGS:false};
const visible=[],focus=[],calls=[];
const ui={
    rhmi:{getByName:()=>null},
    onVisible:(f)=>visible.push(f),
    onFocus:(f)=>focus.push(f),
    isVisible:(name)=>!!state[name],
    hasFocus:()=>true
};
const settings={get:()=>null,onChange:()=>{}};
const original=Display.prototype._mode;
Display.prototype._mode=function(){};
let d;
try { d=new Display(ui,{info:()=>{},warn:()=>{},error:()=>{}},{screens:[
    {name:'MAIN',kind:'canvas',buttons:[]},
    {name:'MENU',kind:'menu'}, {name:'RESULTS',kind:'menu'}, {name:'CONFIRM_ERASE',kind:'menu'}
]},settings,()=>({bg:'#000000'})); }
finally {Display.prototype._mode=original;}
d.gpu={visible:true,show(on){this.visible=on;calls.push(on);}};
assert(d._shown(),'main canvas begins visible');
// Immediate suppression BEFORE native HMI visibility notifications.
d.navigateTo('MENU');
assert.strictEqual(d._shown(),false);
assert.strictEqual(d.gpu.visible,false);
// Both states can be marked visible simultaneously in BMW stack.
state.MENU=true;visible.forEach(f=>f('MENU',true));
assert.strictEqual(d.navTarget,null);
assert.strictEqual(d._shown(),false);
state.MENU=false;visible.forEach(f=>f('MENU',false));
assert.strictEqual(d._shown(),true);
d.navigateTo('RESULTS');
assert.strictEqual(d._shown(),false);
state.RESULTS=true;visible.forEach(f=>f('RESULTS',true));
assert.strictEqual(d._shown(),false);
state.RESULTS=false;visible.forEach(f=>f('RESULTS',false));
assert.strictEqual(d._shown(),true);
d.navigateTo('CONFIRM_ERASE');
assert.strictEqual(d._shown(),false);
state.CONFIRM_ERASE=true;visible.forEach(f=>f('CONFIRM_ERASE',true));
assert.strictEqual(d._shown(),false);
state.CONFIRM_ERASE=false;visible.forEach(f=>f('CONFIRM_ERASE',false));
assert.strictEqual(d._shown(),true);
state.SETTINGS=true;visible.forEach(f=>f('SETTINGS',true));
assert.strictEqual(d._shown(),false);
state.SETTINGS=false;visible.forEach(f=>f('SETTINGS',false));
assert.strictEqual(d._shown(),true);
console.log(JSON.stringify({suite:'GPU overlay visibility regression',menuNoLongerObscured:true,mainRestore:true,passed:11,vehicleTested:false}));
