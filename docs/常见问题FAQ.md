# 常见问题 FAQ

## 安装与启动

**Q：启动报"找不到模块 / Cannot find module 'express'"**
没装依赖。运行 `./start.sh` 会自动安装，或手动在 server 和 web 目录分别 `npm install`。

**Q：npm install 很慢或失败**
换国内镜像：`npm config set registry https://registry.npmmirror.com`

**Q：报 "Could not load the sharp module"**
node_modules 是在别的操作系统装的（如从其他机器拷贝）。删除 `server/node_modules` 重新 `npm install` 即可。

**Q：better-sqlite3 编译失败**
无需处理——项目会自动降级为 Node 内置 SQLite（需 Node ≥ 22.13）。想用 better-sqlite3 则确保 Node 18/20/22 且网络可下载预编译包。

**Q：端口被占用（EADDRINUSE 3000/5173）**
`lsof -i:3000` 找到进程 `kill -9 <pid>`，或改 `.env` 的 PORT。

**Q：Node版本过低**
需 ≥18（推荐20/22）。`node -v` 查看，用 nvm 升级：`nvm install 20 && nvm use 20`。

## 功能使用

**Q：生成的图为什么有水印/只有1024px？**
免费用户限1024px+水印；开通会员或有任意一笔已支付订单即2048px高清无水印。本地测试用充值弹窗的"模拟支付成功"即可解锁。

**Q：每日奖励什么时候发？**
每个自然日首次打开站点（或登录）自动发放并弹提示，跨零点重新计算。

**Q：连拍/批量部分失败会扣算力吗？**
失败的部分自动按份额退还，流水里能看到"失败退还"记录。

**Q：局部重绘涂抹后没效果？**
确认生成前"局部重绘"按钮显示为"已设选区"（绿色）；换图后选区会自动清空需重涂。

**Q：分享链接别人打不开？**
本地开发时链接是 localhost，仅本机可访问；部署到服务器后分享链接才对外可用。

**Q：管理员账号怎么来的？**
`.env` 的 `ADMIN_EMAILS` 里的邮箱**注册时**自动成为管理员。已注册的普通账号改配置无效，需重新注册或直接改库：`UPDATE users SET role='admin' WHERE email='xx'`。

## 对接真实服务

**Q：怎么接真实的IC-Light出图？**
`.env` 设 `AI_PROVIDER=replicate`，填 `REPLICATE_API_TOKEN`（replicate.com获取）和模型 `REPLICATE_MODEL_VERSION`。重启生效，无需改代码。

**Q：微信支付回调收不到？**
1) `WXPAY_NOTIFY_URL` 必须是公网HTTPS且路径为 `/api/pay/notify`；2) 域名需备案；3) 微信商户平台需配置APIv3密钥并与 `.env` 一致；4) 本地开发收不到回调是正常的，用模拟支付按钮。

**Q：邮件发不出去？**
用QQ邮箱/163需在邮箱设置里开启SMTP并使用**授权码**（不是登录密码）填 `SMTP_PASS`；端口465对应SSL。不配置SMTP时验证码会打印在后端控制台。

**Q：开放API怎么用？**
个人中心创建密钥，请求头带 `X-API-Key: als_xxx` 调用 `/api/generate` 系列接口，消耗该账号算力。示例见 docs/API.md。

## 数据与安全

**Q：数据存在哪？怎么备份？**
全部在 `server/data/`（数据库+图片）。打包该目录即完整备份，恢复时解包回原位重启即可。

**Q：忘记管理员密码？**
登录页"忘记密码"走邮箱验证码重置；SMTP没配时验证码在后端控制台日志里。

**Q：想清空所有数据重新开始？**
停服后删除 `server/data/` 目录，重启自动重建空库。

**Q：换了服务器怎么迁移？**
拷贝整个项目目录 + `server/data/` + `server/.env`，新机器 `npm install` 后启动即可。
