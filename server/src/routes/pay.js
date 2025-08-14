const express = require('express');
const { v4: uuid } = require('uuid');
const db = require('../db');
const config = require('../config');
const { ok, fail } = require('../utils/response');
const { auth } = require('../middleware/auth');
const { changeCredits } = require('../services/credits');
const { createNativeOrder, decryptNotifyResource, refundOrder } = require('../services/wechatpay');
const { adminOnly } = require('../middleware/auth');

const router = express.Router();
const settleOrder = db.transaction((orderId, transactionId) => {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  if (!order || order.status !== 'pending') return order;
  db.prepare('UPDATE orders SET status = ?, transaction_id = ?, paid_at = ? WHERE id = ?')
    .run('paid', transactionId || '', Date.now(), orderId);
  changeCredits(order.user_id, order.credits, 'recharge', `充值「${order.title}」到账${order.credits}算力`);
  if (order.member_days > 0) {
    const u = db.prepare('SELECT member_expires_at FROM users WHERE id = ?').get(order.user_id);
    const base = u.member_expires_at && u.member_expires_at > Date.now() ? u.member_expires_at : Date.now();
    db.prepare('UPDATE users SET member_expires_at = ? WHERE id = ?')
      .run(base + order.member_days * 86400000, order.user_id);
  }
  return db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
});

const toOrder = o => ({
  id: o.id, packageId: o.package_id, title: o.title,
  amount: o.amount, amountYuan: (o.amount / 100).toFixed(2),
  credits: o.credits, memberDays: o.member_days, status: o.status,
  payMethod: o.pay_method, transactionId: o.transaction_id,
  createdAt: o.created_at, paidAt: o.paid_at
});
const toPkg = r => ({
  id: r.id, type: r.type, title: r.title, price: r.price,
  credits: r.credits, days: r.days, desc: r.description,
  priceYuan: (r.price / 100).toFixed(2)
});
function memberDiscountRate() {
  const d = Number(config.memberDiscount);
  return Number.isFinite(d) && d > 0 && d < 1 ? d : 1;
}
router.get('/packages', (req, res) => {
  const rows = db.prepare('SELECT * FROM packages WHERE active = 1 ORDER BY sort ASC, rowid ASC').all();
  return ok(res, {
    packages: rows.map(toPkg),
    memberDiscount: memberDiscountRate(),
    payProvider: config.pay.provider
  });
});
function orderPrice(pkg, userId) {
  const discount = memberDiscountRate();
  if (pkg.type !== 'credits' || discount >= 1) return pkg.price;
  const u = db.prepare('SELECT member_expires_at FROM users WHERE id = ?').get(userId);
  const isMember = u?.member_expires_at && u.member_expires_at > Date.now();
  return isMember ? Math.round(pkg.price * discount) : pkg.price;
}
router.post('/order', auth, async (req, res) => {
  const row = db.prepare('SELECT * FROM packages WHERE id = ? AND active = 1').get((req.body || {}).packageId || '');
  if (!row) return fail(res, 400, '套餐不存在或已下架');
  const pkg = toPkg(row);
  const amount = orderPrice(pkg, req.user.id);
  const title = amount < pkg.price ? `${pkg.title}（会员${memberDiscountRate() * 10}折）` : pkg.title;
  const id = `O${Date.now()}${Math.floor(Math.random() * 9000 + 1000)}`;
  db.prepare('INSERT INTO orders (id, user_id, package_id, title, amount, credits, member_days, status, pay_method, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, req.user.id, pkg.id, title, amount, pkg.credits, pkg.days || 0, 'pending', 'wechat', Date.now());
  try {
    const { codeUrl, mock } = await createNativeOrder({ id, title: `AI灯光设计-${title}`, amount });
    return ok(res, { orderId: id, codeUrl, mock }, '下单成功');
  } catch (e) {
    db.prepare('UPDATE orders SET status = ? WHERE id = ?').run('closed', id);
    return fail(res, 500, e.message || '下单失败');
  }
});
router.get('/order/:id', auth, (req, res) => {
  const o = db.prepare('SELECT * FROM orders WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!o) return fail(res, 404, '订单不存在');
  return ok(res, toOrder(o));
});
router.get('/orders', auth, (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const size = Math.min(50, Math.max(1, Number(req.query.size) || 10));
  const total = db.prepare('SELECT COUNT(*) c FROM orders WHERE user_id = ?').get(req.user.id).c;
  const rows = db.prepare('SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?')
    .all(req.user.id, size, (page - 1) * size);
  return ok(res, { total, page, size, list: rows.map(toOrder) });
});
router.post('/mock/:id', auth, (req, res) => {
  if (config.pay.provider !== 'mock') return fail(res, 403, '当前为真实支付模式，模拟支付不可用');
  const o = db.prepare('SELECT * FROM orders WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!o) return fail(res, 404, '订单不存在');
  if (o.status === 'paid') return ok(res, toOrder(o), '订单已支付');
  if (o.status !== 'pending') return fail(res, 400, '该订单已关闭或已退款，无法支付');
  const settled = settleOrder(o.id, `MOCK${Date.now()}`);
  return ok(res, toOrder(settled), '模拟支付成功');
});
router.post('/refund/:id', auth, adminOnly, async (req, res) => {
  const o = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!o) return fail(res, 404, '订单不存在');
  if (o.status !== 'paid') return fail(res, 400, '仅已支付订单可退款');
  const user = db.prepare('SELECT credits, member_expires_at FROM users WHERE id = ?').get(o.user_id);
  if (user.credits < o.credits) {
    return fail(res, 400, `用户当前余额${user.credits}不足以扣回${o.credits}算力（已部分消耗），请先线下协商`);
  }
  try {
    const r = await refundOrder(o, req.body?.reason || '管理员退款');
    const settle = db.transaction(() => {
      db.prepare("UPDATE orders SET status = 'refunded', transaction_id = ? WHERE id = ?").run(r.refundId, o.id);
      changeCredits(o.user_id, -o.credits, 'consume', `订单${o.id}退款，扣回${o.credits}算力`);
      if (o.member_days > 0 && user.member_expires_at) {
        db.prepare('UPDATE users SET member_expires_at = ? WHERE id = ?')
          .run(user.member_expires_at - o.member_days * 86400000, o.user_id);
      }
    });
    settle();
    return ok(res, { refundId: r.refundId, mock: r.mock }, '退款成功');
  } catch (e) {
    return fail(res, 500, e.message || '退款失败');
  }
});
router.post('/notify', (req, res) => {
  try {
    const body = req.body || {};
    if (body.event_type === 'TRANSACTION.SUCCESS' && body.resource) {
      const data = decryptNotifyResource(body.resource);
      if (data.trade_state === 'SUCCESS') {
        settleOrder(data.out_trade_no, data.transaction_id);
      }
    }
    return res.status(200).json({ code: 'SUCCESS', message: '成功' });
  } catch (e) {
    console.error('[pay notify]', e.message);
    return res.status(500).json({ code: 'FAIL', message: e.message });
  }
});

module.exports = router;
