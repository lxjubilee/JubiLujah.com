'use client';
import { Suspense } from 'react';
import JubileeDoor from '@/components/JubileeDoor';

// The "one door": /signin and /signup render the same email-first Jubilee ID flow.
export default function SignInPage() {
  return <Suspense fallback={<div className="auth-split" />}><JubileeDoor /></Suspense>;
}
