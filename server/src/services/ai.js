/**
 * AI 灯光重绘服务
 * - provider=replicate：对接 Replicate 上的 IC-Light 模型（填入 .env 即生效）
 * - provider=mock：本地图像处理模拟灯光效果（无需密钥，保证全流程可跑通）
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const config = require('../config');

// 灯光风格预设
const STYLE_PRESETS = {
  night_warm:  { name: '夜景暖光',  temp: 3000, brightness: 0.85, saturation: 1.12, prompt: 'warm cozy evening interior lighting, soft golden lamps, night ambience' },
  daylight:    { name: '日间自然光', temp: 5600, brightness: 1.12, saturation: 1.02, prompt: 'bright natural daylight interior, sunlight through windows, airy and fresh' },
  office_cool: { name: '办公冷光',  temp: 6500, brightness: 1.08, saturation: 0.92, prompt: 'cool white office lighting, even bright illumination, professional workspace' },
  wall_wash:   { name: '氛围洗墙光', temp: 3500, brightness: 0.92, saturation: 1.18, prompt: 'dramatic wall washer accent lighting, ambient gradient glow on walls, moody interior' }
};

// 光源方向预设：径向渐变中心位置（mock）与提示词（replicate）
const DIRECTIONS = {
  none:   { cx: '50%', cy: '30%', prompt: 'ambient light' },
  left:   { cx: '5%',  cy: '45%', prompt: 'light coming from the left side' },
  right:  { cx: '95%', cy: '45%', prompt: 'light coming from the right side' },
  top:    { cx: '50%', cy: '0%',  prompt: 'light coming from above, ceiling light' },
  bottom: { cx: '50%', cy: '100%', prompt: 'light coming from below, floor uplight' }
};

// 色温(K) → RGB 近似（Tanner Helland 算法）
function kelvinToRGB(kelvin) {
  const t = Math.min(Math.max(kelvin, 1000), 40000) / 100;
  let r, g, b;
  if (t <= 66) {
    r = 255;
    g = 99.4708025861 * Math.log(t) - 161.1195681661;
    b = t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  } else {
    r = 329.698727446 * Math.pow(t - 60, -0.1332047592);
    g = 288.1221695283 * Math.pow(t - 60, -0.0755148492);
    b = 255;
  }
  const clamp = v => Math.round(Math.min(255, Math.max(0, v)));
  return { r: clamp(r), g: clamp(g), b: clamp(b) };
}

/**
 * 本地模拟灯光重绘：色温着色 + 亮度 + 饱和度 + 光影gamma + 暗角氛围
 */
async function mockRelight(sourcePath, params, outPath) {
  const style = STYLE_PRESETS[params.style] || STYLE_PRESETS.night_warm;
  const num = (v, def) => { const n = Number(v); return Number.isFinite(n) ? n : def; };
  const temp = num(params.colorTemp, style.temp);
  const brightness = num(params.brightness, 50) / 50 * style.brightness; // 0-100 → 倍率
  const intensity = num(params.intensity, 50) / 100;                     // 光影强度 0-1
  const detail = num(params.detail, 50) / 100;                           // 明暗细节 0-1

  const dir = DIRECTIONS[params.direction] || DIRECTIONS.none;

  const tint = kelvinToRGB(temp);
  const img = sharp(sourcePath).rotate();
  const meta = await img.metadata();
  const w = meta.width || 1024, h = meta.height || 768;

  // 氛围光渐变叠加层（光源方向 + 洗墙/氛围感）
  const glowOpacity = (0.10 + intensity * 0.25).toFixed(3);
  const overlay = Buffer.from(
    `<svg width="${w}" height="${h}">
      <defs>
        <radialGradient id="g" cx="${dir.cx}" cy="${dir.cy}" r="85%">
          <stop offset="0%" stop-color="rgb(${tint.r},${tint.g},${tint.b})" stop-opacity="${glowOpacity}"/>
          <stop offset="70%" stop-color="rgb(${tint.r},${tint.g},${tint.b})" stop-opacity="0"/>
        </radialGradient>
        <linearGradient id="v" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="black" stop-opacity="0"/>
          <stop offset="100%" stop-color="black" stop-opacity="${(intensity * 0.28).toFixed(3)}"/>
        </linearGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#g)"/>
      <rect width="100%" height="100%" fill="url(#v)"/>
    </svg>`
  );

  await img
    .modulate({
      brightness: Math.min(Math.max(brightness, 0.4), 1.8),
      saturation: style.saturation * (0.85 + detail * 0.4)
    })
    .tint(tint)
    .gamma(1 + (detail - 0.5) * 0.5)
    .composite([{ input: overlay, blend: 'over' }])
    .jpeg({ quality: 92 })
    .toFile(outPath);

  // 模拟AI生成耗时
  await new Promise(r => setTimeout(r, 1200 + Math.random() * 1500));
  return outPath;
}

/**
 * Replicate IC-Light 出图
 */
async function replicateRelight(sourcePath, params, outPath) {
  const { replicateToken, replicateVersion, timeoutMs } = config.ai;
  if (!replicateToken || !replicateVersion) {
    throw new Error('Replicate 未配置：请在 .env 中填写 REPLICATE_API_TOKEN 与 REPLICATE_MODEL_VERSION');
  }
  const style = STYLE_PRESETS[params.style] || STYLE_PRESETS.night_warm;
  const dir = DIRECTIONS[params.direction] || DIRECTIONS.none;
  const prompt = [
    style.prompt,
    dir.prompt,
    `color temperature ${params.colorTemp || style.temp}K`,
    `brightness level ${params.brightness ?? 50}/100`,
    `light intensity ${params.intensity ?? 50}/100`,
    'photorealistic interior, high quality, detailed'
  ].join(', ');

  const imgBuf = fs.readFileSync(sourcePath);
  const dataUri = `data:image/${path.extname(sourcePath).slice(1) || 'jpeg'};base64,${imgBuf.toString('base64')}`;

  const createResp = await fetch('https://api.replicate.com/v1/predictions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${replicateToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      version: replicateVersion,
      input: { subject_image: dataUri, prompt, appended_prompt: 'best quality', negative_prompt: 'lowres, bad anatomy, bad hands, cropped, worst quality' }
    })
  });
  if (!createResp.ok) throw new Error(`Replicate 创建任务失败: ${createResp.status} ${await createResp.text()}`);
  let prediction = await createResp.json();

  const deadline = Date.now() + timeoutMs;
  while (['starting', 'processing'].includes(prediction.status)) {
    if (Date.now() > deadline) throw new Error('AI生成超时，请重试');
    await new Promise(r => setTimeout(r, 2500));
    const poll = await fetch(`https://api.replicate.com/v1/predictions/${prediction.id}`, {
      headers: { Authorization: `Bearer ${replicateToken}` }
    });
    prediction = await poll.json();
  }
  if (prediction.status !== 'succeeded') {
    throw new Error(`AI生成失败: ${prediction.error || prediction.status}`);
  }
  const outputUrl = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
  const imgResp = await fetch(outputUrl);
  if (!imgResp.ok) throw new Error('下载生成结果失败');
  fs.writeFileSync(outPath, Buffer.from(await imgResp.arrayBuffer()));
  return outPath;
}

/**
 * 出图后处理：付费/会员高清无水印，免费版限清+水印
 */
async function finalizeImage(outPath, premium) {
  const config2 = require('../config');
  const maxSize = premium ? config2.premiumMaxSize : config2.freeMaxSize;
  let img = sharp(outPath);
  const meta = await img.metadata();
  if (Math.max(meta.width || 0, meta.height || 0) > maxSize) {
    img = img.resize(maxSize, maxSize, { fit: 'inside' });
  }
  if (!premium) {
    // 半透明水印（右下角 + 居中斜排）
    const buf = await img.toBuffer();
    const m = await sharp(buf).metadata();
    const w = m.width, h = m.height;
    const fs2 = Math.max(16, Math.round(w / 32));
    const wm = Buffer.from(
      `<svg width="${w}" height="${h}">
        <text x="${w - 12}" y="${h - 14}" text-anchor="end" font-family="sans-serif" font-size="${fs2}" fill="white" fill-opacity="0.55">${config2.watermarkText}</text>
        <text x="50%" y="50%" text-anchor="middle" font-family="sans-serif" font-size="${fs2 * 1.6}" fill="white" fill-opacity="0.14" transform="rotate(-24 ${w / 2} ${h / 2})">${config2.watermarkText}</text>
      </svg>`
    );
    const out = await sharp(buf).composite([{ input: wm, blend: 'over' }]).jpeg({ quality: 90 }).toBuffer();
    fs.writeFileSync(outPath, out);
  } else {
    const out = await img.jpeg({ quality: 94 }).toBuffer();
    fs.writeFileSync(outPath, out);
  }
  return outPath;
}

/**
 * 局部重绘：用蒙版将重绘结果与原图融合（白色区域=应用新灯光，黑色=保留原图）
 */
async function applyMask(sourcePath, outPath, maskPath) {
  const relitBuf = fs.readFileSync(outPath);
  const m = await sharp(relitBuf).metadata();
  const maskGray = await sharp(maskPath)
    .resize(m.width, m.height, { fit: 'fill' })
    .greyscale()
    .blur(6) // 边缘羽化，过渡自然
    .toBuffer();
  const relitRGBA = await sharp(relitBuf).removeAlpha().joinChannel(maskGray).png().toBuffer();
  const out = await sharp(sourcePath).rotate()
    .resize(m.width, m.height, { fit: 'fill' })
    .composite([{ input: relitRGBA }])
    .jpeg({ quality: 92 })
    .toBuffer();
  fs.writeFileSync(outPath, out);
}

async function relight(sourcePath, params, outPath, options = {}) {
  if (config.ai.provider === 'replicate') {
    await replicateRelight(sourcePath, params, outPath);
  } else {
    await mockRelight(sourcePath, params, outPath);
  }
  if (options.maskPath) {
    await applyMask(sourcePath, outPath, options.maskPath);
  }
  await finalizeImage(outPath, !!options.premium);
  return outPath;
}

module.exports = { relight, STYLE_PRESETS, DIRECTIONS };
