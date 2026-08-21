const std = @import("std");
const types = @import("../shared/types.zig");

pub const ProviderId = enum {
    gateway,
    codex,
    anthropic,
    xai,
};

pub const ProviderSelection = struct {
    provider: ProviderId,
    model: []const u8,
};

pub fn parse(value: []const u8) ?ProviderId {
    if (std.ascii.eqlIgnoreCase(value, "gateway")) return .gateway;
    if (std.ascii.eqlIgnoreCase(value, "codex")) return .codex;
    if (std.ascii.eqlIgnoreCase(value, "anthropic")) return .anthropic;
    if (std.ascii.eqlIgnoreCase(value, "xai")) return .xai;
    return null;
}

pub fn label(provider: ProviderId) []const u8 {
    return switch (provider) {
        .gateway => "Vercel AI Gateway",
        .codex => "Codex subscription",
        .anthropic => "Anthropic Messages",
        .xai => "SuperGrok",
    };
}

pub fn isDirect(provider: ProviderId) bool {
    return provider == .anthropic or provider == .xai;
}

pub fn authorizesCredential(provider: ProviderId, source: ?types.CredentialSource) bool {
    const selected = source orelse return false;
    return switch (provider) {
        .gateway => selected != .chatgpt_subscription and selected != .custom_provider and selected != .grok_subscription,
        .codex => selected == .chatgpt_subscription,
        .anthropic => selected == .custom_provider,
        .xai => selected == .grok_subscription,
    };
}

pub fn usesGatewayAuxiliaries(provider: ProviderId) bool {
    return provider == .gateway;
}

test "explicit providers authorize only their own credential origins" {
    try std.testing.expect(authorizesCredential(.gateway, .ai_gateway_api_key));
    try std.testing.expect(authorizesCredential(.gateway, .fx_login));
    try std.testing.expect(!authorizesCredential(.gateway, .chatgpt_subscription));
    try std.testing.expect(!authorizesCredential(.gateway, .custom_provider));
    try std.testing.expect(authorizesCredential(.codex, .chatgpt_subscription));
    try std.testing.expect(!authorizesCredential(.codex, .ai_gateway_api_key));
    try std.testing.expect(!authorizesCredential(.codex, null));
    try std.testing.expect(authorizesCredential(.anthropic, .custom_provider));
    try std.testing.expect(authorizesCredential(.xai, .grok_subscription));
    try std.testing.expect(!authorizesCredential(.xai, .custom_provider));
    try std.testing.expect(!authorizesCredential(.gateway, .grok_subscription));
    try std.testing.expect(!authorizesCredential(.anthropic, .ai_gateway_api_key));
    try std.testing.expect(!authorizesCredential(.xai, .fx_login));
}

test "provider parsing exposes gateway, codex, and direct providers" {
    try std.testing.expectEqual(ProviderId.gateway, parse("gateway").?);
    try std.testing.expectEqual(ProviderId.codex, parse("CODEX").?);
    try std.testing.expectEqual(ProviderId.anthropic, parse("anthropic").?);
    try std.testing.expectEqual(ProviderId.xai, parse("xai").?);
    try std.testing.expect(parse("openai-codex") == null);
    try std.testing.expect(parse("") == null);
    try std.testing.expect(isDirect(.anthropic));
    try std.testing.expect(isDirect(.xai));
    try std.testing.expect(!isDirect(.gateway));
    try std.testing.expect(!usesGatewayAuxiliaries(.anthropic));
    try std.testing.expect(!usesGatewayAuxiliaries(.xai));
    try std.testing.expect(usesGatewayAuxiliaries(.gateway));
}
