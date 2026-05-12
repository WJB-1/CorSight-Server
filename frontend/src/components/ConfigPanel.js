/**
 * LLM 配置面板组件 (简化版)
 *
 * 模型已后端固定，前端仅展示当前配置状态：
 * - 主Agent: DeepSeek deepseek-v4-pro (播报生成)
 * - 从Agent: 阿里云百炼 qwen-vl-max (街景分析)
 */

import { getActiveLLMConfig, getEnvInfo } from '../services/api.js';

export class ConfigPanel {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.init();
  }

  async init() {
    this.render();
    await this.loadData();
  }

  render() {
    this.container.innerHTML = `
      <div class="config-panel">
        <h3>🤖 LLM 配置</h3>

        <div class="config-status" id="config-status">
          <span class="status-indicator"></span>
          <span class="status-text">加载中...</span>
        </div>

        <div class="env-status" id="env-status" style="display: none;">
          <div class="env-status-header">
            <span>📋 API Key 配置状态</span>
            <span class="env-status-toggle">▼</span>
          </div>
          <div class="env-status-content" id="env-status-content"></div>
        </div>

        <div class="fixed-models-info">
          <div class="model-card primary">
            <div class="model-role">📝 主 Agent</div>
            <div class="model-name">deepseek-v4-pro</div>
            <div class="model-provider">DeepSeek</div>
            <div class="model-desc">负责导航播报文案生成（Thinking 模式）</div>
          </div>
          <div class="model-card secondary">
            <div class="model-role">🖼️ 从 Agent</div>
            <div class="model-name">qwen-vl-max</div>
            <div class="model-provider">阿里云百炼</div>
            <div class="model-desc">负责街景图片分析（多模态）</div>
          </div>
        </div>

        <div id="config-message" class="config-message"></div>
      </div>
    `;

    this.elements = {
      envStatus: this.container.querySelector('#env-status'),
      envStatusContent: this.container.querySelector('#env-status-content'),
      statusIndicator: this.container.querySelector('#config-status'),
      messageContainer: this.container.querySelector('#config-message')
    };
  }

  async loadData() {
    try {
      const [config, envInfo] = await Promise.all([
        getActiveLLMConfig(),
        getEnvInfo()
      ]);
      this.updateStatusUI(config);
      this.renderEnvStatus(envInfo.data);
    } catch (error) {
      console.warn('加载配置失败:', error);
      this.updateStatusUI(null);
    }
  }

  updateStatusUI(config) {
    const indicator = this.elements.statusIndicator.querySelector('.status-indicator');
    const text = this.elements.statusIndicator.querySelector('.status-text');

    if (config?.active_provider) {
      indicator.className = 'status-indicator status-active';
      text.textContent = '服务正常';
    } else {
      indicator.className = 'status-indicator status-inactive';
      text.textContent = '未配置 LLM';
    }
  }

  renderEnvStatus(envInfo) {
    if (!envInfo?.env_variables) {
      this.elements.envStatus.style.display = 'none';
      return;
    }

    const envVars = envInfo.env_variables;
    const configured = envInfo.configured_count || 0;

    let html = '<div class="env-vars-list">';
    for (const [envVar, info] of Object.entries(envVars)) {
      const statusClass = info.configured ? 'configured' : 'not-configured';
      const statusIcon = info.configured ? '✅' : '❌';
      html += `
        <div class="env-var-item ${statusClass}">
          <span class="env-var-icon">${statusIcon}</span>
          <span class="env-var-name">${envVar}</span>
          <span class="env-var-provider">(${info.provider})</span>
        </div>
      `;
    }
    html += '</div>';

    if (configured === 0) {
      html += `<div class="env-warning">⚠️ 未配置任何 API Key</div>`;
    }

    this.elements.envStatusContent.innerHTML = html;
    this.elements.envStatus.style.display = 'block';

    this.elements.envStatus.querySelector('.env-status-header')
      .addEventListener('click', () => {
        this.elements.envStatus.classList.toggle('collapsed');
      });
  }
}
