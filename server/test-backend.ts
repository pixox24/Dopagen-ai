import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fetch from 'node-fetch';

dotenv.config({ path: '../.env.local' }); // Load frontend env for Supabase config
dotenv.config({ path: './.env' }); // Load backend env for port

const BIZYAIR_API_KEY = process.env.BIZYAIR_API_KEY;
const API_URL = `http://localhost:${process.env.PORT || 3001}/api`;

const supabase = createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.VITE_SUPABASE_ANON_KEY!
);

async function testBackend() {
    console.log("1. Check Health...");
    try {
        const health = await fetch(`${API_URL.replace('/api', '/health')}`);
        console.log("Health Status:", await health.json());
    } catch (e) {
        console.error("Backend not running or not reachable:", e.message);
        return;
    }

    console.log("\n2. Login...");
    const { data: { session }, error } = await supabase.auth.signInWithPassword({
        email: 'test@example.com', // Change to a valid user if needed
        password: 'password123'
    });

    if (error) {
        // Try creating user if login fails
        console.log("Login failed, attempting signup...", error.message);
        const { data: signupData, error: signupError } = await supabase.auth.signUp({
            email: 'test@example.com',
            password: 'password123'
        });
        if (signupError) {
            console.error("Signup failed:", signupError.message);
            return;
        }
        console.log("Signup success, please check database/email if confirmation needed.");
        return;
    }
    console.log("Login success. Token:", session.access_token.substring(0, 20) + "...");

    console.log("\n3. Submit Task...");
    const taskRes = await fetch(`${API_URL}/tasks`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
            modelId: 'z-image-turbo',
            prompt: 'A concise test prompt',
            params: {
                web_app_id: 46445,
                input_values: {
                    "6:CLIPTextEncode.text": "A concise test prompt",
                    "3:KSampler.seed": 12345
                }
            }
        })
    });

    if (!taskRes.ok) {
        console.error("Task Submission Failed:", await taskRes.text());
        return;
    }

    const taskData = await taskRes.json();
    console.log("Task Submitted:", taskData);

    console.log("\n4. Pool Task Status...");
    const taskId = taskData.taskId;

    for (let i = 0; i < 10; i++) {
        const pollRes = await fetch(`${API_URL}/tasks/${taskId}`, {
            headers: { 'Authorization': `Bearer ${session.access_token}` }
        });
        const status = await pollRes.json();
        console.log(`[${i + 1}] Status: ${status.status}`);

        if (status.status === 'COMPLETED' || status.status === 'FAILED') {
            console.log("Final Result:", status);
            break;
        }
        await new Promise(r => setTimeout(r, 2000));
    }
}

testBackend();
