# CodexSkins submission API

## Endpoint

```text
POST https://www.codexskins.org/api/submissions
Content-Type: multipart/form-data
```

No login or API key is required. Cloudflare rate-limits anonymous requests by
connecting IP and signed-in requests by account. Browser requests with a
foreign `Origin` are rejected; CLI clients normally omit `Origin`.

Set `CODEXSKINS_API_BASE` only when the user explicitly targets another
environment, such as local or staging.

## Fields

| Field | Required | Contract |
| --- | --- | --- |
| `name` | yes | 2–80 characters |
| `creatorName` | no | up to 80 characters; defaults to Anonymous |
| `description` | no | up to 1000 characters |
| `sourceUrl` | no | HTTP(S), up to 500 characters |
| `preview` | yes | JPG/PNG/WebP themed-workspace capture, up to 10 MB |
| `package` | no | `.codedrobe-theme` or `.zip`, up to 30 MB |
| `rightsConfirmed` | yes | literal `true` |

The server infers `theme` when `package` is present and `skin` otherwise. New
records always enter `pending` moderation.

## Success

```json
{
  "ok": true,
  "submission": {
    "id": "<uuid>",
    "status": "pending"
  }
}
```

## Errors

- `400`: invalid field, file, URL, or rights confirmation
- `403`: a browser request used an untrusted Origin
- `429`: rate limit reached; report the server message and stop
- `500`/`503`: server or storage failure; report it and do not claim success

Approved previews are public. Approved package downloads require a Google
session and may return `401 authentication_required` to non-browser clients or
redirect a browser to Google sign-in.
