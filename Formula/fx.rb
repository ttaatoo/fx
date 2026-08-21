# frozen_string_literal: true

class Fx < Formula
  desc "Unix-like coding agent CLI"
  homepage "https://github.com/ttaatoo/fx"
  version "0.0.5"
  license "Apache-2.0"
  # GitHub Release tarballs (not bottles, not a Vercel blob CDN). Until a
  # v0.0.5 release exists, install from git:
  #   brew install --formula --HEAD ttaatoo/fx/fx
  # Keep version + sha256 :no_check after rebuilding the same tag. Pin
  # sha256 only when bumping version.
  on_macos do
    on_arm do
      url "https://github.com/ttaatoo/fx/releases/download/v#{version}/fx-macos-arm64.tar.gz"
      sha256 :no_check
    end
    on_intel do
      url "https://github.com/ttaatoo/fx/releases/download/v#{version}/fx-macos-x86_64.tar.gz"
      sha256 :no_check
    end
  end

  on_linux do
    on_arm do
      url "https://github.com/ttaatoo/fx/releases/download/v#{version}/fx-linux-aarch64.tar.gz"
      sha256 :no_check
    end
    on_intel do
      url "https://github.com/ttaatoo/fx/releases/download/v#{version}/fx-linux-x86_64.tar.gz"
      sha256 :no_check
    end
  end

  head "https://github.com/ttaatoo/fx.git", branch: "main"

  # Homebrew-core `zig` is 0.16.0 (also aliased as zig@0.16).
  depends_on "zig" => :build if build.head?

  def install
    if build.head?
      system "zig", "build", "-Doptimize=ReleaseSafe"
      bin.install "zig-out/bin/fx"
    else
      bin.install "fx"
    end
  end

  def caveats
    <<~EOS
      This is the ttaatoo/fx fork (SuperGrok, Anthropic, and Codex; no Vercel
      AI Gateway). It is not Homebrew-core's `fx` JSON viewer.

      Until a GitHub Release exists for v#{version}, install from git:

        brew install --formula --HEAD ttaatoo/fx/fx
    EOS
  end

  test do
    assert_match(/\d+\.\d+\.\d+/, shell_output("#{bin}/fx --version"))
  end
end
