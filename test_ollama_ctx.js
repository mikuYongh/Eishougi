const payload = {
    "model": "hf.co/HauhauCS/Qwen3.5-4B-Uncensored-HauhauCS-Aggressive:Q4_K_M",
    "messages": [
        { "role": "system", "content": "Test ".repeat(2000) },
        { "role": "user", "content": "Hello" }
    ],
    "stream": false,
    "max_tokens": 100,
    "options": {
        "num_ctx": 32768
    }
};

fetch('http://127.0.0.1:11434/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
})
.then(res => res.json().then(data => ({status: res.status, data})))
.then(console.log)
.catch(console.error);
