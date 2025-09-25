# oss-forward Worker

这个 Cloudflare Worker 将传入的 HTTP 请求转发到已绑定的 R2 桶，提供对象的列出、读取、写入和删除能力。具体使用哪个桶通过环境变量控制，无需在代码里硬编码。

## 支持的接口

| 方法 | 路径                 | 说明 |
| ---- | -------------------- | ---- |
| GET  | `/`                  | 列出桶内容，支持 `prefix`、`cursor`、`limit` 查询参数 |
| GET  | `/{key}`             | 读取对象内容 |
| HEAD | `/{key}`             | 获取对象元数据 |
| PUT  | `/{key}`             | 写入/覆盖对象内容 |
| POST | `/{key}`             | 同 PUT，便于表单或客户端使用 |
| DELETE | `/{key}`           | 删除对象 |
| OPTIONS | 任意              | CORS 预检，允许跨域访问 |

所有响应都带有 `Access-Control-Allow-*` 头，默认允许任意来源访问。

## 元数据行为

- 写入时会自动读取以下请求头并写入 HTTP 元数据：
  - `Content-Type`
  - `Content-Language`
  - `Content-Disposition`
  - `Cache-Control`
  - `Content-Encoding`
- 读取/HEAD 请求会将存储在对象中的 HTTP 元数据返回到响应头，同时附带 `ETag` 和 `Content-Length`。

## 开发与部署

1. 在 `wrangler.toml` 中绑定 R2 桶（名称可自定义，下面示例写作 `BUCKET_IMAGE`）：

   ```toml
   [[r2_buckets]]
   binding = "BUCKET_IMAGE"
   bucket_name = "your-bucket-name"
   preview_bucket_name = "your-preview-bucket"
   ```

2. 设置环境变量，告知 Worker 应使用的绑定名称：

   ```toml
   [vars]
   R2_BUCKET_BINDING = "BUCKET_IMAGE"
   ```

3. 启动本地开发服务：

   ```bash
   npm run dev
   ```

4. 部署到 Cloudflare：

   ```bash
   npm run deploy
   ```

开发和部署过程中，如果网络超时或鉴权失败，可通过 `wrangler.toml` 中的 `account_id`、`zone_id` 等配置进行检查与修正。
