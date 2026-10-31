//! No two apps share a default port, and the identities the kit knows use the port the list gives them.

use std::collections::HashSet;

use appkit_testkit::ports::APP_PORTS;
use appkit_testkit::subjects::DEMO_IDENTITY;

#[test]
fn no_port_is_used_twice() {
    let mut seen = HashSet::new();
    for entry in APP_PORTS {
        assert!(
            seen.insert(entry.port),
            "port {} is listed twice ({})",
            entry.port,
            entry.owner
        );
    }
}

#[test]
fn the_list_is_sorted_by_port() {
    assert!(APP_PORTS.windows(2).all(|w| w[0].port < w[1].port));
}

#[test]
fn the_port_of_the_demo_app_is_the_one_in_the_list() {
    let entry = APP_PORTS
        .iter()
        .find(|e| e.port == DEMO_IDENTITY.default_port)
        .expect("the port of Demo is in the list");
    assert!(entry.owner.contains("Demo"), "{}", entry.owner);
}
