# sub-gate

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/ygasaino1/sub-gate)

A tiny Cloudflare Worker that sits in front of your proxy subscription link. Your apps subscribe to the
gate; the gate fetches your real subscription, applies the **Fragment + Fingerprint** enhancement to every
VLESS/Trojan config, and returns the new subscription. No more manual copy, paste, enhance.

```
app  ->  https://gate.example.com/sub/<GATE_TOKEN>?u=<your real sub>  ->  enhanced subscription
```

The enhancement is the same one used by the web tool
[Hidden-Node/proxy-builder](https://hidden-node.github.io/proxy-builder/) (this project is independent and
not affiliated with it):

| Added parameter | Applied to | Meaning |
|---|---|---|
| `fp` | every VLESS/Trojan | TLS fingerprint (default `unsafe`) |
| `cs` | `security=tls` only | TLS cipher suite list |
| `fm` | `security=tls` only | Final mask, i.e. TLS-hello fragmentation (default: the tool's "v2" preset) |
| `ech` | `security=tls` only, opt-in | Encrypted Client Hello |

VMess, Shadowsocks and any other line are passed through untouched, so you still receive your whole
subscription. Remarks (`#name`) and all your other link parameters are preserved.

## Deploy

### 1. Put this repo on your GitHub (public)

The Deploy button only works with a **public** GitHub or GitLab repo.

```bash
git init && git add . && git commit -m "sub-gate"
gh repo create sub-gate --public --source=. --push        # or create it in the GitHub UI and push
```

### 2. Point the button at your repo

In this README, replace `YOUR_GITHUB_USERNAME` in the button link with your GitHub username:

```bash
sed -i 's/YOUR_GITHUB_USERNAME/your-username/g' README.md        # macOS: sed -i '' ...
```

### 3. Click the button

Cloudflare will ask you to connect GitHub, copy the repo into your account and deploy it. During setup it
asks for one secret:

- **`GATE_TOKEN`**: the password inside your link. Use a long random string, e.g. `openssl rand -hex 24`.
  The Worker **refuses to run** with a token shorter than 16 characters or the placeholder value.

### 4. (Recommended) Use your own domain

In the Cloudflare dashboard: Workers & Pages -> `sub-gate` -> Settings -> Domains & Routes -> **Add custom
domain**. `*.workers.dev` addresses are frequently filtered in some countries; a custom domain proxied by
Cloudflare usually is not.

## Use

Build your link (the real subscription must be **URL-encoded**, because it has its own `?` and `&`).
Easiest: open [`tools/link-builder.html`](tools/link-builder.html) locally in your browser, it runs offline.

```
https://gate.example.com/sub/<GATE_TOKEN>?u=https%3A%2F%2Fprovider.com%2Fsub%3Ftoken%3Dabc
```

Paste that into your app's subscription field.

### Parameters

| Param | Effect |
|---|---|
| `u=<url>` | Real subscription link. Repeat to merge several (de-duplicated). A base64 of the URL also works |
| `plain=1` | Return plain text lines instead of a base64 body (both work in common apps) |
| `fp=chrome` | Fingerprint: `chrome`, `firefox`, `safari`, `random`, `unsafe`, `none` |
| `fm=off` | Disable the fragment mask (or pass your own JSON) |
| `cs=off` | Disable the cipher suites (or pass your own list) |
| `ech=<value>` | Add ECH, e.g. `cloudflare-ech.com+udp://1.1.1.1` (URL-encode it) |

### Optional variables

Set in the dashboard (Settings -> Variables and Secrets) or under `vars` in `wrangler.jsonc`:

| Name | Purpose |
|---|---|
| `FP`, `CS`, `FM`, `ECH` | Defaults for the parameters above. For `FM`, select the v1/v2 preset in the proxy-builder tool and paste its Final Mask JSON |
| `UPSTREAMS` (secret) | Fallback subscription(s) used when a link has no `u` |

### Behaviour

- The client's `User-Agent` is forwarded upstream (many panels pick the output format from it), and
  `subscription-userinfo` / `profile-*` headers are passed back so quota and expiry still show in your app.
- If one upstream fails the others are still served; the `x-gate-upstreams-failed` header reports how many.
- Responses are not cached. Every refresh hits your provider.

## Security

There is **no host allowlist**: anyone holding a link that contains the token can make your Worker fetch any
http(s) URL. The token is the only protection, so keep it long, random and private. If it leaks, change
`GATE_TOKEN` (Settings -> Variables and Secrets) and every old link stops working immediately. Never commit a
real token; `.dev.vars` is git-ignored.

## Develop

```bash
npm install
npm test                         # node --test, no Cloudflare account needed
cp .dev.vars.example .dev.vars   # then set a real GATE_TOKEN
npm run dev                      # local Worker on http://localhost:8787
npm run deploy                   # manual deploy with Wrangler
```

## Layout

```
src/index.js               the Worker
test/gate.test.js          tests (mocked upstream)
tools/link-builder.html    offline helper that builds the encoded link
wrangler.jsonc             Worker config
.dev.vars.example          secrets the Deploy button prompts for
package.json               scripts + descriptions shown during Deploy
.github/workflows/test.yml CI
```

## License

MIT
