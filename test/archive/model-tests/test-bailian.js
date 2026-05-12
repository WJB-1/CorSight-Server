/**
 * 阿里云百炼 API 测试
 */
const dotenv = require('dotenv');
dotenv.config({ path: '../backend/.env' });

const axios = require('axios');

const TEST_IMAGE_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

async function testBailian() {
    const apiKey = process.env.BAILIAN_API_KEY;
    const model = 'qwen-vl-plus';

    console.log('测试阿里云百炼 API...');
    console.log('Model:', model);
    console.log('API Key:', apiKey ? apiKey.substring(0, 20) + '...' : '未设置');
    console.log('');

    try {
        const messages = [
            {
                role: 'system',
                content: 'You are a helpful assistant.'
            },
            {
                role: 'user',
                content: [
                    {
                        type: 'image_url',
                        image_url: {
                            url: `data:image/png;base64,${TEST_IMAGE_BASE64}`
                        }
                    },
                    {
                        type: 'text',
                        text: '请只回复"OK"两个字，不要添加任何其他内容。'
                    }
                ]
            }
        ];

        console.log('请求体:', JSON.stringify({ model, messages }, null, 2));
        console.log('');

        const startTime = Date.now();
        const response = await axios.post(
            'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
            {
                model: model,
                messages: messages,
                max_tokens: 10,
                temperature: 0.1
            },
            {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                timeout: 30000
            }
        );
        const elapsed = Date.now() - startTime;

        console.log(`✅ 请求成功 (${elapsed}ms)`);
        console.log('响应:', JSON.stringify(response.data, null, 2));

        const text = response.data.choices?.[0]?.message?.content || '';
        console.log('');
        console.log('回复内容:', text);

    } catch (error) {
        console.log('❌ 请求失败');
        console.log('错误:', error.message);

        if (error.response) {
            console.log('状态码:', error.response.status);
            console.log('响应:', JSON.stringify(error.response.data, null, 2));
        }
    }
}

testBailian();
