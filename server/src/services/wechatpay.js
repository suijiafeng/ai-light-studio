/**
 * 微信支付 V3（Native扫码支付）
 * - provider=wechat：真实对接，需在 .env 配置商户参数与证书
 * - provider=mock：沙箱模拟，生成模拟二维码链接，可用 /api/pay/mock/:orderId 模拟支付成功
 */
const fs = require('fs');
const crypto = require('crypto');
const config = require('../config');

function getPrivateKey() {
  if (!config.pay.privateKeyPath || !fs.existsSync(config.pay.privateKeyPath)) {
    throw new Error('微信商户私钥文件不存在，请检查 WXPAY_PRIVATE_KEY_PATH');
  }
  return fs.readFileSync(config.pay.privateKeyPath, 'utf8');
}

/** V3 请求签名 */
function buildAuthHeader(method, urlPath, body) {
  const { mchid, serial } = config.pay;
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = crypto.randomBytes(16).toString('hex');
  const message = `${method}\n${urlPath}\n${timestamp}\n${nonce}\n${body}\n`;
  const signature = crypto.createSign('RSA-SHA256').update(message).sign(getPrivateKey(), 'base64');
  return `WECHATPAY2-SHA256-RSA2048 mchid="${mchid}",nonce_str="${nonce}",signature="${signature}",timestamp="${timestamp}",serial_no="${serial}"`;
}

/** 创建Native支付订单，返回 code_url（二维码内容） */
async function createNativeOrder(order) {
  if (config.pay.provider !== 'wechat') {
    // 沙箱模拟：返回模拟二维码内容
    return { codeUrl: `weixin://wxpay/bizpayurl?pr=MOCK_${order.id}`, mock: true };
  }
  const urlPath = '/v3/pay/transactions/native';
  const body = JSON.stringify({
    appid: config.pay.appid,
    mchid: config.pay.mchid,
    description: order.title,
    out_trade_no: order.id,
    notify_url: config.pay.notifyUrl,
    amount: { total: order.amount, currency: 'CNY' }
  });
  const resp = await fetch(`https://api.mch.weixin.qq.com${urlPath}`, {
    method: 'POST',
    headers: {
      Authorization: buildAuthHeader('POST', urlPath, body),
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body
  });
  const data = await resp.json();
  if (!resp.ok || !data.code_url) {
    throw new Error(`微信下单失败: ${data.message || resp.status}`);
  }
  return { codeUrl: data.code_url, mock: false };
}

/** 申请退款（V3），mock模式即时成功 */
async function refundOrder(order, reason = '用户退款') {
  if (config.pay.provider !== 'wechat') {
    return { refundId: `MOCKRF${Date.now()}`, status: 'SUCCESS', mock: true };
  }
  const urlPath = '/v3/refund/domestic/refunds';
  const body = JSON.stringify({
    out_trade_no: order.id,
    out_refund_no: `RF${order.id}`,
    reason,
    amount: { refund: order.amount, total: order.amount, currency: 'CNY' }
  });
  const resp = await fetch(`https://api.mch.weixin.qq.com${urlPath}`, {
    method: 'POST',
    headers: {
      Authorization: buildAuthHeader('POST', urlPath, body),
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(`微信退款失败: ${data.message || resp.status}`);
  return { refundId: data.refund_id, status: data.status, mock: false };
}

/** 解密回调 resource（AES-256-GCM） */
function decryptNotifyResource(resource) {
  const { ciphertext, nonce, associated_data } = resource;
  const key = Buffer.from(config.pay.apiv3Key, 'utf8');
  const data = Buffer.from(ciphertext, 'base64');
  const authTag = data.subarray(data.length - 16);
  const encrypted = data.subarray(0, data.length - 16);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(nonce, 'utf8'));
  decipher.setAuthTag(authTag);
  if (associated_data) decipher.setAAD(Buffer.from(associated_data, 'utf8'));
  const decoded = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return JSON.parse(decoded.toString('utf8'));
}

module.exports = { createNativeOrder, decryptNotifyResource, refundOrder };
