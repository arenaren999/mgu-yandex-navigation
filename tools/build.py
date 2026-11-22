#!/usr/bin/env python3
"""Build an SDK-free OAP package accepted by MGU Store's donor mechanism.

No network, native compiler or BMW SDK is needed on the build host.
MGU Store resolves require('oap-sdk') on the owner's head unit at install.
"""
import argparse, copy, gzip, hashlib, importlib.util, json, os, re, shutil, sys, tarfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
KIT = ROOT / 'vendor/kit'
sys.path.insert(0, str(KIT / 'tools'))
spec = importlib.util.spec_from_file_location('upstream_build', KIT / 'tools/build.py')
upstream = importlib.util.module_from_spec(spec)
spec.loader.exec_module(upstream)

def dump(path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

def archive(directory, output):
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open('wb') as f, gzip.GzipFile(fileobj=f, mode='wb', filename='', mtime=0) as gz, tarfile.open(fileobj=gz, mode='w', format=tarfile.PAX_FORMAT) as tf:
        for p in sorted(directory.rglob('*')):
            if not p.is_file():
                continue
            info = tf.gettarinfo(str(p), 'package/' + p.relative_to(directory).as_posix())
            info.uid = info.gid = info.mtime = 0
            info.uname = info.gname = ''
            info.mode = 0o644
            with p.open('rb') as src:
                tf.addfile(info, src)

def build(app_id='aren_yandex', version=None):
    if not re.fullmatch(r'[a-z][a-z0-9_]{2,55}', app_id):
        raise ValueError('Invalid app id')
    app_dir = ROOT / 'apps' / app_id
    if not app_dir.is_dir():
        app_dir = ROOT / 'apps/aren_yandex'
    app = json.loads((app_dir / 'app.json').read_text())
    app['id'] = app_id
    if version:
        app['version'] = version
    if not re.fullmatch(r'\d+\.\d+\.\d+', app['version']):
        raise ValueError('MGU catalog version must be x.y.z')
    stage = ROOT / 'dist' / app_id
    shutil.rmtree(stage, ignore_errors=True)
    source = stage / 'source'
    source.mkdir(parents=True)
    js = source / 'javascript'
    js.mkdir()
    # Only the open community runtime. No firmware, compiled interface definitions or SDK.
    shutil.copytree(KIT / 'runtime', js / 'kit', ignore=shutil.ignore_patterns('__pycache__', '*.pyc'))
    for p in app_dir.glob('*.js'):
        shutil.copyfile(p, js / ('app.js' if p.name == 'main.js' else p.name))
    manifest = upstream.manifest_for(copy.deepcopy(app))
    missing = upstream.fit_to_unit(manifest, app)
    if missing:
        dump(js / 'kit/missing-interfaces.json', missing)
    dump(source / 'manifest.json', manifest)
    shutil.copyfile(KIT / 'platform/permissions.json', source / 'permissions.json')
    pkg = {
        'name': app_id, 'version': app['version'], 'description': app['description'], 'main': 'javascript/app.js',
        'license': 'GPL-3.0-or-later', 'author': app['vendor'], 'mguHmi': ['ID7'], 'mguInternet': True,
        'engines': {'node': '>=8.16.2'}, 'oapAppSettings': {
            'maxDiskUsage': 20971520, 'cpuLimit': 40, 'memoryThresholdKB': 196608,
            'priority': 'PRIO_LOW', 'visibility': 'FOREGROUND', 'latencyClass': 'FOREGROUND',
            'loggingId': app['loggingId'], 'userLoginRequired': False, 'backgroundPriority': 200,
            'someipManifest': 'manifest.json'
        }
    }
    dump(source / 'package.json', pkg)
    dump(source / 'npm-shrinkwrap.json', {'name': app_id, 'version': app['version'], 'lockfileVersion': 1})
    dump(source / 'config/base.json', {'rhmiLoadingEnabled': True, 'entryPointLoadingEnabled': True, 'settings': {app_id: {}}})
    xml, ui, strings, states = upstream.build_ui(app, 'en', 'ID7')
    upstream.unicode_resources(ui, strings, 'en')
    dump(js / 'kit/app-spec.json', dict(app, stateIds=states))
    dump(js / 'kit/locale.json', {'language': 'ru', 'strings': json.loads((KIT / 'runtime/locales/ru.json').read_text())})
    rhmi = source / 'rhmiData'
    name = app_id + '_icon.png'
    data = {'schemaVersion': '1.3.0', 'application': {
        'uuid': upstream.u(app_id, 'app'), 'type': 'OnlineApp', 'name': app_id, 'vendor': app['vendor'],
        'version': app['version'], 'defaultLanguage': 'ru_RU',
        'stringBundleUuid': upstream.u(app_id, 'strings'), 'resourceBundleUuid': upstream.u(app_id, 'resources'),
        'entryPoints': [{'name': app_id.upper() + '_ENTRY', 'uuid': upstream.u(app_id, 'entry'),
            'textId': upstream.sid(app_id, 'TITLE'), 'icon': name, 'insertionStateId': 20974,
            'insertionFocusId': 2, 'insertionMode': 'INSERT_BELOW', 'insertionOrder': 0,
            'insertionPriority': 0, 'previewType': 'NONE', 'bookmarkable': True, 'private': False,
            'appearance': 'DEFAULT', 'isGroupHeader': False, 'insertionGroup': 0}],
        'uiDescriptions': [{'applicationFilePath': './uiDescriptions/ID7/application.xml',
            'uiDescriptionFilePath': './uiDescriptions/ID7/uiDescription.json', 'hmi': ['ID7']}],
        'variantGroups': [{'stringsPath': './variantGroups/Common/texts', 'resourcesPath': './variantGroups/Common/images',
            'hmi': ['ID7'], 'brands': ['BMW']}]
    }}
    dump(rhmi / 'application.json', data)
    dump(rhmi / 'uiDescriptions/ID7/uiDescription.json', ui)
    (rhmi / 'uiDescriptions/ID7/application.xml').write_text(xml, encoding='utf-8')
    for lang in upstream.LANGS:
        dump(rhmi / ('variantGroups/Common/texts/' + lang + '.json'), strings)
    icon = rhmi / ('variantGroups/Common/images/' + name)
    icon.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(app_dir / 'icon.png', icon)
    shutil.copyfile(icon, source / 'icon.png')
    shutil.copyfile(ROOT / 'LICENSE', source / 'LICENSE')
    shutil.copytree(ROOT / 'licenses', source / 'licenses')
    shutil.copyfile(ROOT / 'THIRD_PARTY_NOTICES.md', source / 'THIRD_PARTY_NOTICES.md')
    artifact = ROOT / 'dist' / (app_id + '@' + app['version'] + '.tgz')
    archive(source, artifact)
    digest = hashlib.sha256(artifact.read_bytes()).hexdigest()
    component = {'id': app_id, 'kind': 'app', 'version': app['version'], 'title': app['title'] + ' · Experimental',
        'description': app['description'], 'author': app['vendor'], 'mguHmi': ['ID7'], 'uninstallable': True,
        'requires': {'mgu-deploy': '0.8.27', 'mgu-uplink': '0.7.13'},
        'artifact': {'name': artifact.name, 'url': artifact.name, 'size': artifact.stat().st_size, 'sha256': digest}}
    usb = ROOT / 'dist/usb/mgu-repo/mgu-yandex-navigation'
    usb.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(artifact, usb / artifact.name)
    dump(usb / 'catalog.json', {'schema': 2, 'components': [component]})
    dump(ROOT / 'dist/catalog.json', {'schema': 2, 'components': [component]})
    (ROOT / 'dist/SHA256SUMS').write_text(digest + '  ' + artifact.name + '\n')
    if os.environ.get('MGU_OUT'):
        shutil.copyfile(artifact, Path(os.environ['MGU_OUT']) / artifact.name)
    print(json.dumps({'artifact': str(artifact), 'bytes': artifact.stat().st_size, 'sha256': digest,
        'screens': list(states), 'sdk': 'resolved by MGU Store on the car', 'vehicle_tested': False}, ensure_ascii=False))
    return artifact

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--id', default='aren_yandex')
    parser.add_argument('--version')
    args = parser.parse_args()
    build(args.id, args.version)
