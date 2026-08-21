const std = @import("std");
const types = @import("../shared/types.zig");

pub const ProviderId = enum {
    gateway,
    codex,
    anthropic,
    xai,
};

pub const default_id = ProviderId.xai;
pub const default_model = "grok-4.6";

pub const ProviderSelection = struct {
    provider: ProviderId,
    model: []const u8,
};

pub fn parse(value: []const u8) ?ProviderId {
    if (std.ascii.eqlIgnoreCase(value, "gateway")) return .gateway;
    if (std.ascii.eqlIgnoreCase(value, "codex")) return .codex;
    if (std.ascii.eqlIgnoreCase(value, "anthropic")) return .anthropic;
    if (std.ascii.eqlIgnoreCase(value, "xai") or
        std.ascii.eqlIgnoreCase(value, "grok") or
        std.ascii.eqlIgnoreCase(value, "supergrok")) return .xai;
    return null;
}

pub fn parseProduct(value: []const u8) ?ProviderId {
    const parsed = parse(value) orelse return null;
    return if (isRetired(parsed)) null else parsed;
}

pub fn label(provider: ProviderId) []const u8 {
    return switch (provider) {
        .gateway => "retired Gateway",
        .codex => "Codex subscription",
        .anthropic => "Anthropic Messages",
        .xai => "SuperGrok",
    };
}

pub fn isDirect(provider: ProviderId) bool {
    return provider == .anthropic or provider == .xai;
}

pub fn isRetired(provider: ProviderId) bool {
    return provider == .gateway;
}

pub fn authorizesCredential(provider: ProviderId, source: ?types.CredentialSource) bool {
    const selected = source orelse return false;
    return switch (provider) {
        .gateway => false,
        .codex => selected == .chatgpt_subscription,
        .anthropic => selected == .custom_provider,
        .xai => selected == .grok_subscription,
    };
}

pub fn usesGatewayAuxiliaries(provider: ProviderId) bool {
    return provider == .gateway;
}

test "explicit providers authorize only their own credential origins" {
    try std.testing.expect(!authorizesCredential(.gateway, .ai_gateway_api_key));
    try std.testing.expect(!authorizesCredential(.gateway, .fx_login));
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

test "provider parsing exposes product providers and retires Gateway" {
    try std.testing.expectEqual(ProviderId.gateway, parse("gateway").?);
    try std.testing.expect(parseProduct("gateway") == null);
    try std.testing.expectEqual(ProviderId.codex, parse("CODEX").?);
    try std.testing.expectEqual(ProviderId.anthropic, parse("anthropic").?);
    try std.testing.expectEqual(ProviderId.xai, parse("xai").?);
    try std.testing.expectEqual(ProviderId.xai, parseProduct("grok").?);
    try std.testing.expectEqual(ProviderId.xai, parseProduct("supergrok").?);
    try std.testing.expect(parse("openai-codex") == null);
    try std.testing.expect(parse("") == null);
    try std.testing.expect(isDirect(.anthropic));
    try std.testing.expect(isDirect(.xai));
    try std.testing.expect(!isDirect(.gateway));
    try std.testing.expect(isRetired(.gateway));
    try std.testing.expect(!usesGatewayAuxiliaries(.anthropic));
    try std.testing.expect(!usesGatewayAuxiliaries(.xai));
    try std.testing.expect(usesGatewayAuxiliaries(.gateway));
}
