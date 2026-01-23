// 文字去除服务
// 整合 Gemini 检测、掩码生成、自适应背景修复的完整流程

use super::gemini_detector::{detect_text, GeminiConfig, TextRegion};
use super::adaptive_inpainter::adaptive_inpaint;

use base64::{engine::general_purpose::STANDARD, Engine};
use image::{DynamicImage, ImageFormat};
use serde::{Deserialize, Serialize};
use std::io::Cursor;
use tauri::AppHandle;

/// 文字去除请求参数
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TextRemovalParams {
    /// base64 编码的 PNG 图片
    pub image_data: String,
    /// Gemini API 基础 URL
    pub gemini_base_url: String,
    /// Gemini API Key
    pub gemini_api_key: String,
    /// Gemini 模型名称
    pub gemini_model: String,
}

/// 文字检测请求参数
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TextDetectionParams {
    /// base64 编码的 PNG 图片
    pub image_data: String,
    /// Gemini API 基础 URL
    pub gemini_base_url: String,
    /// Gemini API Key
    pub gemini_api_key: String,
    /// Gemini 模型名称
    pub gemini_model: String,
}

/// 背景修复请求参数
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InpaintParams {
    /// base64 编码的 PNG 图片
    pub image_data: String,
    /// 检测到的文本区域（JSON 序列化）
    pub regions: Vec<TextRegionData>,
}

/// 文本区域数据（用于前端传递）
#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TextRegionData {
    pub box_2d: [i32; 4],
    pub label: String,
    #[serde(default)]
    pub polygon: Vec<Vec<i32>>,
}

/// 文本框数据（兼容旧格式）
#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TextBoxData {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    pub text: String,
    pub font_size: f64,
}

/// 文字去除结果
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TextRemovalResult {
    pub success: bool,
    /// 去除文字后的背景图（base64 PNG）
    pub background_image: Option<String>,
    /// 检测到的文本框列表（兼容旧格式）
    pub text_boxes: Vec<TextBoxData>,
    /// 错误信息
    pub error: Option<String>,
}

/// 文字检测结果
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TextDetectionResult {
    pub success: bool,
    /// 检测到的文本区域
    pub regions: Vec<TextRegionData>,
    /// 错误信息
    pub error: Option<String>,
}

/// 背景修复结果
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InpaintResult {
    pub success: bool,
    /// 修复后的背景图（base64 PNG）
    pub background_image: Option<String>,
    /// 错误信息
    pub error: Option<String>,
}

/// 阶段一：仅执行文字检测（可并发调用）
#[tauri::command]
pub async fn detect_text_regions(params: TextDetectionParams) -> TextDetectionResult {
    println!("[Rust] detect_text_regions 开始处理");

    let gemini_config = GeminiConfig {
        base_url: params.gemini_base_url,
        api_key: params.gemini_api_key,
        model: params.gemini_model,
    };

    match detect_text(&params.image_data, &gemini_config).await {
        Ok(result) => {
            println!("[Rust] 检测到 {} 个文本区域", result.regions.len());
            TextDetectionResult {
                success: true,
                regions: result
                    .regions
                    .into_iter()
                    .map(|r| TextRegionData {
                        box_2d: r.box_2d,
                        label: r.label,
                        polygon: r.polygon,
                    })
                    .collect(),
                error: None,
            }
        }
        Err(e) => TextDetectionResult {
            success: false,
            regions: vec![],
            error: Some(format!("文字检测失败: {}", e)),
        },
    }
}

/// 阶段二：仅执行背景修复（自适应轻量方案）
#[tauri::command]
pub async fn inpaint_background(_app: AppHandle, params: InpaintParams) -> InpaintResult {
    println!("[Rust] inpaint_background 开始处理");

    // 如果没有检测到文字，直接返回原图
    if params.regions.is_empty() {
        return InpaintResult {
            success: true,
            background_image: Some(params.image_data),
            error: None,
        };
    }

    // 解码图片
    let image_bytes = match STANDARD.decode(&params.image_data) {
        Ok(b) => b,
        Err(e) => {
            return InpaintResult {
                success: false,
                background_image: None,
                error: Some(format!("Base64 解码失败: {}", e)),
            }
        }
    };

    let img = match image::load_from_memory(&image_bytes) {
        Ok(i) => i,
        Err(e) => {
            return InpaintResult {
                success: false,
                background_image: None,
                error: Some(format!("图片解析失败: {}", e)),
            }
        }
    };

    // 转换区域格式
    let regions: Vec<TextRegion> = params
        .regions
        .into_iter()
        .map(|r| TextRegion {
            box_2d: r.box_2d,
            label: r.label,
            polygon: r.polygon,
        })
        .collect();

    // 执行自适应修复
    println!("[Rust] 执行自适应背景修复...");
    let rgb_image = img.to_rgb8();
    let inpainted = match tokio::task::spawn_blocking(move || {
        adaptive_inpaint(&rgb_image, &regions)
    })
    .await
    {
        Ok(Ok(result)) => result,
        Ok(Err(e)) => {
            return InpaintResult {
                success: false,
                background_image: None,
                error: Some(format!("背景修复失败: {}", e)),
            }
        }
        Err(e) => {
            return InpaintResult {
                success: false,
                background_image: None,
                error: Some(format!("背景修复任务失败: {}", e)),
            }
        }
    };

    // 编码结果图片
    let mut output_buffer = Cursor::new(Vec::new());
    if let Err(e) =
        DynamicImage::ImageRgb8(inpainted).write_to(&mut output_buffer, ImageFormat::Png)
    {
        return InpaintResult {
            success: false,
            background_image: None,
            error: Some(format!("图片编码失败: {}", e)),
        };
    }

    let result_base64 = STANDARD.encode(output_buffer.into_inner());

    println!("[Rust] 背景修复完成");

    InpaintResult {
        success: true,
        background_image: Some(result_base64),
        error: None,
    }
}

/// 执行文字去除
#[tauri::command]
pub async fn remove_text_from_image(
    _app: AppHandle,
    params: TextRemovalParams,
) -> TextRemovalResult {
    println!("[Rust] remove_text_from_image 开始处理");

    // 1. 解码图片
    let image_bytes = match STANDARD.decode(&params.image_data) {
        Ok(b) => b,
        Err(e) => {
            return TextRemovalResult {
                success: false,
                background_image: None,
                text_boxes: vec![],
                error: Some(format!("Base64 解码失败: {}", e)),
            }
        }
    };

    let img = match image::load_from_memory(&image_bytes) {
        Ok(i) => i,
        Err(e) => {
            return TextRemovalResult {
                success: false,
                background_image: None,
                text_boxes: vec![],
                error: Some(format!("图片解析失败: {}", e)),
            }
        }
    };

    let width = img.width();
    let height = img.height();
    println!("[Rust] 图片尺寸: {}x{}", width, height);

    // 2. 使用 Gemini 检测文字
    println!("[Rust] 开始 Gemini 文字检测...");
    let gemini_config = GeminiConfig {
        base_url: params.gemini_base_url,
        api_key: params.gemini_api_key,
        model: params.gemini_model,
    };

    let detection_result = match detect_text(&params.image_data, &gemini_config).await {
        Ok(r) => r,
        Err(e) => {
            return TextRemovalResult {
                success: false,
                background_image: None,
                text_boxes: vec![],
                error: Some(format!("文字检测失败: {}", e)),
            }
        }
    };

    println!(
        "[Rust] 检测到 {} 个文本区域",
        detection_result.regions.len()
    );

    // 如果没有检测到文字，直接返回原图
    if detection_result.regions.is_empty() {
        return TextRemovalResult {
            success: true,
            background_image: Some(params.image_data),
            text_boxes: vec![],
            error: None,
        };
    }

    // 3. 执行自适应修复
    println!("[Rust] 执行自适应背景修复...");
    let rgb_image = img.to_rgb8();
    let regions = detection_result.regions.clone();
    let inpainted = match tokio::task::spawn_blocking(move || {
        adaptive_inpaint(&rgb_image, &regions)
    })
    .await
    {
        Ok(Ok(result)) => result,
        Ok(Err(e)) => {
            return TextRemovalResult {
                success: false,
                background_image: None,
                text_boxes: convert_text_regions(&detection_result.regions, width, height),
                error: Some(format!("背景修复失败: {}", e)),
            }
        }
        Err(e) => {
            return TextRemovalResult {
                success: false,
                background_image: None,
                text_boxes: convert_text_regions(&detection_result.regions, width, height),
                error: Some(format!("背景修复任务失败: {}", e)),
            }
        }
    };

    // 4. 编码结果图片
    let mut output_buffer = Cursor::new(Vec::new());
    if let Err(e) = DynamicImage::ImageRgb8(inpainted).write_to(&mut output_buffer, ImageFormat::Png)
    {
        return TextRemovalResult {
            success: false,
            background_image: None,
            text_boxes: convert_text_regions(&detection_result.regions, width, height),
            error: Some(format!("图片编码失败: {}", e)),
        };
    }

    let result_base64 = STANDARD.encode(output_buffer.into_inner());

    println!("[Rust] 文字去除完成");

    TextRemovalResult {
        success: true,
        background_image: Some(result_base64),
        text_boxes: convert_text_regions(&detection_result.regions, width, height),
        error: None,
    }
}

/// 将检测到的文本区域转换为兼容旧格式的结构
fn convert_text_regions(regions: &[TextRegion], width: u32, height: u32) -> Vec<TextBoxData> {
    regions
        .iter()
        .map(|r| {
            // box_2d 格式: [ymin, xmin, ymax, xmax]，归一化到 0-1000
            let [ymin, xmin, ymax, xmax] = r.box_2d;

            // 转换为像素坐标
            let x = (xmin as f64 / 1000.0) * width as f64;
            let y = (ymin as f64 / 1000.0) * height as f64;
            let box_width = ((xmax - xmin) as f64 / 1000.0) * width as f64;
            let box_height = ((ymax - ymin) as f64 / 1000.0) * height as f64;

            // 估算字号（基于高度）
            let font_size = (box_height * 0.7 * 72.0 / 96.0).max(8.0).min(72.0);

            TextBoxData {
                x,
                y,
                width: box_width,
                height: box_height,
                text: r.label.clone(),
                font_size,
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_convert_text_regions() {
        // box_2d: [ymin, xmin, ymax, xmax] 归一化到 0-1000
        let regions = vec![TextRegion {
            box_2d: [100, 100, 200, 300],  // ymin=100, xmin=100, ymax=200, xmax=300
            label: "测试".to_string(),
            polygon: vec![],
        }];

        let converted = convert_text_regions(&regions, 1000, 1000);
        assert_eq!(converted.len(), 1);
        assert_eq!(converted[0].x, 100.0);      // xmin * 1000 / 1000
        assert_eq!(converted[0].y, 100.0);      // ymin * 1000 / 1000
        assert_eq!(converted[0].width, 200.0);  // (xmax - xmin) * 1000 / 1000
        assert_eq!(converted[0].height, 100.0); // (ymax - ymin) * 1000 / 1000
    }
}
