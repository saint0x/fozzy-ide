use crate::models::RunEventEnvelope;
use parking_lot::RwLock;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};

#[derive(Clone, Default)]
pub struct EventBus {
    recent: Arc<RwLock<Vec<RunEventEnvelope>>>,
}

impl EventBus {
    pub fn emit(&self, app: &AppHandle, event: RunEventEnvelope) {
        self.recent.write().push(event.clone());
        let _ = app.emit("fozzy://event", &event);
    }
}
