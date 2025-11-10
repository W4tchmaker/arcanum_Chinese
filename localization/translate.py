import os
import json
import time
import itertools
from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple, Iterator, Union
from google import genai
from google.genai.errors import APIError
from google.genai import types

# --- 配置 ---
GEMINI_MODEL = "gemini-2.5-flash"
THROTTLE_DELAY_SECONDS = 1
FIELDS_TO_TRANSLATE = ['name', 'desc', 'extdesc', 'flavor', 'title', 'actname', 'actdesc', 'verb']
MAX_FIELDS_PER_CHUNK = 100         

# 客户端初始化 (保持不变)
try:
    client = genai.Client()
except Exception as e:
    print(f"⚠️ 警告: 无法初始化 Gemini 客户端。请检查您的API密钥是否设置正确。错误: {e}")
    client = None

# --- 工具函数：分块 (保持不变) ---
def chunk_dict(data: Dict[str, Any], size: int) -> Iterator[Dict[str, Any]]:
    """将字典按指定的 size 切分成多个小字典（块）。"""
    it = iter(data.keys())
    while True:
        chunk_keys = list(itertools.islice(it, size))
        if not chunk_keys:
            break
        yield {k: data[k] for k in chunk_keys}

# --- 核心修改函数：递归提取数据 ---

def recursive_extract_and_replace(
    data: Union[Dict, List, Any], 
    translation_map: Dict[str, str], 
    translated_map: Dict[str, str], 
    path_key: str = '',
    mode: str = 'extract' # 'extract' 提取数据； 'replace' 替换数据
) -> None:
    """
    深度递归遍历 JSON 结构，根据 mode 参数执行提取或替换操作。
    
    参数:
        data: 当前递归层级的 JSON 数据（Dict, List 或 原始类型）。
        translation_map: 用于 'extract' 模式存储原始文本。
        translated_map: 用于 'replace' 模式查找翻译结果。
        path_key: 当前元素在整个结构中的唯一路径（用于键名）。
        mode: 操作模式 ('extract' 或 'replace')。
    """
    if isinstance(data, dict):
        # 遍历字典
        for k, v in data.items():
            new_path_key = f"{path_key}_{k}" if path_key else k
            
            if k in FIELDS_TO_TRANSLATE and isinstance(v, str) and v.strip():
                # 找到了需要翻译的字段
                if mode == 'extract':
                    translation_map[new_path_key] = v.strip()
                elif mode == 'replace':
                    # 替换操作，从翻译结果中查找
                    if new_path_key in translated_map and translated_map[new_path_key]:
                        data[k] = translated_map[new_path_key]
            
            # 递归处理子元素
            recursive_extract_and_replace(v, translation_map, translated_map, new_path_key, mode)
            
    elif isinstance(data, list):
        # 遍历列表
        for i, item in enumerate(data):
            new_path_key = f"{path_key}[{i}]"
            # 递归处理列表中的元素
            recursive_extract_and_replace(item, translation_map, translated_map, new_path_key, mode)

def extract_translation_data(data: Union[Dict, List]) -> Dict[str, str]:
    """外部接口：提取所有需要翻译的文本，生成完整的映射表。"""
    translation_map = {}
    # 从根部开始递归提取
    recursive_extract_and_replace(data, translation_map, {}, mode='extract')
    return translation_map

def replace_translated_data(data: Union[Dict, List], translated_map: Dict[str, str]):
    """外部接口：使用翻译结果替换原始数据中的字段。"""
    # 从根部开始递归替换
    recursive_extract_and_replace(data, {}, translated_map, mode='replace')

# --- 函数：构建 Prompt 和 Schema (针对单个块, 保持不变) ---
# ... (保持不变，因为它们只依赖于 chunk_map 结构) ...

def build_chunk_prompt_and_schema(chunk_map: Dict[str, str]) -> Tuple[str, Dict]:
    """针对给定的翻译块 (Chunk)，构建 Prompt 文本和精确的动态 JSON Schema。"""
    dynamic_schema = {
        "type": "object",
        "properties": {},
        "required": []
    }
    for key, original_text in chunk_map.items():
        # 键名现在是包含路径的字符串，如 "data_clashes[0]_name"
        dynamic_schema["properties"][key] = {"type": "string", "description": f"翻译 '{original_text}' 为中文"}
        dynamic_schema["required"].append(key) 

    translation_json_string = json.dumps(chunk_map, indent=2, ensure_ascii=False)
    
    prompt = f"""
    你是一名专业的游戏文本翻译。你的任务是将提供的 JSON 字典中的**值**从英文（或原始语言）翻译成简洁流畅的**中文**。
    
    请严格遵循以下规则：
    1. **保持键名不变**：返回的 JSON 中的键名（例如："data_clashes[0]_name"）必须与输入完全一致。
    2. **只翻译值**：返回 JSON 的值必须是翻译后的中文文本，不要有任何额外的解释、引号或文字。
    3. **输出格式**：返回的内容必须是严格的 **JSON** 格式，且必须符合提供的 Schema。
    
    待翻译的索引化字典：
    {translation_json_string}
    """
    return prompt, dynamic_schema


# --- 函数：处理单个文件 (使用新的递归接口) ---

def translate_file_level(file_path: Path, output_file_path: Path):
    """处理单个JSON文件，根据字段数量进行分块翻译。"""
    print(f"\n--- 正在处理文件: {file_path.resolve()} ---")
    
    if not client:
         print("❌ 翻译失败：Gemini 客户端未初始化。")
         return
         
    try:
        # 1. 读取原始JSON文件
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f) # data 现在可以是 dict 或 list
            
        # 2. 预处理：提取所有需要翻译的字段，生成完整的映射表
        # 使用新的递归提取函数
        full_translation_map = extract_translation_data(data)
        
        if not full_translation_map:
            print("  > 文件中没有找到需要翻译的字段，跳过。")
            
            # 复制文件
            os.makedirs(output_file_path.parent, exist_ok=True)
            with open(output_file_path, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=4, ensure_ascii=False)
            print(f"✅ 文件 '{file_path.name}' 跳过翻译，已复制到输出目录。")
            return
            
        total_fields = len(full_translation_map)
        num_chunks = -(total_fields // -MAX_FIELDS_PER_CHUNK)
        print(f"  > 发现 {total_fields} 个字段需要翻译，将拆分为 {num_chunks} 个块。")

        # 3. 分块处理循环
        full_translated_map = {}
        
        for chunk_index, chunk_map in enumerate(chunk_dict(full_translation_map, MAX_FIELDS_PER_CHUNK)):
            
            print(f"  > 正在处理块 {chunk_index + 1}，包含 {len(chunk_map)} 个字段...")
            
            prompt, dynamic_schema = build_chunk_prompt_and_schema(chunk_map)
            
            # 3.1. LLM 输入：调用 Gemini API
            response = client.models.generate_content(
                model=GEMINI_MODEL,
                contents=prompt,
                config=genai.types.GenerateContentConfig(
                    temperature=0.1,
                    response_mime_type="application/json",
                    response_schema=dynamic_schema,
                )
            )
            
            # 3.2. 解析 LLM 输出：获取翻译后的 JSON
            try:
                chunk_translated_map = json.loads(response.text)
                full_translated_map.update(chunk_translated_map)
                print(f"  > 块 {chunk_index + 1} 翻译完成，成功合并。")

            except json.JSONDecodeError as e:
                print(f"❌ 块 {chunk_index + 1} 错误: Gemini 返回的文本不是有效的 JSON 格式，无法解析。{e}")
                print(f"   返回文本片段: {response.text[:200]}")
                continue 
            except APIError as e:
                print(f"❌ 块 {chunk_index + 1} 错误: Gemini API 调用失败 (APIError): {e}")
                raise e
            
            if chunk_index < num_chunks - 1:
                print(f"  > 块间等待 {THROTTLE_DELAY_SECONDS} 秒...")
                time.sleep(THROTTLE_DELAY_SECONDS)

        # 4. 后处理：使用新的递归替换函数回填数据
        print("  > 所有块翻译完成，正在回填数据...")
        replace_translated_data(data, full_translated_map) 

        # 5. 保存结果
        os.makedirs(output_file_path.parent, exist_ok=True) 
        with open(output_file_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=4, ensure_ascii=False)
        
        print(f"✅ 文件 '{file_path.name}' 最终处理完成，保存到 '{output_file_path.relative_to(Path.cwd())}'")

    except Exception as e:
        print(f"❌ 处理文件 '{file_path.name}' 时发生未知错误: {e}")
        raise

# --- 函数：主程序入口 (路径修复版，保持不变) ---
def translate_all_json_files(input_dir: str = '.', output_dir_name: str = 'Chinese'):
    # ... (保持不变)
    if not client:
        print("\n程序终止：Gemini 客户端未成功初始化。")
        return

    script_cwd = Path.cwd() 
    input_path = (script_cwd / input_dir).resolve()
    output_base_path = script_cwd / output_dir_name
    
    os.makedirs(output_base_path, exist_ok=True)
    print(f"🚀 开始递归处理源目录: {input_path}")
    print(f"💾 结果将保存到目标目录: {output_base_path}")

    json_files = sorted(list(input_path.glob('**/*.json')))
    
    if not json_files:
        print("✅ 目录下没有找到任何JSON文件。")
        return

    for file_path in json_files:
        try:
            relative_path = file_path.relative_to(input_path)
        except ValueError:
            print(f"🔴 错误：无法计算 {file_path} 相对于 {input_path} 的相对路径，跳过。")
            continue
            
        output_file_path = output_base_path / relative_path
        
        try:
            translate_file_level(file_path, output_file_path)
            
        except Exception as e:
             print(f"🔴 文件 {file_path.resolve()} 处理过程中发生严重错误，已跳过。错误: {e}")

        print(f"文件间等待 {THROTTLE_DELAY_SECONDS} 秒以进行速率控制...")
        time.sleep(THROTTLE_DELAY_SECONDS)

    print("\n🎉 所有文件处理完毕。")


if __name__ == '__main__':
    # 请确保您的源文件目录在脚本运行目录的子目录下
    # 例如：你的脚本和 English 文件夹在同一个地方
    # SCRIPT_DIR
    # ├── json_translator.py
    # ├── English/
    # └── Chinese/ (结果输出在这里)
    
    SOURCE_DIRECTORY = './English/modules'
    # 确保 'English' 替换为你实际的源文件目录名
    
    translate_all_json_files(input_dir=SOURCE_DIRECTORY, output_dir_name='Chinese/modules')