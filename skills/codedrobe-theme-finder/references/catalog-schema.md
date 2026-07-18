# CodexSkins catalog contract

The catalog endpoint returns UTF-8 JSON:

```json
{
  "schemaVersion": 1,
  "generatedAt": "ISO-8601",
  "total": 12,
  "themes": []
}
```

Each entry contains localized `name`, `description`, `tags`, plus:

- `id`: stable lowercase slug
- `kind`: `theme` or `skin`
- `mode`: `light`, `dark`, or `mixed`
- `image`: absolute preview URL
- `url`: public detail-page URL
- `installable`: whether the manager can download a `.codedrobe-theme`
- `downloadUrl`: non-null only for hosted installable packages
- `package`: format, version, bytes, and SHA-256 when installable
- `verification.status`: `concept` or `live-verified`
- `verification.platforms`: platforms with real-device evidence
- `guidance`: localized routing instructions

Fail closed on unsupported schema versions. Treat verification platforms as
evidence boundaries, not as a claim that the package cannot run elsewhere.

