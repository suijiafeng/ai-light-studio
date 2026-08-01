/**
 * 灯光重绘提示词构造 —— 前端副本
 *
 * ⚠️ 必须与 server/src/services/ai.js 里的 buildEditPrompt 保持一字不差，
 *    改一处就要同步改另一处。前端留一份是为了：
 *    首页的「灯光方案模板」要把提示词直接展示/复制给用户看，
 *    而首页是未登录也能访问的静态页，不该为了拿一句话去打接口。
 *
 * 提示词写法上踩过的坑（2026-07 用同一张客厅原图逐条实测）：
 *   · 中文短指令 > 长段英文描述，英文形容词会被模型当成"重画一张"的许可
 *   · 不写"不要死黑"，夜景暖光会暗到看不清家具
 *   · 不写"白墙保持纯白"，6500K 会被渲染成整片饱和蓝（正面描述比"不要蓝色"有效）
 */
export const STYLE_PROMPTS = {
  night_warm:
    '把这个房间改成夜晚暖光效果：窗外是夜色，开启暖色筒灯、台灯和灯带，暖光在墙面和地面形成柔和光晕。',
  daylight:
    '把这个房间改成明亮的日间自然光效果：阳光从窗户射入，地面有柔和的阳光光斑，空间通透明亮、色彩干净。',
  office_cool:
    '把这个房间改成办公照明效果：顶部灯具打出明亮均匀的冷白光，整个空间被照亮，阴影很淡、对比很低。整体是干净的冷白色调，像正午的日光灯，白墙保持接近纯白——不要偏黄，也不要变成蓝色。',
  wall_wash:
    '把这个房间改成氛围洗墙光效果：暖白光从上往下洗亮墙面，形成明显的明暗层次和光影渐变，顶部略暗、墙面被照亮。'
}

export const DIRECTION_PROMPTS = {
  none: '环境光均匀分布',
  left: '主光源来自画面左侧',
  right: '主光源来自画面右侧',
  top: '主光源来自顶部天花',
  bottom: '光线从地面向上打'
}

const DEFAULT_TEMP = { night_warm: 3000, daylight: 5600, office_cool: 6500, wall_wash: 3500 }
const KEEP = '严格保持房间结构、家具位置、材质纹理、装饰品和拍摄视角完全不变，只改变照明。真实建筑摄影质感。'

// ⚠️ 不要把开尔文数字写进提示词：实测 6500K 会被模型当成整图蓝色滤镜。
// 色温滑杆依然生效，只是转成色感描述词。
const tempWord = k =>
  k <= 2800 ? '光色是暖黄光' : k <= 3500 ? '光色是暖白光'
    : k <= 4500 ? '光色是中性偏暖的白光' : k <= 6000 ? '光色是自然白光' : '光色是干净的冷白光（不是蓝色）'
const brightWord = v =>
  v < 30 ? '整体偏暗但家具材质细节仍清晰可见，不要死黑' : v > 70 ? '整体明亮通透，但不要过曝' : '明暗均衡、细节清晰'
const shadowWord = v =>
  v < 30 ? '光影柔和、过渡自然' : v > 70 ? '光影对比强烈、明暗层次分明' : '有适度的明暗层次'

export function buildLightPrompt(params = {}) {
  const num = (v, def) => {
    const n = Number(v)
    return Number.isFinite(n) ? n : def
  }
  const style = STYLE_PROMPTS[params.style] ? params.style : 'night_warm'
  return (
    STYLE_PROMPTS[style] +
    `${DIRECTION_PROMPTS[params.direction] || DIRECTION_PROMPTS.none}，${tempWord(num(params.colorTemp, DEFAULT_TEMP[style]))}，` +
    `${brightWord(num(params.brightness, 50))}，${shadowWord(num(params.intensity, 50))}。` +
    KEEP
  )
}
