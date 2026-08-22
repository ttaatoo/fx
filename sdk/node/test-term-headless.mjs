#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import xtermHeadless from "@xterm/headless";
import { createFxTerminal, supportsJspi, xtermAdapter } from "../node.js";
import {
  ANTHROPIC_FAST_MODEL,
  ANTHROPIC_MODEL,
  anthropicSseResponse,
  parseChatRequest,
  wasmAnthropicEnv,
} from "../tests/supergrok-fixture.mjs";

const { Terminal } = xtermHeadless;

const scriptDir = fileURLToPath(new URL(".", import.meta.url));
const defaultWasm = resolve(scriptDir, "../../zig-out/bin/fx-term.wasm");
const wasmPath = resolve(process.argv[2] || defaultWasm);

if (!supportsJspi()) {
  console.error("Node JSPI is disabled. Run through: npm run test:term");
  process.exit(2);
}

const terminal = new Terminal({ cols: 96, rows: 30, allowProposedApi: true });
const config = new Map([
  ["model", ANTHROPIC_MODEL],
  ["mode", "plan"],
]);
const events = [];
const encoded = new TextEncoder();
let requestedModel;
let firstChunkAt;
const startedAt = performance.now();
const mockFetch = async (_url, init) => {
  requestedModel = parseChatRequest(init).model;
  firstChunkAt = performance.now();
  return anthropicSseResponse(["streamed", " response"]);
};
const runtime = await createFxTerminal({
  backend: "wasm",
  wasm: await readFile(wasmPath),
  terminal: xtermAdapter(terminal),
  configStore: {
    get(id) { return config.get(id) ?? null; },
    set(id, value) { config.set(id, value); },
  },
  env: wasmAnthropicEnv(),
  fetch: mockFetch,
  onEvent(event) { events.push(event); },
});
const flushTerminal = () => new Promise((resolve) => terminal.write("", resolve));
const readGrid = () => {
  const lines = [];
  const buffer = terminal.buffer.active;
  for (let row = 0; row < buffer.length; row++) lines.push(buffer.getLine(row)?.translateToString(true) ?? "");
  return lines.join("\n");
};
const startupDeadline = performance.now() + 5000;
while (!readGrid().includes("𝒇x")) {
  await flushTerminal();
  if (performance.now() >= startupDeadline) throw new Error(`timed out waiting for fx-term startup:\n${readGrid()}`);
  await new Promise((resolve) => setTimeout(resolve, 10));
}
runtime.write(`/model ${ANTHROPIC_FAST_MODEL}\r`);
const modelDeadline = performance.now() + 5000;
while (!(events.some((event) => event.type === "config.changed" && event.configId === "model") &&
  config.get("model") === ANTHROPIC_FAST_MODEL)) {
  if (performance.now() >= modelDeadline) throw new Error(`timed out waiting for model change:\n${readGrid()}`);
  await new Promise((resolve) => setTimeout(resolve, 10));
}
runtime.write("/permissions auto\r");
const modeDeadline = performance.now() + 5000;
while (!(events.some((event) => event.type === "config.changed" && event.configId === "mode") &&
  config.get("mode") === "code")) {
  if (performance.now() >= modeDeadline) throw new Error(`timed out waiting for mode change:\n${readGrid()}`);
  await new Promise((resolve) => setTimeout(resolve, 10));
}
runtime.write("finished\r");
const streamDeadline = performance.now() + 5000;
while (!readGrid().includes("streamed response")) {
  await flushTerminal();
  if (performance.now() >= streamDeadline) throw new Error(`timed out waiting for rendered fx-term stream; requestedModel=${requestedModel}; events=${JSON.stringify(events)}:\n${readGrid()}`);
  await new Promise((resolve) => setTimeout(resolve, 10));
}
await flushTerminal();
const grid = readGrid();
runtime.write("/exit\r");

const exitCode = await Promise.race([
  runtime.exited,
  new Promise((_, reject) => setTimeout(() => reject(new Error("timed out waiting for fx-term exit")), 5000)),
]);

if (exitCode !== 0) throw new Error(`fx-term exited with code ${exitCode}`);
if (!grid.includes("𝒇x")) throw new Error(`shared Fx welcome frame was not visible in xterm grid:\n${grid}`);
if (!grid.includes("Run /help for commands")) throw new Error(`shared Fx welcome guidance was not visible in xterm grid:\n${grid}`);
if (terminal.buffer.active.baseY !== 0 || terminal.buffer.active.viewportY !== 0) {
  throw new Error(`fresh xterm startup created blank scrollback: baseY=${terminal.buffer.active.baseY}, viewportY=${terminal.buffer.active.viewportY}`);
}
if (!events.some((event) => event.type === "terminal.size" && event.cols === 96 && event.rows === 30)) throw new Error("terminal.size event did not report headless xterm geometry");
if (config.get("model") !== ANTHROPIC_FAST_MODEL) throw new Error("accepted terminal model was not persisted through configStore");
if (!events.some((event) => event.type === "config.changed" && event.configId === "model" && event.value === ANTHROPIC_FAST_MODEL && event.source === "terminal")) throw new Error("terminal model command did not emit config.changed");
if (config.get("mode") !== "code") throw new Error("accepted terminal mode was not persisted through configStore");
if (!events.some((event) => event.type === "config.changed" && event.configId === "mode" && event.value === "code" && event.source === "terminal")) throw new Error("terminal mode command did not emit config.changed");
if (!grid.includes("streamed response")) throw new Error(`terminal prompt did not render streamed chat text:\n${grid}`);
if (requestedModel !== ANTHROPIC_FAST_MODEL) throw new Error(`terminal prompt used unexpected accepted model: ${requestedModel}`);
if (!(firstChunkAt >= startedAt)) throw new Error("terminal fetch did not produce a first stream chunk");

console.log("headless xterm smoke passed: shared Fx frame used the 96x30 host cell grid");
