import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Jubilee Prayers',
  description: 'Tefillah b’shir — Hebraic cantorial Temple albums, twelve stations each, engineered as one-hour prayer disciplines.',
};

export default function PrayersPage() {
  return (
    <>
      <section className="page-hero">
        <div className="container">
          <div className="eyebrow">Jubilee Prayers</div>
          <h1>Tefillah b&apos;shir &mdash; <em>prayer in song</em></h1>
          <p className="lead">
            Hebraic cantorial Temple albums, twelve stations each, engineered as one-hour prayer
            disciplines. Jubilee Inspire and Zev Inspire stand as the two prayer warriors, leading the
            congregation station by station through a complete hour of sung prayer.
          </p>
        </div>
      </section>

      <section className="standard">
        <div className="container">
          <div className="section-eyebrow">The prayer hour</div>
          <h2 className="section-title">Twelve stations, one hour</h2>
          <p className="section-sub">
            Each Temple album is structured as twelve prayer stations forming a single continuous hour of
            worship and intercession in the cantorial tradition. The prayer hours are released as complete
            albums under the prayer-warrior personas.
          </p>
          <div className="card-grid">
            <div className="entity-card">
              <h3>Jubilee Inspire</h3>
              <div className="role">Prayer Warrior · Modern Worship</div>
              <div className="meta"><span>Temple prayer hours</span></div>
            </div>
            <div className="entity-card">
              <h3>Zev Inspire</h3>
              <div className="role">Prayer Warrior · Hebraic / Messianic</div>
              <div className="meta"><span>Temple prayer hours</span></div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
