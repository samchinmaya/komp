//! The `komp` command as a user runs it.

use std::io::Write;
use std::process::{Command, Output, Stdio};

fn komp(args: &[&str], input: &[u8]) -> Output {
    let mut child = Command::new(env!("CARGO_BIN_EXE_komp"))
        .args(args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();
    child.stdin.take().unwrap().write_all(input).unwrap();
    child.wait_with_output().unwrap()
}

#[test]
fn prints_its_version() {
    for flag in ["--version", "-V"] {
        let output = komp(&[flag], b"");
        assert!(output.status.success());
        assert_eq!(String::from_utf8_lossy(&output.stdout).trim(), format!("komp {}", env!("CARGO_PKG_VERSION")));
    }
}

#[test]
fn unknown_options_are_not_treated_as_files() {
    let output = komp(&["--nope"], b"");
    assert_eq!(output.status.code(), Some(2));
    assert!(String::from_utf8_lossy(&output.stderr).contains("unknown option --nope"));
}

#[test]
fn compressed_input_is_refused_without_printing_it() {
    let output = komp(&["-"], &[0x1F, 0x8B, 8, 0, b's', b'e', b'c', b'r', b'e', b't']);
    assert_eq!(output.status.code(), Some(1));
    assert!(output.stdout.is_empty());
    assert!(String::from_utf8_lossy(&output.stderr).contains("gzip-compressed"));
}

#[test]
fn stdin_with_one_bad_byte_still_works() {
    let mut log = b"2026-11-18T10:00:00Z ERROR caf".to_vec();
    log.push(0xE9);
    log.extend_from_slice(b" failed while reading the menu from disk\n");
    let output = komp(&["-"], &log);
    assert!(output.status.success());
    assert!(String::from_utf8_lossy(&output.stdout).contains("ERROR caf"));
}
