/**
 * 账号管理页 - 占位
 */

export class AccountPage {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.render();
  }

  render() {
    this.container.innerHTML = `
      <div class="card">
        <div class="card-header">
          <span class="card-title">👤 用户列表</span>
          <button class="btn btn-primary">+ 新增用户</button>
        </div>
        <table class="table-placeholder">
          <thead>
            <tr>
              <th>用户名</th>
              <th>角色</th>
              <th>状态</th>
              <th>创建时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>admin</td>
              <td>管理员</td>
              <td><span style="color:var(--success);">● 正常</span></td>
              <td>2024-01-01</td>
              <td>
                <button class="btn btn-default" style="padding:4px 8px;font-size:12px;">编辑</button>
                <button class="btn btn-default" style="padding:4px 8px;font-size:12px;">禁用</button>
              </td>
            </tr>
            <tr>
              <td colspan="5" style="text-align:center;color:var(--text-muted);padding:24px;">
                ... 更多用户待加载 ...
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="card">
        <div class="card-header">
          <span class="card-title">🔐 权限配置（占位）</span>
        </div>
        <div class="placeholder-box">
          <div class="placeholder-icon">🛡️</div>
          <div class="placeholder-text">角色权限管理区域</div>
        </div>
      </div>
    `;
  }
}

export default AccountPage;
