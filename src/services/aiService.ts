import { useSettingsStore } from "../stores/settingsStore";
import { usePromptStore } from "../stores/promptStore";

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

    const systemPrompt = `你是一个提示词标签提取助手。请根据用户提供的英文提示词（Stable Diffusion Prompt）及项目名称，提取5-8个最核心的**中文**标签。
要求：
1. 必须优先提取具体的**人物角色名**（如：初音未来, 玛奇玛）和**作品名/IP**（如：原神, 蔚蓝档案）。
2. 然后提取核心特征：如画风（二次元, 写实）、核心主题、场景环境等。
3. 标签必须简短，通常2-8个字。
4. 仅输出标签，用逗号分隔，绝对不要输出任何其他解释性或过渡性文本。`;

    const bodyJson = JSON.stringify({
      model: llm.model || 'agnes-2.0-flash',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: promptText }
      ],
      temperature: 0.3,
      max_tokens: 50,
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
    const content = data.choices?.[0]?.message?.content || "";
    
    const rawTags = content.split(/[,，、\n]+/).map((t: string) => t.trim()).filter(Boolean);
    return Array.from(new Set(rawTags)).slice(0, 8) as string[];
  },

  async batchAutoTagPrompts(
    onProgress?: (current: number, total: number) => void,
    onLog?: (msg: string) => void
  ): Promise<number> {
    const prompts = usePromptStore.getState().prompts;
    const updatePrompt = usePromptStore.getState().updatePrompt;
    
    let successCount = 0;
    let index = 0;
    
    for (const project of prompts) {
      index++;
      if (onProgress) onProgress(index, prompts.length);
      
      const textToAnalyze = [project.title, project.positivePrompt].filter(Boolean).join("\n");
      if (!textToAnalyze.trim()) {
        if (onLog) onLog(`跳过空提示词项目: ${project.title || project.id}`);
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
