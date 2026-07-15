import { useSettingsStore } from "../stores/settingsStore";
import { usePromptStore } from "../stores/promptStore";

/**
 * Robust tag parser for LLM outputs. Handles:
 * 1. JSON array: `["原神","二次元"]`
 * 2. Comma-separated: `原神, 二次元, 战斗`
 * 3. Messy output with explanation text — extracts short CJK tags, filters out sentence fragments
 */
function parseTagsFromLLM(content: string): string[] {
  const trimmed = content.trim();

  // 1. Try JSON array first — this is the primary expected format
  const jsonMatch = trimmed.match(/\[[\s\S]*\]/);
  if (jsonMatch) {
    try {
      const arr = JSON.parse(jsonMatch[0]);
      if (Array.isArray(arr)) {
        const tags = arr.map((t: any) => String(t).trim()).filter((t: string) => t.length > 0);
        if (tags.length > 0) return tags;
      }
    } catch { /* fall through */ }
  }

  // 2. Fallback: extract CJK tags from free-form text.
  let cleaned = trimmed.replace(/```[a-z]*\s*/gi, '').replace(/```\s*/g, '');
  const parts = cleaned.split(/[,，、\n;；]+/).map((t: string) => t.trim()).filter(Boolean);

  const cjkRe = /[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff]/;
  const sentenceRe = /[的是了着看们在和把将被让对从向给为会能可以要已经又也还都就只才]|^(好的|我来|为你|以下|这是|根据|需要|提取|标签|提示词|项目|首先|然后|接着|这个|那个|动作|风格|类型)/;

  const tags = parts.map((t: string) =>
    // Strip quotes, numbering, bullets, brackets
    t.replace(/["""''''《》]/g, '')
     .replace(/^[\d\.\-\*\s]+/, '')
     .replace(/^[（(].*?[)）]\s*/, '')
     .trim()
  ).filter((t: string) => {
    if (t.length < 1 || t.length > 8) return false;
    if (!cjkRe.test(t)) return false;
    if (sentenceRe.test(t)) return false;
    if (/[：:]$/.test(t)) return false;
    return true;
  });

  return tags;
}

export const aiService = {
  async generateTags(promptText: string): Promise<string[]> {
    const { llm } = useSettingsStore.getState().settings;
    if (!llm.apiKey) {
      throw new Error("请先在设置中配置大模型 API Key");
    }
    
    let apiUrl = llm.apiUrl || 'https://apihub.agnes-ai.com/v1';
    if (!apiUrl.endsWith('/chat/completions')) {
      apiUrl = apiUrl.replace(/\/$/, '') + '/chat/completions';
    }

    const systemPrompt = `从用户提供的英文 Stable Diffusion 提示词和项目名称中，提取5-8个核心中文分类标签。

规则：
1. 优先提取作品名（如"原神"、"鸣潮"）和角色名（如"雷电将军"）。
2. 然后提取场景、画风、主题等特征。
3. 每个标签2-6个字。

输出格式：JSON 数组，如 ["鸣潮","女角色","床","简单背景"]
只输出JSON数组，不要任何其他文字。`;

    const bodyJson = JSON.stringify({
      model: llm.model || 'agnes-2.0-flash',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: promptText }
      ],
      temperature: 0.3,
      max_tokens: 200,
    });

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${llm.apiKey}`
      },
      body: bodyJson
    });

    if (!response.ok) {
      throw new Error(`API Error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    let content = data.choices?.[0]?.message?.content || "";
    if (!content && data.choices?.[0]?.message?.reasoning_content) {
      content = data.choices[0].message.reasoning_content;
    }

    const rawTags = parseTagsFromLLM(content);
    return Array.from(new Set(rawTags)).slice(0, 8) as string[];
  },

  async batchAutoTagPrompts(
    onProgress?: (current: number, total: number, currentId?: string) => void,
    onLog?: (msg: string) => void
  ): Promise<number> {
    const prompts = usePromptStore.getState().prompts;
    const updatePrompt = usePromptStore.getState().updatePrompt;
    
    let successCount = 0;
    let index = 0;
    
    for (const project of prompts) {
      index++;
      if (onProgress) onProgress(index, prompts.length, project.id);
      
      const textToAnalyze = [project.title, project.positivePrompt].filter(Boolean).join("\n");
      if (!textToAnalyze.trim()) {
        if (onLog) onLog(`跳过空创作项目: ${project.title || project.id}`);
        continue;
      }
      
      if (onLog) onLog(`正在分析: ${project.title || '未命名'}...`);
      try {
        const newTags = await this.generateTags(textToAnalyze);
        if (newTags.length > 0) {
          await updatePrompt(project.id, { tags: newTags });
          successCount++;
          if (onLog) onLog(`✅ 成功更新: ${newTags.join(', ')}`);
        } else {
          if (onLog) onLog(`⚠️ 未能提取到标签`);
        }
      } catch (err: any) {
        if (onLog) onLog(`❌ 失败: ${err.message}`);
        console.error("AutoTag Error:", err);
      }
    }
    
    return successCount;
  }
};
