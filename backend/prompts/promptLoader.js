/**
 * 提示词加载器
 * 
 * 从 Markdown 文件加载提示词模板，支持 YAML Front Matter 解析
 * 
 * 使用方式：
 * 1. 创建 .md 文件，包含 YAML Front Matter 和 Markdown 内容
 * 2. 使用 loadPrompt('filename-without-extension') 加载
 * 3. 使用 renderPrompt(template, variables) 渲染变量
 */

const fs = require('fs').promises;
const path = require('path');

const PROMPTS_DIR = path.join(__dirname, 'templates');

/**
 * 解析 YAML Front Matter
 * @param {string} content - 文件内容
 * @returns {Object} { frontMatter: {}, content: string }
 */
function parseFrontMatter(content) {
    const match = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);

    if (!match) {
        return { frontMatter: {}, content: content.trim() };
    }

    const yamlContent = match[1];
    const markdownContent = match[2].trim();

    // 简单 YAML 解析
    const frontMatter = {};
    yamlContent.split('\n').forEach(line => {
        const colonIndex = line.indexOf(':');
        if (colonIndex > 0) {
            const key = line.substring(0, colonIndex).trim();
            const value = line.substring(colonIndex + 1).trim();
            frontMatter[key] = value;
        }
    });

    return { frontMatter, content: markdownContent };
}

/**
 * 加载提示词文件
 * @param {string} name - 提示词文件名（不含扩展名）
 * @returns {Promise<Object>} { frontMatter: {}, content: string, system: string }
 */
async function loadPrompt(name) {
    const filePath = path.join(PROMPTS_DIR, `${name}.md`);
    const fileContent = await fs.readFile(filePath, 'utf-8');
    const { frontMatter, content } = parseFrontMatter(fileContent);

    // 提取 System Prompt（第一个 ## 标题之前或整个内容）
    let systemPrompt = content;
    const firstHeadingMatch = content.match(/\n## /);
    if (firstHeadingMatch) {
        systemPrompt = content.substring(0, firstHeadingMatch.index).trim();
    }

    return {
        frontMatter,
        content,
        system: systemPrompt,
        name
    };
}

/**
 * 同步加载提示词文件（用于启动时预加载）
 * @param {string} name - 提示词文件名（不含扩展名）
 * @returns {Object} { frontMatter: {}, content: string, system: string }
 */
function loadPromptSync(name) {
    const filePath = path.join(PROMPTS_DIR, `${name}.md`);
    const fileContent = require('fs').readFileSync(filePath, 'utf-8');
    const { frontMatter, content } = parseFrontMatter(fileContent);

    let systemPrompt = content;
    const firstHeadingMatch = content.match(/\n## /);
    if (firstHeadingMatch) {
        systemPrompt = content.substring(0, firstHeadingMatch.index).trim();
    }

    return {
        frontMatter,
        content,
        system: systemPrompt,
        name
    };
}

/**
 * 渲染提示词模板，替换变量
 * @param {string} template - 模板字符串
 * @param {Object} variables - 变量对象
 * @returns {string} 渲染后的字符串
 */
function renderPrompt(template, variables = {}) {
    return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
        return variables[key] !== undefined ? variables[key] : match;
    });
}

/**
 * 从 Markdown 内容提取特定章节
 * @param {string} content - Markdown 内容
 * @param {string} heading - 章节标题（不含 #）
 * @returns {string} 章节内容
 */
function extractSection(content, heading) {
    const regex = new RegExp(`##\\s*${heading}\\s*\n([\\s\\S]*?)(?=\n## |$)`, 'i');
    const match = content.match(regex);
    return match ? match[1].trim() : '';
}

// 预加载所有提示词
const PROMPTS = {
    // Language Optimizer Agent
    languageOptimizer: loadPromptSync('language-optimizer-system'),

    // Perception Agent - Scene Types
    intersection: loadPromptSync('perception-intersection'),
    path: loadPromptSync('perception-path'),
    feature: loadPromptSync('perception-feature'),
    destination: loadPromptSync('perception-destination'),
};

/**
 * 获取 Language Optimizer System Prompt
 * @returns {string}
 */
function getLanguageOptimizerSystemPrompt() {
    return PROMPTS.languageOptimizer.system;
}

/**
 * 获取 Perception Agent System Prompt（根据场景类型）
 * @param {string} sceneType - 场景类型: intersection|path|feature|destination
 * @param {Object} variables - 模板变量
 * @returns {string}
 */
function getPerceptionSystemPrompt(sceneType, variables = {}) {
    const prompt = PROMPTS[sceneType];
    if (!prompt) {
        throw new Error(`Unknown scene type: ${sceneType}`);
    }
    return renderPrompt(prompt.system, variables);
}

/**
 * 获取场景支持的模型类型
 * @param {string} sceneType - 场景类型
 * @returns {string} vision|text
 */
function getSceneModelType(sceneType) {
    const prompt = PROMPTS[sceneType];
    return prompt?.frontMatter?.model_type || 'vision';
}

/**
 * 列出所有可用的提示词
 * @returns {Array}
 */
function listAvailablePrompts() {
    return Object.entries(PROMPTS).map(([key, prompt]) => ({
        key,
        agent: prompt.frontMatter.agent,
        scene: prompt.frontMatter.scene,
        description: prompt.frontMatter.description,
        version: prompt.frontMatter.version,
        modelType: prompt.frontMatter.model_type
    }));
}

module.exports = {
    // 核心函数
    loadPrompt,
    loadPromptSync,
    renderPrompt,
    extractSection,

    // 便捷函数
    getLanguageOptimizerSystemPrompt,
    getPerceptionSystemPrompt,
    getSceneModelType,
    listAvailablePrompts,

    // 预加载的提示词（调试用）
    PROMPTS
};
