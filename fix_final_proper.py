import json
import re

def process_text(text):
    """
    OCRのPDFから抽出した日本語テキストの不自然な改行を修正。
    ルール:
    - 「①」「②」など丸付き数字で始まる行は新しいブロック（改行維持）
    - 「XX点」だけの行は改行維持（採点基準）
    - それ以外は前の行と結合
    """
    if not text:
        return text

    lines = [l.strip() for l in text.split('\n')]
    lines = [l for l in lines if l]  # 空行除去

    new_block = re.compile(r'^[①②③④⑤⑥⑦⑧⑨⑩]')
    score_only = re.compile(r'^\d+点$')

    result = []
    for line in lines:
        if not result:
            result.append(line)
        elif new_block.match(line) or score_only.match(line):
            result.append(line)
        else:
            result[-1] = result[-1] + line

    return '\n'.join(result)

def process_question(text):
    """
    問題文は基本的に全部つなげるが、条文引用（「○○法△条」みたいな見出し）の前で改行。
    また「40字程度で記述しなさい。」の後の条文ブロックも改行。
    """
    if not text:
        return text

    lines = [l.strip() for l in text.split('\n')]
    lines = [l for l in lines if l]

    result = []
    law_title = re.compile(r'^(?:[^\n]*法\d+条|[^\n]*法第\d+条|\S+法\S*本文|\S+法\S*柱書)')

    for line in lines:
        if not result:
            result.append(line)
        elif law_title.match(line) and not result[-1].endswith('。'):
            # 条文タイトル行で前が文章の途中なら結合
            result[-1] = result[-1] + line
        elif law_title.match(line) and result[-1].endswith('。'):
            result.append(line)
        else:
            result[-1] = result[-1] + line

    return '\n'.join(result)

with open('parsed_kijutsu_updated.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

for q in data:
    if 'question' in q and q['question']:
        q['question'] = process_question(q['question'])
    for key in ['explanation', 'scorerNote']:
        if key in q and q[key]:
            q[key] = process_text(q[key])

with open('kijutsu_cleaned_final.json', 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

# 確認
for i in range(3):
    q = data[i]
    print(f"=== 問{i+1} question ===")
    print(q['question'])
    print()
    print(f"=== 問{i+1} explanation ===")
    print(q['explanation'])
    print("=" * 60)
    print()

print("Done!")
