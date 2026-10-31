//! `appkit_hub::launch::spawn` seen from the child: a test program (`launch-probe`) writes down
//! what it was given.

use std::path::Path;
use std::time::{Duration, Instant};

use appkit_hub::launch::{spawn, LaunchOpts, Window};
use appkit_scratch::Scratch;
use serde_json::Value;

const PROBE: &str = env!("CARGO_BIN_EXE_launch-probe");

/// Start the probe and wait for what it wrote.
fn run(window: Window, args: &[&str], cwd: &Path, out: &Path) -> Value {
    let mut argv = vec![out.to_str().unwrap()];
    argv.extend_from_slice(args);
    spawn(Path::new(PROBE), &argv, &LaunchOpts { cwd, window }).expect("the probe starts");
    let deadline = Instant::now() + Duration::from_secs(30);
    while Instant::now() < deadline {
        if let Ok(text) = std::fs::read_to_string(out) {
            return serde_json::from_str(&text).expect("the probe wrote JSON");
        }
        std::thread::sleep(Duration::from_millis(50));
    }
    panic!("the probe wrote nothing within 30 seconds");
}

/// A path as text, without the `\\?\` prefix and case, to compare two spellings of one folder.
fn plain(path: &str) -> String {
    path.trim_start_matches(r"\\?\")
        .replace('/', "\\")
        .to_lowercase()
}

#[test]
fn the_arguments_arrive_as_they_were_given_and_the_folder_is_the_one_named() {
    let dir = Scratch::new("launch-argv");
    let work = dir.join("work dir");
    std::fs::create_dir(&work).unwrap();
    let args = [
        "start",
        "--open",
        "a b",
        "x&y",
        "\"quoted\"",
        "%PATH%",
        "$(whoami)",
        "",
    ];
    let seen = run(Window::Default, &args, &work, &dir.join("seen.json"));
    let given: Vec<&str> = seen["args"]
        .as_array()
        .unwrap()
        .iter()
        .map(|a| a.as_str().unwrap())
        .collect();
    assert_eq!(given, args);
    let cwd = seen["cwd"].as_str().unwrap();
    assert_eq!(plain(cwd), plain(work.to_str().unwrap()), "{cwd}");
}

#[cfg(windows)]
#[test]
fn the_standard_streams_of_the_child_are_the_null_device() {
    let dir = Scratch::new("launch-stdio");
    let seen = run(Window::Default, &[], &dir, &dir.join("seen.json"));
    assert_eq!(seen["stdio"], serde_json::json!(["null", "null", "null"]));
}

#[cfg(windows)]
#[test]
fn a_new_console_is_a_console_of_the_child_alone() {
    let dir = Scratch::new("launch-console");
    let seen = run(Window::NewConsole, &[], &dir, &dir.join("seen.json"));
    assert_eq!(seen["console_processes"], 1, "{seen}");
}

#[test]
fn a_start_does_not_wait_for_the_program() {
    // The probe is quick, but the call returns with a process id before it can be asked.
    let dir = Scratch::new("launch-nowait");
    let out = dir.join("seen.json");
    let pid = spawn(
        Path::new(PROBE),
        &[out.to_str().unwrap()],
        &LaunchOpts {
            cwd: &dir,
            window: Window::Default,
        },
    )
    .unwrap();
    assert!(pid > 0);
    let deadline = Instant::now() + Duration::from_secs(30);
    while !out.exists() && Instant::now() < deadline {
        std::thread::sleep(Duration::from_millis(50));
    }
    assert!(out.exists());
}
