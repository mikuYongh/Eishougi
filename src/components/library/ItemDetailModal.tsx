import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Copy, Check, Flame, Heart } from 'lucide-react';
import type { Character, Artist } from '../../stores/libraryStore';

type ItemType = Character | Artist;

interface ItemDetailModalProps {
  item: ItemType;
  onClose: () => void;
  onToggleFavorite?: (id: string) => void;
  isArtist?: boolean;
}

export function ItemDetailModal({ item, onClose, onToggleFavorite, isArtist }: ItemDetailModalProps) {
  const [copiedZh, setCopiedZh] = useState(false);
  const [copiedEn, setCopiedEn] = useState(false);

  // Type guards
  const characterItem = !isArtist ? (item as Character) : null;

  const copyToClipboard = async (text: string, isZh: boolean) => {
    try {
      await navigator.clipboard.writeText(text);
      if (isZh) {
        setCopiedZh(true);
        setTimeout(() => setCopiedZh(false), 2000);
      } else {
        setCopiedEn(true);
        setTimeout(() => setCopiedEn(false), 2000);
      }
    } catch (err) {
      console.error('Failed to copy', err);
    }
  };

  const nameEn = item.nameEn;
  const nameZh = item.nameZh || nameEn;
  const tagName = isArtist ? (item as Artist).artistTag : (item as Character).characterTag;
  
  const imgBaseUrl = isArtist ? 'https://blobs.animadex.net/ArtistOutputs/thumbs' : 'https://blobs.animadex.net/Outputs/thumbs';
  const imgSrc = item.imgUrl 
    ? `${imgBaseUrl}/${encodeURIComponent(item.imgUrl)}`
    : null;

  return createPortal(
    <div className="absolute inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div 
        className="bg-[var(--bg-layer-1)] border border-[var(--glass-border)] rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col md:flex-row overflow-hidden shadow-2xl relative"
        onClick={(e) => e.stopPropagation()}
      >
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 z-10 p-2 rounded-full bg-black/40 text-white/70 hover:bg-black/60 hover:text-white transition-colors"
        >
          <X size={20} />
        </button>

        {/* Image Section */}
        <div className="w-full md:w-[45%] lg:w-1/2 bg-[var(--bg-layer-2)] relative min-h-[300px] md:min-h-[500px]">
          {imgSrc ? (
            <img 
              src={imgSrc} 
              alt={nameEn}
              className="w-full h-full object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23666' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='3' y='3' width='18' height='18' rx='2' ry='2'%3E%3C/rect%3E%3Ccircle cx='8.5' cy='8.5' r='1.5'%3E%3C/circle%3E%3Cpolyline points='21 15 16 10 5 21'%3E%3C/polyline%3E%3C/svg%3E";
                (e.target as HTMLImageElement).className = "w-full h-full object-contain p-12 opacity-20";
              }}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-[var(--text-secondary)]">
              No Image Available
            </div>
          )}
          
          <div className="absolute top-4 left-4 flex gap-2">
            <div className="flex items-center gap-1 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/10 text-sm font-medium text-white/90 shadow-lg">
              <Flame size={14} className="text-orange-400" />
              {item.count.toLocaleString()}
            </div>
            
            {onToggleFavorite && (
              <button
                onClick={() => onToggleFavorite(item.id)}
                className="p-1.5 rounded-lg bg-black/40 backdrop-blur-md border border-white/10 hover:bg-black/60 transition-colors shadow-lg"
              >
                <Heart size={16} className={item.isFavorite ? "fill-red-500 text-red-500" : "text-white/70"} />
              </button>
            )}
          </div>
        </div>

        {/* Content Section */}
        <div className="w-full md:w-[55%] lg:w-1/2 p-6 md:p-8 flex flex-col h-full overflow-y-auto">
          <div className="mb-2">
            <span className="px-3 py-1 rounded-full bg-[var(--accent-1)]/10 text-[var(--accent-1)] text-xs font-bold uppercase tracking-wider">
              {isArtist ? '风格画师 Artist' : '角色图鉴 Character'}
            </span>
          </div>
          
          <h2 className="text-3xl font-bold text-[var(--text-primary)] mb-1 leading-tight">{nameZh}</h2>
          <div className="text-xl text-[var(--text-secondary)] font-medium mb-6">{nameEn}</div>
          
          <div className="space-y-6">
            <div className="bg-[var(--bg-layer-2)] border border-[var(--glass-border)] rounded-xl p-4 transition-all hover:border-[var(--glass-border-hover)] group">
              <div className="text-[var(--text-secondary)] text-sm mb-2 font-medium">中文名称 (Chinese Name)</div>
              <div className="flex items-center justify-between gap-4">
                <div className="text-[var(--text-primary)] text-lg font-bold break-all flex-1">{nameZh}</div>
                <button 
                  onClick={() => copyToClipboard(nameZh, true)}
                  className={`p-2 rounded-lg transition-colors flex-shrink-0 ${copiedZh ? 'bg-green-500/20 text-green-400' : 'bg-[var(--bg-layer-1)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--accent-1)]/20'}`}
                  title="复制中文名"
                >
                  {copiedZh ? <Check size={18} /> : <Copy size={18} />}
                </button>
              </div>
            </div>

            <div className="bg-[var(--bg-layer-2)] border border-[var(--glass-border)] rounded-xl p-4 transition-all hover:border-[var(--glass-border-hover)] group">
              <div className="text-[var(--text-secondary)] text-sm mb-2 font-medium">英文名称 / 提示词 (English Name / Prompt)</div>
              <div className="flex items-center justify-between gap-4">
                <div className="text-[var(--text-primary)] text-lg font-mono break-all flex-1 text-[var(--accent-1)]">
                  {tagName}
                </div>
                <button 
                  onClick={() => copyToClipboard(tagName, false)}
                  className={`p-2 rounded-lg transition-colors flex-shrink-0 ${copiedEn ? 'bg-green-500/20 text-green-400' : 'bg-[var(--bg-layer-1)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--accent-1)]/20'}`}
                  title="复制英文提示词"
                >
                  {copiedEn ? <Check size={18} /> : <Copy size={18} />}
                </button>
              </div>
            </div>

            {characterItem && (characterItem.seriesZh || characterItem.series) && (
              <div className="bg-[var(--bg-layer-2)] border border-[var(--glass-border)] rounded-xl p-4 transition-all hover:border-[var(--glass-border-hover)]">
                <div className="text-[var(--text-secondary)] text-sm mb-1 font-medium">所属作品 (Series)</div>
                <div className="text-[var(--text-primary)] font-medium">
                  {characterItem.seriesZh || characterItem.series}
                  {characterItem.seriesZh && characterItem.series && characterItem.series !== characterItem.seriesZh && (
                    <span className="text-[var(--text-secondary)] text-sm ml-2">({characterItem.series.replace(/_/g, " ")})</span>
                  )}
                </div>
              </div>
            )}

            {characterItem && characterItem.copyright && (
              <div className="bg-[var(--bg-layer-2)] border border-[var(--glass-border)] rounded-xl p-4 transition-all hover:border-[var(--glass-border-hover)]">
                <div className="text-[var(--text-secondary)] text-sm mb-1 font-medium">版权/来源 (Copyright/Source)</div>
                <div className="text-[var(--text-primary)] font-medium">
                  {characterItem.copyright.replace(/_/g, " ")}
                </div>
              </div>
            )}
            
            {characterItem && characterItem.trigger && (
              <div className="bg-[var(--bg-layer-2)] border border-[var(--glass-border)] rounded-xl p-4">
                <div className="text-[var(--text-secondary)] text-sm mb-1 font-medium">触发词 (Trigger Words)</div>
                <div className="text-[var(--text-primary)] font-medium font-mono text-sm break-all text-[var(--accent-2)]">
                  {characterItem.trigger}
                </div>
              </div>
            )}
            
            {characterItem && characterItem.coreTags && (
              <div className="bg-[var(--bg-layer-2)] border border-[var(--glass-border)] rounded-xl p-4">
                <div className="text-[var(--text-secondary)] text-sm mb-1 font-medium">核心特征词 (Core Tags)</div>
                <div className="text-[var(--text-primary)] font-medium font-mono text-sm break-all">
                  {characterItem.coreTags}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.getElementById('main-content-area') || document.body
  );
}
