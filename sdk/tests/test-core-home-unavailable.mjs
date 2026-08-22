#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createFxAgent, supportsJspi } from "../node.js";
import { anthropicSseResponse, exitIfWasmConcurrencyUnavailable, parseChatRequest, wasmAnthropicEnv } from "./supergrok-fixture.mjs";

const scriptDir = fileURLToPath(new URL(".", import.meta.url));
const defaultWasm = resolve(scriptDir, "../../zig-out/bin/fx-core.wasm");
const wasmPath = resolve(process.argv[2] || defaultWasm);

if (!supportsJspi()) {
  console.error("Node JSPI is disabled. Run with: node --experimental-wasm-jspi sdk/tests/test-core-home-unavailable.mjs");
  process.exit(2);
}

let fetchCalls = 0;
let workspaceExecs = 0;
const mockFetch = async (_url, init) => {
  fetchCalls++;
  if (init.method !== "POST") throw new Error(`unexpected method ${init.method}`);
  const request = parseChatRequest(init);
  if (!Array.isArray(request.messages)) {
    throw new Error("chat request did not contain messages");
  }
  return anthropicSseResponse(["hello", " world"]);
};

const timeout = (label, ms = 8000) => {
  let timer;
  const promise = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out waiting for ${label}`)), ms);
  });
  return { promise, cancel() { clearTimeout(timer); } };
};

const initializeTimeout = timeout("fx-core initialize");
const agent = await Promise.race([
  createFxAgent({
    backend: "wasm",
    wasm: await readFile(wasmPath),
    fetch: mockFetch,
    env: wasmAnthropicEnv({ HOME: "/repo" }),
    workspace: {
      info: {
        version: 1,
        root: "/repo",
        cwd: "/repo",
        home: "/repo",
        gitAvailable: false,
        ephemeral: true,
      },
      permission: "allow-sandboxed",
      async exec() {
        workspaceExecs += 1;
        throw new Error("workspace.exec should not run during a text-only prompt");
      },
    },
  }),
  initializeTimeout.promise,
]).catch((error) => {
  exitIfWasmConcurrencyUnavailable(error);
  throw error;
}).finally(() => initializeTimeout.cancel());

const session = await agent.createSession();
const turn = session.prompt("say hello");
const chunks = [];
const notices = [];
for await (const update of turn) {
  if (update.sessionUpdate !== "agent_message_chunk") continue;
  const text = update.content.text;
  if (text.startsWith("[context]")) notices.push(text);
  else chunks.push(text);
}
const resultTimeout = timeout("prompt result");
const result = await Promise.race([turn.result, resultTimeout.promise]).finally(() => resultTimeout.cancel());
const streamedText = chunks.join("").trimEnd();
if (notices.some((notice) => notice.includes("home unavailable"))) {
  throw new Error(`home unavailable notice replaced the turn: ${JSON.stringify(notices)}`);
}
if (streamedText !== "hello world") throw new Error(`unexpected streamed text: ${JSON.stringify(chunks)}`);
if (result.stopReason !== "end_turn") throw new Error(`unexpected stop reason: ${result.stopReason}`);
if (fetchCalls !== 1) throw new Error(`expected one chat fetch, got ${fetchCalls}`);
if (workspaceExecs !== 0) throw new Error(`workspace.exec ran ${workspaceExecs} time(s)`);

await agent.close();
console.log("core SDK HOME=/repo unavailable filesystem passed: prompt reached the model");
