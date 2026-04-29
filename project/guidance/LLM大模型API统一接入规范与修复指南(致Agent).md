# **LLM 大模型 API 统一接入规范与修复指南 (Agent 执行手册)**

## **⚠️ 核心网络痛点与首要修复任务 (Critical Network Fix)**

**问题背景**：当前 llmClient.js 出现 2ms 极速超时的根本原因在于，Node.js 原生的网络请求模块（以及基于此的各大官方 SDK）**默认不会读取系统的代理设置**。在国内网络环境下，直连 Google 或外网 API 会被瞬间重置连接（ECONNRESET）。

**Agent 执行指令**：

在重构 llmClient.js 时，**必须**在文件顶部引入代理机制，并在所有 HTTP 请求和 SDK 初始化中强制注入代理。

请确保执行以下依赖安装命令：

npm install https-proxy-agent node-fetch openai @google/genai

**通用代理实现方案**：

const { HttpsProxyAgent } \= require('https-proxy-agent');  
// 优先读取环境变量，如果为空则使用默认本地代理端口 (请用户确保此端口正确)  
const PROXY\_URL \= process.env.HTTPS\_PROXY || process.env.HTTP\_PROXY || '\[http://127.0.0.1:7890\](http://127.0.0.1:7890)';  
const proxyAgent \= new HttpsProxyAgent(PROXY\_URL);

// 强制接管 Node.js 全局 fetch (专治旧版与新版未暴露 agent 选项的 SDK)  
const fetch \= require('node-fetch');  
globalThis.fetch \= function(url, options) {  
    return fetch(url, { ...options, agent: proxyAgent });  
};

## **各大平台 API 调用标准规范**

### **1\. DeepSeek API (OpenAI 兼容模式)**

根据官方文档（https://api.deepseek.com），DeepSeek 采用完全兼容 OpenAI 的 SDK。

* **所需依赖**：openai  
* **基础配置**：  
  * baseURL: 'https://api.deepseek.com'  
  * model: 'deepseek-chat' 或 'deepseek-reasoner'  
* **Agent 代码实现模板**：

const { OpenAI } \= require('openai');

async function generateWithDeepSeek(prompt, apiKey, options) {  
    const openai \= new OpenAI({  
        baseURL: '\[https://api.deepseek.com\](https://api.deepseek.com)',  
        apiKey: apiKey,  
        httpAgent: proxyAgent // 必须注入代理！  
    });

    const response \= await openai.chat.completions.create({  
        model: 'deepseek-chat',  
        messages: \[  
            { role: 'system', content: '你是一个专业的视障导航助手。' },  
            { role: 'user', content: prompt }  
        \],  
        temperature: options.temperature ?? 0.1  
    });

    return response.choices\[0\].message.content;  
}

### **2\. Google Gemini API (多模态支持)**

使用新版的 @google/genai SDK，由于前面已经覆盖了 globalThis.fetch，此时 SDK 内部发出的请求将自动走代理，不会再报 2ms 超时。

* **所需依赖**：@google/genai  
* **Agent 代码实现模板**：

const { GoogleGenAI } \= require('@google/genai');

async function generateWithGemini(prompt, imagePaths, apiKey, modelName, options) {  
    // 因为顶部已经重写了 globalThis.fetch，这里直接初始化即可  
    const ai \= new GoogleGenAI({ apiKey });  
      
    const contents \= \[\];  
    // 多模态图片处理 (Base64)  
    if (imagePaths && imagePaths.length \> 0\) {  
        for (const imagePath of imagePaths) {  
            const { base64, mimeType } \= await loadImageAsBase64(imagePath);  
            contents.push({  
                inlineData: { data: base64, mimeType: mimeType }  
            });  
        }  
    }  
    contents.push({ text: prompt });

    const response \= await ai.models.generateContent({  
        model: modelName || 'gemini-1.5-pro',  
        contents: contents,  
        config: {  
            temperature: options.temperature ?? 0.1,  
            topP: options.topP ?? 0.85  
        }  
    });

    return response.text;  
}

### **3\. 阿里云百炼 Qwen (OpenAI 兼容模式)**

根据最新官方文档，阿里云百炼（DashScope）完全支持基于 OpenAI SDK 的兼容调用，包括多模态能力。这允许我们复用与 DeepSeek 相同的基础架构。

* **所需依赖**：openai  
* **基础配置**：  
  * baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1'  
  * model: 'qwen-vl-plus' 等  
* **Agent 代码实现模板**：

const { OpenAI } \= require('openai');

async function generateWithQwen(prompt, imagePaths, apiKey, modelName, options) {  
    const openai \= new OpenAI({  
        baseURL: '\[https://dashscope.aliyuncs.com/compatible-mode/v1\](https://dashscope.aliyuncs.com/compatible-mode/v1)',  
        apiKey: apiKey,  
        // 国内请求阿里云理论上不挂代理也行，但统一注入代理可以保持代码一致性，防止意外拦截  
        httpAgent: proxyAgent   
    });

    const contentArr \= \[\];  
      
    // 文本部分  
    contentArr.push({ type: 'text', text: prompt });

    // 图像部分 (标准的 OpenAI 多模态 Image URL 格式)  
    if (imagePaths && imagePaths.length \> 0\) {  
        for (const imagePath of imagePaths) {  
            const { base64, mimeType } \= await loadImageAsBase64(imagePath);  
            contentArr.push({  
                type: 'image\_url',  
                image\_url: {  
                    url: \`data:${mimeType};base64,${base64}\`  
                }  
            });  
        }  
    }

    const response \= await openai.chat.completions.create({  
        model: modelName || 'qwen-vl-plus',  
        messages: \[  
            { role: 'system', content: '你是一个专业的视障导航助手。' },  
            { role: 'user', content: contentArr }  
        \],  
        temperature: options.temperature ?? 0.1  
    });

    return response.choices\[0\].message.content;  
}

## **Agent 最终重构任务清单 (Task List)**

1. **清空并重写 llmClient.js**：不要基于旧代码修补，直接根据上述 3 个平台的模板和网络代理模板，重新构建该文件。移除原本对 axios 的依赖，现在 Qwen 和 DeepSeek 统一使用 openai。  
2. **保留原有接口签名**：确保主出口函数依然是 async function generateContent(prompt, imagePaths \= \[\], options \= {})，根据配置自动分发到对应的具体实现函数。  
3. **处理异常捕获**：保留原有的 generateFallbackResponse 降级机制，当抛出异常时（如网络依然不通、Key 错误），返回优雅的兜底导航文本。  
4. **提供环境变量提示**：在代码注释中提醒用户配置本地代理端口的环境变量（如 export HTTP\_PROXY="http://127.0.0.1:7890"）。