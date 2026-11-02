/**
 * Seo — 统一 SEO Helmet 组件
 *
 * 用法:
 *   <Seo
 *     title="课程详情"
 *     description="SecondPlanet 课程..."
 *     path="/courses/123"
 *     image="https://..."
 *     type="article"
 *     jsonLd={{ '@context': 'https://schema.org', '@type': 'Course', name: '...' }}
 *   />
 *
 * 自动生成:
 *   - <title>
 *   - <meta name="description">
 *   - <link rel="canonical">
 *   - <meta property="og:title/description/url/image/type">
 *   - <meta name="twitter:card/title/description/image">
 *   - <script type="application/ld+json"> (JSON-LD)
 */
import { Helmet } from 'react-helmet-async';

export interface SeoProps {
  title: string;
  description: string;
  /** 当前页路径 (e.g. /courses/123) — 用于 canonical + og:url */
  path: string;
  /** OG image URL (推荐 1200x630) */
  image?: string;
  /** og:type 默认 'website', 课程/黑客松详情页用 'article' */
  type?: 'website' | 'article' | 'product';
  /** 不传则 zh-CN */
  locale?: string;
  /** 站点名 (og:site_name) */
  siteName?: string;
  /** JSON-LD 结构化数据 (Schema.org) */
  jsonLd?: Record<string, any> | Record<string, any>[];
}

const DEFAULT_SITE_NAME = 'SecondPlanet';
const DEFAULT_IMAGE = '/og-default.png';
const BASE_URL =
  typeof window !== 'undefined'
    ? `${window.location.protocol}//${window.location.host}`
    : 'http://localhost';

export function Seo({
  title,
  description,
  path,
  image,
  type = 'website',
  locale = 'zh-CN',
  siteName = DEFAULT_SITE_NAME,
  jsonLd,
}: SeoProps) {
  const fullTitle = title.includes(siteName) ? title : `${title} · ${siteName}`;
  const fullUrl = `${BASE_URL}${path}`;
  const imageUrl = image?.startsWith('http') ? image : `${BASE_URL}${image || DEFAULT_IMAGE}`;

  return (
    <Helmet>
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={fullUrl} />

      {/* Open Graph */}
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={fullUrl} />
      <meta property="og:type" content={type} />
      <meta property="og:image" content={imageUrl} />
      <meta property="og:site_name" content={siteName} />
      <meta property="og:locale" content={locale.replace('-', '_')} />

      {/* Twitter Card */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={imageUrl} />

      {/* JSON-LD 结构化数据 */}
      {jsonLd && (
        <script type="application/ld+json">
          {JSON.stringify(jsonLd)}
        </script>
      )}
    </Helmet>
  );
}
