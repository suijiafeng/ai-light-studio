const fs = require('fs');
const path = require('path');
const config = require('../../config');
const { relight } = require('../ai');
const { enqueueGen } = require('../genQueue');
function userError(message) {
  const err = new Error(message);
  err.safe = true;
  return err;
}

const NODE_DEFS = {
  'image-input': {
    type: 'image-input',
    inputs: [],
    outputs: [{ name: 'image', type: 'image' }],
    cacheable: false,
    cost: () => 0,
    async execute(data) {
      const fileId = data && data.fileId;
      if (!fileId) throw userError('图片输入节点尚未上传图片');
      const p = path.join(config.uploadDir, path.basename(fileId));
      if (!fs.existsSync(p)) throw userError('源图片不存在，请重新上传');
      return { image: p, url: `/uploads/${path.basename(fileId)}` };
    }
  },
  'relight': {
    type: 'relight',
    inputs: [{ name: 'image', type: 'image', required: true }],
    outputs: [{ name: 'image', type: 'image' }],
    cacheable: true,
    cost: () => config.costPerGeneration,
    async execute(data, ctx) {
      const srcPath = ctx && ctx.upstream && ctx.upstream.image;
      if (!srcPath) throw userError('打光节点未获取到上游图片，请检查连线');
      const outName = `wf-${ctx.runId}-${ctx.nodeId}.jpg`;
      const outPath = path.join(config.resultDir, outName);
      await enqueueGen(() => relight(srcPath, data || {}, outPath, { premium: ctx.premium }));
      return { image: outPath, url: `/results/${outName}` };
    }
  },
  'output': {
    type: 'output',
    inputs: [{ name: 'in', type: 'any', required: true }],
    outputs: [],
    cacheable: false,
    cost: () => 0,
    async execute(data, ctx) {
      return { ...(ctx && ctx.upstream ? ctx.upstream : {}) };
    }
  }
};

function nodeDef(type) {
  return NODE_DEFS[type] || null;
}

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map(k => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
}

function analyzeGraph(graph) {
  if (!graph || typeof graph !== 'object') return { valid: false, error: '工作流数据格式错误' };
  const nodes = Array.isArray(graph.nodes) ? graph.nodes : null;
  const edges = Array.isArray(graph.edges) ? graph.edges : null;
  if (!nodes || !edges) return { valid: false, error: '工作流缺少 nodes 或 edges' };
  if (!nodes.length) return { valid: false, error: '工作流不能为空，请至少添加一个节点' };
  if (nodes.length > 200) return { valid: false, error: '节点数量超出上限（200）' };

  const nodesById = new Map();
  for (const n of nodes) {
    if (!n || typeof n.id !== 'string' || !n.id) return { valid: false, error: '节点缺少合法的 id' };
    if (nodesById.has(n.id)) return { valid: false, error: `节点 id 重复：${n.id}` };
    if (!n.type || !NODE_DEFS[n.type]) return { valid: false, error: `未知节点类型：${n.type}` };
    nodesById.set(n.id, { id: n.id, type: n.type, data: (n.data && typeof n.data === 'object') ? n.data : {} });
  }

  const adjacency = new Map([...nodesById.keys()].map(id => [id, []]));
  const indegree = new Map([...nodesById.keys()].map(id => [id, 0]));
  const incomingByTarget = new Map([...nodesById.keys()].map(id => [id, []]));

  for (const e of edges) {
    if (!e || typeof e.source !== 'string' || typeof e.target !== 'string') {
      return { valid: false, error: '连线缺少 source 或 target' };
    }
    if (!nodesById.has(e.source) || !nodesById.has(e.target)) {
      return { valid: false, error: `连线引用了不存在的节点：${e.source} → ${e.target}` };
    }
    const sourceDef = NODE_DEFS[nodesById.get(e.source).type];
    const targetDef = NODE_DEFS[nodesById.get(e.target).type];
    const out = sourceDef.outputs[0];
    const inp = targetDef.inputs[0];
    if (!out || !inp) {
      return { valid: false, error: `连线不合法：节点 ${e.source} 或 ${e.target} 没有可连接的端口` };
    }
    if (out.type !== 'any' && inp.type !== 'any' && out.type !== inp.type) {
      return { valid: false, error: `连线类型不兼容：${e.source}(${out.type}) → ${e.target}(${inp.type})` };
    }
    adjacency.get(e.source).push(e.target);
    indegree.set(e.target, indegree.get(e.target) + 1);
    incomingByTarget.get(e.target).push({ source: e.source, target: e.target });
  }
  const indegreeCopy = new Map(indegree);
  const queue = [...indegreeCopy.entries()].filter(([, d]) => d === 0).map(([id]) => id);
  const order = [];
  while (queue.length) {
    const id = queue.shift();
    order.push(id);
    for (const down of adjacency.get(id)) {
      indegreeCopy.set(down, indegreeCopy.get(down) - 1);
      if (indegreeCopy.get(down) === 0) queue.push(down);
    }
  }
  if (order.length !== nodesById.size) return { valid: false, error: '工作流中存在环，无法执行' };
  for (const [id, node] of nodesById) {
    const def = NODE_DEFS[node.type];
    for (const input of def.inputs) {
      if (!input.required) continue;
      const count = incomingByTarget.get(id).length;
      if (count !== 1) {
        return { valid: false, error: `节点「${def.type}」缺少必填输入的上游连线（节点 id：${id}）` };
      }
    }
  }

  return { valid: true, nodesById, order, adjacency, indegree, incomingByTarget };
}

module.exports = { NODE_DEFS, nodeDef, analyzeGraph, stableStringify };
