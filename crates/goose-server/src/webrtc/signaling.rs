use std::sync::Arc;

use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        Path, Query, State,
    },
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use chrono::{DateTime, Utc};
use futures::{stream::StreamExt, SinkExt};
use serde::{Deserialize, Serialize};
use tokio::sync::mpsc;
use tracing::warn;

use crate::{
    state::AppState,
    webrtc::registry::{AttachedPeer, PeerIdentity, PeerRole, RegistryError},
};

pub fn routes(state: Arc<AppState>) -> Router {
    Router::new()
        .route("/peer/invite", post(create_invite))
        .route("/peer/join", post(join_invite))
        .route("/peer/ws/{room_id}", get(ws_upgrade))
        .with_state(state)
}

#[derive(Deserialize)]
pub struct CreateInviteRequest {
    pub device_id: String,
    pub device_name: String,
    #[serde(default)]
    pub public_key: Option<String>,
}

#[derive(Serialize)]
pub struct CreateInviteResponse {
    pub room_id: String,
    pub host_token: String,
    pub invite_token: String,
    pub invite_url: String,
    pub expires_at: DateTime<Utc>,
}

async fn create_invite(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<CreateInviteRequest>,
) -> Json<CreateInviteResponse> {
    let registry = &state.peer_registry;
    let invite = registry
        .create_room(PeerIdentity {
            device_id: payload.device_id,
            device_name: payload.device_name,
            public_key: payload.public_key,
        })
        .await;

    let invite_url = format!(
        "goose://peer?room={}&token={}",
        invite.room_id, invite.invite_token
    );

    Json(CreateInviteResponse {
        room_id: invite.room_id,
        host_token: invite.host_token,
        invite_token: invite.invite_token,
        invite_url,
        expires_at: invite.expires_at,
    })
}

#[derive(Deserialize)]
pub struct JoinInviteRequest {
    pub room_id: String,
    pub invite_token: String,
    pub device_id: String,
    pub device_name: String,
    #[serde(default)]
    pub public_key: Option<String>,
}

#[derive(Serialize)]
pub struct JoinInviteResponse {
    pub room_id: String,
    pub ws_token: String,
    pub host: PeerSummary,
    pub expires_at: DateTime<Utc>,
}

#[derive(Serialize)]
pub struct PeerSummary {
    pub device_id: String,
    pub device_name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub public_key: Option<String>,
}

async fn join_invite(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<JoinInviteRequest>,
) -> Result<Json<JoinInviteResponse>, StatusCode> {
    let registry = &state.peer_registry;
    match registry
        .claim_invite(
            &payload.room_id,
            &payload.invite_token,
            PeerIdentity {
                device_id: payload.device_id.clone(),
                device_name: payload.device_name.clone(),
                public_key: payload.public_key.clone(),
            },
        )
        .await
    {
        Ok(invite) => Ok(Json(JoinInviteResponse {
            room_id: invite.room_id,
            ws_token: invite.ws_token,
            host: PeerSummary {
                device_id: invite.host.device_id,
                device_name: invite.host.device_name,
                public_key: invite.host.public_key,
            },
            expires_at: invite.expires_at,
        })),
        Err(err) => Err(map_error(err)),
    }
}

#[derive(Deserialize)]
struct WsQuery {
    token: String,
}

async fn ws_upgrade(
    ws: WebSocketUpgrade,
    State(state): State<Arc<AppState>>,
    Path(room_id): Path<String>,
    Query(query): Query<WsQuery>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_ws(socket, state, room_id, query.token))
}

async fn handle_ws(socket: WebSocket, state: Arc<AppState>, room_id: String, token: String) {
    let (mut sink, mut stream) = socket.split();
    let (tx, mut rx) = mpsc::unbounded_channel::<Message>();

    let send_task = tokio::spawn(async move {
        while let Some(msg) = rx.recv().await {
            if sink.send(msg).await.is_err() {
                break;
            }
        }
    });

    let attach_result = state
        .peer_registry
        .attach(&room_id, &token, tx.clone())
        .await;

    let (attached, other_peer_sender) = match attach_result {
        Ok(result) => result,
        Err(err) => {
            let _ = tx.send(Message::Text(
                serde_json::json!({
                    "type": "peer.error",
                    "reason": err.as_static_str()
                })
                .to_string()
                .into(),
            ));
            send_task.abort();
            return;
        }
    };

    // Send ready to this peer
    send_ready(&tx, &room_id, &attached).await;

    // If the other peer is already connected, notify them too
    if let Some(other_tx) = other_peer_sender {
        // Construct the other peer's info for the notification
        let other_role = match attached.role {
            PeerRole::Host => PeerRole::Guest,
            PeerRole::Guest => PeerRole::Host,
        };
        let other_attached = AttachedPeer {
            role: other_role,
            self_identity: attached.peer_identity.clone().unwrap_or_else(|| attached.self_identity.clone()),
            peer_identity: Some(attached.self_identity.clone()),
            expires_at: attached.expires_at,
        };
        send_ready(&other_tx, &room_id, &other_attached).await;
    }

    let forward_registry = state.peer_registry.clone();
    let forward_room = room_id.clone();
    let forward_role = attached.role;

    while let Some(Ok(message)) = stream.next().await {
        match message {
            Message::Text(text) if text == "\"ping\"" || text == "ping" => {
                let _ = tx.send(Message::Text("\"pong\"".to_string().into()));
            }
            Message::Close(_) => {
                forward_registry.detach(&forward_room, forward_role).await;
                forward_registry
                    .notify_peer_disconnect(&forward_room, forward_role)
                    .await;
                break;
            }
            other => {
                if let Err(err) = forward_registry
                    .forward(&forward_room, forward_role, other)
                    .await
                {
                    warn!("failed to forward peer message: {}", err.as_static_str());
                }
            }
        }
    }

    send_task.abort();
    state.peer_registry.detach(&room_id, attached.role).await;
}

async fn send_ready(tx: &mpsc::UnboundedSender<Message>, room_id: &str, attached: &AttachedPeer) {
    let role = match attached.role {
        PeerRole::Host => "host",
        PeerRole::Guest => "guest",
    };

    let _ = tx.send(Message::Text(
        serde_json::json!({
            "type": "peer.ready",
            "role": role,
            "roomId": room_id,
            "expiresAt": attached.expires_at,
            "self": {
                "deviceId": attached.self_identity.device_id,
                "deviceName": attached.self_identity.device_name,
                "publicKey": attached.self_identity.public_key
            },
            "peer": attached.peer_identity.as_ref().map(|peer| serde_json::json!({
                "deviceId": peer.device_id,
                "deviceName": peer.device_name,
                "publicKey": peer.public_key
            }))
        })
        .to_string()
        .into(),
    ));
}

fn map_error(err: RegistryError) -> StatusCode {
    match err {
        RegistryError::NotFound => StatusCode::NOT_FOUND,
        RegistryError::InvalidToken => StatusCode::UNAUTHORIZED,
        RegistryError::AlreadyConnected => StatusCode::CONFLICT,
        RegistryError::RoomExpired => StatusCode::GONE,
        RegistryError::MissingPeer => StatusCode::BAD_REQUEST,
    }
}
