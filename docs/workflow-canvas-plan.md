# 节点式工作流画布(Workflow Canvas)实施方案

> 目标:在 ai-light-studio 中新增 `/workflow` 页面,提供可拖拽连线的节点画布,
> 将"上传 → 打光 → 多模型并行生成 → 对比择优 → 图生视频"编排为可保存、可复用、
> 可分享的 DAG 工作流。后端新增 DAG 执行引擎,复用现有 relight()/credits/队列。

## 0. 总体架构

```
前端 /workflow (Vue Flow 画布)
  ├─ 节点面板(拖入节点)── 属性面板(选中节点编辑参数)
  ├─ 工作流 JSON {nodes, edges} ←→ POST /api/workflow 保存
  └─ 运行:POST /api/workflow/:id/run → SSE 订阅节点级进度

后端 server/src/
  ├─ services/workflow/engine.js   DAG 执行引擎(拓扑排序/并行/缓存/失败传播)
  ├─ services/workflow/nodes/*.js  节点执行器注册表(每种节点一个文件)
  ├─ routes/workflow.js            CRUD + run + SSE + 成本预估
  └─ db:workflows / workflow_runs / node_runs 三张新表
```

设计原则:
- **节点执行器复用现有服务**:relight 节点直接调 `services/ai.js#relight()`,
  上传复用 `/api/generate/upload`,扣费走 `services/credits.js#changeCredits()`。
- **工作流 JSON 是唯一事实**:画布状态 = 可执行定义,前后端共用同一份 schema。
- **节点级缓存**:cacheKey = hash(nodeType + params + 上游输出),参数不变重跑秒回。

## 1. 工作流 JSON Schema(前后端契约)

```jsonc
{
  "version": 1,
  "nodes": [
    { "id": "n1", "type": "image-input",  "position": {"x":0,"y":0},
      "data": { "fileId": "xxx" } },
    { "id": "n2", "type": "relight",
      "data": { "style": "night_warm", "brightness": 60, "colorTemp": 3200,
                "intensity": 50, "detail": 50, "direction": "left",
                "provider": "fal" } },                // mock|fal|replicate,可覆盖全局
    { "id": "n3", "type": "compare",  "data": { "pick": null } },
    { "id": "n4", "type": "img2video","data": { "model": "kling-2.5-turbo", "duration": 5 } },
    { "id": "n5", "type": "output",   "data": {} }
  ],
  "edges": [
    { "id": "e1", "source": "n1", "target": "n2" },
    { "id": "e2", "source": "n2", "target": "n3", "targetHandle": "in-0" }
  ]
}
```

节点 I/O 类型系统(连线校验用):`image | video | params | any`。
每种节点声明 `inputs: [{name, type, required}]` / `outputs: [{name, type}]`,
前端连线时校验类型匹配,后端执行前再整体校验一次。

## 2. 节点类型清单(v1 共 8 种)

| type | 输入 → 输出 | 执行逻辑 | 算力 |
|---|---|---|---|
| `image-input` | ∅ → image | 返回已上传 fileId 的路径 | 0 |
| `relight` | image → image | 调 `relight()`,params 同 StudioView | COST_PER_GENERATION |
| `style-fanout` | image → image×4 | 内部并行跑 4 个风格(复用 batch 逻辑) | MULTI_COST |
| `advise` | image → params | 调现有 `/advise` LLM 顾问,输出参数喂给下游 relight | 1 |
| `mask` | image → image | 前端画蒙版存文件,执行时透传 maskPath 给下游 | 0 |
| `compare` | image×N → image | 人工节点:运行到此暂停,前端弹对比选图,选中后继续 | 0 |
| `img2video` | image → video | fal image-to-video(Kling/Wan),Submit→Poll→Download | 按秒计费,如 20/次 |
| `output` | any → ∅ | 汇总产物,写入 workflow_runs.outputs | 0 |

节点执行器统一签名(`server/src/services/workflow/nodes/` 每个一个文件):

```js
export default {
  type: 'relight',
  inputs:  [{ name: 'image', type: 'image', required: true }],
  outputs: [{ name: 'image', type: 'image' }],
  estimateCost(data) { return COST_PER_GENERATION },
  // ctx: { userId, runId, upstream: {image: path}, emit(progress), workdir }
  async execute(data, ctx) { ...; return { image: outPath } }
}
```

## 3. 数据库(db.js 追加建表)

```sql
CREATE TABLE workflows (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL,
  name TEXT NOT NULL, graph TEXT NOT NULL,          -- 工作流 JSON
  thumbnail TEXT, share_id TEXT,                    -- 模板分享
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE TABLE workflow_runs (
  id TEXT PRIMARY KEY, workflow_id TEXT NOT NULL, user_id TEXT NOT NULL,
  graph_snapshot TEXT NOT NULL,                     -- 运行时的图快照
  status TEXT NOT NULL,          -- pending|running|waiting_input|success|failed|canceled
  cost INTEGER DEFAULT 0, outputs TEXT,             -- JSON 产物列表
  error TEXT, created_at INTEGER NOT NULL, finished_at INTEGER
);
CREATE TABLE node_runs (
  id TEXT PRIMARY KEY, run_id TEXT NOT NULL, node_id TEXT NOT NULL,
  status TEXT NOT NULL,          -- pending|running|success|failed|skipped|cached
  cache_key TEXT, output TEXT,   -- JSON: {image: path, ...}
  cost INTEGER DEFAULT 0, error TEXT,
  started_at INTEGER, finished_at INTEGER
);
CREATE INDEX idx_node_runs_cache ON node_runs(cache_key);
```

## 4. 后端 API(routes/workflow.js,挂载到 app.js)

| 接口 | 方法 | 说明 |
|---|---|---|
| `/api/workflow` | POST | 保存工作流(name + graph),返回 id |
| `/api/workflow` | GET | 我的工作流列表 |
| `/api/workflow/:id` | GET/PUT/DELETE | 读/改/删 |
| `/api/workflow/:id/estimate` | POST | 遍历节点 estimateCost 求和,返回 {total, perNode} |
| `/api/workflow/:id/run` | POST | 校验图→预估→一次性扣费→建 run→引擎异步执行,返回 runId |
| `/api/workflow/run/:runId` | GET | 轮询兜底:run + 全部 node_runs 状态 |
| `/api/workflow/run/:runId/events` | GET | **SSE**:node 级进度实时推送 |
| `/api/workflow/run/:runId/resume` | POST | compare 人工节点提交选择后继续 |
| `/api/workflow/run/:runId/cancel` | POST | 取消,未执行节点退还算力 |
| `/api/workflow/share/:shareId` | GET | 公开模板(免登录,复用现有分享模式) |

扣费策略:run 前按预估**一次性扣**(复用 changeCredits 事务,余额不足抛 429);
失败/取消时按未执行节点的 estimateCost 退还(type='refund',复用现有流水)。

## 5. DAG 执行引擎(services/workflow/engine.js,~200 行)

```js
async function executeRun(runId) {
  // 1. 载入 graph_snapshot,构建邻接表 + 入度表
  // 2. 校验:无环(Kahn 拓扑排序)、类型匹配、required 输入齐全
  // 3. 调度循环:
  //    ready = 入度为 0 且未执行的节点
  //    对每个 ready 节点(受全局 MAX_CONCURRENT 限制,复用现有队列思想):
  //      a. cacheKey = sha256(type + JSON(data) + 上游输出指纹)
  //      b. 命中 node_runs 中同 user 的 success 记录 → 直接复用 output,status='cached',退还该节点算力
  //      c. 未命中 → executor.execute(),emit SSE 进度
  //    节点完成 → 下游入度减 1 → 继续调度
  // 4. compare 节点:status='waiting_input',run 置 waiting_input,暂停调度;
  //    /resume 写入选择后重入调度循环
  // 5. 节点失败:下游全部 skipped,run=failed,退还未执行部分算力
  // 6. 全部完成:聚合 output 节点产物 → workflow_runs.outputs,run=success
}
```

SSE 实现:内存 `Map<runId, Set<res>>`,引擎每次节点状态变化
`emit({nodeId, status, output?, cost?})`;连接断开自动清理;前端断线降级为轮询。
服务重启恢复:启动时把 running 的 run 标记 failed 并退款(复用现有启动恢复模式)。

## 6. 前端(web/src/)

新增依赖:`@vue-flow/core @vue-flow/background @vue-flow/controls @vue-flow/minimap`

```
views/WorkflowView.vue        画布主页面(路由 /workflow,requiresAuth)
views/WorkflowListView.vue    我的工作流列表(路由 /workflows)
components/flow/
  NodePalette.vue             左侧节点面板(拖拽入画布)
  NodeInspector.vue           右侧属性面板(按节点类型渲染表单,复用 StudioView 的参数控件)
  RunPanel.vue                底部运行条:预估成本 | 运行/取消 | 节点进度
  CompareDialog.vue           compare 节点人工选图弹窗
  nodes/BaseNode.vue          节点外壳:标题/状态角标(灰待执行/蓝运行/绿成功/红失败/闪电缓存)
  nodes/ImageInputNode.vue    内嵌上传(复用 apiUpload)+ 缩略图
  nodes/RelightNode.vue       风格缩略 + provider 徽标 + 结果缩略图
  nodes/CompareNode.vue / Img2VideoNode.vue / OutputNode.vue ...
stores/workflow.js            Pinia:graph 状态、undo/redo(快照栈)、运行状态、SSE 订阅
api/index.js                  追加 apiWorkflow* 方法;request.js 之外单独封装 SSE(EventSource 带 token query)
```

交互细节:
- 连线时按 I/O 类型校验,不匹配则红色禁止;
- 节点参数变更 → 防抖 800ms 自动保存 + 重新调 estimate 刷新成本条;
- 运行中画布只读,节点按 SSE 状态实时变色,成功节点直接显示结果缩略图;
- compare 节点触发 waiting_input → 弹 CompareDialog 大图对比 → 提交 resume。

## 7. 里程碑拆解(4 周)

### M1 画布骨架(第 1 周)
- [ ] 安装 Vue Flow,建 WorkflowView + 路由 + 导航入口
- [ ] NodePalette 拖入 / BaseNode 外壳 / 连线 + 类型校验 / 删除 / 缩放 / minimap
- [ ] NodeInspector 表单(先做 image-input / relight / output 三种)
- [ ] workflows 表 + CRUD 接口 + 前端保存/载入/列表
- **验收:能搭一条 输入→打光→输出 的图并保存刷新还原**

### M2 执行引擎(第 2 周)
- [ ] db.js 加 workflow_runs / node_runs;engine.js 拓扑排序 + 调度循环
- [ ] 节点执行器:image-input / relight(接 relight())/ output
- [ ] /estimate、/run(扣费)、SSE 推送、轮询兜底、启动恢复退款
- [ ] 前端 RunPanel + 节点状态实时渲染
- **验收:mock provider 下端到端跑通一条链,断网降级轮询正常**

### M3 多模型并行 + 对比 + 缓存(第 3 周)
- [ ] style-fanout(1 出 4)、relight 节点 provider 可选(mock/fal/replicate)
- [ ] compare 人工节点:waiting_input 暂停/resume 恢复
- [ ] 节点级缓存(cache_key 命中免费复用)+ 失败传播 + 取消退款
- [ ] advise 节点(LLM 参数 → 下游)
- **验收:同图三 provider 并行生成 → 对比选优;改一个参数重跑,其余节点秒级缓存命中**

### M4 视频 + 分享 + 打磨(第 4 周)
- [ ] img2video 节点:services/ai.js 加 `falImg2Video()`(Submit→Poll→Download,mp4 存 RESULT_DIR)
- [ ] mask 节点(前端画布画蒙版,透传给 relight 的 maskPath)
- [ ] 工作流模板分享页(复用 share 模式)+ 3 个预置模板(种草)
- [ ] undo/redo、快捷键、空态引导、移动端只读查看
- **验收:模板"商品打光四连拍 + 择优转视频"完整跑通并可分享**

## 8. 风险与对策

| 风险 | 对策 |
|---|---|
| fal 视频生成慢(分钟级) | img2video 节点单独超时(AI_TIMEOUT_MS×3),SSE 推 poll 心跳避免前端误判 |
| SSE 经 Nginx 被缓冲 | 响应头 `X-Accel-Buffering: no`,vite proxy 关闭缓冲 |
| 画布图与执行图漂移 | run 用 graph_snapshot,历史 run 永远可回放 |
| 扣费与失败退款一致性 | 全部走 changeCredits 事务 + credit_logs 流水,退款幂等(按 node_runs 状态计算) |
| Element Plus 与 Vue Flow 样式冲突 | Vue Flow 样式 scoped 引入,暗色主题变量对齐现有 theme store |
