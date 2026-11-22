# Third-party code and provenance

Project code: GPL-3.0-or-later. Not affiliated with BMW or Yandex.

- `vendor/kit/runtime`, `vendor/kit/tools/{build.py,localize.py,pack_data.py,locale-revisions.json}`,
  `vendor/kit/platform/permissions.json`: cauliflowermossgrape/idrive7-apps,
  commit `e2716cdd8d779141262a078fe192cade6cf26f4b`, MIT.
  [Source](https://github.com/cauliflowermossgrape/idrive7-apps/tree/e2716cdd8d779141262a078fe192cade6cf26f4b).
  Russian atlas copied from `kit/localization/fonts/cyrillic-ru.json` of the same revision.
  MIT notice: `licenses/idrive7-apps-MIT.txt`. Atlas font licences are included.
- `apps/aren_yandex/speller.js`: robertnisipeanu/mgu-store,
  commit `83da03a115fb4073e791413066fd60da607e1932`, GPL-3.0-or-later,
  copyright 2026 Robert Nisipeanu and IterioDev. [Source](https://github.com/robertnisipeanu/mgu-store/blob/83da03a115fb4073e791413066fd60da607e1932/apps/robertn_store/src/speller.js).
- GPS protocol reference (not copied implementation):
  [nhocleopro/hud-widgets position.js](https://github.com/nhocleopro/hud-widgets/blob/e9c3e695f2c18f2f2e03eecddd661144da38eb5b/apps/hud_widgets/position.js),
  and its `docs/PHONE_LINK_FINDINGS.md`, which documents currentLocation fields and getter.

No BMW firmware, BMW SDK, APK of Yandex Maps, map tiles, API keys, user GPS traces,
SSH private keys or service credentials are included. Yandex responses are fetched
only using keys supplied by the owner; their terms are separate from this code licence.

The source archive contains the exact open source runtime used by the package.
`tools/build.py` performs SDK-free packaging using the documented Store donor mechanism.
