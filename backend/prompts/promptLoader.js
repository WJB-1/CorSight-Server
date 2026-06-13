/**
 * 提示词模板加载器
 *
 * 从 prompts/templates/ 加载 .md 模板文件，支持 {{variable}} 变量插值。
 */

const fs = require('fs');
const path = require('path');

const TEMPLATES_DIR = path.join(__dirname, 'templates');

/** 模板缓存 */
const cache = new Map();

/**
 * 加载模板并插值
 * @param {string} sceneType - 场景类型（对应文件名，如 'steps' → 'perception-steps.md'）
 * @param {object} variables - 插值变量
 * @returns {string} 插值后的提示词
 */
function load(sceneType, variables = {}) {
  const filename = `perception-${sceneType}.md`;
  const filePath = path.join(TEMPLATES_DIR, filename);

  let template;
  if (cache.has(filename)) {
    template = cache.get(filename);
  } else if (fs.existsSync(filePath)) {
    template = fs.readFileSync(filePath, 'utf-8');
    cache.set(filename, template);
  } else {
    // 回退到 generic
    if (sceneType !== 'generic') {
      return load('generic', variables);
    }
    return `分析这张街景图片，提取视障相关的 OSM 标签和环境描述。`;
  }

  // 变量插值
  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), String(value));
  }

  return result;
}

/**
 * 列出所有可用模板
 * @returns {string[]}
 */
function listTemplates() {
  if (!fs.existsSync(TEMPLATES_DIR)) return [];
  return fs.readdirSync(TEMPLATES_DIR)
    .filter((f) => f.startsWith('perception-') && f.endsWith('.md'))
    .map((f) => f.replace('perception-', '').replace('.md', ''));
}

module.exports = { load, listTemplates };
