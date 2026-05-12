/**
 * 固定模型配置测试脚本
 *
 * 测试:
 * 1. 视觉模型(从Agent): 阿里云百炼 qwen-vl-max - 街景图片分析
 * 2. 文本模型(主Agent): DeepSeek deepseek-v4-pro(thinking模式) - 播报文案生成
 *
 * 用法:
 *   cd backend/test && node test-fixed-models.js
 */

const path = require('path');

// 加载测试目录下的 .env.test（不污染主目录配置）
require('dotenv').config({ path: path.join(__dirname, '.env.test') });

const llmClient = require('../services/llmClient');
const llmConfig = require('../config/llmConfig');

// 测试用的街景图片
const TEST_IMAGE_PATH = path.join(__dirname, '../public/images/P005_N.jpg');

// 测试用的 IR 数据
const TEST_IR_DATA = {
  route_summary: {
    total_distance: '700米',
    duration_estimate: '12分钟',
    compression_ratio: '40%'
  },
  key_nodes: [
    {
      node_index: 1,
      distance_from_start: '100米',
      action: '上天桥',
      relative_direction: '稍向左转',
      hazards: ['两段连续向上台阶']
    },
    {
      node_index: 2,
      distance_from_start: '600米',
      action: '横过路口',
      relative_direction: '直行',
      hazards: ['无盲道', '机非混行']
    },
    {
      node_index: 3,
      distance_from_start: '650米',
      action: '到达终点',
      relative_direction: '稍向右转',
      hazards: ['无导航覆盖', '需沿墙寻路']
    }
  ]
};

/**
 * 测试视觉模型 (从Agent - qwen-vl-max)
 */
async function testVisionModel() {
  console.log('\n========================================');
  console.log('测试视觉模型 (从Agent): qwen-vl-max');
  console.log('========================================\n');

  const visionConfig = llmConfig.getVisionModel();
  console.log('配置信息:', JSON.stringify(visionConfig, null, 2));

  const fs = require('fs');
  if (!fs.existsSync(TEST_IMAGE_PATH)) {
    console.log('⚠️ 测试图片不存在，跳过视觉测试');
    console.log('   期望路径:', TEST_IMAGE_PATH);
    return { success: false, skipped: true };
  }

  const prompt = `分析这张街景图片，关注以下方面：
1. 是否有盲道
2. 路面状况
3. 是否有障碍物
4. 是否有人行道

请用简洁的中文回答。`;

  const startTime = Date.now();
  try {
    const result = await llmClient.generateContent(
      prompt,
      [TEST_IMAGE_PATH],
      {
        modelType: 'vision',
        temperature: 0.1,
        maxTokens: 500
      }
    );

    const elapsed = Date.now() - startTime;

    if (result.success) {
      console.log('✅ 视觉模型测试成功');
      console.log('响应时间:', elapsed, 'ms');
      console.log('响应内容预览:', result.text.substring(0, 200) + '...');
      return { success: true, responseTime: elapsed, text: result.text };
    } else {
      console.log('❌ 视觉模型测试失败:', result.error);
      return { success: false, error: result.error };
    }
  } catch (error) {
    console.log('❌ 视觉模型测试异常:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * 测试文本模型 (主Agent - deepseek-v4-pro)
 */
async function testTextModel() {
  console.log('\n========================================');
  console.log('测试文本模型 (主Agent): deepseek-v4-pro');
  console.log('========================================\n');

  const textConfig = llmConfig.getTextModel();
  console.log('配置信息:', JSON.stringify(textConfig, null, 2));

  const systemPrompt = `你是一位视障定向行走(O&M)专家。将路线数据转化为行前语音播报。

约束：
- 使用自然方向词：左转/右转/直行/稍向左转/稍向右转
- 禁止使用东南西北、时钟方向
- 禁止使用Markdown、表格、列表、加粗
- 输出3-4个自然段，段间空行分隔
- 聚焦空间突变点和风险
- 最后50米重点描述触觉引导`;

  const userPrompt = `路线数据：
总距离：700米
关键节点：
1. 100米处 - 稍向左转上天桥，两段连续向上台阶
2. 600米处 - 直行横过路口，无盲道、机非混行
3. 650米处 - 稍向右转到达终点，无导航覆盖

请生成行前播报文案。`;

  const startTime = Date.now();
  try {
    const result = await llmClient.generateContent(
      userPrompt,
      [],
      {
        modelType: 'text',
        temperature: 0.1,
        maxTokens: 800,
        systemPrompt: systemPrompt
      }
    );

    const elapsed = Date.now() - startTime;

    if (result.success) {
      console.log('✅ 文本模型测试成功');
      console.log('响应时间:', elapsed, 'ms');
      console.log('响应内容:\n', result.text);
      return { success: true, responseTime: elapsed, text: result.text };
    } else {
      console.log('❌ 文本模型测试失败:', result.error);
      return { success: false, error: result.error };
    }
  } catch (error) {
    console.log('❌ 文本模型测试异常:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * 质量检查
 */
function qualityCheck(text) {
  console.log('\n--- 质量检查 ---');
  const checks = {
    hasMarkdown: /[#*|`\-\[\]]/.test(text),
    hasClockDirection: /\d+点.*方向|点钟方向/.test(text),
    hasCardinalDirection: /东|南|西|北/.test(text),
    paragraphs: text.split(/\n\n/).filter(p => p.trim().length > 10)
  };

  console.log('Markdown符号:', checks.hasMarkdown ? '❌ 存在' : '✅ 无');
  console.log('时钟方向:', checks.hasClockDirection ? '❌ 存在' : '✅ 无');
  console.log('绝对方位词:', checks.hasCardinalDirection ? '⚠️ 存在' : '✅ 无');
  console.log('段落数:', checks.paragraphs.length, checks.paragraphs.length >= 3 ? '✅' : '❌');

  return !checks.hasMarkdown && !checks.hasClockDirection && checks.paragraphs.length >= 3;
}

/**
 * 运行所有测试
 */
async function runTests() {
  console.log('========================================');
  console.log('固定模型配置测试');
  console.log('========================================');
  console.log('开始时间:', new Date().toISOString());

  const results = {
    vision: await testVisionModel(),
    text: await testTextModel()
  };

  console.log('\n========================================');
  console.log('测试结果汇总');
  console.log('========================================');
  console.log('视觉模型(从Agent):', results.vision.success ? '✅ 通过' : '❌ 失败',
    results.vision.skipped ? '(跳过)' : '');
  console.log('文本模型(主Agent):', results.text.success ? '✅ 通过' : '❌ 失败');

  if (results.text.success) {
    const passed = qualityCheck(results.text.text);
    console.log('\n总体质量:', passed ? '✅ 通过' : '⚠️ 需优化');
  }

  console.log('\n结束时间:', new Date().toISOString());
}

// 运行测试
runTests().catch(console.error);
