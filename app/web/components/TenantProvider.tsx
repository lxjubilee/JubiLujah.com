'use client';
import { createContext, useContext } from 'react';
import { DEFAULT_TENANT, type Tenant } from '@/lib/tenants';

// The tenant, made available to client components.
//
// It cannot be read from the Host header down here — a client component has no
// request — so the server layout resolves it once and hands it down. The default
// is JubileePraise so a component rendered outside the provider still has a sane
// brand rather than undefined.

const TenantContext = createContext<Tenant>(DEFAULT_TENANT);

export function TenantProvider({ tenant, children }: { tenant: Tenant; children: React.ReactNode }) {
  return <TenantContext.Provider value={tenant}>{children}</TenantContext.Provider>;
}

export function useTenant(): Tenant {
  return useContext(TenantContext);
}
