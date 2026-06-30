import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description:
    'How JubiLujah.com collects, uses, protects, and shares your personal information — accounts, cookies, email, and your privacy choices.',
  robots: { index: true, follow: true },
};

// Last substantive revision. Bump this whenever the policy text changes.
const EFFECTIVE_DATE = 'June 17, 2026';

export default function PrivacyPage() {
  return (
    <div className="legal-page">
      <section className="page-hero">
        <div className="container">
          <div className="eyebrow">Legal</div>
          <h1>Privacy <em>Policy</em></h1>
          <p className="lead">
            Your trust matters to us. This policy explains what information JubiLujah.com collects,
            how we use and protect it, and the choices you have over your own data.
          </p>
        </div>
      </section>

      <section className="standard">
        <div className="container">
          <article className="legal">
            <div className="updated">Effective {EFFECTIVE_DATE}</div>

            <p className="intro">
              JubiLujah.com (&ldquo;JubiLujah,&rdquo; &ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;),
              operated by Jubilee Software, Inc., provides a faith-centered music streaming and discovery
              experience. This Privacy Policy applies to the JubiLujah.com website and the services offered
              through it (the &ldquo;Service&rdquo;). By creating an account or using the Service, you agree to
              the practices described below.
            </p>

            <h2>1. Information We Collect</h2>

            <h3>Information you provide</h3>
            <ul>
              <li>
                <strong>Account details.</strong> When you sign up we collect your first and last name, date of
                birth, and email address. Your password is stored only in a securely hashed form &mdash; we never
                keep it in plain text.
              </li>
              <li>
                <strong>Content you create.</strong> Comments you post, star ratings you give, award nominations
                (and the reasons you provide), and the playlists you build are stored and associated with your
                account.
              </li>
              <li>
                <strong>Communications.</strong> If you contact us for support, we keep the messages and
                contact details you send so we can respond.
              </li>
            </ul>

            <h3>Information collected automatically</h3>
            <ul>
              <li>
                <strong>Security &amp; verification.</strong> To confirm your email and protect your account we
                generate one-time, 6-digit verification codes (used at sign-up and, when enabled, for two-step
                sign-in), and we record your &ldquo;keep me signed in&rdquo; preference.
              </li>
              <li>
                <strong>Technical &amp; usage data.</strong> Like most websites, our servers automatically log
                information such as your IP address, browser type and user-agent, the pages you request, and the
                date and time of each request. This helps us operate, secure, and improve the Service.
              </li>
              <li>
                <strong>Cookies.</strong> We use the cookies described in Section 4 to keep you signed in and to
                protect requests against forgery.
              </li>
            </ul>

            <h3>Information from sign-in providers</h3>
            <p>
              If you choose to continue with <strong>JubileeInspire Single Sign-On (SSO)</strong>, we receive
              basic profile information (such as your name and email address) from your JubileeInspire account so
              we can create or link your JubiLujah profile. Your JubiLujah and JubileeInspire accounts may be
              kept in sync as part of the Jubilee family of services.
            </p>

            <h2>2. How We Use Your Information</h2>
            <ul>
              <li>Create and manage your account, authenticate you, and keep your session secure.</li>
              <li>Provide the core experience &mdash; streaming the catalog and saving your playlists, ratings, comments, and nominations.</li>
              <li>Send you service-related (transactional) email, such as verification codes, password-reset links, and important account or security notices.</li>
              <li>Detect, prevent, and respond to fraud, abuse, and security incidents.</li>
              <li>Maintain, analyze, and improve the Service.</li>
              <li>Comply with legal obligations and enforce our terms.</li>
            </ul>
            <p>
              We do <strong>not</strong> use your personal information to serve third-party advertising, and we do
              <strong> not</strong> sell your personal information.
            </p>

            <h2>3. Email Communications</h2>
            <p>
              The emails we send (verification codes, password resets, and security notices) are necessary to
              operate your account and are delivered on our behalf by a third-party email provider (currently
              SendGrid). These transactional messages are part of the Service and are not marketing email. If we
              ever introduce optional newsletters or promotional email, you will be able to opt out at any time.
            </p>

            <h2>4. Cookies and Similar Technologies</h2>
            <p>We rely on a small number of strictly necessary cookies; we do not use advertising or cross-site tracking cookies.</p>
            <ul>
              <li><strong>Session cookies.</strong> Secure, HTTP-only cookies that keep you signed in as you move between pages.</li>
              <li><strong>CSRF token cookie</strong> (<code>jv_csrf</code>). A security cookie used to protect form submissions and other actions against cross-site request forgery.</li>
              <li>
                <strong>Bot-protection.</strong> Our sign-in page may use Cloudflare Turnstile to tell humans from
                automated abuse; Cloudflare may set its own cookie for this purpose.
              </li>
            </ul>
            <p>
              You can block or delete cookies in your browser settings, but disabling the essential cookies above
              will prevent you from signing in or using account features.
            </p>

            <h2>5. How We Share Information</h2>
            <p>We share personal information only in these limited situations:</p>
            <ul>
              <li>
                <strong>Service providers.</strong> Vendors who process data on our behalf and under our
                instructions &mdash; for example our email delivery provider (SendGrid), security and content
                delivery (Cloudflare), and our hosting infrastructure.
              </li>
              <li>
                <strong>The Jubilee family of services.</strong> If you use JubileeInspire SSO, account
                information is shared with JubileeInspire to provide and synchronize your single sign-on.
              </li>
              <li>
                <strong>Legal and safety.</strong> When we reasonably believe disclosure is required by law, legal
                process, or to protect the rights, property, or safety of our users, the public, or JubiLujah.
              </li>
              <li>
                <strong>Business transfers.</strong> In connection with a merger, acquisition, or sale of assets,
                in which case we will continue to protect your information consistent with this policy.
              </li>
            </ul>
            <p>Public content you create (such as comments and ratings) may be visible to other users of the Service.</p>

            <h2>6. Data Retention</h2>
            <p>
              We keep your personal information for as long as your account is active or as needed to provide the
              Service, comply with our legal obligations, resolve disputes, and enforce our agreements. When you
              delete your account, we remove your account and its associated data as described in Section 7,
              except where we are required or permitted by law to retain certain records.
            </p>

            <h2>7. Your Choices and Rights</h2>
            <ul>
              <li><strong>Access and update.</strong> You can view your sign-in email and update your password from your <Link href="/account">account page</Link>.</li>
              <li><strong>Delete your account.</strong> You can permanently delete your account and its associated data at any time from the &ldquo;Danger zone&rdquo; on your account page. This action cannot be undone.</li>
              <li><strong>Email.</strong> Transactional email is required to operate your account; any optional email will include an unsubscribe link.</li>
              <li>
                <strong>Regional rights.</strong> Depending on where you live (for example under the GDPR or
                CCPA/CPRA), you may have rights to access, correct, delete, port, or restrict the processing of
                your personal information, and to object to certain uses. To exercise these rights, contact us
                using the details below.
              </li>
            </ul>

            <h2>8. Data Security</h2>
            <p>
              We use technical and organizational safeguards designed to protect your information, including
              encryption of data in transit (HTTPS/TLS), hashed password storage, CSRF protection, and optional
              two-step verification. No method of transmission or storage is completely secure, however, so we
              cannot guarantee absolute security.
            </p>

            <h2>9. Children&apos;s Privacy</h2>
            <p>
              While our catalog includes music made for children and families, the Service itself is intended for
              users who are old enough to maintain their own account. We do not knowingly collect personal
              information from children under the age of 13 (or the minimum age required in your jurisdiction). If
              you believe a child has provided us personal information, please contact us and we will take steps
              to delete it. Parents and guardians are encouraged to supervise children&apos;s use of the Service.
            </p>

            <h2>10. International Users</h2>
            <p>
              JubiLujah.com is operated from the United States. If you access the Service from outside the United
              States, you understand that your information may be transferred to, stored, and processed in the
              United States and other countries where our service providers operate, which may have data
              protection laws different from those in your country.
            </p>

            <h2>11. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. When we make material changes, we will revise
              the &ldquo;Effective&rdquo; date above and, where appropriate, provide additional notice. Your
              continued use of the Service after an update takes effect means you accept the revised policy.
            </p>

            <h2>12. Contact Us</h2>
            <p>If you have questions or requests regarding this Privacy Policy or your personal information, contact us:</p>
            <div className="legal-contact">
              <p><strong>Jubilee Software, Inc.</strong></p>
              <p>Privacy inquiries: <a href="mailto:privacy@jubilujah.com">privacy@jubilujah.com</a></p>
            </div>
          </article>
        </div>
      </section>
    </div>
  );
}
