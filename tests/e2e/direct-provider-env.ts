import { chmodSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const FAKE_DIRECT_MODEL = "openai/gpt-5";

function isLoopbackUrl(value: string | undefined): boolean {
  if (!value) return false;
  try {
    const host = new URL(value).hostname;
    return host === "127.0.0.1" || host === "localhost" || host === "[::1]";
  } catch {
    return false;
  }
}

function originOf(value: string): string {
  try {
    return new URL(value).origin;
  } catch {
    return value;
  }
}

export function writeE2eAnthropicProviders(
  home: string,
  baseUrl: string | undefined,
  model?: string,
): void {
  const fxDir = join(home, ".fx");
  mkdirSync(fxDir, { recursive: true, mode: 0o700 });
  chmodSync(fxDir, 0o700);
  const models = new Set<string>([
    FAKE_DIRECT_MODEL,
    "claude-opus-4-6",
    "claude-sonnet-4-6",
  ]);
  if (model && model.trim().length > 0) models.add(model.trim());
  writeFileSync(
    join(fxDir, "providers.json"),
    `${JSON.stringify({
      providers: {
        anthropic: {
          api: "anthropic-messages",
          baseUrl: baseUrl && baseUrl.length > 0 ? baseUrl : "https://api.anthropic.com",
          apiKey: "$ANTHROPIC_API_KEY",
          models: [...models].map((id) => ({ id })),
        },
      },
    })}\n`,
    { mode: 0o600 },
  );
}

export function adaptRetiredGatewayTestEnv(
  env: Record<string, string | undefined>,
): Record<string, string | undefined> {
  const next: Record<string, string | undefined> = { ...env };
  const chatUrl = next.FX_E2E_GATEWAY_CHAT_URL ?? next.FX_GATEWAY_CHAT_URL;
  const loopback = isLoopbackUrl(chatUrl) || isLoopbackUrl(next.FX_E2E_GATEWAY_MODELS_URL);
  if (loopback || (next.AI_GATEWAY_API_KEY && chatUrl)) {
    if (!next.ANTHROPIC_API_KEY && next.AI_GATEWAY_API_KEY) {
      next.ANTHROPIC_API_KEY = next.AI_GATEWAY_API_KEY;
    }
    if (chatUrl && !next.ANTHROPIC_BASE_URL) {
      next.ANTHROPIC_BASE_URL = originOf(chatUrl);
    }
  }
  delete next.AI_GATEWAY_API_KEY;
  delete next.VERCEL_OIDC_TOKEN;
  delete next.FX_E2E_GATEWAY_CHAT_URL;
  delete next.FX_E2E_GATEWAY_MODELS_URL;
  delete next.FX_E2E_GATEWAY_CREDITS_URL;
  delete next.FX_GATEWAY_CHAT_URL;
  delete next.FX_GATEWAY_BASE_URL;
  if (
    next.HOME &&
    next.ANTHROPIC_API_KEY &&
    !existsSync(join(next.HOME, ".fx", "providers.json"))
  ) {
    writeE2eAnthropicProviders(next.HOME, next.ANTHROPIC_BASE_URL, next.FX_MODEL);
  }
  return next;
}
