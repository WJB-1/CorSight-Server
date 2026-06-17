# 每晚项目自检 Skill

## 触发条件
- 每天晚上自动执行
- 或用户手动触发 `/nightly-audit`

## 执行流程

### Phase 1: 项目结构检查 (5分钟)

#### 1.1 检查跨层调用
```
检查维度：
- Controller 是否直接调用 Model（应通过 Service）
- Service 是否反向依赖 Controller
- lib 是否依赖上层模块

工具：grep + AST 分析
输出：违规列表
```

#### 1.2 检查依赖方向
```
合法依赖方向：
routes → controllers → services → models
                  ↘ lib（纯工具）

违规依赖：
- models → services
- lib → services/controllers
```

#### 1.3 检查文件组织
```
- services 层文件数是否过多（>15 个建议分组）
- 是否有重复功能的文件
- 是否有孤立文件（未被引用）
```

---

### Phase 2: 耦合度分析 (5分钟)

#### 2.1 识别高复用代码
```
标准：
- 纯函数，无副作用
- 被 3 个以上模块引用
- 功能独立，边界清晰

示例：
- 坐标转换 → 全局工具
- 几何计算 → 全局工具
- ID 生成 → 全局工具
```

#### 2.2 识别可抽离模块
```
标准：
- 同一领域多个文件（如 vlmService, vlmParser, vlmTaskBuilder）
- 功能内聚，可独立成子模块
```

---

### Phase 3: 潜在 Bug 检查 (10分钟)

#### 3.1 异步错误处理
```bash
# 检查未包裹 try-catch 的 async 函数
grep -r "async.*{" --include="*.js" | grep -v "try {"

# 检查未处理的 Promise
grep -r "\.then(" --include="*.js" | grep -v "\.catch"
```

#### 3.2 空指针风险
```bash
# 检查链式访问未校验
grep -r "\.data\." --include="*.js" | grep -v "?."
grep -r "\[0\]" --include="*.js" | grep -v "?."
```

#### 3.3 资源泄漏
```bash
# 检查事件监听器是否清理
grep -r "addEventListener" --include="*.js" | grep -v "removeEventListener"

# 检查定时器是否清理
grep -r "setInterval\|setTimeout" --include="*.js" | grep -v "clearInterval\|clearTimeout"
```

#### 3.4 前端特有问题
```bash
# 检查 fetch 未检查 res.ok
grep -r "fetch(" --include="*.js" | grep -v "res.ok"

# 检查 map 实例是否销毁
grep -r "new maplibregl" --include="*.js" | grep -v "remove()"
```

---

### Phase 4: 生成报告 (5分钟)

#### 4.1 报告目录结构
```
reports/
├── YYYY-MM-DD_项目自检报告.md    # 检查结果
├── YYYY-MM-DD_修复报告.md        # 修复记录（如有）
└── README.md                      # 报告索引
```

#### 4.2 报告模板
```markdown
# CorSight-Server 项目自检报告

**检查时间**: YYYY-MM-DD
**检查范围**: 前端 + 后端
**检查维度**: 结构严谨性、耦合度、潜在Bug

## 一、项目结构概览
[目录树]

## 二、结构严谨性检查
### 2.1 跨层调用问题
[违规列表]

### 2.2 依赖方向检查
[依赖矩阵]

## 三、耦合度分析
### 3.1 高复用价值代码
[建议抽离列表]

### 3.2 模块化建议
[分组建议]

## 四、潜在 Bug 检查
### 4.1 高优先级（可能导致崩溃）
[Bug 列表]

### 4.2 中优先级（影响可维护性）
[问题列表]

### 4.3 低优先级（代码质量）
[建议列表]

## 五、修复优先级
[优先级矩阵]

## 六、总结
[评分 + 改进建议]
```

---

### Phase 5: 自动修复 (10分钟)

#### 5.1 可自动修复的问题
```
✅ 添加缺失的 try-catch
✅ 添加资源清理逻辑
✅ 添加空值校验
✅ 统一错误处理模式
```

#### 5.2 需要人工确认的问题
```
⚠️ 架构重构（services 分组）
⚠️ 依赖注入改造
⚠️ 前端模块化重构
```

#### 5.3 修复后验证
```bash
# 语法检查
node --check backend/server.js
node --check frontend/src/*.js

# 依赖检查
cd backend && npm ls
cd frontend && npm ls
```

---

## 输出产物

### 1. 自检报告
- 路径: `reports/YYYY-MM-DD_项目自检报告.md`
- 内容: 完整检查结果 + 评分

### 2. 修复报告（如有修复）
- 路径: `reports/YYYY-MM-DD_修复报告.md`
- 内容: 修复清单 + 验证结果

### 3. 报告索引
- 路径: `reports/README.md`
- 内容: 历史报告链接 + 趋势分析

---

## 配置项

### 检查阈值
```javascript
const AUDIT_CONFIG = {
  // 文件数阈值
  maxServicesFiles: 15,      // services 层最大文件数
  maxControllerFiles: 10,    // controllers 层最大文件数

  // 注释覆盖率
  minCommentRate: 0.6,       // 最低注释覆盖率 60%

  // 复杂度
  maxFunctionLines: 50,      // 单函数最大行数
  maxCallDepth: 3,           // 最大调用深度
};
```

### 排除规则
```bash
# 不检查的目录
EXCLUDE_DIRS=(
  "node_modules"
  ".git"
  "dist"
  "test/archive"
)

# 不检查的文件
EXCLUDE_FILES=(
  "*.min.js"
  "*.bundle.js"
  "package-lock.json"
)
```

---

## 使用方式

### 自动执行
- 每天晚上 22:00 自动触发
- 通过 cron job 或 CI/CD 调度

### 手动执行
```bash
# 在 Claude Code 中触发
/nightly-audit

# 或指定检查范围
/nightly-audit --scope=backend
/nightly-audit --scope=frontend
/nightly-audit --fix=true
```

### 查看历史报告
```bash
# 列出所有报告
ls reports/

# 查看最新报告
cat reports/$(ls -t reports/*.md | head -1)
```

---

## 优化建议

### 短期（1-2 周）
1. ✅ 建立自动化检查脚本
2. ✅ 配置 CI/CD 集成
3. ✅ 设置报告归档策略

### 中期（1-2 月）
1. 📋 实施 services 层分组
2. 📋 统一依赖注入
3. 📋 补充单元测试

### 长期（3-6 月）
1. 🎯 建立代码质量门禁
2. 🎯 实施自动化重构
3. 🎯 建立性能监控

---

## 注意事项

1. **不要过度检查**: 聚焦高风险问题，避免报告疲劳
2. **自动修复需谨慎**: 涉及架构的修改需人工确认
3. **报告要简洁**: 突出关键问题，避免冗长
4. **持续改进**: 根据历史数据调整检查策略
