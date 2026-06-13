import type { NavId, ThemeId, TabId } from "../types";
import React from "react";
import { 
  LayoutDashboard, 
  PenSquare, 
  Zap, 
  Paintbrush, 
  Video, 
  Search, 
  Image as ImageIcon,
  Users,
  History,
  Settings,
  Sparkles
} from "lucide-react";

/* ====== Navigation ====== */
export const NAV_ITEMS: { id: NavId; label: string; icon: React.ReactNode; path: string }[] = [
  { id: "dashboard",  label: "仪表板",     icon: <LayoutDashboard size={18} />, path: "/" },
  { id: "prompts",    label: "提示词管理", icon: <PenSquare size={18} />, path: "/prompts" },
  { id: "workflows",  label: "工作流管理", icon: <Zap size={18} />, path: "/workflows" },
  { id: "generate",   label: "生成",       icon: <Paintbrush size={18} />, path: "/generate" },
  { id: "video",      label: "图生视频",   icon: <Video size={18} />, path: "/video" },
  { id: "tagger",     label: "图片反推",   icon: <Search size={18} />, path: "/tagger" },
  { id: "characters", label: "角色图鉴",   icon: <Users size={18} />, path: "/characters" },
  { id: "artists",    label: "风格画师",   icon: <ImageIcon size={18} />, path: "/artists" },
  { id: "history",    label: "生成历史",   icon: <History size={18} />, path: "/history" },
  { id: "vault",      label: "典藏库",     icon: <Sparkles size={18} />, path: "/vault" },
  { id: "settings",   label: "设置",       icon: <Settings size={18} />, path: "/settings" },
];

/* ====== Themes ====== */
export const THEMES: { id: ThemeId; label: string; gradient: string }[] = [
  { id: "sakura",  label: "樱花粉",   gradient: "linear-gradient(135deg, #FF6B9D, #B388FF)" },
  { id: "classic", label: "经典蓝",   gradient: "linear-gradient(135deg, #4A90D9, #7CB8FF)" },
  { id: "green",   label: "葱绿",     gradient: "linear-gradient(135deg, #4CAF7D, #81D4A8)" },
  { id: "night",   label: "暗夜星辰", gradient: "linear-gradient(135deg, #7C6DF0, #B388FF)" },
  { id: "cyber",   label: "赛博极光", gradient: "linear-gradient(135deg, #00E5FF, #FF3D7F)" },
];

/* ====== Prompt Tabs ====== */
export const PROMPT_TABS: { id: TabId; label: string }[] = [
  { id: "all",      label: "全部" },
  { id: "positive", label: "正向提示词" },
  { id: "negative", label: "负向提示词" },
  { id: "artist",   label: "风格提示词" },
  { id: "favorite", label: "⭐ 收藏" },
];

/* ====== Tag Colors ====== */
export const TAG_COLORS = [
  "#FF6B9D", "#B388FF", "#64FFDA", "#FFAB40",
  "#4CAF50", "#4A90D9", "#FF8A65", "#CE93D8",
  "#80CBC4", "#FFCC80", "#A5D6A7", "#90CAF9",
];

/* ====== SDXL Resolutions ====== */
export const SDXL_RESOLUTIONS = [
  { label: "1024×1024", w: 1024, h: 1024 },
  { label: "1216×832",  w: 1216, h: 832 },
  { label: "832×1216",  w: 832,  h: 1216 },
  { label: "1344×768",  w: 1344, h: 768 },
  { label: "768×1344",  w: 768,  h: 1344 },
  { label: "1536×640",  w: 1536, h: 640 },
  { label: "640×1536",  w: 640,  h: 1536 },
  { label: "1152×896",  w: 1152, h: 896 },
  { label: "896×1152",  w: 896,  h: 1152 },
];

/* ====== Defaults ====== */
export const DEFAULT_NEGATIVE =
  "(worst quality:1.5, low quality:1.5, bad anatomy, bad hands, extra fingers, missing fingers, deformed, blurry, watermark, text, signature, nsfw)";
