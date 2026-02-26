const fetch = require('node-fetch');

const API_BASE_URL = 'http://localhost:3001/api';

async function test() {
    console.log("Starting backend check via API...");

    // 1. Health
    try {
        const res = await fetch('http://localhost:3001/health');
        if (!res.ok) throw new Error(res.statusText);
        const health = await res.json();
        console.log("Health OK:", health);
    } catch (e) {
        console.error("Backend health check failed:", e.message);
        return;
    }

    // 2. Signup via Backend API (Bypasses email verification)
    const email = `test_${Date.now()}@example.com`;
    const password = 'password123';
    const username = `user_${Date.now()}`;

    console.log(`Attempting signup for ${email}...`);
    const signupRes = await fetch(`${API_BASE_URL}/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, username })
    });

    if (!signupRes.ok) {
        console.error("Signup Failed:", await signupRes.text());
        return;
    }

    const { session, user } = await signupRes.json();
    console.log("Signup Success! Token:", session.access_token.substring(0, 20) + "...");

    // 3. Submit Task
    const payload = {
        modelId: 'z-image-turbo',
        prompt: 'Test prompt from script',
        params: {
            web_app_id: 46445,
            input_values: {
                "6:CLIPTextEncode.text": "Test prompt",
                "3:KSampler.seed": 12345
            }
        }
    };

    console.log("Submitting task...");
    const taskRes = await fetch(`${API_BASE_URL}/tasks`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify(payload)
    });

    if (!taskRes.ok) {
        console.error("Task submission failed:", await taskRes.text());
        return;
    }

    const taskData = await taskRes.json();
    console.log("Task submitted, ID:", taskData.taskId);

    // 4. Poll Status
    let status = 'PENDING';
    for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 2000));
        const pollRes = await fetch(`${API_BASE_URL}/tasks/${taskData.taskId}`, {
            headers: { 'Authorization': `Bearer ${session.access_token}` }
        });
        const pollData = await pollRes.json();
        console.log(`[${i + 1}] Status: ${pollData.status}`);
        status = pollData.status;

        if (status === 'FAILED') {
            console.error("Task Failed:", pollData.error);
            break;
        } else if (status === 'COMPLETED') {
            console.log("Task Completed! Result URL:", pollData.resultUrl);
            break;
        }
    }
}

test();
