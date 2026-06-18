import React from 'react';

interface Img2VideoModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageSrc: string;
}

export function Img2VideoModal({ isOpen, onClose, imageSrc }: Img2VideoModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-[var(--bg-layer-1)] border border-[var(--glass-border)] rounded-2xl p-6 max-w-lg w-full text-center shadow-2xl animate-in zoom-in-95 duration-200">
        <h2 className="text-lg font-bold text-[var(--text-primary)] mb-4">图生视频 (Img2Video)</h2>
        <p className="text-[var(--text-muted)] mb-6 text-sm">此功能正在开发中，敬请期待！</p>
        {imageSrc && (
          <div className="bg-black/50 rounded-xl p-2 mb-6 border border-white/5 inline-block">
            <img src={imageSrc} alt="Preview" className="max-h-48 mx-auto rounded-lg object-contain" />
          </div>
        )}
        <div>
          <button 
            onClick={onClose}
            className="px-8 py-2 bg-white/10 hover:bg-white/20 text-[var(--text-primary)] rounded-xl transition-colors font-bold text-sm"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}
