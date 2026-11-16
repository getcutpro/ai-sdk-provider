# Changelog

## 0.2.0 (2026-11-16)

- Requires Node.js 20.3 or newer; Node 18 is no longer supported.
- Requests to the API now send a `User-Agent: cutpro-ai-sdk/<version>` header. Passing your own `User-Agent` in `headers` replaces it.
- Updated to `@cutpro/sdk` 0.1.2 and `@ai-sdk/provider` 4.0.38.

## 0.1.2 (2026-11-07)

- Identifies itself to the API as `cutpro-ai-sdk/<version>`.

## 0.1.1 (2026-11-06)

- Published from GitHub Actions with npm provenance.

## 0.1.0 (2026-11-06)

- First release for AI SDK 7 (provider specification v4): `cutpro.image()` for `generateImage`, `cutpro.speech()` for `generateSpeech` and `cutpro.video()` for `experimental_generateVideo`.
- Image references and first and last frames from links or bytes; any `POST /generations` field under `providerOptions.cutpro`.
