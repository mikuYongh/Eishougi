/**
 * Agent 提示词工程常量
 *
 * 从 LPF (ComfyUI-NewBie-LLM-Formatter) 的 agent_prompts.py 移植并精简，
 * 适配前端 TS 场景。根据当前 prompt 项目的 syntax 模式动态注入。
 */

export type PromptSyntax = 'danbooru' | 'natural' | 'xml';

// ── 标签互斥规则表 ────────────────────────────────────────────────
// 直接搬运 LPF 的互斥表。弱模型看到明确表格比看到"避免矛盾"有效得多。

export const TAG_MUTEX_RULES = `
## TAG MUTEX RULES (CRITICAL — do NOT output conflicting tag pairs)

### Viewpoint Mutex
| Tag A | Tag B | Reason |
|---|---|---|
| from_front | from_behind | physical contradiction |
| from_above | from_below | physical contradiction |
| looking_at_viewer | facing_away | gaze contradiction |
| pov | full_body | POV cannot see own full body |
| close-up | full_body | shot scale contradiction |

### Identity Mutex
| Tag A | Tag B | Reason |
|---|---|---|
| solo | hetero / 1boy / yuri | solo has no interaction |
| sleeping / unconscious | looking_at_viewer | unconscious cannot stare |
| blindfold | heart-shaped_pupils / rolling_eyes | eyes not visible |

### Clothing Mutex
| Tag A | Tag B | Reason |
|---|---|---|
| completely_nude | any specific clothing tag | nude wears nothing |
| pantyhose | barefoot | cannot be barefoot in pantyhose |
| blindfold | glasses | physical conflict |
| lingerie set (cat_lingerie, lace_lingerie, babydoll, etc.) | no_panties / bottomless | set implies panties included |

NOTE: outerwear/uniform (maid_outfit, school_uniform, bunny_suit, etc.) IS compatible with no_panties / bottomless.

### Action Mutex
| Tag A | Tag B | Reason |
|---|---|---|
| standing_sex | lying / on_back | position contradiction |
| missionary | doggystyle | cannot be two positions |
| cowgirl_position | prone_bone | position contradiction |
| fellatio | cunnilingus (same person performing) | only one mouth |

### Detail Tag Over-specification (CRITICAL)
Stacking too many detail tags on the same body part causes model over-rendering and deformities.
**Max 2 detail tags per body part, and they must NOT be mutually exclusive.**

| Part | Conflict combo | Reason |
|---|---|---|
| toes | spread_toes + toe_scrunch | extended vs curled |
| fingers | spread_fingers + clenched_fist | open vs fist |
| breasts | bouncing_breasts + breasts_squeeze_together | bounce vs squeeze |
| mouth | open_mouth + closed_mouth | open vs closed |
| eyes | rolling_eyes + looking_at_viewer | rolled vs stare |
| legs | spread_legs + legs_together | apart vs together |
`;

// ── 最终自检清单 ────────────────────────────────────────────────
// 组装完成后提交前必须逐项自检。

export const FINAL_SELF_CHECK = `
## FINAL SELF-CHECK CHECKLIST
Before submitting the prompt, you MUST verify ALL of the following pass:
1. COUNT CONSISTENCY: count/gender tags match actual character count. No contradictions like "1boy, 2boys".
2. NO MUTEX CONFLICTS: checked against the mutex table above — no viewpoint/identity/clothing/action/detail conflicts.
3. NO DUPLICATE TAGS: same tag never appears twice. Use weight syntax (tag:1.3) for emphasis, NOT repetition.
4. SCENE PLAUSIBILITY: scene tags physically compatible with action tags (e.g. underwater + cigarette is invalid).
5. DETAIL TAG CAP: max 2 detail tags per body part, no conflicting combos.
6. TAG COUNT: single character 16-30 tags, dual 22-38, complex multi 30-48.
7. STYLE CONSISTENCY: outfit/scene/atmosphere do not cross worldviews (e.g. hanfu in cyberpunk_city is invalid).
`;

// ── Danbooru 模式格式规范 ────────────────────────────────────────
const DANBOORU_FORMAT = `
## OUTPUT FORMAT (DANBOORU MODE)
- Tags are lowercase, underscore-separated, comma-separated.
- Artist tags MUST start with @ (e.g. @artist_name). Max 3 artist tags.
- Count tags first: 1girl / 1boy / solo / 2girls etc.
- Character name tag immediately after count (if named character).
- DO NOT add spaces inside tags. DO use spaces between different tags.

Recommended tag order:
[quality: masterpiece, best quality, highres],
[count: 1girl / 1boy / solo],
[character name] [series] [@artist],
[hair] [eyes] [body] [clothing],
[expression] [pose] [action],
[background] [atmosphere] [objects],
[composition: upper_body, looking_at_viewer]
`;

// ── Natural 模式格式规范 ─────────────────────────────────────────
const NATURAL_FORMAT = `
## OUTPUT FORMAT (NATURAL LANGUAGE MODE)
- Write 2-4 flowing English sentences describing the scene.
- Cover: subject description, composition/camera, lighting, background, atmosphere.
- DO NOT use comma-separated Danbooru tags. Use natural prose.
- For emphasis, you may use (phrase:1.3) weight syntax.
- Keep it focused and descriptive — quality comes from specificity, not length.
`;

// ── XML 模式格式规范（NewBie 标准）──────────────────────────────
const XML_FORMAT = `
## OUTPUT FORMAT (XML MODE — NewBie standard)
Output a structured XML block plus an English caption:

\`\`\`xml
<img>
 <character_1>
  <n>character name</n>
  <gender>1girl</gender>
  <appearance>hair, eyes, body features</appearance>
  <clothing>specific outfit</clothing>
  <expression>expression tags</expression>
  <action>action tags</action>
  <position>position</position>
 </character_1>

 <general_tags>
  <count>1girl</count>
  <style>anime_style, realistic_shading</style>
  <background>background tags</background>
  <atmosphere>mood tags</atmosphere>
  <quality>very_aesthetic, masterpiece, no_text</quality>
  <artist>artist tags</artist>
  <objects>items, weapons, accessories</objects>
 </general_tags>

 <caption>
  One flowing English paragraph describing the full scene: lighting, mood, characters, background.
 </caption>
</img>
\`\`\`

After the XML block, output a Chinese translation of the <caption>.
- Tags inside XML use underscores (red_eyes not red eyes).
- Weight parens like (tag:1.2) stay as-is, do not escape.
- Multiple characters: use character_2, character_3 etc. Each character's tags MUST be contiguous within their block.
`;

/**
 * 根据当前 prompt 项目的 syntax 模式返回对应的格式规范。
 */
export function getFormatSpec(syntax: PromptSyntax): string {
  switch (syntax) {
    case 'natural':
      return NATURAL_FORMAT;
    case 'xml':
      return XML_FORMAT;
    case 'danbooru':
    default:
      return DANBOORU_FORMAT;
  }
}

/**
 * 构建完整的输出规范注入字符串（格式规范 + 互斥表 + 自检清单）。
 * 用于注入到 callLLM 的 systemContext 中。
 */
export function buildOutputSpec(syntax: PromptSyntax): string {
  return `\n\n${getFormatSpec(syntax)}\n${TAG_MUTEX_RULES}\n${FINAL_SELF_CHECK}`;
}
