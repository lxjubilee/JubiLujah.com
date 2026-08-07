'use client';
import { Suspense } from 'react';
import JubileeDoor from '@/components/JubileeDoor';

// The "one door": /signup and /signin render the same email-first Jubilee ID flow.
export default function SignUpPage() {
  return <Suspense fallback={<div className="auth-split" />}><JubileeDoor /></Suspense>;
}
