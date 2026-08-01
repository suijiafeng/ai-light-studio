const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const config = require('../config');
const STYLE_PRESETS = {
  night_warm:  { name: '夜景暖光',  temp: 3000, brightness: 0.85, saturation: 1.12, prompt: 'warm cozy evening interior lighting, soft golden lamps, night ambience' },
  daylight:    { name: '日间自然光', temp: 5600, brightness: 1.12, saturation: 1.02, prompt: 'bright natural daylight interior, sunlight through windows, airy and fresh' },
  office_cool: { name: '办公冷光',  temp: 6500, brightness: 1.08, saturation: 0.92, prompt: 'cool white office lighting, even bright illumination, professional workspace' },
  wall_wash:   { name: '氛围洗墙光', temp: 3500, brightness: 0.92, saturation: 1.18, prompt: 'dramatic wall washer accent lighting, ambient gradient glow on walls, moody interior' }
};
const DIRECTIONS = {
  none:   { cx: '50%', cy: '30%', prompt: 'ambient light' },
  left:   { cx: '5%',  cy: '45%', prompt: 'light coming from the left side' },
  right:  { cx: '95%', cy: '45%', prompt: 'light coming from the right side' },
  top:    { cx: '50%', cy: '0%',  prompt: 'light coming from above, ceiling light' },
  bottom: { cx: '50%', cy: '100%', prompt: 'light coming from below, floor uplight' }
};
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
  const glowOpacity = (0.14 + intensity * 0.30).toFixed(3);
  // 色彩层用 soft-light 混合、不用 sharp 自带的 tint()——tint 是整图硬性重新着色，
  // 明暗细节和物体本身的固有色全被抹平成一片单色，演示模式看着就像加了层滤镜而不是"换光"；
  // soft-light 是真正的调色混合，会保留原图的明暗层次，只是把色调往目标色温上推
  const gradeOpacity = (0.32 + detail * 0.22).toFixed(3);
  const overlay = Buffer.from(
    `<svg width="${w}" height="${h}">
      <defs>
        <radialGradient id="g" cx="${dir.cx}" cy="${dir.cy}" r="80%">
          <stop offset="0%" stop-color="rgb(${tint.r},${tint.g},${tint.b})" stop-opacity="${glowOpacity}"/>
          <stop offset="65%" stop-color="rgb(${tint.r},${tint.g},${tint.b})" stop-opacity="0"/>
        </radialGradient>
        <linearGradient id="v" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="black" stop-opacity="0"/>
          <stop offset="100%" stop-color="black" stop-opacity="${(intensity * 0.30).toFixed(3)}"/>
        </linearGradient>
      </defs>
      <rect width="100%" height="100%" fill="rgb(${tint.r},${tint.g},${tint.b})" fill-opacity="${gradeOpacity}"/>
      <rect width="100%" height="100%" fill="url(#g)"/>
      <rect width="100%" height="100%" fill="url(#v)"/>
    </svg>`
  );

  await img
    .modulate({
      brightness: Math.min(Math.max(brightness, 0.4), 1.8),
      saturation: style.saturation * (0.9 + detail * 0.3)
    })
    .gamma(1 + (detail - 0.5) * 0.4)
    .composite([{ input: overlay, blend: 'soft-light' }])
    .jpeg({ quality: 92 })
    .toFile(outPath);
  await new Promise(r => setTimeout(r, 1200 + Math.random() * 1500));
  return outPath;
}

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

async function falRelight(sourcePath, params, outPath) {
  const { falKey, falModel, timeoutMs } = config.ai;
  if (!falKey) throw new Error('fal.ai 未配置：请在 .env 中填写 FAL_API_KEY');

  const style = STYLE_PRESETS[params.style] || STYLE_PRESETS.night_warm;
  const dir = DIRECTIONS[params.direction] || DIRECTIONS.none;
  const prompt = [
    style.prompt,
    dir.prompt,
    `color temperature ${params.colorTemp || style.temp}K`,
    `brightness level ${params.brightness ?? 50}/100`,
    'photorealistic interior, high quality, detailed'
  ].join(', ');

  const imgBuf = fs.readFileSync(sourcePath);
  const dataUri = `data:image/${path.extname(sourcePath).slice(1).replace('jpg', 'jpeg') || 'jpeg'};base64,${imgBuf.toString('base64')}`;
  const submit = await fetch(`https://queue.fal.run/${falModel}`, {
    method: 'POST',
    headers: { Authorization: `Key ${falKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      image_url: dataUri,
      prompt,
      negative_prompt: 'lowres, bad quality, distorted, cropped'
    })
  });
  if (!submit.ok) throw new Error(`fal 提交任务失败: ${submit.status} ${(await submit.text()).slice(0, 200)}`);
  const job = await submit.json();
  const statusUrl = job.status_url || `https://queue.fal.run/${falModel}/requests/${job.request_id}/status`;
  const resultUrl = job.response_url || `https://queue.fal.run/${falModel}/requests/${job.request_id}`;
  const deadline = Date.now() + timeoutMs;
  while (true) {
    if (Date.now() > deadline) throw new Error('AI生成超时，请重试');
    await new Promise(r => setTimeout(r, 2000));
    const st = await (await fetch(statusUrl, { headers: { Authorization: `Key ${falKey}` } })).json();
    if (st.status === 'COMPLETED') break;
    if (st.status === 'FAILED' || st.status === 'ERROR') throw new Error(`AI生成失败: ${st.error || st.status}`);
  }
  const result = await (await fetch(resultUrl, { headers: { Authorization: `Key ${falKey}` } })).json();
  const imageUrl = result.images?.[0]?.url || result.image?.url;
  if (!imageUrl) throw new Error('fal 返回结果中没有图片');
  const imgResp = await fetch(imageUrl);
  if (!imgResp.ok) throw new Error('下载生成结果失败');
  fs.writeFileSync(outPath, Buffer.from(await imgResp.arrayBuffer()));
  return outPath;
}

// ================= 魔搭 ModelScope · Qwen-Image-Edit-2509（免费额度） =================
// 踩过的坑（2026-07 实测，同一张客厅原图逐一对照）：
//   1) 用基础版 Qwen-Image-Edit 结构漂移严重（墙面变木饰面、家具挪位、办公冷光整面墙裂）；
//      换 -2509 后结构基本锁死，这是效果好坏的决定性因素。
//   2) 长段英文 prompt 不如中文短指令，模型会把英文形容词当成"重新画一张"的自由度。
//   3) 不写"不要死黑/不要过曝"，夜景暖光会暗到看不清家具；
//      不写"接近中性白、不要蓝调"，6500K 会被渲染成饱和蓝。
const MS_STYLE_PROMPTS = {
  night_warm:  '把这个房间改成夜晚暖光效果：窗外是夜色，开启暖色筒灯、台灯和灯带，暖光在墙面和地面形成柔和光晕。',
  daylight:    '把这个房间改成明亮的日间自然光效果：阳光从窗户射入，地面有柔和的阳光光斑，空间通透明亮、色彩干净。',
  office_cool: '把这个房间改成办公照明效果：顶部灯具打出明亮均匀的冷白光，整个空间被照亮，阴影很淡、对比很低。整体是干净的冷白色调，像正午的日光灯，白墙保持接近纯白——不要偏黄，也不要变成蓝色。',
  wall_wash:   '把这个房间改成氛围洗墙光效果：暖白光从上往下洗亮墙面，形成明显的明暗层次和光影渐变，顶部略暗、墙面被照亮。'
};
const MS_DIRECTIONS = {
  none:   '环境光均匀分布', left: '主光源来自画面左侧', right: '主光源来自画面右侧',
  top:    '主光源来自顶部天花', bottom: '光线从地面向上打'
};
// 不要把开尔文数字直接写进提示词！实测 6500K 会被模型当成"给整张图加蓝色滤镜"，
// 房间整片发蓝；写成"色温约6500K（干净的冷白光，不要变成蓝色）"也压不住，
// 只有彻底不提数字、改用色感描述词才出正常的冷白光。色温滑杆依然生效，只是转成措辞。
const msTempWord = k => (k <= 2800 ? '光色是暖黄光' : k <= 3500 ? '光色是暖白光'
  : k <= 4500 ? '光色是中性偏暖的白光' : k <= 6000 ? '光色是自然白光' : '光色是干净的冷白光（不是蓝色）');
const msBrightWord = v => (v < 30 ? '整体偏暗但家具材质细节仍清晰可见，不要死黑'
  : v > 70 ? '整体明亮通透，但不要过曝' : '明暗均衡、细节清晰');
const msShadowWord = v => (v < 30 ? '光影柔和、过渡自然'
  : v > 70 ? '光影对比强烈、明暗层次分明' : '有适度的明暗层次');

function buildEditPrompt(params) {
  const num = (v, def) => { const n = Number(v); return Number.isFinite(n) ? n : def; };
  const styleKey = MS_STYLE_PROMPTS[params.style] ? params.style : 'night_warm';
  const preset = STYLE_PRESETS[styleKey];
  return [
    MS_STYLE_PROMPTS[styleKey],
    `${MS_DIRECTIONS[params.direction] || MS_DIRECTIONS.none}，${msTempWord(num(params.colorTemp, preset.temp))}，`,
    `${msBrightWord(num(params.brightness, 50))}，${msShadowWord(num(params.intensity, 50))}。`,
    '严格保持房间结构、家具位置、材质纹理、装饰品和拍摄视角完全不变，只改变照明。真实建筑摄影质感。'
  ].join('');
}

async function modelscopeRelight(sourcePath, params, outPath) {
  const { msKey, msModel, msBaseUrl, timeoutMs } = config.ai;
  if (!msKey) throw new Error('魔搭未配置：请在 .env 中填写 MODELSCOPE_API_KEY');

  // 入参图压到长边1024再转base64：请求体更小、出图更快，画质由 finalizeImage 统一把关
  const inputBuf = await sharp(sourcePath).rotate()
    .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 90 }).toBuffer();
  // 注意：sharp 的 metadata() 读的是原始文件头，不含 rotate() 的效果，
  // 竖拍照片（EXIF orientation>=5）要手动换长宽，否则回贴尺寸会转90度
  const rawMeta = await sharp(sourcePath).metadata();
  const swapped = (rawMeta.orientation || 1) >= 5;
  const srcW = swapped ? rawMeta.height : rawMeta.width;
  const srcH = swapped ? rawMeta.width : rawMeta.height;
  const dataUri = `data:image/jpeg;base64,${inputBuf.toString('base64')}`;

  const submit = await fetch(`${msBaseUrl}/images/generations`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${msKey}`,
      'Content-Type': 'application/json',
      'X-ModelScope-Async-Mode': 'true' // 图像任务只支持异步，必须带
    },
    body: JSON.stringify({
      model: msModel,
      prompt: buildEditPrompt(params),
      negative_prompt: '模糊, 低分辨率, 结构变形, 家具移位, 凭空多出的物体, 过曝, 死黑, 文字, 水印',
      image_url: dataUri
    })
  });
  if (!submit.ok) throw new Error(`魔搭提交任务失败: ${submit.status} ${(await submit.text()).slice(0, 200)}`);
  const job = await submit.json();
  if (!job.task_id) throw new Error(`魔搭未返回任务ID: ${JSON.stringify(job).slice(0, 200)}`);

  const deadline = Date.now() + timeoutMs;
  let imageUrl = null;
  let failStreak = 0;
  while (true) {
    if (Date.now() > deadline) throw new Error('AI生成超时，请重试');
    await new Promise(r => setTimeout(r, 3000));
    const st = await (await fetch(`${msBaseUrl}/tasks/${job.task_id}`, {
      headers: { Authorization: `Bearer ${msKey}`, 'X-ModelScope-Task-Type': 'image_generation' }
    })).json();
    if (st.task_status === 'SUCCEED') { imageUrl = (st.output_images || [])[0]; break; }
    // 2509 的任务记录存活时间很短，偶发一次 FAILED 不一定是真失败，连续两次才判死
    if (st.task_status === 'FAILED') {
      if (++failStreak >= 2) throw new Error(`AI生成失败: ${JSON.stringify(st.errors || st.message || st.task_status).slice(0, 200)}`);
    } else { failStreak = 0; }
  }
  if (!imageUrl) throw new Error('魔搭返回结果中没有图片');

  const imgResp = await fetch(imageUrl);
  if (!imgResp.ok) throw new Error('下载生成结果失败');
  // 编辑模型可能改变输出尺寸，拉回原图长宽，前端"前后对比滑块"才能严丝合缝
  const out = await sharp(Buffer.from(await imgResp.arrayBuffer()))
    .resize(srcW, srcH, { fit: 'cover' })
    .jpeg({ quality: 95 }).toBuffer();
  fs.writeFileSync(outPath, out);
  return outPath;
}

async function finalizeImage(outPath, premium) {
  const config2 = require('../config');
  const maxSize = premium ? config2.premiumMaxSize : config2.freeMaxSize;
  let img = sharp(outPath);
  const meta = await img.metadata();
  if (Math.max(meta.width || 0, meta.height || 0) > maxSize) {
    img = img.resize(maxSize, maxSize, { fit: 'inside' });
  }
  if (!premium) {
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

const VALID_PROVIDERS = ['mock', 'fal', 'replicate', 'modelscope'];

async function fetchLlmLightingRecommendation(luminance, warmthRatio) {
  const { apiKey, baseUrl, model } = config.llm;
  if (!apiKey) return null;
  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        temperature: 0.4,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: '你是资深室内照明设计师。根据照片的亮度与色调数据，给出灯光重绘参数推荐。只输出JSON，字段：style(night_warm|daylight|office_cool|wall_wash)、colorTemp(2000-8000整数)、brightness(0-100)、intensity(0-100)、detail(0-100)、direction(none|left|right|top|bottom)、reason(60字以内中文专业建议)。' },
          { role: 'user', content: `照片平均亮度${(luminance * 100).toFixed(0)}/100（<35偏暗，>65偏亮），暖色比${warmthRatio.toFixed(2)}（>1偏暖）。请推荐灯光方案。` }
        ]
      })
    });
    if (!response.ok) return null;
    const responseBody = await response.json();
    const parsedRecommendation = JSON.parse(responseBody.choices?.[0]?.message?.content || '{}');
    if (!STYLE_PRESETS[parsedRecommendation.style] || !DIRECTIONS[parsedRecommendation.direction] || !parsedRecommendation.reason) return null;
    return {
      recommendedParams: {
        style: parsedRecommendation.style,
        colorTemp: Math.min(8000, Math.max(2000, Number(parsedRecommendation.colorTemp) || 3000)),
        brightness: Math.min(100, Math.max(0, Number(parsedRecommendation.brightness) || 50)),
        intensity: Math.min(100, Math.max(0, Number(parsedRecommendation.intensity) || 50)),
        detail: Math.min(100, Math.max(0, Number(parsedRecommendation.detail) || 50)),
        direction: parsedRecommendation.direction
      },
      reason: String(parsedRecommendation.reason).slice(0, 120)
    };
  } catch (e) {
    return null; // LLM异常自动降级规则版
  }
}

function buildRuleBasedRecommendation(luminance, warmthRatio) {
  if (luminance < 0.35) {
    return {
      recommendedParams: { style: 'night_warm', colorTemp: 3000, brightness: 68, intensity: 62, detail: 55, direction: 'top' },
      reason: '照片整体偏暗，建议采用暖光提亮方案：3000K暖色温营造温馨感，亮度提升至68，顶部主光源均匀照亮空间。'
    };
  }
  if (luminance > 0.65) {
    return warmthRatio > 1.1
      ? {
          recommendedParams: { style: 'daylight', colorTemp: 5600, brightness: 50, intensity: 45, detail: 50, direction: 'none' },
          reason: '照片光线充足，建议自然光方案微调：中性色温还原真实色彩，适当降低光影强度避免过曝。'
        }
      : {
          recommendedParams: { style: 'office_cool', colorTemp: 6000, brightness: 48, intensity: 40, detail: 55, direction: 'none' },
          reason: '照片光线充足，建议自然光方案微调：中性色温还原真实色彩，适当降低光影强度避免过曝。'
        };
  }
  if (warmthRatio > 1.15) {
    return {
      recommendedParams: { style: 'wall_wash', colorTemp: 3500, brightness: 55, intensity: 68, detail: 60, direction: 'left' },
      reason: '照片色调偏暖，适合氛围洗墙光方案：3500K配合较强光影层次，左侧光源突出墙面质感与空间纵深。'
    };
  }
  return {
    recommendedParams: { style: 'night_warm', colorTemp: 3200, brightness: 58, intensity: 55, detail: 55, direction: 'right' },
    reason: '照片明暗均衡、色调中性，推荐夜景暖光方案：3200K暖光搭配右侧光源，营造居家氛围同时保留细节。'
  };
}

async function adviseLighting(sourcePath) {
  const colorStats = await sharp(sourcePath).stats();
  const [meanRed, meanGreen, meanBlue] = colorStats.channels.map(channel => channel.mean);
  const luminance = (0.299 * meanRed + 0.587 * meanGreen + 0.114 * meanBlue) / 255; // 0-1 平均亮度
  const warmthRatio = meanRed / (meanBlue || 1); // >1 偏暖
  const analysis = { luminance: Number(luminance.toFixed(2)), warmth: Number(warmthRatio.toFixed(2)) };

  const llmRecommendation = await fetchLlmLightingRecommendation(luminance, warmthRatio);
  if (llmRecommendation) {
    return { recommend: llmRecommendation.recommendedParams, reason: llmRecommendation.reason, source: 'llm', analysis };
  }

  const ruleBasedRecommendation = buildRuleBasedRecommendation(luminance, warmthRatio);
  return { recommend: ruleBasedRecommendation.recommendedParams, reason: ruleBasedRecommendation.reason, source: 'rules', analysis };
}

async function relight(sourcePath, params, outPath, options = {}) {
  const { currentAiProvider } = require('./settings');
  const override = params && VALID_PROVIDERS.includes(params.provider) ? params.provider : null;
  const provider = override || currentAiProvider();
  if (provider === 'modelscope') {
    await modelscopeRelight(sourcePath, params, outPath);
  } else if (provider === 'fal') {
    await falRelight(sourcePath, params, outPath);
  } else if (provider === 'replicate') {
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

module.exports = { relight, adviseLighting, STYLE_PRESETS, DIRECTIONS };
