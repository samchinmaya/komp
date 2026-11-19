//! Compress realistic log files and check two things:
//! 1. the output is much smaller, and
//! 2. the facts an engineer needs to debug are still in it.

use komp::compress::{Options, compress};
use komp::guard;

fn check(input: &str, must_contain: &[&str]) -> String {
    let summary = compress(input, &Options::default());
    let out = &summary.text;
    let in_chars = input.chars().count();
    let out_chars = out.chars().count();
    assert!(out_chars * 20 < in_chars, "expected at least 95% smaller, got {in_chars} → {out_chars} chars:\n{out}");
    for needle in must_contain {
        assert!(out.contains(needle), "lost {needle:?} in:\n{out}");
    }
    summary.text
}

#[test]
fn go_logfmt_database_outage() {
    let out = check(
        include_str!("fixtures/go-logfmt-db-outage.log"),
        &[
            "dial tcp 10.0.3.17:5432: connect: connection refused",
            "FATAL msg=\"giving up: database unreachable after 5 attempts\"",
            "attempt={1|2|3|4|5}/5",
            "service=orders", // hoisted into the header
            // the 503s only happened during the outage, so they get their own line and time range
            "10:04:06–10:06:49 INFO  msg=\"GET /api/orders/",
            "status=503",
        ],
    );
    assert_eq!(out.matches("service=orders").count(), 1, "hoisted once:\n{out}");
    assert!(!out.contains("{200|503}"), "503s split from the 200s:\n{out}");
}

#[test]
fn node_json_card_declines() {
    check(
        include_str!("fixtures/node-json-payments.log"),
        &[
            "ERROR charge failed",
            "Your card was declined.",
            "×30",
            "at async chargeCustomer (/app/src/billing/charge.js:88:20)",
            "upstream=fraud-check",
        ],
    );
}

#[test]
fn java_null_pointer_with_stack_trace() {
    let out = check(
        include_str!("fixtures/java-spring-npe.log"),
        &[
            "java.lang.NullPointerException: Cannot invoke \"com.shop.Customer.getAddress()\" because \"customer\" is null ×30",
            "at com.shop.orders.ShippingService.quote(ShippingService.java:57)",
            "framework frames",
        ],
    );
    assert!(!out.contains("org.apache.catalina"), "framework frames folded:\n{out}");
    assert!(!out.contains("nio-8080-exec"), "Spring Boot pid/thread dropped:\n{out}");
}

#[test]
fn kubelet_crash_loop() {
    check(
        include_str!("fixtures/kubelet-crashloop.log"),
        &["CrashLoopBackOff", "back-off 10–160s", "\"Probe failed\"", "connection refused\" ×100"],
    );
}

#[test]
fn privacy_check_accepts_every_fixture_and_keeps_its_facts() {
    for (log, fact) in [
        (include_str!("fixtures/go-logfmt-db-outage.log"), "dial tcp 10.0.3.17:5432"),
        (include_str!("fixtures/java-spring-npe.log"), "NullPointerException"),
        (include_str!("fixtures/kubelet-crashloop.log"), "CrashLoopBackOff"),
        (include_str!("fixtures/node-json-payments.log"), "card"),
    ] {
        let checked = guard::check(log, true).expect("a real log must pass");
        assert!(checked.text.contains(fact));
    }
}
