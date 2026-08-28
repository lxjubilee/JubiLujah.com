import { AudioProvider } from '@/components/torahsings/audio/AudioProvider';
import { NowPlayingBar } from '@/components/torahsings/audio/NowPlayingBar';
import { IntroModal } from '@/components/torahsings/intro/IntroModal';
import { IntroProvider } from '@/components/torahsings/intro/IntroProvider';
import { AuthGate } from '@/components/torahsings/gating/AuthGate';
import { SiteFooter } from '@/components/torahsings/layout/SiteFooter';
import { SiteHeader } from '@/components/torahsings/layout/SiteHeader';
import { Particles } from '@/components/torahsings/system/Particles';
import { JubileeAccountProvider } from '@/lib/torahsings/jubilee-account';

/**
 * The Torah Sings chrome — header, footer, player, intro modal, auth gate.
 *
 * WHY A SEPARATE SHELL AT ALL. The tenant decision was "shared shell,
 * distinctive surfaces", and this is the seam where that phrase gets precise.
 * The shared half is the ROUTES: /signin, /account, /admin, /playlists and the
 * rest are JubileePraise's single implementation, and a Torah Sings visitor lands
 * on exactly those. The distinctive half is the chrome and the reading/listening
 * surfaces, which are built around this catalogue and its player.
 *
 * They cannot simply share a player: Torah Sings' catalogue rails, album detail
 * and derivation tabs all drive AudioProvider directly, while JubileePraise's
 * components drive FooterPlayer. Mounting both would give a visitor two
 * transports fighting over one <audio>. So exactly one shell mounts per request,
 * chosen by the tenant in app/layout.tsx.
 *
 * The session underneath is NOT duplicated. JubileeAccountProvider reads
 * JubileePraise's own lib/auth tokens (see lib/torahsings/jubilee-account.tsx), so
 * signing in on the shared /signin route is immediately visible here.
 */
export default function TorahSingsShell({ children }: { children: React.ReactNode }) {
  return (
    <JubileeAccountProvider>
      <AudioProvider>
        <IntroProvider>
          <Particles />
          <SiteHeader />
          <main>{children}</main>
          <SiteFooter />
          <NowPlayingBar />
          <IntroModal />
          <AuthGate />
        </IntroProvider>
      </AudioProvider>
    </JubileeAccountProvider>
  );
}
