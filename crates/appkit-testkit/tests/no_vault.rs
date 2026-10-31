//! A hub without a vault and without an engine: the guard, the pairing and the page run, and
//! `hello` says so. This is the shape of the central hub, which keeps no data of its own.

use std::sync::Arc;
use std::time::Duration;

use appkit_core::authn::{ManualClock, Secret, CODE_BYTES, TOKEN_BYTES};
use appkit_hub::{HubStatus, Limits};
use appkit_testkit::subject::{StartConfig, Subject};
use appkit_testkit::subjects::Demo;
use appkit_testkit::wire::{request, send};

#[tokio::test]
async fn a_hub_with_no_vault_and_no_engine_serves_hello_and_the_page() {
    let server = Demo
        .start(StartConfig {
            addr: "127.0.0.1:0".parse().unwrap(),
            limits: Limits::default(),
            clock: Arc::new(ManualClock::new()),
            pairing_ttl: Duration::from_secs(60),
            control_secret: Secret::generate(TOKEN_BYTES).unwrap(),
            instance: Secret::generate(CODE_BYTES).unwrap(),
            status: HubStatus {
                engine_ready: false,
                problem: None,
                capabilities: Vec::new(),
            },
        })
        .await
        .expect("a hub with no vault starts");
    let host = format!("127.0.0.1:{}", server.addr().port());
    let headers = [("Host", host.as_str())];

    let hello = send(
        server.addr(),
        request("GET", "/api/demo/hello", &headers, b""),
    )
    .await;
    assert_eq!(hello.status, 200, "{hello:?}");
    let doc = hello.json();
    assert_eq!(doc["engine"]["ready"], false);
    assert_eq!(doc["setup_required"], false);

    let page = send(server.addr(), request("GET", "/", &headers, b"")).await;
    assert_eq!(page.status, 200, "{page:?}");

    // The routes of the core that need a session still refuse a request without one.
    let vaults = send(server.addr(), request("GET", "/api/vaults", &headers, b"")).await;
    assert_eq!(vaults.status, 401, "{vaults:?}");
    server.shutdown().await;
}
