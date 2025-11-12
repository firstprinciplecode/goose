use axum::{
    extract::{Request, State},
    http::{Method, StatusCode},
    middleware::Next,
    response::Response,
};

pub async fn check_token(
    State(state): State<String>,
    request: Request,
    next: Next,
) -> Result<Response, StatusCode> {
    if request.method() == Method::OPTIONS {
        return Ok(next.run(request).await);
    }
    let path = request.uri().path();
    if path == "/status" || path == "/peer/join" || path.starts_with("/peer/ws/") {
        return Ok(next.run(request).await);
    }
    let secret_key = request
        .headers()
        .get("X-Secret-Key")
        .and_then(|value| value.to_str().ok());

    match secret_key {
        Some(key) if key == state => Ok(next.run(request).await),
        _ => Err(StatusCode::UNAUTHORIZED),
    }
}
