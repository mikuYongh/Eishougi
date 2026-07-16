import { useSettingsStore } from "../stores/settingsStore";

export class LLMService {
  private baseUrl = "https://apihub.agnes-ai.com/v1";
  private model = "agnes-2.0-flash";

  async tagImage(imageBase64: string): Promise<{ tag: string, confidence: number }[]> {
    const { llm, visionLlm } = useSettingsStore.getState().settings;
    const profile = visionLlm?.enabled ? visionLlm : llm;
    const currentApiUrl = profile.apiUrl || this.baseUrl;
    const currentApiKey = profile.apiKey;
    const currentModel = profile.model || this.model;
    const currentTemperature = profile.temperature !== undefined ? profile.temperature : 0.1;

    const prompt = `You are a highly accurate image tagger system. Look at the provided image and extract Danbooru-style tags. Return ONLY a JSON list of objects in this exact format, with no markdown, no \`\`\`json blocks, and no extra text:
[
  {"tag": "1girl", "confidence": 0.99},
  {"tag": "blue_hair", "confidence": 0.85}
]`;

    const payload = {
      model: currentModel,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: imageBase64 } }
          ]
        }
      ],
      temperature: currentTemperature
    };

    try {
      const fetchUrl = currentApiUrl.endsWith('/chat/completions') ? currentApiUrl : `${currentApiUrl.replace(/\/$/, '')}/chat/completions`;
      const response = await fetch(fetchUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${currentApiKey}`
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`LLM API Error: ${response.statusText}`);
      }

      const data = await response.json();
      let content = data.choices[0].message.content;
      
      // Attempt to clean up response if it wrapped in markdown
      content = content.replace(/```json/g, '').replace(/```/g, '').trim();

      return JSON.parse(content);
    } catch (e: any) {
      console.error("LLM Tagging failed:", e);
      throw new Error("反推模型调用失败，请检查网络或稍后重试");
    }
  }
}

export const llmService = new LLMService();
