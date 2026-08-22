import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const SUPERGROK_MODEL = "grok-4.6";
export const SUPERGROK_FAST_MODEL = "grok-code-fast-1";
export const ANTHROPIC_MODEL = "claude-opus-4-6";
export const ANTHROPIC_FAST_MODEL = "claude-sonnet-4-6";

export const E2E_GROK_AUTH = {
  version: 1,
  access_token: "grok-sdk-access",
  refresh_token: "grok-sdk-refresh",
  expires_at_ms: 4_102_444_800_000,
  client_id: "b1a00492-073a-47ea-816f-4c329264a828",
};

export function writeGrokAuth(home) {
  const fxDir = join(home, ".fx");
  mkdirSync(fxDir, { recursive: true, mode: 0o700 });
  chmodSync(fxDir, 0o700);
  const path = join(fxDir, "grok-auth.json");
  writeFileSync(path, `${JSON.stringify(E2E_GROK_AUTH)}\n`, { mode: 0o600 });
  chmodSync(path, 0o600);
  return path;
}

export function createSdkHome() {
  const home = mkdtempSync(join(tmpdir(), "fx-sdk-home-"));
  writeGrokAuth(home);
  return home;
}

export function wasmAnthropicEnv(extra = {}) {
  return {
    ANTHROPIC_API_KEY: extra.ANTHROPIC_API_KEY ?? "sdk-test-key",
    FX_MODEL: extra.FX_MODEL ?? ANTHROPIC_MODEL,
    ...extra,
  };
}

export function installNativeSupergrok(extra = {}) {
  const home = extra.home ?? createSdkHome();
  process.env.HOME = home;
  if (extra.chatBaseUrl) {
    process.env.GROK_CLI_CHAT_PROXY_BASE_URL = extra.chatBaseUrl;
  }
  return home;
}

export function nativeCreateCoreOptions(extra = {}) {
  const home = extra.home ?? process.env.HOME ?? createSdkHome();
  return {
    apiKey: extra.apiKey ?? "sdk-napi-placeholder",
    model: extra.model ?? SUPERGROK_MODEL,
    home,
    workspaceRoot: extra.workspaceRoot ?? home,
    ...("gatewayChatUrl" in extra ? { gatewayChatUrl: extra.gatewayChatUrl } : {}),
  };
}

function sseData(payload) {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

export function anthropicSseChunks(chunks) {
  const parts = [
    sseData({
      type: "message_start",
      message: {
        id: "msg_sdk",
        type: "message",
        role: "assistant",
        content: [],
        model: ANTHROPIC_MODEL,
        usage: { input_tokens: 1, output_tokens: 1 },
      },
    }),
    sseData({
      type: "content_block_start",
      index: 0,
      content_block: { type: "text", text: "" },
    }),
  ];
  for (const chunk of chunks) {
    parts.push(sseData({
      type: "content_block_delta",
      index: 0,
      delta: { type: "text_delta", text: chunk },
    }));
  }
  parts.push(sseData({ type: "content_block_stop", index: 0 }));
  parts.push(sseData({
    type: "message_delta",
    delta: { stop_reason: "end_turn" },
    usage: { output_tokens: 2 },
  }));
  parts.push(sseData({ type: "message_stop" }));
  parts.push("data: [DONE]\n\n");
  return parts.join("");
}

export function openaiSseChunks(chunks, options = {}) {
  const parts = [];
  for (const chunk of chunks) {
    parts.push(sseData({
      id: "chatcmpl_sdk",
      object: "chat.completion.chunk",
      choices: [{ index: 0, delta: { content: chunk }, finish_reason: null }],
    }));
  }
  parts.push(sseData({
    id: "chatcmpl_sdk",
    object: "chat.completion.chunk",
    choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
    usage: { prompt_tokens: 3, completion_tokens: 2 },
  }));
  if (options.done !== false) parts.push("data: [DONE]\n\n");
  return parts.join("");
}

export function anthropicSseResponse(chunks) {
  return new Response(anthropicSseChunks(chunks), {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
}

export function openaiSseResponse(chunks) {
  return new Response(openaiSseChunks(chunks), {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
}

export function parseChatRequest(init) {
  const body = typeof init?.body === "string"
    ? init.body
    : init?.body
      ? new TextDecoder().decode(init.body)
      : "";
  const parsed = body ? JSON.parse(body) : {};
  return {
    model: parsed.model,
    messages: parsed.messages ?? parsed.prompt ?? [],
    parsed,
  };
}

export function anthropicSseFromLegacyEvents(events) {
  const parts = [
    sseData({
      type: "message_start",
      message: {
        id: "msg_sdk",
        type: "message",
        role: "assistant",
        content: [],
        model: ANTHROPIC_MODEL,
        usage: { input_tokens: 1, output_tokens: 1 },
      },
    }),
  ];
  let textOpen = false;
  let nextIndex = 0;
  const closeText = () => {
    if (!textOpen) return;
    parts.push(sseData({ type: "content_block_stop", index: 0 }));
    textOpen = false;
  };
  for (const event of events) {
    if (event.type === "text-delta") {
      if (!textOpen) {
        parts.push(sseData({
          type: "content_block_start",
          index: 0,
          content_block: { type: "text", text: "" },
        }));
        textOpen = true;
        nextIndex = Math.max(nextIndex, 1);
      }
      parts.push(sseData({
        type: "content_block_delta",
        index: 0,
        delta: { type: "text_delta", text: event.delta ?? "" },
      }));
      continue;
    }
    if (event.type === "tool-call") {
      closeText();
      const index = nextIndex;
      nextIndex += 1;
      const input = typeof event.input === "string" ? event.input : JSON.stringify(event.input ?? {});
      parts.push(sseData({
        type: "content_block_start",
        index,
        content_block: {
          type: "tool_use",
          id: event.toolCallId ?? `tool_${index}`,
          name: event.toolName ?? "unknown",
          input: {},
        },
      }));
      parts.push(sseData({
        type: "content_block_delta",
        index,
        delta: { type: "input_json_delta", partial_json: input },
      }));
      parts.push(sseData({ type: "content_block_stop", index }));
      continue;
    }
    if (event.type === "finish") {
      closeText();
      const raw = event.finishReason?.unified ?? event.finishReason?.raw ?? "stop";
      const stop = raw === "tool-calls" || raw === "tool_use" ? "tool_use" : "end_turn";
      parts.push(sseData({
        type: "message_delta",
        delta: { stop_reason: stop },
        usage: { output_tokens: event.usage?.outputTokens?.total ?? 2 },
      }));
      parts.push(sseData({ type: "message_stop" }));
    }
  }
  closeText();
  parts.push("data: [DONE]\n\n");
  return parts.join("");
}

export function writeOpenAiSse(response, chunks) {
  response.writeHead(200, { "content-type": "text/event-stream" });
  response.write(openaiSseChunks(chunks));
  response.end();
}
