use notify::{Config, Event, RecommendedWatcher, RecursiveMode, Watcher};
use std::path::Path;
use std::sync::mpsc;
use std::thread;

pub struct FolderWatcher {
    watcher: RecommendedWatcher,
}

impl FolderWatcher {
    pub fn new<F>(path_str: String, callback: F) -> anyhow::Result<Self> 
    where F: Fn(std::path::PathBuf) + Send + 'static
    {
        let (tx, rx) = mpsc::channel();
        
        // Initialize watcher
        let mut watcher = RecommendedWatcher::new(tx, Config::default())?;
        
        // Start watching
        let path = Path::new(&path_str);
        watcher.watch(path, RecursiveMode::NonRecursive)?;

        // Spawn a thread to handle events
        thread::spawn(move || {
            for res in rx {
                match res {
                    Ok(event) => {
                        // We only care about Create events for .ncm files
                        if let notify::EventKind::Create(_) = event.kind {
                             for path in event.paths {
                                 if let Some(ext) = path.extension() {
                                     if ext == "ncm" {
                                         callback(path);
                                     }
                                 }
                             }
                        }
                    },
                    Err(e) => println!("Watch error: {:?}", e),
                }
            }
        });

        Ok(FolderWatcher { watcher })
    }
}
