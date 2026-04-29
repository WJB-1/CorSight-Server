/**
 * TTS 语音合成引擎
 * 瞳心引航 - 将文本转化为有停顿、有节奏的专业播报
 *
 * 核心特性:
 * 1. 智能断句 - 按换行符或句号拆分长文本
 * 2. 强制停顿 - 每句话之间停顿 0.8-1 秒，模拟真人语速
 * 3. 中文音色 - 自动选择中文女声/男声
 * 4. 队列播放 - 支持播放、暂停、恢复、停止控制
 */

export class TTSEngine {
    constructor() {
        this.synth = window.speechSynthesis;
        this.sentences = [];        // 句子队列
        this.currentIndex = 0;      // 当前播放索引
        this.isPlaying = false;
        this.isPaused = false;
        this.pauseResumePoint = 0;  // 暂停时的位置
        this.onSentenceStart = null;  // 句子开始回调
        this.onSentenceEnd = null;    // 句子结束回调
        this.onPlaybackEnd = null;    // 全部播放结束回调

        // 初始化中文音色
        this.chineseVoice = null;
        this._initVoice();
    }

    /**
     * 初始化并选择中文音色
     */
    _initVoice() {
        const selectChineseVoice = () => {
            const voices = this.synth.getVoices();

            // 优先选择中文女声 (zh-CN)
            this.chineseVoice = voices.find(v =>
                v.lang.includes('zh-CN') &&
                (v.name.includes('Female') || v.name.includes('女') || v.name.includes('Xiaoxiao') || v.name.includes('Xiaoyi'))
            );

            // 备选: 任何中文声音
            if (!this.chineseVoice) {
                this.chineseVoice = voices.find(v =>
                    v.lang.includes('zh') || v.lang.includes('zh-CN')
                );
            }

            // 最后备选: 使用默认
            if (!this.chineseVoice && voices.length > 0) {
                this.chineseVoice = voices[0];
            }

            if (this.chineseVoice) {
                console.log('[TTSEngine] 已选择音色:', this.chineseVoice.name, this.chineseVoice.lang);
            }
        };

        // 某些浏览器需要等待 voiceschanged 事件
        if (this.synth.getVoices().length > 0) {
            selectChineseVoice();
        } else {
            this.synth.addEventListener('voiceschanged', selectChineseVoice);
        }
    }

    /**
     * 智能断句 - 将长文本拆分成句子数组
     * @param {string} text - 原始文本
     * @returns {string[]} 句子数组
     */
    _splitIntoSentences(text) {
        if (!text || typeof text !== 'string') return [];

        // 先按换行符分割，再按句号、问号、感叹号分割
        const paragraphs = text.split('\n').filter(p => p.trim());
        const sentences = [];

        for (const paragraph of paragraphs) {
            // 按标点符号分割，但保留标点
            const parts = paragraph.split(/([。！？.!?]+)/);
            let currentSentence = '';

            for (let i = 0; i < parts.length; i++) {
                currentSentence += parts[i];

                // 如果遇到标点，完成当前句子
                if (/[。！？.!?]+/.test(parts[i]) || i === parts.length - 1) {
                    const trimmed = currentSentence.trim();
                    if (trimmed.length > 0) {
                        sentences.push(trimmed);
                    }
                    currentSentence = '';
                }
            }
        }

        // 过滤空句子
        return sentences.filter(s => s.length > 0);
    }

    /**
     * 播放文本
     * @param {string} text - 要播放的文本
     * @param {Object} options - 播放选项
     * @param {number} options.rate - 语速 (0.1-10, 默认 0.9，较慢速适合视障用户)
     * @param {number} options.pitch - 音调 (0-2, 默认 1)
     * @param {number} options.volume - 音量 (0-1, 默认 1)
     * @param {Function} options.onSentenceStart - 句子开始回调
     * @param {Function} options.onSentenceEnd - 句子结束回调
     * @param {Function} options.onPlaybackEnd - 全部播放结束回调
     */
    play(text, options = {}) {
        // 停止之前的播放
        this.stop();

        // 断句
        this.sentences = this._splitIntoSentences(text);

        if (this.sentences.length === 0) {
            console.warn('[TTSEngine] 没有有效的句子可以播放');
            return;
        }

        console.log('[TTSEngine] 开始播放，共', this.sentences.length, '句');
        console.log('[TTSEngine] 句子列表:', this.sentences);

        this.currentIndex = 0;
        this.isPlaying = true;
        this.isPaused = false;

        // 设置回调
        this.onSentenceStart = options.onSentenceStart || null;
        this.onSentenceEnd = options.onSentenceEnd || null;
        this.onPlaybackEnd = options.onPlaybackEnd || null;

        // 开始播放队列
        this._playNext(options);
    }

    /**
     * 播放队列中的下一句
     * @private
     */
    _playNext(options = {}) {
        if (!this.isPlaying || this.isPaused) return;
        if (this.currentIndex >= this.sentences.length) {
            // 全部播放完成
            this.isPlaying = false;
            console.log('[TTSEngine] 播放完成');
            if (this.onPlaybackEnd) {
                this.onPlaybackEnd();
            }
            return;
        }

        const sentence = this.sentences[this.currentIndex];
        const utterance = new SpeechSynthesisUtterance(sentence);

        // 设置音色和参数
        if (this.chineseVoice) {
            utterance.voice = this.chineseVoice;
        }
        utterance.lang = 'zh-CN';
        utterance.rate = options.rate || 0.9;     // 稍慢，给视障者反应时间
        utterance.pitch = options.pitch || 1;
        utterance.volume = options.volume || 1;

        // 句子开始
        utterance.onstart = () => {
            console.log(`[TTSEngine] 播放第 ${this.currentIndex + 1}/${this.sentences.length} 句:`, sentence.substring(0, 30) + '...');
            if (this.onSentenceStart) {
                this.onSentenceStart(this.currentIndex, sentence);
            }
        };

        // 句子结束 - 关键：强制停顿 0.8-1 秒后再播放下一句
        utterance.onend = () => {
            if (this.onSentenceEnd) {
                this.onSentenceEnd(this.currentIndex, sentence);
            }

            this.currentIndex++;

            if (this.currentIndex < this.sentences.length && this.isPlaying && !this.isPaused) {
                // 强制停顿 0.8-1 秒 - 这是核心要求！
                const pauseDuration = 800 + Math.random() * 200; // 800-1000ms
                console.log(`[TTSEngine] 停顿 ${pauseDuration}ms`);

                setTimeout(() => {
                    if (this.isPlaying && !this.isPaused) {
                        this._playNext(options);
                    }
                }, pauseDuration);
            } else if (this.currentIndex >= this.sentences.length) {
                // 全部完成
                this.isPlaying = false;
                console.log('[TTSEngine] 播放完成');
                if (this.onPlaybackEnd) {
                    this.onPlaybackEnd();
                }
            }
        };

        // 错误处理
        utterance.onerror = (event) => {
            console.error('[TTSEngine] 播放错误:', event.error);
            // 继续播放下一句
            this.currentIndex++;
            if (this.currentIndex < this.sentences.length && this.isPlaying) {
                setTimeout(() => this._playNext(options), 500);
            }
        };

        this.synth.speak(utterance);
    }

    /**
     * 暂停播放
     */
    pause() {
        if (this.isPlaying && !this.isPaused) {
            this.isPaused = true;
            this.pauseResumePoint = this.currentIndex;
            this.synth.pause();
            console.log('[TTSEngine] 已暂停');
        }
    }

    /**
     * 恢复播放
     */
    resume() {
        if (this.isPlaying && this.isPaused) {
            this.isPaused = false;
            this.synth.resume();
            console.log('[TTSEngine] 已恢复');
        }
    }

    /**
     * 停止播放
     */
    stop() {
        this.isPlaying = false;
        this.isPaused = false;
        this.currentIndex = 0;
        this.synth.cancel();
        console.log('[TTSEngine] 已停止');
    }

    /**
     * 获取当前播放状态
     */
    getState() {
        return {
            isPlaying: this.isPlaying,
            isPaused: this.isPaused,
            currentIndex: this.currentIndex,
            totalSentences: this.sentences.length,
            progress: this.sentences.length > 0
                ? Math.round((this.currentIndex / this.sentences.length) * 100)
                : 0
        };
    }

    /**
     * 获取当前播放的句子
     */
    getCurrentSentence() {
        if (this.currentIndex >= 0 && this.currentIndex < this.sentences.length) {
            return {
                index: this.currentIndex,
                text: this.sentences[this.currentIndex],
                total: this.sentences.length
            };
        }
        return null;
    }

    /**
     * 跳转到指定句子
     * @param {number} index - 句子索引
     */
    jumpTo(index) {
        if (index >= 0 && index < this.sentences.length) {
            this.stop();
            this.currentIndex = index;
            this.isPlaying = true;
            this.isPaused = false;
            this._playNext();
        }
    }
}

// 导出单例实例
export const ttsEngine = new TTSEngine();

export default TTSEngine;
