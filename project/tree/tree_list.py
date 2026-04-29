# ai_friendly_tree.py
import os
import json
from pathlib import Path


def scan_project_structure(root_path):
    """
    扫描项目结构并返回AI友好的JSON格式数据
    """

    def _scan_directory(path):
        structure = {
            "name": path.name,
            "type": "directory",
            "children": []
        }

        try:
            for item in path.iterdir():
                if item.is_dir() and not item.name.startswith('.'):
                    structure["children"].append(_scan_directory(item))
                elif item.is_file():
                    structure["children"].append({
                        "name": item.name,
                        "type": "file",
                        "extension": item.suffix.lower()
                    })
        except PermissionError:
            structure["children"].append({
                "name": "<权限拒绝>",
                "type": "error"
            })

        return structure

    root = Path(root_path)
    return _scan_directory(root)


def generate_ai_description(structure):
    """
    生成AI可理解的项目描述
    """
    description = {
        "project_name": structure["name"],
        "file_count": 0,
        "directory_count": 0,
        "file_types": {},
        "structure_summary": ""
    }

    def _analyze_node(node, depth=0):
        indent = "  " * depth

        if node["type"] == "directory":
            description["directory_count"] += 1
            description["structure_summary"] += f"{indent}📁 {node['name']}\n"

            for child in node["children"]:
                _analyze_node(child, depth + 1)

        elif node["type"] == "file":
            description["file_count"] += 1
            ext = node.get("extension", "unknown")
            description["file_types"][ext] = description["file_types"].get(ext, 0) + 1
            description["structure_summary"] += f"{indent}📄 {node['name']}\n"

    _analyze_node(structure)
    return description


def save_ai_friendly_output(structure, description, output_file):
    """
    保存AI友好的输出格式
    """
    output_data = {
        "project_structure": structure,
        "ai_description": description
    }

    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(output_data, f, ensure_ascii=False, indent=2)


if __name__ == "__main__":
    # 获取当前目录
    current_dir = os.getcwd()
    print(f"正在分析项目: {current_dir}")

    # 扫描项目结构
    project_structure = scan_project_structure(current_dir)

    # 生成AI描述
    ai_description = generate_ai_description(project_structure)

    # 保存输出
    output_file = "ai_project_analysis.json"
    save_ai_friendly_output(project_structure, ai_description, output_file)

    print(f"AI友好的项目分析已保存至: {output_file}")
    print(f"项目包含 {ai_description['file_count']} 个文件和 {ai_description['directory_count']} 个目录")
