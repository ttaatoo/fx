const model_provider = @import("../core/config/model_provider.zig");
const model_catalog = @import("../core/gateway/model_catalog.zig");
const stream_provider = @import("../core/agent/stream_provider.zig");
const openai_codex = @import("../gateway/openai_codex.zig");
const openai_codex_models = @import("../gateway/openai_codex_models.zig");
const direct_provider = @import("../gateway/direct_provider.zig");

pub fn agentStream(provider: model_provider.ProviderId) stream_provider.Provider {
    return switch (provider) {
        .gateway => stream_provider.unavailable_provider,
        .codex => openai_codex.agent_stream_provider,
        .anthropic, .xai => direct_provider.agent_stream_provider,
    };
}

pub fn modelCatalog(provider: model_provider.ProviderId) model_catalog.Provider {
    return switch (provider) {
        .gateway => direct_provider.model_catalog_provider,
        .codex => openai_codex_models.model_catalog_provider,
        .anthropic, .xai => direct_provider.model_catalog_provider,
    };
}
