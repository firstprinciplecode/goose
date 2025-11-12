use std::{collections::HashMap, time::Duration};

use axum::extract::ws::Message;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::json;
use tokio::sync::{mpsc, Mutex};
use uuid::Uuid;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PeerIdentity {
    pub device_id: String,
    pub device_name: String,
    #[serde(default)]
    pub public_key: Option<String>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PeerRole {
    Host,
    Guest,
}

#[derive(Debug)]
pub enum RegistryError {
    NotFound,
    InvalidToken,
    AlreadyConnected,
    RoomExpired,
    MissingPeer,
}

impl RegistryError {
    pub fn as_static_str(&self) -> &'static str {
        match self {
            RegistryError::NotFound => "room_not_found",
            RegistryError::InvalidToken => "invalid_token",
            RegistryError::AlreadyConnected => "already_connected",
            RegistryError::RoomExpired => "invite_expired",
            RegistryError::MissingPeer => "peer_not_ready",
        }
    }
}

#[derive(Clone)]
pub struct PeerRegistry {
    inner: std::sync::Arc<Mutex<HashMap<String, PeerRoom>>>,
    ttl: Duration,
}

impl PeerRegistry {
    pub fn new(ttl: Duration) -> Self {
        Self {
            inner: std::sync::Arc::new(Mutex::new(HashMap::new())),
            ttl,
        }
    }

    pub async fn create_room(&self, host: PeerIdentity) -> CreateInvite {
        let mut rooms = self.inner.lock().await;

        let room_id = Uuid::new_v4().to_string();
        let host_token = Uuid::new_v4().to_string();
        let invite_token = Uuid::new_v4().to_string();
        let expires_at = Utc::now() + chrono::Duration::from_std(self.ttl).unwrap();

        rooms.insert(
            room_id.clone(),
            PeerRoom {
                created_at: Utc::now(),
                expires_at,
                host,
                host_ws_token: host_token.clone(),
                host_sender: None,
                host_connected: false,
                guest_invite_token: Some(invite_token.clone()),
                guest_ws_token: None,
                guest_info: None,
                guest_sender: None,
                guest_connected: false,
            },
        );

        CreateInvite {
            room_id,
            host_token,
            invite_token,
            expires_at,
        }
    }

    pub async fn claim_invite(
        &self,
        room_id: &str,
        invite_token: &str,
        guest: PeerIdentity,
    ) -> Result<JoinInvite, RegistryError> {
        let mut rooms = self.inner.lock().await;
        let room = rooms.get_mut(room_id).ok_or(RegistryError::NotFound)?;

        if Utc::now() > room.expires_at {
            rooms.remove(room_id);
            return Err(RegistryError::RoomExpired);
        }

        match &room.guest_invite_token {
            Some(token) if token == invite_token => {}
            _ => return Err(RegistryError::InvalidToken),
        }

        let guest_ws_token = Uuid::new_v4().to_string();
        room.guest_invite_token = None;
        room.guest_ws_token = Some(guest_ws_token.clone());
        room.guest_info = Some(guest.clone());

        Ok(JoinInvite {
            room_id: room_id.to_string(),
            ws_token: guest_ws_token,
            host: room.host.clone(),
            expires_at: room.expires_at,
        })
    }

    pub async fn attach(
        &self,
        room_id: &str,
        token: &str,
        sender: mpsc::UnboundedSender<Message>,
    ) -> Result<(AttachedPeer, Option<mpsc::UnboundedSender<Message>>), RegistryError> {
        let mut rooms = self.inner.lock().await;
        let room = rooms.get_mut(room_id).ok_or(RegistryError::NotFound)?;

        if Utc::now() > room.expires_at {
            rooms.remove(room_id);
            return Err(RegistryError::RoomExpired);
        }

        if room.host_ws_token == token {
            if room.host_connected {
                return Err(RegistryError::AlreadyConnected);
            }
            room.host_sender = Some(sender.clone());
            room.host_connected = true;
            let peer = room.guest_info.clone();
            let other_sender = room.guest_sender.clone();
            return Ok((
                AttachedPeer {
                    role: PeerRole::Host,
                    self_identity: room.host.clone(),
                    peer_identity: peer,
                    expires_at: room.expires_at,
                },
                other_sender,
            ));
        }

        match &room.guest_ws_token {
            Some(guest_token) if guest_token == token => {
                if room.guest_connected {
                    return Err(RegistryError::AlreadyConnected);
                }
                let guest_info = room.guest_info.clone().ok_or(RegistryError::MissingPeer)?;
                room.guest_sender = Some(sender.clone());
                room.guest_connected = true;
                let other_sender = room.host_sender.clone();
                return Ok((
                    AttachedPeer {
                        role: PeerRole::Guest,
                        self_identity: guest_info,
                        peer_identity: Some(room.host.clone()),
                        expires_at: room.expires_at,
                    },
                    other_sender,
                ));
            }
            _ => Err(RegistryError::InvalidToken),
        }
    }

    pub async fn forward(
        &self,
        room_id: &str,
        role: PeerRole,
        message: Message,
    ) -> Result<(), RegistryError> {
        let rooms = self.inner.lock().await;
        let room = rooms.get(room_id).ok_or(RegistryError::NotFound)?;

        let target = match role {
            PeerRole::Host => room.guest_sender.as_ref(),
            PeerRole::Guest => room.host_sender.as_ref(),
        };

        target
            .ok_or(RegistryError::MissingPeer)?
            .send(message)
            .map_err(|_| RegistryError::MissingPeer)
    }

    pub async fn detach(&self, room_id: &str, role: PeerRole) {
        let mut rooms = self.inner.lock().await;
        if let Some(room) = rooms.get_mut(room_id) {
            match role {
                PeerRole::Host => {
                    room.host_sender = None;
                    room.host_connected = false;
                }
                PeerRole::Guest => {
                    room.guest_sender = None;
                    room.guest_connected = false;
                }
            }

            if room.guest_sender.is_none() && room.host_sender.is_none() {
                rooms.remove(room_id);
            }
        }
    }

    pub async fn notify_peer_disconnect(&self, room_id: &str, role: PeerRole) {
        let mut rooms = self.inner.lock().await;
        if let Some(room) = rooms.get_mut(room_id) {
            let target = match role {
                PeerRole::Host => room.guest_sender.as_ref(),
                PeerRole::Guest => room.host_sender.as_ref(),
            };

            if let Some(sender) = target {
                let _ = sender.send(Message::Text(
                    json!({
                        "type": "peer.disconnected"
                    })
                    .to_string()
                    .into(),
                ));
            }
        }
    }
}

#[derive(Clone)]
pub struct CreateInvite {
    pub room_id: String,
    pub host_token: String,
    pub invite_token: String,
    pub expires_at: DateTime<Utc>,
}

#[derive(Clone)]
pub struct JoinInvite {
    pub room_id: String,
    pub ws_token: String,
    pub host: PeerIdentity,
    pub expires_at: DateTime<Utc>,
}

#[derive(Clone)]
pub struct AttachedPeer {
    pub role: PeerRole,
    pub self_identity: PeerIdentity,
    pub peer_identity: Option<PeerIdentity>,
    pub expires_at: DateTime<Utc>,
}

struct PeerRoom {
    created_at: DateTime<Utc>,
    expires_at: DateTime<Utc>,
    host: PeerIdentity,
    host_ws_token: String,
    host_sender: Option<mpsc::UnboundedSender<Message>>,
    host_connected: bool,
    guest_invite_token: Option<String>,
    guest_ws_token: Option<String>,
    guest_info: Option<PeerIdentity>,
    guest_sender: Option<mpsc::UnboundedSender<Message>>,
    guest_connected: bool,
}

impl Default for PeerRegistry {
    fn default() -> Self {
        Self::new(Duration::from_secs(15 * 60))
    }
}
