//! Collaborative session utilities
//!
//! This module provides utilities for handling collaborative agent sessions,
//! where multiple users can participate in a conversation and the agent
//! only responds when explicitly triggered with @goose.

use regex::Regex;
use std::sync::LazyLock;

/// Regex pattern to match @goose mentions (case insensitive, word boundary)
static GOOSE_MENTION_REGEX: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i)@goose\b").expect("Invalid regex pattern"));

/// Check if a message contains a @goose mention
pub fn contains_goose_mention(content: &str) -> bool {
    GOOSE_MENTION_REGEX.is_match(content)
}

/// Strip @goose mentions from a message
pub fn strip_goose_mention(content: &str) -> String {
    GOOSE_MENTION_REGEX
        .replace_all(content, "")
        .trim()
        .to_string()
}

/// Extract the first text content from a message for mention detection
pub fn get_message_text(message: &crate::conversation::message::Message) -> Option<String> {
    message
        .content
        .iter()
        .find_map(|content| content.as_text().map(|s| s.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_contains_goose_mention() {
        assert!(contains_goose_mention("Hey @goose can you help?"));
        assert!(contains_goose_mention("@Goose please respond"));
        assert!(contains_goose_mention("Can you help @GOOSE?"));
        assert!(contains_goose_mention("@goose"));

        // Should not match partial words
        assert!(!contains_goose_mention("@gooseberry"));
        assert!(!contains_goose_mention("Hello world"));
        assert!(!contains_goose_mention("goose without at"));
    }

    #[test]
    fn test_strip_goose_mention() {
        assert_eq!(
            strip_goose_mention("Hey @goose can you help?"),
            "Hey  can you help?"
        );
        assert_eq!(
            strip_goose_mention("@goose please respond"),
            "please respond"
        );
        assert_eq!(strip_goose_mention("@goose"), "");
    }
}
