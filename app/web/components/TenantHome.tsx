import { personaRows } from '@/lib/manifest';
import { hasCover } from '@/lib/covers';
import MediaRow, { TileData } from '@/components/MediaRow';
import { currentTenant } from '@/lib/tenant';

// Home page for a single-catalogue tenant (goPartyGiggles, MyTinyTiggles).
//
// JubileePraise's Home cannot be reused here, and not by preference: it sorts the
// collection into twelve worship themes and then explicitly DROPS the children's
// categories ("has its own category and is never shown on Home"). Pointed at a
// children's tenant it would render a page with nothing on it.
//
// personaRows() is already scoped to the tenant by lib/manifest's loader, so
// this simply shows everything the tenant has, one row per artist.

export default function TenantHome() {
  const tenant = currentTenant();
  const rows = personaRows();

  const sections = rows
    .map((r) => ({
      key: r.slug,
      label: r.name,
      items: r.albums.map((al): TileData => ({
        code: al.code,
        title: al.title,
        href: al.href,
        image: al.cover || null,
        status: al.status,
        trackCount: al.trackCount,
        artistName: r.name,
        hasCover: hasCover(al.code),
      })),
    }))
    .filter((s) => s.items.length > 0);

  return (
    <div className="nf-rows">
      <section style={{ padding: '28px 0 6px' }}>
        <h1 style={{ margin: 0, fontSize: 'clamp(22px,3vw,34px)' }}>
          {tenant.brandLead}
          <span style={{ color: tenant.accent }}>{tenant.brandTail}</span>
        </h1>
        <p style={{ margin: '6px 0 0', color: '#9aa0ad' }}>{tenant.tagline}</p>
      </section>

      {sections.length === 0 ? (
        <p style={{ color: '#9aa0ad', padding: '18px 0' }}>
          No albums are published here yet.
        </p>
      ) : (
        sections.map((s) => (
          <MediaRow key={s.key} title={s.label} items={s.items} requireCover />
        ))
      )}
    </div>
  );
}
