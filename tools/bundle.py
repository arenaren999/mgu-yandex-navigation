#!/usr/bin/env python3
"""Package the already-verified artifact and matching source for the owner."""
import hashlib, json, zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
VERSION = '0.2.0'
NAME = 'MGU-Yandex-Navigation-' + VERSION
artifact = ROOT / ('dist/aren_yandex@' + VERSION + '.tgz')
report = json.loads((ROOT / 'docs/test-results/report.json').read_text())
assert hashlib.sha256(artifact.read_bytes()).hexdigest() == report['artifact']['sha256']
assert report['core']['failed'] == [] and report['ui']['smokePassed']
assert report['store']['usbArtifactVerified'] and report['artifact']['twoBuildsIdentical']
stage = ROOT / 'dist/aren_yandex/source/javascript'
for p in (ROOT / 'apps/aren_yandex').glob('*.js'):
    target = stage / ('app.js' if p.name == 'main.js' else p.name)
    assert p.read_bytes() == target.read_bytes(), 'Source changed after build: ' + p.name

start = '''# MGU Yandex Navigation 0.2.0 — начать здесь

Продолжение проекта для BMW X6 G06 2021, iDrive 7. Готов экспериментальный пакет для установки через MGU Store. На автомобиле пока не испытан.

1. На MacBook откройте папку USB.
2. Скопируйте из неё папку mgu-repo в корень флешки, которую BMW распознаёт.
3. В BMW: MGU Store → USB → MGU Yandex Navigation · Experimental 0.2.0 → Install.
4. После установки откройте приложение и в меню введите свои ключи Яндекса.

Для карты нужен Static API, для поиска — HTTP Геокодер, для маршрута — API Получение деталей маршрута. Без ключей появится экран ожидания. Интернет MGU должен работать через uplink. CarPlay не требуется.

Store требует mgu-deploy от 0.8.27 и mgu-uplink от 0.7.13. Пакет не содержит BMW SDK: Store подготавливает его из штатного приложения непосредственно на автомобиле. Этот этап ещё не испытан.

Голосового ведения, подсказок поворотов и HUD в 0.2.0 нет. Реализованы просмотр карты, поиск адресов, линия маршрута и подключение к штатному GPS; живые API с ключом и GPS этой машины требуют проверки.

- INSTALL_RU.md — подробная установка, настройка и устранение ошибок.
- TEST_REPORT.md — что действительно собрано и проверено.
- USB — два файла для Store; сам tgz распаковывать не надо.
- SOURCE — весь исходный код, лицензии, сборка, тесты, архитектура и кадр интерфейса.
- SHA256SUMS — контрольная сумма установочного tgz.

Сетевой источник GitHub пока не опубликован. Это готовый USB-способ установки через тот же Store.
'''
output = ROOT / ('dist/' + NAME + '.zip')
count = 0
with zipfile.ZipFile(output, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    def add(name, data):
        global count
        zi = zipfile.ZipInfo(NAME + '/' + name, (2026, 11, 22, 12, 0, 0))
        zi.compress_type = zipfile.ZIP_DEFLATED
        zi.external_attr = 0o644 << 16
        z.writestr(zi, data)
        count += 1
    add('START_HERE_RU.md', start.encode('utf-8'))
    for doc in ('INSTALL_RU.md', 'TEST_REPORT.md'):
        text = (ROOT / 'docs' / doc).read_text(encoding='utf-8')
        if doc == 'TEST_REPORT.md':
            text = text.replace('(test-results/', '(SOURCE/docs/test-results/')
        add(doc, text.encode('utf-8'))
    add('SHA256SUMS', (ROOT / 'dist/SHA256SUMS').read_bytes())
    for p in sorted((ROOT / 'dist/usb').rglob('*')):
        if p.is_file():
            add('USB/' + p.relative_to(ROOT / 'dist/usb').as_posix(), p.read_bytes())
    for p in sorted(ROOT.rglob('*')):
        rel = p.relative_to(ROOT)
        if not p.is_file() or any(c in ('dist', '.git', 'node_modules', '__pycache__', 'upstream-store') for c in rel.parts) or p.suffix == '.pyc':
            continue
        assert p.name not in ('yandex-keys.json', 'settings.json'), 'Secret/config file in source'
        add('SOURCE/' + rel.as_posix(), p.read_bytes())
with zipfile.ZipFile(output) as z:
    assert z.testzip() is None
    packaged = z.read(NAME + '/USB/mgu-repo/mgu-yandex-navigation/' + artifact.name)
    assert packaged == artifact.read_bytes()
print(json.dumps({'file': str(output), 'bytes': output.stat().st_size, 'files': count,
                  'sha256': hashlib.sha256(output.read_bytes()).hexdigest(),
                  'artifactSha256': report['artifact']['sha256'], 'vehicleTested': False}))
