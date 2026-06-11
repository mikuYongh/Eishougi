export interface PresetStyle {
  id: string;
  name: string;
  trigger: string;
  category: string;
  preview?: string;
}

export const PRESET_STYLES: PresetStyle[] = [
  // 1. 画风 (Art Styles)
  {
    id: "style_cyberpunk",
    name: "赛博朋克",
    trigger: "cyberpunk, neon glow, futuristic cityscape, high-tech low-life, holographic displays, rain-slicked streets",
    category: "画风"
  },
  {
    id: "style_watercolor",
    name: "水彩插画",
    trigger: "watercolor painting, soft bleeding edges, diluted ink wash, paper texture, elegant splatters, pastel hues",
    category: "画风"
  },
  {
    id: "style_oil",
    name: "古典油画",
    trigger: "classic oil painting, impasto, heavy brushstrokes, textured canvas, chiaroscuro, rich warm tones",
    category: "画风"
  },
  {
    id: "style_pixel",
    name: "复古像素",
    trigger: "retro pixel art, 8-bit, 16-bit, grid pattern, game sprite, limited color palette, clean blocky shapes",
    category: "画风"
  },
  {
    id: "style_minimalist",
    name: "极简主义",
    trigger: "minimalist design, clean lines, vast negative space, simple geometric forms, understated colors, elegant simplicity",
    category: "画风"
  },
  {
    id: "style_anime",
    name: "日系动漫",
    trigger: "anime style, vibrant cel shading, detailed eyes, expressive linework, studio ghibli vibe, clean gradient shadows",
    category: "画风"
  },
  {
    id: "style_ink",
    name: "水墨国风",
    trigger: "traditional chinese ink painting, shan shui style, brush strokes, empty space, mist and fog, monochrome elegance",
    category: "画风"
  },

  // 2. 色调 (Color Tones)
  {
    id: "tone_warm",
    name: "暖阳色调",
    trigger: "warm lighting, golden hour, sunbeams, amber glow, cozy atmosphere, soft orange and yellow hues",
    category: "色调"
  },
  {
    id: "tone_cold",
    name: "冷冽冰蓝",
    trigger: "cold color temperature, icy blue tones, misty twilight, cinematic teal shading, quiet mood",
    category: "色调"
  },
  {
    id: "tone_monochrome",
    name: "经典黑白",
    trigger: "monochrome, dramatic black and white, high contrast, film noir, moody shadows, textured silver print",
    category: "色调"
  },
  {
    id: "tone_neon",
    name: "炫彩霓虹",
    trigger: "neon magenta and cyan, electric vibes, synthwave color palette, vibrant saturation, high energy illumination",
    category: "色调"
  },
  {
    id: "tone_pastel",
    name: "马卡龙粉彩",
    trigger: "pastel colors, macaron palette, dreamy soft focus, gentle cream tones, sweet whimsical color scheme",
    category: "色调"
  },

  // 3. 场景氛围 (Atmosphere/Scene)
  {
    id: "scene_cyber_alley",
    name: "赛博后巷",
    trigger: "cramped neon-lit alleyway, leaking pipes, steam venting, glowing signage, mysterious cybernetic atmosphere",
    category: "场景"
  },
  {
    id: "scene_space",
    name: "深空星尘",
    trigger: "outer space, cosmic nebula, glowing distant stars, stardust clouds, epic interstellar scale, celestial infinity",
    category: "场景"
  },
  {
    id: "scene_forest",
    name: "迷雾森林",
    trigger: "enchanted forest, towering ancient trees, mossy ground, sun rays piercing through fog, ethereal secret grove",
    category: "场景"
  },
  {
    id: "scene_cyber_lab",
    name: "未来实验室",
    trigger: "high-tech research laboratory, server racks, server cooling steam, green bio-tanks, holographic diagnostic screens",
    category: "场景"
  },
  {
    id: "scene_cyber_bar",
    name: "地下酒吧",
    trigger: "damp underground bar, retro-futuristic cocktail glasses, neon bar stools, smoke haze, synth music vibes",
    category: "场景"
  }
];
