use crate::state::AppState;
use axum::{
    extract::Path,
    http::StatusCode,
    routing::{delete, get, post, put},
    Json, Router,
};
use goose::conversation::message::Message;
use goose::session::session_manager::SessionInsights;
use goose::session::{Session, SessionManager};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use utoipa::ToSchema;

#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct SessionListResponse {
    /// List of available session information objects
    sessions: Vec<Session>,
}

#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct UpdateSessionDescriptionRequest {
    /// Updated description (name) for the session (max 200 characters)
    description: String,
}

#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ImportSessionMessagesRequest {
    /// Messages to append/import into the session conversation (idempotent).
    messages: Vec<Message>,
}

#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ImportSessionMessagesResponse {
    /// Number of messages imported (inserted).
    imported: usize,
    /// Number of messages skipped because they already exist.
    skipped: usize,
}

const MAX_DESCRIPTION_LENGTH: usize = 200;

#[utoipa::path(
    get,
    path = "/sessions",
    responses(
        (status = 200, description = "List of available sessions retrieved successfully", body = SessionListResponse),
        (status = 401, description = "Unauthorized - Invalid or missing API key"),
        (status = 500, description = "Internal server error")
    ),
    security(
        ("api_key" = [])
    ),
    tag = "Session Management"
)]
async fn list_sessions() -> Result<Json<SessionListResponse>, StatusCode> {
    let sessions = SessionManager::list_sessions()
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(SessionListResponse { sessions }))
}

#[utoipa::path(
    get,
    path = "/sessions/{session_id}",
    params(
        ("session_id" = String, Path, description = "Unique identifier for the session")
    ),
    responses(
        (status = 200, description = "Session history retrieved successfully", body = Session),
        (status = 401, description = "Unauthorized - Invalid or missing API key"),
        (status = 404, description = "Session not found"),
        (status = 500, description = "Internal server error")
    ),
    security(
        ("api_key" = [])
    ),
    tag = "Session Management"
)]
async fn get_session(Path(session_id): Path<String>) -> Result<Json<Session>, StatusCode> {
    let session = SessionManager::get_session(&session_id, true)
        .await
        .map_err(|_| StatusCode::NOT_FOUND)?;

    Ok(Json(session))
}
#[utoipa::path(
    get,
    path = "/sessions/insights",
    responses(
        (status = 200, description = "Session insights retrieved successfully", body = SessionInsights),
        (status = 401, description = "Unauthorized - Invalid or missing API key"),
        (status = 500, description = "Internal server error")
    ),
    security(
        ("api_key" = [])
    ),
    tag = "Session Management"
)]
async fn get_session_insights() -> Result<Json<SessionInsights>, StatusCode> {
    let insights = SessionManager::get_insights()
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(Json(insights))
}

#[utoipa::path(
    put,
    path = "/sessions/{session_id}/description",
    request_body = UpdateSessionDescriptionRequest,
    params(
        ("session_id" = String, Path, description = "Unique identifier for the session")
    ),
    responses(
        (status = 200, description = "Session description updated successfully"),
        (status = 400, description = "Bad request - Description too long (max 200 characters)"),
        (status = 401, description = "Unauthorized - Invalid or missing API key"),
        (status = 404, description = "Session not found"),
        (status = 500, description = "Internal server error")
    ),
    security(
        ("api_key" = [])
    ),
    tag = "Session Management"
)]
async fn update_session_description(
    Path(session_id): Path<String>,
    Json(request): Json<UpdateSessionDescriptionRequest>,
) -> Result<StatusCode, StatusCode> {
    if request.description.len() > MAX_DESCRIPTION_LENGTH {
        return Err(StatusCode::BAD_REQUEST);
    }

    SessionManager::update_session(&session_id)
        .description(request.description)
        .apply()
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(StatusCode::OK)
}

#[utoipa::path(
    delete,
    path = "/sessions/{session_id}",
    params(
        ("session_id" = String, Path, description = "Unique identifier for the session")
    ),
    responses(
        (status = 200, description = "Session deleted successfully"),
        (status = 401, description = "Unauthorized - Invalid or missing API key"),
        (status = 404, description = "Session not found"),
        (status = 500, description = "Internal server error")
    ),
    security(
        ("api_key" = [])
    ),
    tag = "Session Management"
)]
async fn delete_session(Path(session_id): Path<String>) -> Result<StatusCode, StatusCode> {
    SessionManager::delete_session(&session_id)
        .await
        .map_err(|e| {
            if e.to_string().contains("not found") {
                StatusCode::NOT_FOUND
            } else {
                StatusCode::INTERNAL_SERVER_ERROR
            }
        })?;

    Ok(StatusCode::OK)
}

#[utoipa::path(
    post,
    path = "/sessions/{session_id}/messages/import",
    request_body = ImportSessionMessagesRequest,
    params(
        ("session_id" = String, Path, description = "Unique identifier for the session")
    ),
    responses(
        (status = 200, description = "Messages imported successfully", body = ImportSessionMessagesResponse),
        (status = 401, description = "Unauthorized - Invalid or missing API key"),
        (status = 404, description = "Session not found"),
        (status = 500, description = "Internal server error")
    ),
    security(
        ("api_key" = [])
    ),
    tag = "Session Management"
)]
async fn import_session_messages(
    Path(session_id): Path<String>,
    Json(request): Json<ImportSessionMessagesRequest>,
) -> Result<Json<ImportSessionMessagesResponse>, StatusCode> {
    // Ensure session exists
    let existing = SessionManager::get_session(&session_id, true)
        .await
        .map_err(|_| StatusCode::NOT_FOUND)?;

    // Build a set of existing messages for idempotent import.
    // Session storage currently does not persist message ids, so we dedupe by (role, created, content_json).
    let mut existing_keys = std::collections::HashSet::<String>::new();
    if let Some(conv) = existing.conversation {
        for m in conv.messages() {
            let content_json =
                serde_json::to_string(&m.content).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
            existing_keys.insert(format!("{:?}:{}:{}", m.role, m.created, content_json));
        }
    }

    let mut imported = 0usize;
    let mut skipped = 0usize;

    for m in request.messages.iter() {
        let content_json =
            serde_json::to_string(&m.content).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
        let key = format!("{:?}:{}:{}", m.role, m.created, content_json);
        if existing_keys.contains(&key) {
            skipped += 1;
            continue;
        }

        SessionManager::add_message(&session_id, m)
            .await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
        existing_keys.insert(key);
        imported += 1;
    }

    Ok(Json(ImportSessionMessagesResponse { imported, skipped }))
}

pub fn routes(state: Arc<AppState>) -> Router {
    Router::new()
        .route("/sessions", get(list_sessions))
        .route("/sessions/{session_id}", get(get_session))
        .route("/sessions/{session_id}", delete(delete_session))
        .route("/sessions/insights", get(get_session_insights))
        .route(
            "/sessions/{session_id}/description",
            put(update_session_description),
        )
        .route(
            "/sessions/{session_id}/messages/import",
            post(import_session_messages),
        )
        .with_state(state)
}

#[cfg(test)]
mod tests {
    use super::*;
    use goose::conversation::message::Message as GooseMessage;
    use std::path::PathBuf;

    #[tokio::test]
    async fn import_messages_is_idempotent() {
        // Create a fresh session
        let tmp = std::env::temp_dir().join("goose-server-import-test");
        let _ = std::fs::create_dir_all(&tmp);
        let session = SessionManager::create_session(PathBuf::from(&tmp), "test".to_string())
            .await
            .expect("create session");

        let msgs = vec![
            GooseMessage::user().with_text("hello"),
            GooseMessage::assistant().with_text("hi"),
        ];

        let first = import_session_messages(
            Path(session.id.clone()),
            Json(ImportSessionMessagesRequest {
                messages: msgs.clone(),
            }),
        )
        .await
        .expect("first import")
        .0;

        assert_eq!(first.imported, 2);

        let second = import_session_messages(
            Path(session.id.clone()),
            Json(ImportSessionMessagesRequest { messages: msgs }),
        )
        .await
        .expect("second import")
        .0;

        assert_eq!(second.imported, 0);
        assert_eq!(second.skipped, 2);

        let loaded = SessionManager::get_session(&session.id, true)
            .await
            .expect("load session");
        let conv = loaded.conversation.expect("conversation present");
        assert!(conv.messages().len() >= 2);
    }
}
