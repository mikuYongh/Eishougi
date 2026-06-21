import os
import glob

def process_file(filepath):
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
            
        if 'text-[var(--text-muted)]' in content:
            new_content = content.replace('text-[var(--text-muted)]', 'text-[var(--text-secondary)]')
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(new_content)
            print(f'Updated {filepath}')
            return True
    except Exception as e:
        print(f'Error processing {filepath}: {e}')
    return False

updated_count = 0
for root, dirs, files in os.walk('src'):
    for file in files:
        if file.endswith('.tsx') or file.endswith('.ts'):
            filepath = os.path.join(root, file)
            if process_file(filepath):
                updated_count += 1

print(f'\nTotal files updated: {updated_count}')
