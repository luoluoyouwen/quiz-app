import type { HTMLAttributes } from 'react';

interface AppLogoProps extends HTMLAttributes<HTMLSpanElement> {
  markClassName?: string;
  text?: string;
  textClassName?: string;
  showText?: boolean;
}

export default function AppLogo({
  className,
  markClassName,
  text = '刷题 App',
  textClassName,
  showText = false,
  ...props
}: AppLogoProps) {
  const markClasses = ['app-logo-mark', markClassName].filter(Boolean).join(' ');
  return (
    <span className={['app-logo', className].filter(Boolean).join(' ')} {...props}>
      <svg className={markClasses} width="30" height="30" viewBox="0 0 30 30" aria-hidden="true">
        <rect x="8" y="4" width="7" height="22" rx="3.5" transform="rotate(-35 11.5 15)" fill="currentColor" />
        <rect x="15" y="4" width="7" height="22" rx="3.5" transform="rotate(-35 18.5 15)" fill="currentColor" />
      </svg>
      {showText && <span className={textClassName}>{text}</span>}
    </span>
  );
}
