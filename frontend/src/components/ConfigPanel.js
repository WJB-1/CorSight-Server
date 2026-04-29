/**
 * LLM 配置面板组件 (优化版)
 *
 * 优化说明：
 * - API Key 不再从前端输入，改为从 .env 读取
 * - 分离视觉模型和文本模型选择
 * - 隐藏提供商细节，只展示模型名称
 * - 新增模型探测功能
 */

import { getActiveLLMConfig, saveLLMConfig, getClassifiedModels, saveVisionModel, saveTextModel, probeLLMModels, getEnvInfo } from '../services/api.js';

export class ConfigPanel {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.classifiedModels = { vision: [], text: [] };
    this.probeResults = [];
    this.currentConfig = null;
    this.envInfo = null;
    this.init();
  }

  /**
   * 初始化组件
   */
  async init() {
    this.render();
    await this.loadEnvInfo();
    await this.loadAvailableModels();
    await this.loadActiveConfig();
    this.bindEvents();
  }

  /**
   * 渲染面板 HTML
   */
  render() {
    this.container.innerHTML = `
      <div class="config-panel">
        <h3>🤖 LLM 配置</h3>
        
        <div class="config-status" id="config-status">
          <span class="status-indicator"></span>
          <span class="status-text">加载中...</span>
        </div>

        <!-- 环境变量配置状态 -->
        <div class="env-status" id="env-status" style="display: none;">
          <div class="env-status-header">
            <span>📋 API Key 配置状态</span>
            <span class="env-status-toggle">▼</span>
          </div>
          <div class="env-status-content" id="env-status-content"></div>
        </div>

        <form id="llm-config-form" class="config-form">
          <div class="form-group">
            <label for="vision-model-select">🖼️ 视觉模型（用于街景分析）</label>
            <select id="vision-model-select" required>
              <option value="">请选择视觉模型</option>
            </select>
            <small class="form-hint" id="vision-model-hint">用于分析街景图片，需要多模态支持</small>
          </div>

          <div class="form-group">
            <label for="text-model-select">📝 文本模型（用于播报生成）</label>
            <select id="text-model-select" required>
              <option value="">请选择文本模型</option>
            </select>
            <small class="form-hint" id="text-model-hint">用于生成导航播报文案</small>
          </div>

          <div class="form-actions">
            <button type="submit" class="btn btn-primary">保存配置</button>
            <button type="button" id="probe-btn" class="btn btn-secondary">
              🔍 探测模型可用性
            </button>
          </div>
        </form>

        <!-- 探测结果区域 -->
        <div id="probe-results" class="probe-results" style="display: none;">
          <div class="probe-header">
            <span>📊 模型探测结果</span>
            <span id="probe-summary"></span>
          </div>
          <div id="probe-list" class="probe-list"></div>
        </div>

        <div id="config-message" class="config-message"></div>
      </div>
    `;

    this.elements = {
      form: this.container.querySelector('#llm-config-form'),
      visionModelSelect: this.container.querySelector('#vision-model-select'),
      textModelSelect: this.container.querySelector('#text-model-select'),
      visionModelHint: this.container.querySelector('#vision-model-hint'),
      textModelHint: this.container.querySelector('#text-model-hint'),
      probeBtn: this.container.querySelector('#probe-btn'),
      envStatus: this.container.querySelector('#env-status'),
      envStatusContent: this.container.querySelector('#env-status-content'),
      probeResults: this.container.querySelector('#probe-results'),
      probeSummary: this.container.querySelector('#probe-summary'),
      probeList: this.container.querySelector('#probe-list'),
      statusIndicator: this.container.querySelector('#config-status'),
      messageContainer: this.container.querySelector('#config-message')
    };
  }

  /**
   * 加载环境变量配置信息
   */
  async loadEnvInfo() {
    try {
      const response = await getEnvInfo();
      this.envInfo = response.data;
      this.renderEnvStatus();
    } catch (error) {
      console.warn('加载环境信息失败:', error);
    }
  }

  /**
   * 渲染环境变量配置状态
   */
  renderEnvStatus() {
    if (!this.envInfo || !this.envInfo.env_variables) {
      this.elements.envStatus.style.display = 'none';
      return;
    }

    const envVars = this.envInfo.env_variables;
    const configured = this.envInfo.configured_count || 0;

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
      html += `
        <div class="env-warning">
          ⚠️ 未配置任何 API Key，请在后端 .env 文件中设置
        </div>
      `;
    }

    this.elements.envStatusContent.innerHTML = html;
    this.elements.envStatus.style.display = 'block';

    // 绑定折叠事件
    const header = this.elements.envStatus.querySelector('.env-status-header');
    header.addEventListener('click', () => {
      this.elements.envStatus.classList.toggle('collapsed');
    });
  }

  /**
   * 加载可用的模型列表（优化版：获取分类后的模型）
   */
  async loadAvailableModels() {
    try {
      const response = await getClassifiedModels();
      this.classifiedModels = response.data || { vision: [], text: [] };
      this.updateModelOptions();
    } catch (error) {
      console.error('加载模型列表失败:', error);
      this.showMessage('加载模型列表失败', 'error');
    }
  }

  /**
   * 更新模型选项（视觉 + 文本）
   */
  updateModelOptions() {
    const visionSelect = this.elements.visionModelSelect;
    const textSelect = this.elements.textModelSelect;

    // 更新视觉模型选项
    visionSelect.innerHTML = '<option value="">请选择视觉模型</option>';
    this.classifiedModels.vision.forEach(model => {
      const option = document.createElement('option');
      option.value = model.name;
      option.textContent = `${model.name} ${model.capabilities?.multimodal ? '🖼️' : ''}`;
      visionSelect.appendChild(option);
    });

    // 更新文本模型选项
    textSelect.innerHTML = '<option value="">请选择文本模型</option>';
    this.classifiedModels.text.forEach(model => {
      const option = document.createElement('option');
      option.value = model.name;
      option.textContent = model.name;
      textSelect.appendChild(option);
    });
  }

  /**
   * 加载当前激活的配置（优化版）
   */
  async loadActiveConfig() {
    try {
      const config = await getActiveLLMConfig();
      this.currentConfig = config;
      this.updateStatusUI(config);

      // 如果已有配置，填充表单
      if (config.current) {
        if (config.current.vision) {
          this.elements.visionModelSelect.value = config.current.vision.modelName;
        }
        if (config.current.text) {
          this.elements.textModelSelect.value = config.current.text.modelName;
        }
      } else if (config.active_model) {
        // 兼容旧配置：如果只有一个模型，同时设为视觉和文本模型
        this.elements.visionModelSelect.value = config.active_model;
        this.elements.textModelSelect.value = config.active_model;
      }
    } catch (error) {
      console.error('加载配置失败:', error);
      this.updateStatusUI(null);
    }
  }

  /**
   * 更新状态显示
   */
  updateStatusUI(config) {
    const indicator = this.elements.statusIndicator.querySelector('.status-indicator');
    const text = this.elements.statusIndicator.querySelector('.status-text');

    if (config && config.active_provider) {
      indicator.className = 'status-indicator status-active';
      text.textContent = `当前已激活: ${this.getProviderDisplayName(config.active_provider)} / ${config.active_model}`;
    } else {
      indicator.className = 'status-indicator status-inactive';
      text.textContent = '未配置 LLM';
    }
  }

  /**
   * 获取提供商显示名称
   */
  getProviderDisplayName(provider) {
    const names = {
      gemini: 'Google Gemini',
      deepseek: 'DeepSeek',
      bailian: '阿里云百炼',
      openai: 'OpenAI',
      anthropic: 'Anthropic Claude',
      azure: 'Azure OpenAI'
    };
    return names[provider] || provider;
  }


  /**
   * 检查模型是否可用（基于探测结果）
   */
  isModelAvailable(provider, modelName) {
    if (!this.probeResults || this.probeResults.length === 0) {
      return null; // 未知
    }

    const result = this.probeResults.find(
      r => r.provider === provider && r.model === modelName
    );

    if (!result) return null;
    return result.status === 'available';
  }

  /**
   * 执行模型探测
   */
  async probeModels() {
    this.elements.probeBtn.disabled = true;
    this.elements.probeBtn.textContent = '🔍 探测中...';
    this.showMessage('正在探测模型可用性，请稍候...', 'info');

    try {
      const response = await probeLLMModels();
      this.probeResults = response.data.results || [];
      const summary = response.data.summary || {};

      this.renderProbeResults(summary);

      this.showMessage(`探测完成: ${summary.available}/${summary.total} 个模型可用`, 'success');

    } catch (error) {
      console.error('模型探测失败:', error);
      this.showMessage('模型探测失败: ' + error.message, 'error');
    } finally {
      this.elements.probeBtn.disabled = false;
      this.elements.probeBtn.textContent = '🔍 探测模型可用性';
    }
  }

  /**
   * 渲染探测结果
   */
  renderProbeResults(summary) {
    if (!summary || !summary.by_provider) {
      this.elements.probeResults.style.display = 'none';
      return;
    }

    this.elements.probeSummary.textContent =
      `可用: ${summary.available}/${summary.total}`;

    let html = '';
    for (const [provider, models] of Object.entries(summary.by_provider)) {
      html += `<div class="probe-provider-section">`;
      html += `<div class="probe-provider-name">${this.getProviderDisplayName(provider)}</div>`;
      html += `<div class="probe-models">`;

      models.forEach(model => {
        const statusClass = model.status === 'available' ? 'available' :
          model.status === 'skipped' ? 'skipped' : 'failed';
        const statusIcon = model.status === 'available' ? '✅' :
          model.status === 'skipped' ? '⏭️' : '❌';

        html += `
          <div class="probe-model-item ${statusClass}" title="${model.error_message || ''}">
            <span class="probe-model-icon">${statusIcon}</span>
            <span class="probe-model-name">${model.model}</span>
            ${model.response_time_ms ? `<span class="probe-model-time">${model.response_time_ms}ms</span>` : ''}
          </div>
        `;
      });

      html += `</div></div>`;
    }

    this.elements.probeList.innerHTML = html;
    this.elements.probeResults.style.display = 'block';
  }

  /**
   * 绑定事件（优化版）
   */
  bindEvents() {
    // 探测按钮
    this.elements.probeBtn.addEventListener('click', () => {
      this.probeModels();
    });

    // 表单提交
    this.elements.form.addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.saveConfig();
    });
  }

  /**
   * 保存配置（优化版：分别保存视觉模型和文本模型）
   */
  async saveConfig() {
    const visionModel = this.elements.visionModelSelect.value;
    const textModel = this.elements.textModelSelect.value;

    if (!visionModel || !textModel) {
      this.showMessage('请选择视觉模型和文本模型', 'error');
      return;
    }

    try {
      // 优化：分别保存视觉模型和文本模型
      await Promise.all([
        saveVisionModel(visionModel),
        saveTextModel(textModel)
      ]);

      this.showMessage('配置已保存', 'success');
      await this.loadActiveConfig();

    } catch (error) {
      console.error('保存配置失败:', error);
      this.showMessage('保存失败: ' + (error.message || '未知错误'), 'error');
    }
  }

  /**
   * 显示消息
   */
  showMessage(message, type = 'info') {
    const container = this.elements.messageContainer;
    container.textContent = message;
    container.className = `config-message message-${type}`;

    // 3秒后自动清除
    setTimeout(() => {
      container.textContent = '';
      container.className = 'config-message';
    }, 5000);
  }
}
