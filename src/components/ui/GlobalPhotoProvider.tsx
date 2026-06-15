import { PhotoProvider } from 'react-photo-view';
import 'react-photo-view/dist/react-photo-view.css';
import { Download, Share2 } from 'lucide-react';
import { downloadImage } from '../../utils/download';

export function GlobalPhotoProvider({ children }: { children: React.ReactNode }) {
  return (
    <PhotoProvider
      maskOpacity={0.9}
      toolbarRender={({ onScale, scale, rotate, onRotate, index, images }) => {
        const item = images[index];
        return (
          <div className="flex gap-6 px-4 items-center h-full">
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
  );
}
