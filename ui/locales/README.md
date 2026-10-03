# Maintenance of translations

Most translations are maintained by Google, but need internal scripts run to
sync between our internal translation system and GitHub.  Changes made directly
on GitHub are welcome, but need to be pushed back into Google's internal
systems by a Googler to avoid having them overwritten later.

The following locales are fake "meta-languages" that are used only for testing.
They are automatically maintained by our internal systems:
 - ar-XB (Right-to-left English (not Arabic), to help identify RTL issues)
 - en-XA (Accented English, accents added to help spot hard-coded text)

The following locales are not maintained by Google at all, and must be kept
up-to-date by the community:
 - oc (Occitan)
 - sjn (Sindarin, see sjn-translations.yaml for more information)

# Translations dashboard

`dashboard.html` shows the state of every translation: a coverage overview per
language, a matrix of messages by language with missing or suspicious
translations highlighted, and an editor for each language.

To edit translations or add a new language, run:

```sh
python3 build/translations.py
```

This opens the dashboard and saves your changes directly to the JSON files in
this folder.  Review them with `git diff` before sending a pull request.

The same page also works as a read-only report from any web server that serves
this folder, such as the nightly demo on GitHub Pages.  In that mode, edits are
downloaded as JSON files instead of saved.

# File format

`source.json` defines every message, with a description to give translators
context.  Each locale file maps message IDs to translated strings.  Keys must be
sorted alphabetically and formatted as `json.dumps(..., indent=2,
sort_keys=True)` produces it.  `python3 build/check.py` verifies this, and
`python3 build/check.py --fix` rewrites the files in the expected format.
