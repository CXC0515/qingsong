#!/usr/bin/env python3

import argparse
import json
import mimetypes
import posixpath
import re
import shutil
import subprocess
import sys
import zipfile
from dataclasses import dataclass
from pathlib import Path
from xml.etree import ElementTree as ET

W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
R = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"


@dataclass
class LevelDefinition:
    start: int
    number_format: str
    level_text: str


def attribute(element, name, default=None):
    if element is None:
        return default
    return element.attrib.get(W + name, default)


def mathml_text(node):
    tag = node.tag.rsplit("}", 1)[-1]
    children = list(node)
    rendered_children = [mathml_text(child) for child in children]
    if tag == "mfrac" and len(rendered_children) >= 2:
        return f"({rendered_children[0]})/({rendered_children[1]})"
    if tag == "msup" and len(rendered_children) >= 2:
        return f"{rendered_children[0]}^({rendered_children[1]})"
    if tag == "msub" and len(rendered_children) >= 2:
        return f"{rendered_children[0]}_({rendered_children[1]})"
    if tag == "msubsup" and len(rendered_children) >= 3:
        return f"{rendered_children[0]}_({rendered_children[1]})^({rendered_children[2]})"
    if tag == "msqrt":
        return f"sqrt({''.join(rendered_children)})"
    if tag == "mroot" and len(rendered_children) >= 2:
        return f"root({rendered_children[0]}, {rendered_children[1]})"
    parts = [node.text or ""]
    for child, rendered in zip(children, rendered_children):
        parts.extend((rendered, child.tail or ""))
    return "".join(parts)


def extract_mathtype_text(payload):
    match = re.search(rb"<math\b[\s\S]*?</math>", payload)
    if not match:
        return None
    try:
        root = ET.fromstring(match.group(0).decode("utf-8"))
    except (UnicodeDecodeError, ET.ParseError):
        return None
    value = mathml_text(root).strip()
    return value or None


def parse_embedded_semantics(archive):
    relationships_path = "word/_rels/document.xml.rels"
    if relationships_path not in archive.namelist():
        return {}, {}
    relationships = ET.fromstring(archive.read(relationships_path))
    relation_targets = {}
    for relation in relationships:
        if not relation.attrib.get("Type", "").endswith("/image"):
            continue
        relation_id = relation.attrib.get("Id")
        target = relation.attrib.get("Target")
        if relation_id and target:
            relation_targets[relation_id] = posixpath.normpath(posixpath.join("word", target))
    relation_text = {}
    resource_text = {}
    for relation_id, target in relation_targets.items():
        if target not in archive.namelist():
            continue
        semantic_text = extract_mathtype_text(archive.read(target))
        if semantic_text:
            relation_text[relation_id] = semantic_text
            resource_text[Path(target).name] = semantic_text
    return relation_text, resource_text


def paragraph_text(paragraph, relation_text=None):
    relation_text = relation_text or {}
    parts = []
    for node in paragraph.iter():
        if node.tag == W + "t":
            parts.append(node.text or "")
        elif node.tag == W + "tab":
            parts.append("\t")
        elif node.tag in (W + "br", W + "cr"):
            parts.append("\n")
        elif node.tag.rsplit("}", 1)[-1] == "blip":
            embedded_text = relation_text.get(node.attrib.get(R + "embed", ""))
            if embedded_text:
                parts.append(embedded_text)
    return "".join(parts).strip()


def parse_level(level):
    start = int(attribute(level.find(W + "start"), "val", "1"))
    number_format = attribute(level.find(W + "numFmt"), "val", "decimal")
    level_text = attribute(level.find(W + "lvlText"), "val", "%1.")
    return LevelDefinition(start, number_format, level_text)


def parse_numbering(archive):
    if "word/numbering.xml" not in archive.namelist():
        return {}, {}, {}
    root = ET.fromstring(archive.read("word/numbering.xml"))
    abstract_levels = {}
    for abstract in root.findall(W + "abstractNum"):
        abstract_id = attribute(abstract, "abstractNumId")
        abstract_levels[abstract_id] = {
            int(attribute(level, "ilvl", "0")): parse_level(level)
            for level in abstract.findall(W + "lvl")
        }
    number_abstracts = {}
    overrides = {}
    for number in root.findall(W + "num"):
        number_id = attribute(number, "numId")
        number_abstracts[number_id] = attribute(number.find(W + "abstractNumId"), "val")
        number_overrides = {}
        for override in number.findall(W + "lvlOverride"):
            level = int(attribute(override, "ilvl", "0"))
            definition = override.find(W + "lvl")
            start_override = override.find(W + "startOverride")
            if definition is not None:
                number_overrides[level] = parse_level(definition)
            elif start_override is not None:
                abstract = abstract_levels.get(number_abstracts[number_id], {}).get(level)
                if abstract:
                    number_overrides[level] = LevelDefinition(
                        int(attribute(start_override, "val", str(abstract.start))),
                        abstract.number_format,
                        abstract.level_text,
                    )
        overrides[number_id] = number_overrides
    return abstract_levels, number_abstracts, overrides


def parse_style_numbering(archive):
    if "word/styles.xml" not in archive.namelist():
        return {}
    root = ET.fromstring(archive.read("word/styles.xml"))
    result = {}
    for style in root.findall(W + "style"):
        style_id = attribute(style, "styleId")
        number_properties = style.find(f"{W}pPr/{W}numPr")
        if not style_id or number_properties is None:
            continue
        number_id = attribute(number_properties.find(W + "numId"), "val")
        level = int(attribute(number_properties.find(W + "ilvl"), "val", "0"))
        if number_id and number_id != "0":
            result[style_id] = (number_id, level)
    return result


def to_roman(value):
    result = []
    for amount, numeral in (
        (1000, "M"), (900, "CM"), (500, "D"), (400, "CD"),
        (100, "C"), (90, "XC"), (50, "L"), (40, "XL"),
        (10, "X"), (9, "IX"), (5, "V"), (4, "IV"), (1, "I"),
    ):
        while value >= amount:
            result.append(numeral)
            value -= amount
    return "".join(result)


def format_number(value, number_format):
    if number_format == "decimalZero":
        return f"{value:02d}"
    if number_format == "lowerLetter":
        return chr(ord("a") + max(value - 1, 0) % 26)
    if number_format == "upperLetter":
        return chr(ord("A") + max(value - 1, 0) % 26)
    if number_format == "lowerRoman":
        return to_roman(value).lower()
    if number_format == "upperRoman":
        return to_roman(value)
    if number_format in ("chineseCounting", "chineseCountingThousand"):
        digits = "零一二三四五六七八九"
        if value <= 10:
            return "十" if value == 10 else digits[value]
        if value < 20:
            return "十" + digits[value % 10]
        if value < 100:
            return digits[value // 10] + "十" + (digits[value % 10] if value % 10 else "")
    if number_format in ("bullet", "none"):
        return "-"
    return str(value)


def render_list_label(definition, counters, definitions):
    label = definition.level_text
    for index in range(9):
        placeholder = f"%{index + 1}"
        if placeholder not in label:
            continue
        value = counters.get(index, definitions.get(index, LevelDefinition(1, "decimal", "")).start)
        number_format = definitions.get(index, definition).number_format
        label = label.replace(placeholder, format_number(value, number_format))
    return label


def extract_blocks(input_path):
    warnings = []
    with zipfile.ZipFile(input_path) as archive:
        abstract_levels, number_abstracts, overrides = parse_numbering(archive)
        style_numbering = parse_style_numbering(archive)
        relation_text, resource_text = parse_embedded_semantics(archive)
        document = ET.fromstring(archive.read("word/document.xml"))
        counters = {}
        blocks = []
        unsupported_formats = set()
        for paragraph in document.iter(W + "p"):
            text = paragraph_text(paragraph, relation_text)
            if not text:
                continue
            properties = paragraph.find(W + "pPr")
            style_id = attribute(properties.find(W + "pStyle") if properties is not None else None, "val", "")
            number_properties = properties.find(W + "numPr") if properties is not None else None
            number_id = attribute(number_properties.find(W + "numId") if number_properties is not None else None, "val")
            level = int(attribute(number_properties.find(W + "ilvl") if number_properties is not None else None, "val", "0"))
            if not number_id and style_id in style_numbering:
                number_id, level = style_numbering[style_id]
            list_label = None
            block_type = "heading" if style_id.lower().startswith("heading") else "paragraph"
            if number_id and number_id != "0":
                definitions = abstract_levels.get(number_abstracts.get(number_id), {})
                definitions = {**definitions, **overrides.get(number_id, {})}
                definition = definitions.get(level)
                if definition:
                    number_counters = counters.setdefault(number_id, {})
                    number_counters[level] = number_counters.get(level, definition.start - 1) + 1
                    for deeper_level in [key for key in number_counters if key > level]:
                        del number_counters[deeper_level]
                    list_label = render_list_label(definition, number_counters, definitions)
                    if definition.number_format not in {
                        "decimal", "decimalZero", "lowerLetter", "upperLetter",
                        "lowerRoman", "upperRoman", "bullet", "none",
                        "chineseCounting", "chineseCountingThousand",
                    }:
                        unsupported_formats.add(definition.number_format)
                block_type = "list-item"
            block_id = f"block-{len(blocks) + 1}"
            rendered = f"{list_label} {text}" if list_label else text
            blocks.append({
                "id": block_id,
                "order": len(blocks),
                "type": block_type,
                "text": text,
                "markdown": rendered,
                **({"listLabel": list_label, "level": level} if list_label else {}),
            })
        if unsupported_formats:
            warnings.append({
                "code": "DOCX_NUMBER_FORMAT_FALLBACK",
                "message": "部分 Word 编号格式已按十进制数字处理：" + ", ".join(sorted(unsupported_formats)),
            })
    return blocks, warnings, resource_text


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--paddleocr-command", default="paddleocr")
    args = parser.parse_args()

    input_path = Path(args.input).resolve()
    output_dir = Path(args.output_dir).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    parser_input_path = input_path
    if input_path.suffix.lower() != ".docx":
        parser_input_path = output_dir / "source.docx"
        shutil.copyfile(input_path, parser_input_path)
    markdown_path = output_dir / "document.md"
    if not shutil.which(args.paddleocr_command):
        print("DOCX_CONVERTER_NOT_INSTALLED", file=sys.stderr)
        return 2
    process = subprocess.run(
        [args.paddleocr_command, "doc2md", "-i", str(parser_input_path), "-o", str(markdown_path), "-q"],
        cwd=output_dir,
        capture_output=True,
        text=True,
        timeout=180,
    )
    if process.returncode != 0 or not markdown_path.exists():
        detail = (process.stderr or process.stdout or "DOCX_CONVERSION_FAILED").strip()
        print(detail, file=sys.stderr)
        return 2

    blocks, warnings, semantic_resources = extract_blocks(parser_input_path)
    resources = []
    has_legacy_images = False
    image_directory = output_dir / "images"
    if image_directory.exists():
        for resource_path in sorted(path for path in image_directory.iterdir() if path.is_file()):
            if resource_path.name in semantic_resources:
                continue
            mime_type = mimetypes.guess_type(resource_path.name)[0] or "application/octet-stream"
            resources.append({
                "fileName": resource_path.name,
                "mimeType": mime_type,
                "relativePath": str(resource_path.relative_to(output_dir)),
            })
            if resource_path.suffix.lower() in (".wmf", ".emf"):
                has_legacy_images = True
    if has_legacy_images:
        warnings.append({
            "code": "DOCX_IMAGE_REVIEW_REQUIRED",
            "message": "文档中有图片内容未能直接解析，请对照原版页面确认。",
        })

    preview_relative_path = None
    if has_legacy_images:
        quicklook_command = shutil.which("qlmanage")
        if quicklook_command:
            quicklook_directory = output_dir / "quicklook"
            quicklook_directory.mkdir(exist_ok=True)
            preview_process = subprocess.run(
                [quicklook_command, "-t", "-s", "1800", "-o", str(quicklook_directory), str(parser_input_path)],
                cwd=output_dir,
                capture_output=True,
                text=True,
                timeout=60,
            )
            generated_preview = quicklook_directory / f"{parser_input_path.name}.png"
            if preview_process.returncode == 0 and generated_preview.exists():
                image_converter = shutil.which("sips")
                preview_path = output_dir / "source-preview.jpg"
                if image_converter:
                    conversion_process = subprocess.run(
                        [image_converter, "-s", "format", "jpeg", str(generated_preview), "--out", str(preview_path)],
                        capture_output=True,
                        text=True,
                        timeout=60,
                    )
                    if conversion_process.returncode != 0 or not preview_path.exists():
                        preview_path = output_dir / "source-preview.png"
                        generated_preview.replace(preview_path)
                else:
                    preview_path = output_dir / "source-preview.png"
                    generated_preview.replace(preview_path)
                preview_relative_path = str(preview_path.relative_to(output_dir))
        office_command = shutil.which("soffice") or shutil.which("libreoffice")
        if not preview_relative_path and office_command:
            preview_process = subprocess.run(
                [office_command, "--headless", "--convert-to", "pdf", "--outdir", str(output_dir), str(parser_input_path)],
                cwd=output_dir,
                capture_output=True,
                text=True,
                timeout=180,
            )
            generated_preview = output_dir / f"{parser_input_path.stem}.pdf"
            if preview_process.returncode == 0 and generated_preview.exists():
                preview_path = output_dir / "source-preview.pdf"
                if generated_preview != preview_path:
                    generated_preview.replace(preview_path)
                preview_relative_path = str(preview_path.relative_to(output_dir))
            else:
                warnings.append({
                    "code": "DOCX_PREVIEW_UNAVAILABLE",
                    "message": "原版页面预览生成失败，可下载内嵌原文件检查。",
                })
        if not preview_relative_path and not office_command:
            warnings.append({
                "code": "DOCX_PREVIEW_UNAVAILABLE",
                "message": "未安装原版页面转换工具，可下载内嵌原文件检查。",
            })

    source_markdown = markdown_path.read_text(encoding="utf-8")
    for resource_name, semantic_text in semantic_resources.items():
        image_pattern = rf'<img\s+[^>]*src=["\'][^"\']*{re.escape(resource_name)}["\'][^>]*>'
        source_markdown = re.sub(image_pattern, semantic_text, source_markdown, flags=re.IGNORECASE)
    normalized_markdown = "\n\n".join(block["markdown"] for block in blocks)
    result = {
        "markdown": normalized_markdown,
        "sourceMarkdown": source_markdown,
        "blocks": blocks,
        "resources": resources,
        "warnings": warnings,
        "previewRelativePath": preview_relative_path,
    }
    print(json.dumps(result, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
