import { Image } from 'antd';

interface QuestionImageProps {
  image?: string;
  caption?: string;
}

export default function QuestionImage({ image, caption }: QuestionImageProps) {
  if (!image) return null;

  return (
    <figure className="question-image-frame">
      <Image
        className="question-image"
        src={image}
        alt={caption || '题目配图'}
        preview={{ mask: '点击查看大图' }}
      />
      {caption && (
        <figcaption className="question-image-caption">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}
