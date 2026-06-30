import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Terms of Use',
  description:
    'The terms and conditions that govern your use of JubiLujah.com — accounts, acceptable use, content, intellectual property, and your rights and responsibilities.',
  robots: { index: true, follow: true },
};

// Last substantive revision. Bump this whenever the terms change.
const EFFECTIVE_DATE = 'June 17, 2026';

export default function TermsPage() {
  return (
    <div className="legal-page">
      <section className="page-hero">
        <div className="container">
          <div className="eyebrow">Legal</div>
          <h1>Terms of <em>Use</em></h1>
          <p className="lead">
            These terms are the agreement between you and JubiLujah.com. Please read them carefully &mdash;
            by creating an account or using the Service, you agree to be bound by them.
          </p>
        </div>
      </section>

      <section className="standard">
        <div className="container">
          <article className="legal">
            <div className="updated">Effective {EFFECTIVE_DATE}</div>

            <p className="intro">
              Welcome to JubiLujah.com. These Terms of Use (&ldquo;Terms&rdquo;) are a legal agreement between you
              and Jubilee Software, Inc. (&ldquo;JubiLujah,&rdquo; &ldquo;we,&rdquo; &ldquo;us,&rdquo; or
              &ldquo;our&rdquo;) governing your access to and use of the JubiLujah.com website and the
              faith-centered music streaming and discovery services offered through it (the
              &ldquo;Service&rdquo;). Please also review our <Link href="/privacy">Privacy Policy</Link>, which
              explains how we handle your information and is incorporated into these Terms by reference.
            </p>

            <h2>1. Acceptance of These Terms</h2>
            <p>
              By creating an account, accessing, or using the Service, you confirm that you have read,
              understood, and agree to be bound by these Terms and our Privacy Policy. If you do not agree, please
              do not use the Service. If you are using the Service on behalf of an organization, you represent
              that you are authorized to accept these Terms on its behalf.
            </p>

            <h2>2. Eligibility</h2>
            <p>
              You must be at least 13 years old (or the minimum age required in your country) to create an
              account and use the Service. If you are a minor in your jurisdiction, you may use the Service only
              with the involvement and consent of a parent or legal guardian. By using the Service, you represent
              that you meet these requirements.
            </p>

            <h2>3. Your Account</h2>
            <ul>
              <li>You agree to provide accurate, current, and complete information when you register and to keep it up to date.</li>
              <li>You are responsible for safeguarding your password and for all activity that occurs under your account. We recommend enabling two-step verification where available.</li>
              <li>You may sign in using JubileeInspire Single Sign-On (SSO); your use of that option is also subject to JubileeInspire&apos;s own terms.</li>
              <li>Notify us promptly of any unauthorized use of your account or any other breach of security.</li>
              <li>You may manage your password and permanently delete your account at any time from your <Link href="/account">account page</Link>.</li>
            </ul>

            <h2>4. License to Use the Service</h2>
            <p>
              Subject to your compliance with these Terms, we grant you a limited, personal, non-exclusive,
              non-transferable, revocable license to access and stream the content made available through the
              Service for your own personal, non-commercial enjoyment. This license does not transfer any
              ownership to you.
            </p>

            <h2>5. Content and Intellectual Property</h2>
            <p>
              The Service and all of its content &mdash; including music, recordings, lyrics, artwork, album
              titles, artist and persona names, text, graphics, logos, and software &mdash; are owned by Jubilee
              Software, Inc., its affiliates, artists, or licensors and are protected by copyright, trademark, and
              other laws. Except as expressly permitted by these Terms, you may not copy, download, reproduce,
              distribute, publicly perform, broadcast, sell, rent, modify, create derivative works from, or
              otherwise exploit any part of the Service or its content without our prior written permission.
            </p>

            <h2>6. Your Content</h2>
            <p>
              The Service lets you contribute content such as comments, star ratings, award nominations, and
              playlists (&ldquo;User Content&rdquo;). You retain ownership of your User Content, but by submitting
              it you grant JubiLujah a worldwide, royalty-free, non-exclusive license to host, store, display,
              reproduce, and use that content as needed to operate and improve the Service.
            </p>
            <p>You are solely responsible for your User Content, and you represent that:</p>
            <ul>
              <li>you own it or have the rights necessary to submit it; and</li>
              <li>it does not infringe anyone&apos;s rights or violate any law or these Terms.</li>
            </ul>
            <p>
              We may, but are not obligated to, review, moderate, or remove User Content that we believe violates
              these Terms or is otherwise objectionable.
            </p>

            <h2>7. Acceptable Use</h2>
            <p>When using the Service, you agree that you will not:</p>
            <ul>
              <li>use the Service for any unlawful purpose or in violation of these Terms;</li>
              <li>copy, record, download, scrape, or redistribute the music or other content except where a feature expressly allows it;</li>
              <li>circumvent, disable, or interfere with security, authentication, or access-control features (including bot-protection);</li>
              <li>attempt to gain unauthorized access to any account, system, or network related to the Service;</li>
              <li>upload or transmit viruses, malicious code, or content that is hateful, harassing, obscene, defamatory, or that infringes others&apos; rights;</li>
              <li>use bots, scrapers, or automated means to access the Service in a way that burdens our infrastructure; or</li>
              <li>impersonate any person or misrepresent your affiliation with anyone.</li>
            </ul>

            <h2>8. Third-Party Services</h2>
            <p>
              The Service relies on, or may link to, third-party services (for example JubileeInspire SSO,
              Cloudflare for security, and our email provider). Your use of those services may be governed by
              their own terms and privacy policies, and we are not responsible for their content or practices.
            </p>

            <h2>9. Suspension and Termination</h2>
            <p>
              You may stop using the Service and delete your account at any time. We may suspend or terminate your
              access to the Service, with or without notice, if we believe you have violated these Terms or to
              protect the Service or other users. Upon termination, the license granted to you ends, but any
              provisions that by their nature should survive (such as intellectual-property, disclaimer,
              liability, and governing-law sections) will continue to apply.
            </p>

            <h2>10. Disclaimers</h2>
            <p>
              The Service is provided on an &ldquo;as is&rdquo; and &ldquo;as available&rdquo; basis. To the
              fullest extent permitted by law, we disclaim all warranties, whether express or implied, including
              implied warranties of merchantability, fitness for a particular purpose, and non-infringement. We do
              not warrant that the Service will be uninterrupted, secure, or error-free, or that any content will
              always be available.
            </p>

            <h2>11. Limitation of Liability</h2>
            <p>
              To the fullest extent permitted by law, JubiLujah and its affiliates, officers, employees, artists,
              and licensors will not be liable for any indirect, incidental, special, consequential, or punitive
              damages, or any loss of data, use, goodwill, or profits, arising out of or relating to your use of
              (or inability to use) the Service. Our total liability for any claim relating to the Service will
              not exceed one hundred U.S. dollars (US $100) or the amount you paid us, if any, in the twelve
              months before the claim, whichever is greater.
            </p>

            <h2>12. Indemnification</h2>
            <p>
              You agree to indemnify and hold harmless JubiLujah and its affiliates from any claims, damages,
              losses, and expenses (including reasonable legal fees) arising out of your use of the Service, your
              User Content, or your violation of these Terms or applicable law.
            </p>

            <h2>13. Changes to the Service and These Terms</h2>
            <p>
              We may modify, suspend, or discontinue all or part of the Service at any time. We may also update
              these Terms from time to time; when we make material changes we will revise the
              &ldquo;Effective&rdquo; date above and, where appropriate, provide additional notice. Your continued
              use of the Service after an update takes effect means you accept the revised Terms.
            </p>

            <h2>14. Governing Law</h2>
            <p>
              These Terms are governed by the laws of the United States and the State in which Jubilee Software,
              Inc. is established, without regard to conflict-of-laws principles. You agree to the exclusive
              jurisdiction of the courts located there for any dispute not subject to arbitration or
              small-claims resolution, to the extent permitted by applicable law.
            </p>

            <h2>15. Contact Us</h2>
            <p>If you have any questions about these Terms, please contact us:</p>
            <div className="legal-contact">
              <p><strong>Jubilee Software, Inc.</strong></p>
              <p>Legal inquiries: <a href="mailto:legal@jubilujah.com">legal@jubilujah.com</a></p>
            </div>
          </article>
        </div>
      </section>
    </div>
  );
}
