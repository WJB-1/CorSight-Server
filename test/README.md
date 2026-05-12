# 测试目录

## 当前结构

```
test/
├── README.md              # 本文件
├── test.png               # 测试用图片
├── reports/               # 测试报告输出
└── archive/               # 归档的历史测试脚本
    ├── debug/             # 调试脚本（HTML/JS）
    ├── legacy/            # 旧数据修复/清理脚本
    ├── model-tests/       # 模型探测测试（各平台API）
    └── module-tests/      # 模块兼容性测试
```

## 活跃测试

后端活跃测试在 `backend/test/` 目录：

```
backend/test/
├── .env.test              # 测试密钥（gitignore保护）
├── .gitignore
├── legacy-probe-test.js   # 旧探测脚本（归档）
└── test-fixed-models.js   # 当前模型测试脚本
```

运行方式：

```bash
cd backend/test
node test-fixed-models.js
```

## 固定模型配置

| 角色 | 模型 | Provider |
|------|------|----------|
| 主Agent（播报生成） | deepseek-v4-pro + thinking | DeepSeek |
| 从Agent（街景分析） | qwen-vl-max | 阿里云百炼 |
