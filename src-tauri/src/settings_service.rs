use crate::error::AppResult;
use crate::models::{AppSettings, SettingsPatch};
use std::fs;
use std::io::Write;
use std::path::PathBuf;

#[derive(Clone)]
pub struct SettingsService {
    path: PathBuf,
}

impl SettingsService {
    pub fn new(path: PathBuf) -> Self {
        Self { path }
    }

    pub fn get(&self) -> AppResult<AppSettings> {
        if !self.path.exists() {
            let settings = AppSettings::default();
            self.save(&settings)?;
            return Ok(settings);
        }
        Ok(serde_json::from_str(&fs::read_to_string(&self.path)?)?)
    }

    pub fn update(&self, patch: SettingsPatch) -> AppResult<AppSettings> {
        let mut settings = self.get()?;
        if let Some(theme) = patch.theme {
            settings.theme = theme;
        }
        if let Some(font_size) = patch.font_size {
            settings.font_size = font_size;
        }
        if let Some(tab_size) = patch.tab_size {
            settings.tab_size = tab_size;
        }
        if let Some(auto_save) = patch.auto_save {
            settings.auto_save = auto_save;
        }
        if let Some(telemetry_enabled) = patch.telemetry_enabled {
            settings.telemetry_enabled = telemetry_enabled;
        }
        if let Some(checkpoint_interval) = patch.checkpoint_interval {
            settings.checkpoint_interval = checkpoint_interval;
        }
        if let Some(default_runner) = patch.default_runner {
            settings.default_runner = default_runner;
        }
        if let Some(last_workspace_id) = patch.last_workspace_id {
            settings.last_workspace_id = Some(last_workspace_id);
        }
        self.save(&settings)?;
        Ok(settings)
    }

    pub fn set_last_workspace_id(&self, workspace_id: Option<String>) -> AppResult<AppSettings> {
        let mut settings = self.get()?;
        settings.last_workspace_id = workspace_id;
        self.save(&settings)?;
        Ok(settings)
    }

    fn save(&self, settings: &AppSettings) -> AppResult<()> {
        if let Some(parent) = self.path.parent() {
            fs::create_dir_all(parent)?;
        }
        let temp_path = self.path.with_extension("json.tmp");
        let mut file = fs::File::create(&temp_path)?;
        file.write_all(serde_json::to_string_pretty(settings)?.as_bytes())?;
        file.sync_all()?;
        fs::rename(temp_path, &self.path)?;
        Ok(())
    }
}
