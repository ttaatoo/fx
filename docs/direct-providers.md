# Direct LLM providers (fork experiment)

This `ttaatoo/fx` fork can talk to Anthropic and SuperGrok without Vercel AI Gateway. Upstream fx still requires Gateway or a Codex subscription. Treat this path as an experiment, not a supported product surface.

## Anthropic Messages

Write Anthropic settings in `~/.fx/providers.json` (preferred) or under a `providers` object in `~/.fx/settings.json`. Do not put API keys in project `.fx.json`.

```json
{
  "providers": {
    "anthropic": {
      "api": "anthropic-messages",
      "baseUrl": "https://api.anthropic.com",
      "apiKey": "$ANTHROPIC_API_KEY",
      "models": [{ "id": "claude-opus-4-6" }, { "id": "claude-sonnet-4-6" }]
    }
  }
}
```

`apiKey` may be a literal, `$ENV_NAME`, or `${ENV_NAME}`. Empty environment values are treated as missing. `baseUrl` may also come from `ANTHROPIC_BASE_URL` when the config omits it.

HTTPS hosts are allowed. HTTP is limited to loopback (`127.0.0.1`, `localhost`, `[::1]`).

| Setting | Value |
| --- | --- |
| Key | `ANTHROPIC_API_KEY` |
| Optional base URL | `ANTHROPIC_BASE_URL` |
| Default API | `anthropic-messages` at `/v1/messages` |

Select a model with `FX_MODEL=claude-opus-4-6` or `FX_MODEL=anthropic/claude-opus-4-6`. `fx provider anthropic` persists the provider in `~/.fx/settings.json`. `/model` lists models from this config, not the Vercel catalog.

When Anthropic is selected, fx does not require Vercel login and does not send `AI_GATEWAY_API_KEY` or Vercel OAuth tokens to that host. Credits, teams, OIDC, Gateway web search, and Gateway auto-review are skipped.

### Claude Code proxy

Point Anthropic `baseUrl` at a Claude Code or Anthropic-compatible proxy:

```json
{
  "providers": {
    "anthropic": {
      "api": "anthropic-messages",
      "baseUrl": "http://127.0.0.1:4000",
      "apiKey": "$ANTHROPIC_API_KEY",
      "models": [{ "id": "claude-opus-4-6" }]
    }
  }
}
```

Or set `ANTHROPIC_BASE_URL` and leave `baseUrl` empty in the config. Official Anthropic uses `https://api.anthropic.com`.

## SuperGrok / X Premium+

SuperGrok uses a subscriber OAuth session, not an `XAI_API_KEY` and not console.x.ai pay-per-token credits. Inference uses SuperGrok or X Premium+ quota.

### Log in

```bash
fx login grok
```

`fx login xai` and `fx login supergrok` are aliases. fx starts the official xAI device-code flow (`accounts.x.ai` / `auth.x.ai`, the same issuer the Grok CLI uses for `grok login`), prints a URL and code, and waits for authorization. The session is stored at `~/.fx/grok-auth.json` and refresh tokens are renewed in the background.

If you already ran `grok login`, fx also reads `~/.grok/auth.json` (or `$GROK_HOME/auth.json`). `fx logout grok` removes only `~/.fx/grok-auth.json`. To clear the Grok CLI store as well, run `grok logout`.

`/login` in the TUI includes **Sign in with SuperGrok**. `/provider xai` or `fx provider xai` starts this login when no session is present.

When SuperGrok is selected, fx does not require Vercel login.

### Models

Once an OAuth session is present, `/model` and `FX_MODEL` list the configured Grok models. If `providers.json` has no `xai` entry, fx injects `grok-4.6` and `grok-code-fast-1`. You can still name extra models:

```json
{
  "providers": {
    "xai": {
      "api": "openai-completions",
      "models": [{ "id": "grok-4.6" }, { "id": "grok-code-fast-1" }]
    }
  }
}
```

Do not set an `apiKey` for SuperGrok. This path does not use `XAI_API_KEY`.

### Subscriber chat proxy

Regular SuperGrok OAuth tokens commonly receive `402` or `403` from `https://api.x.ai` (the developer API). fx therefore sends chat completions to the Grok CLI subscriber proxy:

`https://cli-chat-proxy.grok.com/v1/chat/completions`

A configured `baseUrl` of `https://api.x.ai/v1` is rewritten to that proxy. Override the proxy only if you know you need a different subscriber endpoint, for example `GROK_CLI_CHAT_PROXY_BASE_URL`.

### Known caveat

Some SuperGrok tiers are rejected by the xAI developer API (`api.x.ai`) even after a successful OAuth login. That is expected. This fork uses the subscriber CLI chat proxy and SuperGrok / X Premium+ quota, not API credits. If the proxy also rejects the session, renew it with `fx login grok` or `grok login`, and confirm the X account still has SuperGrok or X Premium+.
