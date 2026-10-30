//! No source of the workspace makes its own folder in the temp dir: tests get theirs from
//! `appkit_scratch::Scratch`, which removes it also when the test fails. A test that joined a name to
//! `std::env::temp_dir()` and removed the folder at its end (or never) left some thirty folders in
//! the temp dir on every run.
//!
//! Code that really needs the temp dir itself (not a test) says so on the same line with the marker
//! `temp-dir-ok` and why.

use std::path::{Path, PathBuf};

const MARKER: &str = "temp-dir-ok";

fn rust_files(dir: &Path, out: &mut Vec<PathBuf>) {
    for entry in std::fs::read_dir(dir).unwrap_or_else(|e| panic!("{}: {e}", dir.display())) {
        let path = entry.unwrap().path();
        if path.is_dir() {
            if path.file_name().is_some_and(|n| n == "target") {
                continue;
            }
            rust_files(&path, out);
        } else if path.extension().is_some_and(|e| e == "rs") {
            out.push(path);
        }
    }
}

/// The lines of `text` that reach for the temp dir by hand, as `line: text`.
fn bare_uses(text: &str) -> Vec<String> {
    text.lines()
        .enumerate()
        .filter(|(_, line)| line.contains("temp_dir()") && !line.contains(MARKER))
        .map(|(i, line)| format!("{}: {}", i + 1, line.trim()))
        .collect()
}

#[test]
fn the_detector_sees_a_bare_use_and_lets_the_marked_one_pass() {
    let text = "fn a() {\n    let d = std::env::temp_dir().join(\"x\");\n}\n\
                let t = std::env::temp_dir(); // temp-dir-ok: the folder of the OS\n";
    assert_eq!(
        bare_uses(text),
        ["2: let d = std::env::temp_dir().join(\"x\");"]
    );
}

#[test]
fn no_crate_reaches_for_the_temp_dir_by_hand() {
    let crates = Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .expect("the crates folder")
        .to_path_buf();
    let own = Path::new(env!("CARGO_MANIFEST_DIR"));
    let mut files = Vec::new();
    rust_files(&crates, &mut files);
    // The other crates are there: a scan of nothing would pass for the wrong reason.
    assert!(
        files
            .iter()
            .any(|f| f.ends_with(Path::new("src").join("registry.rs"))),
        "the sources of the other crates were not found below {}",
        crates.display()
    );
    let mut found = Vec::new();
    for file in files.iter().filter(|f| !f.starts_with(own)) {
        let text = std::fs::read_to_string(file).unwrap();
        for hit in bare_uses(&text) {
            found.push(format!("{}:{hit}", file.display()));
        }
    }
    assert!(
        found.is_empty(),
        "use appkit_scratch::Scratch for a test folder (it is removed also when the test fails); \
         mark a deliberate use with `{MARKER}`:\n{}",
        found.join("\n")
    );
}
