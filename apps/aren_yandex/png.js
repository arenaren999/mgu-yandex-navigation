'use strict';
const zlib=require('zlib');
const table=new Uint32Array(256);
for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;table[n]=c>>>0;}
function crc(buf){let c=0xffffffff;for(let i=0;i<buf.length;i++)c=table[(c^buf[i])&255]^(c>>>8);return (c^0xffffffff)>>>0;}
function bad(){const e=new Error('BAD_PNG');e.code='BAD_PNG';return e;}
function paeth(a,b,c){const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;}
function boundedInflate(buf,limit){return new Promise((resolve,reject)=>{
    const stream=zlib.createInflate(),chunks=[];let n=0,done=false;
    function fail(){if(done)return;done=true;stream.destroy();reject(bad());}
    stream.on('data',b=>{n+=b.length;if(n>limit)fail();else chunks.push(b);});
    stream.on('error',fail);stream.on('end',()=>{if(!done){done=true;if(n!==limit)reject(bad());else resolve(Buffer.concat(chunks));}});
    stream.end(buf);
});}
async function decode(buf) {
    if(!Buffer.isBuffer(buf)||buf.length>3*1024*1024||buf.length<45||buf.slice(0,8).toString('hex')!=='89504e470d0a1a0a')throw bad();
    let off=8,w=0,h=0,depth=0,type=-1,palette=null,alpha=null,end=false,idat=false,idatEnded=false;const compressed=[];
    while(off+12<=buf.length) {
        const n=buf.readUInt32BE(off),name=buf.toString('ascii',off+4,off+8),start=off+8,stop=start+n;
        if(n>3*1024*1024||stop+4>buf.length||crc(buf.slice(off+4,stop))!==buf.readUInt32BE(stop))throw bad();
        const data=buf.slice(start,stop);
        if(!w&&name!=='IHDR')throw bad();
        if(name==='IHDR') {
            if(w||n!==13)throw bad();w=data.readUInt32BE(0);h=data.readUInt32BE(4);depth=data[8];type=data[9];
            if(!w||!h||w>650||h>450||data[10]||data[11]||data[12])throw bad();
            if([0,2,3,4,6].indexOf(type)<0||([0,3].indexOf(type)>=0?[1,2,4,8].indexOf(depth)<0:depth!==8))throw bad();
        } else if(name==='PLTE') {if(idat||palette||!n||n>768||n%3)throw bad();palette=data;}
        else if(name==='tRNS') {if(idat||alpha)throw bad();alpha=data;}
        else if(name==='IDAT'){if(idatEnded)throw bad();idat=true;compressed.push(data);}
        else if(name==='IEND'){if(n||!idat)throw bad();end=true;off=stop+4;break;}
        else if(name[0]===name[0].toUpperCase())throw bad();
        if(idat&&name!=='IDAT')idatEnded=true;
        off=stop+4;
    }
    if(!end||off!==buf.length||(type===3&&!palette))throw bad();
    const channels={0:1,2:3,3:1,4:2,6:4}[type], stride=Math.ceil(w*channels*depth/8), bpp=Math.max(1,Math.ceil(channels*depth/8));
    const raw=await boundedInflate(Buffer.concat(compressed),(stride+1)*h),scan=Buffer.alloc(stride*h);
    for(let y=0;y<h;y++) {
        const filter=raw[y*(stride+1)];if(filter>4)throw bad();
        for(let x=0;x<stride;x++) {
            const i=y*stride+x,a=x>=bpp?scan[i-bpp]:0,b=y?scan[i-stride]:0,c=y&&x>=bpp?scan[i-stride-bpp]:0;
            const predictor=[0,a,b,Math.floor((a+b)/2),paeth(a,b,c)][filter];
            scan[i]=(raw[y*(stride+1)+1+x]+predictor)&255;
        }
    }
    const rgba=Buffer.alloc(w*h*4);
    for(let y=0;y<h;y++)for(let x=0;x<w;x++) {
        const dest=(y*w+x)*4,src=y*stride+x*channels;let a=255,r,g,b;
        if(type===0||type===3) {
            const bits=x*depth, sample=(scan[y*stride+(bits>>3)]>>(8-depth-(bits%8)))&((1<<depth)-1);
            if(type===3){if(sample*3+2>=palette.length)throw bad();r=palette[sample*3];g=palette[sample*3+1];b=palette[sample*3+2];if(alpha&&sample<alpha.length)a=alpha[sample];}
            else {r=g=b=Math.round(sample*255/((1<<depth)-1));if(alpha&&alpha.length===2&&sample===alpha.readUInt16BE(0))a=0;}
        } else if(type===2||type===6){r=scan[src];g=scan[src+1];b=scan[src+2];if(type===6)a=scan[src+3];else if(alpha&&alpha.length===6&&r===alpha.readUInt16BE(0)&&g===alpha.readUInt16BE(2)&&b===alpha.readUInt16BE(4))a=0;}
        else {r=g=b=scan[src];a=scan[src+1];}
        // Renderer images are opaque; composite transparency onto a light map background.
        rgba[dest]=Math.round((r*a+255*(255-a))/255);rgba[dest+1]=Math.round((g*a+255*(255-a))/255);rgba[dest+2]=Math.round((b*a+255*(255-a))/255);rgba[dest+3]=255;
    }
    return {w,h,data:rgba};
}
module.exports={decode,crc};
