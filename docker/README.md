# Offline Docker submission

Declare **`Dockerfile`** as the submission's path relative to the repository root.

```bash
docker build --network=none -t ting .
docker run --rm --name ting -p 8088:8080 ting
# Open http://localhost:8088 (or /?demo=1 for the demo controls).
```

Or run `docker compose up --build`. Compose runs without write access, Linux capabilities or privilege escalation; `TING_PORT=8090 docker compose up --build` changes the host port.

The root Dockerfile uses [Docker's empty scratch base](https://docs.docker.com/build/building/base-images/#create-a-minimal-base-image-using-scratch). It requires no base-image pull, npm installation, network or credentials. Committed assets are the production React app built from this repository, including its original TypeScript calculation engine. A small standard-library Go server serves them; it has no application calculations. The committed Linux ARM64 and AMD64 binaries are built from `server.go`. BuildKit selects the host architecture; `--platform linux/amd64` selects the judge architecture explicitly. The image runs as UID/GID 65532 on port 8080 and includes `/healthz` and a built-in health check.

PDF workers, fonts, the English OCR worker/core/language data and samples are bundled. Missing modules return 404, not HTML. `/plan`, `/treatment` and dotted `/share` routes support direct navigation. The server logs only startup/fatal lifecycle messages, accepts no uploads and stores no patient data. Browser drafts follow the app's existing demo storage policy.

## What runs offline

Free-text intake, plan-document compilation/review, digital PDF extraction, English image OCR/card scanning, deterministic estimates, scheduling, comparison, the moving survey, the horizontal waterfall and browser-local demo claims/reminders/shares work offline. This is explicitly a **sample account** with illustrative prices; it is not a live insurer integration. Mock share links work within the browser that created them.

AWS authentication, Bedrock/Winnow services, carrier synchronization, remote/persistent shares, Textract, email delivery, external map tiles, external reference links and physical-device bridges are not included in this container. The existing live AWS deployment remains available independently. No credentials are baked into either the bundle or image.

## Refresh and verify the committed snapshot

The isolated judge cannot install JavaScript dependencies. We therefore commit the compiled site archive and static servers, along with a manifest binding them to the app sources. After changing app sources, refresh and commit these artifacts:

```bash
npm ci
npm run docker:prepare     # requires installed Go >=1.24; downloads English OCR data/license
npm run docker:check       # verifies source + artifact SHA256; no build or downloads
docker build --network=none --no-cache -t ting .
docker run -d --name ting -p 8088:8080 ting
npm run e2e:docker         # installed Playwright browsers; all external requests denied
docker exec ting /server --healthcheck
docker rm -f ting
```

`go test ./...` from `docker/` checks HTTP routing and module MIME types. `npm test` checks the original application engine. Preparing the archive is a maintainer operation; it is **not** part of the declared Docker build. `docker/manifest.json` records the source/artifact hashes and OCR dataset provenance. OCR licenses travel inside the image under `/site/ocr/`.

## Verification on October 4, 2026

- Fresh ARM64 and AMD64 image builds: `--network=none --no-cache`, successful with no base-image download.
- AMD64 container: `--network none --read-only --cap-drop=ALL --security-opt no-new-privileges`; started, health check passed and remained healthy across subsequent checks.
- ARM64 container: read-only/nonroot; 12 browser journeys in Chromium and iPhone WebKit, with external requests blocked, passed. Covered overview/disclosure, survey/recommendation/persistence, PDF review/application, insurance-card image OCR, horizontal waterfall, direct routes, health and missing-worker 404.
- `npm test`: 207 passed. `npm run lint`, strict production build, Go HTTP tests and `npm run docker:check`: passed.
- These are local checks; the hackathon's objective build probe still determines the official Runs score.
