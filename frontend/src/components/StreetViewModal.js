/**
 * 街景弹窗组件
 * 展示采样点的 8 方位街景图片和场景描述
 */

export class StreetViewModal {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.currentPoint = null;
    this.currentImageIndex = 0;
    this.images = {};
    this.init();
  }

  /**
   * 初始化弹窗
   */
  init() {
    this.render();
    this.bindEvents();
  }

  /**
   * 渲染弹窗 HTML 结构
   */
  render() {
    this.container.innerHTML = `
      <div class="modal-content street-view-modal">
        <div class="modal-header">
          <h3>📸 街景采样点</h3>
          <button class="modal-close" id="street-view-close">&times;</button>
        </div>
        
        <div class="modal-body">
          <!-- 场景描述 -->
          <div class="scene-description" id="scene-description">
            加载中...
          </div>
          
          <!-- 图片展示区域 -->
          <div class="image-viewer">
            <div class="main-image-container">
              <img id="main-image" src="" alt="街景图片" />
              <div class="image-direction" id="image-direction">北</div>
            </div>
            
            <!-- 8方位缩略图网格 -->
            <div class="thumbnail-grid">
              ${this.renderThumbnailGrid()}
            </div>
          </div>
          
          <!-- 点位信息 -->
          <div class="point-info">
            <div class="info-item">
              <span class="info-label">点位 ID:</span>
              <span class="info-value" id="point-id">-</span>
            </div>
            <div class="info-item">
              <span class="info-label">坐标:</span>
              <span class="info-value" id="point-coordinates">-</span>
            </div>
            <div class="info-item">
              <span class="info-label">距离:</span>
              <span class="info-value" id="point-distance">-</span>
            </div>
          </div>
        </div>
      </div>
    `;

    this.elements = {
      closeBtn: this.container.querySelector('#street-view-close'),
      sceneDescription: this.container.querySelector('#scene-description'),
      mainImage: this.container.querySelector('#main-image'),
      imageDirection: this.container.querySelector('#image-direction'),
      pointId: this.container.querySelector('#point-id'),
      pointCoordinates: this.container.querySelector('#point-coordinates'),
      pointDistance: this.container.querySelector('#point-distance'),
      thumbnails: this.container.querySelectorAll('.thumbnail-item')
    };
  }

  /**
   * 渲染缩略图网格
   */
  renderThumbnailGrid() {
    const directions = [
      { key: 'N', label: '北', icon: '⬆️' },
      { key: 'NE', label: '东北', icon: '↗️' },
      { key: 'E', label: '东', icon: '➡️' },
      { key: 'SE', label: '东南', icon: '↘️' },
      { key: 'S', label: '南', icon: '⬇️' },
      { key: 'SW', label: '西南', icon: '↙️' },
      { key: 'W', label: '西', icon: '⬅️' },
      { key: 'NW', label: '西北', icon: '↖️' }
    ];

    return directions.map(dir => `
      <div class="thumbnail-item" data-direction="${dir.key}" title="${dir.label}">
        <div class="thumbnail-placeholder">
          <span class="thumbnail-icon">${dir.icon}</span>
          <span class="thumbnail-label">${dir.key}</span>
        </div>
      </div>
    `).join('');
  }

  /**
   * 绑定事件
   */
  bindEvents() {
    // 关闭按钮
    this.elements.closeBtn.addEventListener('click', () => {
      this.close();
    });

    // 点击遮罩关闭
    this.container.addEventListener('click', (e) => {
      if (e.target === this.container) {
        this.close();
      }
    });

    // ESC 键关闭
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.container.classList.contains('active')) {
        this.close();
      }
    });

    // 缩略图点击
    this.container.querySelectorAll('.thumbnail-item').forEach(item => {
      item.addEventListener('click', () => {
        const direction = item.dataset.direction;
        this.showImage(direction);
      });
    });
  }

  /**
   * 打开弹窗并显示点位数据
   */
  open(point) {
    this.currentPoint = point;
    this.images = point.images || {};
    
    // 更新信息
    this.elements.sceneDescription.textContent = point.scene_description || '暂无场景描述';
    this.elements.pointId.textContent = point.point_id || '-';
    this.elements.pointCoordinates.textContent = 
      `${point.location?.latitude?.toFixed(6)}, ${point.location?.longitude?.toFixed(6)}`;
    this.elements.pointDistance.textContent = 
      point.distance_meters ? `${point.distance_meters} 米` : '-';

    // 更新缩略图状态
    this.updateThumbnails();

    // 显示第一张可用的图片
    const availableDirections = Object.keys(this.images).filter(key => this.images[key]);
    if (availableDirections.length > 0) {
      this.showImage(availableDirections[0]);
    } else {
      this.showPlaceholder();
    }

    // 显示弹窗
    this.container.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  /**
   * 关闭弹窗
   */
  close() {
    this.container.classList.remove('active');
    document.body.style.overflow = '';
    this.currentPoint = null;
  }

  /**
   * 显示指定方向的图片
   */
  showImage(direction) {
    const imageUrl = this.images[direction];
    if (!imageUrl) return;

    this.currentImageIndex = direction;
    this.elements.mainImage.src = imageUrl;
    this.elements.imageDirection.textContent = this.getDirectionLabel(direction);

    // 更新缩略图选中状态
    this.container.querySelectorAll('.thumbnail-item').forEach(item => {
      item.classList.toggle('active', item.dataset.direction === direction);
    });
  }

  /**
   * 显示占位图
   */
  showPlaceholder() {
    this.elements.mainImage.src = '';
    this.elements.mainImage.alt = '暂无图片';
    this.elements.imageDirection.textContent = '无图片';
  }

  /**
   * 更新缩略图状态（是否有图片）
   */
  updateThumbnails() {
    this.container.querySelectorAll('.thumbnail-item').forEach(item => {
      const direction = item.dataset.direction;
      const hasImage = this.images[direction];
      item.classList.toggle('has-image', !!hasImage);
      
      // 如果有图片 URL，更新缩略图背景
      if (hasImage) {
        const placeholder = item.querySelector('.thumbnail-placeholder');
        placeholder.style.backgroundImage = `url(${hasImage})`;
        placeholder.style.backgroundSize = 'cover';
      }
    });
  }

  /**
   * 获取方向中文标签
   */
  getDirectionLabel(direction) {
    const labels = {
      'N': '北',
      'NE': '东北',
      'E': '东',
      'SE': '东南',
      'S': '南',
      'SW': '西南',
      'W': '西',
      'NW': '西北'
    };
    return labels[direction] || direction;
  }
}

export default StreetViewModal;