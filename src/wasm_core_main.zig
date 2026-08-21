const std = @import("std");
const build_options = @import("build_options");
const acp_server = @import("acp/server.zig");
const background_process_provider = @import("core/execution/background_process_provider.zig");
const gateway_provider = @import("core/gateway/gateway_provider.zig");
const host = @import("core/hosts/host.zig");
const io_mod = @import("core/shared/io.zig");
const oauth_transport = @import("core/auth/oauth_transport.zig");
const builtin_context = @import("builtins/context.zig");
const builtin_gateway = @import("builtins/gateway.zig");
const builtin_modes = @import("builtins/modes.zig");
const direct_provider = @import("gateway/direct_provider.zig");

comptime {
    if (build_options.wasm_surface != .core) {
        @compileError("fx-core requires -Dwasm-surface=core");
    }
}

pub const panic = @import("core/hosts/wasm_panic.zig").panic;

pub fn main(init: std.process.Init) !void {
    io_mod.setIo(init.io);
    io_mod.setEnvironMap(init.environ_map);
    try acp_server.run(std.heap.c_allocator, .{
        .default_model = builtin_gateway.default_model,
        .default_agent_step_limit = 64,
        .gateway_retry_count = 0,
        .gateway_chat_url = builtin_gateway.defaultChatUrl(),
        .gateway_models_path = builtin_gateway.models_path,
        .gateway_provider = wasm_provider,
        .background_process_provider = background_process_provider.unavailable_provider,
        .secret_store = host.unavailable_secret_store,
        .prompt_policy = builtin_context.prompt_policy,
        .ignored_list_entries = &.{},
        .max_list_entries = 0,
        .max_read_file_bytes = 0,
        .max_read_file_lines = 0,
        .max_read_file_line_len = 0,
        .max_command_output_bytes = 0,
        .max_tool_result_bytes = 64 * 1024,
        .max_history_turns = 100,
        .context_registry = .{ .default_provider = builtin_context.provider },
        .mode_registry = builtin_modes.registry,
    });
}

const wasm_provider = gateway_provider.Provider{
    .oauth_transport = oauth_transport.unavailable_provider,
    .cli_model_catalog = direct_provider.cli_model_catalog_provider,
    .model_catalog = direct_provider.model_catalog_provider,
};
