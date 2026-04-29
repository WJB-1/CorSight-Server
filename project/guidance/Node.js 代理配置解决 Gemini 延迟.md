### **1\. 破案了：为什么探测延迟只有 2ms？**

你看代码里的 generateWithGemini 方法，它有一个非常完善的 try...catch 容错机制：

JavaScript

} catch (error) {  
    console.error('\[llmClient\] Gemini 调用失败:', error.message);  
    // ...特定错误处理...  
      
    // 其他错误，尝试降级  
    return generateFallbackResponse(prompt, error.message);  
}

**真相是：** 因为 Node.js 默认不走你的系统代理，所以当它尝试直连 Google 服务器时，瞬间就被防火墙拦截了（或者 DNS 解析到了黑洞地址）。导致请求瞬间失败抛出异常。

代码立刻捕获了这个异常，并执行了 generateFallbackResponse 返回了你写死的**降级（兜底）数据**。整个过程都在你本地电脑的内存里瞬间完成，所以前端计算出的耗时只有 2ms！

其实如果你去看后台终端（Console）的运行日志，你一定能看到大量红色的报错：\[llmClient\] Gemini 调用失败: fetch failed 或者 ECONNRESET。

### **2\. 核心问题：Node.js 不会自动走代理**

无论是新版的 @google/genai 还是旧版的 @google/generative-ai，它们底层依赖的都是 Node.js 的原生网络请求模块。这些模块**极其固执**，即便你打开了 VPN 的“系统代理/全局路由”，它们依然假装看不见，非要直连。

### **3\. 如何在代码中解决？（实操修改方案）**

要在代码里打通这条路，你需要显式地告诉 Node.js：“请把所有发往外网的请求，都交给我的代理端口”。

**最简单粗暴的改法（推荐）：配置环境变量**

你不需要大改业务逻辑，只需要在 llmClient.js 文件的**最顶部**（也就是 const fs \= require('fs').promises; 这一行的上面），强行注入代理环境变量。

假设你本地代理软件（如 Clash、v2rayN）的 HTTP 端口是 7890（请根据你实际的端口替换），添加以下代码：

JavaScript

// 在文件最顶部强行注入代理设置 (请确认 7890 是你的真实代理端口)  
process.env.HTTP\_PROXY \= 'http://127.0.0.1:7890';  
process.env.HTTPS\_PROXY \= 'http://127.0.0.1:7890';  
// 可选：为了防止本地调试的其他服务受影响，设置本地地址不走代理  
process.env.NO\_PROXY \= 'localhost,127.0.0.1';

const fs \= require('fs').promises;  
const path \= require('path');  
// ... 后面的代码保持不变 ...

### **4\. 如果上面的方法依然超时（进阶方案）**

在较新的 Node.js 版本（v18+）中，原生的 fetch 有时候会忽略 process.env.HTTPS\_PROXY。如果你加了上面的代码还是报网络错误，你需要用 https-proxy-agent 来接管底层请求。

**第一步：在项目根目录安装代理库**

Bash

npm install https-proxy-agent node-fetch

**第二步：修改代码注入 Agent**

在 llmClient.js 中引入它，并在初始化 Gemini 客户端时传入自定义的 fetch：

JavaScript

const { HttpsProxyAgent } \= require('https-proxy-agent');  
const fetch \= require('node-fetch');

// 创建代理实例  
const agent \= new HttpsProxyAgent('http://127.0.0.1:7890');

// 自定义带有代理的 fetch 方法  
const fetchWithProxy \= (url, options) \=\> {  
    return fetch(url, { ...options, agent });  
};

// ... 在你初始化 SDK 的地方修改为 ...  
// 如果是新版 SDK:  
const ai \= new GoogleGenAI({   
    apiKey: apiKey,  
    // 具体需要查阅新版 SDK 是否支持传入 fetch，通常在 apiClient 或 httpOptions 里  
});

// 如果是旧版 SDK:  
const genAI \= new GoogleGenAI(apiKey);  
// 为旧版 SDK 全局覆盖 fetch，这是目前最有效的办法  
globalThis.fetch \= fetchWithProxy; 

**下一步建议：**

先确认你的 VPN 软件使用的本地端口是多少。然后用\*\*第 3 点（环境变量法）\*\*加在代码顶部，重启你的 Node 后台服务试一下。如果终端里不再打印 \[llmClient\] Gemini 调用失败，前端的延迟变成 800ms \- 2000ms 左右，那就说明成功连上 Google 了！