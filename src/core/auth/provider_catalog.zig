const std = @import("std");

pub const Id = enum {
    codex,
    grok,

    pub fn slug(self: Id) []const u8 {
        return switch (self) {
            .codex => "codex",
            .grok => "grok",
        };
    }
};

pub const Entry = struct {
    id: Id,
    name: []const u8,
    description: []const u8,
    subscription: bool,
};

pub const entries = [_]Entry{
    .{
        .id = .codex,
        .name = "Codex",
        .description = "ChatGPT Plus, Pro, Business, Enterprise, or Edu subscription",
        .subscription = true,
    },
    .{
        .id = .grok,
        .name = "SuperGrok",
        .description = "SuperGrok or X Premium+ subscription",
        .subscription = true,
    },
};

pub fn parse(value: []const u8) ?Id {
    if (std.ascii.eqlIgnoreCase(value, "codex")) return .codex;
    if (std.ascii.eqlIgnoreCase(value, "grok") or
        std.ascii.eqlIgnoreCase(value, "xai") or
        std.ascii.eqlIgnoreCase(value, "supergrok")) return .grok;
    return null;
}

pub fn parseProduct(value: []const u8) ?Id {
    return parse(value);
}

pub fn isRetiredLoginName(value: []const u8) bool {
    return std.ascii.eqlIgnoreCase(value, "vercel") or
        std.ascii.eqlIgnoreCase(value, "ai-gateway") or
        std.ascii.eqlIgnoreCase(value, "gateway");
}

pub fn find(id: Id) *const Entry {
    for (&entries) |*entry| if (entry.id == id) return entry;
    unreachable;
}

test "auth provider catalog exposes SuperGrok without Vercel login" {
    try std.testing.expect(parse("vercel") == null);
    try std.testing.expect(isRetiredLoginName("vercel"));
    try std.testing.expect(isRetiredLoginName("ai-gateway"));
    try std.testing.expect(parseProduct("vercel") == null);
    try std.testing.expect(parseProduct("ai-gateway") == null);
    try std.testing.expectEqual(Id.codex, parse("codex").?);
    try std.testing.expectEqual(Id.grok, parse("grok").?);
    try std.testing.expectEqual(Id.grok, parse("xai").?);
    try std.testing.expectEqual(Id.grok, parse("supergrok").?);
    try std.testing.expect(parse("openai-codex") == null);
    try std.testing.expect(parse("chatgpt") == null);
    try std.testing.expect(parse("unknown") == null);
    try std.testing.expect(find(.codex).subscription);
    try std.testing.expect(find(.grok).subscription);
}
