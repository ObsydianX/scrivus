import { useState, type CSSProperties } from 'react'

export function LoreImageButton({ src, alt, className = '', imageClassName, imageStyle, onOpen, onReplace }: {
  src: string; alt: string; className?: string; imageClassName?: string; imageStyle?: CSSProperties; onOpen?: () => void; onReplace?: () => void
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const missing = !src || failedSrc === src
  return <button type="button" className={className + (missing ? ' lore-image-missing' : '')}
    aria-label={missing ? 'Image not found: ' + alt + '. Click to replace.' : 'View ' + alt}
    onPointerDown={missing ? event => event.stopPropagation() : undefined}
    onClick={missing ? onReplace : onOpen}>
    {missing ? <span className="lore-image-missing-content"><i className="ti ti-photo-off" aria-hidden="true" /><strong>Image not found</strong><span>Click to replace image</span></span>
      : <img src={src} alt={alt} className={imageClassName} style={imageStyle} draggable={false} onError={() => setFailedSrc(src)} />}
  </button>
}
