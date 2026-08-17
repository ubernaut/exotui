{
  description = "exotui — terminal UI library, the exomux desktop, and showcase apps";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs = { self, nixpkgs }:
    let
      systems = [ "x86_64-linux" "aarch64-linux" "x86_64-darwin" "aarch64-darwin" ];
      eachSystem = f: nixpkgs.lib.genAttrs systems (system: f nixpkgs.legacyPackages.${system});

      # Each app wraps its repo `deno task` verbatim, so the flake never
      # duplicates permission flags or launcher logic. The repo pins its
      # dependencies in deno.lock and uses nodeModulesDir "none", so running
      # from the read-only store works; module downloads land in a per-user
      # cache on first run.
      tasks = {
        exomux = {
          task = "exomux";
          description = "the exomux terminal desktop (tmux session manager)";
          extraInputs = pkgs: [ pkgs.tmux ];
        };
        orbital-command = {
          task = "orbital-command:persistent";
          description = "ASCII 3D orbital observatory showcase";
        };
        glyph-forge = {
          task = "glyph-forge:persistent";
          description = "terminal cell-art studio showcase";
        };
        glyph-forge-fonts = {
          task = "glyph-forge:fonts";
          description = "installs the figlet font corpus for glyph-forge";
          extraInputs = pkgs: [ pkgs.curl pkgs.gnutar pkgs.gzip pkgs.findutils ];
        };
        inkstone = {
          task = "inkstone:persistent";
          description = "markdown editor showcase";
        };
      };

      mkPackages = pkgs:
        nixpkgs.lib.mapAttrs
          (name: entry:
            pkgs.writeShellApplication {
              inherit name;
              # bash and coreutils back the `sh -c` launcher tasks in deno.jsonc.
              runtimeInputs = [ pkgs.deno pkgs.bash pkgs.coreutils ]
                ++ (if entry ? extraInputs then entry.extraInputs pkgs else [ ]);
              text = ''
                export DENO_DIR="''${DENO_DIR:-''${XDG_CACHE_HOME:-$HOME/.cache}/exotui-deno}"
                exec deno task --cwd ${self} ${entry.task} "$@"
              '';
              meta.description = entry.description;
            })
          tasks;
    in
    {
      packages = eachSystem (pkgs:
        let apps = mkPackages pkgs;
        in apps // { default = apps.exomux; });

      apps = eachSystem (pkgs:
        let
          packages = mkPackages pkgs;
          toApp = name: package: {
            type = "app";
            program = nixpkgs.lib.getExe package;
            meta.description = tasks.${name}.description;
          };
          apps = nixpkgs.lib.mapAttrs toApp packages;
        in apps // { default = apps.exomux; });

      devShells = eachSystem (pkgs: {
        default = pkgs.mkShell {
          packages = [ pkgs.deno pkgs.tmux ];
        };
      });
    };
}
