use notify::{Config, RecommendedWatcher, RecursiveMode, Watcher};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager};

#[derive(Debug, Serialize, Deserialize, Clone)]
struct AppState {
    data_file_path: Option<String>,
}

#[tauri::command]
fn get_app_state(app_handle: AppHandle) -> Result<AppState, String> {
    let state = app_handle.state::<Arc<Mutex<AppState>>>();
    let state_guard = state.lock().map_err(|e| e.to_string())?;
    Ok((*state_guard).clone())
}

#[tauri::command]
fn set_app_state(app_handle: AppHandle, data_file_path: Option<String>) -> Result<(), String> {
    let state = app_handle.state::<Arc<Mutex<AppState>>>();
    let mut state_guard = state.lock().map_err(|e| e.to_string())?;
    state_guard.data_file_path = data_file_path;
    Ok(())
}

#[tauri::command]
fn load_data(file_path: String) -> Result<serde_json::Value, String> {
    let content = fs::read_to_string(&file_path)
        .map_err(|e| format!("Failed to read file: {}", e))?;
    
    let data: serde_json::Value = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse JSON: {}", e))?;
    
    Ok(data)
}

#[tauri::command]
fn save_data(file_path: String, data: serde_json::Value) -> Result<(), String> {
    // Write to temp file first, then rename for atomic operation
    let temp_path = format!("{}.tmp", file_path);
    
    let content = serde_json::to_string_pretty(&data)
        .map_err(|e| format!("Failed to serialize JSON: {}", e))?;
    
    fs::write(&temp_path, &content)
        .map_err(|e| format!("Failed to write temp file: {}", e))?;
    
    fs::rename(&temp_path, &file_path)
        .map_err(|e| format!("Failed to rename temp file: {}", e))?;
    
    Ok(())
}

#[tauri::command]
fn create_default_data() -> Result<serde_json::Value, String> {
    let default_data = serde_json::json!({
        "schemaVersion": 1,
        "meta": {
            "createdAt": chrono::Utc::now().to_rfc3339(),
            "updatedAt": chrono::Utc::now().to_rfc3339()
        },
        "settings": {
            "theme": "system",
            "weekStartsOn": 1,
            "heatmapMode": "score",
            "fatigueIncrement": 0.10,
            "fatigueCap": 3.0
        },
        "difficulties": [
            { "id": "easy", "label": "Easy", "score": 1, "color": "#4ade80", "order": 0, "active": true },
            { "id": "medium", "label": "Medium", "score": 2, "color": "#fbbf24", "order": 1, "active": true },
            { "id": "hard", "label": "Hard", "score": 3, "color": "#f87171", "order": 2, "active": true },
            { "id": "very-hard", "label": "Very Hard", "score": 5, "color": "#dc2626", "order": 3, "active": true }
        ],
        "categories": [],
        "markers": [],
        "board": [],
        "tasks": []
    });
    
    Ok(default_data)
}

#[tauri::command]
fn get_default_path(app_handle: AppHandle) -> Result<String, String> {
    // Try executable directory first
    let exe_path = std::env::current_exe()
        .map_err(|e| format!("Failed to get exe path: {}", e))?;
    
    let exe_dir = exe_path.parent()
        .ok_or("Failed to get exe directory")?;
    
    let sync_this_dir = exe_dir.join("SyncThis");
    
    // Try to create SyncThis directory
    if let Err(_e) = fs::create_dir_all(&sync_this_dir) {
        // Fall back to Documents
        let documents_dir = app_handle
            .path()
            .document_dir()
            .map_err(|e| format!("Failed to get documents dir: {}", e))?;
        
        let fallback_dir = documents_dir.join("PerformanceTracker").join("SyncThis");
        fs::create_dir_all(&fallback_dir)
            .map_err(|e| format!("Failed to create fallback dir: {}", e))?;
        
        return Ok(fallback_dir.join("tracker.json").to_string_lossy().to_string());
    }
    
    Ok(sync_this_dir.join("tracker.json").to_string_lossy().to_string())
}

#[tauri::command]
fn backup_data(file_path: String) -> Result<String, String> {
    let backup_dir = PathBuf::from(&file_path)
        .parent()
        .ok_or("Failed to get parent directory")?
        .join(".backups");
    
    fs::create_dir_all(&backup_dir)
        .map_err(|e| format!("Failed to create backup dir: {}", e))?;
    
    let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S");
    let backup_path = backup_dir.join(format!("tracker_{}.json", timestamp));
    
    fs::copy(&file_path, &backup_path)
        .map_err(|e| format!("Failed to create backup: {}", e))?;
    
    // Clean up old backups (keep last 20)
    if let Ok(entries) = fs::read_dir(&backup_dir) {
        let mut backups: Vec<_> = entries
            .filter_map(|e| e.ok())
            .filter(|e| e.path().extension().map_or(false, |ext| ext == "json"))
            .collect();
        
        backups.sort_by_key(|e| e.metadata().and_then(|m| m.modified()).unwrap_or_else(|_| std::time::SystemTime::now()));
        
        while backups.len() > 20 {
            if let Some(old) = backups.first() {
                let _ = fs::remove_file(old.path());
                backups.remove(0);
            }
        }
    }
    
    Ok(backup_path.to_string_lossy().to_string())
}

fn setup_file_watcher(app_handle: AppHandle, file_path: String) {
    let app_handle_clone = app_handle.clone();
    let last_write = Arc::new(Mutex::new(Instant::now()));
    let last_write_clone = last_write.clone();
    
    let (tx, rx) = std::sync::mpsc::channel();
    
    let watcher = RecommendedWatcher::new(
        move |res| {
            if let Ok(event) = res {
                let _ = tx.send(event);
            }
        },
        Config::default(),
    )
    .map_err(|e| e.to_string());
    
    if let Ok(mut watcher) = watcher {
        let watch_path = PathBuf::from(&file_path);
        let _ = watcher.watch(&watch_path, RecursiveMode::NonRecursive);
        
        std::thread::spawn(move || {
            while let Ok(_event) = rx.recv() {
                let now = Instant::now();
                let mut last_write_guard = last_write_clone.lock().unwrap();
                
                // Debounce - ignore if we wrote recently
                if now.duration_since(*last_write_guard) < Duration::from_millis(500) {
                    continue;
                }
                
                *last_write_guard = now;
                drop(last_write_guard);
                
                // Emit event to frontend
                let _ = app_handle_clone.emit("tauri://file-watcher", &file_path);
            }
        });
        
        // Store watcher in app state to keep it alive
        app_handle.manage(watcher);
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(Arc::new(Mutex::new(AppState {
            data_file_path: None,
        })))
        .invoke_handler(tauri::generate_handler![
            get_app_state,
            set_app_state,
            load_data,
            save_data,
            create_default_data,
            get_default_path,
            backup_data
        ])
        .setup(|_app| {
            // Setup will be called when app starts
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn main() {
    run();
}
