//! комп (komp): compress DevOps/Kubernetes logs so Claude spends fewer tokens reading them.
//!
//! - [`compress`]: the compressor itself, text in → summary out
//! - [`input`]: where logs come from (clipboard, file, stdin, kubectl)
//! - [`mcp`]: the MCP server that exposes it all to Claude as tools

pub mod compress;
pub mod input;
pub mod mcp;
