#!/usr/bin/env node
import { strict as assert } from "node:assert";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createFxAgent } from "../node.js";
import { SUPERGROK_MODEL, installNativeSupergrok, openaiSseChunks } from "./supergrok-fixture.mjs";

const events = [];
let requestCount = 0;
let firstResponse;
let firstConnectionClosedResolve;
const firstConnectionClosed = new Promise((resolveClosed) => { firstConnectionClosedResolve = resolveClosed; });
const server = createServer((request, response) => {
  if (request.method !== "POST") {
    response.writeHead(404).end();
    return;
  }
  let body = "";
  request.setEncoding("utf8");
  request.on("data", (chunk) => { body += chunk; });
  request.on("end", () => {
    requestCount += 1;
    const payload = JSON.parse(body);
    assert.ok(payload);
    assert.ok(payload.tools == null || payload.tools.length === 0, "N-API core must not advertise native tools");
    response.writeHead(200, { "content-type": "text/event-stream" });
    if (requestCount === 1) {
      firstResponse = response;
      response.on("close", () => {
        events.push("first-connection-close");
        firstConnectionClosedResolve();
      });
      response.write(openaiSseChunks(["native one"], { done: false }));
      events.push("first-finish-sent");
      return;
    }
    assert.equal(requestCount, 2, "only two chat requests are expected");
    response.write(openaiSseChunks(["native two"]));
    response.end();
  });
});
await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
const { port } = server.address();
const home = installNativeSupergrok({ chatBaseUrl: `http://127.0.0.1:${port}/v1` });

const scriptDir = fileURLToPath(new URL(".", import.meta.url));
const addon = resolve(process.argv[2] || resolve(scriptDir, "../../zig-out/lib/libfx.node"));
const timeout = (label, ms = 5000) => new Promise((_, reject) => {
  const timer = setTimeout(() => reject(new Error(`timed out waiting for ${label}`)), ms);
  timer.unref();
});
let agent;
try {
  let fetchCalls = 0;
  let firstAbortResolve;
  const firstAbort = new Promise((resolveAbort) => { firstAbortResolve = resolveAbort; });
  agent = await createFxAgent({
    nativeAddon: addon,
    backend: "native",
    fetch(input, init) {
      fetchCalls += 1;
      if (fetchCalls === 1) {
        init.signal.addEventListener("abort", () => {
          events.push("first-abort");
          firstAbortResolve();
        }, { once: true });
      } else if (fetchCalls === 2) {
        events.push("second-fetch");
      }
      return fetch(input, init);
    },
    home,
    workspaceRoot: home,
    env: {
      AI_GATEWAY_API_KEY: "native-core-stream-key",
      FX_MODEL: SUPERGROK_MODEL,
    },
  });
  const session = await agent.createSession();
  const firstTurn = session.prompt("first native prompt");
  let firstText = "";
  for await (const update of firstTurn) {
    if (update.sessionUpdate === "agent_message_chunk" && !update.content.text.startsWith("[context]")) {
      firstText += update.content.text;
    }
  }
  assert.equal(firstText.trimEnd(), "native one");
  assert.equal((await firstTurn.result).stopReason, "end_turn");
  events.push("first-turn-complete");
  assert.equal(firstResponse.writableEnded, false, "prompt one must finish before [DONE] or EOF");

  const secondTurn = session.prompt("second native prompt");
  await Promise.race([
    Promise.any([firstAbort, firstConnectionClosed]),
    timeout("first response abort or connection close"),
  ]);
  let secondText = "";
  for await (const update of secondTurn) {
    if (update.sessionUpdate === "agent_message_chunk" && !update.content.text.startsWith("[context]")) {
      secondText += update.content.text;
    }
  }
  assert.equal(secondText.trimEnd(), "native two");
  assert.equal((await secondTurn.result).stopReason, "end_turn");
  assert.equal(fetchCalls, 2, "both prompts must use the Node-owned fetch option");
  const releaseEvents = [events.indexOf("first-abort"), events.indexOf("first-connection-close")]
    .filter((index) => index >= 0);
  assert.ok(releaseEvents.length > 0, "the first response must be aborted or closed");
  assert.ok(events.indexOf("second-fetch") > Math.min(...releaseEvents), "request two must start after response one releases the pump slot");
  await session.close();
  assert.equal(await agent.close(), 0);
  agent = null;
  console.log("native core stream passed: split terminal tail, matching abort, prompt reuse, and graceful close");
} finally {
  agent?.abort();
  firstResponse?.destroy();
  server.closeAllConnections();
  await new Promise((resolveClose) => server.close(resolveClose));
}
