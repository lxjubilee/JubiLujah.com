import { getAppLinks } from '@/lib/appLinks';

// Android Digital Asset Links — served at /.well-known/assetlinks.json (via the
// rewrite in next.config.mjs). Lets the JubileePraise Android app auto-verify App
// Links for https://jubileepraise.com/r/* so scanning a code opens the app directly
// when installed.
//
// sha256_cert_fingerprints stays EMPTY until ANDROID_SHA256_FINGERPRINTS is set
// (the app-signing cert's SHA-256). App Links auto-verification requires it; once
// provided, Android opens the installed app silently.
export const dynamic = 'force-dynamic';

export async function GET() {
  const al = getAppLinks();
  const body = [
    {
      relation: ['delegate_permission/common.handle_all_urls'],
      target: {
        namespace: 'android_app',
        package_name: al.android.packageName,
        sha256_cert_fingerprints: al.android.sha256,
      },
    },
  ];
  return new Response(JSON.stringify(body, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
