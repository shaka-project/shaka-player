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
