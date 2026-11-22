#!/usr/bin/env python3
"""Reproduce the host checks and keep their real stdout. No install operation."""
import argparse, datetime, hashlib, json, os, subprocess, sys, tarfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--node', default='node')
    parser.add_argument('--store', help='Pinned MGU Store checkout (optional)')
    parser.add_argument('--network', action='store_true', help='Unauthenticated HTTPS connectivity probe; no API keys')
    args = parser.parse_args()
    results = ROOT / 'docs/test-results'
    results.mkdir(parents=True, exist_ok=True)
    report = {'testedAtMoscow': datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=3))).isoformat(),
              'vehicleTested': False, 'realBmwSdkTested': False, 'authenticatedYandexApisTested': False}

    def run(name, command):
        completed = subprocess.run(command, cwd=ROOT, text=True, stdout=subprocess.PIPE,
                                   stderr=subprocess.STDOUT, timeout=180)
        (results / (name + '.txt')).write_text(completed.stdout, encoding='utf-8')
        if completed.returncode:
            raise RuntimeError(name + ' failed: ' + completed.stdout[-2000:])
        print(name + (': completed (inspect individual results)' if name == 'network-without-keys' else ': PASS'), flush=True)
        return completed.stdout

    report['node'] = run('node-version', [args.node, '--version']).strip()
    builds = []
    for n in (1, 2):
        builds.append(json.loads(run('build-' + str(n), [sys.executable, 'tools/build.py']).splitlines()[-1]))
    assert builds[0]['sha256'] == builds[1]['sha256'], 'Non-reproducible package'
    report['artifact'] = {'name': 'aren_yandex@0.2.2.tgz', 'bytes': builds[-1]['bytes'],
                          'sha256': builds[-1]['sha256'], 'twoBuildsIdentical': True}
    for name, script in [('core', 'tests/run.js'), ('transport', 'tests/transport.js'), ('ui', 'tests/ui.js'), ('visibility', 'tests/visibility.js')]:
        report[name] = json.loads(run(name, [args.node, script]).splitlines()[-1])
    if args.store:
        report['store'] = json.loads(run('store', [args.node, 'tests/store.js', str(Path(args.store).resolve())]).splitlines()[-1])
    else:
        report['store'] = {'executed': False}
    files = sorted((ROOT / 'dist/aren_yandex/source').rglob('*.js'))
    for p in files:
        subprocess.run([args.node, '--check', str(p)], check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=20)
    report['packagedJavascriptSyntaxChecked'] = len(files)
    print('packaged Node syntax: PASS (' + str(len(files)) + ')', flush=True)
    run('preview', [args.node, 'tools/preview.js'])
    artifact = ROOT / 'dist/aren_yandex@0.2.1.tgz'
    with tarfile.open(artifact, 'r:gz') as tf:
        names = tf.getnames()
        assert all(n.startswith('package/') and '..' not in Path(n).parts for n in names)
        assert len(set(names)) == len(names)
        assert not any('node_modules/oap-sdk' in n or 'yandex-keys.json' in n for n in names)
        assert all(m.isfile() for m in tf.getmembers()), 'Unexpected archive member type'
    report['archive'] = {'files': len(names), 'safePaths': True, 'sdkIncluded': False, 'keysIncluded': False}
    if args.network:
        report['networkWithoutKeys'] = json.loads(run('network-without-keys', [args.node, 'tools/network-check.js']))
    report['notes'] = ['Mock BMW SDK/signals in UI tests; no BMW car connected.',
                       ('Store readers/discovery tested locally; installer never executed.' if args.store else 'MGU Store reader not re-tested in this run; archive format checked only.'),
                       'Unauthenticated connectivity checks do not test working Maps, Geocoder or Router access.']
    (results / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(report, ensure_ascii=False), flush=True)

if __name__ == '__main__':
    main()
