# Deployment

Detailed procedures and delivery notes moved from the repository README at
[source 1d696bd](https://github.com/code-corhuila/synkro-sales-portal/blob/1d696bdb97ebac08663153eb6712954d29774516/README.md).
Recorded execution results retain their original scope; moving them does not
constitute a new execution or certify a different revision.

Run commands from the repository root unless a step explicitly changes directory.

## Container and CI

```sh
docker build -f deploy/Dockerfile -t synkro-sales-portal:local .
docker run --rm -e HOST_ORIGIN=http://localhost:5173 synkro-sales-portal:local nginx -t
docker compose --env-file .env -f deploy/compose.yml up --build
```

Copy .env.example to .env to configure the build-time Host entry and runtime CORS origin. No gateway address or credential is configured in the portal. The build uses Node 22/npm ci. Compose exposes internal 80 on platform without a host port; the Host serves /remotes/sales/. NGINX envsubst substitutes only HOST_ORIGIN. The entry uses no-store and hashed chunks use immutable caching. This Compose covers only the portal.

CI retains common-file checks and verifies lint, build, coverage, compiled boundaries, image and NGINX for PR/push permanent-branch targets. The original feature does not require a permanent feature-branch trigger. Configured checks and actual hosted execution are separate facts.

## Internal root delivery

HU-VEN-12 current status: [verification and integration gates](verification-hu-ven-12.md).
Intent recovery uses the [Host session lifecycle contract](session-recovery-proposal.md)
released in Front `v2.0.0` (`c43d024`). On older Hosts without it, new
registration is disabled; history and composed detail remain available.
This portal change does not modify Front or ratify a pending architectural decision.

The owning Compose service keeps DNS `synkro-sales-portal`, exposes HTTP 80 internally, and joins external `platform`; it publishes no host port. The host proxies `/remotes/sales/` to it. `VITE_BASE_PATH` reaches Vite through Compose and Docker; npm and direct Docker builds default to `/`, while Compose defaults to `/remotes/sales/`. Select `/` explicitly for a standalone container build. Preview remains available on 5176 for local npm use.

`VITE_SHELL_ENTRY_URL` is the browser-accessible host federation entry (local default `http://localhost:5173/assets/remoteEntry.js`), and runtime `HOST_ORIGIN` is the browser host origin. Change both for another host; do not use Docker DNS in these inputs. Existing React/session/client, CORS, no-store entry caching, history/filter/cancellation behavior and production credential restrictions are preserved.

Verify `python -m unittest discover -s tests`, existing npm lint/build/coverage/check:compiled and standalone/prefixed images. The root owning `tests/portal_delivery.py` checks both remotes, their compiled JavaScript and CSS through the real host. Related to code-corhuila/synkro-docs#239; full-platform acceptance, owner review and documentation remain pending.

### Consumer contract verification

Run `npm ci && npm run test:contract` with Node 22. The isolated test tooling
pins Pact JS in `tests/pact/package-lock.json`; application dependencies and
production images do not include it. Tests call the real portal client through
the Host transport boundary and generate the committed `tests/pact/pacts/`
artifacts. CI rejects stale artifacts. Providers verify these files against
their real disposable databases; consumer mock success alone is not provider
acceptance. No Pact broker or published verification result is implied.
