import { PhotoProvider } from 'react-photo-view';
import 'react-photo-view/dist/react-photo-view.css';
import { Download, Share2, Film } from 'lucide-react';
import { downloadImage } from '../../utils/download';
import { useEffect, useRef, useState } from 'react';
import { Img2VideoModal } from '../video/Img2VideoModal';

export function GlobalPhotoProvider({ children }: { children: React.ReactNode }) {
  const isVisibleRef = useRef(false);
  const [videoModalOpen, setVideoModalOpen] = useState(false);
  const [currentImageSrc, setCurrentImageSrc] = useState('');

  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      if (isVisibleRef.current) {
        // Find the close button and click it to ensure clean closure
        const closeBtn = document.querySelector('.PhotoView-Slider__toolbarIcon:last-child') as HTMLElement;
        if (closeBtn) closeBtn.click();
        
        // Alternative fallback:
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  return (
    <>
      <PhotoProvider
        maskOpacity={0.9}
        onVisibleChange={(visible) => {
          if (visible) {
            window.history.pushState({ photoViewOpen: true }, '');
            isVisibleRef.current = true;
          } else {
            if (window.history.state?.photoViewOpen) {
              window.history.back();
            }
            isVisibleRef.current = false;
          }
        }}
        toolbarRender={({ onScale, scale, rotate, onRotate, index, images }) => {
          const item = images[index];
          return (
            <div className="flex gap-6 px-4 items-center h-full">
              <button
                className="text-white hover:text-[var(--accent-1)] transition-colors flex items-center gap-1 bg-white/10 px-3 py-1.5 rounded-full backdrop-blur-md border border-white/20 active:scale-95"
                onClick={() => {
                  if (item?.src) {
                    setCurrentImageSrc(item.src);
                    setVideoModalOpen(true);
                  }
                }}
                title="图生视频 (Animate)"
              >
                <Film size={18} />
                <span className="text-[12px] font-bold tracking-wider hidden sm:inline">动起来</span>
              </button>
              
              <div className="w-px h-4 bg-white/20 mx-2" />

              <button
                className="text-white/70 hover:text-white transition-colors"
                onClick={() => {
                  if (item?.src) {
                    downloadImage(item.src, `eishougi_saved_${Date.now()}.png`);
                  }
                }}
                title="保存原图"
              >
                <Download size={22} />
              </button>
              <button
                className="text-white/70 hover:text-white transition-colors"
                onClick={async () => {
                  if (navigator.share && item?.src) {
                    try {
                      await navigator.share({
                        title: '分享图片',
                        text: '分享来自 EISHOUGI 的图片',
                        url: item.src,
                      });
                    } catch (e) {
                      console.error("Share error:", e);
                    }
                  }
                }}
                title="分享"
              >
                <Share2 size={22} />
              </button>
            </div>
          );
        }}
      >
        {children}
      </PhotoProvider>

      <Img2VideoModal 
        isOpen={videoModalOpen} 
        onClose={() => setVideoModalOpen(false)} 
        imageSrc={currentImageSrc} 
      />
    </>
  );
}
