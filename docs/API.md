# 接口说明文档

- Base URL：`/api`
- 统一返回结构：`{ "code": 200, "msg": "提示信息", "data": {} }`
- 错误码：`401` 未登录 / `403` 权限不足 / `429` 算力不足 / `400` 参数错误 / `500` 服务异常
- 除标注「公开」外，所有接口需请求头：`Authorization: Bearer <token>`

## 认证 /auth

| 方法 | 路径 | 说明 | 参数 |
|---|---|---|---|
| POST | /auth/register | 注册（公开），自动赠送免费算力 | `email` `password`(≥6位) `nickname`(选) |
| POST | /auth/login | 登录（公开） | `email` `password` |
| GET | /auth/me | 当前用户信息 | - |
| PUT | /auth/profile | 修改昵称/密码 | `nickname` 或 `oldPassword`+`newPassword` |
| POST | /auth/send-code | 发送邮箱验证码（公开） | `email` `purpose`: `register`/`reset`。未配置SMTP时为开发模式，验证码随 `devCode` 返回 |
| POST | /auth/reset-password | 找回密码（公开） | `email` `code` `newPassword` |

注册/登录返回：`{ token, user: { id, email, nickname, role, credits, isMember, memberExpiresAt } }`

登录与 `/auth/me` 每个自然日首次调用自动发放每日奖励，返回 `dailyBonus`（本次发放数量，0为已领）。`EMAIL_VERIFY=on` 时注册需携带 `code`。

## AI生成 /generate

| 方法 | 路径 | 说明 | 参数 |
|---|---|---|---|
| POST | /generate/upload | 上传源图（multipart） | `file`：jpg/png/webp ≤15MB。返回 `{ fileId, url }` |
| GET | /generate/styles | 灯光风格列表（公开） | 返回 `{ styles, costPerGeneration }` |
| POST | /generate | 提交生成任务（扣算力，失败自动退还） | `fileId`；`params`: `{ style, direction, brightness(0-100), colorTemp(2000-8000), intensity(0-100), detail(0-100) }` |
| POST | /generate/batch | 一键4风格连拍（消耗 `MULTI_COST` 算力），返回 `{ batchId, ids }` | `fileId` `params`（style自动遍历4种风格） |
| GET | /generate/batch/:batchId | 批次状态轮询，返回 `{ list, done }` | - |
| GET | /generate/:id | 查询任务状态（前端轮询） | status: `processing / success / failed` |
| GET | /generate | 历史记录分页 | `page` `size` |
| DELETE | /generate/:id | 删除记录及结果图 | - |

灯光风格：`night_warm` 夜景暖光 / `daylight` 日间自然光 / `office_cool` 办公冷光 / `wall_wash` 氛围洗墙光
光源方向：`none` 环境光 / `left` / `right` / `top` / `bottom`

出图分层：免费用户结果限 `FREE_MAX_SIZE`(默认1024px) 并带水印；会员或有任意已支付订单的用户输出 `PREMIUM_MAX_SIZE`(默认2048px) 高清无水印。

任务对象：`{ id, sourceUrl, resultUrl, params, status, error, cost, createdAt, finishedAt }`

## P1/P2 新增能力

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | /generate/bulk | 批量处理（≤20张，会员/付费专属），`fileIds[]` + `params`，每张5算力，返回batchId |
| POST | /generate/advise | AI灯光顾问：分析照片亮度/色调，返回 `{ recommend, reason }` 推荐参数（免费） |
| POST | /generate/:id/share | 生成分享链接，返回 `shareId`，前端页面 `/s/:shareId` |
| GET | /generate/share/:shareId | 公开获取分享作品（无需登录） |
| GET/POST/DELETE | /keys | 开放API密钥管理（最多5个，完整密钥仅创建时返回一次） |
| GET | /stats/users | 用户列表（管理员），支持 `keyword` 搜索 |
| POST | /stats/users/:id/credits | 管理员调整用户算力 `{ change, remark }` |
| POST | /stats/users/:id/ban | 封禁/解封 `{ banned }` |
| GET | /stats/generations | 最近生成内容抽查（管理员） |

局部重绘：单张/连拍生成时 `params.maskId` 传入蒙版图片的fileId（白色=重绘区域，黑色=保留，自动羽化边缘）。

邀请裂变：注册时携带 `inviteCode`，邀请人与被邀请人各得10算力（`INVITE_BONUS`）。

**开放API调用方式**：请求头携带 `X-API-Key: als_xxx` 即可代替JWT调用 /generate 系列接口，例如：

```bash
curl -X POST https://your-domain.com/api/generate/upload -H "X-API-Key: als_xxx" -F file=@room.jpg
curl -X POST https://your-domain.com/api/generate -H "X-API-Key: als_xxx" -H "Content-Type: application/json" \
  -d '{"fileId":"xxx.jpg","params":{"style":"night_warm"}}'
```

## 算力 /credits

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /credits/balance | 余额 `{ credits, isMember, memberExpiresAt }` |
| GET | /credits/logs | 流水分页，type：`register`注册赠送 / `recharge`充值 / `consume`消耗 / `refund`退还 |

## 支付 /pay

| 方法 | 路径 | 说明 | 参数 |
|---|---|---|---|
| GET | /pay/packages | 套餐列表（公开），含 `payProvider` 当前支付模式 | - |
| POST | /pay/order | 创建订单，返回 `{ orderId, codeUrl, mock }`，codeUrl 生成二维码供扫码 | `packageId` |
| GET | /pay/order/:id | 订单状态轮询，status：`pending / paid / closed` | - |
| GET | /pay/orders | 订单分页列表 | `page` `size` |
| POST | /pay/mock/:id | 沙箱模拟支付成功（仅 PAY_PROVIDER=mock 可用） | - |
| POST | /pay/notify | 微信支付V3回调（公开，微信服务器调用），AES-256-GCM解密后自动到账，幂等 | - |

支付成功后自动：订单置为 paid → 算力到账 → 会员套餐顺延有效期。

## 统计 /stats（仅管理员）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /stats/overview | 用户数/生成数/算力消耗/营收（总计+今日）+ 转化漏斗 `funnel`（注册→出图→算力耗尽→付费及转化率）+ 近7天趋势 |
| GET | /stats/packages | 全部套餐（含已下架） |
| POST | /stats/packages | 新建套餐 `{ type: credits/member, title, price(分), credits, days, desc, sort }` |
| PUT | /stats/packages/:id | 修改套餐（仅影响后续购买，历史订单不变） |
| POST | /stats/packages/:id/toggle | 上架/下架（不物理删除，保护历史订单引用） |

## 套餐与会员折扣

- 套餐存于数据库 `packages` 表（管理后台「套餐配置」在线增改/上下架），`config.packages` 仅作首次启动的种子数据
- `GET /pay/packages` 返回 `memberDiscount`（默认0.9）；会员购算力包按该折扣计价，订单标题自动标注"会员X折"（`MEMBER_DISCOUNT=1` 关闭）
- 生成任务对象含 `premium` 字段标识高清档（会员/付费用户 2048px 无水印，免费 1024px 水印）

## 静态资源

- `GET /uploads/<fileId>` 用户上传源图
- `GET /results/<id>.jpg` AI生成结果图
