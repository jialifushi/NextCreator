use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::time::Duration;

// DALL-E API 请求结构
#[derive(Debug, Serialize)]
pub struct DalleRequest {
    pub model: String,
    pub prompt: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub size: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub n: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub response_format: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub quality: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub style: Option<String>,
    // 垫图参数（部分模型支持）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub image: Option<String>,
    // 负面提示词（部分模型支持）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub negative_prompt: Option<String>,
}

// DALL-E API 响应结构
#[derive(Debug, Deserialize)]
pub struct DalleResponse {
    pub created: Option<i64>,
    pub data: Option<Vec<DalleImageData>>,
    pub error: Option<DalleError>,
}

#[derive(Debug, Deserialize)]
pub struct DalleImageData {
    pub url: Option<String>,
    pub b64_json: Option<String>,
    pub revised_prompt: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct DalleError {
    pub message: String,
    pub r#type: Option<String>,
    pub code: Option<String>,
}

// 前端调用的参数
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DalleRequestParams {
    pub base_url: String,
    pub api_key: String,
    pub model: String,
    pub prompt: String,
    pub input_images: Option<Vec<String>>,
    pub size: Option<String>,
    pub quality: Option<String>,
    pub style: Option<String>,
    pub negative_prompt: Option<String>,
}

// 前端返回的结果
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DalleResult {
    pub success: bool,
    pub image_data: Option<String>,
    pub image_url: Option<String>,
    pub revised_prompt: Option<String>,
    pub error: Option<String>,
}

// Tauri 命令：发送 DALL-E API 请求
#[tauri::command]
pub async fn dalle_generate_image(params: DalleRequestParams) -> DalleResult {
    println!("[Rust] dalle_generate_image called");
    println!("[Rust] base_url: {}", params.base_url);
    println!("[Rust] model: {}", params.model);

    // 构建请求体
    let mut request_body = DalleRequest {
        model: params.model.clone(),
        prompt: params.prompt.clone(),
        size: params.size.clone(),
        n: Some(1),
        response_format: Some("b64_json".to_string()),
        quality: params.quality.clone(),
        style: params.style.clone(),
        image: None,
        negative_prompt: params.negative_prompt.clone(),
    };

    // 如果有输入图片，添加到请求中（垫图模式）
    if let Some(images) = &params.input_images {
        if let Some(first_image) = images.first() {
            println!("[Rust] Adding reference image for image-to-image generation");
            request_body.image = Some(first_image.clone());
        }
    }

    // 构建 URL
    let url = format!(
        "{}/v1/images/generations",
        params.base_url.trim_end_matches('/')
    );
    println!("[Rust] Request URL: {}", url);

    // 创建 HTTP 客户端
    let client = match Client::builder()
        .timeout(Duration::from_secs(300))
        .build()
    {
        Ok(c) => c,
        Err(e) => {
            return DalleResult {
                success: false,
                image_data: None,
                image_url: None,
                revised_prompt: None,
                error: Some(format!("创建 HTTP 客户端失败: {}", e)),
            }
        }
    };

    // 发送请求
    println!("[Rust] Sending DALL-E request...");
    let start_time = std::time::Instant::now();

    let response = match client
        .post(&url)
        .header("Content-Type", "application/json")
        .header("Authorization", format!("Bearer {}", params.api_key))
        .json(&request_body)
        .send()
        .await
    {
        Ok(r) => {
            println!("[Rust] Response received in {:?}", start_time.elapsed());
            r
        }
        Err(e) => {
            println!("[Rust] Request failed: {}", e);
            let error_msg = if e.is_timeout() {
                "请求超时，请稍后重试".to_string()
            } else if e.is_connect() {
                "无法连接到服务器，请检查网络".to_string()
            } else {
                format!("请求失败: {}", e)
            };
            return DalleResult {
                success: false,
                image_data: None,
                image_url: None,
                revised_prompt: None,
                error: Some(error_msg),
            };
        }
    };

    // 检查 HTTP 状态码
    let status = response.status();
    println!("[Rust] HTTP status: {}", status);

    if !status.is_success() {
        let error_text = response.text().await.unwrap_or_default();
        println!("[Rust] Error response: {}", error_text);
        return DalleResult {
            success: false,
            image_data: None,
            image_url: None,
            revised_prompt: None,
            error: Some(format!("API 返回错误 ({}): {}", status, error_text)),
        };
    }

    // 解析响应
    let response_text = match response.text().await {
        Ok(t) => t,
        Err(e) => {
            return DalleResult {
                success: false,
                image_data: None,
                image_url: None,
                revised_prompt: None,
                error: Some(format!("获取响应失败: {}", e)),
            };
        }
    };

    println!("[Rust] Response length: {} bytes", response_text.len());

    let dalle_response: DalleResponse = match serde_json::from_str(&response_text) {
        Ok(r) => r,
        Err(e) => {
            println!("[Rust] Failed to parse JSON: {}", e);
            return DalleResult {
                success: false,
                image_data: None,
                image_url: None,
                revised_prompt: None,
                error: Some(format!("解析响应失败: {}", e)),
            };
        }
    };

    // 检查 API 错误
    if let Some(err) = dalle_response.error {
        return DalleResult {
            success: false,
            image_data: None,
            image_url: None,
            revised_prompt: None,
            error: Some(err.message),
        };
    }

    // 提取结果
    if let Some(data) = dalle_response.data {
        if let Some(image_data) = data.first() {
            println!("[Rust] DALL-E result: has_b64={}, has_url={}",
                image_data.b64_json.is_some(),
                image_data.url.is_some()
            );
            return DalleResult {
                success: true,
                image_data: image_data.b64_json.clone(),
                image_url: image_data.url.clone(),
                revised_prompt: image_data.revised_prompt.clone(),
                error: None,
            };
        }
    }

    DalleResult {
        success: false,
        image_data: None,
        image_url: None,
        revised_prompt: None,
        error: Some("API 未返回有效内容".to_string()),
    }
}
