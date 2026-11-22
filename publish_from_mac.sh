#!/bin/sh
set -eu
# Запускать в распакованной папке SOURCE. Не хранит и не запрашивает секреты API Яндекса.
cd "$(dirname "$0")"
if ! command -v git >/dev/null 2>&1; then echo 'Требуется git на Mac (Xcode Command Line Tools)' >&2; exit 1; fi
if [ "$#" -ne 1 ]; then echo 'Пример: sh publish_from_mac.sh arenaren999/mgu-yandex-navigation' >&2; exit 2; fi
case "$1" in *[!a-zA-Z0-9_./-]*|/*|*..*|*//*|'') echo 'Неверный owner/repo' >&2; exit 2;; esac
if [ -d .git ]; then echo 'Уже git-каталог; не выполняю повторный push' >&2; exit 2; fi
# Не запускает git push, пока репозиторий GitHub не создан и пользователь явно не подтвердил адрес.
remote="https://github.com/$1.git"
printf 'Публикация исходного кода в %s
' "$remote"
printf 'Подтверждаете адрес? [y/N]: '
read ans
[ "$ans" = y ] || [ "$ans" = Y ] || exit 2

git init -b main
git add -A
git commit -m 'MGU Yandex Navigation 0.2.1 experimental source'
git remote add origin "$remote"
git push -u origin main
printf '
Готово: откройте репозиторий в GitHub, затем добавьте GitHub-source branch/main в MGU Store.
'
