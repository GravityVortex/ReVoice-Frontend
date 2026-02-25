import moment from 'moment';
import { useLocale } from 'next-intl';

export function Time({
  value,
  placeholder,
  metadata,
  className,
}: {
  value: string | Date;
  placeholder?: string;
  metadata?: Record<string, any>;
  className?: string;
}) {
  if (!value) {
    if (placeholder) {
      return <div className={className}>{placeholder}</div>;
    }

    return null;
  }

  const uiLocale = useLocale();
  const momentLocale = uiLocale === 'zh' ? 'zh-cn' : uiLocale;

  const rawFormat = metadata?.format as unknown;
  let format: string | undefined;
  if (typeof rawFormat === 'string') {
    format = rawFormat;
  } else if (rawFormat && typeof rawFormat === 'object') {
    const map = rawFormat as Record<string, unknown>;
    const candidate = map[uiLocale] ?? map[momentLocale] ?? map.default;
    if (typeof candidate === 'string' && candidate.trim()) {
      format = candidate;
    }
  }

  return (
    <div className={className}>
      {format
        ? moment(value).locale(momentLocale).format(format)
        : moment(value).locale(momentLocale).fromNow()}
    </div>
  );
}
