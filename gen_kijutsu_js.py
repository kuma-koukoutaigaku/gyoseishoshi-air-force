import json, re, sys

input_file = sys.argv[1] if len(sys.argv) > 1 else 'kijutsu_cleaned_final.json'

with open(input_file, 'r', encoding='utf-8') as f:
    raw = json.load(f)

# 行政法1-20, 民法1-40のみ、重複除去
seen = set()
kijutsu = []
for q in sorted(raw, key=lambda x: (0 if x['category']=='行政法' else 1, x['number'])):
    if q['category'] == '行政法' and not (1 <= q['number'] <= 20): continue
    if q['category'] == '民法' and not (1 <= q['number'] <= 40): continue
    if q['category'] == '憲法': continue
    key = (q['category'], q['number'])
    if key in seen: continue
    seen.add(key)
    kijutsu.append(q)

def js_str(s):
    """Python文字列をJavaScript文字列リテラルに安全に変換"""
    s = s.replace('\\', '\\\\')
    s = s.replace('"', '\\"')
    s = s.replace('\n', '\\n')
    s = s.replace('\r', '')
    return f'"{s}"'

def js_val(v):
    if isinstance(v, str):
        return js_str(v)
    elif isinstance(v, bool):
        return 'true' if v else 'false'
    elif isinstance(v, int):
        return str(v)
    elif isinstance(v, float):
        return str(v)
    elif isinstance(v, list):
        items = ', '.join(js_val(i) for i in v)
        return f'[{items}]'
    elif isinstance(v, dict):
        pairs = ', '.join(f'{k}: {js_val(val)}' for k, val in v.items())
        return f'{{{pairs}}}'
    elif v is None:
        return 'null'
    return str(v)

lines = ['// 記述式問題データ（合格革命 行政書士 40字記述式・多肢選択式問題集 準拠）']
lines.append('// 行政法：問題1〜20 / 民法：問題1〜40（合計60問）')
lines.append('')
lines.append('const KIJUTSUSHIKI_DATA = [')

for i, q in enumerate(kijutsu):
    lines.append('  {')
    lines.append(f'    id: {js_str(q.get("id",""))},')
    lines.append(f'    number: {q.get("number", 0)},')
    lines.append(f'    category: {js_str(q.get("category",""))},')
    lines.append(f'    section: {js_str(q.get("section",""))},')
    lines.append(f'    difficulty: {js_str(q.get("difficulty",""))},')
    lines.append(f'    importance: {js_str(q.get("importance",""))},')
    lines.append(f'    question: {js_str(q.get("question",""))},')
    lines.append(f'    leadText: {js_str(q.get("leadText",""))},')
    lines.append(f'    modelAnswer: {js_str(q.get("modelAnswer",""))},')
    lines.append(f'    fullAnswer: {js_str(q.get("modelAnswer",""))},')
    lines.append(f'    charCount: {q.get("charCount", 0)},')
    
    criteria = q.get('criteria', [])
    crit_items = ', '.join(f'{{ text: {js_str(c.get("text",""))}, points: {c.get("points",0)} }}' for c in criteria)
    lines.append(f'    criteria: [{crit_items}],')
    
    lines.append(f'    explanation: {js_str(q.get("explanation",""))},')
    lines.append(f'    scorerNote: {js_str(q.get("scorerNote",""))},')
    lines.append(f'    source: {js_str(q.get("source",""))},')
    
    comma = '' if i == len(kijutsu) - 1 else ','
    lines.append(f'  }}{comma}')

lines.append('];')
lines.append('')

with open('kijutsushiki_data.js', 'w', encoding='utf-8') as f:
    f.write('\n'.join(lines))

print(f'Generated kijutsushiki_data.js with {len(kijutsu)} questions.')
