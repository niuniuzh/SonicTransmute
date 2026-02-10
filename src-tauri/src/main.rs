// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod ncm;
mod watcher;

use tauri::{Emitter, Manager, State};
use std::sync::Mutex;
use std::path::Path;
use watcher::FolderWatcher;

struct AppState {
    watcher: Mutex<Option<FolderWatcher>>,
}

#[tauri::command]
async fn convert_ncm_file(app: tauri::AppHandle, id: String, file_path: String) -> Result<(), String> {
    // Notify Frontend: Processing started
    let _ = app.emit("app:conversion-progress", serde_json::json!({
        "id": id,
        "progress": 0,
        "status": "processing"
    }));

    // Perform the heavy lifting
    let result = ncm::process_ncm(&file_path);

    match result {
        Ok(_) => {
            let _ = app.emit("app:conversion-progress", serde_json::json!({
                "id": id,
                "progress": 100,
                "status": "completed"
            }));
            Ok(())
        }
        Err(e) => {
            eprintln!("Error converting {}: {}", file_path, e);
            let _ = app.emit("app:conversion-progress", serde_json::json!({
                "id": id,
                "progress": 0,
                "status": "error",
                "message": e.to_string()
            }));
            Err(e.to_string())
        }
    }
}

#[tauri::command]
async fn start_folder_watcher(app: tauri::AppHandle, state: State<'_, AppState>, path: String) -> Result<(), String> {
    let mut watcher_guard = state.watcher.lock().map_err(|e| e.to_string())?;
    
    // Stop existing watcher if any
    if let Some(watcher) = watcher_guard.take() {
        drop(watcher);
    }

    let app_handle = app.clone();
    let new_watcher = FolderWatcher::new(path, move |file_path| {
        // When a new .ncm file is detected, notify frontend to add it to queue
        // The frontend 'isWatching' logic will then trigger conversion automatically
        // Alternatively, we can just emit an event saying "File Added"
        println!("New file detected: {:?}", file_path);
        // We emit a custom event that Frontend listens to
        // Note: For simplicity in this demo, the frontend polls/scans or user re-adds. 
        // But to fully automate, the frontend needs to listen to "app:file-detected"
    }).map_err(|e| e.to_string())?;

    *watcher_guard = Some(new_watcher);
    Ok(())
}

#[tauri::command]
async fn stop_folder_watcher(state: State<'_, AppState>) -> Result<(), String> {
    let mut watcher_guard = state.watcher.lock().map_err(|e| e.to_string())?;
    *watcher_guard = None;
    Ok(())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(AppState { watcher: Mutex::new(None) })
        .invoke_handler(tauri::generate_handler![
            convert_ncm_file, 
            start_folder_watcher, 
            stop_folder_watcher
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
