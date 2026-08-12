/**
 * Сборка в статику для GitHub Pages.
 *
 * basePath вычисляется из GITHUB_REPOSITORY, который Actions подставляет сам,
 * поэтому конфиг не нужно править под имя репозитория. Локально переменной нет,
 * basePath пустой — `npm run dev` работает по адресу localhost:3000 как обычно.
 *
 * Заголовки безопасности из headers() убраны намеренно: в статическом экспорте
 * они не работают, а GitHub Pages свои заголовки задавать не умеет в принципе.
 */
const repository = process.env.GITHUB_REPOSITORY || '';
const [owner, repo] = repository.split('/');

// Сайт вида username.github.io отдаётся из корня — префикс там не нужен
const isUserSite = !!owner && repo?.toLowerCase() === `${owner.toLowerCase()}.github.io`;
const basePath = repo && !isUserSite ? `/${repo}` : '';

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  basePath,
  assetPrefix: basePath ? `${basePath}/` : undefined,
  // Оптимизатор картинок требует сервер, в статике его нет
  images: { unoptimized: true },
  reactStrictMode: true,
  trailingSlash: true,
};

module.exports = nextConfig;
