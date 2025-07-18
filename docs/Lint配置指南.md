# ESLint 和 Prettier 配置说明

本项目已配置代码质量检查和格式化工具。

## 📦 安装依赖

### 前端（web）
```bash
cd web
npm install --save-dev eslint @eslint/js eslint-plugin-vue prettier eslint-config-prettier eslint-plugin-prettier
```

### 后端（server）
```bash
cd server
npm install --save-dev eslint prettier eslint-config-prettier eslint-plugin-prettier
```

## 🔍 运行 Lint 检查

### 前端
```bash
cd web
npm run lint        # 检查代码风格问题
npm run lint:fix    # 自动修复可修复的问题
npm run format      # 使用 Prettier 格式化代码
```

### 后端
```bash
cd server
npm run lint        # 检查代码风格问题
npm run lint:fix    # 自动修复可修复的问题
npm run format      # 使用 Prettier 格式化代码
```

## ⚙️ 配置文件

- **`.eslintrc.json`** - 项目根目录和各子目录的 ESLint 配置
  - 前端：启用 Vue 3 规则
  - 后端：Node.js 环境规则
  - 两者均禁用控制台警告和未使用变量警告

- **`.prettierrc`** - 代码格式化规则
  - 行宽：100 字符
  - 制表符宽度：2 空格
  - 分号：启用
  - 单引号：启用
  - 末尾逗号：ES5 兼容模式
  - 行终符：LF

## 📋 规则说明

### ESLint 规则
- `eslint:recommended` - ESLint 推荐规则
- `plugin:vue/vue3-recommended` - Vue 3 推荐规则（仅前端）
- `prettier` - Prettier 集成，避免与代码格式化冲突

### 自定义规则
- `prettier/prettier` - Prettier 格式问题显示为警告
- `vue/multi-word-component-names` - 禁用多字符组件名检查（前端）
- `no-unused-vars` - 允许使用 `_` 前缀的未使用变量
- `no-console` - 后端允许 console 语句（日志）

## 🔗 与 Git 集成

建议添加 pre-commit hook 自动检查：

```bash
# 安装 husky（Git hooks）
npm install husky --save-dev

# 初始化 husky
npx husky install

# 添加 pre-commit hook
npx husky add .husky/pre-commit "npm run lint:fix && npm run format"
```

## 📝 CI/CD 集成

在 GitHub Actions 或其他 CI 中可使用：

```yaml
- name: Lint Code
  run: |
    cd web && npm run lint
    cd ../server && npm run lint
```
