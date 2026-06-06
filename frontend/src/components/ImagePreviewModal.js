/**
 * 图片全屏预览弹窗组件
 * 点击缩略图后弹出，展示原图
 */

export class ImagePreviewModal {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.currentImageUrl = null;
    this.init();
  }

  init() {
    this.render();
    this.bindEvents();
  }

  render() {
    this.container.innerHTML = `
      <div class="modal-content image-preview-modal">
        <div class="image-preview-header">
          <span class="image-preview-title">原图预览</span>
          <button class="modal-close" id="image-preview-close">&times;</button>
        </div>
        <div class="image-preview-body">
          <img id="image-preview-img" src="" alt="原图" />
        </div>
      </div>
    `;

    this.elements = {
      closeBtn: this.container.querySelector('#image-preview-close'),
      img: this.container.querySelector('#image-preview-img')
    };
  }

  bindEvents() {
    this.elements.closeBtn.addEventListener('click', () => this.close());

    this.container.addEventListener('click', (e) => {
      if (e.target === this.container) {
        this.close();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.container.classList.contains('active')) {
        this.close();
      }
    });
  }

  open(imageUrl) {
    if (!imageUrl) return;
    this.currentImageUrl = imageUrl;
    this.elements.img.src = imageUrl;
    this.container.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  close() {
    this.container.classList.remove('active');
    document.body.style.overflow = '';
    this.currentImageUrl = null;
    this.elements.img.src = '';
  }
}

export default ImagePreviewModal;
