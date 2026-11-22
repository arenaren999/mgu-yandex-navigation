'use strict';
// Run against the real pinned MGU Store checkout, not a reimplementation of its parser.
// This reads packages/catalogs only. It never invokes an installer or modifies the host.
const fs=require('fs'),path=require('path'),assert=require('assert'),crypto=require('crypto'),os=require('os');
const root=path.resolve(__dirname,'..'),store=process.argv[2];
if(!store){console.error('Usage: node tests/store.js /path/to/mgu-store');process.exit(2);}
const js=path.resolve(store,'native/mgu-updater/js');
const tar=require(js+'/tar'),sources=require(js+'/sources'),catalog=require(js+'/catalog');
(async()=>{
    const raw=fs.readFileSync(root+'/dist/aren_yandex@0.2.0.tgz');
    const members=await tar.untgz(raw,20*1024*1024),info=sources.packageInfo(members);
    assert.strictEqual(info.pkg.name,'aren_yandex');assert.strictEqual(info.pkg.version,'0.2.0');
    assert.deepEqual(info.hmi,['ID7']);assert(info.icon&&info.icon.packaged);assert(info.title.includes('Yandex'));
    assert(members.some(m=>m.name==='package/'+info.pkg.main));
    assert(!members.some(m=>/node_modules\/oap-sdk|yandex-keys\.json|\.pem$|\.key$/.test(m.name)));
    assert(members.some(m=>m.name.endsWith('/mgu.js')&&m.data.toString().includes("require('oap-sdk')")));
    const entry=sources.packageEntry(members,raw,{url:'aren_yandex@0.2.0.tgz'},'tgz');
    assert.strictEqual(entry.id,'aren_yandex');assert.strictEqual(entry.artifact.size,raw.length);
    const reader=sources.reader({type:'usb',root:root+'/dist/usb/mgu-repo/mgu-yandex-navigation'},{});
    const cat=await reader.catalog();assert.strictEqual(cat.components.length,1);
    const c=cat.components[0],bytes=await reader.artifact(c);assert(bytes.equals(raw));
    assert.strictEqual(c.artifact.sha256,crypto.createHash('sha256').update(bytes).digest('hex'));
    assert.deepEqual(c.mguHmi,['ID7']);assert(c.requires['mgu-uplink']);
    const mounts=path.join(os.tmpdir(),'mgu-yandex-mounts-'+process.pid);
    let discovered;
    try{
        fs.writeFileSync(mounts,'/dev/test '+root+'/dist/usb vfat rw 0 0\n');
        discovered=sources.usbSources(mounts,[root+'/dist']);
        assert.strictEqual(discovered.length,1);assert(discovered[0].root.endsWith('mgu-repo/mgu-yandex-navigation'));
    }finally{fs.unlinkSync(mounts);}
    const planned=catalog.plan([{entry:c,source:discovered[0].id}],[]);
    assert.strictEqual(planned[0].status,'available');
    const src=await sources.reader({type:'folder',path:root},{}).catalog();
    assert.strictEqual(src.components.length,1,JSON.stringify(src.skipped));
    assert(!src.skipped||src.skipped.length===0,JSON.stringify(src.skipped));
    assert(src.components[0].script.python==='tools/build.py');
    console.log(JSON.stringify({suite:'MGU Store upstream package and USB/source readers',node:process.version,
        artifact:entry.artifact.name,bytes:raw.length,sha256:c.artifact.sha256,members:members.length,
        packageParsed:true,usbCatalogParsed:true,usbArtifactVerified:true,sourceCatalogParsed:true,
        usbDiscoveryWithFixture:true,installListStatus:planned[0].status,
        sdkIncluded:false,installerExecuted:false,vehicleTested:false}));
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
