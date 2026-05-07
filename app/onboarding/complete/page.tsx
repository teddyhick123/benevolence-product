import { redirect } from 'next/navigation';

// Redirect to main onboarding page which handles all steps
export default function CompletePage() {
  redirect('/onboarding');
}
