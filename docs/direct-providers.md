# Direct LLM providers (fork experiment)

This `ttaatoo/fx` fork can talk to Anthropic and xAI without Vercel AI Gateway. Upstream fx still requires Gateway or a Codex subscription. Treat this path as an experiment, not a supported product surface.

## Config

Write provider settings in `~/.fx/providers.json` (preferred) or under a `providers` object in `~/.fx/settings.json`. Do not put API keys in project `.fx.json`.

```json
{
  "providers": {
    "anthropic": {
      "api": "anthropic-messages",
      "baseUrl": "https://api.anthropic.com",
      "apiKey": "$ANTHROPIC_API_KEY",
      "models": [{ "id": "claude-opus-4-6" }, { "id": "claude-sonnet-4-6" }]
    },
    "xai": {
      "api": "openai-completions",
      "baseUrl": "https://api.x.ai/v1",
      "apiKey": "$XAI_API_KEY",
      "models": [{ "id": "grok-4.6" }, { "id": "grok-code-fast-1" }]
    }
  }
}
```

`apiKey` may be a literal, `$ENV_NAME`, or `${ENV_NAME}`. Empty environment values are treated as missing.

`baseUrl` may also come from `ANTHROPIC_BASE_URL` or `XAI_BASE_URL` when the config omits it. HTTPS hosts are allowed. HTTP is limited to loopback (`127.0.0.1`, `localhost`, `[::1]`).

## Environment

| Provider | Key | Optional base URL |
| --- | --- | --- |
| Anthropic Messages | `ANTHROPIC_API_KEY` | `ANTHROPIC_BASE_URL` |
| xAI Chat Completions | `XAI_API_KEY` | `XAI_BASE_URL` |

Select a model with `FX_MODEL=claude-opus-4-6` or `FX_MODEL=anthropic/claude-opus-4-6`. `fx provider anthropic` and `fx provider xai` persist the provider in `~/.fx/settings.json`. `/model` lists models from this config, not the Vercel catalog.

When a direct provider is selected, fx does not require Vercel login and does not send `AI_GATEWAY_API_KEY` or Vercel OAuth tokens to that host. Credits, teams, OIDC, Gateway web search, and Gateway auto-review are skipped.

## Claude Code proxy

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

Or set `ANTHROPIC_BASE_URL` and leave `baseUrl` empty in the config. Official Anthropic uses `https://api.anthropic.com` and the Messages path `/v1/messages`.

## xAI / Grok

Default xAI endpoint is `https://api.x.ai/v1` with OpenAI Chat Completions at `/chat/completions`. Set `XAI_API_KEY` and choose `grok-4.6` or another configured id. A compatible OpenAI-completions gateway can replace `baseUrl`.
