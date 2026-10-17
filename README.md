# appkit

The shared foundation of the local desktop hubs of
[tasks-desktop](https://github.com/StefanBartl/tasks-desktop) and `rules-desktop`: a web server on
your own machine that serves an app's page and data to the browser, asks a Neovim engine for the
data, and never trusts anything that reaches it.

It was taken out of `tasks-desktop`, where it was written, so that every app gets the same guard
and the same tests. It knows no app: an app brings its names, its routes and its engine.

## Crates

| Crate | What it is |
|---|---|
| `appkit-core` | Building blocks without a server: the names of an app (`AppIdentity`), pairing and sessions, safe process runs and reads, `hub.json`, `control.secret`. |
| `appkit-hub` | The hub without the app: the guard (eight steps, in a fixed order), pairing, the page, `hello`, the list of vaults, the accept loop, the seam of the engine (one process per call, or a persistent host), the snapshot store, the file watcher, the full-text search, the settings file, the search for Neovim and the engine, installing, autostart and the first-start questions. |
| `appkit-testkit` | The security matrix every app's hub must pass, a second minimal app (`Demo`) that proves the guard knows no app, and a fake engine to test without Neovim. |
| `ui-kit` (`appkit-ui`) | The browser side, Svelte 5 and TypeScript source: the design tokens and base rules, the menu bar, the multi-select, the info button, the markdown reader, the hint popup, the event-stream reader, the pairing code and the hidden-character guard. See [ui-kit/README.md](ui-kit/README.md). |

## Using it

There are no releases on crates.io. An app depends on a tag:

```toml
[dependencies]
appkit-hub = { git = "https://github.com/StefanBartl/appkit", tag = "v0.1.0" }

[dev-dependencies]
appkit-testkit = { git = "https://github.com/StefanBartl/appkit", tag = "v0.1.0" }
```

The page of an app takes the same tag, by its folder (`pnpm-lock.yaml` pins the commit):

```
pnpm add "git+https://github.com/StefanBartl/appkit.git#vX.Y.Z&path:ui-kit"
```

`Cargo.lock` then pins the commit of the tag. To work on the kit and an app at once, point the app at
a local checkout in a `.cargo/config.toml` that is not committed:

```toml
[patch."https://github.com/StefanBartl/appkit"]
appkit-core = { path = "../appkit/crates/appkit-core" }
appkit-hub = { path = "../appkit/crates/appkit-hub" }
appkit-testkit = { path = "../appkit/crates/appkit-testkit" }
```

An app runs the security matrix for its own hub:

```rust
mod my_app {
    appkit_testkit::security_matrix!(my_app_testkit::MyApp);
}
```

## Checks

```
cargo fmt --all --check
cargo clippy --workspace --all-targets --locked -- -D warnings
cargo test --workspace --locked
cargo deny check
cargo audit
python3 tools/check-lock-age.py --min-days 7
```

The CI runs them on Linux and Windows. See [SECURITY.md](SECURITY.md) for what the hub protects
against and [docs/RELEASING.md](docs/RELEASING.md) for how a version is made.

Comments and docs name the maintainer's design notes ("concept 5.5", "concept 13.14"); those notes
are not public, the code and its tests are the reference.

## License

MIT, see [LICENSE](LICENSE).
