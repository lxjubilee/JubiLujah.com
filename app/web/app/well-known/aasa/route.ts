import { getAppLinks } from '@/lib/appLinks';

// Apple App Site Association — served at /.well-known/apple-app-site-association
// (via the rewrite in next.config.mjs). Declares that the JubiLujah iOS app
// handles /r/* and /rp/* on this domain, so scanning a code opens the app
// directly (Universal Links) when it's installed.
//
// The appID is <AppleTeamID>.<BundleID>. Until APPLE_TEAM_ID is set the prefix is
// a clearly-marked placeholder so the file is structurally valid but will not
// verify — set the env var to activate silent auto-open on iOS.
export const dynamic = 'force-dynamic';

export async function GET() {
  const al = getAppLinks();
  const appID = `${al.ios.appleTeamId || 'TEAMID_PENDING'}.${al.ios.bundleId}`;
  const body = {
    applinks: {
      apps: [],
      details: [{ appID, paths: ['/r/*', '/rp/*'] }],
    },
  };
  return new Response(JSON.stringify(body, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
