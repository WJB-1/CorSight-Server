/**
 * 推演播放器面板组件
 * 瞳心引航 - 展示推演结果文字与 TTS 播报控制
 *
 * 功能:
 * 1. 展示 route_summary 宏观数据
 * 2. 大字体高对比度文本展示
 * 3. TTS 播放控制 (播放/暂停/停止)
 * 4. 当前播放句子高亮
 */

import { ttsEngine } from '../utils/ttsEngine.js';

export class PreviewPlayer {
    constructor(containerId = 'preview-player') {
        this.container = null;
        this.containerId = containerId;
        this.data = null;
        this.currentSentenceIndex = -1;
        this.isVisible = false;

        // 绑定 TTS 回调
        ttsEngine.onSentenceStart = (index, sentence) => {
            this.currentSentenceIndex = index;
            this._highlightSentence(index);
        };

        ttsEngine.onSentenceEnd = (index, sentence) => {
            // 句子结束时的处理
        };

        ttsEngine.onPlaybackEnd = () => {
            this._updatePlayButton(false);
        };
    }

    /**
     * 初始化播放器面板
     */
    init() {
        this._createDOM();
        this._bindEvents();
    }

    /**
     * 创建 DOM 结构
     * @private
     */
    _createDOM() {
        // 检查是否已存在
        let container = document.getElementById(this.containerId);
        if (!container) {
            container = document.createElement('div');
            container.id = this.containerId;
            document.body.appendChild(container);
        }
        this.container = container;

        this.container.innerHTML = `
      <div class="preview-player-overlay hidden" id="preview-player-overlay">
        <div class="preview-player-panel">
          <!-- 头部 - 标题和关闭按钮 -->
          <div class="preview-player-header">
            <h2 class="preview-title">👁️ 路线推演播报</h2>
            <button class="preview-close-btn" id="preview-close-btn" aria-label="关闭">✕</button>
          </div>
          
          <!-- 摘要数据区 -->
          <div class="preview-summary-bar" id="preview-summary-bar">
            <div class="summary-item">
              <span class="summary-label">📏 总距离</span>
              <span class="summary-value" id="summary-distance">--</span>
            </div>
            <div class="summary-item">
              <span class="summary-label">⏱️ 预计时间</span>
              <span class="summary-value" id="summary-duration">--</span>
            </div>
            <div class="summary-item">
              <span class="summary-label">🎯 关键节点</span>
              <span class="summary-value" id="summary-nodes">--</span>
            </div>
          </div>
          
          <!-- 文本阅读区 -->
          <div class="preview-text-container" id="preview-text-container">
            <div class="preview-text-content" id="preview-text-content">
              <!-- 文本将在这里动态渲染 -->
            </div>
          </div>
          
          <!-- 播放控制台 -->
          <div class="preview-controls">
            <button class="control-btn" id="preview-stop-btn" aria-label="停止">
              <span class="control-icon">⏹</span>
              <span class="control-label">停止</span>
            </button>
            <button class="control-btn primary" id="preview-play-btn" aria-label="播放">
              <span class="control-icon">▶</span>
              <span class="control-label">播放</span>
            </button>
            <button class="control-btn" id="preview-pause-btn" aria-label="暂停">
              <span class="control-icon">⏸</span>
              <span class="control-label">暂停</span>
            </button>
          </div>
        </div>
      </div>
    `;

        // 添加无障碍属性
        this.container.setAttribute('role', 'dialog');
        this.container.setAttribute('aria-modal', 'true');
        this.container.setAttribute('aria-labelledby', 'preview-title');
    }

    /**
     * 绑定事件
     * @private
     */
    _bindEvents() {
        // 关闭按钮
        const closeBtn = this.container.querySelector('#preview-close-btn');
        closeBtn.addEventListener('click', () => this.hide());

        // 播放按钮
        const playBtn = this.container.querySelector('#preview-play-btn');
        playBtn.addEventListener('click', () => this._handlePlay());

        // 暂停按钮
        const pauseBtn = this.container.querySelector('#preview-pause-btn');
        pauseBtn.addEventListener('click', () => this._handlePause());

        // 停止按钮
        const stopBtn = this.container.querySelector('#preview-stop-btn');
        stopBtn.addEventListener('click', () => this._handleStop());

        // 点击遮罩关闭
        const overlay = this.container.querySelector('#preview-player-overlay');
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                this.hide();
            }
        });

        // ESC 键关闭
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isVisible) {
                this.hide();
            }
        });
    }

    /**
     * 显示播放器并加载数据
     * @param {Object} data - 后端返回的数据
     * @param {string} data.text - 播报文本
     * @param {Object} data.route_summary - 路线摘要
     * @param {Array} data.key_nodes - 关键节点
     */
    show(data) {
        this.data = data;
        this.isVisible = true;

        // 显示面板
        const overlay = this.container.querySelector('#preview-player-overlay');
        overlay.classList.remove('hidden');

        // 填充数据
        this._renderSummary(data.route_summary);
        this._renderText(data.text);

        // 聚焦到面板（无障碍）
        setTimeout(() => {
            this.container.querySelector('.preview-player-panel').focus();
        }, 100);
    }

    /**
     * 隐藏播放器
     */
    hide() {
        this.isVisible = false;
        this._handleStop(); // 停止播放

        const overlay = this.container.querySelector('#preview-player-overlay');
        overlay.classList.add('hidden');
    }

    /**
     * 渲染摘要数据
     * @private
     */
    _renderSummary(summary) {
        if (!summary) return;

        const distanceEl = this.container.querySelector('#summary-distance');
        const durationEl = this.container.querySelector('#summary-duration');
        const nodesEl = this.container.querySelector('#summary-nodes');

        if (distanceEl) distanceEl.textContent = summary.total_distance || '--';
        if (durationEl) durationEl.textContent = summary.duration_estimate || '--';
        if (nodesEl) {
            const count = summary.filtered_nodes_count || 0;
            const total = summary.original_steps_count || 0;
            nodesEl.textContent = `${count}/${total}`;
        }
    }

    /**
     * 渲染文本内容 - 分段展示，支持高亮
     * @private
     */
    _renderText(text) {
        const container = this.container.querySelector('#preview-text-content');
        if (!container || !text) return;

        // 智能分段 - 按换行和句号分割
        const paragraphs = text.split('\n').filter(p => p.trim());

        let html = '';
        let sentenceIndex = 0;

        for (const paragraph of paragraphs) {
            // 检查是否是标题行（以特定标点或关键词开头）
            const isHeading = /^(全程|概览|注意|警告|第|一、|二、|三、)/.test(paragraph);

            if (isHeading) {
                html += `<h3 class="text-heading" data-index="${sentenceIndex}">${this._escapeHtml(paragraph)}</h3>`;
                sentenceIndex++;
            } else {
                // 按句子分割
                const sentences = paragraph.split(/([。！？.!?]+)/).filter(s => s.trim());

                html += '<p class="text-paragraph">';
                for (let i = 0; i < sentences.length; i++) {
                    const sentence = sentences[i].trim();
                    if (!sentence) continue;

                    // 检查是否是标点
                    if (/^[。！？.!?]+$/.test(sentence)) {
                        html += sentence;
                    } else {
                        html += `<span class="text-sentence" data-index="${sentenceIndex}">${this._escapeHtml(sentence)}</span>`;
                        sentenceIndex++;
                    }
                }
                html += '</p>';
            }
        }

        container.innerHTML = html;
    }

    /**
     * HTML 转义
     * @private
     */
    _escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * 高亮当前播放的句子
     * @private
     */
    _highlightSentence(index) {
        // 移除之前的高亮
        const prevHighlighted = this.container.querySelectorAll('.text-sentence.active, .text-heading.active');
        prevHighlighted.forEach(el => el.classList.remove('active'));

        // 高亮当前句子
        const currentEl = this.container.querySelector(`[data-index="${index}"]`);
        if (currentEl) {
            currentEl.classList.add('active');

            // 滚动到可视区域
            currentEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }

    /**
     * 处理播放按钮
     * @private
     */
    _handlePlay() {
        if (!this.data || !this.data.text) return;

        const state = ttsEngine.getState();

        if (state.isPaused) {
            // 从暂停恢复
            ttsEngine.resume();
            this._updatePlayButton(true);
        } else if (!state.isPlaying) {
            // 开始新播放
            ttsEngine.play(this.data.text, {
                rate: 0.9,  // 稍慢，给视障者反应时间
                onSentenceStart: (index, sentence) => {
                    this.currentSentenceIndex = index;
                    this._highlightSentence(index);
                },
                onPlaybackEnd: () => {
                    this._updatePlayButton(false);
                }
            });
            this._updatePlayButton(true);
        }
    }

    /**
     * 处理暂停按钮
     * @private
     */
    _handlePause() {
        ttsEngine.pause();
        this._updatePlayButton(false);
    }

    /**
     * 处理停止按钮
     * @private
     */
    _handleStop() {
        ttsEngine.stop();
        this._updatePlayButton(false);
        this.currentSentenceIndex = -1;

        // 移除高亮
        const highlighted = this.container.querySelectorAll('.text-sentence.active, .text-heading.active');
        highlighted.forEach(el => el.classList.remove('active'));
    }

    /**
     * 更新播放按钮状态
     * @private
     */
    _updatePlayButton(isPlaying) {
        const playBtn = this.container.querySelector('#preview-play-btn');
        const icon = playBtn.querySelector('.control-icon');
        const label = playBtn.querySelector('.control-label');

        if (isPlaying) {
            icon.textContent = '▶';
            label.textContent = '播放中';
            playBtn.classList.add('playing');
        } else {
            icon.textContent = '▶';
            label.textContent = '播放';
            playBtn.classList.remove('playing');
        }
    }

    /**
     * 设置当前播放节点（用于地图联动）
     * @param {number} nodeIndex - 节点索引
     */
    setCurrentNode(nodeIndex) {
        // 可以在这里添加节点高亮逻辑
        console.log('[PreviewPlayer] 当前节点:', nodeIndex);
    }

    /**
     * 销毁播放器
     */
    destroy() {
        this._handleStop();
        if (this.container) {
            this.container.remove();
        }
    }
}

export default PreviewPlayer;
