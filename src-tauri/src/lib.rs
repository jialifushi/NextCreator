mod storage;
mod gemini;
mod ocr_inpaint;

use storage::*;
use gemini::*;
use ocr_inpaint::*;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            save_image,
            read_image,
            delete_image,
            delete_canvas_images,
            get_storage_stats,
            clear_cache,
            clear_all_images,
            get_storage_path,
            list_canvas_images,
            gemini_generate_content,
            gemini_generate_text,
            process_ppt_page,
            test_ocr_connection,
            test_inpaint_connection
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
