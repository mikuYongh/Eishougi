import os
import re

replacements = {
    # Backgrounds
    r'bg-black/90': 'bg-[var(--glass-bg)]',
    r'bg-black/80': 'bg-[var(--glass-bg)]',
    r'bg-black/60': 'bg-[var(--glass-bg)]',
    r'bg-black/50': 'bg-[var(--bg-layer-1)]',
    r'bg-black/40': 'bg-[var(--glass-bg)]',
    r'bg-black/30': 'bg-[var(--glass-bg-hover)]',
    r'bg-black/20': 'bg-[var(--bg-layer-1)]',
    r'bg-black(?!/)(?![\w-])': 'bg-[var(--bg-layer-0)]',
    
    r'bg-zinc-900/90': 'bg-[var(--glass-bg)]',
    r'bg-zinc-900/50': 'bg-[var(--glass-bg)]',
    r'bg-zinc-900(?!/)(?![\w-])': 'bg-[var(--bg-layer-0)]',
    r'bg-zinc-800/80': 'bg-[var(--glass-bg)]',
    r'bg-zinc-800(?!/)(?![\w-])': 'bg-[var(--bg-layer-1)]',
    r'bg-zinc-700(?!/)(?![\w-])': 'bg-[var(--bg-layer-2)]',
    
    # Borders
    r'border-white/5(?![\w-])': 'border-[var(--glass-border)]',
    r'border-white/10(?![\w-])': 'border-[var(--glass-border)]',
    r'border-white/20(?![\w-])': 'border-[var(--glass-border-active)]',
    r'border-white/30(?![\w-])': 'border-[var(--glass-border-active)]',
    r'border-zinc-800(?![\w-])': 'border-[var(--glass-border)]',
    r'border-zinc-700(?![\w-])': 'border-[var(--glass-border)]',
    
    # Text
    r'text-white/20(?![\w-])': 'text-[var(--text-muted)]',
    r'text-white/30(?![\w-])': 'text-[var(--text-muted)]',
    r'text-white/40(?![\w-])': 'text-[var(--text-muted)]',
    r'text-white/50(?![\w-])': 'text-[var(--text-muted)]',
    r'text-white/60(?![\w-])': 'text-[var(--text-muted)]',
    r'text-white/70(?![\w-])': 'text-[var(--text-secondary)]',
    r'text-white/80(?![\w-])': 'text-[var(--text-primary)]',
    r'text-white/90(?![\w-])': 'text-[var(--text-primary)]',
    r'text-white(?!/)(?![\w-])': 'text-[var(--text-primary)]',
    r'text-zinc-400(?![\w-])': 'text-[var(--text-muted)]',
    r'text-zinc-500(?![\w-])': 'text-[var(--text-muted)]',
    r'text-zinc-300(?![\w-])': 'text-[var(--text-secondary)]',

    # Accents (Fuchsia, Purple, Pink, Blue)
    r'fuchsia-500/10': '[var(--accent-1)]/10',
    r'fuchsia-500/20': '[var(--accent-1)]/20',
    r'fuchsia-500/30': '[var(--accent-1)]/30',
    r'fuchsia-500/40': '[var(--accent-1)]/40',
    r'fuchsia-500/50': '[var(--accent-1)]/50',
    r'fuchsia-500/80': '[var(--accent-1)]/80',
    r'fuchsia-500/90': '[var(--accent-1)]/90',
    r'fuchsia-500(?![\w-])': '[var(--accent-1)]',
    r'fuchsia-400/50': '[var(--accent-1)]/50',
    r'fuchsia-400/80': '[var(--accent-1)]/80',
    r'fuchsia-400(?![\w-])': '[var(--accent-1)]',
    r'fuchsia-300(?![\w-])': '[var(--accent-1)]',
    r'fuchsia-200/70': '[var(--text-primary)]/70',
    r'fuchsia-200(?![\w-])': '[var(--text-primary)]',
    r'fuchsia-100/70': '[var(--text-primary)]/70',
    r'fuchsia-100(?![\w-])': '[var(--text-primary)]',
    r'fuchsia-50(?![\w-])': '[var(--text-primary)]',
    r'fuchsia-900/30': '[var(--accent-1)]/30',
    r'fuchsia-900/10': '[var(--accent-1)]/10',

    r'purple-600/20': '[var(--accent-2)]/20',
    r'purple-600(?![\w-])': '[var(--accent-2)]',
    r'purple-500/10': '[var(--accent-2)]/10',
    r'purple-500/20': '[var(--accent-2)]/20',
    r'purple-500/30': '[var(--accent-2)]/30',
    r'purple-500/50': '[var(--accent-2)]/50',
    r'purple-500(?![\w-])': '[var(--accent-2)]',
    r'purple-400/80': '[var(--accent-2)]/80',
    r'purple-400/50': '[var(--accent-2)]/50',
    r'purple-400(?![\w-])': '[var(--accent-2)]',
    r'purple-300(?![\w-])': '[var(--accent-2)]',
    r'purple-200/80': '[var(--text-primary)]/80',
    r'purple-200/50': '[var(--text-primary)]/50',
    r'purple-200(?![\w-])': '[var(--text-primary)]',
    r'purple-900/20': '[var(--accent-2)]/20',
    r'purple-900/10': '[var(--accent-2)]/10',

    r'pink-500/20': '[var(--accent-1)]/20',
    r'pink-500/30': '[var(--accent-1)]/30',
    r'pink-500/80': '[var(--accent-1)]/80',
    r'pink-500(?![\w-])': '[var(--accent-1)]',
    r'pink-400/50': '[var(--accent-1)]/50',
    r'pink-400(?![\w-])': '[var(--accent-1)]',
    r'pink-300(?![\w-])': '[var(--accent-1)]',

    r'blue-500/30': '[var(--accent-2)]/30',
    r'blue-500/50': '[var(--accent-2)]/50',
    r'blue-500(?![\w-])': '[var(--accent-2)]',

    # Shadows with RGBA
    r'rgba\(217,70,239,([0-9.]+)\)': r'var(--accent-1-\1)',
    r'rgba\(168,85,247,([0-9.]+)\)': r'var(--accent-2-\1)',
    r'rgba\(255,107,157,([0-9.]+)\)': r'var(--accent-1-\1)',
}

def process_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    new_content = content
    for pattern, replacement in replacements.items():
        new_content = re.sub(pattern, replacement, new_content)
        
    if new_content != content:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(new_content)
        print(f"Updated {filepath}")

def main():
    src_dir = os.path.join(os.getcwd(), 'src')
    for root, dirs, files in os.walk(src_dir):
        for file in files:
            if file.endswith('.tsx') or file.endswith('.ts'):
                process_file(os.path.join(root, file))

if __name__ == '__main__':
    main()
