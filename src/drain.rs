//! Log-template mining with the Drain algorithm, following Drain3's defaults:
//! https://github.com/logpai/Drain3
//!
//! A message is split into tokens, variable-looking parts are masked (`200` →
//! `<NUM>`), and a shallow tree finds earlier templates with the same token count
//! and first token. The most similar one absorbs the message; positions that differ
//! become wildcards. If nothing is similar enough, the message starts a new template.
//!
//! This module only decides which messages belong together. `compress.rs` turns each
//! group into komp's own output.

use regex::Regex;
use std::collections::HashMap;
use std::ops::Range;
use std::sync::LazyLock;

const WILDCARD: &str = "<*>";
/// Drain3's `depth`: root + token-count level + one level of leading tokens.
const DEPTH: usize = 4;
const MAX_CHILDREN: usize = 100;
/// Drain3's `sim_th`.
pub const DEFAULT_SIMILARITY: f64 = 0.4;

/// Drain3's example masks, without its command-specific rule. Rust's regex engine has
/// no look-around, so `mask_spans` checks the characters on either side of each match.
static MASK: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(
        r"(?x)
          (?:[0-9a-f]{2,}:){3,}[0-9a-f]{2,}
        | \d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}
        | (?:[0-9a-f]{6,}\ ?){3,}
        | (?:[0-9A-F]{4}\ ?){4,}
        | 0x[a-fA-F0-9]+
        | [-+]?\d+
        ",
    )
    .unwrap()
});

/// One token: where it sits in the message, and the form Drain compares.
pub struct Token {
    pub range: Range<usize>,
    pub masked: String,
}

pub struct Tokens {
    pub tokens: Vec<Token>,
    /// Split by character class, so the tokens join back without spaces.
    pub compact: bool,
}

/// Split on whitespace like Drain3. A single punctuation-heavy token, such as compact
/// JSON, is split by character class instead so Drain has positions to compare.
pub fn tokenize(message: &str) -> Tokens {
    let spans = mask_spans(message);
    let tokens = split(message, &spans, false);
    if tokens.len() == 1 && is_punctuation_heavy(message) {
        return Tokens { tokens: split(message, &spans, true), compact: true };
    }
    Tokens { tokens, compact: false }
}

fn is_word_char(c: char) -> bool {
    c.is_alphanumeric() || c == '_'
}

fn is_punctuation_heavy(message: &str) -> bool {
    let total = message.chars().count();
    let punctuation = message.chars().filter(|c| !is_word_char(*c)).count();
    punctuation >= 4 && punctuation * 5 >= total
}

fn mask_label(text: &str) -> &'static str {
    let digits = text.trim_start_matches(['-', '+']);
    if text.starts_with("0x") {
        "<HEX>"
    } else if !digits.is_empty() && digits.bytes().all(|b| b.is_ascii_digit()) {
        "<NUM>"
    } else if text.contains('.') {
        "<IP>"
    } else if text.contains(':') {
        "<ID>"
    } else {
        "<SEQ>"
    }
}

fn mask_spans(message: &str) -> Vec<(Range<usize>, &'static str)> {
    let bytes = message.as_bytes();
    let mut spans = Vec::new();
    for found in MASK.find_iter(message) {
        let mut start = found.start();
        let mut end = found.end();
        while end > start && bytes[end - 1] == b' ' {
            end -= 1;
        }
        if start > 0 && bytes[start - 1].is_ascii_alphanumeric() {
            // `a-1`: the sign cannot start a masked value, but the digits can.
            if !matches!(bytes[start], b'-' | b'+') {
                continue;
            }
            start += 1;
        }
        if start >= end || bytes.get(end).is_some_and(u8::is_ascii_alphanumeric) {
            continue;
        }
        spans.push((start..end, mask_label(&message[start..end])));
    }
    spans
}

fn split(message: &str, spans: &[(Range<usize>, &'static str)], compact: bool) -> Vec<Token> {
    fn finish(tokens: &mut Vec<Token>, current: &mut Option<(usize, String)>, end: usize) {
        if let Some((start, masked)) = current.take() {
            tokens.push(Token { range: start..end, masked });
        }
    }

    let mut tokens = Vec::new();
    let mut current: Option<(usize, String)> = None;
    let mut chars = message.char_indices().peekable();
    let mut next_span = 0;

    while let Some(&(at, c)) = chars.peek() {
        if let Some((range, label)) = spans.get(next_span).filter(|(range, _)| range.start == at) {
            next_span += 1;
            if compact {
                finish(&mut tokens, &mut current, at);
                tokens.push(Token { range: range.clone(), masked: (*label).to_string() });
            } else {
                current.get_or_insert_with(|| (at, String::new())).1.push_str(label);
            }
            while chars.peek().is_some_and(|&(i, _)| i < range.end) {
                chars.next();
            }
            continue;
        }

        chars.next();
        if c.is_whitespace() {
            finish(&mut tokens, &mut current, at);
        } else if compact && !is_word_char(c) {
            finish(&mut tokens, &mut current, at);
            tokens.push(Token { range: at..at + c.len_utf8(), masked: c.to_string() });
        } else {
            current.get_or_insert_with(|| (at, String::new())).1.push(c);
        }
    }
    finish(&mut tokens, &mut current, message.len());
    tokens
}

#[derive(Default)]
struct Node {
    children: HashMap<String, Node>,
    clusters: Vec<usize>,
}

/// A Drain parse tree and its templates.
pub struct Drain {
    similarity: f64,
    by_length: HashMap<usize, Node>,
    templates: Vec<Vec<String>>,
}

impl Drain {
    pub fn new(similarity: f64) -> Drain {
        Drain { similarity, by_length: HashMap::new(), templates: Vec::new() }
    }

    /// Add a masked message and return the id of the template that absorbed it.
    pub fn add(&mut self, tokens: &[&str]) -> usize {
        match self.search(tokens) {
            Some(id) => {
                for (slot, token) in self.templates[id].iter_mut().zip(tokens) {
                    if slot != token {
                        *slot = WILDCARD.to_string();
                    }
                }
                id
            }
            None => {
                let id = self.templates.len();
                self.templates.push(tokens.iter().map(|t| (*t).to_string()).collect());
                self.insert(id, tokens);
                id
            }
        }
    }

    fn search(&self, tokens: &[&str]) -> Option<usize> {
        let mut node = self.by_length.get(&tokens.len())?;
        if tokens.is_empty() {
            return node.clusters.first().copied();
        }
        for (depth, token) in (1..).zip(tokens) {
            if depth >= DEPTH - 2 || depth == tokens.len() {
                break;
            }
            node = node.children.get(*token).or_else(|| node.children.get(WILDCARD))?;
        }
        self.best_match(&node.clusters, tokens)
    }

    fn best_match(&self, clusters: &[usize], tokens: &[&str]) -> Option<usize> {
        let mut best = None;
        let mut best_score = (-1.0, 0);
        for &id in clusters {
            let template = &self.templates[id];
            let mut same = 0;
            let mut wildcards = 0;
            for (slot, token) in template.iter().zip(tokens) {
                if slot == WILDCARD {
                    wildcards += 1;
                } else if slot == token {
                    same += 1;
                }
            }
            let similarity = same as f64 / template.len() as f64;
            if similarity > best_score.0 || (similarity == best_score.0 && wildcards > best_score.1) {
                best_score = (similarity, wildcards);
                best = Some(id);
            }
        }
        best.filter(|_| best_score.0 >= self.similarity)
    }

    fn insert(&mut self, id: usize, tokens: &[&str]) {
        let mut node = self.by_length.entry(tokens.len()).or_default();
        if tokens.is_empty() {
            node.clusters = vec![id];
            return;
        }
        for (depth, token) in (1..).zip(tokens) {
            if depth >= DEPTH - 2 || depth >= tokens.len() {
                break;
            }
            let key = if node.children.contains_key(*token) {
                token
            } else if token.bytes().any(|b| b.is_ascii_digit()) {
                WILDCARD
            } else if node.children.contains_key(WILDCARD) {
                if node.children.len() < MAX_CHILDREN { token } else { WILDCARD }
            } else if node.children.len() + 1 < MAX_CHILDREN {
                token
            } else {
                WILDCARD
            };
            node = node.children.entry(key.to_string()).or_default();
        }
        node.clusters.push(id);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn masked(message: &str) -> Vec<String> {
        tokenize(message).tokens.into_iter().map(|t| t.masked).collect()
    }

    fn add(drain: &mut Drain, message: &str) -> usize {
        let tokens = masked(message);
        let tokens: Vec<&str> = tokens.iter().map(String::as_str).collect();
        drain.add(&tokens)
    }

    #[test]
    fn masks_values_only_at_token_boundaries() {
        assert_eq!(
            masked("from 10.0.3.17:5432 code=-1 at 0xff9 v2 a-7"),
            ["from", "<IP>:<NUM>", "code=<NUM>", "at", "<HEX>", "v2", "a-<NUM>"]
        );
    }

    #[test]
    fn keeps_the_original_text_of_each_token() {
        let message = "took 12 ms";
        let tokens = tokenize(message).tokens;
        let raw: Vec<&str> = tokens.iter().map(|t| &message[t.range.clone()]).collect();
        assert_eq!(raw, ["took", "12", "ms"]);
    }

    #[test]
    fn compact_json_is_split_by_character_class() {
        let parsed = tokenize(r#"["checkout",503,"timeout"]"#);
        assert!(parsed.compact);
        let tokens: Vec<&str> = parsed.tokens.iter().map(|t| t.masked.as_str()).collect();
        assert_eq!(tokens, ["[", "\"", "checkout", "\"", ",", "<NUM>", ",", "\"", "timeout", "\"", "]"]);
    }

    #[test]
    fn ordinary_single_words_are_not_compact() {
        assert!(!tokenize("ready").compact);
        assert!(!tokenize("/healthz").compact);
    }

    #[test]
    fn similar_messages_share_a_template() {
        let mut drain = Drain::new(DEFAULT_SIMILARITY);
        let first = add(&mut drain, "user alice logged in");
        assert_eq!(add(&mut drain, "user bob logged in"), first);
        assert_eq!(drain.templates[first], ["user", WILDCARD, "logged", "in"]);
    }

    #[test]
    fn different_length_or_first_token_starts_a_new_template() {
        let mut drain = Drain::new(DEFAULT_SIMILARITY);
        let first = add(&mut drain, "user alice logged in");
        assert_ne!(add(&mut drain, "user alice logged in today"), first);
        assert_ne!(add(&mut drain, "admin alice logged in"), first);
    }

    #[test]
    fn similarity_threshold_is_respected() {
        let mut strict = Drain::new(0.7);
        let first = add(&mut strict, "request failed because disk is full");
        assert_ne!(add(&mut strict, "request failed since network was down"), first);
    }
}
