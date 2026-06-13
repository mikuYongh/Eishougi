const payload = {
    "model": "gemma-tagger:latest",
    "messages": [
        {
            "role": "system",
            "content": "Test"
        },
        {
            "role": "user",
            "content": "生成 原神甘雨的图 要求 不可思议的巨大奶子 "
        }
    ],
    "tools": [
        {
            "type": "function",
            "function": {
                "name": "auto_tag_all_prompts",
                "description": "Batch auto-generate Chinese tags for all prompts based on their positive prompts using the configured LLM API. Does this silently in the background.",
                "parameters": {
                    "type": "object",
                    "properties": {}
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "search_tags",
                "description": "Search Danbooru tags using natural language and return a ready-to-use prompt.",
                "parameters": {
                    "type": "object",
                    "properties": {}
                }
            }
        }
    ],
    "stream": true,
    "temperature": 0.1,
    "max_tokens": 2048
};

fetch('http://127.0.0.1:11434/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
})
.then(res => res.json().then(data => ({status: res.status, data})))
.then(console.log)
.catch(console.error);
