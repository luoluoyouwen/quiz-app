import { Image } from 'antd';

interface QuestionImageProps {
  image?: string;
  caption?: string;
}

export default function QuestionImage({ image, caption }: QuestionImageProps) {
  if (!image) return null;

  return (
    <div style={{ margin: '12px 0', textAlign: 'center' }}>
      <Image
        src={image}
        alt={caption || '题目配图'}
        style={{
          maxWidth: '100%',
          maxHeight: 400,
          borderRadius: 8,
          objectFit: 'contain',
          border: '1px solid var(--border)',
        }}
        preview={{ mask: '点击查看大图' }}
      />
      {caption && (
        <div style={{ marginTop: 4, fontSize: 12, color: 'var(--color-text-secondary)' }}>
          {caption}
        </div>
      )}
    </div>
  );
}
