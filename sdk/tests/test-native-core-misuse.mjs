#!/usr/bin/env node
import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createSdkHome, SUPERGROK_MODEL } from "./supergrok-fixture.mjs";

const require = createRequire(import.meta.url);
const scriptDir = fileURLToPath(new URL(".", import.meta.url));
const addonPath = resolve(process.argv[2] || resolve(scriptDir, "../../zig-out/lib/libfx.node"));
const traceChild = process.env.LIBFX_STALE_TRACE_CHILD === "1";
if (!traceChild) {
  delete process.env.FX_TRACE;
  delete process.env.FX_TRACE_LOG;
  delete process.env.FX_TRACE_SCOPES;
  delete process.env.FX_TRACE_STDERR;
}
const addon = require(addonPath);

if (traceChild) {
  const traceCore = addon.createCore({
    apiKey: "trace-test-key",
    home: "/tmp",
    workspaceRoot: "/tmp",
  });
  try {
    assert.equal(addon.pushCoreFetchResponse(traceCore, 17, Buffer.from("secret-response-payload")), 0);
  } finally {
    addon.closeCore(traceCore);
    addon.destroyCore(traceCore);
  }
  process.exit(0);
}

for (const [name, args] of [
  ["createCore", []],
  ["writeCore", []],
  ["writeCore", [{}]],
  ["closeCore", []],
  ["drainCore", []],
  ["takeCoreFetch", []],
  ["coreFetchActive", []],
  ["startCoreFetchResponse", []],
  ["pushCoreFetchResponse", []],
  ["finishCoreFetch", []],
  ["failCoreFetch", []],
  ["coreExited", []],
  ["coreExitCode", []],
  ["destroyCore", []],
]) {
  assert.throws(() => addon[name](...args), {
    name: "TypeError",
    code: "LIBFX_INVALID_ARGUMENT",
    message: "missing required argument",
  });
}

const getterError = new Error("host getter failed");
assert.throws(
  () => addon.createCore(Object.defineProperty({}, "apiKey", { get() { throw getterError; } })),
  (error) => error === getterError,
);
assert.throws(
  () => addon.createCore(new Proxy({}, { has() { throw getterError; } })),
  (error) => error === getterError,
);

for (const [options, message] of [
  [{ apiKey: "x".repeat(64 * 1024 + 1), home: "/tmp", workspaceRoot: "/tmp" }, /apiKey/],
  [{ apiKey: "key", model: "x".repeat(1025), home: "/tmp", workspaceRoot: "/tmp" }, /model/],
  [{ apiKey: "key", home: "x".repeat(16 * 1024 + 1), workspaceRoot: "/tmp" }, /home/],
  [{ apiKey: "key", home: "/tmp", workspaceRoot: "/tmp", gatewayChatUrl: "http://attacker.example/chat" }, /gatewayChatUrl/],
  [{ apiKey: "key", home: "/tmp", workspaceRoot: "/tmp", gatewayChatUrl: "https://user:pass@example.com/chat" }, /gatewayChatUrl/],
  [{ apiKey: "key", home: "/tmp", workspaceRoot: "/tmp", gatewayChatUrl: "https://example.com/chat" }, /gatewayChatUrl/],
]) {
  assert.throws(() => addon.createCore(options), message);
}

for (const fakeHandle of [null, undefined, {}, Buffer.alloc(0), 0, "handle"]) {
  assert.throws(
    () => addon.coreExited(fakeHandle),
    (error) => error instanceof TypeError || error.code === "LIBFX_INVALID_ARGUMENT" || error.code === "LIBFX_NAPI",
  );
}

const core = addon.createCore({ apiKey: "misuse-test-key", home: "/tmp", workspaceRoot: "/tmp" });
assert.throws(
  () => addon.writeCore(core, Buffer.alloc(8 * 1024 * 1024 + 1)),
  (error) => error.code === "LIBFX_NATIVE_BACKPRESSURE",
);
addon.writeCore(core, Buffer.alloc(0));
addon.closeCore(core);
addon.destroyCore(core);
assert.throws(
  () => addon.coreExited(core),
  (error) => error.code === "LIBFX_NATIVE_CLOSED",
);

const sdkHome = createSdkHome();
process.env.HOME = sdkHome;
const fetchHandleCore = addon.createCore({
  apiKey: "lifecycle-test-key",
  model: SUPERGROK_MODEL,
  home: sdkHome,
  workspaceRoot: sdkHome,
});
try {
  for (const [name, args] of [
    ["coreFetchActive", [fetchHandleCore, 0]],
    ["startCoreFetchResponse", [fetchHandleCore, 0, 200]],
    ["pushCoreFetchResponse", [fetchHandleCore, 0, Buffer.alloc(0)]],
    ["finishCoreFetch", [fetchHandleCore, 0]],
    ["failCoreFetch", [fetchHandleCore, 0]],
  ]) {
    assert.throws(() => addon[name](...args), {
      name: "TypeError",
      code: "LIBFX_INVALID_ARGUMENT",
    });
  }
} finally {
  addon.closeCore(fetchHandleCore);
  addon.destroyCore(fetchHandleCore);
}

const traceDir = mkdtempSync(resolve(tmpdir(), "libfx-stale-trace-"));
const traceLog = resolve(traceDir, "trace.log");
try {
  const traced = spawnSync(process.execPath, [fileURLToPath(import.meta.url), addonPath], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      ...process.env,
      LIBFX_STALE_TRACE_CHILD: "1",
      FX_TRACE_LOG: traceLog,
      FX_TRACE_SCOPES: "napi",
    },
  });
  assert.equal(traced.status, 0, traced.stderr || traced.stdout);
  assert.equal(traced.stdout, "", "stale tracing must not change normal stdout");
  assert.equal(traced.stderr, "", "file tracing must not write stderr");
  const trace = readFileSync(traceLog, "utf8");
  const staleLines = trace.split("\n").filter((line) => line.includes("dropping stale host fetch"));
  assert.equal(staleLines.length, 1, "one stale operation must emit one bounded trace");
  assert.match(staleLines[0], /operation=push handle=17 reason=no_active_fetch/);
  assert.doesNotMatch(trace, /secret-response-payload/);
} finally {
  rmSync(traceDir, { recursive: true, force: true });
}

console.log("native core misuse passed: argument, handle, stale, trace, backpressure, and closed-handle checks are enforced");
