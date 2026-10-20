import Image from 'next/image';

/** object-contain: nunca distorce nem corta (algumas imagens são peças com texto). */
export function QuestionImage({ src, alt, priority = false, className = '' }: { src: string; alt: string; priority?: boolean; className?: string }) {
  return (
    <div className={`relative w-full overflow-hidden rounded-card bg-mist ${className}`}>
      <Image src={src} alt={alt} fill priority={priority} sizes="(min-width: 1024px) 50vw, 100vw" className="object-contain" />
    </div>
  );
}
