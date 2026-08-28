// ============================================================================
// Mobile app deep-link configuration — feeds the QR arrival page's app-vs-web
// flow and the two association files that let iOS Universal Links / Android App
// Links open the installed app silently.
//
// Values come from env so prod can override; the defaults below are the published
// JubileePraise app identifiers. The Apple Team ID and Android SHA-256 fingerprint are
// PUBLIC by design (they are served in the association files below), so they are
// baked in as defaults — no env setup is needed for OS-level auto-open to verify.
// ============================================================================
export interface AppLinks {
  ios: { bundleId: string; appStoreUrl: string; appleTeamId: string | null };
  android: { packageName: string; playStoreUrl: string; sha256: string[] };
  scheme: string; // custom URL scheme the app registers, e.g. jubileepraise://
}

export function getAppLinks(): AppLinks {
  return {
    ios: {
      bundleId: process.env.IOS_BUNDLE_ID || 'com.jubileepraise.app',
      appStoreUrl: process.env.IOS_APP_STORE_URL || 'https://apps.apple.com/us/app/jubileepraise/id6781227388',
      appleTeamId: process.env.APPLE_TEAM_ID || 'G7MXS3Q274',
    },
    android: {
      packageName: process.env.ANDROID_PACKAGE || 'com.jubileepraise.app',
      playStoreUrl: process.env.ANDROID_PLAY_STORE_URL || 'https://play.google.com/store/apps/details?id=com.jubileepraise.app',
      sha256: (process.env.ANDROID_SHA256_FINGERPRINTS
        || 'FE:7D:A1:8D:06:56:88:78:FB:0A:55:22:CC:5C:60:92:A6:E4:99:05:DA:4E:E9:C2:DA:25:18:8F:49:0F:18:A2')
        .split(',').map((s) => s.trim()).filter(Boolean),
    },
    scheme: process.env.APP_SCHEME || 'jubileepraise',
  };
}
