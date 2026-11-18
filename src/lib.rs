//! комп (komp): compress DevOps/Kubernetes logs so Claude spends fewer tokens reading them.
//!
//! - [`compress`]: the compressor itself, text in → summary out
//! - [`input`]: where logs come from (clipboard, file, stdin, kubectl)
//! - [`guard`]: the local privacy check every log passes before compression
//! - [`mcp`]: the MCP server that exposes it all to Claude as tools

pub mod compress;
pub mod guard;
pub mod input;
pub mod mcp;
