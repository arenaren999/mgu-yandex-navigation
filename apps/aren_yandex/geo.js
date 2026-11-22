'use strict';
// Internal coordinates are always {lat, lon}, in WGS84 degrees.
const R = 6371008.8, RAD = Math.PI / 180;
function number(x) { return typeof x === 'number' && isFinite(x); }
function valid(p) { return !!p && number(p.lat) && number(p.lon) && Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180; }
function distance(a, b) {
    if (!valid(a) || !valid(b)) return Infinity;
    const x = Math.sin((b.lat-a.lat)*RAD/2), y = Math.sin((b.lon-a.lon)*RAD/2);
    return 2*R*Math.asin(Math.min(1, Math.sqrt(x*x+Math.cos(a.lat*RAD)*Math.cos(b.lat*RAD)*y*y)));
}
function parse(text) {
    const m = /^\s*([+-]?\d+(?:\.\d+)?)\s*[,;]\s*([+-]?\d+(?:\.\d+)?)\s*$/.exec(text);
    if (!m) return null;
    const p = {lat:Number(m[1]),lon:Number(m[2])};
    return valid(p) ? p : null;
}
function routeProgress(points, p) {
    if (!valid(p) || !Array.isArray(points) || points.length < 2) return null;
    let best = Infinity, along = 0, total = 0, at = 0;
    const cos = Math.cos(p.lat*RAD);
    for (let i=1;i<points.length;i++) {
        const a=points[i-1], b=points[i], len=distance(a,b);
        const ax=(a.lon-p.lon)*RAD*R*cos, ay=(a.lat-p.lat)*RAD*R;
        const bx=(b.lon-p.lon)*RAD*R*cos, by=(b.lat-p.lat)*RAD*R;
        const dx=bx-ax, dy=by-ay, denom=dx*dx+dy*dy;
        const t=denom ? Math.max(0,Math.min(1,-(ax*dx+ay*dy)/denom)) : 0;
        const d=Math.sqrt(Math.pow(ax+t*dx,2)+Math.pow(ay+t*dy,2));
        if (d<best) { best=d; along=total+t*len; at=i-1; }
        total+=len;
    }
    // Approximate distance to a polyline, NOT lane matching or turn guidance.
    return {offRoute:best>80, deviation:best, remaining:Math.max(0,total-along), segment:at};
}
function overview(points) {
    if (!points.length || points.some(p=>!valid(p))) throw new Error('INVALID_COORDINATES');
    let south=90,north=-90,west=180,east=-180;
    points.forEach(p=>{south=Math.min(south,p.lat);north=Math.max(north,p.lat);west=Math.min(west,p.lon);east=Math.max(east,p.lon);});
    if(east-west>180) throw new Error('DATELINE_UNSUPPORTED');
    const dy=Math.max((north-south)*0.09,0.002), dx=Math.max((east-west)*0.09,0.003);
    return [Math.max(-180,west-dx),Math.max(-85,south-dy),Math.min(180,east+dx),Math.min(85,north+dy)];
}
// Ramer-Douglas-Peucker, bounded for the Static API URL. Whole route stays in memory.
function simplify(points, max) {
    if(points.length<=max) return points.slice();
    let tolerance=0.00001, out=points;
    for(let pass=0;pass<24 && out.length>max;pass++,tolerance*=2) {
        const keep=new Set([0,points.length-1]), stack=[[0,points.length-1]];
        while(stack.length) {
            const pair=stack.pop(), a=points[pair[0]], b=points[pair[1]];
            const dx=b.lon-a.lon,dy=b.lat-a.lat,den=dx*dx+dy*dy;
            let far=tolerance*tolerance, idx=-1;
            for(let i=pair[0]+1;i<pair[1];i++) {
                const p=points[i], t=den?Math.max(0,Math.min(1,((p.lon-a.lon)*dx+(p.lat-a.lat)*dy)/den)):0;
                const d=Math.pow(p.lon-a.lon-t*dx,2)+Math.pow(p.lat-a.lat-t*dy,2);
                if(d>far){far=d;idx=i;}
            }
            if(idx>=0){keep.add(idx);stack.push([pair[0],idx],[idx,pair[1]]);}
        }
        out=Array.from(keep).sort((a,b)=>a-b).map(i=>points[i]);
    }
    if(out.length>max) throw new Error('ROUTE_TOO_COMPLEX');
    return out;
}
module.exports={number,valid,distance,parse,routeProgress,overview,simplify};
