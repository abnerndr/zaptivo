import { getRequestConfig } from 'next-intl/server';

export default getRequestConfig(async () => {
  // Prefer runtime APP_LOCALE (Dokploy env) over build-inlined NEXT_PUBLIC_*.
  const locale =
    process.env.APP_LOCALE || process.env.NEXT_PUBLIC_APP_LOCALE || 'en';

  let messages;
  try {
    messages = (await import(`../../messages/${locale}.json`)).default;
  } catch {
    // Fallback to English if the dictionary for the requested locale doesn't exist yet
    messages = (await import(`../../messages/en.json`)).default;
  }

  return {
    locale,
    messages,
  };
});
