#!/usr/bin/env python3
"""
测试 Gemini API 所有模型的多模态功能 (使用新版 google.genai)
使用 test.png 图片，测试每个模型的可用性和多模态响应能力
"""

import os
import sys
import time
from pathlib import Path

# 添加父目录到路径以便导入配置
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

def load_env():
    """手动加载 .env 文件"""
    env_path = os.path.join(os.path.dirname(__file__), "..", ".env")
    config = {}
    if os.path.exists(env_path):
        with open(env_path, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#'):
                    if '=' in line:
                        key, value = line.split('=', 1)
                        config[key.strip()] = value.strip().strip('"\'')
    return config

def get_all_gemini_models():
    """从 .env 文件注释中提取所有 Gemini 模型"""
    env_path = os.path.join(os.path.dirname(__file__), "..", ".env")
    models = []
    
    # 从配置中获取当前配置的模型
    config = load_env()
    if 'GEMINI_VISION_MODEL' in config:
        models.append(config['GEMINI_VISION_MODEL'])
    if 'GEMINI_TEXT_MODEL' in config:
        models.append(config['GEMINI_TEXT_MODEL'])
    
    # 从注释中提取其他模型
    if os.path.exists(env_path):
        with open(env_path, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                # 查找包含模型名称的行
                if 'gemini-' in line.lower():
                    # 提取可能的模型名称
                    import re
                    matches = re.findall(r'gemini-[a-z0-9\.\-]+', line.lower())
                    for match in matches:
                        if match not in models:
                            models.append(match)
    
    # 去重并排序
    unique_models = []
    for model in models:
        if model not in unique_models:
            unique_models.append(model)
    
    return unique_models

def test_model_with_image(model_name, api_key, image_path, prompt):
    """测试特定模型的多模态功能"""
    print(f"\n{'='*60}")
    print(f"测试模型: {model_name}")
    print(f"{'='*60}")
    
    start_time = time.time()
    
    try:
        # 导入新版 google.genai
        from google import genai
        from google.genai import types
        
        # 创建客户端
        client = genai.Client(api_key=api_key)
        
        # 检查图片是否存在
        if not os.path.exists(image_path):
            print(f"✗ 图片文件不存在: {image_path}")
            return False, "Image file not found"
        
        # 读取图片为 bytes
        with open(image_path, 'rb') as f:
            image_bytes = f.read()
        
        # 创建内容
        content = [
            types.Part.from_text(text=prompt),
            types.Part.from_bytes(data=image_bytes, mime_type="image/png")
        ]
        
        # 生成内容
        response = client.models.generate_content(
            model=model_name,
            contents=content
        )
        
        elapsed = time.time() - start_time
        
        if response.text:
            print(f"✓ 模型响应成功 (耗时: {elapsed:.2f}s)")
            print(f"响应长度: {len(response.text)} 字符")
            print(f"响应预览: {response.text[:200]}...")
            
            # 检查响应质量
            if len(response.text.strip()) > 10:
                return True, response.text
            else:
                return False, "Response too short"
        else:
            print(f"✗ 模型返回空响应")
            return False, "Empty response"
            
    except ImportError as e:
        print(f"✗ 导入错误: {e}")
        return False, f"Import error: {e}"
    except Exception as e:
        print(f"✗ 模型测试失败: {type(e).__name__}: {e}")
        return False, f"{type(e).__name__}: {e}"

def main():
    print("Gemini 多模态模型测试 (新版 API)")
    print("="*60)
    
    # 加载配置
    config = load_env()
    api_key = config.get('GEMINI_API_KEY')
    
    if not api_key:
        print("✗ 未找到 GEMINI_API_KEY")
        return
    
    print(f"API Key: {api_key[:10]}...")
    
    # 获取所有模型
    all_models = get_all_gemini_models()
    print(f"\n找到 {len(all_models)} 个 Gemini 模型:")
    for i, model in enumerate(all_models, 1):
        print(f"  {i}. {model}")
    
    # 图片路径
    image_path = os.path.join(os.path.dirname(__file__), "test.png")
    print(f"\n测试图片: {image_path}")
    print(f"图片存在: {'是' if os.path.exists(image_path) else '否'}")
    
    # 自定义提示词
    prompt = """请分析这张图片并详细描述：
1. 图片中主要包含什么内容？
2. 图片的色彩、构图和风格特点是什么？
3. 如果这是一张街景或导航相关的图片，请指出其中的道路、建筑、标志物等关键元素。
4. 为视觉障碍用户提供一段简短的场景描述（50字以内）。"""
    
    print(f"\n提示词: {prompt[:100]}...")
    
    # 测试每个模型
    results = []
    for model in all_models:
        success, message = test_model_with_image(model, api_key, image_path, prompt)
        results.append({
            'model': model,
            'success': success,
            'message': message[:500] if isinstance(message, str) else str(message)[:500],
            'timestamp': time.time()
        })
        
        # 模型间短暂延迟
        time.sleep(1)
    
    # 生成报告
    print(f"\n{'='*60}")
    print("测试结果汇总")
    print(f"{'='*60}")
    
    successful = [r for r in results if r['success']]
    failed = [r for r in results if not r['success']]
    
    print(f"成功: {len(successful)}/{len(results)}")
    print(f"失败: {len(failed)}/{len(results)}")
    
    if successful:
        print("\n成功的模型:")
        for r in successful:
            print(f"  ✓ {r['model']}")
    
    if failed:
        print("\n失败的模型:")
        for r in failed:
            print(f"  ✗ {r['model']}: {r['message']}")
    
    # 保存结果到文件
    result_file = os.path.join(os.path.dirname(__file__), "gemini_multimodal_test_results.txt")
    with open(result_file, 'w', encoding='utf-8') as f:
        f.write("Gemini 多模态模型测试结果\n")
        f.write("="*60 + "\n")
        f.write(f"测试时间: {time.strftime('%Y-%m-%d %H:%M:%S')}\n")
        f.write(f"测试图片: {image_path}\n")
        f.write(f"API Key: {api_key[:10]}...\n\n")
        
        f.write(f"测试模型总数: {len(results)}\n")
        f.write(f"成功: {len(successful)}\n")
        f.write(f"失败: {len(failed)}\n\n")
        
        for r in results:
            f.write(f"{'='*60}\n")
            f.write(f"模型: {r['model']}\n")
            f.write(f"状态: {'成功' if r['success'] else '失败'}\n")
            f.write(f"消息: {r['message']}\n\n")
    
    print(f"\n详细结果已保存到: {result_file}")
    
    # 建议
    print(f"\n{'='*60}")
    print("建议:")
    if successful:
        print("1. 以下模型可用于多模态导航预览系统:")
        for r in successful:
            print(f"   - {r['model']}")
    else:
        print("1. 所有模型测试失败，请检查:")
        print("   - API Key 是否正确")
        print("   - 网络连接")
        print("   - 模型名称是否正确")
        print("   - 是否已安装正确的 google-genai 包")

if __name__ == "__main__":
    main()
