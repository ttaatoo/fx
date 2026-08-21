# frozen_string_literal: true

class Fx < Formula
  desc "Unix-like coding agent CLI"
  homepage "https://github.com/ttaatoo/fx"
  version "0.0.4"
  license "Apache-2.0"

  # Prebuilt GitHub Release tarballs (not the Vercel blob CDN). Until a
  # v0.0.4 release exists, install from git:
  #   brew install --formula --HEAD ttaatoo/fx/fx
  # macOS arm64 ships as fx-macos-aarch64.tar.gz (PGSO package_release).
  on_macos do
    on_arm do
      url "https://github.com/ttaatoo/fx/releases/download/v#{version}/fx-macos-aarch64.tar.gz"
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

  head do
    url "https://github.com/ttaatoo/fx.git", branch: "main"

    # Homebrew-core `zig` is 0.16.0 (also aliased as zig@0.16).
    depends_on "zig" => :build
  end

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
      AI Gateway). It is not the upstream installer at fx.sh and not the
      Homebrew-core `fx` JSON viewer.

      Until a GitHub Release exists for v#{version}, install from git:

        brew install --formula --HEAD ttaatoo/fx/fx
    EOS
  end

  test do
    assert_match(/\d+\.\d+\.\d+/, shell_output("#{bin}/fx --version"))
  end
end
